(function soft98ReleaseWatcher() {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const VERSION = "__SOFT98_VERSION__";
  const CATALOG = __SOFT98_MESSAGES__;
  const RELEASE_STATUS_KEY = "soft98ReleaseStatus";
  const ALARM_NAME = "soft98-release-check";
  const USER_ORIGIN_CSS = "assets/user-origin.css";

  function isProtectedPage(url) {
    try {
      return /(?:^|\.)soft98\.ir$/i.test(new URL(url).hostname);
    } catch (_error) {
      return false;
    }
  }

  function ignoreFailure(operation) {
    if (operation && typeof operation.catch === "function") operation.catch(() => {});
  }

  function installUserOriginProtection(tabId, url) {
    if (!Number.isInteger(tabId) || !isProtectedPage(url)) return;
    try {
      if (api.scripting && api.scripting.insertCSS) {
        ignoreFailure(api.scripting.insertCSS({ target: { tabId }, files: [USER_ORIGIN_CSS], origin: "USER" }));
      } else if (api.tabs && api.tabs.insertCSS) {
        ignoreFailure(api.tabs.insertCSS(tabId, { file: `/${USER_ORIGIN_CSS}`, cssOrigin: "user", runAt: "document_start" }));
      }
    } catch (_error) {}
  }

  function protectOpenTabs() {
    const apply = (tabs) => (tabs || []).forEach((tab) => installUserOriginProtection(tab.id, tab.url));
    try {
      if (typeof browser !== "undefined") ignoreFailure(api.tabs.query({ url: ["*://*.soft98.ir/*"] }).then(apply));
      else api.tabs.query({ url: ["*://*.soft98.ir/*"] }, apply);
    } catch (_error) {}
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

  function setBadge(release) {
    const action = api.action || api.browserAction;
    if (!action) return;
    const available = release && Soft98Release.newer(release.version, VERSION);
    action.setBadgeText({ text: available ? "UP" : "" });
    if (available) {
      action.setBadgeBackgroundColor({ color: "#0b8f6a" });
      action.setTitle({ title: text("updateAvailable", release.version) });
    } else {
      action.setTitle({ title: text("product") });
    }
  }

  async function checkRelease() {
    try {
      const release = await Soft98Release.latest(VERSION);
      const status = { checkedAt: new Date().toISOString(), installedVersion: VERSION, available: Soft98Release.newer(release.version, VERSION), release };
      api.storage.local.set({ [RELEASE_STATUS_KEY]: status });
      setBadge(release);
    } catch (error) {
      api.storage.local.set({
        [RELEASE_STATUS_KEY]: { checkedAt: new Date().toISOString(), installedVersion: VERSION, available: false, error: String(error && error.message ? error.message : error) },
      });
    }
  }

  api.runtime.onInstalled.addListener(() => {
    api.alarms.create(ALARM_NAME, { delayInMinutes: 5, periodInMinutes: 360 });
    checkRelease();
    protectOpenTabs();
  });
  if (api.runtime.onStartup) api.runtime.onStartup.addListener(() => {
    checkRelease();
    protectOpenTabs();
  });
  api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "loading" || changeInfo.url) installUserOriginProtection(tabId, changeInfo.url || (tab && tab.url));
  });
  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === ALARM_NAME) checkRelease();
  });
  api.storage.local.get({ [RELEASE_STATUS_KEY]: null }, (result) => setBadge(result[RELEASE_STATUS_KEY] && result[RELEASE_STATUS_KEY].release));
  protectOpenTabs();
})();
