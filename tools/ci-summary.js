#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const VERSION = require(path.join(ROOT, "package.json")).version;
const RELEASE_FILE = path.join(ROOT, "dist", "release", "latest.json");
const phase = process.argv[2] || "build";

function size(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

const release = JSON.parse(fs.readFileSync(RELEASE_FILE, "utf8"));
const rows = Object.entries(release.assets).map(([name, asset]) =>
  `| \`${name}\` | ${size(asset.bytes)} | \`${asset.sha256.slice(0, 16)}...\` |`
);
const heading = phase === "release" ? "Release package ready" : "Build verified";
const markdown = [
  `<div align="center">`,
  ``,
  `# ☠️ Soft98 Pro ${VERSION}`,
  `### ${heading}`,
  ``,
  `🛡️ Ad cleanup · 🧩 Chromium / Firefox · 📜 Userscript · 🌐 EN / FA`,
  ``,
  `</div>`,
  ``,
  `## ✅ Quality gates`,
  ``,
  `- Source syntax and deterministic package build`,
  `- Static resilience and localization validation`,
  `- Headless browser acceptance in dark, light, and banner-free states`,
  `- PersianBlocker USER-origin warning compatibility`,
  `- Release metadata and SHA-256 checksums`,
  ``,
  `## 📦 Artifacts`,
  ``,
  `| Asset | Size | SHA-256 |`,
  `|:--|--:|:--|`,
  ...rows,
  ``,
  `> 🏴‍☠️ Branding and bilingual messages are bundled into the generated code. Runtime assets do not depend on an external CDN.`,
  ``,
].join("\n");

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) fs.appendFileSync(summaryFile, markdown, "utf8");
else process.stdout.write(markdown);
