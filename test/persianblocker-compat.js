#!/usr/bin/env node
"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "test", "fixtures", "persianblocker-soft98.json"), "utf8"));
const rules = Object.values(fixture.files).flat();
const warning = rules.find((rule) => /##html::after:style\(/i.test(rule));
if (!warning) throw new Error("PersianBlocker fixture does not include its Soft98 html::after warning");

const neutralizer = fs.readFileSync(path.join(ROOT, "src", "user-origin.css"), "utf8");
if (!/html:root::after/.test(neutralizer) || !/content:\s*none\s*!important/.test(neutralizer) || !/display:\s*none\s*!important/.test(neutralizer)) {
  throw new Error("The user-origin pseudo-element neutralizer is incomplete");
}

const chromium = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "chromium", "manifest.json"), "utf8"));
const firefox = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "firefox", "manifest.json"), "utf8"));
const chromiumBackground = fs.readFileSync(path.join(ROOT, "dist", "chromium", "assets", "background.js"), "utf8");
const firefoxBackground = fs.readFileSync(path.join(ROOT, "dist", "firefox", "assets", "background.js"), "utf8");
if (!chromium.permissions.includes("scripting") || !/origin:"USER"/.test(chromiumBackground)) throw new Error("Chromium must inject the compatibility stylesheet at USER origin");
if (!firefox.permissions.includes("tabs") || !/cssOrigin:"user"/.test(firefoxBackground)) throw new Error("Firefox must inject the compatibility stylesheet at user origin");
for (const target of ["chromium", "firefox"]) {
  if (!fs.existsSync(path.join(ROOT, "dist", target, "assets", "user-origin.css"))) throw new Error(`${target} package is missing user-origin.css`);
}

const declarations = warning.match(/##html::after:style\(([\s\S]*)\)$/i);
if (!declarations) throw new Error("Could not parse the current PersianBlocker warning rule");
const html = `<!doctype html><html><head><style>html::after{${declarations[1]}}</style><style>${neutralizer}</style></head><body><main>content remains visible</main><script>document.body.setAttribute("data-pseudo-display",getComputedStyle(document.documentElement,"::after").display);document.body.setAttribute("data-pseudo-content",getComputedStyle(document.documentElement,"::after").content);</script></body></html>`;
const file = path.join(os.tmpdir(), `soft98-persianblocker-${process.pid}.html`);
fs.writeFileSync(file, html, "utf8");
try {
  const candidates = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
  const chrome = candidates.find((candidate) => fs.existsSync(candidate));
  if (!chrome) throw new Error("Chrome/Chromium is required for PersianBlocker compatibility testing");
  const url = `file:///${file.replace(/\\/g, "/")}`;
  const result = childProcess.spawnSync(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", "--dump-dom", url], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || "Chrome failed to render the PersianBlocker fixture");
  if (!/data-pseudo-display="none"/.test(result.stdout) || !/data-pseudo-content="none"/.test(result.stdout) || !/content remains visible/.test(result.stdout)) {
    throw new Error("The current PersianBlocker warning survived the Soft98 Pro neutralizer");
  }
} finally {
  fs.rmSync(file, { force: true });
}

console.log(`PersianBlocker compatibility passed for ${fixture.source.commit}`);
