(function exposeSoft98PatchEngine(root, factory) {
  "use strict";

  const engine = factory();
  if (typeof module === "object" && module.exports) module.exports = engine;
  if (root) {
    try {
      Object.defineProperty(root, "__Soft98PatchEngine", {
        value: engine,
        configurable: true,
        enumerable: false,
        writable: false,
      });
    } catch (_error) {
      root.__Soft98PatchEngine = engine;
    }
  }
})(typeof globalThis === "object" ? globalThis : this, function createSoft98PatchEngine() {
  "use strict";

  const PACKER_MARKER = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*r\s*\)\s*\{/i;
  const CODE_MARKERS = /(?:disableDownloadLink|setNullLinkAttributes|checkadBlocker|advertisementrk|text_add_firewall|kaprila|adguard|location\.reload|location\.hash|document\.title|alert-warning|adblock|\u0627\u0641\u0632\u0648\u0646\u0647\s+\u062d\u0630\u0641|\ufea7\ufe92\ufee0\ufef4\ufed0\ufe8e\ufe95)/i;
  const PATCHES = [
    {
      name: "anti-adblock-warning-throws",
      pattern: /\bthrow\s+[A-Za-z_$][\w$]*\(\s*\)\s*;?/g,
      replacement: "void 0;",
    },
    {
      name: "anti-adblock-reload-hook",
      pattern: /\blocation\.reload\s*=\s*[A-Za-z_$][\w$]*\s*;?/g,
      replacement: "void 0;",
    },
    {
      name: "anti-adblock-title-hash",
      pattern: /\b(?:location|[A-Za-z_$][\w$]*(?:\.get\(["']location["']\))?)\.hash\s*=\s*[^;]*replace\(\s*\/\\s\+\/g\s*,\s*["']_["']\s*\)\s*;?/g,
      replacement: "void 0;",
    },
    {
      name: "legacy-download-null-href",
      pattern: /\.setAttribute\(\s*["']href["']\s*,\s*[^;]*(?:location\.href|["']location\.href["'])[^;]*\)/g,
      replacement: "void 0",
    },
  ];

  function matchingParen(source, openIndex) {
    let depth = 0;
    let quote = "";
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    for (let index = openIndex; index < source.length; index += 1) {
      const character = source[index];
      const next = source[index + 1];
      if (lineComment) {
        if (character === "\n" || character === "\r") lineComment = false;
        continue;
      }
      if (blockComment) {
        if (character === "*" && next === "/") {
          blockComment = false;
          index += 1;
        }
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = "";
        continue;
      }
      if (character === "/" && next === "/") {
        lineComment = true;
        index += 1;
        continue;
      }
      if (character === "/" && next === "*") {
        blockComment = true;
        index += 1;
        continue;
      }
      if (character === "'" || character === '"' || character === "`") {
        quote = character;
        continue;
      }
      if (character === "(") depth += 1;
      else if (character === ")") {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
    throw new Error("Packed expression has no matching closing parenthesis");
  }

  function extractPackerExpression(source) {
    const input = String(source || "").replace(/^\uFEFF/, "");
    const marker = PACKER_MARKER.exec(input);
    if (!marker) return null;
    const open = input.indexOf("(", marker.index + 4);
    if (open < 0) throw new Error("Packed eval call is malformed");
    const close = matchingParen(input, open);
    return input.slice(open + 1, close);
  }

  function defaultEvaluate(expression) {
    return Function(`"use strict";return (${expression});`)();
  }

  function unpack(source, evaluate) {
    const original = String(source || "");
    let expression;
    try {
      expression = extractPackerExpression(original);
    } catch (error) {
      return { code: original, packed: true, error };
    }
    if (!expression) return { code: original, packed: false, error: null };
    try {
      const decoded = (evaluate || defaultEvaluate)(expression);
      if (typeof decoded !== "string" || decoded.length < 128) {
        throw new Error("Packed expression did not return plausible JavaScript");
      }
      return { code: decoded, packed: true, error: null };
    } catch (error) {
      return { code: original, packed: true, error };
    }
  }

  function syntaxErrorFor(source) {
    try {
      Function(String(source || ""));
      return null;
    } catch (error) {
      return error;
    }
  }

  function patch(source, options) {
    const original = String(source || "");
    const unpacked = unpack(original, options && options.evaluate);
    let code = unpacked.code;
    const failures = [];
    const applied = [];
    if (unpacked.error) failures.push({ stage: "unpack", message: unpacked.error.message || String(unpacked.error) });
    const recognized = CODE_MARKERS.test(code);
    if (!recognized) {
      return { code: original, original, packed: unpacked.packed, recognized: false, changed: false, patches: applied, failures };
    }
    for (const candidate of PATCHES) {
      candidate.pattern.lastIndex = 0;
      const next = code.replace(candidate.pattern, candidate.replacement);
      if (next === code) continue;
      const error = syntaxErrorFor(next);
      if (error) {
        failures.push({ stage: candidate.name, message: error.message || String(error) });
        continue;
      }
      code = next;
      applied.push(candidate.name);
    }
    const finalError = syntaxErrorFor(code);
    if (finalError) {
      failures.push({ stage: "final-validation", message: finalError.message || String(finalError) });
      return { code: original, original, packed: unpacked.packed, recognized, changed: false, patches: applied, failures };
    }
    return {
      code,
      original,
      packed: unpacked.packed,
      recognized,
      changed: code !== original,
      patches: applied,
      failures,
    };
  }

  return Object.freeze({
    schemaVersion: 1,
    codeMarkers: CODE_MARKERS,
    extractPackerExpression,
    unpack,
    patch,
    syntaxErrorFor,
  });
});
