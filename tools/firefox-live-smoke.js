"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { PNG } = require("pngjs");

const driver = new URL(process.env.SOFT98_WEBDRIVER || "http://127.0.0.1:44983");
const url = process.env.SOFT98_LIVE_URL || "https://soft98.ir/internet/remote-control/15737-anydesk-download.html";

async function request(method, endpoint, body) {
  if (driver.protocol !== "http:" || driver.hostname !== "127.0.0.1" || driver.username || driver.password) {
    throw new Error("The smoke test requires a local Firefox WebDriver");
  }
  const response = await fetch(new URL(endpoint, driver), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
    redirect: "error",
  });
  const { value } = await response.json();
  if (!response.ok) throw new Error(`${endpoint}: ${value.message}`);
  return value;
}

async function screenshot(session, destination) {
  const base64 = await request("GET", session + "/screenshot");
  if (typeof base64 !== "string" || base64.length > 24 * 1024 * 1024 || !base64.startsWith("iVBORw0KGgo")) {
    throw new Error("WebDriver did not return a bounded PNG screenshot");
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 33 || bytes.toString("ascii", 12, 16) !== "IHDR" ||
      bytes.readUInt32BE(16) > 4096 || bytes.readUInt32BE(20) > 4096) {
    throw new Error("Unexpected screenshot dimensions");
  }
  const frame = PNG.sync.read(bytes);
  await fs.writeFile(destination, PNG.sync.write(frame));
}

