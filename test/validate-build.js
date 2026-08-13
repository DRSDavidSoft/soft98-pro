#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const VERSION = require(path.join(ROOT, "package.json")).version;
const messages = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "messages.json"), "utf8"));
const compatibility = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "compatibility", "soft98-scripts.json"), "utf8"));
const required = [
  "chromium/manifest.json",
  "chromium/assets/runtime.page.js",
  "chromium/assets/bridge.js",
  "chromium/assets/background.js",
  "chromium/assets/release-client.js",
  "chromium/assets/user-origin.css",
  "chromium/popup.html",
  "firefox/manifest.json",
  "firefox/assets/runtime.page.js",
  "firefox/assets/bridge.js",
  "firefox/assets/background.js",
  "firefox/assets/release-client.js",
  "firefox/assets/user-origin.css",
  "firefox/assets/firefox-injector.js",
  "firefox/options.html",
  "userscript/soft98-pro.user.js",
  `packages/soft98-pro-chromium-${VERSION}.zip`,
  `packages/soft98-pro-firefox-${VERSION}.zip`,
  `packages/soft98-pro-userscript-${VERSION}.zip`,
  "release/latest.json",
  "release/SHA256SUMS.txt",
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
if (!chromium.permissions.includes("scripting")) throw new Error("Chromium build must support USER-origin compatibility CSS");
if (!chromium.permissions.includes("webRequest") || !firefox.permissions.includes("webRequest")) throw new Error("Extension builds must observe Soft98 script responses");

const runtime = fs.readFileSync(path.join(DIST, "chromium", "assets", "runtime.page.js"), "utf8");
const userscript = fs.readFileSync(path.join(ROOT, "soft98-pro.user.js"), "utf8");
const runtimeWithoutImages = runtime.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, "data:image/png;base64,ASSET");
const userscriptWithoutImages = userscript.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, "data:image/png;base64,ASSET");
const runtimeWithoutCatalogHashes = runtimeWithoutImages.replace(/[a-f0-9]{64}/gi, "SHA256");
const userscriptWithoutCatalogHashes = userscriptWithoutImages.replace(/[a-f0-9]{64}/gi, "SHA256");
for (const needle of ["fbd", "abdd", "error_abdd", "fbd--compiled"]) {
  if (runtimeWithoutCatalogHashes.includes(needle)) throw new Error(`Fragile generated Soft98 identifier leaked into runtime: ${needle}`);
  if (userscriptWithoutCatalogHashes.includes(needle)) throw new Error(`Fragile generated Soft98 identifier leaked into userscript: ${needle}`);
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
if (!/rgbMode:!1/.test(runtime) || !/soft98-pro-neon/.test(runtime) || !/prefers-reduced-motion/.test(runtime) || !/--s98p-neon-hue/.test(runtime)) {
  throw new Error("Optional performant RGB night/neon mode is incomplete");
}
if (!/data-soft98-pro-layout/.test(runtime) || !/data-soft98-pro-column/.test(runtime) || !/compactLayout:!0/.test(runtime)) {
  throw new Error("Responsive semantic layout enhancement is missing");
}
if (!/role=tab/.test(runtime) || !/data-toggle=tab/.test(runtime) || !/aria-selected/.test(runtime)) {
  throw new Error("Semantic and conventional fallback dark-theme tab styling is missing");
}
if (/PIRATE_LOGO|data:image\/svg\+xml|fa-desktop-alt:before|font-family:\\?Arial/.test(runtimeWithoutImages)) {
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
if (!/scrollDetectorsBlocked/.test(runtime) || !/addEventListener/.test(runtime) || !runtime.includes(messages.locales.en.runtime.logs.scrollDetectorBlocked)) {
  throw new Error("Scroll-triggered anti-adblock detector firewall is missing");
}
if (!/asiatech/.test(runtime) || !/آسیا/.test(runtime) || !/aside, section, div/.test(runtime)) {
  throw new Error("Named ad frame removal, including Asiatech, is missing");
}
if (!runtime.includes(messages.locales.en.runtime.logs.adCardRemoved) || !/previousElementSibling/.test(runtime) || !/querySelectorAll\("h1,h2,h3,h4,h5,h6"\)/.test(runtime)) {
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
if (!/taunt:!1/.test(runtime) || !/data-theme=dark/.test(runtime) || !/--taunt-bg:#f7fafc/.test(runtime)) {
  throw new Error("The optional taunt must default off and support light and dark themes");
}
if (!/data-soft98-pro-brand-replaced/.test(runtime) || !runtime.includes(messages.locales.en.runtime.logs.hostileBrandReplaced)) {
  throw new Error("Hostile attribution replacement and localized diagnostics are missing");
}
const screenshotTool = fs.readFileSync(path.join(ROOT, "tools", "screenshot.js"), "utf8");
if (!screenshotTool.includes("/live?proof=0")) throw new Error("Screenshot generator must capture the clean live page");
const harness = fs.readFileSync(path.join(ROOT, "test", "serve-harness.js"), "utf8");
if (!harness.includes('requestUrl.pathname === "/proxy"') || !harness.includes("rewriteCssAssets")) {
  throw new Error("Live screenshot harness must proxy Soft98 CSS/font assets");
}
if (!userscript.includes("DRSDavidSoft/soft98-pro/releases/latest/download/soft98-pro.user.js")) {
  throw new Error("Userscript updates must use the latest GitHub Release asset");
}

if (messages.schemaVersion !== 1 || !messages.locales.en || !messages.locales.fa) throw new Error("Bilingual message catalog is incomplete");
for (const phrase of [messages.locales.en.runtime.successLog, messages.locales.fa.runtime.successLog]) {
  if (!runtime.includes(phrase) || !userscript.includes(phrase)) throw new Error(`Message catalog value was not inlined: ${phrase}`);
}
for (const placeholder of ["__SOFT98_VERSION__", "__SOFT98_MESSAGES__", "__SOFT98_BRAND_ASSETS__", "__SOFT98_COMPATIBILITY__", "__SOFT98_RECOMMEND_EXTENSION__"]) {
  if (runtime.includes(placeholder) || userscript.includes(placeholder)) throw new Error(`Unresolved build placeholder: ${placeholder}`);
}
if ((runtime.match(/data:image\/png;base64,/g) || []).length < 2) throw new Error("Both logo variants must be inlined into the runtime");
if (!/pirateLogo:!0/.test(runtime) || !/pirateDark/.test(runtimeWithoutImages)) throw new Error("Pirate logo branding must be enabled and bundled");

const release = JSON.parse(fs.readFileSync(path.join(DIST, "release", "latest.json"), "utf8"));
if (release.version !== VERSION || !release.userscript.sha256 || !release.chromium.sha256 || !release.firefox.sha256) {
  throw new Error("Release metadata must include versioned assets and checksums");
}
const background = fs.readFileSync(path.join(DIST, "chromium", "assets", "background.js"), "utf8");
const releaseClient = fs.readFileSync(path.join(DIST, "chromium", "assets", "release-client.js"), "utf8");
if (!background.includes("soft98-release-check") || !background.includes('origin:"USER"') || !releaseClient.includes("latest/download/latest.json") || !releaseClient.includes("api.github.com/repos/DRSDavidSoft/soft98-pro/releases/latest")) {
  throw new Error("Extension release watcher is missing");
}
if (!background.includes("soft98CompatibilityStatus") || !background.includes("crypto.subtle") || !background.includes("soft98:inspect-script")) {
  throw new Error("Background service-worker compatibility monitor is missing");
}
if (!background.includes("soft98:get-upstream-script") || !background.includes("soft98UpstreamSourceCache") || !background.includes("updateEnabledRulesets")) {
  throw new Error("Background service-worker application gateway is missing");
}
if (!chromium.permissions.includes("declarativeNetRequestWithHostAccess") || !chromium.declarative_net_request) {
  throw new Error("Chromium build must intercept parser-inserted Soft98 application scripts");
}
const gatewayRules = JSON.parse(fs.readFileSync(path.join(DIST, "chromium", "rules.json"), "utf8"));
if (gatewayRules.length !== 1 || gatewayRules[0].action.redirect.extensionPath !== "/assets/upstream-gateway.js" || !/jquery/.test(gatewayRules[0].condition.regexFilter)) {
  throw new Error("Chromium application gateway rules are incomplete");
}
if (!fs.existsSync(path.join(DIST, "chromium", "assets", "upstream-gateway.js")) || !fs.existsSync(path.join(DIST, "firefox", "assets", "upstream-gateway.js"))) {
  throw new Error("Application gateway is not packaged for both browsers");
}
if (/radial-gradient|conic-gradient|createElement\(["']div["']\)[\s\S]{0,180}soft98-pro-ambient/.test(themeSource) || !/soft98-pro-neon/.test(themeSource)) {
  throw new Error("RGB mode must animate existing neon accents without an ambient radial layer");
}
if (!/adoptedStyleSheets/.test(runtimeSource) || !/data-soft98-pro-layout=utility-list/.test(runtimeSource)) {
  throw new Error("Self-healing theme styles and utility-list repair are missing");
}
if (!chromium.host_permissions.some((permission) => permission.startsWith("https://api.github.com/"))) {
  throw new Error("Extension must permit the GitHub Releases API fallback");
}
if (compatibility.schemaVersion !== 1 || compatibility.entries.length < 65 || compatibility.entries.some((entry) => entry.status !== "compatible")) {
  throw new Error("Historical Soft98 compatibility catalog is incomplete or unreviewed");
}

console.log("Soft98 build validation passed");
