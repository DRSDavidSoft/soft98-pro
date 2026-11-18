#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { default: ZipStream } = require("zip-stream");
const { pipeline } = require("node:stream/promises");
const terser = require("terser");
const { writeReleaseNotes } = require("./changelog.js");
const { illustration } = require("./preview-illustrations.js");
const { downloadSounds } = require("./download-sounds.js");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const VERSION = require(path.join(ROOT, "package.json")).version;
const RUNTIME = path.join(SRC, "runtime.js");
const PATCH_ENGINE = path.join(SRC, "patch-engine.js");
const META = path.join(SRC, "meta.txt");
const USERSCRIPT_OUT = path.join(ROOT, "soft98-pro.user.js");
const MESSAGES = JSON.parse(fs.readFileSync(path.join(SRC, "messages.json"), "utf8"));
const OPTION_PREVIEWS = require("../src/option-previews.json");
const PREVIEW_ASSETS = path.join(ROOT, "docs", "assets", "settings");
const PREVIEW_FILES = new Map();
const PREVIEW_CATALOG = Object.fromEntries(Object.entries(OPTION_PREVIEWS).map(([key, entry]) => {
  const illustrated = entry === "illustration";
  const files = illustrated ? [`${key}-off.svg`, `${key}-on.svg`] : entry;
  for (const [index, file] of files.entries()) {
    if (!PREVIEW_FILES.has(file)) PREVIEW_FILES.set(file, illustrated ?
      Buffer.from(illustration(key, index === 1)) : fs.readFileSync(path.join(PREVIEW_ASSETS, file)));
  }
  return [key, { files, illustrated }];
}));
const COMPATIBILITY = JSON.parse(fs.readFileSync(path.join(SRC, "compatibility", "soft98-scripts.json"), "utf8"));
const RELEASE_BASE = "https://github.com/DRSDavidSoft/soft98-pro/releases/latest/download";
const BRAND_FILES = {
  light: path.join(SRC, "assets", "soft98-pro-logo-light.png"),
  pirateDark: path.join(SRC, "assets", "soft98-pro-logo-pirate-dark.png"),
  stockLight: path.join(SRC, "assets", "soft98-stock-logo-light.png"),
  stockDark: path.join(SRC, "assets", "soft98-stock-logo-dark.png"),
  stockCompactLight: path.join(SRC, "assets", "soft98-stock-navbar-light.png"),
  stockCompactDark: path.join(SRC, "assets", "soft98-stock-navbar-dark.png"),
};
const { siAndroid } = require("simple-icons");
const TABLER_ROOT = path.resolve(path.dirname(require.resolve("@tabler/icons/outline/download.svg")), "../..");
const VAZIRMATN_ROOT = path.dirname(require.resolve("@fontsource-variable/vazirmatn/package.json"));
const ICON_NOTICE = `/*!
Tabler Icons (https://github.com/tabler/tabler-icons)
${fs.readFileSync(path.join(TABLER_ROOT, "LICENSE"), "utf8").trim().replace(/\r\n/g, "\n")}

Android path from Simple Icons (https://simpleicons.org), CC0 1.0.
Platform marks belong to their respective owners.

${fs.readFileSync(path.join(VAZIRMATN_ROOT, "LICENSE"), "utf8").trim().replace(/\r\n/g, "\n")}
*/`;
const PAGE_ICONS = Object.fromEntries(Object.entries({
  windows: "filled/brand-windows", apple: "filled/brand-apple",
  devices: "outline/devices", download: "outline/download", link: "outline/link",
  info: "outline/info-circle", help: "outline/help-circle", lock: "outline/lock", check: "outline/check", close: "outline/x", plus: "outline/plus", minus: "outline/minus", star: "outline/star", starFill: "filled/star",
  chevron: "outline/chevron-left", chevronRight: "outline/chevron-right", chevronDown: "outline/chevron-down", copy: "outline/copy", select: "outline/select-all", eye: "outline/eye",
  archive: "outline/archive", web: "outline/world-www", remove: "outline/file-x",
  quote: "outline/quote", alertTriangle: "outline/alert-triangle",
  photo: "outline/photo", document: "outline/file-text", shield: "outline/shield",
  play: "outline/player-play", music: "outline/music", desktop: "outline/device-desktop",
  folder: "outline/folder", author: "outline/user", date: "outline/calendar",
  home: "outline/home", apps: "outline/apps", phone: "outline/device-mobile",
  androidOutline: "outline/brand-android", headphones: "outline/headphones",
  book: "outline/book-2", support: "outline/lifebuoy", forums: "outline/messages",
  menu: "outline/menu-2", dots: "outline/dots", moon: "outline/moon", sun: "outline/sun",
  bell: "outline/bell", mail: "outline/mail", search: "outline/search",
  grid: "outline/layout-grid", arrow: "outline/arrow-left", github: "outline/brand-github",
  settings: "outline/settings", history: "outline/history", external: "outline/external-link",
  news: "outline/news", rss: "outline/rss", twitter: "filled/brand-twitter", anchor: "outline/anchor", up: "outline/arrow-up",
  message: "outline/brand-telegram",
  facebook: "filled/brand-facebook", instagram: "outline/brand-instagram",
}).map(([key, name]) => [key, fs.readFileSync(path.join(TABLER_ROOT, "icons", name + ".svg"), "utf8")
  .replace(/\s+class="[^"]*"/, "").replace(/>\s+</g, "><").replace(/\s+/g, " ").trim()]));
PAGE_ICONS.android = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 1 26 22" fill="currentColor"><path d="${siAndroid.path}"/></svg>`;
PAGE_ICONS.linux = fs.readFileSync(path.join(SRC, "assets", "linux-penguin.svg"), "utf8").trim();

const EXTENSION_ICONS = Object.fromEntries([16, 32, 48, 64, 128].map((size) => [size, `assets/icon-${size}.png`]));
const TOOLBAR_ICONS = { 16: EXTENSION_ICONS[16], 32: EXTENSION_ICONS[32] };
const commonManifest = {
  name: "__MSG_extensionName__",
  short_name: "__MSG_extensionName__",
  version: VERSION.replace(/[^\d.]/g, ""),
  description: "__MSG_extensionDescription__",
  default_locale: "en",
  homepage_url: "https://github.com/DRSDavidSoft/soft98-pro",
  icons: EXTENSION_ICONS,
};

function validateMessages() {
  if (MESSAGES.schemaVersion !== 1 || !MESSAGES.locales || !MESSAGES.locales.en || !MESSAGES.locales.fa) {
    throw new Error("src/messages.json must contain schemaVersion 1 with en and fa locales");
  }
  const shape = (value, prefix = "") => Object.entries(value).flatMap(([key, child]) => {
    const pathName = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" && !Array.isArray(child) ? shape(child, pathName) : [pathName];
  });
  if (JSON.stringify(shape(MESSAGES.locales.en).sort()) !== JSON.stringify(shape(MESSAGES.locales.fa).sort())) {
    throw new Error("English and Persian message catalogs must have identical keys");
  }
}

function validateCompatibility() {
  if (COMPATIBILITY.schemaVersion !== 1 || !Array.isArray(COMPATIBILITY.entries) || !COMPATIBILITY.entries.length) {
    throw new Error("src/compatibility/soft98-scripts.json must contain a non-empty schema version 1 catalog");
  }
  const hashes = new Set();
  for (const entry of COMPATIBILITY.entries) {
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 || "")) throw new Error(`Invalid compatibility hash: ${entry.sha256}`);
    if (hashes.has(entry.sha256)) throw new Error(`Duplicate compatibility hash: ${entry.sha256}`);
    hashes.add(entry.sha256);
  }
}

function dataUrl(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing bundled brand asset: ${path.relative(ROOT, file)}`);
  return `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
}

const replacementCache = new Map();
function sourceReplacements(target) {
  if (replacementCache.has(target)) return replacementCache.get(target);
  const inlined = {};
  const previews = Object.fromEntries(Object.entries(PREVIEW_CATALOG).map(([key, entry]) => {
    const files = entry.files.map((file) => inlined[file] ||= `data:image/${file.endsWith(".svg") ? "svg+xml" : "webp"};base64,${PREVIEW_FILES.get(file).toString("base64")}`);
    return [key, { ...entry, files }];
  }));
  const replacements = {
    __SOFT98_BUILD_TARGET__: target,
    __SOFT98_RECOMMEND_EXTENSION__: target === "userscript" ? "true" : "false",
    __SOFT98_VERSION__: VERSION,
    __SOFT98_MESSAGES__: JSON.stringify(MESSAGES),
    __SOFT98_COMPATIBILITY__: JSON.stringify(COMPATIBILITY),
    __SOFT98_BRAND_ASSETS__: JSON.stringify(Object.fromEntries(Object.entries(BRAND_FILES).map(([key, file]) => [key, dataUrl(file)]))),
    __SOFT98_PAGE_ICONS__: JSON.stringify(PAGE_ICONS),
    __SOFT98_OPTION_PREVIEWS__: JSON.stringify(previews),
    __SOFT98_LISTING_NAVIGATION_CSS__: JSON.stringify(fs.readFileSync(path.join(SRC, "listing-navigation.css"), "utf8")),
    __SOFT98_COMMENTS_CSS__: JSON.stringify(fs.readFileSync(path.join(SRC, "comments.css"), "utf8")),
    __SOFT98_CHROME_CSS__: JSON.stringify(fs.readFileSync(path.join(SRC, "chrome.css"), "utf8")
      .replace(/__CALLOUT_ICON_(info|quote|alertTriangle|check)__/g, (_, icon) =>
        `data:image/svg+xml;base64,${Buffer.from(PAGE_ICONS[icon]).toString("base64")}`)),
    __SOFT98_APPEARANCE_CSS__: JSON.stringify(fs.readFileSync(path.join(SRC, "appearance.css"), "utf8")),
    __SOFT98_LINKDONI_CSS__: JSON.stringify(fs.readFileSync(path.join(SRC, "linkdoni.css"), "utf8").replace(
      "__SOFT98_LINKDONI_FONT__", "data:font/woff2;base64," +
      fs.readFileSync(path.join(VAZIRMATN_ROOT, "files", "vazirmatn-arabic-wght-normal.woff2")).toString("base64"))),
    __SOFT98_EARLY_ADS_CSS__: JSON.stringify(fs.readFileSync(path.join(SRC, "early-ads.css"), "utf8")),
    __SOFT98_NAME__: MESSAGES.locales.en.manifest.name,
    __SOFT98_DESCRIPTION__: MESSAGES.locales.en.manifest.description,
  };
  replacementCache.set(target, replacements);
  return replacements;
}

function applyReplacements(source, target) {
  let output = source;
  for (const [token, value] of Object.entries(sourceReplacements(target))) output = output.replaceAll(token, value);
  return output;
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function mkdir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyFile(from, to) {
  mkdir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function runtimeSource(target) {
  const modules = [PATCH_ENGINE, ...["listing-navigation", "comments", "download-links", "linkdoni", "post-artwork"].map(name => path.join(SRC, name + ".js")), RUNTIME];
  return modules.map((file) => applyReplacements(fs.readFileSync(file, "utf8"), target)).join("\n");
}

async function minifySource(source, to) {
  const result = await terser.minify(source, {
    compress: { passes: 2, unsafe: false },
    mangle: { keep_fnames: /soft98/i },
    format: { ascii_only: false, comments: false },
  });
  if (result.error) throw result.error;
  mkdir(path.dirname(to));
  fs.writeFileSync(to, `${source.includes("const PAGE_ICONS =") ? ICON_NOTICE + "\n" : ""}${result.code}\n`, "utf8");
}

async function minifyFile(from, to) {
  await minifySource(fs.readFileSync(from, "utf8"), to);
}

async function buildUserscript() {
  const meta = applyReplacements(fs.readFileSync(META, "utf8"), "userscript").trim();
  const result = await terser.minify(runtimeSource("userscript"), {
    compress: { passes: 2, unsafe: false },
    mangle: { keep_fnames: /soft98AdBlocker|patchSoft98Code/ },
    format: { ascii_only: true, comments: false },
  });
  if (result.error) throw result.error;
  const output = `${meta}\n\n${ICON_NOTICE}\n${result.code}\n`;
  if (/[^\x00-\x7f]/.test(meta + result.code)) throw new Error("Userscript metadata and executable code must be ASCII-safe");
  fs.writeFileSync(USERSCRIPT_OUT, output, "utf8");
  mkdir(path.join(DIST, "userscript"));
  fs.writeFileSync(path.join(DIST, "userscript", "soft98-pro.user.js"), output, "utf8");
}

function writeJson(target, value) {
  mkdir(path.dirname(target));
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function chromiumManifest() {
  return {
    manifest_version: 3,
    ...commonManifest,
    permissions: ["storage", "tabs", "alarms", "scripting", "webRequest", "downloads", "downloads.open", "notifications", "offscreen"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    host_permissions: [
      "*://*.soft98.ir/*",
      "https://*.82.ir.cdn.ir/*",
      "https://github.com/DRSDavidSoft/soft98-pro/releases/*",
      "https://api.github.com/repos/DRSDavidSoft/soft98-pro/releases/*",
      "https://release-assets.githubusercontent.com/*",
      "https://objects.githubusercontent.com/*",
    ],
    background: { service_worker: "assets/background.js" },
    web_accessible_resources: [{ resources: ["header-queue.html"], matches: ["*://*.soft98.ir/*"] }],
    action: { default_title: "__MSG_extensionName__", default_popup: "popup.html", default_icon: TOOLBAR_ICONS },
    options_page: "options.html",
    content_scripts: [
      {
        matches: ["*://*.soft98.ir/*"],
        css: ["assets/early-ads.css"],
        js: ["assets/bridge.js"],
        run_at: "document_start",
      },
      {
        matches: ["*://*.soft98.ir/*"],
        js: ["assets/runtime.page.js"],
        run_at: "document_start",
        world: "MAIN",
      },
    ],
  };
}

function firefoxManifest() {
  return {
    manifest_version: 2,
    ...commonManifest,
    browser_specific_settings: {
      gecko: {
        id: "soft98-pro@drsdavidsoft.github.io",
        strict_min_version: "109.0",
        data_collection_permissions: { required: ["none"] },
      },
    },
    permissions: [
      "storage",
      "tabs",
      "alarms",
      "webRequest",
      "webRequestBlocking",
      "downloads",
      "downloads.open",
      "notifications",
      "*://*.soft98.ir/*",
      "https://*.82.ir.cdn.ir/*",
      "https://github.com/DRSDavidSoft/soft98-pro/releases/*",
      "https://api.github.com/repos/DRSDavidSoft/soft98-pro/releases/*",
      "https://release-assets.githubusercontent.com/*",
      "https://objects.githubusercontent.com/*",
    ],
    optional_permissions: ["http://*/*", "https://*/*"],
    background: { scripts: ["assets/release-client.js", "assets/background.js"], persistent: false },
    browser_action: { default_title: "__MSG_extensionName__", default_popup: "popup.html", default_icon: TOOLBAR_ICONS },
    options_ui: { page: "options.html", open_in_tab: true },
    web_accessible_resources: ["assets/runtime.page.js", "assets/upstream-gateway.js", "header-queue.html"],
    content_scripts: [
      {
        matches: ["*://*.soft98.ir/*"],
        css: ["assets/early-ads.css"],
        js: ["assets/bridge.js", "assets/firefox-injector.js"],
        run_at: "document_start",
      },
    ],
  };
}

function copyUi(target) {
  const catalog = JSON.parse(fs.readFileSync(path.join(SRC, "ui", "downloads.messages.json"), "utf8"));
  if (JSON.stringify(Object.keys(catalog.en).sort()) !== JSON.stringify(Object.keys(catalog.fa).sort())) throw new Error("Download catalogs must have identical keys");
  const icons = Object.fromEntries(["download", "plus", "player-play", "player-pause", "x", "rotate-clockwise", "folder-open", "trash", "file-upload", "clipboard", "list-details", "settings", "dots", "external-link", "file", "file-zip", "file-text", "photo", "video", "music", "package", "link", "square-check", "square", "help-circle",
    "chevron-down", "tag", "database", "calendar", "grip-vertical", "sort-ascending", "sort-descending", "arrow-left", "arrow-right",
    "file-type-pdf", "table", "presentation", "terminal-2", "disc", "code", "device-mobile", "lock-open", "bell", "check", "sun", "moon", "volume", "chevron-right"].map((name) => [name,
    fs.readFileSync(path.join(TABLER_ROOT, "icons", "outline", `${name}.svg`), "utf8")]));
  for (const file of ["options.html", "options.js", "styles.css"]) {
    const from = path.join(SRC, "ui", file);
    const to = path.join(target, file);
    if (file.endsWith(".js")) {
      mkdir(path.dirname(to));
      fs.writeFileSync(to, applyReplacements(fs.readFileSync(from, "utf8"), "extension")
        .replace("__SOFT98_SETTINGS_PREVIEWS__", () => JSON.stringify(PREVIEW_CATALOG)), "utf8");
    } else if (file.endsWith(".html")) {
      const labels = ["en", "fa"].map((lang) => `<span lang="${lang}">${catalog[lang].title.replace(/[&<>]/g, (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[value])}</span>`).join("");
      const nav = `<nav class="downloads-entry" aria-label="Soft98 Pro"><a href="downloads.html" target="_blank" rel="noopener"><span aria-hidden="true">${icons.download}</span>${labels}</a></nav>`;
      fs.writeFileSync(to, fs.readFileSync(from, "utf8").replace("<main data-app>", `${nav}\n    <main data-app>`).replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css">\n    <link rel="stylesheet" href="downloads-link.css">'), "utf8");
    } else {
      copyFile(from, to);
    }
  }
  for (const file of ["downloads.html", "downloads.js", "downloads.css", "downloads-link.css", "download-import.js", "download-view.js", "download-select.js", "download-manager.svg", "typography.css", "theme.js", "theme.css",
    "header-queue.html", "header-queue.css", "header-queue.js"]) {
    copyFile(path.join(SRC, "ui", file), path.join(target, file));
  }
  copyFile(path.join(SRC, "appearance.css"), path.join(target, "appearance.css"));
  const managerPage = fs.readFileSync(path.join(SRC, "ui", "downloads.html"), "utf8");
  fs.writeFileSync(path.join(target, "popup.html"), managerPage.replace('<html lang="en">', '<html lang="en" data-compact-popup>'), "utf8");
  copyFile(path.join(SRC, "download-links.js"), path.join(target, "download-links.js"));
  const previewDir = path.join(target, "assets", "previews");
  mkdir(previewDir);
  for (const [file, content] of PREVIEW_FILES) fs.writeFileSync(path.join(previewDir, file), content);
  copyFile(path.join(TABLER_ROOT, "icons", "outline", "photo.svg"), path.join(target, "assets", "preview-icon.svg"));
  copyFile(path.join(TABLER_ROOT, "LICENSE"), path.join(target, "TABLER-LICENSE.txt"));
  copyFile(path.join(VAZIRMATN_ROOT, "LICENSE"), path.join(target, "VAZIRMATN-LICENSE.txt"));
  for (const subset of ["arabic", "latin"]) {
    const font = `vazirmatn-${subset}-wght-normal.woff2`;
    copyFile(path.join(VAZIRMATN_ROOT, "files", font), path.join(target, "assets", font));
  }
  fs.writeFileSync(path.join(target, "download-ui-catalog.js"), `const Soft98DownloadCatalog = ${JSON.stringify({ catalog, icons })};\n`, "utf8");
}

async function zipDirectory(source, output) {
  mkdir(path.dirname(output));
  const files = fs.readdirSync(source, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name)).sort();
  const archive = new ZipStream({ zlib: { level: 9 } });
  const written = pipeline(archive, fs.createWriteStream(output));
  // Handle stream errors even while waiting for an entry callback.
  const fill = async () => {
    for (const file of files) {
      const content = fs.readFileSync(file);
      const metadata = {
        name: path.relative(source, file).split(path.sep).join("/"),
        date: new Date("1980-01-01T00:00:00.000Z"),
        mode: 0o644,
      };
      await new Promise((resolve, reject) => {
        archive.entry(content, metadata, (error) => error ? reject(error) : resolve());
      });
    }
    archive.finish();
  };
  try {
    await Promise.all([fill(), written]);
  } catch (error) {
    archive.destroy();
    throw error;
  }
}

async function buildTarget(name, manifest) {
  const target = path.join(DIST, name);
  mkdir(path.join(target, "assets"));
  for (const file of Object.values(EXTENSION_ICONS)) copyFile(path.join(SRC, file), path.join(target, file));
  for (const [locale, { manifest: copy }] of Object.entries(MESSAGES.locales)) {
    writeJson(path.join(target, "_locales", locale, "messages.json"), {
      extensionName: { message: copy.name },
      extensionDescription: { message: copy.description },
    });
  }
  writeJson(path.join(target, "manifest.json"), manifest);
  copyUi(target);
  fs.writeFileSync(path.join(target, "assets", "user-origin.css"),
    ["user-origin.css", "early-ads.css"].map(file => fs.readFileSync(path.join(SRC, file), "utf8")).join("\n"));
  copyFile(path.join(SRC, "early-ads.css"), path.join(target, "assets", "early-ads.css"));
  await minifyFile(path.join(SRC, "release-client.js"), path.join(target, "assets", "release-client.js"));
  await minifySource(runtimeSource(name === "chromium" ? "chromium" : "extension"), path.join(target, "assets", "runtime.page.js"));
  const backgroundPrefix = name === "chromium" ? 'importScripts("release-client.js");\n' : "";
  const queue = fs.readFileSync(path.join(SRC, "download-queue.js"), "utf8");
  const links = fs.readFileSync(path.join(SRC, "download-links.js"), "utf8");
  const probe = fs.readFileSync(path.join(SRC, "download-probe.js"), "utf8");
  const audio = fs.readFileSync(path.join(SRC, "download-audio.js"), "utf8");
  const soundDir = path.join(target, "assets", "download-sounds");
  mkdir(soundDir);
  for (const [file, contents] of downloadSounds()) fs.writeFileSync(path.join(soundDir, file), contents);
  await minifySource(audio, path.join(target, "assets", "download-audio.js"));
  if (name === "chromium") {
    copyFile(path.join(SRC, "download-audio-offscreen.html"), path.join(target, "download-audio-offscreen.html"));
    await minifyFile(path.join(SRC, "download-audio-offscreen.js"), path.join(target, "assets", "download-audio-offscreen.js"));
  }
  await minifySource(backgroundPrefix + links + "\n" + audio + "\n" + queue + "\n" + probe + "\n" + applyReplacements(fs.readFileSync(path.join(SRC, "background.js"), "utf8"), "extension"), path.join(target, "assets", "background.js"));
  await minifyFile(path.join(SRC, "content", "bridge.js"), path.join(target, "assets", "bridge.js"));
  if (name === "firefox") {
    await minifyFile(path.join(SRC, "content", "upstream-gateway.js"), path.join(target, "assets", "upstream-gateway.js"));
    await minifyFile(path.join(SRC, "content", "firefox-injector.js"), path.join(target, "assets", "firefox-injector.js"));
  }
  await zipDirectory(target, path.join(DIST, "packages", `soft98-pro-${name}-${VERSION}.zip`));
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function writeReleaseMetadata() {
  const packageNames = [
    `soft98-pro-chromium-${VERSION}.zip`,
    `soft98-pro-firefox-${VERSION}.zip`,
    `soft98-pro-userscript-${VERSION}.zip`,
  ];
  const releaseNotesPath = path.join(DIST, "release", "RELEASE-NOTES.md");
  writeReleaseNotes(releaseNotesPath, VERSION);
  const files = [USERSCRIPT_OUT, ...packageNames.map((name) => path.join(DIST, "packages", name)), releaseNotesPath];
  const assets = Object.fromEntries(files.map((file) => {
    const name = path.basename(file);
    return [name, { url: `${RELEASE_BASE}/${name}`, sha256: sha256(file), bytes: fs.statSync(file).size }];
  }));
  const metadata = {
    schemaVersion: 1,
    product: MESSAGES.locales.en.manifest.name,
    version: VERSION,
    releaseUrl: "https://github.com/DRSDavidSoft/soft98-pro/releases/latest",
    userscript: assets["soft98-pro.user.js"],
    chromium: assets[`soft98-pro-chromium-${VERSION}.zip`],
    firefox: assets[`soft98-pro-firefox-${VERSION}.zip`],
    releaseNotes: assets["RELEASE-NOTES.md"],
    assets,
  };
  writeJson(path.join(DIST, "release", "latest.json"), metadata);
  const checksums = Object.entries(assets).map(([name, asset]) => `${asset.sha256}  ${name}`).join("\n");
  fs.writeFileSync(path.join(DIST, "release", "SHA256SUMS.txt"), `${checksums}\n`, "utf8");
}

async function main() {
  validateMessages();
  validateCompatibility();
  rmrf(DIST);
  await buildUserscript();
  await buildTarget("chromium", chromiumManifest());
  await buildTarget("firefox", firefoxManifest());
  await zipDirectory(path.join(DIST, "userscript"), path.join(DIST, "packages", `soft98-pro-userscript-${VERSION}.zip`));
  writeReleaseMetadata();
  console.log(`Built Soft98 packages in ${path.relative(ROOT, DIST)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
