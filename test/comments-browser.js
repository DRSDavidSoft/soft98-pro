"use strict";

// Run with Playwright available on NODE_PATH, or installed in the workspace.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const fixture = pathToFileURL(path.join(__dirname, "comments.html")).href;
const pane = "[data-soft98-pro-comments]";

async function replay(page, file, directory, light, screenshot) {
  const origin = "https://soft98.ir";
  const url = origin + "/internet/remote-control/15737-anydesk-download.html";
  const nativeCss = path.join(directory, "soft98-comments-native.css");
  const nativeJs = path.join(directory, "soft98-comments-native.js");
  const blocked = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      blocked.push(request.method());
      return route.abort();
    }
    if (request.url() === url) return route.fulfill({
      path: file,
      contentType: "text/html; charset=utf-8",
      headers: { "content-security-policy": "form-action 'none'; connect-src 'none'" }
    });
    const target = new URL(request.url());
    if (target.origin !== origin) return route.abort();
    if (target.pathname.endsWith("/style.min.css")) return route.fulfill({ path: nativeCss, contentType: "text/css" });
    if (target.pathname.endsWith("/application.min.packed.js")) return route.fulfill({
      path: nativeJs, contentType: "text/javascript"
    });
    const font = target.pathname.match(/\/(IRANSansWeb(?:_Bold)?\.woff2)$/)?.[1];
    if (font && fs.existsSync(path.join(directory, "soft98-comments-" + font))) {
      return route.fulfill({ path: path.join(directory, "soft98-comments-" + font), contentType: "font/woff2" });
    }
    return route.abort();
  });
  await page.goto(url, { waitUntil: "load" });
  await page.addScriptTag({ path: path.join(root, "src/comments.js") });
  const css = fs.readFileSync(path.join(root, "src/comments.css"), "utf8");
  const palette = `:root.soft98-pro-theme { color-scheme: dark; }
    :root.soft98-pro-light { color-scheme: light; --s98p-bg: #e9eff2; --s98p-bg-2: #f2f6f8;
      --s98p-surface: #fff; --s98p-surface-2: #edf4f5; --s98p-text: #172e39; --s98p-muted: #435e6b;
      --s98p-border: #a8bdc6; --s98p-border-soft: #d4e0e5; --s98p-accent: #087468; --s98p-link: #205b88; }`;
  await page.evaluate(({ useLight, css, palette }) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(palette + "\n" + css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    document.documentElement.classList.add("soft98-pro-theme");
    document.documentElement.classList.toggle("soft98-pro-light", useLight);
    const labels = {
      "comments.title": "گفت‌وگو",
      "comments.empty": "هنوز نظری ثبت نشده.",
      "comments.editorLabel": "متن نظر"
    };
    const controller = Soft98Comments.create(document);
    window.syncCommentsFixture = () => controller.sync({ text: (key) => labels[key] });
    window.syncCommentsFixture();
  }, { useLight: light, css, palette });
  const discussion = page.locator(pane);
  assert.equal(await discussion.count(), 1);
  const tabId = await discussion.getAttribute("aria-labelledby");
  assert.ok(tabId);
  await page.locator('[role="tab"]').filter({ hasText: /ارسال نظر/ }).click();
  const opener = discussion.locator('form[name="comment-add-form"] [data-toggle="collapse"]');
  const textarea = discussion.locator('textarea[name="comments"]');
  await opener.waitFor({ state: "visible" });
  assert.equal(await textarea.isVisible(), false);
  await opener.click();
  await textarea.waitFor({ state: "visible" });
  await page.evaluate(() => window.syncCommentsFixture());
  assert.equal(await discussion.locator('[data-soft98-pro-comments-part="title"]').count(), 1);
  await page.evaluate(() => document.fonts.ready);
  const metrics = await discussion.evaluate((node) => {
    const fields = node.querySelector('[data-soft98-pro-comments-structure="fields"]');
    return {
      width: node.clientWidth,
      scrollWidth: node.scrollWidth,
      direction: getComputedStyle(node).direction,
      background: getComputedStyle(node).backgroundColor,
      columns: getComputedStyle(fields).gridTemplateColumns.split(" ").length,
      divider: getComputedStyle(node.querySelector('[data-soft98-pro-comments-structure="composerHeading"]')).borderBlockEndColor,
      cards: node.querySelectorAll('[data-soft98-pro-comments-structure="comment"]').length
    };
  });
  assert.equal(metrics.direction, "rtl");
  assert.ok(metrics.scrollWidth <= metrics.width, JSON.stringify(metrics));
  assert.equal(metrics.background, light ? "rgb(255, 255, 255)" : "rgb(21, 27, 35)", JSON.stringify(metrics));
  assert.equal(metrics.columns, page.viewportSize().width < 420 ? 1 : 2, JSON.stringify(metrics));
  assert.equal(metrics.cards, 2);
  assert.equal(metrics.divider, light ? "rgb(212, 224, 229)" : "rgb(40, 51, 63)");
  assert.deepEqual(blocked, []);
  if (screenshot) {
    await page.evaluate(() => {
      // Keep native sticky navigation from covering the panel in element screenshots.
      for (const node of document.querySelectorAll("body *")) {
        if (/^(fixed|sticky)$/.test(getComputedStyle(node).position)) node.style.setProperty("position", "static", "important");
      }
    });
    await page.mouse.move(0, 0);
    await discussion.screenshot({ path: screenshot });
  }
  console.log("Captured live AnyDesk HTML replay:", page.viewportSize().width, light ? "light" : "dark", metrics);
}

async function main() {
  const chrome = process.env.CHROME_PATH || (process.platform === "win32"
    ? path.join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe")
    : undefined);
  const browser = await chromium.launch({ executablePath: chrome, channel: chrome ? undefined : "chrome" });
  try {
    for (const width of [360, 930]) {
      const page = await browser.newPage({ viewport: { width, height: 850 }, serviceWorkers: "block" });
      await page.goto(fixture + (width < 420 ? "#1" : "#2"));
      const result = page.locator("#result");
      assert.equal(await result.textContent(), "comments-pass");
      console.log("Comments fixture passed:", width);
      await page.close();
    }
    const capture = process.env.SOFT98_COMMENTS_CAPTURE;
    if (capture) {
      for (const [width, light] of [[360, false], [360, true], [1180, false], [1180, true]]) {
        const page = await browser.newPage({ viewport: { width, height: 850 }, serviceWorkers: "block" });
        try {
          const directory = path.dirname(capture);
          const screenshot = path.join(directory, "soft98-comments-" + width + (light ? "-light" : "-dark") + ".png");
          await replay(page, capture, directory, light, screenshot);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
