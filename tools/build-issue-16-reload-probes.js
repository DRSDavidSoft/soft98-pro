#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "diagnostics", "issue-16");
const base = "c24535ca30997b3ba06f98a53e1e56c1653e39f0";
const probe = fs.readFileSync(path.join(root, "test", "issue-16-reload-probe.js"), "utf8").trim();
const built = fs.readFileSync(path.join(root, "soft98-pro.user.js"), "utf8");
const boundary = "// ==/UserScript==";
const offset = built.indexOf(boundary);
if (offset < 0) throw new Error("Run npm run build before generating the probes");
const metadata = built.slice(0, offset);
const production = built.slice(offset + boundary.length).trim();

fs.mkdirSync(output, { recursive: true });
const variants = process.argv.includes("--trace")
  ? [["trace", "removal trace"]]
  : process.argv.includes("--recovery")
  ? [["recovery", "listing recovery"]]
  : [["active", "Soft98 Pro"], ["passive", "page only"]];
for (const [mode, suffix] of variants) {
  const meta = metadata
    .replace(/^\/\/ @name\s+.+$/m, `// @name         Soft98 reload check (${suffix})`)
    .replace(/^\/\/ @description\s+.+$/m, "// @description  Temporary reload diagnostics for Soft98 Pro issue 16")
    .replace(/^\/\/ @version\s+.+$/m, "// @version      2026.11.16.1")
    .replace(/^\/\/ @match\s+.+$/m, "// @match        https://soft98.ir/*\n// @match        https://www.soft98.ir/*")
    .replace(/^\/\/ @(?:updateURL|downloadURL)\s+.+\r?\n/gm, "");
  const payload = `${meta}// @updateURL    none\n// @noframes\n${boundary}\n\n${probe}("${mode}", "${base}");\n`;
  fs.writeFileSync(path.join(output, `soft98-reload-${mode}.user.js`),
    payload + (mode === "passive" ? "" : production + "\n"), "utf8");
}
