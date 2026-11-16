#!/usr/bin/env node
"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");
const { PNG } = require("pngjs");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.TEST_PORT || 8799);

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("Chrome/Chromium is required for runtime acceptance tests");
  return found;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 15000;
    const attempt = () => {
      const request = http.get(`http://127.0.0.1:${PORT}/`, (response) => {
        response.resume();
        response.statusCode < 500 ? resolve() : retry();
      });
      request.on("error", retry);
      request.setTimeout(1000, () => request.destroy());
    };
    const retry = () => Date.now() > deadline ? reject(new Error("Timed out waiting for the runtime harness")) : setTimeout(attempt, 200);
    attempt();
  });
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForTargets(debugPort) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page");
        if (page && page.webSocketDebuggerUrl) return page;
      }
    } catch (_error) {}
    await delay(150);
  }
  throw new Error("Timed out waiting for Chrome DevTools");
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result || {});
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.socket.readyState < WebSocket.CLOSING) this.socket.close();
  }
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || "Harness evaluation failed");
  return response.result && response.result.value;
}

async function waitForResults(client) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const value = await evaluate(client, "window.__results || null");
    if (value) return value;
    await delay(100);
  }
  throw new Error("Timed out waiting for Soft98 runtime results");
}

async function verifyInitialContentScroll(client) {
  const base = `http://127.0.0.1:${PORT}/test/`;
  const open = async (url) => {
    await client.send("Page.navigate", { url: base + url });
    for (let i = 0; i < 60; i++) {
      if (await evaluate(client, `location.href === ${JSON.stringify(base + url)} && document.readyState === "complete"`)) return;
      await delay(35);
    }
    throw new Error("Initial scroll fixture did not finish loading");
  };
  const aligned = (id) => evaluate(client, `(() => {
    const target = document.getElementById(${JSON.stringify(id)});
    const nav = document.querySelector("nav").getBoundingClientRect();
    const top = target.getBoundingClientRect().top;
    return top >= nav.height && top <= nav.height + 22;
  })()`);
  for (const [url, id] of [["initial-content-scroll.html?do=search", "first"], ["302-initial-scroll.html", "product"]]) {
    await open(url);
    assertEqual("initial scroll", id + " before the parser finishes", await evaluate(client, "firstScroll?.ready"), "loading");
    assertEqual("initial scroll", id + " is below the sticky bar", await aligned(id), true);
  }
  await client.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 130, y: 130, deltaX: 0, deltaY: 330 });
  await delay(350);
  assertEqual("initial scroll", "manual scrolling is not reset", await aligned("product"), false);
  await open("initial-content-scroll.html?do=search&empty=1");
  assertEqual("initial scroll", "empty searches stay at the top", await evaluate(client, "scrollY"), 0);
  await open("302-initial-scroll.html?anchor=1#details");
  assertEqual("initial scroll", "explicit fragments win", await evaluate(client,
    "Math.abs(document.querySelector('#details').getBoundingClientRect().top) < 5"), true);
  await open("302-initial-scroll.html?reload=1");
  await evaluate(client, "scrollTo({ top: 1325, behavior: 'instant' })");
  const beforeReload = await evaluate(client, "scrollY");
  await client.send("Page.reload");
  for (let i = 0; i < 70; i++) {
    if (await evaluate(client, 'performance.getEntriesByType("navigation")[0]?.type === "reload" && document.readyState === "complete"')) break;
    await delay(35);
  }
  assertEqual("initial scroll", "reload preserves the browser position", await evaluate(client,
    `Math.abs(scrollY - ${beforeReload}) < 5`), true);
}

async function verifyArticlePreview(client) {
  const results = await evaluate(client, `
    (async () => {
      const trigger = document.querySelector('[data-test=article-preview-trigger]');
      const keyed = document.querySelector('[data-test=keyed-preview-trigger]');
      const delayed = document.querySelector('[data-test=delayed-preview-trigger]');
      trigger.dir = 'rtl';
      const icon = trigger.querySelector('[data-soft98-pro-page-icon]');
      const label = new Range();
      label.selectNodeContents(trigger);
      label.setStartAfter(icon);
      const trailing = icon.getBoundingClientRect().right <= label.getBoundingClientRect().left;
      const noUnverifiedControls = [trigger, keyed, delayed].every(link => !link.nextElementSibling);
      trigger.dispatchEvent(new PointerEvent('pointerenter'));
      keyed.focus({ preventScroll: true });
      delayed.dispatchEvent(new PointerEvent('pointerenter'));
      await new Promise(resolve => setTimeout(resolve, 50));
      const ignoredPlaceholder = !delayed.nextElementSibling;
      delayed.href = '/102-delayed.html';
      for (let i = 0; i < 30 && !delayed.nextElementSibling; i++)
        await new Promise(resolve => setTimeout(resolve, 30));
      const single = trigger.nextElementSibling?.querySelector(':scope > a');
      const button = delayed.nextElementSibling?.querySelector('button');
      const panel = delayed.nextElementSibling?.querySelector('[data-soft98-pro-preview-panel]');
      button?.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise(requestAnimationFrame);
      button?.focus({ preventScroll: true });
      button?.click();
      for (let i = 0; i < 10 && button?.getAttribute('aria-expanded') !== 'true'; i++)
        await new Promise(requestAnimationFrame);
      const bounds = panel?.getBoundingClientRect();
      const fits = Boolean(bounds && bounds.width > 0 && bounds.left >= 0 && bounds.right <= innerWidth &&
        bounds.top >= 0 && bounds.bottom <= innerHeight);
      return { trailing, noUnverifiedControls, ignoredPlaceholder, noKeyedPreview: !keyed.nextElementSibling,
        single: single?.href, noReferrer: single?.relList.contains('noreferrer'), fits,
        open: button?.getAttribute('aria-expanded') === 'true',
        groups: [...(panel?.querySelectorAll('span > bdi:not(a bdi)') || [])].map(heading => heading.textContent),
        links: [...(panel?.querySelectorAll('a') || [])].map(link => link.href) };
    })()
  `);
  for (const key of ['trailing', 'noUnverifiedControls', 'ignoredPlaceholder', 'noKeyedPreview', 'noReferrer', 'fits', 'open']) {
    assertEqual("listing preview", key, results[key], true);
  }
  assertEqual("listing preview", "one file links directly", results.single, "https://dl2.soft98.ir/files/preview.zip");
  assertEqual("listing preview", "both structured links, without duplicates or placeholders", results.links.join(","),
    "https://dl2.soft98.ir/files/package.part01.rar,https://dl2.soft98.ir/files/package.part02.rar");
  assertEqual("listing preview", "file groups stay distinct", results.groups.join(","), "Windows x64,Windows ARM");
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  const closed = await evaluate(client, `(async () => {
    const panel = document.querySelector('[data-soft98-pro-preview-panel]');
    for (let i = 0; i < 10 && panel.hasAttribute('data-s98p-preview-open'); i++)
      await new Promise(requestAnimationFrame);
    return !panel.hasAttribute('data-s98p-preview-open');
  })()`);
  assertEqual("listing preview", "Escape closes the menu", closed, true);
}

async function verifyFileActions(client) {
  const selector = '[data-soft98-pro-download-manager="file"]';
  const menu = "#soft98-pro-file-menu";
  const destination = "https://files.example.test/tool.zip?sig=A%2Fb";
  const check = (what, actual, expected) => assertEqual("download actions", what, actual, expected);
  const run = (code) => evaluate(client, code);
  const until = async (code) => {
    for (let attempt = 0; attempt < 45; attempt++) {
      if (await run(code).catch(() => false)) return;
      await delay(70);
    }
    throw new Error("Download actions timed out: " + code);
  };
  const position = (target) => run(`(() => {
    const node = document.querySelector(${JSON.stringify(target)});
    node.scrollIntoView({ block: "nearest" });
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x: x + width / 2, y: y + height / 2 };
  })()`);
  async function click(target, button = "left") {
    const point = await position(target);
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", button, clickCount: 1, ...point });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", button, clickCount: 1, ...point });
  }
  async function press(key) {
    for (const type of ["keyDown", "keyUp"]) await client.send("Input.dispatchKeyEvent", { type, key, code: key });
  }
  await client.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 560, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/test/download-actions.html` });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await run(`document.querySelector(${JSON.stringify(selector)})?.dataset.s98pFileCommand`).catch(() => "") === "copy") break;
    if (attempt === 39) throw new Error("Extension download action did not render");
    await delay(100);
  }
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
  const button = `document.querySelector(${JSON.stringify(selector)})`;
  const row = `${button}.closest("dd")`;
  const more = 'document.querySelector("[data-s98p-file-more]")';
  const background = () => run(`getComputedStyle(${row}).backgroundColor`);
  const canHover = await run('matchMedia("(hover: hover) and (pointer: fine)").matches');
  const idleOpacity = canHover ? "0" : "1";
  await until(`getComputedStyle(${more}).opacity === ${JSON.stringify(idleOpacity)}`);
  const idle = await background();
  const startPosition = await position(selector);
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...await position('[data-soft98-pro-download-row]') });
  await delay(200);
  const linkHover = await background();
  if (linkHover === idle) throw new Error("The link hover did not highlight the download row");
  check("the three dots are visible over the download link", await run(`getComputedStyle(${more}).opacity`), "1");
  check("the RTL layout puts the three dots physically to the right", await run(`${more}.getBoundingClientRect().left >= ${button}.getBoundingClientRect().right`), true);
  check("the menu icon has three dots", await run(`${more}.querySelectorAll("svg path").length`), 4);
  check("button lets the row background show through", await run(`getComputedStyle(${button}).backgroundColor`), "rgba(0, 0, 0, 0)");
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...startPosition });
  await delay(200);
  check("hover shared across link and action", await background(), linkHover);
  check("action remains stationary on hover", JSON.stringify(await position(selector)), JSON.stringify(startPosition));
  await run(`${button}.click()`);
  const jobs = 'fileActionsFixture.messages.filter(message => message.type === "soft98:download-file")';
  check("synthetic clicks do not start downloads", await run(`${jobs}.length`), 0);
  await click(selector);
  check("Copy preserves the signed destination", await run("fileActionsFixture.copied.at(-1)"), destination);
  check("Copy did not submit a job", await run(`${jobs}.length`), 0);
  const link = '[data-soft98-pro-download-row]';
  await click(link, "right");
  check("context menu stays inside mobile viewport", await run(`(() => {
    const box = document.querySelector("${menu}").getBoundingClientRect();
    return box.x >= 0 && box.y >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
  })()`), true);
  check("menu uses the page locale direction", await run(`getComputedStyle(document.querySelector("${menu}")).direction`), "rtl");
  await press("ArrowDown");
  check("arrow navigation advances to the single internal action", await run("document.activeElement.dataset.s98pFileCommand"), "internal");
  check("only Copy and Internal Download run a command", await run(`[...document.querySelectorAll("${menu} [data-s98p-file-command]")].map(el=>el.dataset.s98pFileCommand).join(",")`), "copy,internal");
  await press("Escape");
  check("Escape restores focus to the original link", await run(`document.activeElement.matches(${JSON.stringify(link)})`), true);
  await click("[data-s98p-file-more]");
  await click(`${menu} [data-s98p-file-command="internal"]`);
  check("Internal download sends the exact direct link", await run(`${jobs}.at(-1).urls[0]`), destination);
  check("the direct-start notice appears on the article", await run('document.querySelector("[data-soft98-pro-copy-toast]").textContent.includes("دانلود داره شروع می‌شه")'), true);
  check("one-time Internal download keeps the Copy default", await run(`${button}.dataset.s98pFileCommand`), "copy");
  await click("[data-s98p-file-more]");
  await click(`${menu} [data-s98p-file-default="internal"]`);
  check("menu persists the new default", await run("fileActionsFixture.settings.downloadRowAction"), "internal");
  check("control center reflects menu selection", await run('document.querySelector("select[name=downloadRowAction]").value'), "internal");
  await run(`(() => {
    const select = document.querySelector("select[name=downloadRowAction]");
    select.value = "copy";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const limit = document.querySelector("input[name=downloadReviewMB]");
    if (limit.value !== "100") throw new Error("Wrong initial review threshold");
    limit.value = "25";
    limit.dispatchEvent(new Event("change", { bubbles: true }));
    const toggle = document.querySelector("input[name=downloadRowContextMenu]");
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await delay(250);
  check("control center persists and updates the default", await run(`${button}.dataset.s98pFileCommand`), "copy");
  check("control center persists the review threshold", await run("fileActionsFixture.settings.downloadReviewMB"), 25);
  check("disabling row context actions leaves browser right-click untouched", await run(`(() => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    return document.querySelector(${JSON.stringify(link)}).dispatchEvent(event) && !document.querySelector("${menu}");
  })()`), true);
  await click("[data-s98p-file-more]");
  check("the explicit menu still works with row right-click disabled", await run(`Boolean(document.querySelector("${menu}"))`), true);
  await press("Escape");
  const section = '[data-soft98-pro-download-manager="section"]';
  const responsive = `(() => {
    const heading = document.querySelector(${JSON.stringify(section)}).closest("dt");
    const label = heading.querySelector("[data-s98p-download-heading-label]");
    const toggle = heading.querySelector("[data-s98p-download-toggle]");
    const group = heading.querySelector("[data-soft98-pro-download-actions]");
    const copy = group.querySelector("[data-s98p-download-copy-all]");
    const download = group.querySelector(${JSON.stringify(section)});
    if (group.nextElementSibling !== toggle || group.firstElementChild !== copy || copy.nextElementSibling !== download) return false;
    const layout = (rtl) => {
      const [l,c,d,t] = [label, copy, download, toggle].map(node => node.getBoundingClientRect());
      const horizontal = rtl ? [l.left-c.right, c.left-d.right, d.left-t.right] :
        [c.left-l.right, d.left-c.right, t.left-d.right];
      return Math.abs(t.y-d.y)<2 && Math.abs(d.y-c.y)<2 && Math.abs((l.top+l.bottom)-(d.top+d.bottom))<4 &&
        horizontal[0]>=16 && horizontal[1]>=4 && horizontal[2]>=8 && t.left>=0 && t.right<=innerWidth;
    };
    const rtl = layout(true);
    heading.dir = "ltr";
    const ltr = layout(false);
    heading.removeAttribute("dir");
    return rtl && ltr;
  })()`;
  check("Copy and Download sit at the end beside collapse in RTL and LTR, including keyboard order", await run(responsive), true);
  const heading = 'dt:has([data-soft98-pro-download-manager="section"])';
  const expanded = `document.querySelector(${JSON.stringify(heading + " [data-s98p-download-toggle]")}).getAttribute("aria-expanded")`;
  await click(heading + " [data-s98p-download-heading-label]");
  await until(`${expanded}==="false"`);
  await click(heading + " [data-s98p-download-copy-all]");
  check("Copy All does not toggle the heading", await run(expanded), "false");
  const gap = await run(`(() => {
    const row = document.querySelector(${JSON.stringify(heading)});
    const a = row.querySelector("[data-s98p-download-heading-label]").getBoundingClientRect();
    const b = row.querySelector("[data-soft98-pro-download-actions]").getBoundingClientRect();
    const r = row.getBoundingClientRect();
    return {x:(a.left+b.right)/2,y:r.top+r.height/2};
  })()`);
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...gap });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...gap });
  await until(`${expanded}==="true"`);
  await run(`(() => {
    for (const [name, value] of [["downloadHeaderLayout","toggle"],["downloadHeaderButtons","text"]]) {
      const select = document.querySelector("select[name="+name+"]");
      select.value=value; select.dispatchEvent(new Event("change",{bubbles:true}));
    }
  })()`);
  await until('document.querySelector("[data-s98p-download-header-layout=toggle]")');
  check("alternative layout persists and text labels are visible", await run(`(() => {
    const d=document.querySelector(${JSON.stringify(section)}), t=d.closest("dt").querySelector("[data-s98p-download-toggle]");
    return getComputedStyle(d.querySelector("span")).display!=="none" && t.getBoundingClientRect().right > d.getBoundingClientRect().right &&
      t.nextElementSibling === d.parentElement && fileActionsFixture.settings.downloadHeaderButtons==="text";
  })()`), true);
  check("non-matching OS sections collapse but matching multi-OS sections stay open", await run(`
    document.querySelector("#linux-file").hasAttribute("data-soft98-pro-download-collapsed") &&
    !document.querySelector("#multi-file").hasAttribute("data-soft98-pro-download-collapsed")`), true);
  const other = 'document.querySelector("#other-platforms [data-s98p-download-toggle]")';
  check("the generic Other Platforms group starts collapsed on Windows", await run(`${other}.getAttribute("aria-expanded")`), "false");
  await run(`${other}.click()`);
  await until(`${other}.getAttribute("aria-expanded")==="true"`);
  check("explicitly opening Other Platforms is saved", await run(`
    JSON.parse(localStorage.getItem("soft98-pro.download-sections")).some(([key,value])=>key.includes("سایرپلتفرمها") && value===false)`), true);
  await run('document.querySelector("#linux-section button[data-s98p-download-toggle]").click()');
  await until('document.querySelector("#linux-file").getAnimations().length>0');
  await until('!document.querySelector("#linux-file").inert && document.querySelector("#linux-file").offsetHeight>0');
  check("manual expansion is saved", await run('JSON.parse(localStorage.getItem("soft98-pro.download-sections")).some(([key,value])=>key.includes("لینوکس") && value===false)'), true);
  await click(section);
  await until('document.querySelector("dialog[data-s98p-download-confirm][open]")');
  check("Download All opens review without collapsing its own section", await run(expanded), "true");
  const confirmed = 'fileActionsFixture.messages.filter(message=>message.type==="soft98:confirm-download-all")';
  check("small Download All waits for explicit approval", await run(`${confirmed}.length`), 0);
  check("the dialog has a labeled header, centered close icon, and matching action buttons", await run(`(() => {
    const dialog=document.querySelector("dialog[data-s98p-download-confirm]");
    const title=dialog.querySelector("header h2"), close=dialog.querySelector("header button");
    const bounds=close.getBoundingClientRect(), glyph=close.querySelector("svg").getBoundingClientRect();
    const footer=[...dialog.querySelectorAll("footer button")].map(button=>getComputedStyle(button));
    const rect=dialog.getBoundingClientRect();
    const center=(a,b,start,size)=>Math.abs(a[start]+a[size]/2-b[start]-b[size]/2)<.75;
    const correctSide=()=>dialog.dir==="rtl" ? close.getBoundingClientRect().right<title.getBoundingClientRect().left :
      close.getBoundingClientRect().left>title.getBoundingClientRect().right;
    const rtl=correctSide();
    const direction=dialog.dir;
    dialog.dir="ltr";
    const ltr=correctSide();
    dialog.dir=direction;
    return dialog.getAttribute("aria-labelledby")===title.id && getComputedStyle(title.parentElement).borderBottomWidth==="1px" &&
      close.type==="button" && Boolean(close.getAttribute("aria-label")) && center(bounds,glyph,"left","width") &&
      center(bounds,glyph,"top","height") && rtl && ltr && rect.left>=0 && rect.right<=innerWidth &&
      footer.every(style=>style.appearance==="none" && style.boxShadow==="none" && style.backgroundColor!=="rgb(39, 39, 39)") &&
      footer[0].height===footer[1].height && footer[0].backgroundColor!==footer[1].backgroundColor &&
      document.activeElement.value==="cancel";
  })()`), true);
  await run('Soft98Pro.configure({darkDesign:false},{sync:false})');
  await until('document.documentElement.classList.contains("soft98-pro-light")');
  check("light mode does not override the dialog's action hierarchy", await run(`(() => {
    const [cancel,start]=[...document.querySelectorAll("dialog[data-s98p-download-confirm] footer button")].map(n=>getComputedStyle(n));
    return cancel.backgroundImage==="none" && start.backgroundImage==="none" && cancel.backgroundColor!==start.backgroundColor &&
      cancel.borderColor!==start.borderColor;
  })()`), true);
  await run('Soft98Pro.configure({darkDesign:true},{sync:false})');
  await click('[data-s98p-download-confirm-close]');
  await until('!document.querySelector("dialog[data-s98p-download-confirm]")');
  check("closing from the header does not start the download", await run(`${confirmed}.length`), 0);
  await click(section);
  await until('document.querySelector("dialog[data-s98p-download-confirm][open]")');
  await click('dialog[data-s98p-download-confirm] button[value="cancel"]');
  await until('!document.querySelector("dialog[data-s98p-download-confirm]")');
  check("cancelling never sends a start request", await run(`${confirmed}.length`), 0);
  await click(section);
  await until('document.querySelector("dialog[data-s98p-download-confirm][open]")');
  check("both files are initially selected", await run('document.querySelectorAll("[data-s98p-download-choice]:checked").length'), 2);
  check("the selection total starts at 72 MiB", await run('document.querySelector("#soft98-pro-download-confirm-summary bdi").textContent'), "72 MiB");
  const search = (query) => run(`(() => {
    const field = document.querySelector("[data-s98p-download-choice-search] input");
    field.value = ${JSON.stringify(query)};
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.focus();
  })()`);
  const visibleChoices = 'document.querySelectorAll("[data-s98p-download-choice-list] label:not([hidden])").length';
  await search("MSI");
  check("search by type shows only the MSI file", await run(visibleChoices), 1);
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  check("Enter in search does not start a download", await run(`${confirmed}.length`), 0);
  await click('[data-s98p-download-choice-all]');
  check("bulk deselection only changes the visible file", await run('document.querySelector("[data-s98p-download-choice]:checked").value'), "0");
  await search("not-a-file");
  check("no-match state is contextual", await run('!document.querySelector("[data-s98p-download-choice-empty]").hidden'), true);
  await search("");
  await click('[data-choice-filter="selected"]');
  check("selection filter shows only the checked file", await run(visibleChoices), 1);
  await click('[data-s98p-download-choice-list] label:not([hidden]) > bdi');
  check("clicking a row toggles its checkbox and disables Start when nothing is selected", await run('document.querySelector("[data-s98p-download-confirm-start]").disabled'), true);
  await click('[data-choice-filter="unselected"]');
  check("unselected filter shows both files", await run(visibleChoices), 2);
  await search("installer");
  await click('[data-s98p-download-choice-all]');
  check("selection total is recalculated", await run('document.querySelector("#soft98-pro-download-confirm-summary bdi").textContent'), "8 MiB");
  await click('[data-s98p-download-confirm-start]');
  await until(`${confirmed}.length===1`);
  check("start submits only the checked index, even when hidden by the filter", await run(`JSON.stringify(${confirmed}[0].selected)`), "[1]");
  await run('fileActionsFixture.nextResult = "review"');
  await click(section);
  check("group action also uses the threshold-aware route", await run(`${jobs}.at(-1).urls[0]`), destination);
  check("review does not display another confirmation", await run('!document.querySelector("dialog[data-s98p-download-confirm][open]")'), true);
  const actionPositions = `[...document.querySelector(${JSON.stringify(selector)}).closest(".s98p-file-actions").querySelectorAll(
    "[data-s98p-file-command],[data-s98p-file-more]"
  )].map(b=>b.getBoundingClientRect().left).join(",")`;
  const untrackedPositions = await run(actionPositions);
  await run(`(() => {
    const url = ${JSON.stringify(destination)};
    document.documentElement.setAttribute("data-soft98-pro-download-snapshot", JSON.stringify({
      files: [{ url, bytes: 42, total: 100, eta: 17, status: "downloading" }],
      counts: { active: 1, waiting: 0, finished: 0, attention: 0 }, transfer: { bytes: 42, total: 100 }
    }));
    document.dispatchEvent(new Event("soft98-pro:download-snapshot"));
  })()`);
  check("article badges show real progress", await run('document.querySelector("[data-s98p-file-status]").dataset.s98pFileStatus'), "downloading");
  check("showing a badge does not move the actions", await run(actionPositions), untrackedPositions);
  check("article progress includes byte counts and an ETA", await run(`(() => {
    const transfer = document.querySelector("[data-soft98-pro-download-copy] [data-s98p-download-transfer]");
    return transfer.querySelector("progress").value === 42 && transfer.textContent.includes("42 B") &&
      transfer.textContent.includes("100 B") && !transfer.querySelector("small").hidden;
  })()`), true);
  check("Control Center shows both total activity and this article's file", await run(`(() => {
    const panel = document.querySelector('[data-panel="downloads"]');
    return panel.querySelector("[data-queue-overall] progress").value === 42 &&
      panel.querySelector("[data-queue-files] progress").value === 42 &&
      panel.querySelector("[data-queue-files] button").dataset.s98pManagedUrl === ${JSON.stringify(destination)};
  })()`), true);
  check("Control Center hides zero-count categories", await run(`(() => {
    const visible = document.querySelectorAll('.s98p-download-overview > div:not([hidden]) dd');
    return [...visible].map(node => node.dataset.queueCount).join(",");
  })()`), "active");
  check("completion badge is not a generic Ready badge", await run(`(() => {
    document.documentElement.setAttribute("data-soft98-pro-download-snapshot", JSON.stringify({
      files: [{ url: ${JSON.stringify(destination)}, status: "complete", bytes: 100, total: 100 }],
      counts: { active: 0, waiting: 0, finished: 1, attention: 0 }
    }));
    document.dispatchEvent(new Event("soft98-pro:download-snapshot"));
    return document.querySelector("[data-s98p-file-status]").dataset.s98pFileStatus;
  })()`), "complete");
  check("completion also appears on the article", await run('document.querySelector("[data-soft98-pro-copy-toast]").textContent.includes("دانلود تموم شد")'), true);
  check("the badge is centered between the row text and anchored actions", await run(`(() => {
    const button=document.querySelector("[data-s98p-file-status]");
    const pill=button.getBoundingClientRect(), label=button.querySelector("bdi").getBoundingClientRect();
    const more=button.parentElement.querySelector("[data-s98p-file-more]").getBoundingClientRect();
    return Math.abs(pill.top+pill.height/2-label.top-label.height/2)<.5 && label.height<pill.height && pill.left>more.right;
  })()`), true);
  check("switching to the completed badge does not move the actions", await run(actionPositions), untrackedPositions);
  await run(`(() => {
    const link=document.querySelector("[data-soft98-pro-download-row]");
    const stale=link.cloneNode(true);
    const title=stale.querySelector("[data-soft98-pro-download-title]");
    title.append(stale.querySelector("[data-s98p-download-transfer]").cloneNode(true));
    link.replaceWith(stale);
  })()`);
  await until(`document.querySelector("[data-soft98-pro-download-row]").querySelectorAll("[data-s98p-download-transfer]").length===1`);
  check("reused download markup shows exactly one visible size", await run(`(() => {
    const link=document.querySelector("[data-soft98-pro-download-row]");
    return link.querySelectorAll("[data-soft98-pro-download-title] [data-s98p-download-transfer]").length===0 &&
      !link.querySelector("[data-soft98-pro-download-meta] bdi").getClientRects().length &&
      link.querySelector("[data-s98p-download-transfer] bdi").textContent==="100 B";
  })()`), true);
  const help = "#fixture-help-repair";
  await until('document.querySelector("#password-fixture > [data-soft98-pro-password-shell]")');
  await run('document.querySelector("[data-soft98-pro-copy-toast] button")?.click(); document.querySelector("#fixture-help-repair").scrollIntoView({block:"center",behavior:"instant"})');
  await delay(250);
  const helpAt = await position(help);
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...helpAt });
  await until(`getComputedStyle(document.querySelector("${help}")).boxShadow.includes("1px inset")`);
  check("a password help item has an inset hover edge even with zero top border", await run(`(() => {
    const node=document.querySelector("${help}"), style=getComputedStyle(node);
    return node.matches(":hover") && style.borderBlockStartWidth==="0px" && style.boxShadow.includes("inset") &&
      style.zIndex==="2";
  })()`), true);
  await client.send("Page.reload");
  await until('document.querySelector("#linux-section [data-s98p-download-toggle]")');
  check("an expanded foreign OS section stays open after reload", await run('!document.querySelector("#linux-file").hasAttribute("data-soft98-pro-download-collapsed")'), true);
}

