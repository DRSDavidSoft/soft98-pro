#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const report = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "compatibility-report.json"), "utf8"));
const repository = process.env.GITHUB_REPOSITORY || "DRSDavidSoft/soft98-pro";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const apiBase = process.env.GITHUB_API_URL || "https://api.github.com";
const shortHash = report.sha256.slice(0, 12);
const title = `compat: review Soft98 script ${shortHash}`;
const body = [
  "## Upstream script",
  "",
  "Soft98 Pro detected a packed application script that is not in the reviewed compatibility catalog.",
  "",
  "| Property | Value |",
  "|---|---|",
  `| URL | ${report.url} |`,
  `| SHA-256 | \`${report.sha256}\` |`,
  `| Size | ${report.bytes.toLocaleString("en-US")} bytes |`,
  `| Observed | \`${report.observedAt}\` |`,
  "",
  "## Compatibility review",
  "",
  "- [ ] Capture and unpack the new script.",
  "- [ ] Compare anti-adblock and download-link behavior with the latest compatible revision.",
  "- [ ] Run the shared patch engine and browser acceptance suite.",
  "- [ ] Add the reviewed hash to the compatibility catalog.",
  "- [ ] Confirm extension and userscript behavior on the live Soft98 page.",
  "",
  `Automated detection run: ${process.env.GITHUB_SERVER_URL || "https://github.com"}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID || ""}`,
].join("\n");

async function request(method, route, payload) {
  const response = await fetch(`${apiBase}/repos/${repository}${route}`, {
    method,
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
  if (!/^(?:unknown|observed)$/.test(report.status)) {
    console.log(`No compatibility issue required for status ${report.status}`);
    return;
  }
  if (!token) {
    console.log(`${title}\n\n${body}`);
    return;
  }
  const issues = await request("GET", "/issues?state=open&labels=upstream-change&per_page=100");
  const existing = issues.find((issue) => !issue.pull_request && (issue.title.includes(shortHash) || issue.body.includes(report.sha256)));
  if (existing) {
    await request("POST", `/issues/${existing.number}/comments`, { body: `Detected again at \`${report.observedAt}\` by [the upstream monitor](${process.env.GITHUB_SERVER_URL || "https://github.com"}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID || ""}).` });
    console.log(`Updated existing compatibility issue #${existing.number}`);
    return;
  }
  const created = await request("POST", "/issues", { title, body, labels: ["compatibility", "upstream-change"] });
  console.log(`Created compatibility issue #${created.number}: ${created.html_url}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
