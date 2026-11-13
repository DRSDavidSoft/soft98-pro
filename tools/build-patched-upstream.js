#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const engine = require("../src/patch-engine.js");
const { inspect, readSoft98Response, supportedScriptUrl, TEMPLATE_SCRIPT } = require("./check-soft98-upstream.js");
const { decodePacker } = require("./decode-packer.js");
const catalog = require("../src/compatibility/soft98-scripts.json");

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

async function build() {
  const pageUrl = option("--page", DEFAULT_PAGE);
  const directUrl = option("--script", "");
  const observed = await inspect(pageUrl, directUrl);
  const reviewed = catalog.entries.find((entry) => entry.status === "compatible" && entry.sha256 === observed.sha256);
  if (!reviewed) throw new Error("Upstream artifact generation requires a reviewed source hash");
  const fetched = await readSoft98Response(observed.url, true);
  const sourceSha256 = sha256(fetched.buffer);
  if (sourceSha256 !== observed.sha256) throw new Error("Upstream changed during the build. Run the monitor again.");
  const sourceUrl = supportedScriptUrl(fetched.response.url, undefined, TEMPLATE_SCRIPT);
  if (!sourceUrl) throw new Error("Invalid upstream script destination");
  const source = fetched.buffer.toString("utf8").replace(/^\uFEFF/, "");
  const result = engine.patch(source, { evaluate: decodePacker });
  if (!result.recognized) throw new Error("The current upstream script is not recognized as a Soft98 application payload");
  if (result.failures.some((failure) => /^(?:unpack|final-validation)$/.test(failure.stage))) {
    throw new Error(`The current upstream script could not be safely patched: ${JSON.stringify(result.failures)}`);
  }
  const syntaxError = engine.syntaxErrorFor(result.code);
  if (syntaxError) throw syntaxError;
  fs.mkdirSync(OUTPUT, { recursive: true });
  const outputFile = path.join(OUTPUT, "soft98-application.patched.js");
  const banner = `/* Soft98 Pro server-side edition | upstream sha256 ${sourceSha256} | patches ${result.patches.join(",") || "none"} */\n`;
  const output = `${banner}${result.code.trim()}\n`;
  fs.writeFileSync(outputFile, output, "utf8");
  const manifest = {
    schemaVersion: 1,
    sourceUrl,
    sourceSha256,
    outputFile: path.basename(outputFile),
    outputSha256: sha256(Buffer.from(output)),
    sourceBytes: fetched.buffer.length,
    outputBytes: Buffer.byteLength(output),
    packed: result.packed,
    patches: result.patches,
    skippedPatches: reviewed.review.skippedPatches,
  };
  fs.writeFileSync(path.join(OUTPUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(manifest, null, 2));
  return manifest;
}

if (require.main === module) build().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

module.exports = { build };