async function verifyDownloadManager(client, { permissionsOnly = false } = {}) {
  const page = `http://127.0.0.1:${PORT}`;
  const fixtures = `${page}/test/download-fixture/`;
  const part = (partNumber) => `${fixtures}Artwork.part0${partNumber}.rar`;
  const origin = "https://soft98.ir/software/example.html";
  const result = await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    if (["/downloads.html", "/popup.html"].some(path => location.pathname.endsWith(path))) {
      if (location.search === "?fa=1") {
        Object.defineProperty(navigator, "language", { value: "fa-IR" });
        Object.defineProperty(navigator, "languages", { value: ["fa-IR"] });
      }
      const state = { limit: 3, maxParallel: 6, held: false, notifications: true, jobs: [
        { id: "part2", url: ${JSON.stringify(part(2))}, source: ${JSON.stringify(origin)}, status: "paused", manualStart: true, total: 48234496 },
        { id: "part1", url: ${JSON.stringify(part(1))}, source: ${JSON.stringify(origin)}, status: "complete", total: 67108864, bytes: 67108864, browserId: 11, exists: true, startedAt: Date.now() - 172800700, endedAt: Date.now() - 172800000,
          metadata: { date: Date.UTC(2024, 10, 16) } },
      ] };
      window.managerCommands = [];
      window.notificationReply = { ok: true };
      let externalAllowed = false;
      const appearanceKey = "soft98AdBlockerSettings";
      const storageListeners = [];
      const appearance = () => JSON.parse(sessionStorage.getItem("fixtureAppearance") || "{}");
      window.externalAppearance = next => {
        const oldValue = appearance();
        sessionStorage.setItem("fixtureAppearance", JSON.stringify(next));
        for (const listen of storageListeners) listen({ [appearanceKey]: { oldValue, newValue: next } }, "local");
      };
      window.setManagerJob = (id, changes) => {
        Object.assign(state.jobs.find(job => job.id === id), changes);
        document.dispatchEvent(new Event("visibilitychange"));
      };
      window.emptyManagerQueue = () => {
        state.jobs = [];
        document.dispatchEvent(new Event("visibilitychange"));
      };
      window.browser = {
        storage: { local: {
          get: async key => ({ [key]: key === appearanceKey ? appearance() : sessionStorage.getItem(key) || undefined }),
          set: async values => {
            for (const [key, value] of Object.entries(values)) {
              if (key === appearanceKey) externalAppearance(value);
              else sessionStorage.setItem(key, value);
            }
          },
        }, onChanged: { addListener(listener) { storageListeners.push(listener); } } },
        permissions: { request: async ({ origins }) => {
          managerCommands.push({ action: "grant", origins }); externalAllowed = true; return true;
        } },
        downloads: { open: async id => managerCommands.push({ action: "open-native", id }) },
        runtime: { sendMessage: async (message) => {
          managerCommands.push(message);
          if (message.type === "soft98:test-download-notification") return notificationReply;
          if (message.action === "configure" && message.limit) state.limit = message.limit;
          if (message.type === "soft98:download-details") {
            const url = new URL(message.url);
            if (url.hostname === "no-headers.example.test") return { status: "unavailable" };
            if (url.hostname === "external.example.test" && !externalAllowed) return { status: "permission", origin: url.origin + "/*" };
            if (url.hostname === "external.example.test") return { status: "ok", size: 950, date: null, mime: "application/vnd.android.package-archive", type: "" };
            const response = await fetch(url, { method: "HEAD" });
            const facts = response.headers;
            return { status: response.ok ? "ok" : "unavailable", size: Number(facts.get("content-length")),
              date: Date.parse(facts.get("last-modified")), mime: facts.get("content-type") };
          }
          return { ok: true, state: structuredClone({ ...state, added: message.urls?.length ?? 0, duplicates: 0 }) };
        } },
      };
    }
  ` });
  const run = (source) => evaluate(client, source);
  const check = (field, actual, expected) => assertEqual("download manager", field, actual, expected);
  const until = async (source) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await run(source).catch(() => false)) return;
      await delay(80);
    }
    throw new Error(`Download manager timed out: ${source}`);
  };
  const capture = async (name) => {
    if (!process.env.SOFT98_DOWNLOAD_SCREENSHOTS) return;
    const directory = path.join(ROOT, "docs", "assets", "comparison");
    fs.mkdirSync(directory, { recursive: true });
    const { data } = await client.send("Page.captureScreenshot", { format: "webp", quality: 84 });
    fs.writeFileSync(path.join(directory, name + ".webp"), Buffer.from(data, "base64"));
  };
  await client.send("Emulation.setTimezoneOverride", { timezoneId: "UTC" });
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1180, height: 780, deviceScaleFactor: 1, mobile: false });
  try {
    await client.send("Page.navigate", { url: page + "/dist/chromium/downloads.html" });
    await until('document.querySelectorAll(".job-group .job").length === 2');
    if (permissionsOnly) {
      const button = 'document.getElementById("probe-import")';
      const row = hostname => `document.querySelector('#import-links tr[data-url*="${hostname}"]')`;
      const add = url => run(`document.getElementById("import-url").value = ${JSON.stringify(url)}; document.getElementById("add-url").click()`);
      const context = target => run(`${target}.dispatchEvent(new MouseEvent("contextmenu", { bubbles:true, cancelable:true }))`);
      const menuAction = 'document.querySelector("#manager-menu:popover-open [data-label=allowDetails],#manager-menu:popover-open [data-label=fetchDetails]")';
      await run('document.getElementById("open-import").click()');
      check("empty review hides metadata access", await run(`${button}.hidden && !${button}.getClientRects().length`), true);
      await add(part(1));
      check("pending automatic metadata never requires a manual button", await run(`${button}.hidden`), true);
      await until('document.querySelector("#import-links .import-size").textContent.includes("64 MiB")');
      await add("https://no-headers.example.test/file.zip");
      await until(`${row("no-headers")}.querySelector("[data-column=size]").title.includes("did not provide")`);
      check("known or unavailable details do not request access", await run(`${button}.hidden`), true);
      await context(row("Artwork"));
      check("context menu omits unnecessary file-details actions", await run(`!${menuAction}`), true);
      await run('document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key:"Escape", bubbles:true, cancelable:true }))');
      await add("https://external.example.test/download");
      await until(`!${button}.hidden && !${button}.disabled`);
      await run(`${row("external")}.querySelector("input").click()`);
      check("deselecting the blocked link removes the action and hint", await run(`${button}.hidden && !document.getElementById("import-notice").textContent`), true);
      await context(row("external"));
      check("the unchecked link cannot add the permission action to the menu", await run(`!${menuAction}`), true);
      await run('document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key:"Escape", bubbles:true, cancelable:true }))');
      await run(`${row("external")}.querySelector("input").click()`);
      check("selecting the blocked link shows the access action", await run(`!${button}.hidden && !${button}.disabled`), true);
      await context(row("external"));
      check("context menu offers the same permission action", await run(`${menuAction}?.dataset.label`), "allowDetails");
      await run(`${menuAction}.click()`);
      await until(`${button}.hidden && ${row("external")}.querySelector(".import-size").textContent.includes("950 B")`);
      check("grant requests only the missing origin", await run('managerCommands.find(m => m.action === "grant").origins.join()'), "https://external.example.test/*");
      check("grant does not repeat unrelated probes", await run('managerCommands.filter(m => m.type === "soft98:download-details" && !m.url.includes("external.example.test")).length'), 2);
      check("the focused acceptance test sends no audio or test notification requests", await run('!managerCommands.some(m => /audio|notification|sound/.test(m.type || ""))'), true);
      return;
    }
    check("idle queue omits the active counter and pause control", await run(`document.querySelector("#count-active").parentElement.hidden &&
      !document.querySelector("#count-waiting").parentElement.hidden && !document.querySelector("#count-finished").parentElement.hidden &&
      document.querySelector("#hold").hidden`), true);
    check("multipart parts sort numerically", await run('document.querySelector(".job-group .job strong").textContent'), "Artwork.part01.rar");
    check("source page is navigable", await run('document.querySelector(".source a").href'), origin);
    check("a queued-only file has a Start button", await run('document.querySelectorAll(".job")[1].querySelector("[data-action=resume]").dataset.label'), "start");
    check("completed rows replace progress and elapsed time with a status", await run(`(() => {
      const row = document.querySelector(".job[data-state=complete]");
      return row.querySelector(".state").textContent === "Completed" &&
        row.querySelector("[data-metric=percent]").hidden && row.querySelector("[data-metric=elapsed]").hidden &&
        row.querySelector("[data-metric=bytes]").textContent === "64 MiB" && row.querySelector("[data-metric=total]").hidden;
    })()`), true);
    check("recent completion dates are relative and expose an exact date on focus", await run(`(() => {
      const time = document.querySelector(".meta-completed time");
      const exact = new Intl.DateTimeFormat("en", { calendar: "gregory", dateStyle: "medium" }).format(new Date(time.dateTime));
      const relative = time.textContent;
      time.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      const focus = time.textContent === exact;
      time.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      return [relative, focus, time.textContent].join("|");
    })()`), "2 days ago|true|2 days ago");
    check("downloaded archives have an icon", await run('document.querySelector(".job .file-mark").dataset.icon'), "file-zip");
    await run('document.querySelector(".file-open").click()');
    check("the filename opens the completed browser download", await run('managerCommands.find(message => message.action === "open-native")?.id'), 11);
    await run('document.querySelector(".job-menu").click()');
    check("row context actions are valid for that file", await run(`(() => {
      const menu = document.querySelector("#manager-menu");
      return menu.matches(":popover-open") && [...menu.children].some(button => button.dataset.label === "open") &&
        [...menu.children].some(button => button.dataset.label === "copyLink") &&
        ![...menu.children].some(button => button.dataset.label === "pause");
    })()`), true);
    await run('document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))');
    check("Escape returns focus to the menu button", await run('document.activeElement.matches(".job-menu")'), true);
    await run('document.body.style.minHeight = "200vh"; scrollTo(0, 450); document.querySelector("#settings-tab").click()');
    check("first visit to Settings starts at the top", await run("scrollY"), 0);
    await run('document.querySelector("#queue-tab").click()');
    check("switching back restores the queue scroll position", await run("scrollY"), 450);
    await run('document.body.style.minHeight = ""; scrollTo(0, 0)');
    await run('document.querySelector("#settings-tab").click()');
    check("settings are routed and separated from the queue", await run('location.hash === "#settings" && document.querySelector("#queue-view").hidden && document.querySelector("#settings-view #limit") !== null'), true);
    await until('!document.querySelector("#limit-trigger").disabled');
    const pressSelect = key => run(`document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }))`);
    await run('document.querySelector("#limit-trigger").focus({ preventScroll: true })');
    await delay(180);
    await pressSelect("ArrowDown");
    check("native select is replaced by a labeled combobox with one selected option", await run(`
      document.querySelector("#limit").hidden && document.querySelector("#limit-trigger").getAttribute("role") === "combobox" &&
      document.querySelector("#limit-choices").matches(":popover-open") &&
      document.querySelector("#limit-choices [aria-selected=true] > span").textContent === "3"`), true);
    await pressSelect("End");
    await pressSelect("Escape");
    check("Escape cancels navigation without a setting update", await run(`document.activeElement.id === "limit-trigger" &&
      !document.querySelector("#limit-choices").matches(":popover-open") && document.querySelector("#limit").value === "3"`), true);
    await run(`(() => {
      const trigger = document.querySelector("#limit-trigger");
      const press = key => trigger.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      press("Home");
      if (trigger.getAttribute("aria-activedescendant") !== "limit-choices-0")
        throw new Error("Home did not highlight the first parallel limit");
      press("Enter");
    })()`);
    await until('managerCommands.some(message => message.action === "configure" && message.limit === 1)');
    check("keyboard selection updates the visible label", await run('document.querySelector("#limit-value").textContent'), "1");
    await run(`externalAppearance({ patchScripts: false });
      document.querySelector('[name=darkDesign][value=light]').click();
      document.querySelector('[name=accentColor][value=orchid]').click();`);
    await until('document.documentElement.dataset.theme === "light" && document.documentElement.dataset.s98pAccent === "orchid"');
    check("saving appearance preserves unrelated settings", await run('JSON.parse(sessionStorage.fixtureAppearance).patchScripts'), false);
    await run('document.querySelector("#appearance-rgb").click(); document.querySelector("#control-center-visible").click()');
    await until('document.documentElement.dataset.theme === "rgb" && JSON.parse(sessionStorage.fixtureAppearance).controlCenter === false');
    await run('document.querySelector("[name=darkDesign][value=light]").click()');
    await until('document.documentElement.dataset.theme === "light" && !document.querySelector("#appearance-rgb").checked');
    await run('externalAppearance({ darkDesign: true, controlCenter: true })');
    check("changes from other extension views update the controls", await run('document.documentElement.dataset.theme === "dark" && document.querySelector("#control-center-visible").checked'), true);
    const alertFeedback = 'document.getElementById("feedback")';
    const sendTestAlert = 'document.getElementById("test-notification").click()';
    await run(`${sendTestAlert}; ${sendTestAlert}`);
    await until(`${alertFeedback}.textContent.startsWith("Test notification sent.")`);
    check("only one test is sent while its request is pending", await run(
      'managerCommands.filter(message => message.type === "soft98:test-download-notification").length'), 1);
    check("a test does not change automatic alerts", await run('document.getElementById("native-notifications").checked'), true);
    await run(`notificationReply = { ok: false, error: "notificationBlocked" }; ${sendTestAlert}`);
    await until(`${alertFeedback}.textContent.startsWith("The browser is blocking notifications.") && ${alertFeedback}.dataset.error === "true"`);
    check("Help is in the sticky header and Telegram is not in the manager", await run(`Boolean(document.querySelector(".masthead button#open-guide svg")) &&
      !document.querySelector('a[href*="t.me/"]')`), true);
    await run('document.querySelector("#open-guide").click()');
    check("the help route works without GitHub", await run('location.hash === "#guide" && document.querySelector("#guide").open && document.querySelector("#open-guide").getAttribute("aria-expanded") === "true"'), true);
    await delay(240);
    const point = { x: 3, y: 3, button: "left", clickCount: 1 };
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point });
    check("click outside closes the guide and restores the settings route", await run('location.hash === "#settings" && !document.querySelector("#guide").open'), true);
    await run('location.hash = "#import"');
    await until('document.querySelector("#import").open');
    await run("history.back()");
    await until('location.hash === "#settings" && !document.querySelector("#import").open');
    await run("history.forward()");
    await until('location.hash === "#import" && document.querySelector("#import").open');
    await run('document.querySelector("#close-import").click()');
    await client.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "F2", code: "F2", windowsVirtualKeyCode: 113 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "F2", code: "F2", windowsVirtualKeyCode: 113 });
    check("F2 opens and focuses queue search from settings", await run('location.hash === "#queue" && document.activeElement.id === "search"'), true);
    await run('document.getElementById("search").value = "not in the queue"; document.getElementById("search").dispatchEvent(new Event("input"))');
    await until('document.querySelector(".job-group").inert && document.querySelector(".job-group").getBoundingClientRect().height < 2');
    check("filtered rows have a motion transition", await run('getComputedStyle(document.querySelector(".job-group")).transitionProperty.includes("grid-template-rows")'), true);
    check("the empty filter state offers a reset", await run('document.querySelector("#empty-action").dataset.label'), "resetFilters");
    await run('document.getElementById("empty-action").click()');
    await until('!document.querySelector(".job-group").inert && document.querySelector(".job-group").getBoundingClientRect().height > 100');
    await run('document.body.style.minHeight = "200vh"; scrollTo(0, 450)');
    check("the manager header stays pinned when scrolling", await run('scrollY > 400 && document.querySelector(".masthead").getBoundingClientRect().top === 0'), true);
    await run('document.body.style.minHeight = ""; scrollTo(0, 0)');
    await run('window.idleIcon = document.querySelector("#manager-favicon").href; setManagerJob("part2", { status: "downloading", bytes: 24117248, startedAt: Date.now() - 2000 })');
    await until('document.documentElement.dataset.downloadIndicator === "active"');
    check("active queue shows its counter and pause control", await run(`!document.querySelector("#count-active").parentElement.hidden &&
      document.querySelector("#count-waiting").parentElement.hidden && !document.querySelector("#hold").hidden`), true);
    check("active rows keep percentage and elapsed time", await run(`(() => {
      const row = document.querySelector('.job[data-state="downloading"]');
      return row.querySelector("[data-metric=percent]").textContent === "50%" &&
        !row.querySelector("[data-metric=elapsed]").hidden;
    })()`), true);
    check("progress updates the favicon and in-page mark together", await run('document.querySelector("#manager-favicon").href !== idleIcon && document.querySelector("#manager-mark").src === document.querySelector("#manager-favicon").href'), true);
    await run('Object.defineProperty(document,"hidden",{value:true,configurable:true}); setManagerJob("part2", { status: "complete", bytes: 48234496, endedAt: Date.now() })');
    await until('document.documentElement.dataset.downloadIndicator === "complete"');
    check("finished-only queue hides pause and resume", await run(`document.querySelector("#hold").hidden &&
      document.querySelectorAll("#counts > div:not([hidden]) dd").length === 1 &&
      document.querySelector("#count-finished").textContent === "2"`), true);
    check("finishing clears the live timer", await run('document.querySelector(".job[data-id=part2] [data-metric=elapsed]").hidden'), true);
    await until('document.documentElement.dataset.downloadIndicator === "idle"');
    await run('delete document.hidden; setManagerJob("part2", { status: "paused", bytes: 0 })');
    await until('document.querySelector("[data-id=part2]").dataset.state === "paused"');
    await capture("download-manager-multipart");
    await run(`(() => {
      const data = new DataTransfer();
      data.setData("text/plain", ${JSON.stringify([part(2), part(1), fixtures + "Notes.pdf", part(2)].join("\n"))});
      document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, cancelable: true }));
    })()`);
    await until('document.querySelector("#import").open && document.querySelectorAll("#import-links tr").length === 3');
    check("pasting opens the import hash", await run('location.hash'), "#import");
    check("close icon is centered in both axes", await run(`(() => {
      const button=document.querySelector("#close-import"), b=button.getBoundingClientRect(), s=button.querySelector("svg").getBoundingClientRect();
      return button.textContent.trim() === "" && Math.abs(b.left+b.width/2-s.left-s.width/2)<1 &&
        Math.abs(b.top+b.height/2-s.top-s.height/2)<1;
    })()`), true);
    await run('document.querySelector("#save-options").click()');
    await until('document.querySelector("#save-fields").getBoundingClientRect().height > 35');
    check("save options expands with a transition and enables its fields", await run(`(() => {
      const f=document.querySelector("#save-fields");
      return !f.inert && getComputedStyle(f).transitionProperty.includes("grid-template-rows");
    })()`), true);
    await run('document.querySelector("#save-options").click()');
    await until('document.querySelector("#save-fields").getBoundingClientRect().height < 1 && document.querySelector("#save-fields").inert');
    check("row clicks and checkbox changes update the same selected state", await run(`(() => {
      const row=document.querySelector("#import-links tr"), box=row.querySelector("input");
      const initial=box.checked && row.hasAttribute("data-selected");
      row.querySelector(".import-name").click();
      const unchecked=!box.checked && !row.hasAttribute("data-selected");
      box.click();
      return initial && unchecked && box.checked && row.hasAttribute("data-selected");
    })()`), true);
    await run('document.querySelector("#import-links input").dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }))');
    check("the import table has keyboard context actions inside its dialog", await run('document.querySelector("#import #manager-menu").matches(":popover-open") && document.querySelector("#manager-menu [data-label=copyLink]") !== null'), true);
    await run('document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))');
    await until('[...document.querySelectorAll("#import-links tr")].every((tr) => !tr.cells[3].textContent.includes("Unavailable"))');
    check("automatic HEAD reads Content-Length", await run('document.querySelector("#import-links tr").cells[3].textContent.includes("64 MiB")'), true);
    check("automatic HEAD reads Last-Modified", await run('document.querySelector("#import-links tr").cells[4].textContent'), "Oct 21, 2026");
    check("PDF gets its own icon in the review dialog", await run('document.querySelector(\'#import-links tr[data-url$="Notes.pdf"] [data-icon]\').dataset.icon'), "file-type-pdf");
    check("each reorderable column has an icon and a drag handle", await run('document.querySelectorAll("th[data-column] .column-sort svg").length === 4 && document.querySelectorAll("th[data-column] .column-menu[data-column-drag]").length === 4'), true);
    await run(`document.querySelector('th[data-column="date"] .column-sort').dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))`);
    check("column context menu has sort and move commands", await run(`Boolean(document.querySelector("#manager-menu:popover-open [data-label=sortAscending]")) &&
      Boolean(document.querySelector("#manager-menu [data-label=moveColumnLeft]"))`), true);
    await run('document.querySelector("#manager-menu [data-label=moveColumnLeft]").click()');
    const columnOrder = 'Array.from(document.querySelectorAll("#import-table th[data-column]"), th=>th.dataset.column).join(",")';
    check("column menu moves the selected header", await run(columnOrder), "name,type,date,size");
    await until('!document.querySelector("#manager-menu").matches(":popover-open") && !document.querySelector("#import").getAnimations().some(animation => animation.playState === "running")');
    const drag = await run(`(() => {
      const source=document.querySelector('th[data-column="date"] .column-menu').getBoundingClientRect();
      const destination=document.querySelector('th[data-column="name"]').getBoundingClientRect();
      return { start: { x: source.x+source.width/2, y: source.y+source.height/2 },
        end: { x: destination.left+12, y: destination.top+destination.height/2 } };
    })()`);
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...drag.start });
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", buttons: 1, clickCount: 1, ...drag.start });
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", buttons: 1, x: drag.start.x - 10, y: drag.start.y });
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", buttons: 1, ...drag.end });
    check("drag shows a drop indicator", await run('document.querySelector("th[data-column=name]").dataset.colDrop'), "before");
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...drag.end });
    check("drag and drop reorders headers and every file row without losing selection", await run(`(() => {
      const order=${columnOrder};
      const body=[...document.querySelectorAll("#import-links tr")];
      return order==="date,name,type,size" && JSON.parse(localStorage.getItem("soft98-pro.import-columns")).join(",")===order &&
        body.every(row=>[...row.querySelectorAll("td[data-column]")].map(cell=>cell.dataset.column).join(",")===order &&
          row.querySelector("input").checked && row.hasAttribute("data-selected"));
    })()`), true);
    await run(`document.querySelector('th[data-column="date"] .column-menu').click(); document.querySelector("#manager-menu [data-label=resetColumnOrder]").click()`);
    check("column order can be restored", await run(columnOrder), "name,type,size,date");
    await run(`(() => {
      const data = new DataTransfer();
      data.items.add(new File([${JSON.stringify(fixtures + "Assets.zip")}], "links.txt", { type: "text/plain" }));
      document.querySelector("#import").dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
    })()`);
    await until('document.querySelectorAll("#import-links tr").length === 4');
    await until('[...document.querySelectorAll("#import-links tr")].every((tr) => !tr.cells[3].textContent.includes("Unavailable"))');
    await capture("download-manager-import");
    await run(`(() => {
      const name = document.querySelector('th[data-column="name"] [role=separator]');
      name.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));
      document.querySelector('th[data-column="size"] button').click();
      const search = document.querySelector("#import-search");
      search.value = "artwork";
      search.dispatchEvent(new Event("input"));
    })()`);
    check("keyboard column resize changes width", await run('document.querySelector(\'col[data-column="name"]\').style.width'), "280px");
    check("sort and search are applied together", await run('document.querySelector("#import-links tr").cells[1].querySelector("bdi").textContent'), "Artwork.part02.rar");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 700, deviceScaleFactor: 1, mobile: false });
    await run('document.documentElement.dataset.theme = "light"');
    check("mobile dialog scrolls the table without widening the page", await run(`(() => {
      const dialog = document.querySelector("#import");
      const grid = document.querySelector(".import-grid");
      return dialog.getBoundingClientRect().width < innerWidth && grid.scrollWidth > grid.clientWidth && document.documentElement.scrollWidth <= innerWidth;
    })()`), true);
    await run('document.querySelector("#clear-import").click(); document.querySelector("#select-import").click(); document.querySelector("#composer").requestSubmit()');
    await until('managerCommands.some((message) => message.action === "add")');
    check("only the checked, filtered files enter the queue", await run('managerCommands.find((message) => message.action === "add").urls.length'), 2);
    check("dialog closes after success", await run('document.querySelector("#import").open'), false);
    check("the import hash clears after success", await run('location.hash'), "");
    await client.send("Page.navigate", { url: page + "/dist/chromium/downloads.html?fa=1" });
    await until('document.querySelector(".job[data-state=complete]")');
    check("natural Persian completion label", await run('document.querySelector(".job[data-state=complete] .state").textContent'), "دانلود شد");
    check("English file-size digits and tabular figures in Persian", await run(`(() => {
      const element = document.querySelector("[data-state=complete] [data-metric=bytes] bdi");
      return document.documentElement.dir === "rtl" && element.textContent === "64 MiB" &&
        getComputedStyle(element).fontVariantNumeric.includes("tabular-nums");
    })()`), true);
    const calendarCheck = expected => `(() => {
      const time = document.querySelector(".meta-date");
      const format = new Intl.DateTimeFormat("fa", { calendar: "${expected}", dateStyle: "medium" });
      return time.textContent === format.format(new Date(time.dateTime));
    })()`;
    await until('!document.querySelector("#date-calendar").disabled');
    check("Auto uses Solar Hijri in Persian", await run(calendarCheck("persian")), true);
    const selectCalendar = mode => run(`(() => {
      document.querySelector("#settings-tab").click();
      const select = document.querySelector("#date-calendar");
      select.value = "${mode}";
      select.dispatchEvent(new Event("change"));
      document.querySelector("#queue-tab").click();
    })()`);
    await selectCalendar("gregory");
    check("Gregorian changes the exact date without changing the language", await run(calendarCheck("gregory")), true);
    await client.send("Page.reload");
    await until('document.querySelector("#date-calendar")?.value === "gregory" && document.querySelector(".meta-date")');
    check("Gregorian survives a reload", await run(calendarCheck("gregory")), true);
    await selectCalendar("persian");
    check("Solar Hijri can also be selected explicitly", await run(calendarCheck("persian")), true);
    check("the table defaults to LTR in the RTL Persian interface", await run('document.documentElement.dir + "/" + document.querySelector("#import-table").dir'), "rtl/ltr");
    await run(`document.querySelector("#settings-tab").click();
      const direction = document.querySelector("#table-direction");
      direction.value = "rtl"; direction.dispatchEvent(new Event("change"));`);
    await client.send("Page.reload");
    await until('!document.querySelector("#table-direction").disabled && document.querySelector("#import-table").dir === "rtl"');
    check("the RTL table setting survives a reload", await run('document.querySelector("#table-direction").value'), "rtl");
    await run(`document.querySelector("#open-import").click();
      document.querySelector("#import-url").value = "https://external.example.test/download";
      document.querySelector("#add-url").click();`);
    await until('!document.querySelector("#probe-import").hidden && !document.querySelector("#probe-import").disabled');
    await run('document.querySelector("#probe-import").click()');
    await until('document.querySelector("#import-links [data-icon=device-mobile]") && document.querySelector("#import-links .import-size").textContent.includes("950 B")');
    check("the permission button disappears after metadata loads", await run('document.querySelector("#probe-import").hidden'), true);
    await run('document.querySelector("#import-type-trigger").click()');
    check("review file-type popup follows the RTL dialog and its live options", await run(`(() => {
      const list = document.querySelector("#import-type-choices");
      const box = list.getBoundingClientRect();
      return list.matches(":popover-open") && getComputedStyle(list).direction === "rtl" &&
        box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight && list.children.length === 2;
    })()`), true);
    check("only the missing external origin is requested", await run('managerCommands.find(message => message.action === "grant")?.origins.join(",")'), "https://external.example.test/*");
    await run('document.querySelector("#close-import").click(); setManagerJob("part1", { name: "download", mime: "application/pdf" })');
    await until('document.querySelector(".job[data-id=part1] [data-icon=file-type-pdf]")');
    await run("emptyManagerQueue()");
    await until('document.querySelector("#counts").hidden && !document.querySelector(".job")');
    check("empty queue has no counters or pause control", await run('document.querySelector("#hold").hidden && document.querySelector("#notice").textContent === ""'), true);
    await client.send("Emulation.setDeviceMetricsOverride", { width: 464, height: 520, deviceScaleFactor: 1, mobile: false });
    await client.send("Page.navigate", { url: page + "/dist/chromium/popup.html?fa=1" });
    await until('document.querySelector("#queue-tab svg") && !document.querySelector("#limit-trigger").disabled');
    const measurements = 'JSON.stringify([document.body.clientHeight, document.querySelector(".masthead").offsetHeight, ...[...document.querySelectorAll("#manager-nav a")].map(tab => tab.offsetWidth)])';
    const popupQueue = await run(measurements);
    await run('document.querySelector("#settings-tab").click()');
    check("switching views cannot resize the popup or its navigation", await run(measurements), popupQueue);
  } finally {
    await client.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: result.identifier });
    await client.send("Emulation.clearDeviceMetricsOverride");
  }
}

async function verifyIssue16(client) {
  await client.send("Emulation.setTimezoneOverride", { timezoneId: "Asia/Tehran" });
  await client.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/test/issue16.html` });
  for (const pass of ["first navigation", "reload"]) {
    let actual;
    for (let attempt = 0; attempt < 30; attempt++) {
      actual = await evaluate(client, `(() => {
        if (location.pathname !== "/test/issue16.html" || document.readyState !== "complete") return null;
        const layout = document.querySelector("#layout"), utility = document.querySelector("#utility-footer");
        const color = node => node && getComputedStyle(node).backgroundColor;
        const article = document.querySelector("main article");
        return { content: Boolean(layout && article?.getClientRects().length && utility?.getClientRects().length),
          erasedOnlyAsideAds: !document.querySelector("#ad-shell,#sponsor-shell,#ad-rule,#sponsor-rule"),
          palette: Boolean(layout && utility && color(layout) !== "rgb(38, 38, 38)" && color(utility) !== "rgb(66, 66, 66)"),
          urls: [...document.querySelectorAll("article dd a[data-key]")].map(a => a.href).join(","),
          localized: [...document.querySelectorAll("[data-soft98-pro-download-actions] button")].some(button => /کپی/.test(button.textContent))
        };
      })()`).catch(() => null);
      if (actual?.localized && actual?.erasedOnlyAsideAds && actual?.palette && actual?.content) break;
      await delay(100);
    }
    const expected = { content: true, erasedOnlyAsideAds: true, palette: true,
      urls: "https://files.example.test/setup.exe,https://files.example.test/portable.zip", localized: true };
    assertEqual("issue 16", pass, JSON.stringify(actual), JSON.stringify(expected));
    if (pass === "first navigation") {
      const preserved = await evaluate(client, `(async () => {
        const frame = document.getElementById("layout");
        const replacement = document.createElement("div");
        replacement.textContent = "Replacement content";
        frame.replaceChildren(replacement);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return frame.firstElementChild === replacement && !frame.querySelector("article");
      })()`);
      assertEqual("issue 16", "legitimate replacement content is preserved", preserved, true);
      await client.send("Page.reload");
    } else {
      const restored = await evaluate(client, `(async () => {
        const frame = document.getElementById("layout");
        const article = frame.querySelector("article");
        const notice = document.createElement("p");
        notice.setAttribute("role", "alert");
        notice.textContent = "Please disable ad-block";
        frame.replaceChildren(notice);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        let same = frame.querySelector("article") === article;
        for (let attempt = 0; attempt < 2; attempt++) {
          frame.replaceChildren();
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          same &&= frame.querySelector("article") === article;
        }
        frame.replaceChildren();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return same && frame.childElementCount === 0;
      })()`);
      assertEqual("issue 16", "article recovery is bounded after repeated clears", restored, true);
    }
  }
}

