#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { default: ZipStream } = require("zip-stream");
const { pipeline } = require("node:stream/promises");
const terser = require("terser");
const { writeReleaseNotes } = require("./changelog.js");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const VERSION = require(path.join(ROOT, "package.json")).version;
const RUNTIME = path.join(SRC, "runtime.js");
const PATCH_ENGINE = path.join(SRC, "patch-engine.js");
const META = path.join(SRC, "meta.txt");
const USERSCRIPT_OUT = path.join(ROOT, "soft98-pro.user.js");
const MESSAGES = JSON.parse(fs.readFileSync(path.join(SRC, "messages.json"), "utf8"));
const COMPATIBILITY = JSON.parse(fs.readFileSync(path.join(SRC, "compatibility", "soft98-scripts.json"), "utf8"));
const RELEASE_BASE = "https://github.com/DRSDavidSoft/soft98-pro/releases/latest/download";
const BRAND_FILES = {
  light: path.join(SRC, "assets", "soft98-pro-logo-light.png"),
  pirateDark: path.join(SRC, "assets", "soft98-pro-logo-pirate-dark.png"),
};
const { siAndroid, siKaspersky, siDotnet, siOpenjdk, siRustdesk } = require("simple-icons");
const TABLER_ROOT = path.resolve(path.dirname(require.resolve("@tabler/icons/outline/download.svg")), "../..");
const UTILITY_ASSETS = path.join(SRC, "assets", "utility");
const ICON_NOTICE = `/*!
Tabler Icons (https://github.com/tabler/tabler-icons)
${fs.readFileSync(path.join(TABLER_ROOT, "LICENSE"), "utf8").trim().replace(/\r\n/g, "\n")}

Android, Kaspersky, .NET, OpenJDK and RustDesk paths from Simple Icons (https://simpleicons.org), CC0 1.0.
VLC icon copyright (c) 1996-2010 VideoLAN. Use is permitted to identify VideoLAN
and its products; no endorsement is implied. https://www.videolan.org/goodies.html
Firefox and Free Download Manager artwork by Papirus contributors (GPL-3.0).
Sources and license: https://github.com/DRSDavidSoft/soft98-pro/tree/develop/src/assets/utility
Platform marks belong to their respective owners.
*/`;
const PAGE_ICONS = Object.fromEntries(Object.entries({
  windows: "filled/brand-windows", apple: "filled/brand-apple",
  devices: "outline/devices", download: "outline/download", link: "outline/link",
  info: "outline/info-circle", help: "outline/help-circle", lock: "outline/lock",
  chevron: "outline/chevron-left", copy: "outline/copy", select: "outline/select-all", eye: "outline/eye",
  archive: "outline/archive", web: "outline/world-www", remove: "outline/file-x",
  photo: "outline/photo", document: "outline/file-text", shield: "outline/shield",
  play: "outline/player-play", music: "outline/music", desktop: "outline/device-desktop",
  folder: "outline/folder", author: "outline/user", date: "outline/calendar",
  menu: "outline/menu-2", moon: "outline/moon", sun: "outline/sun",
  bell: "outline/bell", mail: "outline/mail", search: "outline/search",
  grid: "outline/layout-grid", arrow: "outline/arrow-left",
}).map(([key, name]) => [key, fs.readFileSync(path.join(TABLER_ROOT, "icons", name + ".svg"), "utf8")
  .replace(/\s+class="[^"]*"/, "").replace(/>\s+</g, "><").replace(/\s+/g, " ").trim()]));
PAGE_ICONS.android = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 1 26 22" fill="currentColor"><path d="${siAndroid.path}"/></svg>`;
for (const [key, icon, fill] of [
  ["kaspersky", siKaspersky, "#5ad8bc"], ["dotnet", siDotnet, "#aab5ff"],
  ["java", siOpenjdk, "#ff9c68"], ["rustdesk", siRustdesk, "#94cef9"],
]) PAGE_ICONS[key] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill}"><path d="${icon.path}"/></svg>`;
PAGE_ICONS.linux = fs.readFileSync(path.join(SRC, "assets", "linux-penguin.svg"), "utf8").trim();
PAGE_ICONS.vlc = `<img alt="" width="26" height="28" src="${dataUrl(path.join(SRC, "assets", "vlc.png"))}">`;
for (const name of ["firefox", "freedownloadmanager", "chrome", "edge", "winrar", "revo"]) {
  const svg = fs.readFileSync(path.join(UTILITY_ASSETS, name + ".svg"), "utf8");
  PAGE_ICONS[name] = `<img alt="" width="32" height="32" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}">`;
}

const commonManifest = {
  name: MESSAGES.locales.en.manifest.name,
  short_name: MESSAGES.locales.en.manifest.name,
  version: VERSION.replace(/[^\d.]/g, ""),
  description: MESSAGES.locales.en.manifest.description,
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

function sourceReplacements(target) {
  const previews = Object.fromEntries(["protection", "appearance", "layout"].map((name) => {
    const file = name + "-preview.svg";
    const source = target === "extension" ?
      "data:image/svg+xml;base64," + fs.readFileSync(path.join(ROOT, "docs", "assets", file)).toString("base64") :
      "https://raw.githubusercontent.com/DRSDavidSoft/soft98-pro/develop/docs/assets/" + file;
    return [name, source];
  }));
  return {
    __SOFT98_BUILD_TARGET__: target,
    __SOFT98_RECOMMEND_EXTENSION__: target === "extension" ? "false" : "true",
    __SOFT98_VERSION__: VERSION,
    __SOFT98_MESSAGES__: JSON.stringify(MESSAGES),
    __SOFT98_COMPATIBILITY__: JSON.stringify(COMPATIBILITY),
    __SOFT98_BRAND_ASSETS__: JSON.stringify(Object.fromEntries(Object.entries(BRAND_FILES).map(([key, file]) => [key, dataUrl(file)]))),
    __SOFT98_PAGE_ICONS__: JSON.stringify(PAGE_ICONS),
    __SOFT98_OPTION_PREVIEWS__: JSON.stringify(previews),
    __SOFT98_NAME__: MESSAGES.locales.en.manifest.name,
    __SOFT98_DESCRIPTION__: MESSAGES.locales.en.manifest.description,
  };
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
  return `${fs.readFileSync(PATCH_ENGINE, "utf8")}\n${applyReplacements(fs.readFileSync(RUNTIME, "utf8"), target)}`;
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
    format: { ascii_only: false, comments: false },
  });
  if (result.error) throw result.error;
  const output = `${meta}\n\n${ICON_NOTICE}\n${result.code}\n`;
  fs.writeFileSync(USERSCRIPT_OUT, output, "utf8");
  mkdir(path.join(DIST, "userscript"));
  fs.writeFileSync(path.join(DIST, "userscript", "soft98-pro.user.js"), output, "utf8");
  copyFile(path.join(UTILITY_ASSETS, "PAPIRUS-LICENSE.txt"), path.join(DIST, "userscript", "PAPIRUS-LICENSE.txt"));
}

function writeJson(target, value) {
  mkdir(path.dirname(target));
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function chromiumManifest() {
  return {
    manifest_version: 3,
    ...commonManifest,
    permissions: ["storage", "tabs", "alarms", "scripting", "webRequest", "declarativeNetRequestWithHostAccess", "downloads"],
    host_permissions: [
      "*://*.soft98.ir/*",
      "https://github.com/DRSDavidSoft/soft98-pro/releases/*",
      "https://api.github.com/repos/DRSDavidSoft/soft98-pro/releases/*",
      "https://release-assets.githubusercontent.com/*",
      "https://objects.githubusercontent.com/*",
    ],
    background: { service_worker: "assets/background.js" },
    declarative_net_request: {
      rule_resources: [{ id: "soft98_upstream_gateway", enabled: true, path: "rules.json" }],
    },
    action: { default_title: "Soft98 Pro", default_popup: "popup.html" },
    options_page: "options.html",
    web_accessible_resources: [{ resources: ["assets/upstream-gateway.js"], matches: ["*://*.soft98.ir/*"] }],
    content_scripts: [
      {
        matches: ["*://*.soft98.ir/*"],
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
    applications: {
      gecko: {
        id: "soft98-pro@drsdavidsoft.github.io",
        strict_min_version: "109.0",
      },
    },
    permissions: [
      "storage",
      "tabs",
      "alarms",
      "webRequest",
      "webRequestBlocking",
      "downloads",
      "*://*.soft98.ir/*",
      "https://github.com/DRSDavidSoft/soft98-pro/releases/*",
      "https://api.github.com/repos/DRSDavidSoft/soft98-pro/releases/*",
      "https://release-assets.githubusercontent.com/*",
      "https://objects.githubusercontent.com/*",
    ],
    background: { scripts: ["assets/release-client.js", "assets/background.js"], persistent: false },
    browser_action: { default_title: "Soft98 Pro", default_popup: "popup.html" },
    options_ui: { page: "options.html", open_in_tab: true },
    web_accessible_resources: ["assets/runtime.page.js", "assets/upstream-gateway.js"],
    content_scripts: [
      {
        matches: ["*://*.soft98.ir/*"],
        js: ["assets/bridge.js", "assets/firefox-injector.js"],
        run_at: "document_start",
      },
    ],
  };
}

function copyUi(target) {
  const catalog = JSON.parse(fs.readFileSync(path.join(SRC, "ui", "downloads.messages.json"), "utf8"));
  if (JSON.stringify(Object.keys(catalog.en).sort()) !== JSON.stringify(Object.keys(catalog.fa).sort())) throw new Error("Download catalogs must have identical keys");
  const icons = Object.fromEntries(["download", "plus", "player-play", "player-pause", "x", "rotate-clockwise", "folder-open", "trash"].map((name) => [name,
    fs.readFileSync(path.join(TABLER_ROOT, "icons", "outline", `${name}.svg`), "utf8")]));
  for (const file of ["popup.html", "options.html", "options.js", "styles.css"]) {
    const from = path.join(SRC, "ui", file);
    const to = path.join(target, file);
    if (file.endsWith(".js")) {
      mkdir(path.dirname(to));
      fs.writeFileSync(to, applyReplacements(fs.readFileSync(from, "utf8"), "extension"), "utf8");
    } else if (file.endsWith(".html")) {
      const labels = ["en", "fa"].map((lang) => `<span lang="${lang}">${catalog[lang].title.replace(/[&<>]/g, (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[value])}</span>`).join("");
      const nav = `<nav class="downloads-entry" aria-label="Soft98 Pro"><a href="downloads.html" target="_blank" rel="noopener"><span aria-hidden="true">${icons.download}</span>${labels}</a></nav>`;
      fs.writeFileSync(to, fs.readFileSync(from, "utf8").replace("<main data-app>", `${nav}\n    <main data-app>`).replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css">\n    <link rel="stylesheet" href="downloads-link.css">'), "utf8");
    } else {
      copyFile(from, to);
    }
  }
  for (const file of ["downloads.html", "downloads.css", "downloads-link.css"]) copyFile(path.join(SRC, "ui", file), path.join(target, file));
  copyFile(path.join(TABLER_ROOT, "LICENSE"), path.join(target, "TABLER-LICENSE.txt"));
  const downloads = fs.readFileSync(path.join(SRC, "ui", "downloads.js"), "utf8")
    .replace("__SOFT98_DOWNLOAD_MESSAGES__", () => JSON.stringify(catalog))
    .replace("__SOFT98_DOWNLOAD_ICONS__", () => JSON.stringify(icons));
  fs.writeFileSync(path.join(target, "downloads.js"), downloads, "utf8");
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

function chromiumRules() {
  return [{
    id: 1,
    priority: 1,
    action: { type: "redirect", redirect: { extensionPath: "/assets/upstream-gateway.js" } },
    condition: {
      regexFilter: "^https?://([^/]+\\.)?soft98\\.ir/templates/.*/(application\\.min\\.packed|jquery(-v[^/?#]+)?(\\.min\\.packed)?)\\.js([?#].*)?$",
      isUrlFilterCaseSensitive: false,
      initiatorDomains: ["soft98.ir"],
      resourceTypes: ["script"],
    },
  }];
}

async function buildTarget(name, manifest) {
  const target = path.join(DIST, name);
  mkdir(path.join(target, "assets"));
  copyFile(path.join(UTILITY_ASSETS, "PAPIRUS-LICENSE.txt"), path.join(target, "PAPIRUS-LICENSE.txt"));
  writeJson(path.join(target, "manifest.json"), manifest);
  copyUi(target);
  copyFile(path.join(SRC, "user-origin.css"), path.join(target, "assets", "user-origin.css"));
  await minifyFile(path.join(SRC, "release-client.js"), path.join(target, "assets", "release-client.js"));
  await minifySource(runtimeSource("extension"), path.join(target, "assets", "runtime.page.js"));
  const backgroundPrefix = name === "chromium" ? 'importScripts("release-client.js");\n' : "";
  const queue = fs.readFileSync(path.join(SRC, "download-queue.js"), "utf8");
  await minifySource(backgroundPrefix + queue + "\n" + applyReplacements(fs.readFileSync(path.join(SRC, "background.js"), "utf8"), "extension"), path.join(target, "assets", "background.js"));
  await minifyFile(path.join(SRC, "content", "bridge.js"), path.join(target, "assets", "bridge.js"));
  await minifyFile(path.join(SRC, "content", "upstream-gateway.js"), path.join(target, "assets", "upstream-gateway.js"));
  if (name === "chromium") writeJson(path.join(target, "rules.json"), chromiumRules());
  if (name === "firefox") {
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
    product: commonManifest.name,
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
