#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const engine = require("../src/patch-engine.js");
const { evaluatePacker } = require("../tools/build-patched-upstream.js");

const ROOT = path.resolve(__dirname, "..");
const payload = `function checkadBlocker(){throw advertisementrk();}var preservedContent='${"download-link-".repeat(14)}';`;
const expression = `function(){return ${JSON.stringify(payload)}}()`;
const packed = `eval(function(p,a,c,k,e,r){return p}(${JSON.stringify(payload)},1,0,'',0,{}))`;
const decoded = engine.unpack(packed, evaluatePacker);
if (decoded.error || !decoded.packed || !decoded.code.includes("checkadBlocker")) throw new Error("Server-side Packer evaluator failed");
const result = engine.patch(packed, { evaluate: evaluatePacker });
if (!result.recognized || result.failures.some((failure) => /^(?:unpack|final-validation)$/.test(failure.stage))) throw new Error("Server-side patch pipeline failed closed");
if (engine.syntaxErrorFor(result.code)) throw new Error("Server-side patched fixture is invalid JavaScript");
new vm.Script(result.code);

const source = fs.readFileSync(path.join(ROOT, "tools", "build-patched-upstream.js"), "utf8");
if (!source.includes("Soft98 Pro server-side edition") || !source.includes("sourceSha256")) throw new Error("Server-side artifact metadata is incomplete");
console.log("Soft98 server-side patch build passed");
