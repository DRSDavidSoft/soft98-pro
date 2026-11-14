#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const root = path.join(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const substitutions = {
  VERSION: "test",
  BUILD_TARGET: "userscript",
  RECOMMEND_EXTENSION: "false",
  BRAND_ASSETS: "{}",
  MESSAGES: source("src/messages.json"),
  COMPATIBILITY: source("src/compatibility/soft98-scripts.json"),
  PAGE_ICONS: "{}",
  UTILITY_PATH_ICONS: "{}",
  LISTING_NAVIGATION_CSS: '""',
  COMMENTS_CSS: '""',
  CHROME_CSS: '""',
  EARLY_ADS_CSS: '""',
  OPTION_PREVIEWS: JSON.stringify({ rgbMode: { files: ["dark-on.webp", "rgb.webp", "rgb-still.webp"].map((file) =>
    "data:image/webp;base64," + fs.readFileSync(path.join(root, "docs", "assets", "settings", file)).toString("base64")), illustrated: false } }),
};
const runtime = ["src/patch-engine.js", "src/listing-navigation.js", "src/comments.js"].map(source).join("\n") + "\n" + source("src/runtime.js").replace(/__SOFT98_([A-Z_]+)__/g,
  (token, name) => Object.hasOwn(substitutions, name) ? substitutions[name] : token);

