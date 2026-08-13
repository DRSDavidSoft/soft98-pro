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
if (release.bullets.length < 3) throw new Error("Current release needs a useful set of user-facing changes");
if (!notes.includes(`Soft98 Pro ${version}`) || !notes.includes("## Downloads")) throw new Error("Generated release notes are incomplete");

let rejected = false;
try {
  validate(markdown.replace("# Changelog", "# Changelog\n\nمتن داخلی"), version);
} catch (_error) {
  rejected = true;
}
if (!rejected) throw new Error("English-only changelog policy was not enforced");

console.log("Changelog and release-note tests passed");