async function verifyIssue16EarlyReload(client) {
  const run = (expression) => evaluate(client, expression);
  const fixture = `http://127.0.0.1:${PORT}/test/issue16.html`;
  const until = async (expression) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await run(expression).catch(() => false)) return;
      await delay(100);
    }
    throw new Error("Warm reload timed out: " + expression);
  };
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: false });
  try {
    for (const scope of ["main", "body", "replacement"]) {
      await client.send("Page.navigate", { url: fixture + "?startup=" + scope });
      await until(`location.search === "?startup=${scope}" && document.readyState === "complete" &&
        document.querySelector('a[href="https://files.example.test/setup.exe"]')`);
      await client.send("Page.reload", { ignoreCache: false });
      await until('document.readyState === "complete" && document.documentElement.dataset.issue16Startup === "loading"');
      await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      if (scope === "replacement") {
        assertEqual("issue 16", "startup preserves genuine replacement content", await run(
          'document.querySelector("#startup-replacement")?.textContent === "New article content" && !window.issue16Original.isConnected'), true);
      } else {
        assertEqual("issue 16", "early " + scope + " clear restores the same article", await run(
          'document.querySelector("main article") === window.issue16Original && window.issue16Original.getClientRects().length > 0'), true);
        await until('document.querySelector(\'a[href="https://files.example.test/setup.exe"]\')');
      }
    }
  } finally {
    await client.send("Network.disable");
  }
}

