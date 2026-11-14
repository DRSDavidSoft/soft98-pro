(function syncSoft98ExtensionTheme() {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const key = "soft98AdBlockerSettings";
  let changed = false;
  const apply = (settings) => {
    document.documentElement.dataset.theme = settings?.pro === false || (settings?.darkDesign === false && !settings?.rgbMode) ? "light" : "dark";
  };
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[key]) return;
    changed = true;
    apply(changes[key].newValue);
  });
  const load = (result) => { if (!changed) apply(result?.[key]); };
  if (typeof browser !== "undefined") api.storage.local.get(key).then(load, () => {});
  else api.storage.local.get(key, (result) => { if (!api.runtime.lastError) load(result); });
})();
