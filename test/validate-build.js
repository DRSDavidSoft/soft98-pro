#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const VERSION = require(path.join(ROOT, "package.json")).version;
const required = [
  "chromium/manifest.json",
  "chromium/assets/runtime.page.js",
  "chromium/assets/bridge.js",
  "chromium/popup.html",
  "firefox/manifest.json",
  "firefox/assets/runtime.page.js",
  "firefox/assets/bridge.js",
  "firefox/assets/firefox-injector.js",
  "firefox/options.html",
  "userscript/soft98-pro.user.js",
  `packages/soft98-pro-chromium-${VERSION}.zip`,
  `packages/soft98-pro-firefox-${VERSION}.zip`,
  `packages/soft98-pro-userscript-${VERSION}.zip`,
];

for (const file of required) {
  const target = path.join(DIST, file);
  if (!fs.existsSync(target)) throw new Error(`Missing build artifact: ${file}`);
}

const chromium = JSON.parse(fs.readFileSync(path.join(DIST, "chromium", "manifest.json"), "utf8"));
const firefox = JSON.parse(fs.readFileSync(path.join(DIST, "firefox", "manifest.json"), "utf8"));
if (chromium.manifest_version !== 3) throw new Error("Chromium manifest must be MV3");
if (firefox.manifest_version !== 2) throw new Error("Firefox manifest must be MV2");
if (!chromium.content_scripts.some((entry) => entry.world === "MAIN")) {
  throw new Error("Chromium build must run the page runtime in MAIN world");
}

const runtime = fs.readFileSync(path.join(DIST, "chromium", "assets", "runtime.page.js"), "utf8");
const userscript = fs.readFileSync(path.join(ROOT, "soft98-pro.user.js"), "utf8");
for (const needle of ["fbd", "abdd", "error_abdd", "fbd--compiled"]) {
  if (runtime.includes(needle)) throw new Error(`Fragile generated Soft98 identifier leaked into runtime: ${needle}`);
  if (userscript.includes(needle)) throw new Error(`Fragile generated Soft98 identifier leaked into userscript: ${needle}`);
}
if (!/PersianBlocker|MasterKia/.test(runtime)) throw new Error("PersianBlocker notice handling is missing");
if (!/\.toDataURL\("image\/png"\)/.test(runtime) || !/soft98-pro-favicon/.test(runtime)) {
  throw new Error("Canvas favicon status indicator is missing");
}
if (!userscript.includes("DRSDavidSoft/soft98-pro/main/soft98-pro.user.js")) {
  throw new Error("Userscript update URL must point at the dedicated Soft98 repo");
}

console.log("Soft98 build validation passed");
