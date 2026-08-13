(function soft98ExtensionBridge() {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const STORAGE_KEY = "soft98AdBlockerSettings";
  const PAGE_STORAGE_KEY = "soft98-ad-blocker.settings";
  const DEFAULT_SETTINGS = {
    blockAds: true,
    patchScripts: true,
    pro: true,
    darkDesign: true,
    compactLayout: true,
    linkBadges: true,
    pirateLogo: true,
    taunt: false,
    diagnostics: true,
    recommendExtension: false,
    rgbMode: false,
  };
  const SCRIPT_PATH = /^\/templates\/.*\/(?:application\.min\.packed|jquery(?:-v[^/]+)?(?:\.min\.packed)?)\.js$/i;
  const reportedScripts = new Set();
  const pendingPayloads = new Set();
  const deliveredPayloads = new Set();
  const PAYLOAD_ID = "soft98-pro-upstream-payload";

  function inject(code) {
    const script = document.createElement("script");
    script.textContent = code;
    (document.documentElement || document.head).appendChild(script);
    script.remove();
  }

  function applySettings(settings) {
    const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    sendRuntime({ type: "soft98:set-interception", enabled: merged.patchScripts });
    inject(`
      try {
        localStorage.setItem(${JSON.stringify(PAGE_STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(merged))});
        if (window.Soft98AdBlocker && window.Soft98AdBlocker.configure) {
          window.Soft98AdBlocker.configure(${JSON.stringify(merged)});
          window.Soft98AdBlocker.scan();
        }
      } catch (_) {}
    `);
  }

  function sendRuntime(message, callback) {
    try {
      if (typeof browser !== "undefined") {
        const result = api.runtime.sendMessage(message);
        if (result && typeof result.then === "function") result.then((response) => callback && callback(response)).catch(() => {});
      } else {
        api.runtime.sendMessage(message, (response) => {
          void api.runtime.lastError;
          if (callback) callback(response);
        });
      }
    } catch (_error) {}
  }

  function reportScript(script) {
    if (!script || script.nodeType !== Node.ELEMENT_NODE || script.tagName !== "SCRIPT") return;
    try {
      const url = new URL(script.src || script.getAttribute("src") || "", location.href);
      if (!/(?:^|\.)soft98\.ir$/i.test(url.hostname) || !SCRIPT_PATH.test(url.pathname) || reportedScripts.has(url.href)) return;
      reportedScripts.add(url.href);
      requestUpstreamUrl(url.href);
    } catch (_error) {}
  }

  function deliverUpstreamPayload(response, requestedUrl) {
    if (deliveredPayloads.has(requestedUrl)) return;
    deliveredPayloads.add(requestedUrl);
    const payload = document.createElement("script");
    payload.id = PAYLOAD_ID;
    payload.type = "application/json";
    payload.setAttribute("data-origin", encodeURIComponent(requestedUrl));
    if (!response || !response.ok || typeof response.source !== "string") {
      payload.setAttribute("data-error", (response && response.error) || "worker-unavailable");
    } else {
      payload.textContent = response.source;
      if (response.report) payload.setAttribute("data-report", encodeURIComponent(JSON.stringify(response.report)));
    }
    (document.documentElement || document.head).appendChild(payload);
    inject('try { window.dispatchEvent(new CustomEvent("soft98-pro:upstream-payload")); } catch (_) {}');
  }

  function requestUpstreamUrl(url) {
    if (pendingPayloads.has(url) || deliveredPayloads.has(url)) return;
    pendingPayloads.add(url);
    sendRuntime({ type: "soft98:get-upstream-script", url }, (response) => {
      pendingPayloads.delete(url);
      deliverUpstreamPayload(response, url);
    });
  }

  function requestPatchedUpstream() {
    const raw = document.documentElement.getAttribute("data-soft98-pro-upstream-request") || "";
    let url = "";
    try {
      url = decodeURIComponent(raw);
      const parsed = new URL(url, location.href);
      if (!/(?:^|\.)soft98\.ir$/i.test(parsed.hostname) || !SCRIPT_PATH.test(parsed.pathname)) return;
      url = parsed.href;
    } catch (_error) {
      return;
    }
    requestUpstreamUrl(url);
  }

  function discoverScripts(root) {
    if (root && root.matches && root.matches("script[src]")) reportScript(root);
    if (root && root.querySelectorAll) root.querySelectorAll("script[src]").forEach(reportScript);
  }

  function installScriptDiscovery() {
    discoverScripts(document);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) for (const node of mutation.addedNodes) discoverScripts(node);
    });
    observer.observe(document, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => discoverScripts(document), { once: true });
  }

  function readSettings(callback) {
    api.storage.local.get({ [STORAGE_KEY]: DEFAULT_SETTINGS }, (result) => {
      callback({ ...DEFAULT_SETTINGS, ...(result && result[STORAGE_KEY]) });
    });
  }

  readSettings(applySettings);
  installScriptDiscovery();
  document.addEventListener("soft98-pro:request-upstream-script", requestPatchedUpstream);

  document.addEventListener("soft98-pro:settings-changed", () => {
    try {
      const raw = document.documentElement.getAttribute("data-soft98-pro-settings") || "";
      const next = { ...DEFAULT_SETTINGS, ...JSON.parse(decodeURIComponent(raw)) };
      api.storage.local.set({ [STORAGE_KEY]: next });
      sendRuntime({ type: "soft98:set-interception", enabled: next.patchScripts });
    } catch (_error) {}
  });

  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== "object") return false;
    if (message.type === "soft98:get-settings") {
      readSettings((settings) => sendResponse({ ok: true, settings }));
      return true;
    }
    if (message.type === "soft98:set-settings") {
      const settings = { ...DEFAULT_SETTINGS, ...(message.settings || {}) };
      api.storage.local.set({ [STORAGE_KEY]: settings }, () => {
        applySettings(settings);
        sendResponse({ ok: true, settings });
      });
      return true;
    }
    if (message.type === "soft98:scan") {
      inject("try { if (window.Soft98AdBlocker) window.Soft98AdBlocker.scan(); } catch (_) {}");
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === "soft98:compatibility") {
      const report = message.report && typeof message.report === "object" ? message.report : null;
      if (report) {
        inject(`
          try {
            document.documentElement.setAttribute("data-soft98-pro-compatibility", encodeURIComponent(${JSON.stringify(JSON.stringify(report))}));
            window.dispatchEvent(new CustomEvent("soft98-pro:compatibility"));
          } catch (_) {}
        `);
      }
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });
})();
