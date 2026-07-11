#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
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
for (const needle of ["fbd", "abdd", "error_abdd", "fbd--compiled"]) {
  if (runtime.includes(needle)) throw new Error(`Fragile generated Soft98 identifier leaked into runtime: ${needle}`);
}
if (!/PersianBlocker|MasterKia/.test(runtime)) throw new Error("PersianBlocker notice handling is missing");

console.log("Extension build validation passed");
