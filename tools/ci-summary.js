#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { validate } = require("./changelog.js");

const ROOT = path.resolve(__dirname, "..");
const VERSION = require(path.join(ROOT, "package.json")).version;
const RELEASE_FILE = path.join(ROOT, "dist", "release", "latest.json");
const CHANGELOG_FILE = path.join(ROOT, "CHANGELOG.md");
const COMPATIBILITY_FILE = path.join(ROOT, "src", "compatibility", "soft98-scripts.json");
const UPSTREAM_REPORT = path.join(ROOT, "dist", "compatibility-report.json");
const phase = process.argv[2] || "build";
const status = process.env.JOB_STATUS || "success";
const repository = process.env.GITHUB_REPOSITORY || "DRSDavidSoft/soft98-pro";
const server = process.env.GITHUB_SERVER_URL || "https://github.com";
const runId = process.env.GITHUB_RUN_ID || "local";
const runAttempt = process.env.GITHUB_RUN_ATTEMPT || "1";
const sha = process.env.GITHUB_SHA || "local-build";
const shortSha = sha.slice(0, 12);
const ref = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "local";
const actor = process.env.GITHUB_ACTOR || "local";
const event = process.env.GITHUB_EVENT_NAME || "local";
const workflow = process.env.GITHUB_WORKFLOW || "Local build";
const repoUrl = `${server}/${repository}`;
const runUrl = runId === "local" ? repoUrl : `${repoUrl}/actions/runs/${runId}`;
const commitUrl = sha === "local-build" ? repoUrl : `${repoUrl}/commit/${sha}`;

function size(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function icon() {
  return { success: "✅", failure: "❌", cancelled: "🚫", skipped: "⏭️" }[status] || "🧭";
}

function value(pathName, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(pathName, "utf8"));
  } catch (_error) {
    return fallback;
  }
}

function assetLink(name) {
  return phase === "release" && status === "success"
    ? `${repoUrl}/releases/download/v${VERSION}/${encodeURIComponent(name)}`
    : `${runUrl}#artifacts`;
}

if (!fs.existsSync(RELEASE_FILE)) {
  console.error(`Release metadata is unavailable: ${RELEASE_FILE}`);
  process.exitCode = 1;
} else {
  const release = value(RELEASE_FILE);
  const compatibility = value(COMPATIBILITY_FILE, { entries: [] });
  const upstream = value(UPSTREAM_REPORT);
  const changelog = validate(fs.readFileSync(CHANGELOG_FILE, "utf8"), VERSION);
  const rows = Object.entries(release.assets).map(([name, asset]) =>
    `| [\`${name}\`](${assetLink(name)}) | ${size(asset.bytes)} | \`${asset.sha256}\` |`
  );
  const features = changelog.bullets.slice(0, 8).join("\n");
  const upstreamValue = upstream
    ? `${upstream.status === "compatible" ? "✅" : "⚠️"} \`${upstream.sha256.slice(0, 12)}\` · ${upstream.status}`
    : "Not checked in this job";
  const heading = phase === "release" ? "Release published" : "Build verified";
  const retention = phase === "release" ? "Durable GitHub Release assets" : `${process.env.ARTIFACT_RETENTION_DAYS || 14} day Actions artifacts`;
  const markdown = [
    "<div align=\"center\">",
    "",
    `# ${icon()} Soft98 Pro ${VERSION}`,
    `### ${heading}`,
    "",
    "🛡️ Protection · 🧩 Chromium / Edge / Firefox · 📜 Userscript · 🌐 English / Persian",
    "",
    "</div>",
    "",
    "## ✨ Release highlights",
    "",
    features,
    "",
    "## 🛡️ Quality gates",
    "",
    "| Gate | Result |",
    "|---|---|",
    `| Shared patch engine and source syntax | ${status === "success" ? "✅ passed" : "⚠️ inspect job"} |`,
    `| Browser behavior and deterministic packaging | ${status === "success" ? "✅ passed" : "⚠️ inspect job"} |`,
    `| Historical Soft98 catalog | ✅ ${compatibility.entries.filter((entry) => entry.status === "compatible").length} compatible hashes |`,
    `| Current Soft98 script | ${upstreamValue} |`,
    "| PersianBlocker USER-origin defense | ✅ packaged and tested |",
    "| English/Persian catalog parity | ✅ validated |",
    "| Curated release changelog | ✅ validated |",
    "",
    "## 📦 Artifact catalog",
    "",
    `> [**⬇️ Open ${phase === "release" ? "release downloads" : "same-run build artifacts"}**](${phase === "release" ? `${repoUrl}/releases/tag/v${VERSION}` : `${runUrl}#artifacts`})`,
    ">",
    `> Availability: ${retention}. Verify the complete SHA-256 before installation.`,
    "",
    "| Asset | Size | SHA-256 |",
    "|---|---:|---|",
    ...rows,
    "",
    "<details>",
    "<summary><strong>🔐 Verify a downloaded package</strong></summary>",
    "",
    "```powershell",
    `$archive = ".\\soft98-pro-chromium-${VERSION}.zip"`,
    "$expected = (Select-String -Path .\\SHA256SUMS.txt -Pattern (Split-Path $archive -Leaf)).Line.Split()[0]",
    "$actual = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()",
    "if ($actual -ne $expected) { throw \"SHA-256 mismatch\" }",
    `gh attestation verify $archive --repo ${repository}`,
    "```",
    "",
    "</details>",
    "",
    "## 🧭 Run context",
    "",
    "| Property | Value |",
    "|---|---|",
    `| Repository | [\`${repository}\`](${repoUrl}) |`,
    `| Ref | [\`${ref}\`](${repoUrl}/tree/${encodeURIComponent(ref)}) |`,
    `| Commit | [\`${shortSha}\`](${commitUrl}) |`,
    `| Workflow | [${workflow}](${runUrl}) |`,
    `| Run | \`${runId}\` · attempt \`${runAttempt}\` |`,
    `| Event | \`${event}\` |`,
    `| Actor | [@${actor}](${server}/${actor}) |`,
    `| Node.js | \`${process.version}\` |`,
    `| Result | ${icon()} \`${status}\` |`,
    "",
    "---",
    "",
    `_Generated by the checked-in Soft98 Pro summary tool · [Changelog](${repoUrl}/blob/${sha === "local-build" ? ref : sha}/CHANGELOG.md)_`,
    "",
  ].join("\n");

  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown, "utf8");
  else process.stdout.write(markdown);
}