async function verifyAppearanceBridge(client) {
  const runtime = fs.readFileSync(path.join(ROOT, "dist", "chromium", "assets", "runtime.page.js"), "utf8");
  const { identifier } = await client.send("Page.addScriptToEvaluateOnNewDocument", { source: runtime });
  const check = (label, value) => assertEqual("appearance bridge", label, value, true);
  let previous;
  const send = settings => evaluate(client, `(() => {
    document.documentElement.setAttribute("data-soft98-pro-settings", encodeURIComponent(JSON.stringify(${JSON.stringify(settings)})));
    document.dispatchEvent(new Event("soft98-pro:settings-received"));
  })()`);
  try {
    await client.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/test/appearance.html` });
    for (let attempt = 0; attempt < 35; attempt++) {
      if (await evaluate(client, 'location.pathname === "/test/appearance.html" && !!document.getElementById("soft98-pro-control")').catch(() => false)) break;
      if (attempt === 34) throw new Error("The extension appearance fixture did not load");
      await delay(80);
    }
    previous = await evaluate(client, 'localStorage.getItem("soft98-ad-blocker.settings")');
    await send({ darkDesign: false, accentColor: "orchid", controlCenter: false });
    check("settings cross the bridge without inline scripts", await evaluate(client, `(() => {
      const root = document.documentElement;
      const center = document.getElementById("soft98-pro-control");
      return root.classList.contains("soft98-pro-light") && center.hidden &&
        getComputedStyle(root).getPropertyValue("--s98p-accent").trim() === "#783db1" &&
        getComputedStyle(root).getPropertyValue("--s98p-link").trim() === "#1e5a8a" &&
        getComputedStyle(center).getPropertyValue("--c-accent").trim() === "#783db1";
    })()`));
    await send({ darkDesign: false, rgbMode: true, accentColor: "orchid", controlCenter: true });
    check("RGB uses its own accent and restores the launcher", await evaluate(client, `
      document.documentElement.classList.contains("soft98-pro-rgb") &&
      !document.getElementById("soft98-pro-control").hidden &&
      document.getElementById("soft98-pro-control").dataset.theme === "rgb"`));
    await send({ darkDesign: false, controlCenter: true });
    check("the default palette and light theme can be restored", await evaluate(client, `
      !document.documentElement.hasAttribute("data-s98p-accent") &&
      document.documentElement.classList.contains("soft98-pro-light")`));
    check("light surfaces stay neutral while semantic colors remain distinct and readable", await evaluate(client, `(() => {
      const style = getComputedStyle(document.documentElement);
      const value = name => style.getPropertyValue("--s98p-day-" + name).trim();
      const rgb = hex => hex.slice(1).match(/../g).map(component => parseInt(component, 16));
      const luminance = hex => rgb(hex).map(component => component / 255).map(channel =>
        channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
        .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
      const neutral = ["canvas", "paper", "field", "raised", "hover", "line", "edge"].every(name => {
        const channels = rgb(value(name));
        return Math.max(...channels) - Math.min(...channels) <= 12;
      });
      const roles = ["action", "info", "success", "warning", "danger", "related"];
      const contrast = roles.every(role => (luminance(value(role + "-wash")) + .05) / (luminance(value(role)) + .05) >= 4.5);
      const center = getComputedStyle(document.getElementById("soft98-pro-control"));
      return neutral && contrast && new Set(roles.map(value)).size === roles.length &&
        center.getPropertyValue("--c-bg").trim() === value("field");
    })()`));
  } finally {
    if (previous !== undefined) await evaluate(client, previous === null ? 'localStorage.removeItem("soft98-ad-blocker.settings")' :
      `localStorage.setItem("soft98-ad-blocker.settings", ${JSON.stringify(previous)})`);
    await client.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  }
}

async function verifyPostArtwork(client) {
  const run = (expression) => evaluate(client, expression);
  const url = `http://127.0.0.1:${PORT}/test/post-artwork.html`;
  const check = (label, value, expected) => assertEqual("post artwork", label, JSON.stringify(value), JSON.stringify(expected));
  const until = async (expression) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await run(expression).catch(() => false)) return;
      await delay(70);
    }
    throw new Error(`Artwork did not settle: ${expression}`);
  };
  const dialog = 'document.querySelector("dialog[aria-labelledby=soft98-pro-utility-title]")';
  const trigger = 'document.querySelector("nav [aria-haspopup=dialog]")';
  const artwork = '[data-s98p-post-art] img';
  const cached = 'JSON.parse(localStorage.getItem("soft98-pro.post-artwork.v1") || "{}")';
  const settingsKey = "soft98-ad-blocker.settings";
  const previousSettings = await run(`localStorage.getItem(${JSON.stringify(settingsKey)})`);
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 820, deviceScaleFactor: 1, mobile: false });
  try {
    await client.send("Page.navigate", { url });
    await until(`${dialog} && document.querySelector('#duplicate ${artwork}') && Object.keys(${cached}).length === 4`);
    check("post fetches omit credentials, query and fragments, and stay same-origin", await run(`artworkRequests.every(row =>
      row.credentials === "omit" && row.mode === "same-origin" && !row.search)`), true);
    check("closed dialog makes no additional HTML requests", await run("artworkRequests.length"), 4);
    check("no wrong artwork on bad, non-post or missing images", await run(`!document.querySelector('#invalid img,#collection img,#broken img')`), true);
    check("parsing does not execute scripts or load unrelated embedded images", await run(`!window.artworkScriptRan &&
      !performance.getEntriesByType("resource").some(entry => entry.name.endsWith("/fixture-unwanted-ad.png"))`), true);
    check("link and inline label markup survive", await run(`document.querySelector("#duplicate").getAttribute("href").endsWith("?track=1#details") &&
      document.querySelector("#duplicate bdi").textContent === "Sample A"`), true);
    const open = await run(`(() => {
      ${trigger}.click();
      const sheet = ${dialog};
      const shade = getComputedStyle(sheet, "::backdrop");
      const close = sheet.querySelector("[data-s98p-dialog-close]");
      return { open: sheet.open, opacity: shade.opacity, blur: shade.backdropFilter, transform: shade.transform,
        animation: shade.animationName, icon: !!close.querySelector("svg"), closeHeight: close.getBoundingClientRect().height };
    })()`);
    check("the backdrop is already blurred and only the tint animates on the opening frame",
      { ...open, closeHeight: open.closeHeight >= 36 }, { open: true, opacity: "1", blur: "blur(7px)", transform: "none",
        animation: "s98p-dialog-tint-in", icon: true, closeHeight: true });
    await until(`document.querySelectorAll('#primary-tools ${artwork}').length === 2`);
    check("a same-origin redirect resolves its new post artwork", await run(`[...document.querySelectorAll('#primary-tools ${artwork}')].some(img => img.src.endsWith("?id=42"))`), true);
    check("the dialog reuses the related-post entry and categories do not fetch", await run("artworkRequests.length"), 6);
    check("a throttled post retries after the server's delay", await run(`artworkRequests.filter(row => row.path.endsWith("42-dialog.html")).map(row => row.at)
      .reduce((a,b) => b-a) >= 1000`), true);
    await run(`${dialog}.querySelector("footer button").click()`);
    await until(`document.querySelectorAll('#extra-tools ${artwork}').length === 2`);
    check("expanded entries fetch when shown", await run("artworkRequests.length"), 7);
    await run(`${dialog}.querySelector("[data-s98p-dialog-close]").click()`);
    await until(`!${dialog}.open && !location.hash`);
    check("close restores focus to the opener", await run(`document.activeElement === ${trigger}`), true);
    await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 760, deviceScaleFactor: 1, mobile: true });
    await client.send("Page.navigate", { url: url + "?light" });
    await until(`${dialog} && document.querySelector('#duplicate ${artwork}')`);
    await run(`${trigger}.click()`);
    await until(`document.querySelectorAll('#primary-tools ${artwork}').length === 2`);
    check("reload uses the persistent cache and light dialog fits on mobile", await run(`artworkRequests.length === 0 &&
      document.documentElement.classList.contains("soft98-pro-light") && ${dialog}.getBoundingClientRect().width < innerWidth`), true);
  } finally {
    await run(previousSettings === null ? `localStorage.removeItem(${JSON.stringify(settingsKey)})`
      : `localStorage.setItem(${JSON.stringify(settingsKey)}, ${JSON.stringify(previousSettings)})`);
    await client.send("Emulation.clearDeviceMetricsOverride");
  }
}

async function verifyThemeRestore(client) {
  const run = expression => evaluate(client, expression);
  const fixture = `http://127.0.0.1:${PORT}/test/theme-restore.html`;
  const until = async (expression) => {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await run(expression).catch(() => false)) return;
      await delay(100);
    }
    throw new Error("Theme restoration did not settle: " + expression);
  };
  const check = (label, value, expected) => assertEqual("theme restoration", label, value, expected);
  const active = 'document.documentElement.classList.contains("soft98-pro-theme")';
  const ready = 'document.documentElement.hasAttribute("data-soft98-runtime-ready")';
  const stock = `(() => {
    const tools = document.getElementById("stock-tools");
    const link = document.querySelector("#downloads dd > a");
    const masthead = document.getElementById("stock-masthead");
    return tools.children.length === 2 && getComputedStyle(tools).display === "flex" &&
      !document.querySelector("[data-soft98-pro-download-row],[data-s98p-download-toggle],[data-s98p-category-icon],[data-soft98-brand-variant]") &&
      document.getElementById("stock-logo").getAttribute("alt") === "Soft98 logo" &&
      masthead.style.backgroundImage.includes("data:image/gif") && getComputedStyle(masthead).backgroundColor === "rgb(70, 117, 145)" &&
      link.href === "https://files.example.test/AnyDesk.zip" && link.textContent === "دانلود 8.1 MiB (رایگان)" &&
      document.getElementById("utility").contains(document.querySelector("#utility .tbdc")) &&
      getComputedStyle(document.querySelector("#utility .tbdc")).display !== "none";
  })()`;
  const toggle = value => run(`(() => {
    Soft98Pro.openPanel();
    const input = document.querySelector('#soft98-pro-control input[name="pro"]');
    input.checked = ${value};
    const before = scrollY;
    input.dispatchEvent(new Event("change", { bubbles:true }));
    return before;
  })()`);
  await client.send("Page.navigate", { url: fixture + "?setup" });
  await until('location.search === "?setup"');
  const settingsKey = "soft98-ad-blocker.settings";
  const original = await run(`localStorage.getItem(${JSON.stringify(settingsKey)})`);
  try {
    for (const [mode, width] of [["userscript", 390], ["extension", 1920]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height: 820, deviceScaleFactor: 1, mobile: false });
      await run(`sessionStorage.removeItem("theme-fixture:${mode}")`);
      const url = fixture + "?mode=" + mode + "#downloads";
      await client.send("Page.navigate", { url });
      await until(`location.href === ${JSON.stringify(url)} && ${active} && document.querySelector("[data-soft98-pro-download-row]") &&
        document.querySelector("dialog[aria-labelledby=soft98-pro-utility-title]") && document.querySelector("#stock-logo[data-soft98-brand-variant]")`);
      const brand = (compact, variant) => `document.querySelector("#${compact ? "stock-logo" : "stock-masthead"}").getAttribute("data-soft98-brand-variant") === "${variant}"`;
      await run('Soft98Pro.configure({pirateLogo:false})');
      await until(`${brand(true,"stockCompactDark")} && ${brand(false,"stockDark")} &&
        getComputedStyle(document.getElementById("stock-masthead")).backgroundColor === "rgba(0, 0, 0, 0)"`);
      const logos = await run(`(() => {
        const navbar = document.getElementById("stock-logo"), masthead = document.getElementById("stock-masthead");
        return { imageBundled: navbar.src.startsWith("data:image/png;base64,"), alt: navbar.alt,
          backgroundBundled: getComputedStyle(masthead).backgroundImage.includes("data:image/png;base64,"),
          backgroundColor: getComputedStyle(masthead).backgroundColor };
      })()`);
      check(mode + " bundles both stock logo formats", logos.imageBundled && logos.backgroundBundled, true);
      check(mode + " preserves the image label", logos.alt, "Soft98 logo");
      check(mode + " clears the masthead matte", logos.backgroundColor, "rgba(0, 0, 0, 0)");
      await run('window.sameDownload = document.querySelector("#downloads dd > a"); window.sameNav = document.getElementById("stock-nav")');
      await run('Soft98Pro.configure({darkDesign:false})');
      await until('document.documentElement.classList.contains("soft98-pro-light")');
      await until(`${brand(true,"stockCompactLight")} && ${brand(false,"stockDark")}`);
      await run('Soft98Pro.configure({pirateLogo:true})');
      await until(`${brand(true,"light")} && ${brand(false,"pirateDark")}`);
      check(mode + " light mode does not reload", await run("fixtureVisit"), 1);
      check(mode + " uses one solid fill across the article title and metadata", await run(`(() => {
        const styles = ["[data-soft98-pro-article-header]","[data-soft98-pro-article-meta]"]
          .map(selector => getComputedStyle(document.querySelector(selector)));
        return styles.every(style => style.backgroundImage === "none" && style.backgroundColor === "rgb(245, 245, 247)");
      })()`), true);
      check(mode + " restores the stock steel-blue backdrop without tinting the white cards", await run(`
        getComputedStyle(document.body).backgroundColor === "rgb(67, 117, 147)" &&
        getComputedStyle(document.querySelector("article")).backgroundColor === "rgb(255, 255, 255)"`), true);
      await until('getComputedStyle(document.querySelector("[data-soft98-pro-footer] .s98p-footer-brand button")).backgroundColor === "rgb(49, 92, 118)"');
      check(mode + " gives the light footer a graphite rule and steel-blue action", await run(`(() => {
        const footer = document.querySelector("[data-soft98-pro-footer]");
        return [getComputedStyle(footer.querySelector(".s98p-footer-frame")).borderTopColor,
          getComputedStyle(footer.querySelector(".s98p-footer-brand button")).backgroundColor].join("|");
      })()`), "rgb(49, 58, 63)|rgb(49, 92, 118)");
      check(mode + " gives alert types distinct, readable colors", await run(`(() => {
        const styles = ["warning","danger","success"].map(kind => getComputedStyle(document.querySelector(".alert-" + kind)));
        const luminance = color => color.match(/[0-9]+/g).slice(0,3).map(Number)
          .map(channel => channel / 255).map(level => level <= .04045 ? level / 12.92 : ((level + .055) / 1.055) ** 2.4)
          .reduce((total, level, index) => total + level * [.2126,.7152,.0722][index], 0);
        const colors = styles.map(style => style.color);
        return colors.join("|") === "rgb(137, 80, 10)|rgb(165, 46, 69)|rgb(10, 107, 70)" &&
          new Set(styles.map(style => style.backgroundColor)).size === 3 &&
          styles.every(style => (luminance(style.backgroundColor) + .05) / (luminance(style.color) + .05) >= 4.5);
      })()`), true);
      await until(`(() => {
        const link = document.querySelector("#downloads dd > a");
        const label = link?.querySelector("[data-soft98-pro-download-title]");
        return label && getComputedStyle(label).color === "rgb(10, 107, 70)";
      })()`);
      check(mode + " retains the download URL", await run('document.querySelector("#downloads dd > a").href'), "https://files.example.test/AnyDesk.zip");
      await run(`document.querySelector('[role=tab][href="#requirements"]').click(); document.getElementById("stock-draft").value = "Keep this draft";`);
      await until('document.querySelector("#requirements").getAttribute("data-soft98-pro-content-pane") === "active"');
      await run('scrollTo({top:420,behavior:"instant"})');
      const scrollBefore = await toggle(false);
      await until(`${ready} && !${active} && Soft98Pro.settings.pro === false`);
      check(mode + " preserves the original live nodes without reloading", await run('fixtureVisit === 1 && window.sameDownload === document.querySelector("#downloads dd > a") && window.sameNav === document.getElementById("stock-nav")'), true);
      check(mode + " restores stock navigation, labels, utilities, and controls", await run(stock), true);
      check(mode + " preserves the article URL and tab fragment", await run("location.href"), url);
      check(mode + " keeps the active tab and unsaved form text", await run('document.getElementById("stock-draft").value === "Keep this draft" && document.querySelector("#requirements").classList.contains("active")'), true);
      const scrollAfter = await run("scrollY");
      check(mode + " preserves the scroll position", scrollAfter, scrollBefore);
      check(mode + " does not turn off ad blocking", await run(`(() => {
        const ad = document.getElementById("kaprila_soft98_ir_related");
        return Soft98Pro.settings.blockAds && (!ad || getComputedStyle(ad).display === "none");
      })()`), true);
      await until('!document.getElementById("mirrored-banner")');
      if (mode === "extension") await until('JSON.parse(sessionStorage.getItem("theme-fixture:extension:saved"))?.pro === false');
      await toggle(true);
      await until(`${active} && document.querySelector("[data-soft98-pro-download-row]")`);
      check(mode + " re-enables the theme without another reload", await run("fixtureVisit"), 1);
      await run('document.querySelector("nav [aria-haspopup=dialog]:has([data-soft98-pro-page-icon=grid])").click()');
      await until('location.hash === "#s98p-dialog=utility"');
      await run('Soft98Pro.configure({pro:false})');
      await until(`${ready} && !${active}`);
      check(mode + " clears the Pro dialog fragment and restores the stock fragment", await run("location.hash"), "#downloads");
      check(mode + " has no stale decorations or reload after toggling again", await run(`fixtureVisit === 1 && (${stock})`), true);
    }
  } finally {
    await run(original === null ? `localStorage.removeItem(${JSON.stringify(settingsKey)})`
      : `localStorage.setItem(${JSON.stringify(settingsKey)}, ${JSON.stringify(original)})`);
    await client.send("Emulation.clearDeviceMetricsOverride");
  }
}

