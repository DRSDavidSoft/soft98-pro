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
for (const removed of [
  "تبلیغات حذف شد، لینک‌ها سالم ماندند",
  "anti-blocking test answered",
]) {
  if (runtime.includes(removed) || userscript.includes(removed)) throw new Error(`Removed success banner text leaked into build: ${removed}`);
}
if (!/pro:!0/.test(runtime) || !/darkDesign:!0/.test(runtime)) {
  throw new Error("Soft98 Pro and dark design must be enabled by default");
}
if (!/role=tab/.test(runtime) || !/data-toggle=tab/.test(runtime) || !/aria-selected/.test(runtime)) {
  throw new Error("Semantic and conventional fallback dark-theme tab styling is missing");
}
if (/PIRATE_LOGO|data:image\/svg\+xml|fa-desktop-alt:before|font-family:\\?Arial/.test(runtime)) {
  throw new Error("Logo/icon replacement hacks must not ship");
}
if (!/data-open=true/.test(runtime) || !/cubic-bezier/.test(runtime)) {
  throw new Error("Soft98 Pro control panel transition styling is missing");
}
if (!/control-position/.test(runtime) || !/pointerdown/.test(runtime) || !/pointermove/.test(runtime) || !/ArrowLeft/.test(runtime)) {
  throw new Error("Persistent pointer and keyboard movement for the Soft98 Pro control is missing");
}
if (!/width:42px;height:42px/.test(runtime) || !/position:absolute/.test(runtime) || !/data-horizontal/.test(runtime) || !/data-vertical/.test(runtime)) {
  throw new Error("Soft98 Pro control geometry and edge-aware panel placement are missing");
}
if (!/scrollDetectorsBlocked/.test(runtime) || !/addEventListener/.test(runtime) || !/blocked scroll-triggered Soft98 detector/.test(runtime)) {
  throw new Error("Scroll-triggered anti-adblock detector firewall is missing");
}
if (!/asiatech/.test(runtime) || !/آسیا/.test(runtime) || !/aside, section, div/.test(runtime)) {
  throw new Error("Named ad frame removal, including Asiatech, is missing");
}
if (!/removed ad card from structural signals/.test(runtime) || !/previousElementSibling/.test(runtime) || !/querySelectorAll\("h1,h2,h3,h4,h5,h6"\)/.test(runtime)) {
  throw new Error("Structural ad-card and separator cleanup is missing");
}
if (!/form\[dir=rtl\]/.test(runtime) || !/unicode-bidi:plaintext/.test(runtime) || !/\.dir=/.test(runtime)) {
  throw new Error("Localized runtime controls must preserve RTL and LTR direction");
}
if (!/data-soft98-pro-surface/.test(runtime) || !/luminance/.test(runtime) || !/data-soft98-pro-tone/.test(runtime)) {
  throw new Error("Heuristic theme surface and contrast repair is missing");
}
const runtimeSource = fs.readFileSync(path.join(ROOT, "src", "runtime.js"), "utf8");
const themeSource = runtimeSource.slice(runtimeSource.indexOf("function installProStyle"), runtimeSource.indexOf("function updateFavicon"));
for (const generatedSelector of ["#navbar_wbd", ".cbd", ".cbdd", ".tbdbp", "[class*=", "[style*="]) {
  if (themeSource.includes(generatedSelector)) throw new Error(`Dark theme depends on a generated site selector: ${generatedSelector}`);
}
if (/normalizePersianText|textContent\)\s*!==?\s*["']/.test(runtimeSource.slice(runtimeSource.indexOf("function headingCardFromSignals"), runtimeSource.indexOf("function hasNamedAdMarker")))) {
  throw new Error("Heading-card cleanup must not depend on a static human-readable label");
}
if (!/alert-warning/.test(runtime) || !/soft98-extension-recommendation/.test(runtime) || !/display:none!important/.test(runtime)) {
  throw new Error("First-paint anti-adblock/banner suppression CSS is missing");
}
if (/enhanceLogo\(\),renderExtensionRecommendation/.test(runtime) || /addTaunt/.test(runtime)) {
  throw new Error("Automatic banner rendering must not run after successful cleanup");
}
const screenshotTool = fs.readFileSync(path.join(ROOT, "tools", "screenshot.js"), "utf8");
if (!screenshotTool.includes("/live?proof=0")) throw new Error("Screenshot generator must capture the clean live page");
const harness = fs.readFileSync(path.join(ROOT, "test", "serve-harness.js"), "utf8");
if (!harness.includes('requestUrl.pathname === "/proxy"') || !harness.includes("rewriteCssAssets")) {
  throw new Error("Live screenshot harness must proxy Soft98 CSS/font assets");
}
if (!userscript.includes("DRSDavidSoft/soft98-pro/main/soft98-pro.user.js")) {
  throw new Error("Userscript update URL must point at the dedicated Soft98 repo");
}

console.log("Soft98 build validation passed");
