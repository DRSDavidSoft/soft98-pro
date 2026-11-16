(function soft98ReloadProbe(mode, base) {
  "use strict";

  const changes = [];
  const removalCalls = [];
  const failures = [];
  const milestones = ["entry"];
  const started = Math.round(performance.now());
  const article = "main article";
  const mainContent = 'main, article, [role="main"]';
  const elapsed = () => Math.round(performance.now());

  function size(value) {
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  function pageShape() {
    const body = document.body;
    const main = document.querySelector('main, [role="main"]');
    const post = document.querySelector(article);
    const surface = post || main || body;
    const style = surface && getComputedStyle(surface);
    return {
      state: document.readyState,
      bodyChildren: body?.children.length ?? null,
      mainChildren: main?.children.length ?? null,
      articles: document.querySelectorAll("article").length,
      headings: document.querySelectorAll("h1").length,
      downloadRows: document.querySelectorAll("article dl[data-json] dd").length,
      surface: post ? "article" : main ? "main" : body ? "body" : "none",
      height: surface ? size(surface.getBoundingClientRect().height) : null,
      display: style?.display ?? null,
      visibility: style?.visibility ?? null,
      opacity: style ? Number(style.opacity) : null,
      runtimeReady: document.documentElement?.hasAttribute("data-soft98-runtime-ready") ?? false,
    };
  }

  function noteFailure(failure) {
    if (failures.length < 16) failures.push({ ms: elapsed(), ...failure });
  }

  function sourceGroup(source) {
    if (!source) return "unknown";
    try {
      const url = new URL(source, location.href);
      if (url.protocol === "chrome-extension:" || url.protocol === "moz-extension:") return "extension";
      if (url.hostname !== location.hostname) return "other-origin";
      const name = url.pathname.split("/").pop();
      return /^(?:js|jquery\.js|jquery\.min\.packed\.js|application\.min\.packed\.js)$/.test(name)
        ? name : "same-host";
    } catch {
      return "unknown";
    }
  }

  function traceRemovals() {
    const nativeStack = Error.captureStackTrace;
    const stop = [];
    const upstreamName = /(?:application\.min\.packed\.js|jquery(?:\.min\.packed)?\.js|\/js)(?=[?:#)\s]|$)/i;

    function caller(wrapper) {
      const trace = {};
      nativeStack?.(trace, wrapper);
      for (const frame of String(trace.stack || "").split("\n").slice(1)) {
        const script = frame.match(upstreamName);
        if (script && (frame.includes(location.origin + "/") || frame.includes("soft98.ir/"))) {
          return "upstream:" + script[0].split("/").pop();
        }
        if (/soft98(?:[-+_% ]|%20)*reload|soft98AdBlocker/i.test(frame)) return "diagnostic-userscript";
        if (/chrome-extension:|moz-extension:/.test(frame)) return "browser-extension";
        if (frame.includes(location.origin + "/")) return "same-origin-script";
      }
      return "unclassified";
    }

    function hook(prototype, property, method, affected) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
      const original = descriptor?.[method];
      if (!descriptor?.configurable || typeof original !== "function") return;
      function recordRemoval(...args) {
        const candidate = affected(this, args);
        const witness = removalCalls.length < 12 && candidate instanceof Element && candidate.isConnected &&
          (candidate.matches(mainContent) ? candidate : candidate.querySelector(mainContent));
        const source = witness ? caller(recordRemoval) : null;
        const result = Reflect.apply(original, this, args);
        if (witness && !witness.isConnected) {
          removalCalls.push({ ms: elapsed(), operation: property, source });
        }
        return result;
      }
      Object.defineProperty(prototype, property, { ...descriptor, [method]: recordRemoval });
      stop.push(() => {
        if (Object.getOwnPropertyDescriptor(prototype, property)?.[method] === recordRemoval) {
          Object.defineProperty(prototype, property, descriptor);
        }
      });
    }

    const receiver = (target) => target;
    const descendant = (target) => target instanceof Element ? target.querySelector(mainContent) : null;
    const argument = (_target, args) => args[0];
    hook(Element.prototype, "innerHTML", "set", descendant);
    hook(Element.prototype, "outerHTML", "set", receiver);
    hook(Node.prototype, "textContent", "set", descendant);
    hook(Element.prototype, "replaceChildren", "value", descendant);
    hook(Element.prototype, "remove", "value", receiver);
    hook(Node.prototype, "removeChild", "value", argument);
    hook(Node.prototype, "replaceChild", "value", (_target, args) => args[1]);
    window.setTimeout(() => stop.forEach(restore => restore()), 12000);
  }

  if (mode === "trace") traceRemovals();

  window.addEventListener("error", (event) => {
    if (event.target instanceof HTMLScriptElement) {
      noteFailure({ kind: "script-load", source: sourceGroup(event.target.src) });
    } else if (event instanceof ErrorEvent) {
      const name = event.error?.name;
      noteFailure({
        kind: /^(?:Error|SyntaxError|TypeError|ReferenceError|RangeError|EvalError|SecurityError)$/.test(name)
          ? name : "script-error",
        source: sourceGroup(event.filename),
        line: size(event.lineno),
      });
    }
  }, true);
  window.addEventListener("unhandledrejection", () => noteFailure({ kind: "unhandled-rejection" }));
  document.addEventListener("securitypolicyviolation", (event) => {
    if (event.effectiveDirective.startsWith("script-src")) noteFailure({ kind: "script-policy" });
  });

  const observer = new MutationObserver((records) => {
    if (changes.length >= 16) return;
    for (const record of records) {
      const target = record.target;
      const removed = Array.from(record.removedNodes).filter((node) =>
        node.nodeType === Node.ELEMENT_NODE && !node.isConnected &&
        (node.matches("html, body, " + mainContent) || node.querySelector(mainContent)));
      const emptied = record.removedNodes.length && !target.firstElementChild &&
        target.matches?.("body, " + mainContent);
      if (!removed.length && !emptied) continue;
      changes.push({
        ms: elapsed(),
        target: (target.tagName || "document").toLowerCase(),
        contentNodesRemoved: removed.length,
        emptied: Boolean(emptied),
      });
      if (changes.length >= 16) break;
    }
  });
  observer.observe(document, { childList: true, subtree: true });
  for (const [target, event] of [[document, "DOMContentLoaded"], [window, "load"]]) {
    target.addEventListener(event, () => milestones.push(event), { once: true });
  }

  Object.defineProperty(window, "Soft98ReloadReport", {
    configurable: true,
    value() {
      const nav = performance.getEntriesByType("navigation")[0];
      const stats = mode !== "passive" ? window.Soft98Pro?.stats : null;
      const settings = mode !== "passive" ? window.Soft98Pro?.settings : null;
      return {
        schema: 1,
        mode,
        base,
        page: location.pathname === "/" ? "home" : "other",
        started,
        elapsed: elapsed(),
        browserMajor: Number(navigator.userAgent.match(/Chrom(?:e|ium)\/(\d+)/)?.[1]) || null,
        navigation: nav ? {
          type: nav.type,
          delivery: nav.deliveryType === "cache" ? "cache" : null,
          transferBytes: size(nav.transferSize),
          encodedBytes: size(nav.encodedBodySize),
          responseStatus: size(nav.responseStatus),
          responseStart: size(nav.responseStart),
        } : null,
        milestones: [...milestones],
        shape: pageShape(),
        runtime: stats && settings ? {
          blockAds: settings.blockAds === true,
          patchScripts: settings.patchScripts === true,
          pro: settings.pro === true,
          patches: stats.patches.length,
          patchFailures: stats.patchFailures.length,
          articlesRestored: stats.articlesRestored,
          listingsRestored: stats.listingsRestored,
          scrollDetectorsBlocked: stats.scrollDetectorsBlocked,
        } : null,
        contentRemovals: [...changes],
        failures: [...failures],
        ...(mode === "trace" && { removalCalls: [...removalCalls] }),
      };
    },
  });

  window.setTimeout(() => observer.disconnect(), 12000);
})