async function verifyRgbMedia(client) {
  const run = expression => evaluate(client, expression);
  const url = `http://127.0.0.1:${PORT}/test/theme-restore.html?mode=userscript`;
  const check = (label, value, expected) => assertEqual("RGB media", label, value, expected);
  let previous;
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 780, deviceScaleFactor: 1, mobile: false });
  try {
    await client.send("Page.navigate", { url });
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await run('location.href === ' + JSON.stringify(url) + ' && !!window.Soft98Pro && !!document.getElementById("soft98-pro-control")').catch(() => false)) break;
      if (attempt === 49) throw new Error("RGB media fixture did not initialize");
      await delay(100);
    }
    previous = await run('localStorage.getItem("soft98-ad-blocker.settings")');
    const rgba = [242, 53, 69, 255];
    const png = new PNG({ width: 1, height: 1 });
    png.data.set(rgba);
    const src = `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
    await run(`(async () => {
      const src = ${JSON.stringify(src)};
      const rgb = 'rgb(${rgba.slice(0,3).join(",")})';
      const article = document.querySelector('main article');
      const media = document.createElement('div');
      media.style.cssText = 'display:flex;gap:6px;align-items:center;height:48px;direction:ltr';
      media.innerHTML = '<a href="#art"><img class="fixture-stock-art" alt="Raster artwork"></a><svg viewBox="0 0 40 40"><rect width="40" height="40"/></svg>' +
        '<canvas width="40" height="40"></canvas><div></div><p>Article text <a href="#info">Information</a></p>';
      article.prepend(media);
      const raster = media.querySelector('img');
      raster.src = src;
      await raster.decode();
      const [,svg,canvas,background,copy] = media.children;
      svg.firstElementChild.setAttribute('fill', rgb);
      canvas.getContext('2d').fillStyle = rgb;
      canvas.getContext('2d').fillRect(0, 0, 40, 40);
      background.style.backgroundImage = 'url(' + src + ')';
      background.style.backgroundSize = 'cover';
      const artwork = [raster,svg,canvas,background];
      artwork.forEach(node => node.style.cssText += ';display:block;width:40px;height:40px;flex:none');
      const intentional = raster.cloneNode();
      intentional.style.filter = 'sepia(.25)';
      media.append(intentional);
      window.rgbMediaProbe = {artwork, copy};
      Soft98Pro.configure({pro:true,darkDesign:true,rgbMode:false});
      media.scrollIntoView({block:'center',behavior:'instant'});
    })()`);
    async function samplePixels(label) {
      const coords = await run(`rgbMediaProbe.artwork.map(node => {
        const rect = node.getBoundingClientRect();
        return [Math.floor(rect.left + rect.width / 2), Math.floor(rect.top + rect.height / 2)];
      })`);
      const { data } = await client.send("Page.captureScreenshot", { format: "png" });
      const pixels = PNG.sync.read(Buffer.from(data, "base64"));
      coords.forEach(([x,y], index) => {
        const offset = (y * pixels.width + x) * 4;
        check(label + " " + ["image","SVG","canvas","background image"][index],
          [...pixels.data.subarray(offset, offset + 4)].join(), rgba.join());
      });
      return coords[0];
    }
    const textColors = () => run('[rgbMediaProbe.copy,rgbMediaProbe.copy.querySelector("a")].map(node => getComputedStyle(node).color).join("|")');
    const darkInk = await textColors();
    await run("Soft98Pro.configure({rgbMode:true})");
    await delay(250);
    const [x,y] = await samplePixels("RGB");
    check("preserves an intentionally authored filter", await run("getComputedStyle(rgbMediaProbe.copy.nextElementSibling).filter"), "sepia(0.25)");
    check("preserves dark-mode content and link color", await textColors(), darkInk);
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    check("raster link receives hover", await run("rgbMediaProbe.artwork[0].parentElement.matches(':hover')"), true);
    await delay(250);
    await samplePixels("RGB on hover");
    const accent = () => run('getComputedStyle(document.querySelector("#soft98-pro-control form"), "::before").backgroundImage');
    const gradient = await accent();
    check("retains a multicolor Control Center gradient", /^linear-gradient\(/.test(gradient) && new Set(gradient.match(/(?:hsl|rgb)\([^)]+\)/g)).size >= 3, true);
    await delay(250);
    check("animates the gradient", await accent() !== gradient, true);
    await run(`Soft98Pro.configure({rgbMode:false});
      const media = rgbMediaProbe.copy.parentElement;
      document.querySelector('[data-soft98-pro-article-meta]').after(media);
      media.style.marginBlock = '80px';
    `);
    await samplePixels("Dark");
    await run("Soft98Pro.configure({pro:false})");
    check("turning off Pro restores the native image filter", await run("getComputedStyle(rgbMediaProbe.artwork[0]).filter"), "saturate(1.2) brightness(0.8)");
  } finally {
    if (previous !== undefined) await run(previous === null ? 'localStorage.removeItem("soft98-ad-blocker.settings")'
      : `localStorage.setItem("soft98-ad-blocker.settings", ${JSON.stringify(previous)})`);
    await client.send("Emulation.clearDeviceMetricsOverride");
  }
}

async function verifyWideLayout(client) {
  const run = (expression) => evaluate(client, expression);
  const until = async (expression) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await run(expression).catch(() => false)) return;
      await delay(70);
    }
    throw new Error(`Layout did not settle: ${expression}`);
  };
  const resize = (width, height) => client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  const check = (label, value, expected) => assertEqual("article layout", label, value, expected);
  const fixture = `http://127.0.0.1:${PORT}/test/wide-layout.html`;
  await resize(1050, 850);
  await client.send("Page.navigate", { url: fixture });
  try {
    await until('document.querySelector("#separator-a")?.dataset.s98pDownloadRule === "show"');
    await until('document.querySelector("#files a[data-key=package]")?.href === "https://files.example.test/tool.zip"');
    check("declared metadata restores an unresolved official link", await run('document.querySelector("#files a[data-key=package]").href'), "https://files.example.test/tool.zip");
    check("already working link keeps its original address", await run('document.querySelector("#files a[data-key=mirror]").href'), "https://files.example.test/mirror.zip");
    check("adjacent duplicate separator hidden", await run('getComputedStyle(document.querySelector("#separator-b")).display'), "none");
    check("trailing separator hidden", await run('getComputedStyle(document.querySelector("#separator-edge")).display'), "none");
    check("separator is not a download row", await run('document.querySelector("#separator-a").hasAttribute("data-soft98-pro-download-entry")'), false);
    check("stock hidden section title remains hidden", await run('getComputedStyle(document.querySelector("#hidden-heading [data-s98p-hidden-download-heading]")).display'), "none");
    const control = 'document.querySelector("[data-s98p-news-toggle]")';
    const hide = 'document.querySelector("[data-s98p-news-hide]")';
    const switcher = 'document.querySelector(\'#soft98-pro-control input[name="showLatest"]\')';
    const panes = '[...document.querySelectorAll("[data-s98p-news-reveal]")]';
    const collapsed = `${control}?.getAttribute("aria-expanded") === "false" && ${panes}.length === 2 && ${panes}.every(pane => pane.inert && pane.getBoundingClientRect().height === 0)`;
    const hidden = 'document.querySelector("[data-s98p-news-group]")?.getBoundingClientRect().height === 0';
    await until(`${control} && ${panes}.length === 2`);
    check("the Tech News header is the only owner of both actions", await run(`
      document.querySelectorAll("[data-s98p-news-toggle]").length === 1 &&
      document.querySelectorAll("[data-s98p-news-hide]").length === 1 &&
      Boolean(${control}.closest("[data-soft98-pro-tech-news]")) &&
      ${control}.getAttribute("aria-controls") === ${panes}.map(pane => pane.id).join(" ")`), true);
    await until(`${panes}.every(pane => pane.getBoundingClientRect().height > 20)`);
    await run(`${control}.click()`);
    check("collapsing takes links in both cards out of the tab order", await run(`${panes}.every(pane => pane.inert)`), true);
    await until(collapsed);
    const reload = async () => {
      const before = await run("performance.timeOrigin");
      await client.send("Page.reload");
      await until(`performance.timeOrigin !== ${before} && !!window.Soft98Pro && ${control}`);
    };
    await reload();
    await until(collapsed);
    check("one collapse state survives reload", await run('localStorage.getItem("soft98-pro.news-collapsed")'), "true");
    await run(`${hide}.focus(); ${hide}.click()`);
    await until(hidden);
    check("closing both cards leaves the restoration toast and returns focus to the launcher", await run(`
      document.activeElement.matches("#soft98-pro-control [data-role=toggle]") &&
      document.querySelector("[data-soft98-pro-copy-toast][data-visible]").textContent.includes("مرکز کنترل")`), true);
    await run('document.querySelector("[data-soft98-pro-copy-toast][data-visible] [data-role=message] a").click()');
    check("the toast opens Appearance at the matching switch", await run(`
      document.activeElement === ${switcher} && !${switcher}.checked &&
      document.querySelector("#soft98-pro-control").dataset.open === "true"`), true);
    await reload();
    await until(hidden);
    await run(`Soft98Pro.openPanel(); document.querySelector('#soft98-pro-control [data-section=experience]').click(); ${switcher}.click()`);
    await until(`!(${hidden}) && (${collapsed})`);
    await run(`document.querySelector("[data-soft98-pro-latest-tabs] [role=tab]").dispatchEvent(new KeyboardEvent("keydown", {key:" ",bubbles:true,cancelable:true}))`);
    await until(`${panes}.every(pane => !pane.inert && pane.getBoundingClientRect().height > 20)`);
    await resize(390, 740);
    await until(`${control}.closest('[data-soft98-pro-latest-header="tabs"]') && ${control}.getClientRects().length > 0`);
    await run(`${control}.click()`);
    await until(collapsed);
    await run(`${control}.click()`);
    await resize(1440, 900);
    await until('document.querySelector("[data-s98p-related-rail] [data-soft98-pro-related]")');
    check("downloads stay inline at normal desktop ratios", await run('!document.querySelector("[data-s98p-download-rail]")'), true);
    await run('window.originalDownloadList = document.querySelector("#files dl")');
    await resize(2560, 1080);
    await until('document.querySelector("[data-s98p-download-rail] [data-soft98-pro-download-row]")');
    check("related left, article center, downloads right in RTL", await run(`(() => {
      const left = document.querySelector("[data-s98p-related-rail]").getBoundingClientRect();
      const main = document.querySelector("main").getBoundingClientRect();
      const right = document.querySelector("[data-s98p-download-rail]").getBoundingClientRect();
      return left.right <= main.left && main.right <= right.left && document.documentElement.scrollWidth <= innerWidth;
    })()`), true);
    check("layout wrappers are transparent without removing the card surfaces", await run(`(() => {
      const chrome=["#article-frame","#workspace","[data-soft98-pro-column=primary]","[data-soft98-pro-column=secondary]","[data-s98p-related-rail]"];
      const cards=["article","[data-soft98-pro-related]","[data-s98p-download-rail]"];
      return chrome.every(selector=>{
        const style=getComputedStyle(document.querySelector(selector));
        return style.backgroundColor==="rgba(0, 0, 0, 0)" && style.backgroundImage==="none" && style.boxShadow==="none";
      }) && cards.every(selector=>{
        const style=getComputedStyle(document.querySelector(selector));
        return style.backgroundColor!=="rgba(0, 0, 0, 0)" || style.backgroundImage!=="none";
      });
    })()`), true);
    check("the original native download list stays in its pane", await run('window.originalDownloadList === document.querySelector("#files dl") && !!window.originalDownloadList.querySelector("a[data-key=package]")'), true);
    check("both boxes use the same original destination", await run(`(() => {
      const link = document.querySelector("#files a[data-key=package]");
      const copy = document.querySelector("[data-s98p-download-rail] [data-soft98-pro-download-row]");
      return link !== copy && link.href === copy.href && !copy.hasAttribute("data-key");
    })()`), true);
    const infoToggle = (selector) => `[...document.querySelectorAll(${JSON.stringify(selector + " [data-s98p-download-heading-label]")})]
      .find(label=>label.textContent.trim()==="اطلاعات بیشتر").parentElement.querySelector("[data-s98p-download-toggle]")`;
    const mainInfo = infoToggle("#files");
    const sideInfo = infoToggle("[data-s98p-download-rail]");
    const infoStates = `[${mainInfo}.getAttribute("aria-expanded"),${sideInfo}.getAttribute("aria-expanded")].join(",")`;
    check("More Information starts open only in the main box", await run(infoStates), "true,false");
    check("the sidebar scrollbar follows the Pro palette without changing the page scrollbar", await run(`(() => {
      const rail = getComputedStyle(document.querySelector("[data-s98p-download-rail]"));
      return rail.scrollbarWidth === "thin" && rail.scrollbarColor !== "auto" &&
        getComputedStyle(document.documentElement).scrollbarColor === "auto";
    })()`), true);
    check("related posts and downloads share their header sizing", await run(`(() => {
      const left = document.querySelector("[data-s98p-related-rail] header").getBoundingClientRect();
      const right = document.querySelector("[data-s98p-download-rail] header").getBoundingClientRect();
      return left.top === right.top && left.height === right.height;
    })()`), true);
    check("old info icon is hidden and partial stars are preserved in both boxes", await run(`(() => {
      const glyph = document.querySelector('#files [data-soft98-pro-icon-host="info"]');
      const stars = [...document.querySelectorAll("[data-s98p-rating-display]")];
      return getComputedStyle(glyph, "::before").content === "none" && stars.length === 2 &&
        stars.every(node => node.querySelectorAll("[data-s98p-stars] > span").length === 5 &&
          Math.round(parseFloat(node.querySelector("[data-s98p-stars] > span:last-child").style.getPropertyValue("--s98p-star-fill"))) === 60);
    })()`), true);
    await run(`(() => {
      const spacer=document.createElement("div");
      spacer.style.height=innerHeight+"px";
      document.querySelector("article").prepend(spacer);
      const tail=spacer.cloneNode();
      tail.style.height=2*innerHeight+"px";
      document.querySelector("#article-frame").after(tail);
      window.downloadSourceAt=top=>{
        const source=document.querySelector("#files dl");
        scrollBy({top:source.getBoundingClientRect().top-top,behavior:"instant"});
      };
    })()`);
    const rail = 'document.querySelector("[data-s98p-download-rail]")';
    const originalToggle = 'document.querySelector("#files [data-s98p-download-toggle]")';
    const railToggle = `${rail}.querySelector("[data-s98p-download-toggle]")`;
    const opacity = `Number(getComputedStyle(${rail}).opacity)`;
    const pointerEvents = `getComputedStyle(${rail}).pointerEvents`;
    const stickyBottom = 'document.querySelector("[data-s98p-topbar-shell]")?.getBoundingClientRect().bottom || 0';
    const listHeight = 'document.querySelector("#files dl").getBoundingClientRect().height';
    const lead = `Math.min(360,(innerHeight-(${stickyBottom}))/3)`;
    const far = 'downloadSourceAt(innerHeight+400)';
    const halfVisible = `downloadSourceAt(innerHeight-(${listHeight})/2)`;
    await run(far);
    await until(`${opacity}===1 && !${rail}.inert`);
    await run(`${sideInfo}.closest("dt").querySelector("[data-s98p-download-heading-label]").click()`);
    check("expanding More Information from the sidebar links both copies", await run(infoStates), "true,true");
    await run(`${mainInfo}.click()`);
    check("the main box then collapses both copies", await run(infoStates), "false,false");
    check("the main box's More Information state is saved", await run(`
      JSON.parse(localStorage.getItem("soft98-pro.download-sections")).some(([key,value])=>key.includes("اطلاعاتبیشتر") && value===true)`), true);
    await run(`${mainInfo}.click()`);
    await until('!document.querySelector("[data-s98p-download-row-motion]")');
    await run(`downloadSourceAt(innerHeight+(${lead})/2)`);
    await until(`Math.abs(${opacity}-.475)<.02 && !${rail}.inert`);
    check("the sidebar fades early but stays clickable on approach", await run(pointerEvents), "auto");
    await run('downloadSourceAt(innerHeight-2)');
    await until(`Math.abs(${opacity}-.3)<.015 && ${rail}.inert`);
    check("the final 30% cannot take pointer events", await run(pointerEvents), "none");
    await run(halfVisible);
    await until(`Math.abs(${opacity}-.15)<.015 && ${rail}.inert`);
    check("rail opacity follows scroll position without a timed transition", await run(`getComputedStyle(${rail}).transitionProperty`), "none");
    await run(far);
    await until(`${opacity}===1 && !${rail}.inert`);
    await run(`${railToggle}.focus({preventScroll:true}); ${halfVisible}`);
    await until(`Math.abs(${opacity}-.15)<.015 && ${rail}.inert`);
    check("sidebar focus hands off when the final fade starts", await run(`document.activeElement===${originalToggle}`), true);
    await run(`downloadSourceAt(innerHeight/2-(${listHeight})/2)`);
    await until(`${opacity}===0 && ${rail}.inert`);
    check("fully faded content is hidden", await run(`getComputedStyle(${rail}).visibility`), "hidden");
    const past = `downloadSourceAt((${stickyBottom})-(${listHeight})-(${lead})/2)`;
    await run(`downloadSourceAt((${stickyBottom})-(${listHeight})+6)`);
    await delay(70);
    check("sidebar stays hidden while the original leaves the top of the viewport", await run(`${opacity}===0 && ${rail}.inert`), true);
    await run(past);
    await delay(70);
    check("sidebar does not reappear below the original", await run(`${opacity}===0 && ${rail}.inert`), true);
    await run(halfVisible);
    await until(`Math.abs(${opacity}-.15)<.015 && ${rail}.inert`);
    await run(past);
    await until(`${opacity}===0 && ${rail}.inert`);
    await run('Soft98Pro.configure({downloadRailReappearsAfterSource:true},{sync:false})');
    await until(`Math.abs(${opacity}-.475)<.02 && !${rail}.inert`);
    check("the code setting restores the two-way fade", await run(pointerEvents), "auto");
    await run('Soft98Pro.configure({downloadRailReappearsAfterSource:false},{sync:false})');
    await until(`${opacity}===0 && ${rail}.inert`);
    await run(far);
    await until(`${opacity}===1 && !${rail}.inert`);
    await run(`${rail}.querySelector("[data-s98p-download-copy-all]").focus({preventScroll:true});
      downloadSourceAt(innerHeight/2 - document.querySelector("#files dl").getBoundingClientRect().height/2)`);
    await until(`${opacity}===0 && ${rail}.inert`);
    check("focused sidebar Copy All hands off to the original Copy All", await run(
      'document.activeElement === document.querySelector("#files [data-s98p-download-copy-all]")'), true);
    await run(far);
    await until(`${opacity}===1 && !${rail}.inert`);
    await run(`${railToggle}.click()`);
    check("the sidebar toggle updates both copies", await run(`[${railToggle},${originalToggle}].every(button=>button.getAttribute("aria-expanded")==="false")`), true);
    await until('document.querySelector("#files dd:first-of-type").hasAttribute("data-soft98-pro-download-collapsed")');
    await run(`${originalToggle}.click()`);
    check("the original toggle updates the sidebar", await run(`[${railToggle},${originalToggle}].every(button=>button.getAttribute("aria-expanded")==="true")`), true);
    await until('!document.querySelector("[data-s98p-download-row-motion]")');
    const tipButton = await run(`(() => {
      const button = document.querySelector("[data-s98p-download-rail] [data-soft98-pro-download-actions] button");
      button.scrollIntoView({block:"center"});
      const box = button.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    })()`);
    await delay(60);
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...tipButton });
    await until('document.querySelector("#soft98-pro-download-tooltip[data-visible]")?.textContent === document.querySelector("[data-s98p-download-rail] [data-soft98-pro-download-actions] button")?.dataset.s98pTooltip');
    check("hover uses the custom tooltip instead of a native title", await run(`(() => {
      const button = document.querySelector("[data-s98p-download-rail] [data-soft98-pro-download-actions] button");
      const tip = document.querySelector('[role="tooltip"][data-visible]');
      return !button.title && (button.getAttribute("aria-label") === tip.textContent || button.getAttribute("aria-describedby") === tip.id) &&
        tip.textContent === button.dataset.s98pTooltip;
    })()`), true);
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
    await run('document.querySelector("#requirements-tab").click()');
    await until('document.querySelector("#requirements").dataset.soft98ProContentPane === "active"');
    await until(`${opacity}===1 && !${rail}.inert`);
    await resize(740, 880);
    await until('document.querySelector("#files dl") && document.querySelector("main [data-soft98-pro-related]")');
    check("only the mirror is removed below its breakpoint", await run('!document.querySelector("[data-s98p-download-rail]") && window.originalDownloadList === document.querySelector("#files dl")'), true);
    check("phone grid is a single track", await run('getComputedStyle(document.querySelector("#workspace")).gridTemplateColumns.trim().split(" ").length'), 1);
    await run('document.querySelector("#files-tab").click(); document.querySelector("#open-legacy").click()');
    await until('document.querySelector("#legacy footer").hasAttribute("data-s98p-dialog-footer")');
    check("legacy modal shell does not scale its shade", await run('getComputedStyle(document.querySelector("#legacy")).transform'), "none");
    check("modal footer uses the Pro palette", await run('getComputedStyle(document.querySelector("#legacy footer")).backgroundColor !== "rgb(39, 39, 39)"'), true);
    check("the legacy backdrop animates only its tint", await run(`(() => {
      const shade = getComputedStyle(document.querySelector("#legacy"), "::before");
      return [shade.animationName, shade.opacity, shade.backdropFilter].join("|");
    })()`), "s98p-dialog-tint-in|1|blur(7px)");
    await run('document.querySelector("#legacy").setAttribute("aria-hidden","true"); document.body.classList.add("night-mode"); Soft98Pro.scan()');
    await until('document.querySelector("#unlabelled-quote").dataset.soft98ProCallout === "quote"');
    const callouts = `(() => {
      const selectors = ["#plain-quote", "#danger-quote", "#secondary-alert", "#unlabelled-quote", "#unlabelled-faq"];
      const pixels = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      const contrastOf = color => {
        pixels.fillStyle = color;
        pixels.fillRect(0, 0, 1, 1);
        const channels = [...pixels.getImageData(0, 0, 1, 1).data.slice(0, 3)].map(v => v / 255);
        return channels.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
          .reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
      };
      return selectors.map(selector => {
        const node = document.querySelector(selector), style = getComputedStyle(node), mark = getComputedStyle(node, "::after");
        const ink = contrastOf(style.color), surface = contrastOf(style.backgroundColor);
        const head = contrastOf(getComputedStyle(node.querySelector("h3") || node).color);
        const icon = parseFloat(mark[style.direction === "rtl" ? "right" : "left"]);
        return { type: node.dataset.soft98ProCallout, bg:style.backgroundColor, icon:mark.maskImage, image:style.backgroundImage,
          visible:node.getBoundingClientRect().right <= innerWidth,
          placed: Number.isFinite(icon) && icon > 0 && parseFloat(style.paddingInlineStart) >= icon + parseFloat(mark.width),
          readable: (Math.max(ink,surface)+.05)/(Math.min(ink,surface)+.05) >= 4.5 &&
            (Math.max(head,surface)+.05)/(Math.min(head,surface)+.05) >= 4.5
        };
      });
    })()`;
    const darkCallouts = await run(callouts);
    check("known, semantic, and recolored aliases are distinguished", darkCallouts.map(item => item.type).join(","), "quote,danger,notice,quote,notice");
    check("dark callouts do not retain the legacy gradient and have three distinct icon treatments", darkCallouts.every(item => item.image === "none") &&
      darkCallouts.slice(0, 3).every(item => item.icon.startsWith("url(")) && new Set(darkCallouts.slice(0, 3).map(item => item.icon)).size === 3, true);
    check("dark callouts are readable with the glyph on the correct edge", darkCallouts.every(item => item.readable && item.placed), true);
    const faqDirections = `[...document.querySelectorAll("#unlabelled-faq details")].map(detail => {
      const svg = detail.querySelector("summary svg"), m = svg.getScreenCTM();
      const tip = new DOMPoint(9, 12).matrixTransform(m);
      const base = new DOMPoint(15, 12).matrixTransform(m);
      return Math.abs(tip.y - base.y) > Math.abs(tip.x - base.x) ? (tip.y > base.y ? "down" : "up") :
        (tip.x > base.x ? "right" : "left");
    }).join(",")`;
    check("closed FAQ chevrons point inward in both directions", await run(faqDirections), "left,right");
    await run('document.querySelectorAll("#unlabelled-faq summary").forEach(summary => summary.click())');
    await until(`(${faqDirections}) === "down,down"`);
    const faqChecks = `[...document.querySelectorAll("#unlabelled-faq details p")].every(p => {
      const before = getComputedStyle(p,"::before");
      const chevron = p.closest("details").querySelector("[data-soft98-pro-page-icon]");
      return before.content === '""' && before.maskImage.startsWith("url(") &&
        before.backgroundColor === getComputedStyle(chevron).color &&
        getComputedStyle(p).paddingInlineStart !== "0px";
    })`;
    check("FAQ answer check icon matches the Pro accent", await run(faqChecks), true);
    await resize(390, 770);
    await run("Soft98Pro.configure({darkDesign:false})");
    await until('document.documentElement.classList.contains("soft98-pro-light")');
    const lightCallouts = await run(callouts);
    check("light mobile makes a different palette choice without clipping", lightCallouts.every((item, i) =>
      item.bg !== darkCallouts[i].bg && item.visible && item.placed && item.readable), true);
    check("FAQ check stays matched to the light accent", await run(faqChecks), true);
    await run('Soft98Pro.configure({pro:false}); document.body.classList.add("night-mode")');
    check("turning Pro off restores the stock quote styling", await run('!document.querySelector("[data-soft98-pro-callout]") && getComputedStyle(document.querySelector("#plain-quote")).backgroundImage.includes("rgb(39, 39, 39)")'), true);
    await run('Soft98Pro.configure({pro:true,darkDesign:true,rgbMode:false})');
  } finally {
    await client.send("Emulation.clearDeviceMetricsOverride");
  }
}

