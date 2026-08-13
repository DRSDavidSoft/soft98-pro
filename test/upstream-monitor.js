#!/usr/bin/env node
"use strict";

const { scriptUrls, supportedScriptUrl } = require("../tools/check-soft98-upstream.js");

const base = "https://soft98.ir/internet/example.html";
const expected = "https://soft98.ir/templates/revision/js/application.min.packed.js?v=7";
const html = `<script src="/telemetry.js"></script><script async src="/templates/revision/js/application.min.packed.js?v=7"></script>`;
const urls = scriptUrls(html, base);
if (urls.length !== 1 || urls[0] !== expected) throw new Error(`Unexpected script discovery: ${JSON.stringify(urls)}`);
if (supportedScriptUrl("https://example.com/templates/x/jquery.js", base)) throw new Error("Foreign host was accepted");
if (supportedScriptUrl("https://soft98.ir/templates/x/analytics.js", base)) throw new Error("Unrelated script was accepted");
if (!supportedScriptUrl("/templates/x/jquery.js", base)) throw new Error("Historic jquery.js alias was rejected");

console.log("Upstream script discovery tests passed");
