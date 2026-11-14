(function soft98OptionsUi() {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const usesPromises = typeof browser !== "undefined";
  const VERSION = "__SOFT98_VERSION__";
  const CATALOG = __SOFT98_MESSAGES__;
  const PREVIEWS = __SOFT98_SETTINGS_PREVIEWS__;
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
    expandMain: false,
    utilityInHeader: true,
    quickNavigation: false,
    soundFeedback: false,
    linkBadges: true,
    pirateLogo: true,
    taunt: false,
    diagnostics: true,
    recommendExtension: false,
    rgbMode: false,
    showLatest: true,
    hideAnnoyances: false,
  };
  const LOCALE = preferredLocale();
  const RTL = LOCALE === "fa";
  const STRINGS = CATALOG.locales;
  const OPTIONS = ["blockAds", "patchScripts", "pro", "darkDesign", "rgbMode", "compactLayout", "expandMain", "utilityInHeader", "quickNavigation", "showLatest", "hideAnnoyances", "linkBadges", "pirateLogo", "taunt", "diagnostics", "soundFeedback"];

  const root = document.querySelector("[data-app]");
  let settings = { ...DEFAULT_SETTINGS };
  let updateState = { status: "checking", version: "", url: RELEASES_URL };
  let compatibilityState = null;
  let previewTimer;
  let previewAnchor;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

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
      const value = variables && Object.prototype.hasOwnProperty.call(variables, name) ? variables[name]
        : name === "version" ? updateState.version || VERSION : match;
      return RTL && (name === "version" || name === "hash") ? `\u2066${value}\u2069` : String(value);
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

  function storageSet(next, onError) {
    if (usesPromises) api.storage.local.set({ [STORAGE_KEY]: next }).catch(onError);
    else api.storage.local.set({ [STORAGE_KEY]: next }, () => { if (api.runtime.lastError) onError(); });
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

  function applyControls(next) {
    settings = { ...DEFAULT_SETTINGS, ...next };
    for (const input of root.querySelectorAll("input[name]")) input.checked = settings[input.name];
  }

  function closePreview() {
    clearTimeout(previewTimer);
    previewAnchor = null;
    const panel = root.querySelector(".option-preview");
    if (panel) panel.hidden = true;
    for (const image of panel?.querySelectorAll("img") || []) image.removeAttribute("src");
  }

  function openPreview(anchor, delay = 0) {
    if (previewAnchor === anchor && delay) return;
    closePreview();
    previewAnchor = anchor;
    previewTimer = setTimeout(() => {
      if (previewAnchor !== anchor || !anchor.isConnected) return;
      const panel = root.querySelector(".option-preview");
      const { files: [before, after, still], illustrated } = PREVIEWS[anchor.dataset.previewOption];
      panel.querySelector(".preview-kind").hidden = !illustrated;
      const images = panel.querySelectorAll("img");
      images[0].src = `assets/previews/${before}`;
      images[1].src = `assets/previews/${reducedMotion.matches && still ? still : after}`;
      panel.hidden = false;
      const { width, height } = panel.getBoundingClientRect();
      const rect = anchor.getBoundingClientRect();
      const view = document.documentElement;
      const x = rect.right + width + 8 <= view.clientWidth ? rect.right + 8 :
        rect.left - width >= 8 ? rect.left - width - 8 : rect.left;
      const side = x !== rect.left;
      const y = side ? rect.top :
        rect.bottom + height + 8 <= view.clientHeight ? rect.bottom + 8 : rect.top - height - 8;
      panel.style.left = Math.max(8, Math.min(x, view.clientWidth - width - 8)) + "px";
      panel.style.top = Math.max(8, Math.min(y, view.clientHeight - height - 8)) + "px";
    }, delay);
  }

  function render() {
    const previousFocus = root.contains(document.activeElement) && document.activeElement.getAttribute("name");
    closePreview();
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
        <h1><img src="assets/icon-32.png" width="28" height="28" alt=""><bdi>${text("product")}</bdi></h1>
        <p>${text("body")}</p>
        <small class="version">${text("version")}</small>
      </section>
      <section class="grid">
        ${OPTIONS.map((key) => {
          const [title, detail] = options[key] || STRINGS.en.options.options[key] || [key, ""];
          const hasPreview = Object.hasOwn(PREVIEWS, key);
          return `
          <div class="option"${hasPreview ? ` data-preview-option="${key}"` : ""}>
            <label>
              <input type="checkbox" name="${key}" ${settings[key] ? "checked" : ""}>
              <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span>
            </label>
            ${hasPreview ? `<button type="button" class="preview-toggle" aria-label="${escapeHtml(text("previewOption", { title }))}"><span aria-hidden="true"></span></button>` : ""}
          </div>
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
        ${compatibilityHash ? `<code>${escapeHtml(text("compatibilityHash", { hash: compatibilityHash }))}</code>` : ""}
        <footer>
          ${compatibilityDate ? `<small>${escapeHtml(text("compatibilityChecked", { date: compatibilityDate }))}</small>` : "<span></span>"}
          ${compatibilityStatus !== "compatible" && compatibilityHash ? `<a href="${escapeHtml(reportUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text("compatibilityReport"))}</a>` : ""}
        </footer>
      </section>
      <footer>
        <button type="button" data-action="scan">${text("scan")}</button>
        <a href="https://github.com/DRSDavidSoft/soft98-pro" target="_blank" rel="noopener noreferrer">${text("repo")}</a>
      </footer>
      <div class="option-preview" hidden aria-hidden="true">
        <figure><figcaption>${escapeHtml(CATALOG.locales[LOCALE].runtime.previewBefore)}</figcaption><img alt="" draggable="false"></figure>
        <figure><figcaption>${escapeHtml(CATALOG.locales[LOCALE].runtime.previewAfter)}</figcaption><img alt="" draggable="false"></figure>
        <span class="preview-kind" hidden>${escapeHtml(CATALOG.locales[LOCALE].runtime.previewIllustration)}</span>
      </div>
    `;
    for (const anchor of root.querySelectorAll("[data-preview-option]")) {
      anchor.addEventListener("pointerenter", (event) => { if (event.pointerType !== "touch") openPreview(anchor, 220); });
      anchor.addEventListener("pointerleave", () => { if (previewAnchor === anchor) closePreview(); });
      anchor.addEventListener("focusin", (event) => { if (event.target.matches(":focus-visible")) openPreview(anchor); });
      anchor.addEventListener("focusout", (event) => {
        if (!anchor.contains(event.relatedTarget) && previewAnchor === anchor) closePreview();
      });
    }
    if (previousFocus) root.querySelector(`input[name="${CSS.escape(previousFocus)}"]`)?.focus({ preventScroll: true });
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
    closePreview();
    const previous = settings;
    const next = { ...settings, [input.name]: input.checked };
    if (input.name === "darkDesign" && !input.checked) next.rgbMode = false;
    applyControls(next);
    const pending = settings;
    storageSet(next, () => { if (settings === pending) applyControls(previous); });
  });

  root.addEventListener("click", (event) => {
    const anchor = event.target.closest(".preview-toggle")?.closest("[data-preview-option]");
    if (anchor) {
      if (anchor === previewAnchor && !root.querySelector(".option-preview").hidden) closePreview();
      else openPreview(anchor);
      return;
    }
    closePreview();
    const button = event.target.closest("[data-action='scan']");
    if (button) messageActiveTab({ type: "soft98:scan" });
  });
  window.addEventListener("scroll", closePreview, { passive: true });
  window.addEventListener("resize", closePreview);
  window.addEventListener("keydown", (event) => { if (event.key === "Escape") closePreview(); });
  api.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) applyControls(changes[STORAGE_KEY].newValue);
  });

  storageGet((next, compatibility) => {
    settings = next;
    compatibilityState = compatibility;
    render();
    checkForUpdates();
  });
})();
