const Soft98Theme = (function syncSoft98ExtensionTheme() {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const key = "soft98AdBlockerSettings";
  const accents = ["default", "sky", "orchid", "amber"];
  const listeners = new Set();
  let latest = {};
  let changed = false;
  const apply = (settings) => {
    latest = settings || {};
    const root = document.documentElement;
    root.dataset.theme = latest.rgbMode ? "rgb" : latest.darkDesign === false ? "light" : "dark";
    if (accents.includes(latest.accentColor) && latest.accentColor !== "default") root.dataset.s98pAccent = latest.accentColor;
    else root.removeAttribute("data-s98p-accent");
    for (const callback of listeners) callback(latest);
  };
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[key]) return;
    changed = true;
    apply(changes[key].newValue);
  });
  const load = (result) => { if (!changed) apply(result?.[key]); };
  if (typeof browser !== "undefined") api.storage.local.get(key).then(load, () => {});
  else api.storage.local.get(key, (result) => { if (!api.runtime.lastError) load(result); });
  return { key, accents, observe(callback) { listeners.add(callback); callback(latest); } };
})();
