#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const archiver = require("archiver");
const terser = require("terser");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const VERSION = require(path.join(ROOT, "package.json")).version;
const RUNTIME = path.join(SRC, "runtime.js");
const META = path.join(SRC, "meta.txt");
const USERSCRIPT_OUT = path.join(ROOT, "soft98-pro.user.js");
const MESSAGES = JSON.parse(fs.readFileSync(path.join(SRC, "messages.json"), "utf8"));
const RELEASE_BASE = "https://github.com/DRSDavidSoft/soft98-pro/releases/latest/download";
const BRAND_FILES = {
  light: path.join(SRC, "assets", "soft98-pro-logo-light.png"),
  pirateDark: path.join(SRC, "assets", "soft98-pro-logo-pirate-dark.png"),
};

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

function dataUrl(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing bundled brand asset: ${path.relative(ROOT, file)}`);
  return `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
}

function sourceReplacements(target) {
  return {
    __SOFT98_BUILD_TARGET__: target,
    __SOFT98_RECOMMEND_EXTENSION__: target === "extension" ? "false" : "true",
    __SOFT98_VERSION__: VERSION,
    __SOFT98_MESSAGES__: JSON.stringify(MESSAGES),
    __SOFT98_BRAND_ASSETS__: JSON.stringify(Object.fromEntries(Object.entries(BRAND_FILES).map(([key, file]) => [key, dataUrl(file)]))),
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
  return applyReplacements(fs.readFileSync(RUNTIME, "utf8"), target);
}

async function minifySource(source, to) {
  const result = await terser.minify(source, {
    compress: { passes: 2, unsafe: false },
    mangle: { keep_fnames: /soft98/i },
    format: { ascii_only: false, comments: false },
  });
  if (result.error) throw result.error;
  mkdir(path.dirname(to));
  fs.writeFileSync(to, `${result.code}\n`, "utf8");
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
  const output = `${meta}\n\n${result.code}\n`;
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
    permissions: ["storage", "tabs", "alarms", "scripting"],
    host_permissions: [
      "*://*.soft98.ir/*",
      "https://github.com/DRSDavidSoft/soft98-pro/releases/*",
      "https://api.github.com/repos/DRSDavidSoft/soft98-pro/releases/*",
      "https://release-assets.githubusercontent.com/*",
      "https://objects.githubusercontent.com/*",
    ],
    background: { service_worker: "assets/background.js" },
    action: { default_title: "Soft98 Pro", default_popup: "popup.html" },
    options_page: "options.html",
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
      "*://*.soft98.ir/*",
      "https://github.com/DRSDavidSoft/soft98-pro/releases/*",
      "https://api.github.com/repos/DRSDavidSoft/soft98-pro/releases/*",
      "https://release-assets.githubusercontent.com/*",
      "https://objects.githubusercontent.com/*",
    ],
    background: { scripts: ["assets/release-client.js", "assets/background.js"], persistent: false },
    browser_action: { default_title: "Soft98 Pro", default_popup: "popup.html" },
    options_ui: { page: "options.html", open_in_tab: true },
    web_accessible_resources: ["assets/runtime.page.js"],
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
  for (const file of ["popup.html", "options.html", "options.js", "styles.css"]) {
    const from = path.join(SRC, "ui", file);
    const to = path.join(target, file);
    if (file.endsWith(".js")) {
      mkdir(path.dirname(to));
      fs.writeFileSync(to, applyReplacements(fs.readFileSync(from, "utf8"), "extension"), "utf8");
    } else {
      copyFile(from, to);
    }
  }
}

async function zipDirectory(source, output) {
  mkdir(path.dirname(output));
  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(output);
    const archive = archiver("zip", { zlib: { level: 9 } });
    stream.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(stream);
    const files = [];
    const collect = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) collect(target);
        else if (entry.isFile()) files.push(target);
      }
    };
    collect(source);
    for (const file of files.sort()) {
      archive.append(fs.readFileSync(file), {
        name: path.relative(source, file).split(path.sep).join("/"),
        date: new Date("1980-01-01T00:00:00.000Z"),
        mode: 0o644,
      });
    }
    archive.finalize();
  });
}

async function buildTarget(name, manifest) {
  const target = path.join(DIST, name);
  mkdir(path.join(target, "assets"));
  writeJson(path.join(target, "manifest.json"), manifest);
  copyUi(target);
  copyFile(path.join(SRC, "user-origin.css"), path.join(target, "assets", "user-origin.css"));
  await minifyFile(path.join(SRC, "release-client.js"), path.join(target, "assets", "release-client.js"));
  await minifySource(runtimeSource("extension"), path.join(target, "assets", "runtime.page.js"));
  const backgroundPrefix = name === "chromium" ? 'importScripts("release-client.js");\n' : "";
  await minifySource(backgroundPrefix + applyReplacements(fs.readFileSync(path.join(SRC, "background.js"), "utf8"), "extension"), path.join(target, "assets", "background.js"));
  await minifyFile(path.join(SRC, "content", "bridge.js"), path.join(target, "assets", "bridge.js"));
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
  const files = [USERSCRIPT_OUT, ...packageNames.map((name) => path.join(DIST, "packages", name))];
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
    assets,
  };
  writeJson(path.join(DIST, "release", "latest.json"), metadata);
  const checksums = Object.entries(assets).map(([name, asset]) => `${asset.sha256}  ${name}`).join("\n");
  fs.writeFileSync(path.join(DIST, "release", "SHA256SUMS.txt"), `${checksums}\n`, "utf8");
}

async function main() {
  validateMessages();
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
