(function soft98ReleaseWatcher() {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const VERSION = "__SOFT98_VERSION__";
  const CATALOG = __SOFT98_MESSAGES__;
  const RELEASE_STATUS_KEY = "soft98ReleaseStatus";
  const ALARM_NAME = "soft98-release-check";

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
  });
  if (api.runtime.onStartup) api.runtime.onStartup.addListener(checkRelease);
  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === ALARM_NAME) checkRelease();
  });
  api.storage.local.get({ [RELEASE_STATUS_KEY]: null }, (result) => setBadge(result[RELEASE_STATUS_KEY] && result[RELEASE_STATUS_KEY].release));
})();
