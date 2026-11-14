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

const interactionSource = `
  var fixtures = { repairs:0, probes:0, resets:0, downloads:0, initialized:0 };
  var rules = {};
  function start() { fixtures.initialized++; }
  function repeat(fn,delay) { fn(); return delay; }
  function select() { return [{parentNode:{removeChild(){}},appendChild(){},remove(){}}]; }
  function rewrite() { var fields = ["clip-path","display"]; fixtures.repairs++;
    var el = {setAttribute(){}}; el.setAttribute("style", fields.join()); }
  var interval = (start(rules),repeat(function(){rewrite(rules)},100));
  function probe(){ select("//style[contains(., 'important')]").forEach(function(node){node.parentNode.removeChild(node)}); fixtures.probes++;
    var host = select()[0], node = select()[0]; (host.appendChild(node),repeat(function(){node.remove()},100)); }
  function reset(){ function report(){document.title || (confirm("disabled") && location.reload());}
    fixtures.resets++; select("#cbdt, #cbdb, #fbd").forEach(function(el){el.innerHTML="";}); }
  function download(){probe();fixtures.downloads++;}
  download(); reset();
  var detectorMessage = "adblock";
`;
const interactions = engine.patch(interactionSource);
const sandbox = {};
vm.runInNewContext(interactions.code, sandbox, { timeout:1000 });
if (JSON.stringify(sandbox.fixtures) !== JSON.stringify({ repairs:0, probes:0, resets:0, downloads:1, initialized:1 }) ||
    interactions.patches.filter(name => name.startsWith("anti-adblock-")).length !== 3) {
  throw new Error("Interaction patch affected working UI or left its disruptive callbacks active");
}
const genericTimer = interactionSource.replace('["clip-path","display"]','["color","display"]');
if (engine.patch(genericTimer).patches.includes("anti-adblock-style-rewrite-timer")) {
  throw new Error("Styling patch matched a generic timer without its expected signature");
}

console.log("Shared patch engine tests passed");
