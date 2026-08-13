#!/usr/bin/env node
"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");
const PatchEngine = require("../src/patch-engine.js");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "src", "compatibility", "soft98-scripts.json");

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? path.resolve(process.argv[index + 1]) : fallback;
}

function git(history, ...args) {
  return childProcess.execFileSync("git", ["-C", history, ...args], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function commitSources(history) {
  const commits = git(history, "log", "--format=%H", "--", "history/version.json")
    .split(/\r?\n/)
    .filter(Boolean);
  const sources = new Map();
  for (const commit of commits) {
    try {
      const version = JSON.parse(git(history, "show", `${commit}:history/version.json`));
      if (!version.packed_sha256 || sources.has(version.packed_sha256)) continue;
      sources.set(version.packed_sha256, {
        commit,
        source: git(history, "show", `${commit}:history/application.unpacked.js`),
      });
    } catch (_error) {}
  }
  return sources;
}

function unique(values) {
  return [...new Set(values)].sort();
}

function main() {
  const history = argument("--history", path.resolve(ROOT, "..", "outputs", "soft98-js-history"));
  const manifestPath = path.join(history, "captures", "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`Soft98 history manifest not found: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const sourceByHash = commitSources(history);
  const grouped = new Map();
  for (const version of manifest.versions || []) {
    const hash = String(version.packed_sha256 || "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) continue;
    const entry = grouped.get(hash) || {
      sha256: hash,
      status: "observed",
      firstSeenAt: version.timestamp_iso,
      lastSeenAt: version.timestamp_iso,
      packedBytes: version.packed_bytes,
      fileNames: [],
      paths: [],
      captures: 0,
      patches: [],
    };
    entry.firstSeenAt = entry.firstSeenAt < version.timestamp_iso ? entry.firstSeenAt : version.timestamp_iso;
    entry.lastSeenAt = entry.lastSeenAt > version.timestamp_iso ? entry.lastSeenAt : version.timestamp_iso;
    entry.fileNames.push(new URL(version.original).pathname.split("/").pop());
    entry.paths.push(new URL(version.original).pathname);
    entry.captures += 1;
    grouped.set(hash, entry);
  }

  for (const entry of grouped.values()) {
    entry.fileNames = unique(entry.fileNames);
    entry.paths = unique(entry.paths);
    const evidence = sourceByHash.get(entry.sha256);
    if (!evidence) continue;
    const result = PatchEngine.patch(evidence.source);
    const syntaxValid = !PatchEngine.syntaxErrorFor(result.code);
    entry.status = result.recognized && syntaxValid ? "compatible" : "observed";
    entry.patches = unique(result.patches);
    entry.review = {
      sourceCommit: evidence.commit.slice(0, 12),
      syntaxValid,
      recognized: result.recognized,
      skippedPatches: unique(result.failures.map((failure) => failure.stage)),
    };
  }

  const entries = [...grouped.values()].sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
  const catalog = {
    schemaVersion: 1,
    patchEngineVersion: PatchEngine.schemaVersion,
    generatedAt: manifest.generated_at || null,
    source: {
      repository: "soft98-js-history",
      manifest: "captures/manifest.json",
      captures: (manifest.versions || []).length,
    },
    entries,
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  const compatible = entries.filter((entry) => entry.status === "compatible").length;
  console.log(`Imported ${entries.length} Soft98 script hashes; ${compatible} passed patch-engine compatibility checks`);
  if (compatible !== entries.length) process.exitCode = 2;
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
