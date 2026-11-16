// ==UserScript==
// @name         Soft98 reload check (page only)
// @namespace    DRS David Soft <David@Refoua.me>
// @author       David Refoua
// @version      2026.11.16.1
// @description  Temporary reload diagnostics for Soft98 Pro issue 16
// @run-at       document-start
// @match        https://soft98.ir/*
// @match        https://www.soft98.ir/*
// @license      MIT
// @grant        none
// @updateURL    none
// @noframes
// ==/UserScript==

(function soft98ReloadProbe(mode, base) {
  "use strict";

  const changes = [];
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
      const stats = mode === "active" ? window.Soft98Pro?.stats : null;
      const settings = mode === "active" ? window.Soft98Pro?.settings : null;
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
          scrollDetectorsBlocked: stats.scrollDetectorsBlocked,
        } : null,
        contentRemovals: [...changes],
        failures: [...failures],
      };
    },
  });

  window.setTimeout(() => observer.disconnect(), 12000);
})("passive", "c24535ca30997b3ba06f98a53e1e56c1653e39f0");
