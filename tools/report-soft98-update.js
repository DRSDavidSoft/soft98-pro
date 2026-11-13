#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { createHash } = require("node:crypto");
const { supportedScriptUrl, TEMPLATE_SCRIPT } = require("./check-soft98-upstream.js");

const ROOT = path.resolve(__dirname, "..");
const report = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "compatibility-report.json"), "utf8"));
const repository = "DRSDavidSoft/soft98-pro";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const apiBase = "https://api.github.com";
function revision(value) {
  const hash = /^[a-f0-9]{64}$/.exec(value?.sha256 || "")?.[0];
  const requestedUrl = supportedScriptUrl(value?.requestedUrl, undefined, TEMPLATE_SCRIPT);
  const url = supportedScriptUrl(value?.url, undefined, TEMPLATE_SCRIPT);
  if (!hash || !requestedUrl || !url || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > 2 * 1024 * 1024) {
    throw new Error("Invalid compatibility revision");
  }
  const time = Date.parse(value.lastModified || "");
  return { hash, requestedUrl, url, bytes: value.bytes, modified: Number.isFinite(time) ? new Date(time).toISOString() : "Unavailable" };
}

const current = revision(report);
const baseline = revision(report.baseline);
const status = /^(compatible|unknown|observed)$/.exec(report.status || "")?.[1];
if (!status) throw new Error("Invalid compatibility status");
const changed = JSON.stringify(current) !== JSON.stringify(baseline);
const fingerprint = createHash("sha256").update(JSON.stringify(current)).digest("hex").slice(0, 16);
const marker = `<!-- soft98-upstream:${fingerprint} -->`;
const title = `compat: Soft98 script revision ${fingerprint}`;
const safeCell = (value) => value.replace(/[<>&|`]/g, (character) => `&#${character.charCodeAt(0)};`);
const body = [
  marker,
  "## Upstream script",
  "",
  `Compatibility status: **${status}**.`,
  "",
  "| Property | Baseline | Current |",
  "|---|---|---|",
  `| Requested URL | ${safeCell(baseline.requestedUrl)} | ${safeCell(current.requestedUrl)} |`,
  `| Final URL | ${safeCell(baseline.url)} | ${safeCell(current.url)} |`,
  `| SHA-256 | ${baseline.hash} | ${current.hash} |`,
  `| Bytes | ${baseline.bytes} | ${current.bytes} |`,
  `| Last modified | ${baseline.modified} | ${current.modified} |`,
  "",
  "## Compatibility review",
  "",
  "- [ ] Capture and unpack the new script.",
  "- [ ] Compare anti-adblock and download-link behavior with the latest compatible revision.",
  "- [ ] Run the shared patch engine and browser acceptance suite.",
  "- [ ] Add the reviewed hash to the compatibility catalog.",
  "- [ ] Confirm extension and userscript behavior on the live Soft98 page.",
  "",
  /^\d+$/.test(process.env.GITHUB_RUN_ID || "") ? `[Detection run](https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID})` : "",
].join("\n");

async function request(method, route, payload) {
  const response = await fetch(`${apiBase}/repos/${repository}${route}`, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "Soft98-Pro-Upstream-Monitor",
      "x-github-api-version": "2022-11-28",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!response.ok) throw new Error(`GitHub API ${method} ${route} returned ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function main() {
  if (!changed && status === "compatible") {
    console.log("Upstream revision matches the reviewed baseline");
    return;
  }
  if (!token) {
    console.log(`${title}\n\n${body}`);
    return;
  }
  for (let page = 1; ; page++) {
    const issues = await request("GET", `/issues?state=all&creator=github-actions%5Bbot%5D&per_page=100&page=${page}`);
    const existing = issues.find((issue) => !issue.pull_request && issue.body?.includes(marker));
    if (existing) {
      console.log(`Revision already reported in issue #${existing.number}`);
      return;
    }
    if (issues.length < 100) break;
  }
  const created = await request("POST", "/issues", { title, body, labels: ["compatibility", "upstream-change"] });
  console.log(`Created compatibility issue #${created.number}: ${created.html_url}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
