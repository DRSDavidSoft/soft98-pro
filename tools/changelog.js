#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CHANGELOG = path.join(ROOT, "CHANGELOG.md");
const VERSION = require(path.join(ROOT, "package.json")).version;
const ALLOWED_SECTIONS = new Set(["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"]);

function sectionForVersion(markdown, version) {
  const escaped = String(version).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^## \\[${escaped}\\](?: - \\d{4}-\\d{2}-\\d{2})?\\s*$`, "m").exec(markdown);
  if (!match) return "";
  const start = match.index + match[0].length;
  const next = /^## \[/m.exec(markdown.slice(start));
  return markdown.slice(start, next ? start + next.index : markdown.length).trim();
}

function validate(markdown, version = VERSION) {
  if (!/^# Changelog\s*$/m.test(markdown)) throw new Error("CHANGELOG.md must start with a Changelog heading");
  if (/[\u0600-\u06ff]/u.test(markdown)) throw new Error("CHANGELOG.md must remain English-only");
  const section = sectionForVersion(markdown, version);
  if (!section) throw new Error(`CHANGELOG.md has no release section for ${version}`);
  const headings = [...section.matchAll(/^### (.+)$/gm)].map((match) => match[1]);
  if (!headings.length || headings.some((heading) => !ALLOWED_SECTIONS.has(heading))) {
    throw new Error(`Release ${version} must use Keep a Changelog categories`);
  }
  const bullets = section.match(/^- .+/gm) || [];
  if (!bullets.length) throw new Error(`Release ${version} must list user-facing changes`);
  for (const phrase of ["internal implementation", "work in progress", "temporary workaround", "commit hash"]) {
    if (section.toLowerCase().includes(phrase)) throw new Error(`Release notes contain internal wording: ${phrase}`);
  }
  return { version, section, headings, bullets };
}

function releaseNotes(markdown, version = VERSION) {
  const release = validate(markdown, version);
  return [
    `# Soft98 Pro ${version}`,
    "",
    "Soft98 Pro is available as a Chromium/Edge extension, Firefox extension, and single-file userscript.",
    "",
    release.section,
    "",
    "## Downloads",
    "",
    "Choose the package for your browser or install `soft98-pro.user.js` with a userscript manager. Verify downloaded files with `SHA256SUMS.txt`.",
    "",
  ].join("\n");
}

function writeReleaseNotes(output, version = VERSION) {
  const markdown = fs.readFileSync(CHANGELOG, "utf8");
  const notes = releaseNotes(markdown, version);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, notes, "utf8");
  return notes;
}

function main() {
  const command = process.argv[2] || "check";
  const outputIndex = process.argv.indexOf("--output");
  const versionIndex = process.argv.indexOf("--version");
  const version = versionIndex >= 0 ? process.argv[versionIndex + 1] : VERSION;
  const markdown = fs.readFileSync(CHANGELOG, "utf8");
  if (command === "check") {
    const release = validate(markdown, version);
    console.log(`CHANGELOG.md lists ${release.bullets.length} user-facing changes for ${version}`);
    return;
  }
  if (command === "release-notes") {
    const output = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : path.join(ROOT, "dist", "release", "RELEASE-NOTES.md");
    writeReleaseNotes(output, version);
    console.log(`Wrote ${path.relative(ROOT, output)}`);
    return;
  }
  throw new Error("Usage: node tools/changelog.js check|release-notes [--version x.y.z] [--output file]");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { releaseNotes, sectionForVersion, validate, writeReleaseNotes };
