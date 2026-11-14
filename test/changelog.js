#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { releaseNotes, validate } = require("../tools/changelog.js");

const root = path.resolve(__dirname, "..");
const version = require(path.join(root, "package.json")).version;
const markdown = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const release = validate(markdown, version);
const notes = releaseNotes(markdown, version);
if (!release.bullets.every((bullet) => /^-\s+\S/.test(bullet))) throw new Error("Release changelog entries cannot be empty");
if (!notes.includes(`Soft98 Pro ${version}`) || !notes.includes("## Downloads")) throw new Error("Generated release notes are incomplete");
for (const file of [`soft98-pro-chromium-${version}.zip`, `soft98-pro-firefox-${version}.zip`, "soft98-pro.user.js", "SHA256SUMS.txt"]) {
  if (!notes.includes(`/releases/download/v${version}/${file}`)) throw new Error("Missing direct release link: " + file);
}
if (release.section.includes("docs/changes/") && !notes.includes(`/blob/v${version}/docs/changes/`)) {
  throw new Error("GitHub release notes must link to versioned visual evidence");
}
const visual = path.join(root, "docs", "changes", `v${version}.md`);
if (fs.existsSync(visual)) {
  const gallery = fs.readFileSync(visual, "utf8");
  for (const [, file] of gallery.matchAll(/\.\.\/assets\/comparison\/(v[\w.-]+\.png)\)/g)) {
    if (file.startsWith(`v${version}-`) && !notes.includes(`/v${version}/docs/assets/comparison/${file}`)) {
      throw new Error("Missing versioned release screenshot: " + file);
    }
  }
}

let rejected = false;
try {
  validate(markdown.replace("# Changelog", "# Changelog\n\nمتن داخلی"), version);
} catch (_error) {
  rejected = true;
}
if (!rejected) throw new Error("English-only changelog policy was not enforced");

console.log("Changelog and release-note tests passed");
