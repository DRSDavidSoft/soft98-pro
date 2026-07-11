(function soft98OptionsUi() {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const STORAGE_KEY = "soft98AdBlockerSettings";
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
  const OPTIONS = [
    ["blockAds", "Block ads", "Remove ad surfaces using source, shape, and link behavior."],
    ["patchScripts", "Patch Soft98 code", "Unpack and patch Soft98 anti-adblock code before it runs."],
    ["pro", "Soft98 Pro", "Enable the enhanced experience layer."],
    ["darkDesign", "Modern dark design", "Apply the modern dark Soft98 Pro theme."],
    ["linkBadges", "Download badges", "Mark recovered download links."],
    ["pirateLogo", "Pirate logo", "Switch the logo after successful cleanup."],
    ["taunt", "Professional challenge", "Show the success note only after the script works."],
    ["diagnostics", "Console diagnostics", "Expose useful logs and interactive page APIs."],
  ];

  const root = document.querySelector("[data-app]");
  let settings = { ...DEFAULT_SETTINGS };

  function storageGet(callback) {
    api.storage.local.get({ [STORAGE_KEY]: DEFAULT_SETTINGS }, (result) => callback({ ...DEFAULT_SETTINGS, ...result[STORAGE_KEY] }));
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
    root.innerHTML = `
      <section class="hero">
        <span>Soft98 Ad Blocker</span>
        <h1>Precise page control without fragile names.</h1>
        <p>Patch packed Soft98 code, preserve download links, remove ads and noisy blocker-side notices, then optionally turn on Soft98 Pro.</p>
      </section>
      <section class="grid">
        ${OPTIONS.map(([key, title, detail]) => `
          <label class="option">
            <input type="checkbox" name="${key}" ${settings[key] ? "checked" : ""}>
            <span><strong>${title}</strong><small>${detail}</small></span>
          </label>
        `).join("")}
      </section>
      <footer>
        <button type="button" data-action="scan">Scan active tab</button>
        <a href="https://github.com/DRSDavidSoft/soft98-ad-blocker-extension" target="_blank" rel="noopener noreferrer">Repository</a>
      </footer>
    `;
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
  });
})();