async function verifyTopbar(client) {
  const check = (label, actual, expected) => assertEqual("sticky header", label, actual, expected);
  const run = (expression) => evaluate(client, expression);
  const resize = (width, height) => client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  const until = async (expression) => {
    for (let attempt = 0; attempt < 35; attempt++) {
      if (await run(expression).catch(() => false)) return;
      await delay(75);
    }
    throw new Error("Sticky header did not settle: " + expression);
  };
  await resize(1600, 900);
  await client.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/test/topbar.html` });
  try {
    for (let i = 0; i < 40; i++) {
      if (await run('Boolean(document.querySelector("[data-s98p-topbar-shell]"))').catch(() => false)) break;
      if (i === 39) throw new Error("Test header was not styled");
      await delay(75);
    }
    const brand = 'document.querySelector("[data-s98p-topbar-brand]")';
    await resize(1240, 850);
    await until(`${brand} && ${brand}.getBoundingClientRect().width===0`);
    check("categories use the hidden logo space without wrapping at scroll zero", await run(`(() => {
      const items=[...document.querySelectorAll("[data-s98p-topbar-categories] > li > :is(a,button)")].filter(node=>node.getClientRects().length);
      const nav=document.querySelector("nav").getBoundingClientRect();
      const first=items[0]?.getBoundingClientRect();
      const actions=document.querySelector("#actions").getBoundingClientRect();
      return scrollY===0 && items.length===7 && nav.right-first.right<=10 &&
        items.every(node=>{
          const box=node.getBoundingClientRect();
          return Math.abs(first.top-box.top)<1 && box.left>=actions.right;
        });
    })()`), true);
    await run("scrollTo({top:600,behavior:'instant'})");
    await until(`${brand}.getBoundingClientRect().width===96 && getComputedStyle(${brand}).opacity==="1"`);
    await run("scrollTo({top:0,behavior:'instant'})");
    await until(`${brand}.getBoundingClientRect().width===0`);
    check("the brand releases its slot again after scrolling back to the top", await run("scrollY"), 0);
    await run(`${brand}.style.setProperty("opacity","1","important")`);
    await until(`${brand}.getBoundingClientRect().width===96 && getComputedStyle(${brand}).opacity==="1"`);
    await run(`${brand}.style.removeProperty("opacity"); scrollTo({top:600,behavior:'instant'})`);
    await resize(1600, 900);
    check("shell stays fixed at the top", await run('document.querySelector("[data-s98p-topbar-shell]").getBoundingClientRect().top'), 0);
    check("shell has no top border", await run('getComputedStyle(document.querySelector("[data-s98p-topbar-shell]")).borderTopWidth'), "0px");
    check("shell uses the established dark palette without tinting the page underneath", await run(`(() => {
      const style = getComputedStyle(document.querySelector("[data-s98p-topbar-shell]"));
      return style.backgroundImage.startsWith("linear-gradient(165deg,") &&
        style.getPropertyValue("--s98p-topbar-base").trim() === "#0a1116" && style.backdropFilter === "none";
    })()`), true);
    check("inner navigation has no independent background or shadow", await run(`(() => {
      const style = getComputedStyle(document.querySelector("nav"));
      return style.backgroundImage === "none" && style.backgroundColor === "rgba(0, 0, 0, 0)" && style.boxShadow === "none";
    })()`), true);
    check("real dropdown is still styled", await run('document.querySelector("[role=menu]").getAttribute("data-soft98-pro-menu")'), "true");
    check("plain and dropdown labels share the same baseline", await run(`(() => {
      const center = (selector) => {
        const range = document.createRange();
        range.selectNodeContents([...document.querySelector(selector).childNodes].find(node => node.nodeType === 3 && node.textContent.trim()));
        const box = range.getBoundingClientRect();
        return (box.top + box.bottom) / 2;
      };
      return Math.abs(center(".desktop-link") - center(".desktop-dropdown")) < 2;
    })()`), true);
    const chevronPosition = (selector) => run(`(() => {
      const trigger = document.querySelector(${JSON.stringify(selector)});
      const icon = trigger.querySelector("[data-s98p-topbar-chevron][aria-hidden=true] svg");
      if (!icon) return false;
      const button = trigger.getBoundingClientRect();
      const glyph = icon.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents([...trigger.childNodes].find(node => node.nodeType === 3 && node.textContent.trim()));
      const text = range.getBoundingClientRect();
      return glyph.width === 15 && Math.abs(glyph.top + glyph.bottom - button.top - button.bottom) < 2 &&
        (getComputedStyle(trigger).direction === "rtl" ? glyph.right <= text.left : glyph.left >= text.right) &&
        getComputedStyle(trigger, "::after").content === "none";
    })()`);
    check("desktop chevron is inline and replaces the stock pseudo-element", await chevronPosition(".desktop-dropdown"), true);
    check("category icons follow the route or normalized label", await run(`(() => {
      const find = (selector) => document.querySelector(selector)
        .querySelector('[data-s98p-category-icon][aria-hidden="true"] svg')?.parentElement.dataset.s98pCategoryIcon;
      return [find(".desktop-link"),find(".desktop-dropdown"),find('a[href="/mobile"]'),find('a[href="/help"]')].join(",");
    })()`), "apps,desktop,phone,support");
    check("topbar dropdown shares the header palette, without an edge stripe", await run(`(() => {
      const shell = getComputedStyle(document.querySelector("[data-s98p-topbar-shell]"));
      const menu = getComputedStyle(document.querySelector("[role=menu]"));
      return menu.backgroundImage === shell.backgroundImage && menu.borderTopWidth === menu.borderBottomWidth;
    })()`), true);
    check("desktop preserves the hidden mobile counterpart", await run('getComputedStyle(document.querySelector(".compact-link")).display'), "none");
    await resize(992, 780);
    check("mid-width desktop navigation does not run into the actions", await run(`(() => {
      const actions = document.querySelector("#actions").getBoundingClientRect();
      const nav = document.querySelector("nav").getBoundingClientRect();
      return [...document.querySelectorAll("#category-bar > ul > li > :is(a,button)")]
        .filter((node) => node.getClientRects().length)
        .every((node) => {
          const box = node.getBoundingClientRect();
          return box.left >= actions.right && box.top >= nav.top && box.bottom <= nav.bottom;
        });
    })()`), true);
    await resize(375, 780);
    await run('document.querySelector("[data-s98p-topbar-toggle]").click(); window.Soft98Pro.scan()');
    await delay(200);
    check("drawer is not styled as a megamenu", await run('document.querySelector("#category-bar").hasAttribute("data-soft98-pro-menu")'), false);
    check("compact chevron is inline even when the menu is expanded", await chevronPosition(".compact-dropdown"), true);
    const openControls = `[...document.querySelectorAll("[data-s98p-topbar-toggle],.compact-dropdown")].every(node => {
      const style = getComputedStyle(node);
      return node.getAttribute("aria-expanded") === "true" && style.boxShadow === "none" &&
        style.backgroundImage === "none" && parseFloat(style.borderRadius) > 0;
    })`;
    check("open controls use a fill instead of a stripe", await run(openControls), true);
    await run("Soft98Pro.configure({rgbMode:true})");
    check("RGB controls use a fill instead of a stripe", await run(openControls), true);
    await run("Soft98Pro.configure({rgbMode:false})");
    const controls = `(() => {
      const elements = [document.querySelector("[data-s98p-topbar-toggle]"), document.querySelector("[data-s98p-topbar-brand]"),
        ...document.querySelectorAll("#actions > li > button")];
      return elements.map((node) => { const box = node.getBoundingClientRect(); return [box.left, box.right, (box.top + box.bottom) / 2, box.width]; });
    })()`;
    const rectangles = await run(controls);
    check("all actions stay aligned, within the mobile viewport", rectangles.every(([left, right, y, width]) => width > 20 && left >= -1 && right <= 376 && Math.abs(y - rectangles[0][2]) < 3), true);
    const [, , , width] = rectangles[3];
    const [left, right, y] = rectangles[3];
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: (left + right) / 2, y });
    await delay(180);
    check("hover does not move or resize a control", JSON.stringify(await run(controls)), JSON.stringify(rectangles));
    check("action hit target has usable width", width >= 25, true);
    await resize(320, 780);
    const shellWidth = await run('document.querySelector("[data-s98p-topbar-shell]").clientWidth');
    check("small phones fit even with a classic scrollbar", (await run(controls)).every(([left, right]) => left >= 0 && right <= shellWidth), true);
    await run("window.Soft98Pro.configure({darkDesign:false})");
    await delay(120);
    check("light mode preserves the single header surface", await run(`(() => {
      const shade = getComputedStyle(document.querySelector("[data-s98p-topbar-shell]"));
      return shade.borderTopWidth === "0px" && getComputedStyle(document.querySelector("nav")).backgroundImage === "none";
    })()`), true);
    check("idle toolbar action has no separate light tile", await run(`(() => {
      const style = getComputedStyle(document.querySelector("#actions li:last-child button"));
      return style.backgroundImage === "none" && style.backgroundColor === "rgba(0, 0, 0, 0)" && style.boxShadow === "none";
    })()`), true);
  } finally {
    await client.send("Emulation.clearDeviceMetricsOverride");
  }
}

async function verifyNewsAndContactTones(client) {
  await client.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/feedback.html` });
  const nodes = 'document.querySelector("[data-soft98-pro-news-story]") && document.querySelector("[data-s98p-contact-form]") && document.querySelector("[data-s98p-contact-menu]")';
  for (let i = 0; i < 50 && !await evaluate(client, nodes); i++) await delay(60);
  assertEqual("news and contact", "detects both surfaces", Boolean(await evaluate(client, nodes)), true);
  const news = 'document.querySelector("[data-soft98-pro-news-story]")';
  const snapshot = `(() => {
    const [menu, button, heading] = ["[data-s98p-contact-menu]", "[data-s98p-contact-form] button[type=submit]",
      "[data-s98p-contact-form] h4"].map(selector=>document.querySelector(selector));
    return { menu:getComputedStyle(menu).backgroundImage, button:getComputedStyle(button).backgroundImage,
      heading:getComputedStyle(heading,"::before").backgroundImage, news:getComputedStyle(${news}).backgroundColor };
  })()`;
  for (const [mode, settings] of [["light",{ darkDesign:false,rgbMode:false }],["dark",{ darkDesign:true,rgbMode:false }],["RGB",{ darkDesign:true,rgbMode:true }]]) {
    await client.send("Input.dispatchMouseEvent", { type:"mouseMoved", x:1, y:1 });
    await evaluate(client, `Soft98Pro.configure(${JSON.stringify(settings)}, {sync:false})`);
    await delay(120);
    const idle = await evaluate(client, snapshot);
    const point = await evaluate(client, `(() => {
      const row = ${news};
      row.scrollIntoView({block:"center"});
      const r = row.getBoundingClientRect();
      return {x: r.right-16, y:r.top+r.height/2};
    })()`);
    await client.send("Input.dispatchMouseEvent", { type:"mouseMoved", ...point });
    await delay(45);
    const hover = await evaluate(client, snapshot);
    const changedAccent = await evaluate(client, `(() => {
      document.documentElement.style.setProperty("--s98p-accent","lime","important");
      const result = getComputedStyle(${news}).backgroundColor;
      document.documentElement.style.removeProperty("--s98p-accent");
      return result;
    })()`);
    assertEqual(mode, "contact menu is flat", hover.menu, "none");
    assertEqual(mode, "contact submit is flat", hover.button, "none");
    assertEqual(mode, "contact heading marker is flat", hover.heading, "none");
    assertEqual(mode, "news hover remains visible", hover.news !== idle.news, true);
    assertEqual(mode, "news hover is independent of the green accent", changedAccent, hover.news);
  }
}

async function verifyTopbarSearch(client) {
  const run = (source) => evaluate(client, source);
  const url = `http://127.0.0.1:${PORT}/test/topbar.html?search-fixture=1`;
  const field = 'document.querySelector("#fixture-search input[type=search]")';
  const panel = 'document.getElementById("fixture-search")';
  const results = 'document.getElementById("fixture-suggestions")';
  const button = 'document.getElementById("fixture-search-trigger")';
  const clear = 'document.querySelector("[data-s98p-search-clear]")';
  const check = (label, value) => assertEqual("site search", label, value, true);
  const until = async (source) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await run(source).catch(() => false)) return;
      await delay(70);
    }
    throw new Error("Site search did not settle: " + source);
  };
  const key = async (key, windowsVirtualKeyCode) => {
    const enter = key === "Enter";
    await client.send("Input.dispatchKeyEvent", { type: enter ? "keyDown" : "rawKeyDown", key, code: key, windowsVirtualKeyCode, ...(enter ? { text: "\r" } : {}) });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode });
  };
  const resize = (width, height) => client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await resize(1200, 760);
  try {
    await client.send("Page.navigate", { url });
    await until(`location.href === ${JSON.stringify(url)} && ${panel}?.hasAttribute("data-soft98-pro-search")`);
    await key("F2", 113);
    await until(`document.activeElement === ${field} && ${panel}.hasAttribute("data-s98p-search-open")`);
    await client.send("Input.insertText", { text: "icon lover" });
    await until(`${results}.querySelectorAll("a[href]").length === 20`);
    check("only the suggestions can scroll", await run(`getComputedStyle(${panel}).overflowY === "visible" &&
      ${panel}.scrollHeight > ${panel}.clientHeight &&
      getComputedStyle(${results}).overflowY === "auto" && ${results}.scrollHeight > ${results}.clientHeight &&
      !${results}.hasAttribute("data-s98p-category-menu")`));
    check("Latin query and clear icon have matching directions", await run(`getComputedStyle(${field}).direction === "ltr" &&
      ${clear}.getBoundingClientRect().right > ${field}.getBoundingClientRect().right - 10 &&
      Boolean(${clear}.getAttribute("aria-label"))`));
    await key("Enter", 13);
    check("Enter submits the original form and query", await run('document.body.dataset.query === "icon lover"'));
    await run(`${clear}.click()`);
    check("clear uses the original action and keeps focus", await run(`!${field}.value && ${results}.hidden && document.activeElement === ${field}`));
    await client.send("Input.insertText", { text: "فایرفاکس" });
    check("Persian query moves the clear icon to the left", await run(`getComputedStyle(${field}).direction === "rtl" &&
      ${clear}.getBoundingClientRect().left < ${field}.getBoundingClientRect().left + 10`));
    await resize(375, 420);
    await until(`innerWidth === 375 && ${panel}.getBoundingClientRect().left === 8`);
    check("search bar and long suggestions fit the viewport", await run(`(() => {
      const p = ${panel}.getBoundingClientRect(), r = ${results}.getBoundingClientRect(), i = ${field}.getBoundingClientRect();
      return p.left >= 0 && p.top >= 58 && p.right <= innerWidth && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight &&
        document.elementFromPoint(i.left + i.width / 2, i.top + i.height / 2) === ${field};
    })()`));
    await run(`[...${results}.children].slice(1).forEach(node => node.remove())`);
    check("a short results list does not reserve empty height", await run(`${results}.getBoundingClientRect().height < 75`));
    await key("Escape", 27);
    check("Escape closes search and returns focus to its trigger", await run(`${panel}.hidden &&
      !${panel}.hasAttribute("data-s98p-search-open") && document.activeElement === ${button}`));
    await run('Soft98Pro.configure({pro:false})');
    check("turning off Pro restores the stock layout and attributes", await run(`getComputedStyle(${panel}).overflowY === "auto" &&
      !${field}.hasAttribute("dir") && !document.querySelector("[data-s98p-search-clear]")`));
    await run('Soft98Pro.configure({pro:true})');
  } finally {
    await client.send("Emulation.clearDeviceMetricsOverride");
  }
}

async function verifySearchHint(client) {
  const url = `http://127.0.0.1:${PORT}/test/topbar.html?do=search`;
  const run = source => evaluate(client, source);
  const check = (label, value) => assertEqual("search hint", label, value, true);
  const button = 'document.querySelector("[data-s98p-search-hint-dismiss]")';
  const until = async source => {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await run(source).catch(() => false)) return;
      await delay(70);
    }
    const state = await run(`(() => {
      const chain = [];
      for (let node = ${button}; node; node = node.parentElement) {
        const css = getComputedStyle(node);
        chain.push([node.tagName,node.id,node.hidden,css.display,css.visibility,node.getBoundingClientRect().height]);
      }
      return JSON.stringify({url:location.href, hide:window.Soft98Pro?.settings.hideSearchHint, chain});
    })()`);
    throw new Error("Search hint did not settle: " + state);
  };
  await client.send("Page.navigate", { url });
  await until(`location.href === ${JSON.stringify(url)} && ${button}?.checkVisibility()`);
  const timeOrigin = await run("performance.timeOrigin");
  check("uses the requested Persian label on the matching notice only", await run(
    `${button}.textContent === "متوجه شدم" && document.querySelectorAll("[data-s98p-search-hint-dismiss]").length === 1`));
  await run(`${button}.click()`);
  check("dismisses without navigating or affecting the search", await run(`
    !${button}.checkVisibility() && performance.timeOrigin === ${timeOrigin} &&
    document.activeElement.matches("#fixture-search-page input[name=story]") &&
    document.getElementById("fixture-other-alert").checkVisibility() &&
    document.getElementById("fixture-search-result").checkVisibility()`));
  await client.send("Page.reload");
  await until(`performance.timeOrigin !== ${timeOrigin} && ${button} && !${button}.checkVisibility()`);
  await run("Soft98Pro.configure({pro:false})");
  check("stock theme shows the untouched notice again", await run(`!${button} &&
    [...document.querySelectorAll("#fixture-search-page .alert")].every(node => node.checkVisibility())`));
  await run("Soft98Pro.configure({pro:true,hideSearchHint:false})");
}

async function verifyLinkdoni(client) {
  const run = expression => evaluate(client, expression);
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 850, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/page/1/` });
  try {
    for (let attempt = 0; attempt < 35; attempt++) {
      if (await run('Boolean(document.querySelector("[data-s98p-ld-story]"))').catch(() => false)) break;
      if (attempt === 34) throw new Error("Linkdoni fixture did not load");
      await delay(80);
    }
    const check = (label, actual) => assertEqual("Linkdoni", label, actual, true);
    check("preserves original story links, targets, and ordered dates", await run(`(() => {
      const links = [...document.querySelectorAll("[data-s98p-ld-story]")];
      return links.map(a => a.getAttribute("href")).join(",") === "/link-42.html,/link-41.html,/link-40.html" &&
        links[0].target === "_blank" && document.querySelectorAll("[data-s98p-ld-date-group]").length === 2 &&
        getComputedStyle(links[1].querySelector("[data-s98p-ld-story-title]")).textAlign === "right";
    })()`));
    check("preserves the searchable form and real page links", await run(`(() => {
      const input = document.querySelector("[data-s98p-ld-query]");
      input.value = "Linux";
      const values = new FormData(input.form);
      return values.get("story") === "Linux" && values.get("do") === "search" &&
        input.form.getAttribute("action") === "/test/linkdoni.html" &&
        document.querySelector("[data-s98p-ld-pages] a").getAttribute("href") === "/page/2/";
    })()`));
    check("centers the feed independently of the original wrapper width", await run(`(() => {
      const box = document.querySelector("[data-s98p-ld-frame]").getBoundingClientRect();
      return Math.abs(box.left + box.right - document.documentElement.clientWidth) < 2;
    })()`));
    check("uses Persian digits and a bordered count pill", await run(`(() => {
      const badge = document.querySelector("[data-s98p-ld-count]");
      return badge.textContent === "۳ لینک" && getComputedStyle(badge).borderRadius === "20px" &&
        [...document.querySelector("[data-s98p-ld-pages]").children].map(x => x.textContent).join("") === "۱۲۳";
    })()`));
    check("the control stays fixed while scrolling past the initial viewport", await run(`(() => {
      const dock = document.getElementById("soft98-pro-control");
      const y = dock.getBoundingClientRect().top;
      scrollTo(0, 580);
      return scrollY > 350 && Math.abs(dock.getBoundingClientRect().top - y) < 1;
    })()`));
    await run('document.querySelector("[data-s98p-ld-date-group]").focus()');
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", text: " ", windowsVirtualKeyCode: 32 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    check("keyboard collapse hides only its own date and reopening restores it", await run(`(() => {
      const toggle = document.querySelector("[data-s98p-ld-date-group]");
      const stories = [...document.querySelectorAll("[data-s98p-ld-story]")];
      const closed = toggle.getAttribute("aria-expanded") === "false" &&
        stories.map(a => Boolean(a.getClientRects().length)).join() === "false,false,true";
      toggle.click();
      return closed && toggle.getAttribute("aria-expanded") === "true" && stories.every(a => a.getClientRects().length);
    })()`));
    const storyBackground = 'getComputedStyle(document.querySelector("[data-s98p-ld-story]")).backgroundColor';
    const darkBackground = await run(storyBackground);
    await run('document.querySelector("[data-s98p-ld-actions] button").click()');
    await delay(210);
    check("theme toggle changes the visible feed color", await run(storyBackground) !== darkBackground &&
      await run('document.documentElement.classList.contains("soft98-pro-light")'));
    await client.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 780, deviceScaleFactor: 1, mobile: false });
    check("search and story rows fit on mobile", await run(`(() => {
      const nodes = [...document.querySelectorAll("[data-s98p-ld-story],[data-s98p-ld-query],[data-s98p-ld-action]")];
      return nodes.every(e => { const r=e.getBoundingClientRect();return r.width > 0 && r.left >= 0 && r.right <= innerWidth; });
    })()`));
    await run('restoreLinkdoni()');
    check("stock branding is restored when disabled", await run(`getComputedStyle(document.querySelector("[data-s98p-ld-brand-original]")).display !== "none" &&
      getComputedStyle(document.querySelector("[data-s98p-ld-identity]")).display === "none" &&
      document.querySelector("[data-s98p-ld-pages] [aria-current]").textContent === "1"`));
    await run('window.fixtureMarker = 1; document.querySelector("[data-s98p-ld-actions] button").click(); scrollTo(0, 420)');
    const waitFor = async expression => {
      for (let i = 0; i < 35; i++) {
        if (await run(expression).catch(() => false)) return true;
        await delay(60);
      }
      return false;
    };
    await run('document.querySelector("[data-s98p-ld-pages] a").click()');
    check("shows a loader and keeps the URL and original content until the result is ready", await run(`location.pathname === "/page/1/" &&
      Boolean(document.querySelector("[data-s98p-ld-loading][role=status]")) &&
      document.querySelector("[data-s98p-ld-feed]").getAttribute("aria-busy") === "true"`));
    check("page two updates the URL, content, and active page without reloading", await waitFor(`location.pathname === "/page/2/" &&
      document.querySelector("[data-s98p-ld-story]").pathname === "/link-39.html" &&
      document.querySelector("[data-s98p-ld-pages] [aria-current]").textContent === "۲" &&
      !document.querySelector("[data-s98p-ld-loading]") && window.fixtureMarker === 1 && !window.archiveScriptRan &&
      !document.querySelector("[data-s98p-ld-story]").hasAttribute("onclick")`));
    await run('history.back()');
    check("Back restores the prior archive contents and scroll", await waitFor(`location.pathname === "/page/1/" &&
      document.querySelector("[data-s98p-ld-story]").pathname === "/link-42.html" && window.fixtureMarker === 1 && scrollY === 420`));
    await run('history.forward()');
    check("Forward restores page two without reloading", await waitFor(`location.pathname === "/page/2/" &&
      document.querySelector("[data-s98p-ld-story]").pathname === "/link-39.html" && window.fixtureMarker === 1`));
    await run(`document.querySelector("[data-s98p-ld-pages] a[href$='/page/3/']").click()`);
    check("native navigation is used after a failed background request", await waitFor(`location.pathname === "/page/3/" &&
      document.title === "Archive native fallback" && !window.fixtureMarker`));
    await client.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.php?do=search&subaction=search&story=Linux` });
    check("legacy search pager exposes real restorable URLs", await waitFor(`document.querySelector("[data-s98p-ld-pages] a")?.href.includes("search_start=2")`));
    await run(`window.originalSearchForm = document.querySelector("[data-s98p-ld-details]"); document.querySelector("[data-s98p-ld-pages] a").click()`);
    check("search pagination stays in place and updates the original form's results", await waitFor(`location.search.includes("search_start=2") &&
      document.querySelector("[data-s98p-ld-pages] [aria-current]")?.textContent === "۲" &&
      document.querySelector("[data-s98p-ld-details]") === window.originalSearchForm &&
      document.querySelector("[data-s98p-ld-result-summary]")?.textContent.includes("4 - 6")`));
    await run('history.back()');
    check("Back restores search results and their original URL", await waitFor(`!location.search.includes("search_start") &&
      document.querySelector("[data-s98p-ld-pages] [aria-current]")?.textContent === "۱" &&
      document.querySelector("[data-s98p-ld-details]") === window.originalSearchForm &&
      document.querySelector("[data-s98p-ld-result-summary]")?.textContent.includes("1 - 3")`));
  } finally {
    await client.send("Emulation.clearDeviceMetricsOverride");
  }
}

