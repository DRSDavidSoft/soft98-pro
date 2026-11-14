#!/usr/bin/env node
"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RELEASE = path.join(ROOT, "dist", "release", "latest.json");

function hashes() {
  const metadata = JSON.parse(fs.readFileSync(RELEASE, "utf8"));
  return Object.fromEntries(Object.entries(metadata.assets).map(([name, asset]) => [name, asset.sha256]));
}

const before = hashes();
const result = childProcess.spawnSync(process.execPath, [path.join(ROOT, "tools", "build.js")], {
  cwd: ROOT,
  encoding: "utf8",
  windowsHide: true,
});
if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Second build failed");
const after = hashes();
if (JSON.stringify(before) !== JSON.stringify(after)) {
  throw new Error(`Build artifacts are not deterministic:\nfirst=${JSON.stringify(before)}\nsecond=${JSON.stringify(after)}`);
}
console.log("Soft98 deterministic package build passed");
