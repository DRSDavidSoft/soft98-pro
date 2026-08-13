#!/usr/bin/env node
"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");
const { validate } = require("./changelog.js");

const ROOT = path.resolve(__dirname, "..");
const packageJson = require(path.join(ROOT, "package.json"));
const required = [
  ".editorconfig",
  ".gitattributes",
  ".github/ISSUE_TEMPLATE/bug-report.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/feature-request.yml",
  ".github/ISSUE_TEMPLATE/soft98-script-update.yml",
  ".github/actionlint.yaml",
  ".github/dependabot.yml",
  ".github/pull_request_template.md",
  ".github/release.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/compatibility.yml",
  ".github/workflows/release.yml",
  ".github/workflows/repository-health.yml",
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "SECURITY.md",
  "src/compatibility/soft98-scripts.json",
];

function relative(file) {
  return path.join(ROOT, ...file.split("/"));
}

for (const file of required) if (!fs.existsSync(relative(file))) throw new Error(`Required repository file is missing: ${file}`);
validate(fs.readFileSync(relative("CHANGELOG.md"), "utf8"), packageJson.version);

const compatibility = JSON.parse(fs.readFileSync(relative("src/compatibility/soft98-scripts.json"), "utf8"));
if (compatibility.schemaVersion !== 1 || compatibility.entries.length < 65) throw new Error("Compatibility catalog does not cover the archived history");
if (compatibility.entries.some((entry) => entry.status !== "compatible" || !/^[a-f0-9]{64}$/.test(entry.sha256))) {
  throw new Error("Compatibility catalog contains an invalid or unreviewed entry");
}

for (const file of fs.readdirSync(relative(".github/workflows"))) {
  if (!/\.ya?ml$/i.test(file)) continue;
  const source = fs.readFileSync(path.join(relative(".github/workflows"), file), "utf8");
  if (!/^run-name:/m.test(source)) throw new Error(`Workflow has no contextual run-name: ${file}`);
  for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gm)) {
    const target = match[1];
    if (target.startsWith("./")) continue;
    if (!/@[a-f0-9]{40}$/.test(target)) throw new Error(`External action is not pinned to a commit in ${file}: ${target}`);
  }
}

const trackedIssueImages = childProcess.execFileSync("git", ["ls-files", "docs/issues"], { cwd: ROOT, encoding: "utf8" }).trim();
if (trackedIssueImages) throw new Error("Issue evidence must use GitHub user attachments instead of tracked docs/issues files");
const python = childProcess.execFileSync("git", ["ls-files", "*.py"], { cwd: ROOT, encoding: "utf8" }).trim();
if (python) throw new Error(`Node.js is the project automation language; unexpected Python files: ${python}`);

console.log(`Repository policy passed: ${required.length} required files, ${compatibility.entries.length} compatible Soft98 hashes`);
