#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const engine = require("../src/patch-engine.js");
const { inspect } = require("./check-soft98-upstream.js");

for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) delete process.env[key];

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "dist", "upstream");
const DEFAULT_PAGE = "https://soft98.ir/";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function evaluatePacker(expression) {
  return new vm.Script(`(${expression})`, { filename: "soft98-packed-expression.js" }).runInNewContext(Object.create(null), {
    timeout: 5000,
    displayErrors: true,
  });
}

async function fetchSource(url) {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: {
      accept: "application/javascript,text/javascript,*/*;q=0.1",
      "user-agent": "Soft98-Pro-Upstream-Builder/1.0 (+https://github.com/DRSDavidSoft/soft98-pro)",
    },
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return { url: response.url || url, buffer: Buffer.from(await response.arrayBuffer()) };
}

async function build() {
  const pageUrl = option("--page", DEFAULT_PAGE);
  const directUrl = option("--script", "");
  const observed = await inspect(pageUrl, directUrl);
  const fetched = await fetchSource(observed.url);
  const source = fetched.buffer.toString("utf8").replace(/^\uFEFF/, "");
  const result = engine.patch(source, { evaluate: evaluatePacker });
  if (!result.recognized) throw new Error("The current upstream script is not recognized as a Soft98 application payload");
  if (result.failures.some((failure) => /^(?:unpack|final-validation)$/.test(failure.stage))) {
    throw new Error(`The current upstream script could not be safely patched: ${JSON.stringify(result.failures)}`);
  }
  const syntaxError = engine.syntaxErrorFor(result.code);
  if (syntaxError) throw syntaxError;
  fs.mkdirSync(OUTPUT, { recursive: true });
  const outputFile = path.join(OUTPUT, "soft98-application.patched.js");
  const banner = `/* Soft98 Pro server-side edition | upstream sha256 ${sha256(fetched.buffer)} | patches ${result.patches.join(",") || "none"} */\n`;
  const output = `${banner}${result.code.trim()}\n`;
  fs.writeFileSync(outputFile, output, "utf8");
  const manifest = {
    schemaVersion: 1,
    sourceUrl: fetched.url,
    sourceSha256: sha256(fetched.buffer),
    outputFile: path.basename(outputFile),
    outputSha256: sha256(Buffer.from(output)),
    sourceBytes: fetched.buffer.length,
    outputBytes: Buffer.byteLength(output),
    packed: result.packed,
    patches: result.patches,
    skippedPatches: result.failures.map((failure) => ({ stage: failure.stage, reason: failure.message })),
  };
  fs.writeFileSync(path.join(OUTPUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(manifest, null, 2));
  return manifest;
}

if (require.main === module) build().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

module.exports = { build, evaluatePacker };
