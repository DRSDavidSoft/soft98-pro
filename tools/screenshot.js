#!/usr/bin/env node
"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8798);
const DEFAULT_OUTPUT = path.join(ROOT, "docs", "assets", "soft98-pro-dark.png");
const OUTPUT = path.resolve(process.argv[2] || process.env.SOFT98_SCREENSHOT_OUT || DEFAULT_OUTPUT);
const URL = process.env.SOFT98_SCREENSHOT_URL || `http://127.0.0.1:${PORT}/live?proof=0`;

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("Chrome/Chromium not found. Set CHROME_PATH to generate screenshots.");
  return found;
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 20000;
    const check = () => {
      const request = http.get(`http://127.0.0.1:${PORT}/live`, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) resolve();
        else retry();
      });
      request.on("error", retry);
      request.setTimeout(2500, () => {
        request.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error("Timed out waiting for screenshot harness"));
      else setTimeout(check, 500);
    };
    check();
  });
}

async function main() {
  const server = childProcess.spawn(process.execPath, [path.join(ROOT, "test", "serve-harness.js")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk;
  });
  server.stderr.on("data", (chunk) => {
    output += chunk;
  });
  try {
    await waitForServer();
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.rmSync(OUTPUT, { force: true });
    const args = [
      "--headless",
      "--disable-extensions",
      "--disable-component-extensions-with-background-pages",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=9000",
      "--window-size=1440,1100",
      `--screenshot=${OUTPUT}`,
      URL,
    ];
    const result = childProcess.spawnSync(chromePath(), args, { encoding: "utf8", windowsHide: true });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Chrome exited with ${result.status}`);
    const stat = fs.statSync(OUTPUT);
    if (stat.size < 100000) throw new Error(`Screenshot looks too small (${stat.size} bytes): ${OUTPUT}`);
    console.log(`Wrote ${path.relative(ROOT, OUTPUT)} (${stat.size} bytes)`);
  } finally {
    server.kill();
    if (output && process.env.DEBUG_SCREENSHOT) process.stderr.write(output);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