async function faviconPixel(client) {
  const href = await evaluate(client, "document.getElementById('soft98-pro-favicon')?.href");
  if (!href?.startsWith("data:image/png;base64,")) throw new Error("Missing Soft98 Pro favicon PNG");
  const { data, width } = PNG.sync.read(Buffer.from(href.split(",")[1], "base64"));
  const offset = (16 * width + 49) * 4;
  return Array.from(data.subarray(offset, offset + 3)).join(",");
}

async function waitForFaviconPixel(client, pixel, label, timeout = 1000) {
  const deadline = Date.now() + timeout;
  do {
    const actual = await faviconPixel(client);
    if (actual === pixel) return;
    await delay(35);
  } while (Date.now() < deadline);
  throw new Error(`The favicon did not show ${label}`);
}

function assertEqual(name, field, actual, expected) {
  if (actual !== expected) throw new Error(`${name}: expected ${field}=${expected}, received ${actual == null ? "<missing>" : actual}`);
}

function assertDarkTabSurfaces(name, theme) {
  assertEqual(name, "tab card surface", theme.cardSurface, "tab-card");
  assertEqual(name, "tab content surface", theme.contentSurface, "tab-content");
  if (theme.paneSurfaces.join(",") !== "tab-pane,tab-pane") throw new Error(`${name}: controlled tab panes were not classified`);
  assertEqual(name, "thin tab edge", theme.incomingBorder, "1px");
  if (!/inset/.test(theme.incomingIndicator)) throw new Error(`${name}: active tab indicator is missing`);
  for (const [field, value] of Object.entries({
    card: theme.cardBackground,
    content: theme.contentBackground,
    outgoing: theme.outgoingBackground,
    incoming: theme.incomingBackground,
  })) {
    if (value === "rgb(255, 255, 255)" || value === "rgba(255, 255, 255, 1)") {
      throw new Error(`${name}: ${field} tab surface flashed white`);
    }
  }
}

function assertCase(name, results, expected) {
  const exact = {
    warnings: 0,
    blockerNotices: 0,
    hostileMentions: false,
    hostileBranding: 1,
    kaprila: 0,
    asiatech: 0,
    iranicard: 0,
    advertisingCard: 0,
    advertisingSeparator: 0,
    patch: "passed",
    topLevelPatch: "passed",
    scrollWarnings: 0,
    tauntTheme: expected.tauntTheme,
    tauntBackground: expected.tauntBackground,
    tauntStatus: expected.tauntTheme ? "status" : null,
    downloadCopy: "دانلود (Official link)",
    downloadPath: "/files/AnyDesk.9.8.3.zip",
    downloadSize: "1,200 مگابایت",
    downloadIcons: "chevron,windows,download,apple,linux,apple,android,download,download,info,link,lock,help",
    normalizedDownload: "https://dl2.soft98.ir/files/metadata.zip",
    signedDownload: "https://dl2.soft98.ir/files/signed.zip?token=123456",
    isolatedParenthesis: true,
    logoVariant: expected.logo,
    rgbMode: expected.rgb,
    rgbAmbient: false,
    megamenuSurface: "megamenu",
    nestedLightSurface: expected.dark ? "raised" : null,
    controlTabChanged: true,
    controlOutsideCollapsed: true,
    stockLogoSelected: true,
    constructableTheme: true,
    utilityLayout: "utility-list",
    utilityRows: true,
    utilityCopies: true,
  };
  for (const [field, value] of Object.entries(exact)) assertEqual(name, field, results[field], value);
  if (expected.dark) {
    if (expected.rgb) {
      if (!results.megamenuBackgroundImage?.includes("linear-gradient") || results.megamenuBackground !== "rgb(8, 10, 11)") {
        throw new Error(`${name}: RGB megamenu lost its dark gradient or base color`);
      }
    } else if (!/gradient/i.test(results.megamenuBackgroundImage || "")) throw new Error(`${name}: megamenu dark surface is missing`);
    if (/rgba?\(255,\s*255,\s*255/.test(results.nestedLightBackground || "") || results.nestedLightBackground === "rgb(245, 245, 245)") {
      throw new Error(`${name}: nested opaque light surface escaped the Pro theme`);
    }
    assertDarkTabSurfaces(name, results.tabTheme);
    if (expected.rgb) {
      if (!/soft98-pro-neon/.test(results.rgbAnimation || "")) throw new Error(`${name}: RGB border animation is not active`);
      if (/radial-gradient|conic-gradient/i.test(results.rgbBackgroundImage || "")) throw new Error(`${name}: RGB mode reintroduced an ambient radial background`);
    }
  } else {
    assertEqual(name, "light tab card", results.tabTheme.cardBackground, "rgb(255, 255, 255)");
    assertEqual(name, "light tab structure", results.tabTheme.cardSurface, "tab-card");
    assertEqual(name, "light color scheme", results.colorScheme, "light");
    assertEqual(name, "light control panel", results.controlBackground, "rgb(247, 249, 244)");
    assertEqual(name, "light control text", results.controlForeground, "rgb(32, 46, 36)");
  }
}

async function terminateTree(child) {
  if (!child || child.exitCode != null) return;
  if (process.platform === "win32") {
    childProcess.spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true, timeout: 10000 });
  } else {
    child.kill("SIGKILL");
  }
  await delay(200);
}

