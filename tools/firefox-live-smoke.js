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

async function screenshotPixels(session) {
  const base64 = await request("GET", session + "/screenshot");
  if (typeof base64 !== "string" || base64.length > 24 * 1024 * 1024 || !base64.startsWith("iVBORw0KGgo")) {
    throw new Error("WebDriver did not return a bounded PNG screenshot");
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 33 || bytes.toString("ascii", 12, 16) !== "IHDR" ||
      bytes.readUInt32BE(16) > 4096 || bytes.readUInt32BE(20) > 4096) {
    throw new Error("Unexpected screenshot dimensions");
  }
  return PNG.sync.read(bytes);
}

async function screenshot(session, destination) {
  await fs.writeFile(destination, PNG.sync.write(await screenshotPixels(session)));
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
            ...(process.env.SOFT98_RGB_CHECK === "1" ? {
              "ui.prefersReducedMotion": process.env.SOFT98_RGB_REDUCED_MOTION === "1" ? 1 : 0,
            } : {}),
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
    await post("/window/rect", { width, height: Number(process.env.SOFT98_VIEWPORT_HEIGHT || 1000) });
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
          articleFrame: Math.round(document.querySelector('[data-soft98-pro-layout=content-grid]')?.getBoundingClientRect().width || 0),
          narrowBand: (() => {
            const frame = document.querySelector('[data-soft98-pro-layout=content-grid]')?.parentElement;
            const band = frame?.previousElementSibling;
            if (!band?.matches('div') || band.childElementCount !== 1 ||
                !band.previousElementSibling?.hasAttribute('data-soft98-pro-latest-frame')) return false;
            const box = band.getBoundingClientRect();
            return box.height > 1 && (band.hasAttribute('data-soft98-pro-empty-band') || box.width + 2 < frame.getBoundingClientRect().width);
          })(),
          pagePalette: (() => {
            const frame = document.querySelector('[data-soft98-pro-layout=content-grid]')?.parentElement;
            const news = document.querySelector('[data-soft98-pro-latest]:has([data-soft98-pro-news-counter])');
            const surface = getComputedStyle(document.documentElement).getPropertyValue('--s98p-surface').trim();
            const probe = document.createElement('span');
            probe.style.color = surface;
            const expected = probe.style.color;
            const background = node => node && getComputedStyle(node).backgroundColor;
            return { expected, article:background(frame), news:background(news) };
          })(),
          columnsAligned: (() => {
            const primary = document.querySelector('[data-soft98-pro-column=primary]');
            const sidebar = document.querySelector('[data-soft98-pro-column=secondary]');
            if (!primary || !sidebar) return true;
            const main = primary.getBoundingClientRect();
            const side = sidebar.getBoundingClientRect();
            if (!side.width) return primary.parentElement.hasAttribute('data-soft98-pro-sidebar-empty');
            return Math.abs(main.top - side.top) < 50 &&
              (getComputedStyle(primary.parentElement).direction === 'rtl' ? main.right <= side.left : side.left >= main.right);
          })(),
          nativeNight: document.body.classList.contains('night-mode'),
          footerBrand: Boolean(document.querySelector('[data-soft98-pro-footer]')?.getClientRects().length),
          banners: [...document.querySelectorAll('header img')].filter(n => n.getBoundingClientRect().width >= 450 && n.getBoundingClientRect().height <= 180).map(n => n.currentSrc),
          downloadControls: [...document.querySelectorAll('article [role=tabpanel] a[data-key]')].filter(a => a.getClientRects().length).length,
          compactBrand: Boolean(document.querySelector('[data-soft98-brand-compact]')),
          headerAd: [...document.querySelectorAll('header [data-href], header a[href]')].some(a => /ircd[.]me/.test(a.getAttribute('href') || a.getAttribute('data-href') || '')),
          latest: document.querySelectorAll('[data-soft98-pro-latest]').length,
          counters: document.querySelectorAll('[data-soft98-pro-view-count]').length,
          isolatedText: document.querySelectorAll('bdi[dir=ltr]').length,
          downloadPresentation: (() => {
            const group = document.querySelector('[data-soft98-pro-download-group]');
            const primary = group?.querySelector('[data-soft98-pro-download-row][data-soft98-pro-inline-size]');
            const windows = group?.querySelector('[data-soft98-pro-icon-host=windows]');
            const password = document.querySelector('[data-soft98-pro-password-shell]');
            const tab = document.querySelector('article [data-soft98-pro-surface=tab-list] [data-soft98-pro-tab-active=true]');
            return {
              primary: primary?.querySelector('[data-soft98-pro-download-title]')?.textContent.trim(),
              downloadRows: group?.querySelectorAll('[data-soft98-pro-download-row]').length,
              inlineSize: primary?.querySelector('[data-soft98-pro-download-meta]')?.textContent.trim(),
              metadataFits: (() => {
                if (!primary) return null;
                const title = primary.querySelector('[data-soft98-pro-download-title]')?.getBoundingClientRect();
                const meta = primary.querySelector('[data-soft98-pro-download-meta]')?.getBoundingClientRect();
                const anchor = primary.getBoundingClientRect();
                const row = primary.parentElement.getBoundingClientRect();
                return Boolean(meta?.height && title && meta.top >= title.bottom - 1 &&
                  meta.bottom <= anchor.bottom + 1 && Math.abs(row.width - anchor.width) < 2 &&
                  getComputedStyle(primary.parentElement, '::before').display === 'none' &&
                  getComputedStyle(primary.parentElement, '::after').display === 'none');
              })(),
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
              navGroups: document.querySelectorAll('[data-soft98-pro-nav-group]').length,
              navIndicators: document.querySelectorAll('[data-soft98-pro-nav-indicator]').length,
              articleMetadata: document.querySelectorAll('[data-soft98-pro-article-meta] > [data-soft98-pro-icon-host]').length,
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
              defaultWidening: window.Soft98Pro?.settings.expandMain,
              defaultHeader: window.Soft98Pro?.settings.utilityInHeader,
              inHeader: Boolean(document.querySelector('nav button[aria-haspopup=dialog]:has([data-soft98-pro-page-icon=grid])') &&
                document.querySelector('dialog[aria-labelledby=soft98-pro-utility-title] [data-soft98-pro-utility-header]')),
              header: Boolean(header),
              dividerColor: heading && getComputedStyle(heading, '::before').color,
              headerBackground: heading && getComputedStyle(heading).backgroundImage,
              iconBackground: icon && getComputedStyle(icon).backgroundColor,
              iconArtwork: icon && Boolean(icon.querySelector('svg,img')),
              transparentIcons: document.querySelectorAll('[data-soft98-pro-utility-art=ready]').length,
              productIcons: document.querySelectorAll('[data-soft98-pro-utility-icon] img[src^="data:"]').length,
              downloadIconShadow: download && getComputedStyle(download, '::before').textShadow,
            };
          })(),
        };`);
      if (attempt >= 3 && result.downloadControls && (!addon || (result.control && result.brand.length && !result.banners.length && result.utility.transparentIcons))) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    console.log(JSON.stringify({ addon, browser: capabilities.browserVersion, ...result }, null, 2));
    const { expected, article, news } = result.pagePalette;
    if (addon && (!result.theme || result.control?.width !== 42 || result.control.height !== 42 || result.control.position !== "fixed" ||
        result.control.panelVisible || !(result.preservedLinks || result.downloadControls) || result.promotions ||
        !result.compactBrand || result.brand.length < 2 || result.brand.some(({ variant, bundled }) => variant !== "pirateDark" || !bundled) ||
        result.banners.length || result.headerAd || !result.latest || !result.counters || !result.isolatedText ||
        !["windows", "apple", "linux", "android", "download"].every(icon => result.downloadPresentation.glyphs.includes(icon)) ||
        !result.downloadPresentation.legacyWindows?.some(value => value === "none" || value === "hidden") || !result.downloadPresentation.primary?.includes("(رایگان)") ||
        !result.downloadPresentation.inlineSize || result.downloadPresentation.primary.includes("حجم") ||
        !result.downloadPresentation.metadataFits || result.downloadPresentation.downloadRows < 5 ||
        !result.downloadPresentation.passwordBackground || result.downloadPresentation.passwordBackground === "rgb(223, 121, 100)" ||
        result.downloadPresentation.glyphSize < 22 ||
        !result.downloadPresentation.tabIndicator?.includes("inset") || !result.downloadPresentation.tabSurface?.includes("gradient") ||
        !result.downloadPresentation.headingDividers || !result.downloadPresentation.headingAccent?.includes("gradient") ||
        result.downloadPresentation.navButtons < 3 || !result.downloadPresentation.navGroups ||
        !result.downloadPresentation.navIndicators || result.downloadPresentation.articleMetadata < 3 ||
        !result.utility.transparentIcons || result.utility.productIcons < 5 || result.utility.downloadIconShadow !== "none" ||
        result.utility.defaultWidening !== false || result.utility.defaultHeader !== true || !result.utility.inHeader ||
        (width > 820 && (!expected || article !== expected || news !== expected || (result.sidebarWidth && result.sidebarWidth < 250))) ||
        (width >= 2000 && (result.articleFrame < 1750 || result.narrowBand)) || (width > 820 && !result.columnsAligned))) {
      throw new Error("Live Firefox page failed the Soft98 Pro smoke checks");
    }
    if (process.env.SOFT98_LIVE_SCREENSHOT) await screenshot(session, process.env.SOFT98_LIVE_SCREENSHOT);
    if (addon && process.env.SOFT98_INTERACTION_CHECK === "1") {
      const timings = await post("/execute/async", { args: [], script: `
        const done = arguments[0];
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        (async () => {
          const originalQuery = Document.prototype.querySelectorAll;
          let queries = 0, warningSweeps = 0;
          Document.prototype.querySelectorAll = function (...args) {
            queries++;
            if (args[0] === 'div,section,aside,header,footer,a,p,span') warningSweeps++;
            return originalQuery.apply(this,args);
          };
          const start = performance.now();
          try {
            for (let i = 0; i < 25; i++) {
              document.dispatchEvent(new Event('scroll'));
              window.dispatchEvent(new Event('scroll'));
            }
          } finally { Document.prototype.querySelectorAll = originalQuery; }
          const scrollMs = performance.now() - start;
          const faq = document.querySelector('article details[data-soft98-pro-faq]');
          const summary = faq?.querySelector('summary');
          if (!summary) return done({ queries, scrollMs, faq:false });
          const closed = faq.getBoundingClientRect().height;
          summary.click();
          const anim = faq.getAnimations()[0];
          if (anim) {
            anim.pause();
            anim.currentTime = 100;
          }
          const middle = faq.getBoundingClientRect().height;
          summary.click();
          faq.getAnimations()[0]?.finish();
          await wait(240);
          const returned = faq.getBoundingClientRect().height;
          const related = document.querySelector('[data-soft98-pro-related]');
          const footer = document.querySelector('[data-soft98-pro-footer]');
          const header = document.querySelector('article [data-soft98-pro-tab-header]');
          const absoluteY = node => node.getBoundingClientRect().top + scrollY;
          const targets = [related, footer];
          const before = targets.map(absoluteY);
          const clampY = y => Math.min(Math.max(0, document.documentElement.scrollHeight - innerHeight), Math.max(0,y));
          const trace = [];
          const warm = clampY(before[0] - innerHeight / 2);
          window.scrollTo({top:warm,behavior:'instant'});
          await wait(220);
          const settled = targets.map(absoluteY);
          let shift = Math.max(...settled.map((position, i) => Math.abs(position-before[i])));
          let scrollError = Math.abs(scrollY-warm);
          for (const offset of [-200, -100, 0, 50, 120, -45]) {
            const y = clampY(warm + offset);
            window.scrollTo({top:y,behavior:'instant'});
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            shift = Math.max(shift, ...targets.map((node, i) => Math.abs(absoluteY(node)-settled[i])));
            scrollError = Math.max(scrollError, Math.abs(scrollY-y));
            trace.push({ y, actual:scrollY, positions:targets.map(absoluteY), height:document.documentElement.scrollHeight });
          }
          window.scrollTo({top:0,behavior:'instant'});
          done({ queries, warningSweeps, scrollMs, faq:true, midExpansion: middle > closed,
            reversed: !faq.open && Math.abs(closed-returned) < 1, shift, scrollError,
            sticky: getComputedStyle(header).position, ...(shift > 1 || scrollError > 1 ? { before, settled, trace } : {}) });
        })().catch(error => done({ error:String(error) }));
      ` });
      console.log(JSON.stringify({ interactions: timings }));
      if (timings.warningSweeps !== 0 || !timings.faq || !timings.midExpansion || !timings.reversed ||
          timings.shift > 1 || timings.scrollError > 1 || timings.sticky !== "static") {
        throw new Error("Interaction performance regression: " + JSON.stringify(timings));
      }
      const disclosures = await post("/execute/async", { args: [], script: `
        const done = arguments[0];
        (async () => {
          const testMotion = async (node, click, property, read) => {
            const start = read();
            click();
            const animation = node.getAnimations().find(animation => property in animation.effect.getKeyframes()[0]);
            if (!animation) return { animated:false };
            animation.pause();
            animation.currentTime = 0;
            const first = read();
            animation.currentTime = 100;
            const middle = read();
            animation.finish();
            await animation.finished;
            const end = read();
            return { animated:true, start, first, middle, end, between: Math.min(first,end) < middle && middle < Math.max(first,end) };
          };
          const launcher = document.querySelector('#soft98-pro-control [data-role=toggle]');
          const form = document.querySelector('#soft98-pro-console');
          const opacity = () => form.hidden ? 0 : Number(getComputedStyle(form).opacity);
          const panelOpening = await testMotion(form, () => launcher.click(), 'opacity', opacity);
          const panelClosing = await testMotion(form, () => launcher.click(), 'opacity', opacity);
          const utility = document.querySelector('nav [aria-haspopup=dialog]:has([data-soft98-pro-page-icon=grid])');
          utility.click();
          const dialog = document.querySelector('dialog[aria-labelledby=soft98-pro-utility-title]');
          const list = dialog.querySelector('[data-soft98-pro-utility-extra]');
          const button = dialog.querySelector('[data-soft98-pro-utility-card] > footer button');
          const height = () => list.getBoundingClientRect().height;
          const listOpening = await testMotion(list, () => button.click(), 'height', height);
          const listRows = [...list.children].filter(row => row.getBoundingClientRect().height > 0);
          const rowRange = listRows.at(-1)?.getBoundingClientRect().bottom - listRows[0]?.getBoundingClientRect().top;
          const look = getComputedStyle(list);
          const layout = { height: look.height, minHeight: look.minHeight, maxHeight: look.maxHeight, flex: look.flex,
            inline:list.getAttribute('style'), state:list.getAttribute('data-soft98-pro-utility-extra') };
          const listClosing = await testMotion(list, () => button.click(), 'height', height);
          dialog.close();
          done({ panelOpening, panelClosing, listOpening, listClosing, rows:listRows.length, rowRange, layout });
        })().catch(error => done({ error:String(error) }));
      ` });
      if (!disclosures.panelOpening?.between || !disclosures.panelClosing?.between || !disclosures.listOpening?.between ||
          !disclosures.listClosing?.between || disclosures.listOpening.start !== 0 || disclosures.listClosing.end !== 0 ||
          disclosures.rows < 3 || disclosures.rowRange < disclosures.rows * 24 ||
          disclosures.listOpening.end < disclosures.rowRange - 2) {
        throw new Error("Disclosure motion regression: " + JSON.stringify(disclosures));
      }
      console.log(JSON.stringify({ disclosures }));
    }
    if (addon && process.env.SOFT98_RGB_CHECK === "1") {
      await evaluate(`
        Soft98Pro.configure({ darkDesign:true, rgbMode:true });
        document.querySelector('#soft98-pro-control > [data-role=toggle]').click();
      `);
      await new Promise(resolve => setTimeout(resolve, 400));
      const samples = [];
      for (const time of [0, 5300]) {
        const result = await evaluate(`
          const panel = document.querySelector('#soft98-pro-control form');
          const animation = document.documentElement.getAnimations().find(entry => entry.animationName === 'soft98-pro-neon');
          if (animation) {
            animation.pause();
            animation.currentTime = ${time};
          }
          const style = (node, pseudo) => node && getComputedStyle(node, pseudo).backgroundImage;
          const box = panel.getBoundingClientRect();
          return {
            ribbon: style(panel, '::before'),
            layers: style(panel),
            launcher: style(document.querySelector('#soft98-pro-control > [data-role=toggle]')),
            tab: style(document.querySelector('[data-soft98-pro-latest-tabs] [aria-selected=true]')),
            heading: style(document.querySelector('article [data-soft98-pro-heading-divider]'), '::before'),
            metadata: style(document.querySelector('[data-soft98-pro-article-meta]')),
            switchKnob: style(panel.querySelector('.s98p-switch input:checked+span'), '::after'),
            panel: [box.x,box.y,box.width], viewport: innerWidth,
            animated: Boolean(animation),
          };
        `);
        const gradients = Object.fromEntries(["ribbon", "layers", "launcher", "tab", "heading", "metadata", "switchKnob"]
          .map(key => [key, (result[key]?.match(/linear-gradient\(/g) || []).length]));
        if (gradients.ribbon !== 1 || gradients.layers !== 2 || gradients.launcher !== 2 ||
            gradients.tab !== 2 || gradients.heading !== 1 || gradients.metadata !== 2 || gradients.switchKnob !== 1) {
          throw new Error("Missing RGB surfaces: " + JSON.stringify(result));
        }
        const pixels = await screenshotPixels(session);
        const scale = pixels.width / result.viewport;
        const [x, y, panelWidth] = result.panel;
        const colors = [.12, .5, .86].map(fraction => {
          const index = (Math.floor((y + 2.3) * scale) * pixels.width + Math.floor((x + fraction * panelWidth) * scale)) * 4;
          return [...pixels.data.subarray(index, index + 3)];
        });
        const distance = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
        if (colors.some(color => color.length !== 3 || Math.max(...color) < 170) ||
            Math.min(distance(colors[0], colors[1]), distance(colors[1], colors[2]), distance(colors[0], colors[2])) < 65) {
          throw new Error("RGB ribbon is not visibly multicolored: " + JSON.stringify({ colors, panel: result.panel }));
        }
        if (time === 0 && process.env.SOFT98_RGB_SCREENSHOT) {
          await fs.writeFile(process.env.SOFT98_RGB_SCREENSHOT, PNG.sync.write(pixels));
        }
        samples.push({ animated: result.animated, colors, gradients });
      }
      const still = process.env.SOFT98_RGB_REDUCED_MOTION === "1";
      const same = JSON.stringify(samples[0].colors) === JSON.stringify(samples[1].colors);
      if (samples.some(frame => frame.animated === still) || same !== still) {
        throw new Error("The rendered RGB ribbon did not respect the motion preference");
      }
      console.log(JSON.stringify({ rgb: samples }));
      await evaluate("document.querySelector('#soft98-pro-control [data-role=close]').click(); Soft98Pro.configure({ rgbMode:false })");
      await new Promise(resolve => setTimeout(resolve, 380));
    }
    if (process.env.SOFT98_ARTICLE_DOWNLOAD_CHECK === "1") {
      const report = await post("/execute/async", { args: [], script: `
        const done = arguments[0];
        (async () => {
          const links = [...document.querySelectorAll('article [role=tabpanel] dl dd a[data-key]')];
          const pane = links[0]?.closest('[role=tabpanel]');
          const tab = pane && document.getElementById(pane.getAttribute('aria-labelledby'));
          const other = tab && [...tab.closest('[role=tablist]').querySelectorAll('[role=tab]')].find(item => item !== tab);
          if (!links.length || !tab || !other) return done({ found:false });
          const visible = () => links.filter(link => {
            const style = getComputedStyle(link);
            const box = link.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && style.visibility === 'visible' && style.pointerEvents !== 'none';
          }).length;
          const wait = () => new Promise(resolve => setTimeout(resolve, 420));
          const initial = visible();
          other.click(); await wait();
          const away = visible();
          tab.click(); await wait();
          const returned = visible();
          let recovered;
          if (window.Soft98Pro) {
            const list = links[0].closest('dl');
            const row = list.parentElement, frame = row.parentElement;
            const before = frame.getAttribute('style');
            frame.style.display = 'none';
            await wait();
            recovered = { visible: visible(), marked: frame.hasAttribute('data-soft98-pro-download-recovery') };
            if (before === null) frame.removeAttribute('style');
            else frame.setAttribute('style', before);
          }
          done({ found:true, rows:links.length, initial, away, returned, recovered });
        })().catch(error => done({ error:String(error) }));
      ` });
      if (!report.found || report.initial !== report.rows || report.away !== 0 || report.returned !== report.rows ||
          (addon && (!report.recovered?.marked || report.recovered.visible !== report.rows))) {
        throw new Error("Article download visibility check failed: " + JSON.stringify(report));
      }
      console.log(JSON.stringify({ articleDownloads: report }));
    }
    if (addon && process.env.SOFT98_LATEST_HEADER_CHECK === "1") {
      const headers = await post("/execute/async", { args: [], script: `
        const done = arguments[arguments.length - 1];
        const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        (async () => {
          const tabHeader = document.querySelector('[data-soft98-pro-latest-header=tabs]');
          const newsHeader = document.querySelector('[data-soft98-pro-latest-header=news]');
          const tabs = [...tabHeader?.querySelectorAll('[role=tab]') || []];
          if (!newsHeader || tabs.length !== 3) return done({found:false});
          const panes = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
          const measure = () => {
            const a = tabHeader.getBoundingClientRect(), b = newsHeader.getBoundingClientRect();
            const boxes = tabs.map(tab => tab.getBoundingClientRect());
            const sharedRow = b.width > 0 && Math.abs(a.top - b.top) <= 1;
            const shortcuts = [...newsHeader.querySelectorAll('[data-soft98-pro-news-shortcut]')];
            const centered = !b.width || shortcuts.every(link => {
              const button = link.getBoundingClientRect(), icon = link.querySelector('svg').getBoundingClientRect();
              return icon.width >= 15 && Math.abs(button.left + button.width / 2 - icon.left - icon.width / 2) <= 1 &&
                Math.abs(button.top + button.height / 2 - icon.top - icon.height / 2) <= 1;
            });
            return {sharedRow, sameDivider:!sharedRow || Math.abs(a.bottom-b.bottom) <= 1,
              tabsFit:boxes.every(box => box.width > 0 && box.left >= a.left-1 && box.right <= a.right+1 && box.bottom <= a.bottom+1),
              shortcuts:shortcuts.length, centered,
              pixels:[a.height,b.height]};
          };
          const start = measure();
          const visibleDownloads = () => [...document.querySelectorAll('article [role=tabpanel] a[data-key]')]
            .filter(link => link.getClientRects().length).length;
          const downloadsBefore = visibleDownloads();
          const tabStates = [];
          for (const tab of [...tabs.slice(1),tabs[0]]) {
            tab.click(); await new Promise(resolve => setTimeout(resolve, 400));
            const pane = panes[tabs.indexOf(tab)];
            const style = pane && getComputedStyle(pane);
            tabStates.push({selected:tab.getAttribute('aria-selected') === 'true',
              visible:!!pane?.getClientRects().length && style.visibility === 'visible' && Number(style.opacity) > .99 &&
                panes.every(other => other === pane || !other?.getClientRects().length),
              links:[...pane.querySelectorAll('li a[href]')].filter(link => link.getClientRects().length).length,
              downloadLinks:visibleDownloads(),
              aligned:measure().sameDivider,
              pane:tab.getAttribute('aria-controls'), display:style?.display});
          }
          Soft98Pro.configure({darkDesign:false}); await new Promise(resolve => setTimeout(resolve, 300));
          const light = measure();
          const stories = [...document.querySelectorAll('[data-soft98-pro-news-story]')];
          const newsStyled = stories.length > 0 && stories.every(story => getComputedStyle(story).display === 'flex' &&
            !!story.querySelector('[data-soft98-pro-news-label]') && story.hasAttribute('href'));
          const storyStyle = stories[0] && getComputedStyle(stories[0]);
          const stripe = storyStyle?.backgroundColor;
          const newsInk = storyStyle?.color;
          const newsContrast = light.pixels[1] === 0 || (stripe === 'rgb(240, 245, 255)' && newsInk === 'rgb(20, 40, 74)');
          if (!${Boolean(process.env.SOFT98_LATEST_HEADER_SCREENSHOT)}) Soft98Pro.configure({darkDesign:true});
          done({found:true,start,light,tabStates,downloadsBefore,newsStyled,newsContrast,stripe,newsInk});
        })().catch(error => done({error:String(error)}));
      ` });
      if (!headers.found || !headers.start.sameDivider || !headers.light.sameDivider || !headers.start.tabsFit ||
          !headers.light.tabsFit || !headers.newsStyled || !headers.newsContrast ||
          !headers.start.centered || !headers.light.centered || headers.start.shortcuts < 5 ||
          !headers.downloadsBefore || !headers.tabStates.every(state => state.selected && state.visible && state.links > 0 &&
            state.downloadLinks === headers.downloadsBefore && state.aligned) ||
          (width >= 1000 && !headers.start.sharedRow)) {
        throw new Error("Latest header alignment failed: " + JSON.stringify(headers));
      }
      console.log(JSON.stringify({latestHeaders: headers}));
      if (process.env.SOFT98_LATEST_HEADER_SCREENSHOT) {
        await screenshot(session, process.env.SOFT98_LATEST_HEADER_SCREENSHOT);
        await evaluate("Soft98Pro.configure({darkDesign:true})");
      }
    }
    if (addon && process.env.SOFT98_CHROME_PREVIEW_DIR) {
      const out = path.resolve(process.env.SOFT98_CHROME_PREVIEW_DIR);
      await fs.mkdir(out, { recursive: true });
      await evaluate("Soft98Pro.configure({darkDesign:false,rgbMode:false}); scrollTo(0,0)");
      await new Promise((resolve) => setTimeout(resolve, 400));
      await screenshot(session, path.join(out, "light-page.png"));
      await evaluate("document.querySelector('#soft98-pro-control [data-role=toggle]').click()");
      await new Promise((resolve) => setTimeout(resolve, 360));
      await screenshot(session, path.join(out, "light-control.png"));
      await evaluate("document.querySelector('#soft98-pro-control [data-role=close]').click()");
      const mega = await post("/execute/async", { args: [], script: `
        const done = arguments[arguments.length - 1];
        const nav = document.querySelector('nav[data-soft98-pro-nav-chrome]');
        const menu = [...nav.querySelectorAll('[data-soft98-pro-mega-frame]')].find(node => node.querySelectorAll('[data-soft98-pro-mega-group]').length >= 4);
        const trigger = menu?.parentElement.querySelector(':scope > [data-toggle=dropdown]');
        if (!trigger) return done({missing:true});
        trigger.click();
        setTimeout(() => {
          const style = getComputedStyle(trigger), box = menu.getBoundingClientRect(), m = getComputedStyle(menu);
          const triggerBox = trigger.getBoundingClientRect();
          const hit = document.elementFromPoint(triggerBox.left + triggerBox.width / 2, triggerBox.top + triggerBox.height / 2);
          done({color:style.color, fill:style.webkitTextFillColor, background:style.backgroundImage,
            visibleTrigger:[hit?.closest('a,button')?.textContent.trim(),hit ? getComputedStyle(hit).color : ''],
            opened:trigger.getAttribute('aria-expanded'), triggerFill:style.backgroundColor, menu:m.visibility, opacity:m.opacity,
            menuBounds:[box.left,box.right,innerWidth], groups:menu.querySelectorAll('[data-soft98-pro-mega-group]').length});
        }, 350);
      ` });
      if (mega.missing || mega.opened !== "true" || mega.menu === "hidden" || Number(mega.opacity) < .9 ||
          mega.color !== "rgb(18, 63, 146)" || mega.triggerFill !== "rgb(214, 231, 255)" ||
          mega.menuBounds[0] < -1 || mega.menuBounds[1] > mega.menuBounds[2] + 1) {
        throw new Error("Opened light megamenu failed: " + JSON.stringify(mega));
      }
      console.log(JSON.stringify({lightMegamenu:mega}));
      await screenshot(session, path.join(out, "light-megamenu.png"));
      await evaluate("document.body.click(); window.scrollTo(0,document.documentElement.scrollHeight)");
      await new Promise((resolve) => setTimeout(resolve, 350));
      const footer = await evaluate(`
        const root = document.querySelector('[data-soft98-pro-footer]');
        const rect = root.getBoundingClientRect();
        const frame = root.querySelector('.s98p-footer-frame');
        return {hrefs:[...root.querySelectorAll('a')].map(n => n.href), buttons:root.querySelectorAll('button').length,
          fill:getComputedStyle(frame).backgroundColor, gradient:getComputedStyle(frame).backgroundImage,
          readable:[...root.querySelectorAll('.s98p-footer-links :is(a,button) > span:last-child')]
            .every(n => getComputedStyle(n).color === getComputedStyle(n.parentElement).color),
          width:rect.width, fits:root.scrollWidth <= root.clientWidth, closes:!root.textContent.includes('افزونه‌ای مستقل')};
      `);
      if (footer.hrefs.length !== 3 || footer.buttons !== 2 || !footer.fits || !footer.closes || !footer.readable ||
          footer.fill !== "rgb(255, 255, 255)" || footer.gradient !== "none") {
        throw new Error("New footer failed: " + JSON.stringify(footer));
      }
      await screenshot(session, path.join(out, "light-footer.png"));
      await evaluate("document.querySelector('[data-soft98-pro-footer] button').click()");
      if (!await evaluate("return document.querySelector('#soft98-pro-control').dataset.open === 'true'")) {
        throw new Error("Footer settings did not open the control center");
      }
      await evaluate("document.querySelector('#soft98-pro-control [data-role=close]').click()");
      await evaluate("Soft98Pro.configure({darkDesign:true}); scrollTo(0,0)");
    }
    if (addon && process.env.SOFT98_CONTROL_PREVIEW_SCREENSHOT) {
      await evaluate(`
        const control = document.querySelector('#soft98-pro-control');
        control.querySelector('[data-role=toggle]').click();
        control.querySelector('[data-section=experience]').click();
        const option = control.querySelector('[data-s98p-preview=rgbMode]');
        option.scrollIntoView({block:'nearest'});
      `);
      await new Promise((resolve) => setTimeout(resolve, 350));
      await evaluate("document.querySelector('[data-s98p-preview=rgbMode]').dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse'}))");
      await new Promise((resolve) => setTimeout(resolve, 450));
      const preview = await evaluate(`
        const preview = document.querySelector('.s98p-option-preview');
        const box = preview.getBoundingClientRect();
        return !preview.hidden && box.right <= innerWidth && box.bottom <= innerHeight &&
          [...preview.querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0);
      `);
      if (!preview) throw new Error("Packaged control center did not show its bundled screenshots");
      await screenshot(session, process.env.SOFT98_CONTROL_PREVIEW_SCREENSHOT);
      await evaluate("document.querySelector('#soft98-pro-control [data-role=close]').click(); scrollTo(0,0)");
    }
    if (addon && process.env.SOFT98_CONTROL_PREVIEWS) {
      const out = path.resolve(process.env.SOFT98_CONTROL_PREVIEWS);
      await fs.mkdir(out, { recursive: true });
      const capture = async (name, script) => {
        if (script) await evaluate(script);
        await new Promise((resolve) => setTimeout(resolve, 350));
        await screenshot(session, path.join(out, name + ".png"));
      };
      await capture("dark-on");
      await capture("dark-off", "Soft98Pro.configure({darkDesign:false})");
      if (process.env.SOFT98_LIGHT_SCREENSHOT) {
        await screenshot(session, process.env.SOFT98_LIGHT_SCREENSHOT);
        await evaluate("document.querySelector('#soft98-pro-control [data-role=toggle]').click()");
        await new Promise((resolve) => setTimeout(resolve, 340));
        if (process.env.SOFT98_LIGHT_CONTROL_SCREENSHOT) await screenshot(session, process.env.SOFT98_LIGHT_CONTROL_SCREENSHOT);
        await evaluate("document.querySelector('#soft98-pro-control [data-role=close]').click()");
        if (process.env.SOFT98_LIGHT_DOWNLOAD_SCREENSHOT) {
          await evaluate("document.querySelector('article [data-soft98-pro-download-heading]').scrollIntoView({block:'start',behavior:'instant'}); scrollBy(0,-110)");
          await new Promise((resolve) => setTimeout(resolve, 340));
          await screenshot(session, process.env.SOFT98_LIGHT_DOWNLOAD_SCREENSHOT);
          await evaluate("scrollTo(0,0)");
        }
      }
      await capture("pirate-off", "Soft98Pro.configure({darkDesign:true,pirateLogo:false})");
      await capture("pirate-on", "Soft98Pro.configure({pirateLogo:true})");
      await capture("latest-on");
      await capture("latest-off", "Soft98Pro.configure({showLatest:false})");
      await evaluate("Soft98Pro.configure({showLatest:true,rgbMode:true})");
      for (let i = 0; i < 12; i++) {
        await capture("rgb-" + String(i).padStart(2, "0"), `
          const animation = document.documentElement.getAnimations().find(anim => anim.animationName === 'soft98-pro-neon');
          if (!animation) throw new Error('RGB animation unavailable');
          animation.pause();
          animation.currentTime = ${Math.round(i * 16000 / 12)};
        `);
      }
      await evaluate("Soft98Pro.configure({rgbMode:false})");
      const scrollPastSidebar = `
        const side = document.querySelector('[data-soft98-pro-column=secondary]').getBoundingClientRect();
        scrollBy(0, side.bottom + side.width + 65);
      `;
      await evaluate("Soft98Pro.configure({utilityInHeader:false,expandMain:true})");
      await capture("expand-on", scrollPastSidebar);
      await capture("expand-off", "Soft98Pro.configure({expandMain:false})");
      await evaluate("Soft98Pro.configure({utilityInHeader:true}); scrollTo(0,0)");
    }
    if (process.env.SOFT98_UTILITY_SCREENSHOT) {
      await evaluate("Soft98Pro.configure({utilityInHeader:false})");
      await evaluate(`const heading = document.querySelector('[data-soft98-pro-utility-header]') ||
        [...document.querySelectorAll('aside h1,aside h2,aside h3,aside h4')].find(node =>
          node.textContent.normalize('NFKC').replace(/[\\s\\u0640\\u200c\\u200d]+/gu, '') === 'لیستنرمافزارهایکاربردی');
        heading.scrollIntoView({block:'center',behavior:'instant'});`);
      await screenshot(session, process.env.SOFT98_UTILITY_SCREENSHOT);
      await evaluate("Soft98Pro.configure({utilityInHeader:true})");
    }
    if (addon) {
      const button = await post("/element", { using: "css selector", value: "#soft98-pro-control [data-role=toggle]" });
      const buttonId = Object.values(button)[0];
      await post(`/element/${buttonId}/click`, {});
      if (await evaluate("return document.querySelector('#soft98-pro-control').dataset.open") !== "true") {
        throw new Error("Firefox could not open the Pro console");
      }
      if (process.env.SOFT98_CONTROL_SCREENSHOT) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        await screenshot(session, process.env.SOFT98_CONTROL_SCREENSHOT);
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
        const footerLook = async () => evaluate(`
          const footer = document.querySelector('[data-soft98-pro-footer]');
          const frame = footer.querySelector('.s98p-footer-frame');
          const card = document.querySelector('[data-soft98-pro-related]');
          const list = card?.querySelector(':scope > :is(ol,ul)');
          const background = node => node && getComputedStyle(node).backgroundColor;
          const probe = document.createElement('span');
          probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--s98p-surface').trim();
          const box = frame.getBoundingClientRect();
          return {
            frame: background(frame), primary: background(footer.querySelector('.s98p-footer-brand button')),
            related: background(card), list: background(list), expected: probe.style.color,
            gradient: getComputedStyle(frame).backgroundImage, direction: getComputedStyle(footer).direction,
            links: footer.querySelectorAll('a[href]').length,
            fits: box.left >= 0 && box.right <= innerWidth && [...footer.querySelectorAll('a,button')].every(node => {
              const rect = node.getBoundingClientRect();
              return rect.width > 0 && rect.left >= box.left && rect.right <= box.right;
            }),
          };
        `);
        const validateFooter = (theme, look) => {
          if (look.frame !== look.expected || look.related !== look.expected || look.list !== look.expected ||
              look.gradient !== 'none' || !look.fits || look.links !== 3 ||
              look.primary !== (theme === "Light" ? "rgb(28, 87, 191)" : "rgb(141, 221, 187)")) {
            throw new Error(theme + ' footer or related card: ' + JSON.stringify(look));
          }
        };
        const darkFooter = await footerLook();
        validateFooter("Dark", darkFooter);
        await screenshot(session, process.env.SOFT98_FOOTER_SCREENSHOT);
        if (process.env.SOFT98_LIGHT_FOOTER_SCREENSHOT) {
          await evaluate("Soft98Pro.configure({darkDesign:false}); document.querySelector('[data-soft98-pro-footer]').scrollIntoView({ block:'end', behavior:'instant' })");
          await new Promise(resolve => setTimeout(resolve, 320));
          validateFooter("Light", await footerLook());
          await screenshot(session, process.env.SOFT98_LIGHT_FOOTER_SCREENSHOT);
          await evaluate("Soft98Pro.configure({darkDesign:true})");
        }
        await evaluate("document.querySelector('.s98p-footer-brand button').click()");
        if (!await evaluate("return document.querySelector('#soft98-pro-control').dataset.open === 'true'")) throw new Error("Footer settings button did not open the control center");
        await evaluate("document.querySelector('#soft98-pro-control [data-role=close]').click()");
        await evaluate("document.querySelector('.s98p-footer-end button').click()");
        const afterTop = await evaluate("return scrollY");
        if (afterTop > 1) throw new Error("Footer Back to top button did not return to the top: " + afterTop);
        const gravity = await post("/execute/async", { args: [], script: `
          const done = arguments[0];
          const wrap = document.querySelector('#soft98-pro-control');
          const toggle = wrap.querySelector('[data-role=toggle]');
          const marker = wrap.querySelector('.s98p-dock-target');
          const box = toggle.getBoundingClientRect();
          const x = document.documentElement.clientWidth - 75;
          const send = (node,type,clientX,clientY) => node.dispatchEvent(new PointerEvent(type,{
            clientX,clientY,button:0,isPrimary:true,pointerId:5,bubbles:true,
          }));
          send(toggle,'pointerdown',box.x + box.width/2,box.y + box.height/2);
          send(window,'pointermove',x,42);
          requestAnimationFrame(() => {
            const pull = wrap.getBoundingClientRect().left - (x - 21);
            const guide = !marker.hidden && !!marker.getClientRects().length;
            const first = marker.getBoundingClientRect();
            requestAnimationFrame(() => requestAnimationFrame(() => {
              const next = marker.getBoundingClientRect();
              send(window,'pointercancel',x,42);
              done({ pull, guide, travelled: next.right - first.right, grew: next.width > first.width,
                cancelled: marker.hidden && Math.abs(wrap.getBoundingClientRect().left - 12) < 1 });
            }));
          });
        ` });
        if (gravity.pull < 8 || !gravity.guide || gravity.travelled < 1 || !gravity.grew || !gravity.cancelled) {
          throw new Error("Launcher gravity failed: " + JSON.stringify(gravity));
        }
        console.log(JSON.stringify({ footer: darkFooter }));
        console.log(JSON.stringify({ gravity }));
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
      if (toggles.latest < 2 || toggles.initial.length < 2 || !toggles.initial.every(Boolean) || toggles.hidden.some(Boolean) || !toggles.restored.every(Boolean)) {
        throw new Error(`Latest and extra-prompt controls did not round-trip: ${JSON.stringify(toggles)}`);
      }
      if (width > 820) {
        const widths = await post("/execute/async", { args: [], script: `
          const done = arguments[arguments.length - 1];
          const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          (async () => {
            scrollTo(0,0); await frame();
            const primary = document.querySelector('[data-soft98-pro-column=primary]');
            const size = () => Math.round(primary.getBoundingClientRect().width);
            const defaultWidth = size();
            scrollTo(0,700); await frame();
            const defaultStable = size() === defaultWidth;
            window.Soft98Pro.configure({ utilityInHeader:false }); await frame();
            const sidebar = document.querySelector('[data-soft98-pro-column=secondary]');
            scrollTo(0,0); await frame();
            const before = size();
            const sidebarLeft = Math.round(sidebar.getBoundingClientRect().left);
            const start = Math.ceil(sidebar.getBoundingClientRect().bottom);
            const samples = [];
            window.Soft98Pro.configure({ expandMain:true }); await frame();
            for (const pixels of [80, 160, 80]) {
              scrollTo(0, start + pixels); await frame();
              samples.push({ added: size() - before, scrolled: scrollY - start,
                sidebarMoved: Math.abs(sidebar.getBoundingClientRect().left - sidebarLeft) > 1 });
            }
            scrollTo(0, start + sidebar.getBoundingClientRect().width + 80); await frame();
            const expanded = size();
            window.Soft98Pro.configure({ expandMain:false }); await frame();
            const disabled = size();
            scrollTo(0,0); await frame();
            const restored = size();
            const sidebarStable = Math.round(sidebar.getBoundingClientRect().left) === sidebarLeft;
            window.Soft98Pro.configure({ utilityInHeader:true }); await frame();
            done({ before, expanded, disabled, restored, samples, sidebarStable, defaultStable });
          })();
        ` });
        if (widths.expanded < widths.before + 200 || widths.before !== widths.disabled || widths.before !== widths.restored ||
            !widths.defaultStable || !widths.sidebarStable || widths.samples.some(({ added, scrolled, sidebarMoved }) =>
              sidebarMoved || Math.abs(added - scrolled) > 2)) {
          throw new Error(`Article width did not round-trip: ${JSON.stringify(widths)}`);
        }
        console.log(JSON.stringify({ articleWidths: widths }));
        if (process.env.SOFT98_EXPANDED_SCREENSHOT) {
          await evaluate("Soft98Pro.configure({utilityInHeader:false,expandMain:true})");
          await new Promise((resolve) => setTimeout(resolve, 150));
          await evaluate("const side = document.querySelector('[data-soft98-pro-column=secondary]').getBoundingClientRect(); scrollBy(0, side.bottom + side.width + 60)");
          await new Promise((resolve) => setTimeout(resolve, 250));
          await screenshot(session, process.env.SOFT98_EXPANDED_SCREENSHOT);
          await evaluate("Soft98Pro.configure({utilityInHeader:true,expandMain:false})");
        }
        await evaluate("document.querySelector('[data-soft98-pro-password-shell]').scrollIntoView({block:'center',behavior:'instant'})");
        const find = (value) => post("/element", { using: "css selector", value }).then((element) => Object.values(element)[0]);
        await post(`/element/${await find('[data-soft98-pro-password] input[readonly]')}/click`, {});
        const password = await evaluate(`
          const row = document.querySelector('[data-soft98-pro-password-shell]');
          const input = row.querySelector('input[readonly]');
          const title = row.querySelector('[data-soft98-pro-password] > span:not([aria-hidden])');
          const range = document.createRange();
          range.selectNodeContents(title);
          return { titleLine: [...range.getClientRects()].filter(rect => rect.width > 0).length,
            selected: document.activeElement === input && input.selectionStart === 0 && input.selectionEnd === input.value.length,
            dashed: getComputedStyle(input).borderTopStyle === 'dashed', copy: Boolean(row.querySelector('[data-action=copy]')),
            actions: row.querySelectorAll('[data-soft98-pro-password-actions] button').length };
        `);
        if (!password.selected || !password.dashed || !password.copy || password.actions !== 1 || password.titleLine !== 1) throw new Error("Password controls failed");
        const idleFavicon = await evaluate("return document.querySelector('#soft98-pro-favicon')?.href");
        await evaluate(`
          const icon = document.querySelector('#soft98-pro-favicon');
          const timeline = window.__soft98TestFavicon = { frames: [icon.href] };
          const observer = new MutationObserver(() => timeline.frames.push(icon.href));
          observer.observe(icon, { attributes: true, attributeFilter: ['href'] });
          setTimeout(() => observer.disconnect(), 4000);
        `);
        await post(`/element/${await find('[data-soft98-pro-password-actions] [data-action=copy]')}/click`, {});
        const copied = await post("/execute/async", { args: [], script: `
          const done = arguments[arguments.length - 1];
          const started = performance.now();
          const check = () => {
            const status = document.querySelector('[data-soft98-pro-copy-toast]');
            if (status?.textContent || performance.now() - started > 2600) {
              const input = document.querySelector('[data-soft98-pro-password] input[readonly]');
              done({ text: status?.textContent, selected: Boolean(input && document.activeElement === input &&
                input.selectionStart === 0 && input.selectionEnd === input.value.length) });
            } else setTimeout(check, 100);
          };
          check();
        ` });
        if (!copied.text || !copied.selected) {
          throw new Error("Firefox did not show clipboard feedback while retaining the full password selection");
        }
        const { frames, settled, reduced, visible } = await post("/execute/async", { args: [], script: `
          const done = arguments[0];
          setTimeout(() => done({
            frames: window.__soft98TestFavicon.frames,
            settled: document.querySelector('#soft98-pro-favicon')?.href,
            reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
            visible: Boolean(document.querySelector('[data-soft98-pro-copy-toast][data-visible]')),
          }), 2700);
        ` });
        const badgePixel = (icon) => {
          const { data, width } = PNG.sync.read(Buffer.from(icon.split(",")[1], "base64"));
          const offset = (16 * width + 49) * 4;
          return data.subarray(offset, offset + 3).join(",");
        };
        const badge = frames[1];
        const sequence = reduced ? [idleFavicon, badge, idleFavicon] :
          [idleFavicon, badge, idleFavicon, badge, idleFavicon];
        if (!badge || badge === idleFavicon || badgePixel(badge) !== "255,209,102" ||
            frames.length !== sequence.length || !frames.every((frame, i) => frame === sequence[i]) ||
            settled !== idleFavicon || visible) throw new Error("Firefox favicon did not pulse and clear after copy feedback");
        console.log(JSON.stringify({ favicon: { idle: badgePixel(idleFavicon), badge: badgePixel(badge), pulses: reduced ? 0 : 2, cleared: true } }));
        await evaluate("document.activeElement.blur()");
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
    if (addon && process.env.SOFT98_CHECK_SECONDARY_PAGES === "1") {
      const chromeBehavior = await post("/execute/async", { args: [], script: `
        const done = arguments[arguments.length - 1];
        const settle = () => new Promise(resolve => setTimeout(resolve, 400));
        const night = document.querySelector('nav [data-toggle=night-mode]');
        const check = () => [document.body.classList.contains('night-mode'), Soft98Pro.settings.darkDesign];
        (async () => {
          const start = check();
          night.click(); await settle(); const light = check();
          const root = document.documentElement;
          const control = document.querySelector('#soft98-pro-control');
          const utilityTrigger = () => document.querySelector('nav [aria-haspopup=dialog]:has([data-soft98-pro-page-icon=grid])');
          const utilityDialog = () => document.querySelector('dialog[aria-labelledby=soft98-pro-utility-title]');
          const lightFeatures = {
            pro: root.classList.contains('soft98-pro-theme') && Soft98Pro.settings.pro,
            palette: getComputedStyle(root).colorScheme,
            panel: [control.dataset.theme, getComputedStyle(control.querySelector('form')).backgroundColor,
              getComputedStyle(control.querySelector('form')).color],
            utility: Boolean(utilityTrigger()),
            downloads: Boolean(document.querySelector('[data-soft98-pro-download-actions] button')?.getClientRects().length),
          };
          utilityTrigger()?.click();
          await settle();
          lightFeatures.utilityOpened = Boolean(utilityDialog()?.open && utilityDialog()?.querySelector('ul a[href]'));
          utilityDialog()?.close();
          await settle();
          night.click(); await settle(); const dark = check();
          const hotkey = new KeyboardEvent('keydown',{key:'F2',bubbles:true,cancelable:true});
          document.body.dispatchEvent(hotkey);
          await settle();
          const field = document.activeElement;
          const search = field?.type === 'search';
          if (search) {
            field.blur();
            document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'F2',bubbles:true,cancelable:true}));
            await settle();
          }
          const refocused = search && document.activeElement === field;
          const searchState = search ? null : [...document.querySelectorAll('nav [data-toggle=search],[data-soft98-pro-search],input[type=search]')].map(n => {
            const box = n.getBoundingClientRect();
            const css = getComputedStyle(n);
            return { tag:n.tagName, className:n.className, box:[box.left,box.top,box.width,box.height], display:css.display, visibility:css.visibility };
          });
          const button = document.querySelector('nav [aria-haspopup=dialog]:has([data-soft98-pro-page-icon=grid])');
          button?.click();
          await settle();
          const opened = location.hash === '#s98p-dialog=utility' && !!document.querySelector('dialog[open]');
          if (opened) history.back();
          await settle();
          const closed = !location.hash && !document.querySelector('dialog[open]');
          if (closed && opened) history.forward();
          await settle();
          const reopened = location.hash === '#s98p-dialog=utility' && Boolean(utilityDialog()?.open);
          if (reopened) utilityDialog().close();
          await settle();
          done({start,light,dark,lightFeatures,search,refocused,searchState,handled:hotkey.defaultPrevented,opened,closed,reopened,
            cleared: !location.hash});
        })();
      ` });
      if (!chromeBehavior.start.every(Boolean) || chromeBehavior.light.some(Boolean) || !chromeBehavior.dark.every(Boolean) ||
          !chromeBehavior.search || !chromeBehavior.refocused || !chromeBehavior.opened || !chromeBehavior.closed ||
          !chromeBehavior.reopened || !chromeBehavior.cleared ||
          !chromeBehavior.lightFeatures.pro || !chromeBehavior.lightFeatures.utility || !chromeBehavior.lightFeatures.utilityOpened ||
          !chromeBehavior.lightFeatures.downloads ||
          chromeBehavior.lightFeatures.palette !== "light" ||
          chromeBehavior.lightFeatures.panel.join("|") !== "light|rgb(245, 249, 255)|rgb(20, 40, 74)") {
        throw new Error(`Theme, search, or dialog behavior failed: ${JSON.stringify(chromeBehavior)}`);
      }
      console.log(JSON.stringify({chromeBehavior}));
      await post("/url", {url:"https://soft98.ir/os/windows-11/"});
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const listing = await evaluate(`
        const normalize = n => n.textContent.normalize('NFKC').replace(/[\\s\\u0640\\u200c]+/g,'');
        return {
          more: document.querySelectorAll('[data-soft98-pro-read-more]').length,
          previews: document.querySelectorAll('[data-soft98-pro-read-preview]').length,
          emptyAd: [...document.querySelectorAll('aside :is(h2,h3,h4)')].some(n => normalize(n) === 'تبلیغات'),
          badDivider: [...document.querySelectorAll('aside > hr')].some(n => !n.previousElementSibling || !n.nextElementSibling),
        };
      `);
      if (!listing.more || !listing.previews || listing.emptyAd || listing.badDivider) throw new Error(`Listing cleanup failed: ${JSON.stringify(listing)}`);
      if (process.env.SOFT98_LISTING_SCREENSHOT) await screenshot(session, process.env.SOFT98_LISTING_SCREENSHOT);
      await post("/url", {url:"https://soft98.ir/feedback.html"});
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const feedback = await evaluate(`return { support: Boolean(document.querySelector('img[src$="/support.png"]')),
        footer: Boolean(document.querySelector('[data-soft98-pro-footer]')?.getClientRects().length) };`);
      if (feedback.support || !feedback.footer) throw new Error(`Feedback cleanup failed: ${JSON.stringify(feedback)}`);
      console.log(JSON.stringify({ listing, feedback }));
    }
    if (addon && process.env.SOFT98_COMMENTS_SCREENSHOT) {
      const comments = await post("/execute/async", { args: [], script: `
        const done = arguments[arguments.length - 1];
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        (async () => {
          if (Soft98Pro.version == null) return done({enhanced:false});
          if (${process.env.SOFT98_COMMENTS_LIGHT === "1"}) {
            Soft98Pro.configure({darkDesign:false,rgbMode:false});
            await wait(250);
          }
          const pane = document.querySelector('[data-soft98-pro-comments]');
          const tab = [...document.querySelectorAll('[role=tab][aria-controls]')].find(tab => tab.getAttribute('aria-controls') === pane?.id);
          if (!pane || !tab) return done({enhanced:false});
          tab.click();
          await wait(300);
          const composer = pane.querySelector('form[name=comment-add-form] [data-toggle=collapse][aria-expanded=false]');
          composer?.click();
          await wait(350);
          pane.scrollIntoView({block:'start',behavior:'instant'});
          scrollBy(0,-125);
          await wait(180);
          const editor = pane.querySelector('textarea[name=comments]');
          const threads = pane.querySelectorAll('[data-soft98-pro-comments-structure=comment]').length;
          const reply = pane.querySelector('[data-toggle=comment-reply]');
          const submit = pane.querySelector('[type=submit]');
          done({enhanced:pane.querySelectorAll('[data-soft98-pro-comments-part=title]').length === 1, threads,
            visible:!!editor?.getClientRects().length, labelled:!!editor?.labels.length,
            submit:!!submit?.form, reply:!!reply, withinBounds:pane.scrollWidth <= pane.clientWidth + 1});
        })().catch(error => done({error:String(error)}));
      ` });
      if (!comments.enhanced || !comments.visible || !comments.labelled || !comments.submit || !comments.reply ||
          comments.threads < 2 || !comments.withinBounds) throw new Error("Live comments failed: " + JSON.stringify(comments));
      console.log(JSON.stringify({comments}));
      await screenshot(session, process.env.SOFT98_COMMENTS_SCREENSHOT);
    }
    if (addon && process.env.SOFT98_UTILITY_ARTWORK_SCREENSHOT) {
      const artwork = await post("/execute/async", { args: [], script: `
        const done = arguments[arguments.length - 1];
        const button = document.querySelector('nav [aria-haspopup=dialog]:has([data-soft98-pro-page-icon=grid])');
        button?.click();
        const dialog = document.querySelector('dialog[aria-labelledby=soft98-pro-utility-title]');
        const expand = [...dialog?.querySelectorAll('footer[data-toggle=collapse]') || []].find(node => {
          const list = document.getElementById(node.getAttribute('aria-controls') || '');
          return list && dialog.contains(list);
        });
        expand?.click();
        setTimeout(() => {
          const icons = [...dialog?.querySelectorAll('[data-soft98-pro-utility-icon][data-soft98-pro-icon-host]') || []]
            .map(node => ({name:node.getAttribute('data-soft98-pro-icon-host'), visible:node.checkVisibility?.({checkVisibilityCSS:true}) ?? !!node.getClientRects().length}));
          const box = dialog?.getBoundingClientRect();
          if (dialog) dialog.scrollTop = dialog.scrollHeight;
          const sample = dialog?.querySelector('[data-soft98-pro-icon-host=parsinegar]');
          const iconBox = sample?.getBoundingClientRect();
          done({icons, expanded:expand?.getAttribute('aria-expanded') === 'true' && !!iconBox?.width && !!iconBox.height &&
            iconBox.top >= box.top && iconBox.bottom <= box.bottom,
            centered:!!box && box.top >= 0 && box.bottom <= innerHeight + 1 && box.left >= 0 && box.right <= innerWidth + 1,
            detail:[expand?.outerHTML.slice(0,250), dialog?.scrollTop, dialog?.scrollHeight, iconBox?.top, box?.top, box?.bottom,
              [...dialog?.querySelectorAll('footer') || []].map(node => node.outerHTML.slice(0,250))]});
        }, 500);
      ` });
      if (!artwork.centered) throw new Error("Expanded software dialog was outside the viewport");
      if (!artwork.expanded) throw new Error("Expanded artwork did not scroll into view: " + JSON.stringify(artwork.detail));
      for (const name of ["java-duke", "parsinegar", "foxit-reader-token", "net-disabler-token", "utility-disc"]) {
        if (!artwork.icons.some((icon) => icon.name === name && icon.visible)) throw new Error("Expanded software list is missing visible " + name);
      }
      console.log(JSON.stringify({ utilityArtwork: artwork }));
      await new Promise((resolve) => setTimeout(resolve, 250));
      await screenshot(session, process.env.SOFT98_UTILITY_ARTWORK_SCREENSHOT);
      await evaluate("document.querySelector('dialog[aria-labelledby=soft98-pro-utility-title]').close()");
    }
    if (addon && process.env.SOFT98_CHECK_QUICK_NAVIGATION === "1") {
      await post("/url", {url:"https://soft98.ir/os/"});
      const result = await post("/execute/async", { args: [], script: `
        const done = arguments[arguments.length - 1];
        const waitFor = async check => {
          for (let i = 0; i < 40; i++) {
            if (check()) return true;
            await new Promise(resolve => setTimeout(resolve, 150));
          }
          return false;
        };
        (async () => {
          if (!await waitFor(() => window.Soft98Pro && document.querySelector('main nav a[href*="/page/2/"]'))) return done({listing:false});
          const main = document.querySelector('main');
          const heading = () => main.querySelector('article h2').textContent.trim();
          const old = heading();
          const link = main.querySelector('nav a[href*="/page/2/"]');
          const originalLocation = location.pathname;
          const disabledByDefault = !Soft98Pro.settings.quickNavigation;
          Soft98Pro.configure({quickNavigation:true});
          await new Promise(resolve => setTimeout(resolve, 60));
          link.click();
          const next = await waitFor(() => location.pathname === '/os/page/2/' && heading() !== old);
          const sameDocument = main === document.querySelector('main') && document.activeElement === main;
          history.back();
          const back = await waitFor(() => location.pathname === originalLocation && heading() === old);
          history.forward();
          const forward = await waitFor(() => location.pathname === '/os/page/2/' && heading() !== old);
          const navStillWorks = Boolean(main.querySelector('nav a[href*="/page/3/"]'));
          const ready = !main.hasAttribute('aria-busy') && !document.querySelector('[data-soft98-pro-route-loading]');
          Soft98Pro.configure({quickNavigation:false});
          done({disabledByDefault,next,sameDocument,back,forward,navStillWorks,ready});
        })().catch(error => done({error:String(error)}));
      ` });
      if (!result.next || Object.values(result).some(value => value !== true)) {
        throw new Error("Live quick navigation failed: " + JSON.stringify(result));
      }
      console.log(JSON.stringify({ quickNavigation: result }));
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
