#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "test", "fixtures", "persianblocker-soft98.json");
const REPOSITORY = "MasterKia/PersianBlocker";
const FILES = ["PersianBlocker-Deprecated.txt", "PersianBlockerAds.txt", "PersianBlockerCensor.txt", "PersianBlockerHosts.txt"];

async function request(url, type = "text") {
  const response = await fetch(url, { headers: { Accept: type === "json" ? "application/vnd.github+json" : "text/plain" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return type === "json" ? response.json() : response.text();
}

async function currentFixture() {
  const commit = await request(`https://api.github.com/repos/${REPOSITORY}/commits/main`, "json");
  const files = {};
  for (const file of FILES) {
    const source = await request(`https://raw.githubusercontent.com/${REPOSITORY}/${commit.sha}/${file}`);
    files[file] = source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("!") && /soft98(?:\.ir)?/i.test(line));
  }
  return {
    schemaVersion: 1,
    source: { repository: `https://github.com/${REPOSITORY}`, commit: commit.sha, committedAt: commit.commit.committer.date },
    files,
  };
}

async function main() {
  const fixture = await currentFixture();
  if (process.argv.includes("--check")) {
    const saved = JSON.parse(fs.readFileSync(OUTPUT, "utf8"));
    if (JSON.stringify(saved.files) !== JSON.stringify(fixture.files)) {
      throw new Error(`PersianBlocker Soft98 rules changed at ${fixture.source.commit}; run npm run sync:persianblocker and review compatibility`);
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n## 🛡️ PersianBlocker compatibility\n\nSoft98-specific rules are unchanged at \`${fixture.source.commit}\`.\n`, "utf8");
    }
    console.log(`PersianBlocker Soft98 rules unchanged at ${fixture.source.commit}`);
    return;
  }
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  console.log(`Updated ${path.relative(ROOT, OUTPUT)} from ${fixture.source.commit}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
