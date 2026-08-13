#!/usr/bin/env node
"use strict";

const childProcess = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.TEST_PORT || 8799);

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("Chrome/Chromium is required for runtime acceptance tests");
  return found;
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 15000;
    const attempt = () => {
      const request = http.get(`http://127.0.0.1:${PORT}/`, (response) => {
        response.resume();
        response.statusCode < 500 ? resolve() : retry();
      });
      request.on("error", retry);
      request.setTimeout(1000, () => request.destroy());
    };
    const retry = () => Date.now() > deadline ? reject(new Error("Timed out waiting for the runtime harness")) : setTimeout(attempt, 200);
    attempt();
  });
}

function proof(dom, key) {
  const markers = [`data-proof="${key}"`, `data-proof='${key}'`];
  const marker = markers.map((value) => dom.indexOf(value)).find((index) => index >= 0);
  if (marker === undefined) return "";
  const start = dom.indexOf(">", marker);
  const end = dom.indexOf("<", start + 1);
  return start >= 0 && end >= 0 ? dom.slice(start + 1, end).trim() : "";
}

function runCase(name, query, expectedTheme, expectedBackground, expectedLogo) {
  const result = childProcess.spawnSync(chromePath(), [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--virtual-time-budget=2500",
    "--dump-dom",
    `http://127.0.0.1:${PORT}/?${query}`,
  ], { encoding: "utf8", windowsHide: true, maxBuffer: 12 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${name}: Chrome failed: ${result.stderr || result.stdout}`);
  const dom = result.stdout;
  const assertions = {
    warnings: "0",
    "blocker-notices": "0",
    ads: "0",
    patch: "passed",
    "top-level-patch": "passed",
    scroll: "blocked/blocked/0",
    taunt: expectedTheme,
    "taunt-background": expectedBackground,
    logo: expectedLogo,
  };
  for (const [key, expected] of Object.entries(assertions)) {
    const actual = proof(dom, key);
    if (actual !== expected) {
      const marker = dom.indexOf(`data-proof="${key}"`);
      throw new Error(`${name}: expected ${key}=${expected}, received ${actual || "<missing>"}; context=${dom.slice(Math.max(0, marker - 80), marker + 180)}`);
    }
  }
}

async function main() {
  const server = childProcess.spawn(process.execPath, [path.join(ROOT, "test", "serve-harness.js")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  try {
    await waitForServer();
    runCase("default-dark", "taunt=0&dark=1", "none", "none", "pirateDark");
    runCase("taunt-dark", "taunt=1&dark=1", "dark", "rgb(16, 27, 36)", "pirateDark");
    runCase("taunt-light", "taunt=1&dark=0", "light", "rgb(247, 250, 252)", "light");
    console.log("Soft98 runtime browser acceptance passed");
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
