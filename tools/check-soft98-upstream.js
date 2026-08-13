#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) delete process.env[key];

const ROOT = path.resolve(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "src", "compatibility", "soft98-scripts.json");
const REPORT_PATH = path.join(ROOT, "dist", "compatibility-report.json");
const DEFAULT_PAGE = "https://soft98.ir/";
const SCRIPT_PATH = /^\/templates\/.*\/(?:application\.min\.packed|jquery(?:-v[^/]+)?(?:\.min\.packed)?)\.js$/i;
const PACKER = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*r\s*\)/i;

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function supportedScriptUrl(value, base) {
  try {
    const url = new URL(value, base);
    if (!/(?:^|\.)soft98\.ir$/i.test(url.hostname) || !SCRIPT_PATH.test(url.pathname)) return null;
    return url.href;
  } catch (_error) {
    return null;
  }
}

function scriptUrls(html, pageUrl) {
  const urls = [];
  const tags = String(html || "").match(/<script\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const match = tag.match(/\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const url = match && supportedScriptUrl(match[1] || match[2] || match[3], pageUrl);
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

async function fetchBuffer(url, accept) {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: {
      accept,
      "user-agent": "Soft98-Pro-Compatibility-Monitor/1.0 (+https://github.com/DRSDavidSoft/soft98-pro)",
    },
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return { response, buffer: Buffer.from(await response.arrayBuffer()) };
}

async function inspect(pageUrl, directScriptUrl) {
  let candidates = [];
  if (directScriptUrl) {
    const url = supportedScriptUrl(directScriptUrl, pageUrl);
    if (!url) throw new Error(`Unsupported Soft98 script URL: ${directScriptUrl}`);
    candidates = [url];
  } else {
    const page = await fetchBuffer(pageUrl, "text/html,application/xhtml+xml");
    candidates = scriptUrls(page.buffer.toString("utf8"), page.response.url);
  }
  if (!candidates.length) throw new Error(`No supported packed Soft98 script was found at ${pageUrl}`);
  for (const url of candidates) {
    const source = await fetchBuffer(url, "application/javascript,text/javascript,*/*;q=0.1");
    const text = source.buffer.toString("utf8");
    if (!PACKER.test(text)) continue;
    return {
      url: source.response.url,
      requestedUrl: url,
      sha256: crypto.createHash("sha256").update(source.buffer).digest("hex"),
      bytes: source.buffer.length,
      lastModified: source.response.headers.get("last-modified"),
      observedAt: new Date().toISOString(),
    };
  }
  throw new Error("Soft98 script candidates did not contain a supported packed payload");
}

function appendSummary(report) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const icon = report.status === "compatible" ? "✅" : report.status === "observed" ? "⚠️" : "🆕";
  const markdown = [
    "## 🧬 Soft98 upstream compatibility",
    "",
    `> ${icon} **${report.statusLabel}**`,
    "",
    "| Property | Value |",
    "|---|---|",
    `| Script | [\`${new URL(report.url).pathname.split("/").pop()}\`](${report.url}) |`,
    `| SHA-256 | \`${report.sha256}\` |`,
    `| Size | ${report.bytes.toLocaleString("en-US")} bytes |`,
    `| Catalog | ${report.catalogEntries.toLocaleString("en-US")} reviewed hashes |`,
    `| Observed | \`${report.observedAt}\` |`,
    "",
  ].join("\n");
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, "utf8");
}

function writeOutputs(report) {
  if (!process.env.GITHUB_OUTPUT) return;
  const fields = {
    status: report.status,
    sha256: report.sha256,
    short_sha: report.sha256.slice(0, 12),
    script_url: report.url,
    bytes: report.bytes,
    observed_at: report.observedAt,
  };
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${Object.entries(fields).map(([key, value]) => `${key}=${value}`).join("\n")}\n`, "utf8");
}

async function main() {
  const pageUrl = option("--page", DEFAULT_PAGE);
  const scriptUrl = option("--script", "");
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const observed = await inspect(pageUrl, scriptUrl);
  const match = catalog.entries.find((entry) => entry.sha256 === observed.sha256) || null;
  const status = match ? match.status : "unknown";
  const report = {
    schemaVersion: 1,
    ...observed,
    status,
    statusLabel: status === "compatible" ? "Current script is reviewed and compatible" : status === "observed" ? "Current script is known but awaits compatibility review" : "Current script hash is not in the compatibility catalog",
    catalogEntries: catalog.entries.length,
    match,
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  appendSummary(report);
  writeOutputs(report);
  console.log(JSON.stringify(report, null, process.argv.includes("--json") ? 2 : 0));
  if (process.argv.includes("--check") && status !== "compatible") process.exitCode = 2;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { inspect, scriptUrls, supportedScriptUrl };