async function main() {
  const server = childProcess.spawn(process.execPath, [path.join(ROOT, "test", "serve-harness.js")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let chrome = null;
  let client = null;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "soft98-pro-runtime-"));
  try {
    await waitForServer();
    const debugPort = await availablePort();
    chrome = childProcess.spawn(chromePath(), [
      "--headless=new",
      "--disable-extensions",
      "--disable-component-extensions-with-background-pages",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ], { stdio: "ignore", windowsHide: true });
    const target = await waitForTargets(debugPort);
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setTimezoneOverride", { timezoneId: "Asia/Tehran" });
    await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    if (process.argv.includes("--theme-restore-only")) {
      await verifyThemeRestore(client);
      await verifyWideLayout(client);
      await verifyAppearanceBridge(client);
      console.log("Soft98 theme restoration and article layout passed");
      return;
    }
    if (process.argv.includes("--issue16-only")) {
      await verifyIssue16(client);
      await verifyIssue16EarlyReload(client);
      console.log("Soft98 ordinary reload recovery passed");
      return;
    }
    if (process.argv.includes("--rgb-media-only")) {
      await verifyRgbMedia(client);
      console.log("Soft98 RGB media color and accent animation passed");
      return;
    }
    if (process.argv.includes("--download-permissions-only")) {
      await verifyDownloadManager(client, { permissionsOnly: true });
      console.log("Soft98 contextual download permissions passed");
      return;
    }
    if (process.argv.includes("--site-search-only")) {
      await verifyTopbarSearch(client);
      await verifySearchHint(client);
      await verifyTopbar(client);
      console.log("Soft98 site search and sticky navigation passed");
      return;
    }
    if (process.argv.includes("--news-contact-tones-only")) {
      await verifyNewsAndContactTones(client);
      console.log("Soft98 technology news and contact colors passed");
      return;
    }
    if (process.argv.includes("--initial-content-scroll-only")) {
      await verifyInitialContentScroll(client);
      console.log("Soft98 early search and article scrolling passed");
      return;
    }
    if (process.argv.includes("--article-preview-only")) {
      for (const mode of ["", "&legacyPopover=1"]) {
        await client.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?taunt=0&dark=1${mode}` });
        await waitForResults(client);
        await verifyArticlePreview(client);
      }
      console.log("Soft98 article download previews passed");
      return;
    }
    if (process.argv.includes("--article-download-actions-only")) {
      await verifyFileActions(client);
      console.log("Soft98 article download actions and file picker passed");
      return;
    }
    const badgeDark = "255,209,102";
    let idleDark;
    const cases = [
      ["default-dark", "taunt=0&dark=1", { dark: true, rgb: false, tauntTheme: null, tauntBackground: null, logo: "pirateDark" }],
      ["taunt-dark", "taunt=1&dark=1", { dark: true, rgb: false, tauntTheme: "dark", tauntBackground: "rgb(16, 27, 36)", logo: "pirateDark" }],
      ["taunt-light", "taunt=1&dark=0", { dark: false, rgb: false, tauntTheme: "light", tauntBackground: "rgb(247, 250, 252)", logo: "pirateDark" }],
      ["rgb", "taunt=0&dark=1&rgb=1", { dark: true, rgb: true, tauntTheme: null, tauntBackground: null, logo: "pirateDark" }],
    ];
    for (const [name, query, expected] of cases) {
      await client.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?${query}` });
      const results = await waitForResults(client);
      assertCase(name, results, expected);
      const calloutTheme = await evaluate(client, `(() => {
        const box = document.querySelector('[data-test=legacy-article-callout]');
        return box.getAttribute('data-soft98-pro-surface') === 'raised' &&
          getComputedStyle(box).backgroundColor !== 'rgb(37, 37, 37)' && box.getBoundingClientRect().height > 0;
      })()`);
      assertEqual(name, "article callout uses the Pro palette", calloutTheme, true);
      if (name === "default-dark") {
        const earlyCheck = await evaluate(client, "firstPaintCheck");
        for (const key of ["loading", "bannerHidden", "cardHidden", "editorialVisible", "settingRespected"]) {
          assertEqual("ad styles before DOMContentLoaded", key, earlyCheck[key], true);
        }
      }
      if (name === "default-dark") {
        const scrollWork = await evaluate(client, `
          (() => {
            let calls = 0, scans = 0, detectorRan = false;
            const query = Document.prototype.querySelectorAll;
            Document.prototype.querySelectorAll = function (...args) { scans++; return query.apply(this, args); };
            const listener = () => calls++;
            const detector = { handleEvent() { detectorRan = /adblock/.test('adblock'); } };
            window.addEventListener('scroll', listener);
            window.addEventListener('scroll', detector);
            try {
              for (let i = 0; i < 25; i++) window.dispatchEvent(new Event('scroll'));
              window.removeEventListener('scroll', listener);
              window.dispatchEvent(new Event('scroll'));
              return {calls, scans, detectorRan};
            } finally {
              Document.prototype.querySelectorAll = query;
              window.removeEventListener('scroll', detector);
            }
          })()
        `);
        assertEqual("scroll performance", "native callback count", scrollWork.calls, 25);
        assertEqual("scroll performance", "synchronous whole-document queries", scrollWork.scans, 0);
        assertEqual("scroll performance", "detector was not registered", scrollWork.detectorRan, false);
        const faqMotion = await evaluate(client, `
          (async () => {
            const details = document.querySelector('[data-test=download-article] details');
            const summary = details.querySelector('summary');
            const height = () => details.getBoundingClientRect().height;
            const endMargin = () => getComputedStyle(details).marginBlockEnd;
            const closed = height();
            const closedMargin = endMargin();
            summary.click();
            let animation = details.getAnimations()[0];
            if (!animation) return { animated:false };
            animation.pause();
            animation.currentTime = animation.effect.getTiming().duration;
            const endpoint = height();
            animation.finish();
            await animation.finished;
            const openSettled = details.open && Math.abs(height() - endpoint) < 1 && endMargin() === closedMargin &&
              !details.hasAttribute('data-soft98-pro-faq-motion');
            summary.click();
            animation = details.getAnimations()[0];
            animation.finish();
            await animation.finished;
            summary.click();
            animation = details.getAnimations()[0];
            animation.pause();
            animation.currentTime = 70;
            const middle = height();
            summary.click();
            animation = details.getAnimations()[0];
            const reversible = Math.abs(parseFloat(animation.effect.getKeyframes()[0].maxHeight) - middle) < .1;
            animation.finish();
            await new Promise(resolve => setTimeout(resolve, 70));
            return { animated:true, reversible, openSettled, moved:middle > closed, restored:Math.abs(height() - closed) < 1 &&
              !details.open && !details.hasAttribute('data-soft98-pro-faq-motion') };
          })()
        `);
        for (const key of ["animated", "reversible", "openSettled", "moved", "restored"]) assertEqual("FAQ motion", key, faqMotion[key], true);
        idleDark = await faviconPixel(client);
        const platformLayout = await evaluate(client, `(() => {
          const row = document.querySelector('[data-test=platform-row]');
          const group = row.querySelector('[data-soft98-pro-platform-links]');
          const [first, second] = group.querySelectorAll('a');
          const title = new Range();
          title.selectNodeContents(row.firstChild);
          const sameLine = (a,b) => Math.abs(a.top + a.height / 2 - b.top - b.height / 2) < 5;
          const wide = sameLine(title.getBoundingClientRect(), group.getBoundingClientRect());
          row.style.width = '150px';
          const narrow = sameLine(first.getBoundingClientRect(), second.getBoundingClientRect()) &&
            first.getBoundingClientRect().right > second.getBoundingClientRect().right && group.getBoundingClientRect().width <= 150;
          row.removeAttribute('style');
          return {wide,narrow,paths:first.pathname + '|' + second.pathname};
        })()`);
        assertEqual("megamenu platform links", "wide", platformLayout.wide, true);
        assertEqual("megamenu platform links", "narrow RTL", platformLayout.narrow, true);
        assertEqual("megamenu platform links", "destinations", platformLayout.paths, "/internet/|/mac/internet-mac/");
        await client.send("DOM.enable");
        await client.send("CSS.enable");
        const { root: menuRoot } = await client.send("DOM.getDocument");
        const { nodeId: headingLink } = await client.send("DOM.querySelector", {
          nodeId: menuRoot.nodeId, selector: '[data-test="megamenu-heading-link"]',
        });
        const headingLayout = `(() => {
          const link = document.querySelector('[data-test="megamenu-heading-link"]');
          const title = link.parentElement;
          const text = document.createRange();
          text.selectNodeContents(link);
          const rect = box => [box.x, box.y, box.width, box.height];
          const style = getComputedStyle(link);
          return [rect(title.getBoundingClientRect()), rect(link.getBoundingClientRect()), rect(text.getBoundingClientRect()),
            style.paddingInlineStart, style.borderInlineStartWidth, getComputedStyle(title,'::before').pointerEvents];
        })()`;
        const resting = await evaluate(client, headingLayout);
        assertEqual("megamenu heading", "indicator hit testing", resting.at(-1), "none");
        for (const state of ["hover", "focus-visible"]) {
          await client.send("CSS.forcePseudoState", { nodeId: headingLink, forcedPseudoClasses: [state] });
          assertEqual("megamenu heading", state + " layout", JSON.stringify(await evaluate(client, headingLayout)), JSON.stringify(resting));
        }
        await client.send("CSS.forcePseudoState", { nodeId: headingLink, forcedPseudoClasses: [] });
        const menuEntry = 'document.querySelector("[data-test=megamenu-entry]")';
        const arrowLayout = `(() => {
          const entry = ${menuEntry}, arrow = entry.querySelector("[data-s98p-menu-arrow]");
          const rtl = arrow.getBoundingClientRect().left - entry.getBoundingClientRect().left;
          entry.dir = "ltr";
          const ltr = entry.getBoundingClientRect().right - arrow.getBoundingClientRect().right;
          const mirrored = getComputedStyle(arrow.querySelector("svg")).scale === "-1 1";
          entry.removeAttribute("dir");
          return {
            label: entry.textContent,
            path: entry.pathname,
            legacyHidden: getComputedStyle(entry,"::before").content === "none" &&
              getComputedStyle(document.querySelector("[data-test=platform-row]"),"::after").content === "none",
            onlyOneArrow: entry.querySelectorAll("[data-s98p-menu-arrow]").length === 1 &&
              !document.querySelector("[data-test=platform-row] [data-s98p-menu-arrow]"),
            rtlAndLtr: rtl > 0 && rtl === ltr && mirrored,
            decorative: arrow.getAttribute("aria-hidden") === "true" && getComputedStyle(arrow).pointerEvents === "none",
            idle: getComputedStyle(arrow).opacity === "0"
          };
        })()`;
        for (const [field, value] of Object.entries(await evaluate(client, arrowLayout))) {
          assertEqual("megamenu entries", field, value, field === "label" ? "سایر ابزارها" : field === "path" ? "/category/other" : true);
        }
        const entryBox = `JSON.stringify(${menuEntry}.getBoundingClientRect().toJSON())`;
        const originalBox = await evaluate(client, entryBox);
        const { nodeId: menuEntryId } = await client.send("DOM.querySelector", {
          nodeId: menuRoot.nodeId, selector: "[data-test=megamenu-entry]",
        });
        for (const pseudo of ["hover", "focus-visible"]) {
          await client.send("CSS.forcePseudoState", { nodeId: menuEntryId, forcedPseudoClasses: [pseudo] });
          await delay(200);
          assertEqual("megamenu entries", pseudo + " arrow", await evaluate(client,
            `getComputedStyle(${menuEntry}.querySelector("[data-s98p-menu-arrow]")).opacity`), "1");
          assertEqual("megamenu entries", pseudo + " layout", await evaluate(client, entryBox), originalBox);
        }
        await client.send("CSS.forcePseudoState", { nodeId: menuEntryId, forcedPseudoClasses: [] });
        if (idleDark.split(",").some(value => Number(value) > 40)) throw new Error("The idle favicon has a bright badge");
        const latest = await evaluate(client, `
          (() => {
            const list = document.querySelector('[data-test=latest-tabs] [role=tablist]');
            const tabs = [...list.querySelectorAll('[role=tab]')];
            const panes = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
            const check = () => ({
              selected: tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true'),
              visible: panes.flatMap((pane, i) => pane.getClientRects().length && getComputedStyle(pane).opacity === '1' ? [i] : []),
              tabbable: tabs.flatMap((tab, i) => tab.tabIndex === 0 ? [i] : []),
            });
            const initial = check();
            tabs[1].click();
            const click = check();
            tabs[1].focus();
            tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowLeft', bubbles:true }));
            const rtl = check();
            const focused = document.activeElement === tabs[2];
            tabs[2].dispatchEvent(new KeyboardEvent('keydown', { key:'Home', bubbles:true }));
            const home = check();
            const shortcuts = [...document.querySelectorAll('[data-test=tech-news] [data-soft98-pro-news-shortcut]')];
            const centered = shortcuts.every(link => {
              const a = link.getBoundingClientRect(), b = link.querySelector('svg').getBoundingClientRect();
              return b.width >= 15 && Math.abs(a.left+a.width/2-b.left-b.width/2) < 1 &&
                Math.abs(a.top+a.height/2-b.top-b.height/2) < 1;
            });
            const actions = shortcuts[0].closest("[data-soft98-pro-news-actions]");
            const toolbar = actions.closest('[data-soft98-pro-latest-header="news"]');
            const collapse = toolbar.querySelector("[data-s98p-news-toggle]");
            const controls = toolbar.querySelector("[data-s98p-news-controls]");
            const close = controls.querySelector("[data-s98p-news-hide]").getBoundingClientRect();
            const title = toolbar.querySelector("[data-soft98-pro-news-title]");
            const edge = collapse.getBoundingClientRect();
            const shares = actions.getBoundingClientRect();
            const collapseLast = toolbar.lastElementChild === controls && controls.lastElementChild === collapse &&
              edge.left - toolbar.getBoundingClientRect().left < 16 && edge.right <= close.left &&
              close.right <= shares.left && shares.left - close.right < 16 && shares.right <= title.getBoundingClientRect().left;
            return { initial, click, rtl, focused, home, centered, collapseLast, shortcuts:shortcuts.length };
          })()
        `);
        for (const [step, index] of [["initial", 0], ["click", 1], ["rtl", 2], ["home", 0]]) {
          assertEqual("latest-tabs", step, JSON.stringify(latest[step]), JSON.stringify({ selected:index, visible:[index], tabbable:[index] }));
        }
        assertEqual("latest-tabs", "keyboard focus", latest.focused, true);
        assertEqual("news", "shortcut count", latest.shortcuts, 5);
        assertEqual("news", "shortcut SVG centers", latest.centered, true);
        assertEqual("news", "collapse follows the left-aligned shortcuts in RTL and keyboard order", latest.collapseLast, true);
        await verifyArticlePreview(client);
        const wrappers = await evaluate(client, `(async () => {
          const samples = [
            ['https://href.li/?https://example.org/a%2Fb?q=a+b&token=%2F%3F#install', 'https://example.org/a%2Fb?q=a+b&token=%2F%3F#install'],
            ['//href.li/?' + encodeURIComponent('https://example.org/download?a=%2B&b=one+two#verify'), 'https://example.org/download?a=%2B&b=one+two#verify'],
            ['https://href.li/?https&#58;//example.org/official', 'https://example.org/official'],
            ['https://href.li/?javascript:alert(1)', null],
            ['https://href.li/?https://user@example.org/', null],
            ['https://href.li/?https://href.li/?https://example.org', null],
            ['https://href.li.example.org/?https://example.org/', null],
            ['https://href.li/other?https://example.org/', null],
            ['https://href.li/?https%3A%2F%2Fexample.org%2F%XX', null],
          ];
          const group = document.createElement('div');
          group.innerHTML = samples.map(([input]) => '<a href="' + input + '" target="_blank" rel="nofollow"><span>Guide</span></a>').join('');
          document.body.append(group);
          // Exercise immediate middle-click and asynchronously discovered links.
          group.children[0].firstChild.dispatchEvent(new MouseEvent('auxclick', { bubbles:true, button:1 }));
          const immediate = group.children[0].href === samples[0][1];
          for (let i = 0; i < 10 && group.children[2].href !== samples[2][1]; i++) await new Promise(resolve => setTimeout(resolve, 35));
          const results = [...group.children].map((link, i) => {
            const [original, expected] = samples[i];
            return expected ? link.href === expected && link.target === '_blank' && link.relList.contains('noreferrer') &&
              link.relList.contains('nofollow') : link.getAttribute('href') === original && !link.relList.contains('noreferrer');
          });
          group.remove();
          return { immediate, results };
        })()`);
        assertEqual("referrer links", "middle click", wrappers.immediate, true);
        wrappers.results.forEach((valid, i) => assertEqual("referrer links", "case " + (i + 1), valid, true));
        const downloadTab = await evaluate(client, `
          (async () => {
            const article = document.querySelector('[data-test=keyed-article]');
            const [requirements, downloads] = article.querySelectorAll('[role=tab]');
            const pane = document.getElementById('harness.downloads');
            const link = pane.querySelector('a[data-key]');
            const state = () => ({
              selected: downloads.getAttribute('aria-selected') === 'true',
              visible: Boolean(link.getClientRects().length) && getComputedStyle(link).pointerEvents !== 'none' &&
                getComputedStyle(link.closest('[data-target]')).opacity === '1' &&
                link.closest('[data-target]').getBoundingClientRect().height >= link.getBoundingClientRect().height,
              mislabeled: pane.getAttribute('aria-hidden') === 'true',
              notWarning: !pane.querySelector('[role=alert]'),
              unrelatedHidden: !pane.querySelector('[data-test=unrelated-hidden]').getClientRects().length,
              originalHref: new URL(link.href).pathname === '/file/sample.zip',
            });
            const before = state();
            downloads.click();
            await Promise.resolve();
            const clicked = state();
            requirements.click();
            await Promise.resolve();
            const away = state();
            history.replaceState(null, '', '#harness.downloads');
            dispatchEvent(new HashChangeEvent('hashchange'));
            const fragment = state();
            history.replaceState(null, '', location.pathname + location.search);
            return { before, clicked, away, fragment };
          })()
        `);
        for (const [step, expected] of [["before", false], ["clicked", true], ["away", false], ["fragment", true]]) {
          assertEqual("article download tab", step, JSON.stringify(downloadTab[step]), JSON.stringify({
            selected:expected, visible:expected, mislabeled:!expected, notWarning:true, unrelatedHidden:true, originalHref:true,
          }));
        }
        const feedback = await evaluate(client, `(async () => {
          const file = document.querySelector('[data-test=direct-download]');
          const keyed = document.querySelector('[data-test=keyed-article] a[data-key]');
          const other = document.querySelector('[data-test=article-placeholder]');
          const check = link => link.querySelector('[data-soft98-pro-download-check]');
          const showing = link => Boolean(check(link) && getComputedStyle(check(link)).display !== 'none');
          const click = (link, type, button) => {
            let reached = false;
            link.addEventListener(type, event => { reached = !event.defaultPrevented; event.preventDefault(); }, {once:true});
            link.dispatchEvent(new MouseEvent(type, { bubbles:true, cancelable:true, button }));
            return reached;
          };
          const idle = !showing(file);
          const width = file.querySelector('[data-soft98-pro-page-icon]').getBoundingClientRect().width;
          const direct = click(file,'click',0) && showing(file);
          const stable = file.querySelector('[data-soft98-pro-page-icon]').getBoundingClientRect().width === width;
          const middle = click(keyed,'auxclick',1) && showing(keyed);
          const unrelated = click(other,'click',0) && !showing(other);
          return {idle,direct,stable,middle,unrelated};
        })()`);
        for (const [key, value] of Object.entries(feedback)) assertEqual("download activation", key, value, true);
        const recovery = await evaluate(client, `(async () => {
          const row = document.querySelector('[data-test=direct-download]');
          const entry = row.closest('dd');
          const expected = row.href;
          const waitFor = async test => {
            for (let i = 0; i < 20 && !test(); i++) await new Promise(resolve => requestAnimationFrame(resolve));
          };
          entry.style.inlineSize = '164px';
          const originalHeight = row.getBoundingClientRect().height;
          row.classList.add('download-list-link');
          Soft98Pro.scan();
          await waitFor(() => row.getAttribute('data-soft98-adblocker-href') === expected);
          const preserved = row.getAttribute('data-soft98-adblocker-href') === expected;
          row.removeAttribute('href');
          Soft98Pro.scan();
          await waitFor(() => row.href === expected);
          const result = {
            preserved,
            restored: row.href === expected && row.getAttribute('data-soft98-adblocker-state') === 'restored',
            noBadge: !row.querySelector('.soft98-pro-link-badge'),
            stableHeight: row.getBoundingClientRect().height === originalHeight,
            noSetting: !document.querySelector('#soft98-pro-control input[name=linkBadges]'),
          };
          entry.style.removeProperty('inline-size');
          row.classList.remove('download-list-link');
          return result;
        })()`);
        for (const [key, value] of Object.entries(recovery)) assertEqual("download recovery without badge", key, value, true);
        const controls = await evaluate(client, `
          (async () => {
            const article = document.querySelector('[data-test="download-article"]');
            const [group, more] = article.querySelectorAll('[data-soft98-pro-download-actions]');
            const button = group.parentElement.querySelector('[data-s98p-download-toggle]');
            const linked = button.getAttribute('aria-controls').split(' ').map(id => document.getElementById(id));
            const outside = article.querySelector('[data-test="article-placeholder"]');
            const row = article.querySelector('[data-test="download-copy"]');
            const title = row.querySelector('[data-soft98-pro-download-title]').getBoundingClientRect();
            const meta = row.querySelector('[data-soft98-pro-download-meta]').getBoundingClientRect();
            let copied, singleToast, groupToast;
            const toastText = () => document.querySelector('[data-soft98-pro-copy-toast] [data-role=message]').textContent;
            Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{writeText: async value => { copied = value; }} });
            try {
              const signed = article.querySelector('[data-test="signed-download"]').closest('dd');
              signed.hidden = true;
              group.querySelector('button').click();
              await Promise.resolve();
              singleToast = toastText();
              signed.hidden = false;
              group.querySelector('button').click();
              await Promise.resolve();
              groupToast = toastText();
            } finally {
              delete navigator.clipboard;
            }
            button.click();
            await Promise.allSettled(linked.flatMap(entry => entry.getAnimations().map(animation => animation.finished)));
            const collapsed = linked.every(entry => !entry.getClientRects().length) && !!outside.getClientRects().length;
            button.click();
            await Promise.allSettled(linked.flatMap(entry => entry.getAnimations().map(animation => animation.finished)));
            const reopened = linked.every(entry => !!entry.getClientRects().length);
            const input = article.querySelector('[data-soft98-pro-password] input');
            input.click();
            return { copied, singleToast, groupToast, collapsed, reopened, placeholderExcluded: more.querySelector('button').hidden,
              onePasswordAction: article.querySelectorAll('[data-soft98-pro-password-actions] button').length === 1,
              passwordSelected: document.activeElement === input && input.selectionStart === 0 && input.selectionEnd === input.value.length,
              metadataFits: meta.height > 0 && meta.top >= title.bottom - 1 && meta.bottom <= row.getBoundingClientRect().bottom + 1 };
          })()
        `);
        assertEqual(name, "group clipboard", controls.copied,
          ["https://dl2.soft98.ir/files/metadata.zip",
            "https://dl2.soft98.ir/files/signed.zip?token=123456"].join("\n"));
        assertEqual(name, "one copied link toast", controls.singleToast, "۱ لینک دانلود کپی شد.");
        assertEqual(name, "multiple copied links toast", controls.groupToast, "۲ لینک دانلود کپی شدند.");
        for (const [field, value] of Object.entries(controls)) {
          if (!["copied", "singleToast", "groupToast"].includes(field)) assertEqual(name, field, value, true);
        }
        await waitForFaviconPixel(client, badgeDark, "the copy badge");
        await waitForFaviconPixel(client, idleDark, "the off frame");
        await waitForFaviconPixel(client, badgeDark, "a second pulse");
        await waitForFaviconPixel(client, idleDark, "the clean icon after the second pulse");
        await delay(850);
        assertEqual(name, "original download icon restored", await evaluate(client,
          "document.querySelectorAll('[data-soft98-pro-download-activated]').length"), 0);
        assertEqual(name, "expired copy toast", await evaluate(client, "Boolean(document.querySelector('[data-soft98-pro-copy-toast][data-visible]'))"), false);
        await client.send("DOM.enable");
        await client.send("CSS.enable");
        const { root: helpRoot } = await client.send("DOM.getDocument");
        const { nodeId: helpNode } = await client.send("DOM.querySelector", { nodeId: helpRoot.nodeId, selector: '[data-test="neutral-help"]' });
        await client.send("CSS.forcePseudoState", { nodeId: helpNode, forcedPseudoClasses: ["focus", "focus-visible"] });
        await delay(200);
        const focusPalette = await evaluate(client, `(() => {
          const help = document.querySelector('[data-test="neutral-help"]');
          const style = getComputedStyle(help);
          const probe = document.createElement('i');
          probe.style.backgroundColor = 'var(--s98p-soft)';
          document.body.append(probe);
          const matches = { offset:style.outlineOffset, actual:style.backgroundColor, expected:getComputedStyle(probe).backgroundColor, image:style.backgroundImage };
          probe.remove();
          return matches;
        })()`);
        await client.send("CSS.forcePseudoState", { nodeId: helpNode, forcedPseudoClasses: [] });
        if (focusPalette.offset !== "-3px" || focusPalette.actual !== focusPalette.expected) throw new Error(JSON.stringify(focusPalette));
        const helpPalette = await evaluate(client, `(async () => {
          const settle = () => new Promise(resolve => setTimeout(resolve, 200));
          const help = document.querySelector('[data-test="neutral-help"]');
          const report = document.querySelector('[data-test="report-help"]');
          const install = document.querySelector('[data-test="install-help"]');
          const late = document.createElement('a');
          late.className = 'list-group-item-light';
          late.href = '/other';
          late.textContent = 'Another guide';
          document.body.append(late);
          document.body.classList.add('night-mode');
          help.style.setProperty('transition', 'none', 'important');
          await settle();
          const color = node => getComputedStyle(node).backgroundColor;
          const probe = document.createElement('i');
          document.body.append(probe);
          const token = name => {
            probe.style.backgroundColor = 'var(--s98p-' + name + ')';
            return color(probe);
          };
          const current = document.querySelector('.pagination .page-item.active .page-link');
          const inactive = document.querySelector('.pagination a.page-link');
          const selection = () => {
            probe.style.backgroundColor = 'color-mix(in srgb,var(--s98p-accent) 16%,var(--s98p-surface))';
            const expected = color(probe);
            return color(current) === expected && color(inactive) !== expected && getComputedStyle(current).borderTopColor === token('accent');
          };
          const darkPage = selection();
          const dark = color(help) === token('surface-2') && color(late) === token('surface-2');
          const installThemed = install.getAttribute('data-soft98-pro-help-action') === 'install' &&
            color(install) === token('surface-2') && getComputedStyle(install,'::after').display === 'none' &&
            install.href === 'https://example.org/install';
          Soft98Pro.configure({darkDesign:false});
          await settle();
          const light = color(help) === token('surface-2') && color(help) !== 'rgb(37, 37, 37)';
          const lightPage = selection();
          Soft98Pro.configure({rgbMode:true});
          await settle();
          const rgb = color(help) === token('surface-2') && color(help) !== 'rgb(37, 37, 37)';
          const rgbPage = selection();
          Soft98Pro.configure({pro:false});
          document.body.classList.add('night-mode');
          await settle();
          const stock = color(help) === 'rgb(37, 37, 37)' && color(late) === 'rgb(37, 37, 37)';
          const stockPage = color(current) === 'rgb(54, 76, 32)' && getComputedStyle(current).borderTopColor === 'rgb(54, 76, 32)';
          const installStock = color(install) === 'rgb(40, 62, 18)' && getComputedStyle(install,'::after').backgroundImage.includes('radial-gradient');
          const reportUnchanged = !report.hasAttribute('data-soft98-pro-help-action') && color(report) === 'rgb(113, 38, 59)';
          Soft98Pro.configure({pro:true,darkDesign:true,rgbMode:false});
          help.style.removeProperty('transition');
          probe.remove();
          late.remove();
          return {dark, light, rgb, stock, reportUnchanged, installThemed, installStock, darkPage, lightPage, rgbPage, stockPage};
        })()`);
        for (const [field, value] of Object.entries(helpPalette)) assertEqual("download help palette", field, value, true);
        assertEqual(name, "clean icon after expiry", await faviconPixel(client), idleDark);
        const toastContract = await evaluate(client, `(async () => {
          const source = document.querySelector('[data-soft98-pro-password]');
          const input = source.querySelector('input');
          const copy = document.querySelector('[data-soft98-pro-password-actions] button');
          const toast = document.querySelector('[data-soft98-pro-copy-toast]');
          const message = toast.querySelector('[data-role=message]');
          const originalCopy = document.execCommand;
          document.execCommand = command => command === 'copy';
          try {
            source.setAttribute('data-text_success', 'First server-provided instruction');
            copy.click();
            const first = message.textContent;
            source.setAttribute('data-text-success', 'Updated server-provided instruction');
            copy.click();
            const updated = message.textContent;
            const selected = document.activeElement === input && input.selectionEnd - input.selectionStart === input.value.length;
            source.removeAttribute('data-text_success');
            source.removeAttribute('data-text-success');
            copy.click();
            const fallback = Boolean(message.textContent) && message.textContent !== first && message.textContent !== updated;
            const content = document.createElement('div');
            content.innerHTML = '<strong>Server response</strong> <a href="/help" onclick="window.didRun=1">Guide</a> <a href="javascript:void(0)">Bad link</a><script>untrusted()</' + 'script>';
            const notify = () => document.dispatchEvent(new CustomEvent('soft98-pro:site-toast', { cancelable:true, detail:{content,duration:8000} }));
            const handled = !notify();
            const safe = message.querySelector('strong')?.textContent === 'Server response' &&
              message.querySelector('a[href]')?.pathname === '/help' && message.querySelectorAll('a[href]').length === 1 &&
              !message.querySelector('[onclick],script') && !message.textContent.includes('untrusted');
            toast.querySelector('button').click();
            const dismissed = !toast.hasAttribute('data-visible');
            Soft98Pro.configure({pro:false});
            const nativeFallback = notify();
            Soft98Pro.configure({pro:true});
            return { first:first === 'First server-provided instruction', updated:updated === 'Updated server-provided instruction',
              selected, fallback, handled, safe, dismissed, nativeFallback };
          } finally { document.execCommand = originalCopy; }
        })()`);
        for (const [field, value] of Object.entries(toastContract)) assertEqual("toast content", field, value, true);
        await evaluate(client, `document.querySelector('[data-test="direct-download"]').scrollIntoView(); true`);
        for (let attempt = 0; attempt < 15; attempt += 1) {
          if (await evaluate(client, `JSON.parse(localStorage.getItem('soft98-pro.download-metadata') || '[]').some(([url, value]) =>
            url.endsWith('/metadata.zip') && value.bytes === 8200000 && value.modified > 0)`)) break;
          if (attempt === 14) throw new Error("Download HEAD metadata was not cached");
          await delay(100);
        }
        const metadata = await evaluate(client, `document.querySelector('[data-test="direct-download"] [data-soft98-pro-download-meta]').textContent`);
        const date = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeZone: "UTC" }).format(new Date("2026-11-13T12:00:00Z"));
        if (!metadata.includes(date)) throw new Error("Download date was not displayed in the Persian calendar");
      }
      if (name === "taunt-dark") {
        await waitForFaviconPixel(client, badgeDark, "the optional success badge");
        await delay(6100);
        assertEqual(name, "expired success notification", await evaluate(client, `window.Soft98Pro.configure({ taunt: true }); Boolean(document.getElementById("soft98-ad-blocker-taunt"))`), false);
        assertEqual(name, "clean icon after success", await faviconPixel(client), idleDark);
      }
    }
    await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await evaluate(client, `(() => {
      const hash = "b".repeat(64);
      document.documentElement.setAttribute("data-soft98-pro-compatibility", encodeURIComponent(JSON.stringify({ sha256: hash })));
      window.dispatchEvent(new CustomEvent("soft98-pro:compatibility"));
    })()`);
    await waitForFaviconPixel(client, badgeDark, "the compatibility badge");
    await delay(750);
    assertEqual("reduced motion", "static badge", await faviconPixel(client), badgeDark);
    await evaluate(client, `document.querySelector('#soft98-pro-compatibility [data-action=keep]').click()`);
    const rgbIdle = await faviconPixel(client);
    if (rgbIdle === badgeDark) throw new Error("Dismissing the notification did not clear its favicon badge");
    await delay(500);
    assertEqual("dismissed notice", "clean icon remains", await faviconPixel(client), rgbIdle);
    await client.send("Emulation.setEmulatedMedia", { features: [] });
    for (const [width, columns] of [[1000, 2], [375, 1]]) {
      await client.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await client.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/test/comments.html?width=${width}#${columns}` });
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const result = await evaluate(client, "document.querySelector('#result')?.textContent").catch(() => "");
        if (result === "comments-pass") break;
        if (attempt === 29 || String(result).includes("Error:")) throw new Error(`Comments at ${width}px: ${result}`);
        await delay(100);
      }
    }
    await client.send("Emulation.clearDeviceMetricsOverride");
    await client.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/test/listing-navigation.html` });
    for (let attempt = 0; attempt < 30 && await evaluate(client, "typeof verifyListingNavigation") !== "function"; attempt += 1) {
      await delay(100);
    }
    assertEqual("quick navigation", "listing fixture", await evaluate(client, "verifyListingNavigation()"), "pass");
    await evaluate(client, "setTimeout(triggerListingFallback, 100); true");
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (await evaluate(client, "document.title").catch(() => "") === "Full-page fallback") break;
      if (attempt === 29) throw new Error("Unsupported AJAX response did not fall back to ordinary navigation");
      await delay(100);
    }
    const userscript = fs.readFileSync(path.join(ROOT, "soft98-pro.user.js"), "utf8");
    const { identifier } = await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `window.__soft98HadRootAtStart = Boolean(document.documentElement);\n${userscript}`,
    });
    try {
      const fallbackUrl = new URL(await evaluate(client, "location.href"));
      fallbackUrl.searchParams.set("document-start", "1");
      await client.send("Page.navigate", { url: fallbackUrl.href });
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const result = await evaluate(client, `[
          location.search,
          window.__soft98HadRootAtStart,
          document.documentElement?.hasAttribute("data-soft98-runtime-ready")
        ]`).catch(() => []);
        if (result[0] === "?document-start=1" && result[2]) {
          assertEqual("userscript", "runs before the document root exists", result[1], false);
          break;
        }
        if (attempt === 29) throw new Error("Userscript did not initialize after the document root appeared");
        await delay(100);
      }
    } finally {
      await client.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    }
    await verifyFileActions(client);
    await verifyDownloadManager(client);
    await verifyIssue16(client);
    await verifyIssue16EarlyReload(client);
    await verifyAppearanceBridge(client);
    await verifyThemeRestore(client);
    await verifyRgbMedia(client);
    await verifyWideLayout(client);
    await verifyPostArtwork(client);
    await verifyTopbar(client);
    await verifyTopbarSearch(client);
    await verifySearchHint(client);
    await verifyInitialContentScroll(client);
    await verifyNewsAndContactTones(client);
    await verifyLinkdoni(client);
    console.log("Soft98 runtime browser acceptance passed");
  } finally {
    if (client) client.close();
    await terminateTree(chrome);
    server.kill();
    const resolvedProfile = path.resolve(profile);
    const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
    if (resolvedProfile.startsWith(tempRoot) && path.basename(resolvedProfile).startsWith("soft98-pro-runtime-")) {
      try {
        fs.rmSync(resolvedProfile, { force: true, recursive: true, maxRetries: 5, retryDelay: 250 });
      } catch (error) {
        if (process.platform !== "win32" || !["EPERM", "EBUSY", "ENOTEMPTY"].includes(error.code)) throw error;
      }
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
