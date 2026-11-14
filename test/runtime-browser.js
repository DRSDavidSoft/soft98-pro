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
    downloadIcons: "chevron,windows,download,apple,linux,apple,android,download,download,info,link,lock",
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
    logoRestored: true,
    constructableTheme: true,
    utilityLayout: "utility-list",
    utilityRows: true,
    utilityCopies: true,
  };
  for (const [field, value] of Object.entries(exact)) assertEqual(name, field, results[field], value);
  if (expected.dark) {
    if (expected.rgb) {
      if (results.megamenuBackgroundImage !== "none" || !/^rgb\((?:8, 10, 11|6, 7, 8)\)$/.test(results.megamenuBackground || "")) {
        throw new Error(`${name}: RGB megamenu must use a solid neutral night surface`);
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
    assertEqual(name, "light control panel", results.controlBackground, "rgb(245, 249, 255)");
    assertEqual(name, "light control text", results.controlForeground, "rgb(20, 40, 74)");
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
    const badgeDark = "255,209,102";
    let idleDark;
    const cases = [
      ["default-dark", "taunt=0&dark=1", { dark: true, rgb: false, tauntTheme: null, tauntBackground: null, logo: "pirateDark" }],
      ["taunt-dark", "taunt=1&dark=1", { dark: true, rgb: false, tauntTheme: "dark", tauntBackground: "rgb(16, 27, 36)", logo: "pirateDark" }],
      ["taunt-light", "taunt=1&dark=0", { dark: false, rgb: false, tauntTheme: "light", tauntBackground: "rgb(247, 250, 252)", logo: "light" }],
      ["rgb", "taunt=0&dark=1&rgb=1", { dark: true, rgb: true, tauntTheme: null, tauntBackground: null, logo: "pirateDark" }],
    ];
    for (const [name, query, expected] of cases) {
      await client.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?${query}` });
      const results = await waitForResults(client);
      assertCase(name, results, expected);
      if (name === "default-dark") {
        idleDark = await faviconPixel(client);
        if (idleDark.split(",").some(value => Number(value) > 40)) throw new Error("The idle favicon has a bright badge");
        const controls = await evaluate(client, `
          (async () => {
            const article = document.querySelector('[data-test="download-article"]');
            const [group, more] = article.querySelectorAll('[data-soft98-pro-download-actions]');
            const button = group.querySelector('[aria-expanded]');
            const linked = button.getAttribute('aria-controls').split(' ').map(id => document.getElementById(id));
            const outside = article.querySelector('[data-test="article-placeholder"]');
            const row = article.querySelector('[data-test="download-copy"]');
            const title = row.querySelector('[data-soft98-pro-download-title]').getBoundingClientRect();
            const meta = row.querySelector('[data-soft98-pro-download-meta]').getBoundingClientRect();
            let copied;
            Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{writeText: async value => { copied = value; }} });
            try {
              group.querySelector('button').click();
              await Promise.resolve();
            } finally {
              delete navigator.clipboard;
            }
            button.click();
            const collapsed = linked.every(entry => !entry.getClientRects().length) && !!outside.getClientRects().length;
            button.click();
            const reopened = linked.every(entry => !!entry.getClientRects().length);
            const input = article.querySelector('[data-soft98-pro-password] input');
            input.click();
            return { copied, collapsed, reopened, placeholderExcluded: more.querySelector('button').hidden,
              onePasswordAction: article.querySelectorAll('[data-soft98-pro-password-actions] button').length === 1,
              passwordSelected: document.activeElement === input && input.selectionStart === 0 && input.selectionEnd === input.value.length,
              metadataFits: meta.height > 0 && meta.top >= title.bottom - 1 && meta.bottom <= row.getBoundingClientRect().bottom + 1 };
          })()
        `);
        assertEqual(name, "group clipboard", controls.copied,
          ["https://dl2.soft98.ir/files/metadata.zip",
            "https://dl2.soft98.ir/files/signed.zip?token=123456"].join("\n"));
        for (const [field, value] of Object.entries(controls)) {
          if (field !== "copied") assertEqual(name, field, value, true);
        }
        await waitForFaviconPixel(client, badgeDark, "the copy badge");
        await waitForFaviconPixel(client, idleDark, "the off frame");
        await waitForFaviconPixel(client, badgeDark, "a second pulse");
        await waitForFaviconPixel(client, idleDark, "the clean icon after the second pulse");
        await delay(850);
        assertEqual(name, "expired copy toast", await evaluate(client, "Boolean(document.querySelector('[data-soft98-pro-copy-toast][data-visible]'))"), false);
        assertEqual(name, "clean icon after expiry", await faviconPixel(client), idleDark);
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
