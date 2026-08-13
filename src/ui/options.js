(function soft98OptionsUi() {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const usesPromises = typeof browser !== "undefined";
  const VERSION = "__SOFT98_VERSION__";
  const CATALOG = __SOFT98_MESSAGES__;
  const RELEASES_URL = Soft98Release.releasesUrl;
  const REPORT_URL = "https://github.com/DRSDavidSoft/soft98-pro/issues/new?template=soft98-script-update.yml";
  const STORAGE_KEY = "soft98AdBlockerSettings";
  const COMPATIBILITY_STATUS_KEY = "soft98CompatibilityStatus";
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
  const LOCALE = preferredLocale();
  const RTL = LOCALE === "fa";
  const STRINGS = CATALOG.locales;
  const OPTIONS = ["blockAds", "patchScripts", "pro", "darkDesign", "rgbMode", "compactLayout", "linkBadges", "pirateLogo", "taunt", "diagnostics"];

  const root = document.querySelector("[data-app]");
  let settings = { ...DEFAULT_SETTINGS };
  let updateState = { status: "checking", version: "", url: RELEASES_URL };
  let compatibilityState = null;

  function preferredLocale() {
    const languages = [navigator.language || "", ...(navigator.languages || [])].filter(Boolean);
    let timeZone = "";
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (_error) {}
    return languages.some((language) => /^fa(?:-|$)/i.test(language)) || timeZone === "Asia/Tehran" ? "fa" : "en";
  }

  function text(key, variables) {
    const value = (STRINGS[LOCALE] && STRINGS[LOCALE].options && STRINGS[LOCALE].options[key]) || STRINGS.en.options[key] || key;
    return String(value).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => {
      if (variables && Object.prototype.hasOwnProperty.call(variables, name)) return String(variables[name]);
      return name === "version" ? updateState.version || VERSION : match;
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeExternalUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : RELEASES_URL;
    } catch (_error) {
      return RELEASES_URL;
    }
  }

  function storageGet(callback) {
    const defaults = { [STORAGE_KEY]: DEFAULT_SETTINGS, [COMPATIBILITY_STATUS_KEY]: null };
    if (usesPromises) {
      api.storage.local.get(defaults).then((result) => callback({ ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] }, result[COMPATIBILITY_STATUS_KEY]));
    } else {
      api.storage.local.get(defaults, (result) => callback({ ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] }, result[COMPATIBILITY_STATUS_KEY]));
    }
  }

  function storageSet(next, callback) {
    if (usesPromises) api.storage.local.set({ [STORAGE_KEY]: next }).then(callback);
    else api.storage.local.set({ [STORAGE_KEY]: next }, callback);
  }

  function messageActiveTab(message) {
    if (!api.tabs) return;
    const send = (tabs) => {
      if (tabs[0] && tabs[0].id) api.tabs.sendMessage(tabs[0].id, message, () => void api.runtime.lastError);
    };
    if (usesPromises) api.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0] && tabs[0].id) api.tabs.sendMessage(tabs[0].id, message).catch(() => {});
    });
    else api.tabs.query({ active: true, currentWindow: true }, send);
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
    const compatibilityStatus = compatibilityState && /^(?:compatible|unknown|observed)$/.test(compatibilityState.status)
      ? compatibilityState.status
      : "unavailable";
    const compatibilityMessage = text(compatibilityStatus === "compatible" ? "compatibilityCurrent" : compatibilityStatus === "unavailable" ? "compatibilityUnavailable" : "compatibilityUnknown");
    const compatibilityHash = compatibilityState && /^[a-f0-9]{64}$/.test(compatibilityState.sha256 || "") ? compatibilityState.sha256 : "";
    const compatibilityDate = compatibilityState && compatibilityState.observedAt
      ? new Intl.DateTimeFormat(LOCALE === "fa" ? "fa-IR" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(compatibilityState.observedAt))
      : "";
    const reportUrl = `${REPORT_URL}&title=${encodeURIComponent(`compat: review Soft98 script ${compatibilityHash.slice(0, 12)}`)}`;
    root.innerHTML = `
      <section class="hero">
        <span>${text("product")}</span>
        <h1>${text("headline")}</h1>
        <p>${text("body")}</p>
        <small class="version">${text("version")}</small>
      </section>
      <section class="grid">
        ${OPTIONS.map((key) => {
          const [title, detail] = options[key] || STRINGS.en.options.options[key] || [key, ""];
          return `
          <label class="option">
            <input type="checkbox" name="${key}" ${settings[key] ? "checked" : ""}>
            <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span>
          </label>
        `;
        }).join("")}
      </section>
      <section class="update" data-status="${updateState.status}" aria-live="polite">
        <span>${updateMessage}</span>
        ${updateState.status === "available" ? `<a href="${escapeHtml(safeExternalUrl(updateState.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(text("updateAction"))}</a>` : ""}
      </section>
      <section class="compatibility" data-status="${compatibilityStatus}" aria-live="polite">
        <header><strong>${escapeHtml(text("compatibilityTitle"))}</strong><span data-indicator aria-hidden="true"></span></header>
        <p>${escapeHtml(compatibilityMessage)}</p>
        ${compatibilityHash ? `<code dir="ltr">${escapeHtml(text("compatibilityHash", { hash: compatibilityHash }))}</code>` : ""}
        <footer>
          ${compatibilityDate ? `<small>${escapeHtml(text("compatibilityChecked", { date: compatibilityDate }))}</small>` : "<span></span>"}
          ${compatibilityStatus !== "compatible" && compatibilityHash ? `<a href="${escapeHtml(reportUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text("compatibilityReport"))}</a>` : ""}
        </footer>
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

  storageGet((next, compatibility) => {
    settings = next;
    compatibilityState = compatibility;
    render();
    checkForUpdates();
  });
})();
