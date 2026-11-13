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
const TEMPLATE_SCRIPT = /^\/templates\/(?:[^/]+\/)*[^/]+\.js$/i;
const PACKER = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*r\s*\)/i;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const BASELINE_PATH = path.join(ROOT, "src", "compatibility", "upstream-baseline.json");

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function supportedScriptUrl(value, base, pathPattern = SCRIPT_PATH) {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" || url.port || url.username || url.password ||
        !/(?:^|\.)soft98\.ir$/i.test(url.hostname) || !pathPattern.test(url.pathname)) return null;
    url.hash = "";
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
    const url = match && supportedScriptUrl(match[1] || match[2] || match[3], pageUrl, TEMPLATE_SCRIPT);
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls.sort((left, right) => Number(Boolean(supportedScriptUrl(right))) - Number(Boolean(supportedScriptUrl(left))));
}

async function readSoft98Response(value, script, depth = 0) {
  const url = new URL(value);
  if (depth > 4 || url.protocol !== "https:" || url.port || url.username || url.password ||
      !/(?:^|\.)soft98\.ir$/i.test(url.hostname) || (script && !supportedScriptUrl(url.href, undefined, TEMPLATE_SCRIPT))) {
    throw new Error("Unsupported Soft98 response destination");
  }
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    headers: {
      accept: script ? "application/javascript,text/javascript" : "text/html,application/xhtml+xml",
      "user-agent": "Soft98-Pro-Compatibility-Monitor/1.0 (+https://github.com/DRSDavidSoft/soft98-pro)",
    },
  });
  if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.has("location")) {
    await response.body?.cancel();
    return readSoft98Response(new URL(response.headers.get("location"), url), script, depth + 1);
  }
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const type = response.headers.get("content-type") || "";
  if (script && !/^(?:(?:text|application)\/(?:x-)?(?:java|ecma)script|application\/octet-stream)(?:;|$)/i.test(type)) {
    throw new Error("Unexpected Soft98 script content type");
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) throw new Error("Soft98 response exceeds size limit");
    chunks.push(chunk);
  }
  return { response, buffer: Buffer.concat(chunks, bytes) };
}

async function inspect(pageUrl, directScriptUrl, { includeSource = false } = {}) {
  let candidates = [];
  if (directScriptUrl) {
    const url = supportedScriptUrl(directScriptUrl, pageUrl, TEMPLATE_SCRIPT);
    if (!url) throw new Error(`Unsupported Soft98 script URL: ${directScriptUrl}`);
    candidates = [url];
  } else {
    const page = await readSoft98Response(pageUrl, false);
    candidates = scriptUrls(page.buffer.toString("utf8"), page.response.url);
  }
  if (!candidates.length) throw new Error(`No supported packed Soft98 script was found at ${pageUrl}`);
  let lastError;
  for (const url of candidates.slice(0, 20)) {
    let source;
    try {
      source = await readSoft98Response(url, true);
    } catch (error) {
      lastError = error;
      continue;
    }
    const text = source.buffer.toString("utf8");
    if (!PACKER.test(text)) continue;
    return {
      url: source.response.url,
      requestedUrl: url,
      sha256: crypto.createHash("sha256").update(source.buffer).digest("hex"),
      bytes: source.buffer.length,
      lastModified: source.response.headers.get("last-modified"),
      observedAt: new Date().toISOString(),
      ...(includeSource ? { source: source.buffer } : {}),
    };
  }
  throw new Error("Soft98 script candidates did not contain a supported packed payload", { cause: lastError });
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
    changed: String(report.changes.length > 0),
  };
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${Object.entries(fields).map(([key, value]) => `${key}=${value}`).join("\n")}\n`, "utf8");
}

async function main() {
  const pageUrl = option("--page", DEFAULT_PAGE);
  const scriptUrl = option("--script", "");
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const { source, ...observed } = await inspect(pageUrl, scriptUrl, { includeSource: process.argv.includes("--capture") });
  const match = catalog.entries.find((entry) => entry.sha256 === observed.sha256) || null;
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const status = match ? match.status : "unknown";
  const report = {
    schemaVersion: 1,
    ...observed,
    changes: ["requestedUrl", "url", "sha256", "bytes", "lastModified"].filter((field) => baseline[field] !== observed[field]),
    baseline,
    status,
    statusLabel: status === "compatible" ? "Current script is reviewed and compatible" : status === "observed" ? "Current script is known but awaits compatibility review" : "Current script hash is not in the compatibility catalog",
    catalogEntries: catalog.entries.length,
    match,
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (source) fs.writeFileSync(path.join(path.dirname(REPORT_PATH), "upstream-source.txt"), source);
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

module.exports = { inspect, readSoft98Response, scriptUrls, supportedScriptUrl, TEMPLATE_SCRIPT };
