(function soft98BackgroundService() {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const usesPromises = typeof browser !== "undefined";
  const VERSION = "__SOFT98_VERSION__";
  const CATALOG = __SOFT98_MESSAGES__;
  const COMPATIBILITY = __SOFT98_COMPATIBILITY__;
  const RELEASE_STATUS_KEY = "soft98ReleaseStatus";
  const COMPATIBILITY_STATUS_KEY = "soft98CompatibilityStatus";
  const COMPATIBILITY_CACHE_KEY = "soft98CompatibilityCache";
  const SCRIPT_SOURCE_CACHE = "soft98UpstreamSourceCache";
  const ALARM_NAME = "soft98-release-check";
  const USER_ORIGIN_CSS = "assets/user-origin.css";
  const UPSTREAM_GATEWAY = api.runtime.getURL("assets/upstream-gateway.js");
  const CACHE_TTL = 10 * 60 * 1000;
  const SCRIPT_PATH = /^\/templates\/.*\/(?:application\.min\.packed|jquery(?:-v[^/]+)?(?:\.min\.packed)?)\.js$/i;
  const pendingInspections = new Map();
  const pendingSources = new Map();
  let releaseStatus = null;
  let compatibilityStatus = null;
  let modificationEngineEnabled = true;

  function call(target, method, ...args) {
    try {
      if (usesPromises) return Promise.resolve(target[method](...args));
      return new Promise((resolve, reject) => {
        target[method](...args, (value) => {
          const error = api.runtime && api.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(value);
        });
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function ignore(operation) {
    if (operation && typeof operation.catch === "function") operation.catch(() => {});
  }

  function isProtectedPage(url) {
    try {
      return /(?:^|\.)soft98\.ir$/i.test(new URL(url).hostname);
    } catch (_error) {
      return false;
    }
  }

  function supportedScriptUrl(value) {
    try {
      const url = new URL(value);
      return /(?:^|\.)soft98\.ir$/i.test(url.hostname) && SCRIPT_PATH.test(url.pathname) ? url.href : "";
    } catch (_error) {
      return "";
    }
  }

  function preferredLocale() {
    const languages = [navigator.language || "", ...(navigator.languages || [])].filter(Boolean);
    let timeZone = "";
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (_error) {}
    return languages.some((language) => /^fa(?:-|$)/i.test(language)) || timeZone === "Asia/Tehran" ? "fa" : "en";
  }

  function text(key, version) {
    const locale = preferredLocale();
    const runtime = (CATALOG.locales[locale] || CATALOG.locales.en).runtime;
    return String(runtime[key] || CATALOG.locales.en.runtime[key] || key).replace(/\{version\}/g, version || VERSION);
  }

  function renderBadge() {
    const action = api.action || api.browserAction;
    if (!action) return;
    const unknown = compatibilityStatus && /^(?:unknown|observed)$/.test(compatibilityStatus.status || "");
    const release = releaseStatus && releaseStatus.release;
    const available = release && Soft98Release.newer(release.version, VERSION);
    ignore(call(action, "setBadgeText", { text: unknown ? "!" : available ? "UP" : "" }));
    if (unknown) {
      ignore(call(action, "setBadgeBackgroundColor", { color: "#d97706" }));
      ignore(call(action, "setTitle", { title: text("scriptUnknownBadge") }));
    } else if (available) {
      ignore(call(action, "setBadgeBackgroundColor", { color: "#0b8f6a" }));
      ignore(call(action, "setTitle", { title: text("updateAvailable", release.version) }));
    } else {
      ignore(call(action, "setTitle", { title: text("product") }));
    }
  }

  function installUserOriginProtection(tabId, url) {
    if (!Number.isInteger(tabId) || tabId < 0 || !isProtectedPage(url)) return;
    if (api.scripting && api.scripting.insertCSS) {
      ignore(call(api.scripting, "insertCSS", { target: { tabId }, files: [USER_ORIGIN_CSS], origin: "USER" }));
    } else if (api.tabs && api.tabs.insertCSS) {
      ignore(call(api.tabs, "insertCSS", tabId, { file: `/${USER_ORIGIN_CSS}`, cssOrigin: "user", runAt: "document_start" }));
    }
  }

  async function protectOpenTabs() {
    try {
      const tabs = await call(api.tabs, "query", { url: ["*://*.soft98.ir/*"] });
      for (const tab of tabs || []) installUserOriginProtection(tab.id, tab.url);
    } catch (_error) {}
  }

  function syncInterceptionRules(enabled) {
    modificationEngineEnabled = Boolean(enabled);
    if (!api.declarativeNetRequest || !api.declarativeNetRequest.updateEnabledRulesets) return;
    ignore(call(api.declarativeNetRequest, "updateEnabledRulesets", modificationEngineEnabled ? {
      enableRulesetIds: ["soft98_upstream_gateway"],
      disableRulesetIds: [],
    } : {
      enableRulesetIds: [],
      disableRulesetIds: ["soft98_upstream_gateway"],
    }));
  }

  async function checkRelease() {
    try {
      const release = await Soft98Release.latest(VERSION);
      releaseStatus = {
        checkedAt: new Date().toISOString(),
        installedVersion: VERSION,
        available: Soft98Release.newer(release.version, VERSION),
        release,
      };
    } catch (error) {
      releaseStatus = {
        checkedAt: new Date().toISOString(),
        installedVersion: VERSION,
        available: false,
        error: String(error && error.message ? error.message : error),
      };
    }
    ignore(call(api.storage.local, "set", { [RELEASE_STATUS_KEY]: releaseStatus }));
    renderBadge();
  }

  async function sha256(buffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function compatibilityCache() {
    try {
      const result = await call(api.storage.local, "get", { [COMPATIBILITY_CACHE_KEY]: {} });
      return result[COMPATIBILITY_CACHE_KEY] || {};
    } catch (_error) {
      return {};
    }
  }

  async function notifyTab(tabId, report) {
    if (!Number.isInteger(tabId) || tabId < 0) return;
    try {
      await call(api.tabs, "sendMessage", tabId, { type: "soft98:compatibility", report });
    } catch (_error) {}
  }

  async function inspectScript(value, tabId, force) {
    const url = supportedScriptUrl(value);
    if (!url) return null;
    if (pendingInspections.has(url)) {
      const report = await pendingInspections.get(url);
      await notifyTab(tabId, report);
      return report;
    }
    const operation = (async () => {
      const cache = await compatibilityCache();
      const cached = cache[url];
      if (!force && cached && Date.now() - Date.parse(cached.checkedAt || 0) < CACHE_TTL) return cached.report;
      const response = await fetch(url, { cache: "no-store", credentials: "omit", redirect: "follow" });
      if (!response.ok) throw new Error(`Soft98 script returned HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const hash = await sha256(buffer);
      const match = COMPATIBILITY.entries.find((entry) => entry.sha256 === hash) || null;
      const report = {
        schemaVersion: 1,
        status: match ? match.status : "unknown",
        sha256: hash,
        url: response.url || url,
        bytes: buffer.byteLength,
        observedAt: new Date().toISOString(),
        extensionVersion: VERSION,
        match,
      };
      const nextCache = { ...cache, [url]: { checkedAt: new Date().toISOString(), report } };
      for (const key of Object.keys(nextCache).sort((left, right) => Date.parse(nextCache[right].checkedAt) - Date.parse(nextCache[left].checkedAt)).slice(16)) delete nextCache[key];
      compatibilityStatus = report;
      await call(api.storage.local, "set", {
        [COMPATIBILITY_CACHE_KEY]: nextCache,
        [COMPATIBILITY_STATUS_KEY]: report,
      });
      renderBadge();
      return report;
    })().catch((error) => ({
      schemaVersion: 1,
      status: "unavailable",
      url,
      observedAt: new Date().toISOString(),
      extensionVersion: VERSION,
      error: String(error && error.message ? error.message : error),
    }));
    pendingInspections.set(url, operation);
    try {
      const report = await operation;
      await notifyTab(tabId, report);
      return report;
    } finally {
      pendingInspections.delete(url);
    }
  }

  async function upstreamScriptPayload(value, force) {
    const url = supportedScriptUrl(value);
    if (!url) throw new Error("Unsupported Soft98 application script URL");
    if (pendingSources.has(url)) return pendingSources.get(url);
    const operation = (async () => {
      const stored = await call(api.storage.local, "get", { [SCRIPT_SOURCE_CACHE]: {} });
      const cache = stored[SCRIPT_SOURCE_CACHE] || {};
      const cached = cache[url];
      if (!force && cached && Date.now() - Date.parse(cached.checkedAt || 0) < CACHE_TTL && typeof cached.source === "string") {
        return { ok: true, source: cached.source, report: cached.report, cache: "hit" };
      }
      const response = await fetch(url, { cache: "no-store", credentials: "omit", redirect: "follow" });
      if (!response.ok) throw new Error(`Soft98 script returned HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const source = new TextDecoder("utf-8", { fatal: false }).decode(buffer).replace(/^\uFEFF/, "");
      const hash = await sha256(buffer);
      const match = COMPATIBILITY.entries.find((entry) => entry.sha256 === hash) || null;
      const report = {
        schemaVersion: 1,
        status: match ? match.status : "unknown",
        sha256: hash,
        url: response.url || url,
        bytes: buffer.byteLength,
        observedAt: new Date().toISOString(),
        extensionVersion: VERSION,
        match,
        executionPath: "extension-service-worker",
      };
      const next = { ...cache, [url]: { checkedAt: new Date().toISOString(), source, report } };
      for (const key of Object.keys(next).sort((left, right) => Date.parse(next[right].checkedAt) - Date.parse(next[left].checkedAt)).slice(4)) delete next[key];
      compatibilityStatus = report;
      await call(api.storage.local, "set", { [SCRIPT_SOURCE_CACHE]: next, [COMPATIBILITY_STATUS_KEY]: report });
      renderBadge();
      return { ok: true, source, report, cache: "miss" };
    })();
    pendingSources.set(url, operation);
    try {
      return await operation;
    } finally {
      pendingSources.delete(url);
    }
  }

  api.runtime.onInstalled.addListener(() => {
    api.alarms.create(ALARM_NAME, { delayInMinutes: 5, periodInMinutes: 360 });
    ignore(checkRelease());
    ignore(protectOpenTabs());
  });
  if (api.runtime.onStartup) api.runtime.onStartup.addListener(() => {
    ignore(checkRelease());
    ignore(protectOpenTabs());
  });
  api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "loading" || changeInfo.url) installUserOriginProtection(tabId, changeInfo.url || (tab && tab.url));
  });
  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === ALARM_NAME) ignore(checkRelease());
  });
  if (!api.declarativeNetRequest && api.webRequest && api.webRequest.onBeforeRequest) {
    api.webRequest.onBeforeRequest.addListener(
      (details) => modificationEngineEnabled && details.tabId >= 0 && supportedScriptUrl(details.url) ? { redirectUrl: UPSTREAM_GATEWAY } : {},
      { urls: ["*://*.soft98.ir/templates/*"], types: ["script"] },
      ["blocking"]
    );
  }
  if (api.webRequest && api.webRequest.onCompleted) {
    api.webRequest.onCompleted.addListener(
      (details) => ignore(inspectScript(details.url, details.tabId, true)),
      { urls: ["*://*.soft98.ir/templates/*"], types: ["script"] }
    );
  }
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") return false;
    if (message.type === "soft98:inspect-script") {
      inspectScript(message.url, sender && sender.tab && sender.tab.id, Boolean(message.force))
        .then((report) => sendResponse({ ok: true, report }))
        .catch((error) => sendResponse({ ok: false, error: String(error && error.message ? error.message : error) }));
      return true;
    }
    if (message.type === "soft98:get-upstream-script") {
      upstreamScriptPayload(message.url, Boolean(message.force))
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error && error.message ? error.message : error) }));
      return true;
    }
    if (message.type === "soft98:set-interception") {
      syncInterceptionRules(message.enabled !== false);
      sendResponse({ ok: true, enabled: modificationEngineEnabled });
      return false;
    }
    return false;
  });

  ignore(call(api.storage.local, "get", { [RELEASE_STATUS_KEY]: null, [COMPATIBILITY_STATUS_KEY]: null }).then((result) => {
    releaseStatus = result[RELEASE_STATUS_KEY];
    compatibilityStatus = result[COMPATIBILITY_STATUS_KEY];
    renderBadge();
  }));
  ignore(protectOpenTabs());
  ignore(call(api.storage.local, "get", { soft98AdBlockerSettings: { patchScripts: true } }).then((result) => {
    syncInterceptionRules(!result.soft98AdBlockerSettings || result.soft98AdBlockerSettings.patchScripts !== false);
  }));
})();
