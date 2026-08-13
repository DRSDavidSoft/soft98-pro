#!/usr/bin/env node
"use strict";

const vm = require("vm");
const engine = require("../src/patch-engine.js");

const packed = "eval(function(p,a,c,k,e,r){e=function(c){return c.toString(a)};if(!''.replace(/^/,String)){while(c--)r[e(c)]=k[c]||e(c);k=[function(e){return r[e]}];e=function(){return'\\w+'};c=1};while(c--)if(k[c])p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c]);return p}('0(\"1\")',2,2,'alert|ok'.split('|'),0,{}))";
const expression = engine.extractPackerExpression(`/* metadata */\n${packed};`);
if (!expression || !expression.startsWith("function(p,a,c,k,e,r)")) throw new Error("Dean Edwards expression extraction failed");
const unpacked = engine.unpack(packed);
if (unpacked.code !== packed || !unpacked.packed || !unpacked.error) throw new Error("Implausibly short payload should fail closed");

const source = 'var message="disable adblock";function warning(){return new Error("blocked")}function detector(){throw warning()}detector();';
const result = engine.patch(source, { origin: "unit-test" });
if (engine.syntaxErrorFor(result.code)) throw new Error("Patch engine returned invalid JavaScript");
if (!result.patches.length) throw new Error("Patch engine did not identify the anti-adblock structure");
new vm.Script(result.code);

console.log("Shared patch engine tests passed");