async function main() {
  const downloadDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "soft98-firefox-downloads-"));
  let session;
  try {
    const { sessionId, capabilities } = await request("POST", "/session", {
      capabilities: {
        alwaysMatch: {
          browserName: "firefox",
          pageLoadStrategy: "eager",
          "moz:firefoxOptions": { args: ["-headless"], prefs: {
            "network.proxy.type": 0,
            "browser.download.folderList": 2,
            "browser.download.dir": downloadDirectory,
            "browser.download.useDownloadDir": true,
          } },
        },
      },
    });
    session = `/session/${sessionId}`;
    const post = (route, body) => request("POST", session + route, body);
    const evaluate = (script) => post("/execute/sync", { script, args: [] });
    const width = Number(process.env.SOFT98_VIEWPORT_WIDTH || 1440);
    await post("/window/rect", { width, height: 1000 });
    const addon = process.env.SOFT98_BASELINE === "1" ? null : await post("/moz/addon/install", {
      path: path.resolve(__dirname, "..", "dist", "packages", `soft98-pro-firefox-${require("../package.json").version}.zip`),
      temporary: true,
    });
    await post("/url", { url });
    let result;
    for (let attempt = 0; attempt < 12; attempt++) {
      result = await evaluate(`
        const control = document.querySelector('#soft98-pro-control');
        const box = control?.getBoundingClientRect();
        const panel = control?.querySelector('form');
        return {
          url: location.href, title: document.title,
          version: window.Soft98Pro?.version,
          theme: document.documentElement.classList.contains('soft98-pro-theme'),
          control: box && { width: box.width, height: box.height, position: getComputedStyle(control).position, panelVisible: Boolean(panel?.getClientRects().length) },
          promotions: document.querySelectorAll('#soft98-ad-blocker-taunt,#soft98-extension-recommendation').length,
          preservedLinks: [...document.querySelectorAll('a[data-soft98-adblocker-href]')].filter(a => a.getClientRects().length && /^https?:/.test(a.href)).length,
          brand: [...document.querySelectorAll('[data-soft98-brand-variant]')].map(n => ({
            variant: n.getAttribute('data-soft98-brand-variant'),
            bundled: n.matches('img') ? n.currentSrc.startsWith('data:image/png;') : getComputedStyle(n).backgroundImage.includes('data:image/png;'),
          })),
          upstream: document.documentElement.getAttribute('data-soft98-pro-upstream'),
          scripts: [...document.scripts].map(s => s.src).filter(s => s.includes('/templates/')),
          headings: [...document.querySelectorAll('h1')].map(h => h.textContent.trim()),
          footer: document.querySelector('footer')?.innerText.trim().slice(0, 180),
          viewport: [innerWidth, innerHeight, document.documentElement.scrollWidth],
          sidebarWidth: document.querySelector('[data-soft98-pro-column=secondary]')?.getBoundingClientRect().width,
          banners: [...document.querySelectorAll('header img')].filter(n => n.getBoundingClientRect().width >= 450 && n.getBoundingClientRect().height <= 180).map(n => n.currentSrc),
          downloadControls: [...document.querySelectorAll('article [role=tabpanel] a[data-key]')].filter(a => a.getClientRects().length).length,
          compactBrand: Boolean(document.querySelector('[data-soft98-brand-compact]')),
          headerAd: [...document.querySelectorAll('header [data-href], header a[href]')].some(a => /ircd[.]me/.test(a.getAttribute('href') || a.getAttribute('data-href') || '')),
          latest: document.querySelectorAll('[data-soft98-pro-latest]').length,
          counters: document.querySelectorAll('[data-soft98-pro-view-count]').length,
          isolatedText: document.querySelectorAll('bdi[dir=ltr]').length,
          downloadPresentation: (() => {
            const group = document.querySelector('[data-soft98-pro-download-group]');
            const primary = group?.querySelector('[data-soft98-pro-icon-host=download]');
            const windows = group?.querySelector('[data-soft98-pro-icon-host=windows]');
            const password = document.querySelector('[data-soft98-pro-password-shell]');
            const tab = document.querySelector('article [data-soft98-pro-surface=tab-list] [data-soft98-pro-tab-active=true]');
            return {
              primary: primary?.textContent.trim(),
              legacyWindows: windows && ['content','display','visibility'].map(key => getComputedStyle(windows, '::before')[key]),
              passwordBackground: password && getComputedStyle(password).backgroundColor,
              tabBorder: tab && getComputedStyle(tab).borderBottomWidth,
              tabIndicator: tab && getComputedStyle(tab).boxShadow,
              tabSurface: tab && getComputedStyle(tab).backgroundImage,
              headingDividers: document.querySelectorAll('[data-soft98-pro-heading-divider]').length,
              headingAccent: (() => {
                const heading = document.querySelector('article [data-soft98-pro-heading-divider]');
                return heading && getComputedStyle(heading, '::before').backgroundImage;
              })(),
              navButtons: document.querySelectorAll('[data-soft98-pro-nav-item]').length,
              glyphSize: windows?.querySelector('svg')?.getBoundingClientRect().width,
              glyphs: [...group?.querySelectorAll('[data-soft98-pro-page-icon] svg') || []]
                .filter(svg => svg.getBoundingClientRect().width > 0).map(svg => svg.parentElement.getAttribute('data-soft98-pro-page-icon')),
            };
          })(),
          utility: (() => {
            const header = document.querySelector('[data-soft98-pro-utility-header]');
            const heading = header?.querySelector('h4');
            const icon = document.querySelector('[data-soft98-pro-utility-icon]');
            const download = document.querySelector('[data-soft98-pro-download-group] dd a');
            return {
              header: Boolean(header),
              dividerColor: heading && getComputedStyle(heading, '::before').color,
              headerBackground: heading && getComputedStyle(heading).backgroundImage,
              iconBackground: icon && getComputedStyle(icon).backgroundColor,
              iconArtwork: icon && getComputedStyle(icon, '::before').backgroundImage !== 'none',
              transparentIcons: document.querySelectorAll('[data-soft98-pro-utility-art=ready]').length,
              downloadIconShadow: download && getComputedStyle(download, '::before').textShadow,
            };
          })(),
        };`);
      if (attempt >= 3 && result.downloadControls && (!addon || (result.control && result.brand.length && !result.banners.length && result.utility.transparentIcons))) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    console.log(JSON.stringify({ addon, browser: capabilities.browserVersion, ...result }, null, 2));
    if (addon && (!result.theme || result.control?.width !== 42 || result.control.height !== 42 || result.control.position !== "fixed" ||
        result.control.panelVisible || !(result.preservedLinks || result.downloadControls) || result.promotions ||
        !result.compactBrand || result.brand.length < 2 || result.brand.some(({ variant, bundled }) => variant !== "pirateDark" || !bundled) ||
        result.banners.length || result.headerAd || !result.latest || !result.counters || !result.isolatedText ||
        !["windows", "apple", "linux", "android", "download"].every(icon => result.downloadPresentation.glyphs.includes(icon)) ||
        !result.downloadPresentation.legacyWindows?.some(value => value === "none" || value === "hidden") || !result.downloadPresentation.primary?.includes("(رایگان)") ||
        !result.downloadPresentation.passwordBackground || result.downloadPresentation.passwordBackground === "rgb(223, 121, 100)" ||
        result.downloadPresentation.glyphSize < 22 ||
        !result.downloadPresentation.tabIndicator?.includes("inset") || !result.downloadPresentation.tabSurface?.includes("gradient") ||
        !result.downloadPresentation.headingDividers || !result.downloadPresentation.headingAccent?.includes("gradient") ||
        result.downloadPresentation.navButtons < 3 ||
        !result.utility.transparentIcons || result.utility.downloadIconShadow !== "none" ||
        (width > 820 && result.sidebarWidth && result.sidebarWidth < 250))) {
      throw new Error("Live Firefox page failed the Soft98 Pro smoke checks");
    }
    if (process.env.SOFT98_LIVE_SCREENSHOT) await screenshot(session, process.env.SOFT98_LIVE_SCREENSHOT);
    if (process.env.SOFT98_UTILITY_SCREENSHOT) {
      await evaluate(`const heading = document.querySelector('[data-soft98-pro-utility-header]') ||
        [...document.querySelectorAll('aside h1,aside h2,aside h3,aside h4')].find(node =>
          node.textContent.normalize('NFKC').replace(/[\\s\\u0640\\u200c\\u200d]+/gu, '') === 'لیستنرمافزارهایکاربردی');
        heading.scrollIntoView({block:'center',behavior:'instant'});`);
      await screenshot(session, process.env.SOFT98_UTILITY_SCREENSHOT);
    }
    if (addon) {
      const button = await post("/element", { using: "css selector", value: "#soft98-pro-control [data-role=toggle]" });
      const buttonId = Object.values(button)[0];
      await post(`/element/${buttonId}/click`, {});
      if (await evaluate("return document.querySelector('#soft98-pro-control').dataset.open") !== "true") {
        throw new Error("Firefox could not open the Pro console");
      }
      const close = await post("/element", { using: "css selector", value: "#soft98-pro-control [data-role=close]" });
      await new Promise((resolve) => setTimeout(resolve, 250));
      await post(`/element/${Object.values(close)[0]}/click`, {});
      await evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
      const closed = await post("/execute/async", { args: [], script: `
        const done = arguments[arguments.length - 1];
        setTimeout(() => {
          const form = document.querySelector('#soft98-pro-control form');
          done({ hidden: form?.getAttribute('aria-hidden'), visible: Boolean(form?.getClientRects().length),
            open: form?.parentElement.dataset.open, scroll: scrollY });
        }, 300);
      ` });
      if (closed.hidden !== "true" || closed.visible) {
        throw new Error(`The closed console became visible at the footer: ${JSON.stringify(closed)}`);
      }
      if (process.env.SOFT98_FOOTER_SCREENSHOT) {
        await screenshot(session, process.env.SOFT98_FOOTER_SCREENSHOT);
      }
      await evaluate("document.querySelector('#soft98-pro-control > form').remove()");
      if (await evaluate("return Boolean(document.querySelector('#soft98-pro-control > form'))") !== true) {
        throw new Error("The removed Pro console did not recover");
      }
      const toggles = await post("/execute/async", { args: [], script: `
        const done = arguments[arguments.length - 1];
        const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        (async () => {
        const latest = [...document.querySelectorAll('[data-soft98-pro-latest]')];
        const prompts = [...document.querySelectorAll('[data-soft98-pro-annoyance]')];
        const visible = (node) => Boolean(node?.getClientRects().length);
        const targets = [...latest, ...prompts].filter(visible);
        const initial = targets.map(visible);
        window.Soft98Pro.configure({ showLatest: false, hideAnnoyances: true });
        await frame();
        const hidden = targets.map(visible);
        window.Soft98Pro.configure({ showLatest: true, hideAnnoyances: false });
        await frame();
        done({ latest: latest.length, initial, hidden, restored: targets.map(visible) });
        })();
      ` });
      if (toggles.latest < 2 || toggles.initial.length < 3 || !toggles.initial.every(Boolean) || toggles.hidden.some(Boolean) || !toggles.restored.every(Boolean)) {
        throw new Error(`Latest and extra-prompt controls did not round-trip: ${JSON.stringify(toggles)}`);
      }
      if (width > 820) {
        await evaluate("document.querySelector('[data-soft98-pro-password-shell]').scrollIntoView({block:'center',behavior:'instant'})");
        const find = (value) => post("/element", { using: "css selector", value }).then((element) => Object.values(element)[0]);
        await post(`/element/${await find('[data-soft98-pro-password-actions] [data-action=select]')}/click`, {});
        const password = await evaluate(`
          const row = document.querySelector('[data-soft98-pro-password-shell]');
          const input = row.querySelector('input[readonly]');
          return { selected: document.activeElement === input && input.selectionStart === 0 && input.selectionEnd === input.value.length,
            dashed: getComputedStyle(input).borderTopStyle === 'dashed', copy: Boolean(row.querySelector('[data-action=copy]')) };
        `);
        if (!password.selected || !password.dashed || !password.copy) throw new Error("Password controls failed");
        await post(`/element/${await find('[data-soft98-pro-password-actions] [data-action=copy]')}/click`, {});
        const copied = await post("/execute/async", { args: [], script: `
          const done = arguments[arguments.length - 1];
          const started = performance.now();
          const check = () => {
            const status = document.querySelector('[data-soft98-pro-password-status]');
            if (status?.textContent || performance.now() - started > 2600) {
              const input = status?.parentElement.querySelector('input[readonly]');
              done({ text: status?.textContent, selected: Boolean(input && document.activeElement === input &&
                input.selectionStart === 0 && input.selectionEnd === input.value.length) });
            } else setTimeout(check, 100);
          };
          check();
        ` });
        if (!["Password copied.", "رمز کپی شد."].includes(copied.text) && !copied.selected) {
          throw new Error(`Firefox did not copy or select the password: ${JSON.stringify(copied)}`);
        }
        console.log(JSON.stringify({ passwordCopy: copied }));
        await evaluate(`document.querySelector('[data-soft98-pro-password-status]').textContent = '';
          document.activeElement.blur();`);
      }
    }
    const preview = process.argv[2] || process.env.SOFT98_DOWNLOAD_SCREENSHOT;
    if (preview) {
      await evaluate("document.querySelector('article [role=tabpanel] a[data-key]').scrollIntoView({block:'center',behavior:'instant'})");
      const compactVisible = await evaluate(`const logo = document.querySelector('[data-soft98-brand-compact][data-soft98-brand-variant="pirateDark"]');
        return Boolean(logo?.getClientRects().length)`);
      if (addon && width > 820 && !compactVisible) throw new Error("The download preview does not show the compact pirate logo");
      await screenshot(session, path.resolve(preview));
    }
    if (process.env.SOFT98_TEST_DOWNLOAD_LINK === "1") {
      const item = await post("/element", { using: "css selector", value: "article [role=tabpanel] a[data-key]" });
      const before = await request("GET", session + "/window/handles");
      await post(`/element/${Object.values(item)[0]}/click`, {});
      const after = await request("GET", session + "/window/handles");
      const newTab = after.find((handle) => !before.includes(handle));
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const remaining = await request("GET", session + "/window/handles");
      const files = await fs.readdir(downloadDirectory);
      const clickResult = { openedDownloadTab: Boolean(newTab), tabClosed: Boolean(newTab && !remaining.includes(newTab)), files };
      if (newTab && remaining.includes(newTab)) {
        await post("/window", { handle: newTab });
        clickResult.destination = await evaluate("return location.href");
      }
      console.log(JSON.stringify(clickResult));
      if (!newTab && !files.length) throw new Error("The native download control did not open its destination tab or start a transfer");
    }
  } finally {
    try {
      if (session) await request("DELETE", session);
    } finally {
      for (const file of await fs.readdir(downloadDirectory)) await fs.unlink(path.join(downloadDirectory, file));
      await fs.rmdir(downloadDirectory);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