async function verify() {
  const frame = document.querySelector("iframe");
  const win = frame.contentWindow;
  const doc = win.document;
  const get = (selector) => doc.querySelector(selector);
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let attempt = 0; attempt < 10 && !get("#soft98-pro-control"); attempt += 1) await wait(50);
  const wrap = get("#soft98-pro-control");
  const form = get("#soft98-pro-console");
  const role = (name) => get(`#soft98-pro-control [data-role=${name}]`);
  const toggle = role("toggle");
  const menu = get("#soft98-pro-launcher-menu");
  const keyboard = (target, key, extra = {}) => target.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true, ...extra }));
  const fits = (node) => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.top >= -1 &&
      rect.right <= doc.documentElement.clientWidth + 1 && rect.bottom <= doc.documentElement.clientHeight + 1;
  };
  const drag = (x, y, complete = true) => {
    const rect = toggle.getBoundingClientRect();
    const pointer = (target, type, clientX, clientY) => target.dispatchEvent(new win.PointerEvent(type, {
      clientX, clientY, button: 0, isPrimary: true, pointerId: 2, bubbles: true,
    }));
    pointer(toggle, "pointerdown", rect.left + 21, rect.top + 21);
    const anchor = wrap.style.left;
    for (let i = 0; i < 20; i++) pointer(win, "pointermove", x - 1, y);
    pointer(win, "pointermove", x, y);
    check(!wrap.style.translate && wrap.style.left === anchor, "Pointer burst did layout before the next frame");
    pointer(win, complete ? "pointerup" : "pointercancel", x, y);
  };

  check(form, `Control did not mount: ${doc.body.dataset.error || "no runtime error"}`);
  check(form.hidden && form.inert && form.getClientRects().length === 0, "Initial closed state has a layout box");
  toggle.click();
  const panelMotion = form.getAnimations()[0];
  check(panelMotion, "Opening the panel did not start a transition");
  panelMotion.pause();
  panelMotion.currentTime = 120;
  const openingOpacity = Number(win.getComputedStyle(form).opacity);
  check(openingOpacity > 0 && openingOpacity < 1, "Opening the panel skipped its intermediate frame");
  panelMotion.finish();
  const appearance = get('#soft98-pro-control [data-section="experience"]');
  appearance.click();
  check(!get('input[name="expandMain"]').checked && get('input[name="utilityInHeader"]').checked,
    "A new installation must prefer the top-bar utility list over scroll widening");
  const panels = get(".s98p-panels");
  const setting = get('#soft98-pro-control input[name="rgbMode"]');
  const option = setting.closest("label");
  const preview = get(".s98p-option-preview");
  option.scrollIntoView({ block: "nearest" });
  await wait(100);
  const bounds = () => [option.getBoundingClientRect().height, form.getBoundingClientRect().height, panels.scrollHeight, panels.scrollTop];
  const before = bounds();
  option.dispatchEvent(new win.PointerEvent("pointerenter", { pointerType: "mouse" }));
  await wait(300);
  check(!preview.hidden && fits(preview) && preview.querySelectorAll('img[src^="data:image/webp"]').length === 2,
    "Real before/after preview is missing or outside the viewport");
  check(JSON.stringify(bounds()) === JSON.stringify(before), "Preview changed the row height, panel height, or scroll position");
  option.dispatchEvent(new win.PointerEvent("pointerleave", { pointerType: "mouse" }));
  check(preview.hidden, "Preview stayed open after leaving the row");
  setting.focus();
  panels.scrollTop = 120;
  const scroll = panels.scrollTop;
  check(scroll > 0, "Appearance panel fixture does not scroll");
  setting.click();
  check(get(".s98p-panels") === panels && panels.scrollTop === scroll && doc.activeElement === setting && wrap.dataset.theme === "rgb",
    "Settings rebuilt the panel, lost scroll/focus, or did not apply RGB");
  check(get('#soft98-pro-control input[name="utilityInHeader"]')?.closest('[data-panel="experience"]'), "Header utility switch is missing");
  check(get('#soft98-pro-control input[name="soundFeedback"]')?.closest('[data-panel="advanced"]'), "Sound switch is missing");
  const animation = doc.documentElement.getAnimations().find((value) => value.animationName === "soft98-pro-neon");
  check(animation, "Page RGB animation missing");
  animation.pause();
  animation.currentTime = 0;
  const accent = win.getComputedStyle(wrap).getPropertyValue("--c-accent");
  const readAccent = (node, pseudo) => win.getComputedStyle(node, pseudo).backgroundImage;
  const ribbon = readAccent(form, "::before");
  const selectedLine = readAccent(appearance, "::after");
  const colors = [...ribbon.matchAll(/(?:rgb|hsl|color)\([^)]+\)/g)].map(([color]) => color);
  const frameGradient = readAccent(form), launcherGradient = readAccent(toggle);
  const gradientCount = (value) => (value.match(/linear-gradient\(/g) || []).length;
  check(new Set(colors).size === 3 && ribbon === selectedLine && gradientCount(frameGradient) === 2 && gradientCount(launcherGradient) === 2,
    "RGB flattened the control-center surface or its three-color accent: " + ribbon);
  animation.currentTime = 5300;
  check(win.getComputedStyle(wrap).getPropertyValue("--c-accent") !== accent, "Panel accent does not follow the page animation");
  check(readAccent(form, "::before") !== ribbon, "The ribbon gradient does not animate");
  check(readAccent(form) !== frameGradient && readAccent(toggle) !== launcherGradient, "RGB borders do not animate");

  role("diagnostics").click();
  const report = get("#soft98-pro-report");
  check(!report.hidden && report.querySelectorAll("dt").length >= 6 && doc.activeElement === report.querySelector("h2"), "Report is not visible or focused");
  report.getAnimations()[0].finish();
  await wait(30);
  const reportHeight = report.getBoundingClientRect().height;
  role("diagnostics").click();
  const reportMotion = report.getAnimations()[0];
  check(reportMotion && !report.hidden && report.inert && doc.activeElement === role("diagnostics"), "Report was not animated closed");
  reportMotion.pause();
  reportMotion.currentTime = 115;
  check(report.getBoundingClientRect().height < reportHeight && report.getBoundingClientRect().height > 0, "Report snapped closed");
  reportMotion.finish();
  await wait(30);
  check(report.hidden, "Report stayed visible after its closing transition");
  role("close").click();
  check(form.inert && doc.activeElement === toggle, "Closing did not remove focus from the panel");
  const closingMotion = form.getAnimations()[0];
  check(closingMotion && !form.hidden, "Closing the panel skipped the animation");
  closingMotion.pause();
  closingMotion.currentTime = 110;
  const closingOpacity = Number(win.getComputedStyle(form).opacity);
  check(closingOpacity > 0 && closingOpacity < 1, "Closing the panel skipped its intermediate frame");
  closingMotion.finish();
  await closingMotion.finished;
  check(form.hidden && form.getClientRects().length === 0, "Closed panel still has a layout box after animation");
  toggle.click();
  role("close").click();
  toggle.click();
  const reopeningMotion = form.getAnimations()[0];
  reopeningMotion.finish();
  await reopeningMotion.finished;
  check(!form.hidden && !form.inert, "A stale transition hid a reopened panel");
  doc.body.dispatchEvent(new win.PointerEvent("pointerdown", { bubbles: true }));
  check(form.inert && wrap.dataset.open === "false", "Outside press did not close the panel");

  keyboard(toggle, "F10", { shiftKey: true });
  check(!menu.hidden && doc.activeElement === menu.querySelector("button") && fits(menu), "Keyboard could not open the launcher menu");
  keyboard(doc.activeElement, "End");
  check(doc.activeElement.dataset.command === "tuck", "Menu keyboard movement failed");
  keyboard(doc.activeElement, "Escape");
  check(menu.hidden && doc.activeElement === toggle, "Escape did not return focus to launcher");
  drag(win.innerWidth - 24, 30, false);
  check(wrap.dataset.inlineEdge === "left" && !toggle.hidden, "Cancelled drag moved the launcher");
  const nearEdge = doc.documentElement.clientWidth - 75;
  drag(nearEdge, 42);
  check(wrap.dataset.inlineEdge === "right" && !toggle.hidden, "Drag did not snap to the top-right corner");
  check(get(".s98p-dock-target").hidden && toggle.getAnimations().some(animation => animation.effect.getTiming().duration === 235),
    "Docking did not settle with a visible snap");

  frame.style.width = "330px";
  frame.style.height = "240px";
  await wait(100);
  win.dispatchEvent(new win.Event("resize"));
  const docked = wrap.getBoundingClientRect();
  check(Math.abs(doc.documentElement.clientWidth - docked.right - 12) < 2 && Math.abs(docked.top - 12) < 2,
    `Docked corner moved after viewport resize (${doc.documentElement.clientWidth}, ${docked.right}, ${docked.top})`);
  toggle.click();
  await wait(300);
  check(fits(form) && form.dataset.short === "true" && form.scrollHeight > form.clientHeight, "Small viewport panel is clipped or lacks a scrollbar");
  role("options").click();
  check(!menu.hidden && fits(menu), "Menu overflows a short viewport");
  keyboard(doc.activeElement, "Escape");
  drag(doc.documentElement.clientWidth - 2, 95);
  check(toggle.hidden && !role("restore").hidden && fits(role("restore")), "Edge drag did not expose a recoverable tab");
  const saved = JSON.parse(win.localStorage.getItem("soft98-ad-blocker.control-position"));
  check(saved.tucked && saved.inlineEdge === "right", "Tucked state or dock was not saved");
  role("restore").click();
  check(!toggle.hidden && doc.activeElement === toggle, "Recovery tab did not restore the launcher and focus");
  role("toggle").dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  menu.querySelector('[data-command="reset"]').click();
  check(menu.hidden && wrap.dataset.inlineEdge === "left", "Reset command did not restore default docking");
  return "PASS";
}

