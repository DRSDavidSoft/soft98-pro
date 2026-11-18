#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "test", "fixtures", "persianblocker-soft98.json");
const REPOSITORY = "MasterKia/PersianBlocker";
const FILES = ["PersianBlocker-Deprecated.txt", "PersianBlockerAds.txt", "PersianBlockerCensor.txt", "PersianBlockerHosts.txt"];

function currentFixture() {
  const temp = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temp, "soft98-persianblocker-"));
  const git = (...args) => execFileSync("git", args, {
    cwd: directory, encoding: "utf8", timeout: 20000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  const repository = `https://github.com/${REPOSITORY}`;
  try {
    git("init", "--bare", "--quiet");
    git("fetch", "--depth=1", "--no-tags", "--quiet", repository + ".git", "refs/heads/main");
    const [commit, committedAt] = git("show", "--no-patch", "--format=%H%n%ct", "FETCH_HEAD").trim().split(/\r?\n/);
    const files = Object.fromEntries(FILES.map(file => [
      file,
      git("show", `${commit}:${file}`).split(/\r?\n/).map(line => line.trim())
        .filter(line => line && !line.startsWith("!") && /soft98(?:\.ir)?/i.test(line)),
    ]));
    return { schemaVersion: 1, source: { repository, commit, committedAt: new Date(Number(committedAt) * 1000).toISOString().replace(".000Z", "Z") }, files };
  } finally {
    if (path.dirname(path.resolve(directory)) === path.resolve(temp)) fs.rmSync(directory, { recursive: true, force: true });
  }
}

function main() {
  const fixture = currentFixture();
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

try { main(); } catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
