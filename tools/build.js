#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const terser = require("terser");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const VERSION = require(path.join(ROOT, "package.json")).version;

const commonManifest = {
  name: "Soft98 Ad Blocker",
  short_name: "Soft98 Blocker",
  version: VERSION.replace(/[^\d.]/g, ""),
  description: "Resilient Soft98 ad blocking, anti-adblock patching, download recovery, and Soft98 Pro enhancements.",
};

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

async function minifyFile(from, to) {
  const source = fs.readFileSync(from, "utf8");
  const result = await terser.minify(source, {
    compress: { passes: 2, unsafe: false },
    mangle: { keep_fnames: /soft98/i },
    format: { ascii_only: false, comments: false },
  });
  if (result.error) throw result.error;
  mkdir(path.dirname(to));
  fs.writeFileSync(to, `${result.code}\n`, "utf8");
}

function writeJson(target, value) {
  mkdir(path.dirname(target));
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function chromiumManifest() {
  return {
    manifest_version: 3,
    ...commonManifest,
    permissions: ["storage", "tabs"],
    host_permissions: ["*://*.soft98.ir/*"],
    action: { default_title: "Soft98 Ad Blocker", default_popup: "popup.html" },
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
        id: "soft98-ad-blocker@drsdavidsoft.github.io",
        strict_min_version: "109.0",
      },
    },
    permissions: ["storage", "tabs", "*://*.soft98.ir/*"],
    browser_action: { default_title: "Soft98 Ad Blocker", default_popup: "popup.html" },
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
    copyFile(path.join(SRC, "ui", file), path.join(target, file));
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
    archive.directory(source, false);
    archive.finalize();
  });
}

async function buildTarget(name, manifest) {
  const target = path.join(DIST, name);
  mkdir(path.join(target, "assets"));
  writeJson(path.join(target, "manifest.json"), manifest);
  copyUi(target);
  await minifyFile(path.join(SRC, "page", "runtime.js"), path.join(target, "assets", "runtime.page.js"));
  await minifyFile(path.join(SRC, "content", "bridge.js"), path.join(target, "assets", "bridge.js"));
  if (name === "firefox") {
    await minifyFile(path.join(SRC, "content", "firefox-injector.js"), path.join(target, "assets", "firefox-injector.js"));
  }
  await zipDirectory(target, path.join(DIST, "packages", `soft98-ad-blocker-${name}-${VERSION}.zip`));
}

async function main() {
  rmrf(DIST);
  await buildTarget("chromium", chromiumManifest());
  await buildTarget("firefox", firefoxManifest());
  console.log(`Built extension packages in ${path.relative(ROOT, DIST)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
