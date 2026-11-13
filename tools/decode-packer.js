"use strict";

const { parseExpressionAt } = require("acorn");

function stringLiteral(node) {
  if (node?.type !== "Literal" || typeof node.value !== "string") throw new Error("Expected a literal string");
  return node.value;
}

function packedKey(index, base) {
  if (base <= 36) return index.toString(base);
  let key = "";
  do {
    const digit = index % base;
    key = (digit < 36 ? digit.toString(36) : String.fromCharCode(digit + 29)) + key;
    index = Math.floor(index / base);
  } while (index);
  return key;
}

function decodePacker(expression) {
  const call = parseExpressionAt(expression, 0, { ecmaVersion: "latest" });
  if (call.type !== "CallExpression" || expression.slice(call.end).trim() ||
      call.callee.type !== "FunctionExpression" || call.callee.params.map((p) => p.name).join(",") !== "p,a,c,k,e,r" ||
      call.arguments.length !== 6) throw new Error("Unrecognized Packer wrapper");
  const [payload, base, count, table] = call.arguments;
  const source = stringLiteral(payload);
  if (base.type !== "Literal" || !Number.isInteger(base.value) || base.value < 2 || base.value > 62 ||
      count.type !== "Literal" || !Number.isInteger(count.value) || count.value < 0 || count.value > 100000) {
    throw new Error("Unsupported Packer base or dictionary count");
  }
  if (table.type !== "CallExpression" || table.callee.type !== "MemberExpression" || table.callee.computed ||
      table.callee.property.name !== "split" || table.arguments.length !== 1 || stringLiteral(table.arguments[0]) !== "|") {
    throw new Error("Unrecognized Packer dictionary");
  }
  const words = stringLiteral(table.callee.object).split("|");
  if (words.length < count.value) throw new Error("Incomplete Packer dictionary");
  const dictionary = new Map();
  for (let index = 0; index < count.value; index++) {
    if (words[index]) dictionary.set(packedKey(index, base.value), words[index]);
  }
  let expandedBytes = source.length;
  return source.replace(/\b\w+\b/g, (key) => {
    const word = dictionary.get(key) ?? key;
    expandedBytes += word.length - key.length;
    if (expandedBytes > 8 * 1024 * 1024) throw new Error("Decoded Packer source exceeds size limit");
    return word;
  });
}

module.exports = { decodePacker };