async function main() {
  const chrome = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((file) => file && fs.existsSync(file));
  if (!chrome) throw new Error("Chrome/Chromium is required for the control center test");
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/runtime.js") {
      response.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
      return response.end(runtime);
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    if (url.pathname === "/frame") return response.end('<!doctype html><html><meta charset="utf-8"><title>Soft98 test</title><body><script>window.addEventListener("error", (event) => document.body.dataset.error = event.error?.stack || event.message);</script><script src="/runtime.js"></script></body></html>');
    response.end(`<!doctype html><html><body data-result="PENDING"><iframe style="width:950px;height:550px;border:0" src="/frame"></iframe><script>
      document.querySelector('iframe').addEventListener('load', () => (${verify.toString()})().then(
        (result) => { document.body.dataset.result = result; },
        (error) => { document.body.dataset.result = 'FAIL'; document.querySelector('iframe').after(error.stack); }
      ), {once:true});
    </script></body></html>`);
  });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "soft98-control-test-"));
  try {
    await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).on("error", reject));
    const { stdout } = await promisify(execFile)(chrome, ["--headless=new", "--disable-gpu", "--disable-extensions", "--no-sandbox",
      `--user-data-dir=${profile}`, "--dump-dom", "--virtual-time-budget=3500", `http://127.0.0.1:${server.address().port}/`], { timeout: 30000 });
    if (!stdout.includes('<body data-result="PASS">')) throw new Error(stdout.match(/<\/iframe>([^<]+)/)?.[1] || "Control center fixture did not finish");
    console.log("Soft98 Pro control center browser tests passed");
  } finally {
    server.close();
    fs.rmSync(profile, { force: true, recursive: true, maxRetries: 8, retryDelay: 300 });
  }
}

main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
