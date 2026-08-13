(function soft98OptionsUi() {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const VERSION = "__SOFT98_VERSION__";
  const CATALOG = __SOFT98_MESSAGES__;
  const RELEASES_URL = Soft98Release.releasesUrl;
  const STORAGE_KEY = "soft98AdBlockerSettings";
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
  };
  const LOCALE = preferredLocale();
  const RTL = LOCALE === "fa";
  const STRINGS = CATALOG.locales;
  const OPTIONS = ["blockAds", "patchScripts", "pro", "darkDesign", "linkBadges", "pirateLogo", "taunt", "diagnostics"];

  const root = document.querySelector("[data-app]");
  let settings = { ...DEFAULT_SETTINGS };
  let updateState = { status: "checking", version: "", url: RELEASES_URL };

  function preferredLocale() {
    const languages = [navigator.language || "", ...(navigator.languages || [])].filter(Boolean);
    let timeZone = "";
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (_error) {}
    return languages.some((language) => /^fa(?:-|$)/i.test(language)) || timeZone === "Asia/Tehran" ? "fa" : "en";
  }

  function text(key) {
    const value = (STRINGS[LOCALE] && STRINGS[LOCALE].options && STRINGS[LOCALE].options[key]) || STRINGS.en.options[key] || key;
    return String(value).replace(/\{version\}/g, updateState.version || VERSION);
  }

  function storageGet(callback) {
    api.storage.local.get({ [STORAGE_KEY]: DEFAULT_SETTINGS }, (result) =>
      callback({ ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] })
    );
  }

  function storageSet(next, callback) {
    api.storage.local.set({ [STORAGE_KEY]: next }, callback);
  }

  function messageActiveTab(message) {
    if (!api.tabs) return;
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) api.tabs.sendMessage(tabs[0].id, message, () => void api.runtime.lastError);
    });
  }

  function save(next) {
    settings = { ...DEFAULT_SETTINGS, ...next };
    storageSet(settings, () => messageActiveTab({ type: "soft98:set-settings", settings }));
    render();
  }

  function render() {
    document.documentElement.dir = RTL ? "rtl" : "ltr";
    document.documentElement.lang = LOCALE;
    document.title = text("product");
    const options = STRINGS[LOCALE].options.options || STRINGS.en.options.options;
    const updateMessage = text(
      updateState.status === "available" ? "updateAvailable" : updateState.status === "current" ? "updateCurrent" : updateState.status === "failed" ? "updateFailed" : "updateChecking"
    );
    root.innerHTML = `
      <section class="hero">
        <span>${text("product")}</span>
        <h1>${text("headline")}</h1>
        <p>${text("body")}</p>
        <small class="version">${text("version")}</small>
      </section>
      <section class="grid">
        ${OPTIONS.map((key) => {
          const [title, detail] = options[key] || STRINGS.en.options[key];
          return `
          <label class="option">
            <input type="checkbox" name="${key}" ${settings[key] ? "checked" : ""}>
            <span><strong>${title}</strong><small>${detail}</small></span>
          </label>
        `;
        }).join("")}
      </section>
      <section class="update" data-status="${updateState.status}" aria-live="polite">
        <span>${updateMessage}</span>
        ${updateState.status === "available" ? `<a href="${updateState.url}" target="_blank" rel="noopener noreferrer">${text("updateAction")}</a>` : ""}
      </section>
      <footer>
        <button type="button" data-action="scan">${text("scan")}</button>
        <a href="https://github.com/DRSDavidSoft/soft98-pro" target="_blank" rel="noopener noreferrer">${text("repo")}</a>
      </footer>
    `;
  }

  async function checkForUpdates() {
    try {
      const release = await Soft98Release.latest(VERSION);
      const target = api.runtime.getManifest().manifest_version === 2 ? release.firefox : release.chromium;
      updateState = {
        status: Soft98Release.newer(release.version, VERSION) ? "available" : "current",
        version: release.version || VERSION,
        url: (target && target.url) || release.releaseUrl || RELEASES_URL,
      };
    } catch (_error) {
      updateState = { status: "failed", version: VERSION, url: RELEASES_URL };
    }
    render();
  }

  root.addEventListener("change", (event) => {
    const input = event.target;
    if (!input || input.tagName !== "INPUT") return;
    save({ ...settings, [input.name]: input.checked });
  });

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='scan']");
    if (button) messageActiveTab({ type: "soft98:scan" });
  });

  storageGet((next) => {
    settings = next;
    render();
    checkForUpdates();
  });
})();
