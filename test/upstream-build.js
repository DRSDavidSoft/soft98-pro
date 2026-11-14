#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const engine = require("../src/patch-engine.js");
const { decodePacker } = require("../tools/decode-packer.js");

const ROOT = path.resolve(__dirname, "..");
const packed = "eval(function(p,a,c,k,e,r){throw new Error('The wrapper must never run')}('0 checkadBlocker(){throw advertisementrk();}var preservedContent=\"This literal text makes the test payload long enough to meet the unpacked source plausibility check.\";',2,1,'function'.split('|'),0,{}))";
const decoded = engine.unpack(packed, decodePacker);
if (decoded.error || !decoded.packed || !decoded.code.includes("checkadBlocker")) throw new Error("Server-side Packer evaluator failed");
const result = engine.patch(packed, { evaluate: decodePacker });
if (!result.recognized || result.failures.some((failure) => /^(?:unpack|final-validation)$/.test(failure.stage))) throw new Error("Server-side patch pipeline failed closed");
if (engine.syntaxErrorFor(result.code)) throw new Error("Server-side patched fixture is invalid JavaScript");

const source = fs.readFileSync(path.join(ROOT, "tools", "build-patched-upstream.js"), "utf8");
if (!source.includes("Soft98 Pro server-side edition") || !source.includes("sourceSha256")) throw new Error("Server-side artifact metadata is incomplete");
console.log("Soft98 server-side patch build passed");
