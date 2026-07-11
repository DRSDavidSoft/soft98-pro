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
    taunt: true,
    diagnostics: true,
    recommendExtension: false,
  };

  function inject(code) {
    const script = document.createElement("script");
    script.textContent = code;
    (document.documentElement || document.head).appendChild(script);
    script.remove();
  }

  function applySettings(settings) {
    const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
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

  function readSettings(callback) {
    api.storage.local.get({ [STORAGE_KEY]: DEFAULT_SETTINGS }, (result) => {
      callback({ ...DEFAULT_SETTINGS, ...(result && result[STORAGE_KEY]) });
    });
  }

  readSettings(applySettings);

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
    return false;
  });
})();
