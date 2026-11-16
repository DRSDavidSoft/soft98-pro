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
    expandMain: false,
    wideColumns: true,
    utilityInHeader: true,
    quickNavigation: false,
    soundFeedback: false,
    pirateLogo: true,
    taunt: false,
    diagnostics: true,
    recommendExtension: false,
    rgbMode: false,
    showLatest: true,
    hideAnnoyances: false,
    downloadRowAction: "copy",
    downloadRowContextMenu: true,
    downloadReviewMB: 100,
    downloadHeaderLayout: "actions",
    downloadHeaderButtons: "icons",
  };
  const SCRIPT_PATH = /^\/templates\/.*\/(?:application\.min\.packed|jquery(?:-v[^/]+)?(?:\.min\.packed)?)\.js$/i;
  const reportedScripts = new Set();
  const pendingPayloads = new Set();
  const deliveredPayloads = new Set();
  const PAYLOAD_MARKER = "data-soft98-pro-upstream-payload";
  try {
    const cached = JSON.parse(localStorage.getItem(PAGE_STORAGE_KEY) || "{}");
    document.documentElement.toggleAttribute("data-soft98-pro-ads-off", cached?.blockAds === false);
  } catch (_error) {}

  function inject(code) {
    const script = document.createElement("script");
    script.textContent = code;
    (document.documentElement || document.head).appendChild(script);
    script.remove();
  }

  function applySettings(settings) {
    const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    document.documentElement.setAttribute("data-soft98-pro-settings", encodeURIComponent(JSON.stringify(merged)));
    document.documentElement.toggleAttribute("data-soft98-pro-ads-off", !merged.blockAds);
    sendRuntime({ type: "soft98:set-interception", enabled: merged.patchScripts });
    document.dispatchEvent(new Event("soft98-pro:settings-received"));
  }

  function sendRuntime(message, callback) {
    try {
      if (typeof browser !== "undefined") {
        const result = api.runtime.sendMessage(message);
        if (result && typeof result.then === "function") result.then((response) => callback?.(response), () => callback?.());
      } else {
        api.runtime.sendMessage(message, (response) => {
          void api.runtime.lastError;
          if (callback) callback(response);
        });
      }
    } catch (_error) { callback?.(); }
  }

  function reportScript(script) {
    if (!script || script.nodeType !== Node.ELEMENT_NODE || script.tagName !== "SCRIPT") return;
    try {
      const url = new URL(script.src || script.getAttribute("src") || "", location.href);
      if (!/(?:^|\.)soft98\.ir$/i.test(url.hostname) || !SCRIPT_PATH.test(url.pathname) || reportedScripts.has(url.href)) return;
      reportedScripts.add(url.href);
      requestUpstreamUrl(url.href);
    } catch (_error) {}
  }

  function deliverUpstreamPayload(response, requestedUrl) {
    if (deliveredPayloads.has(requestedUrl)) return;
    deliveredPayloads.add(requestedUrl);
    const payload = document.createElement("script");
    payload.type = "application/json";
    payload.setAttribute(PAYLOAD_MARKER, "");
    payload.setAttribute("data-origin", encodeURIComponent(requestedUrl));
    if (!response || !response.ok || typeof response.source !== "string") {
      payload.setAttribute("data-error", (response && response.error) || "worker-unavailable");
    } else {
      payload.textContent = response.source;
      if (response.report) payload.setAttribute("data-report", encodeURIComponent(JSON.stringify(response.report)));
    }
    (document.documentElement || document.head).appendChild(payload);
    inject('try { window.dispatchEvent(new CustomEvent("soft98-pro:upstream-payload")); } catch (_) {}');
  }

  function requestUpstreamUrl(url) {
    if (pendingPayloads.has(url) || deliveredPayloads.has(url)) return;
    pendingPayloads.add(url);
    sendRuntime({ type: "soft98:get-upstream-script", url }, (response) => {
      pendingPayloads.delete(url);
      deliverUpstreamPayload(response, url);
    });
  }

  function requestPatchedUpstream() {
    const raw = document.documentElement.getAttribute("data-soft98-pro-upstream-request") || "";
    let url = "";
    try {
      url = decodeURIComponent(raw);
      const parsed = new URL(url, location.href);
      if (!/(?:^|\.)soft98\.ir$/i.test(parsed.hostname) || !SCRIPT_PATH.test(parsed.pathname)) return;
      url = parsed.href;
    } catch (_error) {
      return;
    }
    requestUpstreamUrl(url);
  }

  function discoverScripts(root) {
    if (root && root.matches && root.matches("script[src]")) reportScript(root);
    if (root && root.querySelectorAll) root.querySelectorAll("script[src]").forEach(reportScript);
  }

  function installScriptDiscovery() {
    discoverScripts(document);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) for (const node of mutation.addedNodes) discoverScripts(node);
    });
    observer.observe(document, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", () => discoverScripts(document), { once: true });
  }

  if (!(api.extension && api.extension.inIncognitoContext)) {
    const advertiseHeaderQueue = () => document.documentElement.setAttribute("data-s98p-header-queue-available", "");
    if (document.documentElement) advertiseHeaderQueue();
    else document.addEventListener("DOMContentLoaded", advertiseHeaderQueue, { once: true });
    const headerQueueUrl = api.runtime.getURL("header-queue.html");
    let headerQueueFrame;
    document.addEventListener("soft98-pro:header-queue-toggle", () => {
      const host = document.querySelector("#soft98-pro-header-queue:not([hidden])");
      if (!host) {
        headerQueueFrame?.remove();
        headerQueueFrame = null;
        return;
      }
      if (headerQueueFrame?.parentElement === host) return;
      headerQueueFrame?.remove();
      headerQueueFrame = document.createElement("iframe");
      headerQueueFrame.src = headerQueueUrl;
      headerQueueFrame.title = host.getAttribute("aria-label");
      host.append(headerQueueFrame);
    });
    window.addEventListener("message", event => {
      if (headerQueueFrame?.isConnected && event.source === headerQueueFrame.contentWindow &&
          event.origin === new URL(headerQueueUrl).origin && event.data === "soft98-pro:header-queue-close") {
        document.dispatchEvent(new Event("soft98-pro:header-queue-close"));
      }
    });
    const headerButton = event => event.target instanceof Element &&
      event.target.closest('button[data-soft98-pro-download-manager="header"]:not(:disabled)');
    document.addEventListener("mousedown", event => {
      if (event.isTrusted && event.button === 1 && headerButton(event)) event.preventDefault();
    }, true);
    document.addEventListener("auxclick", event => {
      if (!event.isTrusted || event.button !== 1 || event.defaultPrevented || !headerButton(event)) return;
      event.preventDefault();
      sendRuntime({ type: "soft98:open-downloads" });
    });
    const panelVisible = () => document.querySelector('#soft98-pro-control[data-open="true"] [data-panel="downloads"]:not([hidden])');
    let snapshotTimer, snapshotPending = false, snapshotDirty = false;
    function refreshDownloads() {
      clearTimeout(snapshotTimer);
      if (document.hidden || (!panelVisible() && !document.querySelector("[data-soft98-pro-download-manager=file]"))) return;
      if (snapshotPending) { snapshotDirty = true; return; }
      snapshotPending = true;
      const page = location.pathname + location.search;
      sendRuntime({ type: "soft98:download-snapshot" }, (snapshot) => {
        snapshotPending = false;
        if (page === location.pathname + location.search && snapshot?.files && !document.hidden) {
          document.documentElement.setAttribute("data-soft98-pro-download-snapshot", JSON.stringify(snapshot));
          document.dispatchEvent(new Event("soft98-pro:download-snapshot"));
        }
        if (snapshotDirty || page !== location.pathname + location.search) {
          snapshotDirty = false;
          snapshotTimer = setTimeout(refreshDownloads, 100);
        } else if (snapshot?.files?.some(({ status }) => ["starting", "resuming", "downloading"].includes(status)) ||
            (snapshot?.counts?.active && panelVisible())) {
          snapshotTimer = setTimeout(refreshDownloads, 900);
        }
      });
    }
    document.addEventListener("soft98-pro:download-snapshot-request", refreshDownloads);
    document.addEventListener("visibilitychange", refreshDownloads);
    api.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.soft98DownloadQueue) {
        refreshDownloads();
      }
    });
    let pendingAll, preparingAll = false;
    function downloadResult(response) {
      document.documentElement.setAttribute("data-soft98-pro-file-result", response?.ok ? response.result : "failed");
      document.dispatchEvent(new Event("soft98-pro:file-result"));
      refreshDownloads();
    }

    function startArticleDownloads(owner, urls, confirmAll = false) {
      if (!urls.length || owner.getAttribute("aria-busy") === "true" || (confirmAll && (pendingAll || preparingAll))) return;
      if (confirmAll) preparingAll = true;
      owner.setAttribute("aria-busy", "true");
      sendRuntime({ type: "soft98:download-file", urls, confirmAll }, (response) => {
        owner.removeAttribute("aria-busy");
        if (confirmAll) preparingAll = false;
        if (confirmAll && response?.ok && response.result === "confirm" && typeof response.token === "string" && Array.isArray(response.files)) {
          document.documentElement.dataset.s98pDownloadConfirmation = JSON.stringify(response.files);
          document.dispatchEvent(new Event("soft98-pro:download-confirmation"));
          const dialog = document.querySelector("dialog[data-s98p-download-confirm][open]");
          if (dialog) {
            const pending = pendingAll = { dialog, token: response.token, count: response.files.length };
            dialog.addEventListener("close", () => { if (pendingAll === pending) pendingAll = null; }, { once: true });
          } else downloadResult(null);
        } else downloadResult(response);
      });
    }
    document.addEventListener("click", (event) => {
      if (!event.isTrusted || event.button !== 0 || event.defaultPrevented) return;
      const confirm = event.target instanceof Element && event.target.closest("dialog[open] button[data-s98p-download-confirm-start]");
      if (confirm && pendingAll?.dialog === confirm.closest("dialog")) {
        const { dialog, token, count } = pendingAll;
        const selected = [...dialog.querySelectorAll('input[data-s98p-download-choice]:checked')].map(input => Number(input.value));
        if (!selected.length || selected.length > count || new Set(selected).size !== selected.length ||
            selected.some(index => !Number.isInteger(index) || index < 0 || index >= count)) {
          event.preventDefault();
          return;
        }
        pendingAll = null;
        sendRuntime({ type: "soft98:confirm-download-all", token, selected }, downloadResult);
        return;
      }
      const control = event.target instanceof Element && event.target.closest("button[data-soft98-pro-download-manager],button[data-s98p-file-command]");
      if (!control || control.disabled || control.closest("[hidden]")) return;
      if (control.dataset.soft98ProDownloadManager === "header") {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          sendRuntime({ type: "soft98:open-downloads" });
        }
        return;
      }
      if (control.dataset.soft98ProDownloadManager === "open") {
        sendRuntime({ type: "soft98:open-downloads", file: control.dataset.s98pManagedUrl });
        return;
      }
      if (control.dataset.soft98ProDownloadManager === "section") {
        const urls = [];
        for (let entry = control.closest("dt")?.nextElementSibling; entry?.matches("dd"); entry = entry.nextElementSibling) {
          const url = entry.querySelector(":scope > a[data-s98p-file-url]")?.dataset.s98pFileUrl;
          if (url) urls.push(url);
        }
        startArticleDownloads(control, urls, true);
        return;
      }
      if (control.dataset.s98pFileCommand !== "internal") return;
      const menu = control.closest("#soft98-pro-file-menu");
      const owner = menu ? document.getElementById(menu.dataset.owner || "") : control;
      if (!owner?.matches('button[data-soft98-pro-download-manager="file"]')) return;
      const row = owner.closest(":is(article,[data-s98p-download-rail]) dd[data-soft98-pro-download-entry]");
      const link = row?.querySelector(":scope > a[data-soft98-pro-download-row][href][data-s98p-file-url]");
      if (!link || !row.getClientRects().length) return;
      startArticleDownloads(owner, [link.dataset.s98pFileUrl]);
    }, true);
  }

  function readSettings(callback) {
    api.storage.local.get({ [STORAGE_KEY]: DEFAULT_SETTINGS }, (result) => {
      callback({ ...DEFAULT_SETTINGS, ...(result && result[STORAGE_KEY]) });
    });
  }

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    const next = { ...DEFAULT_SETTINGS, ...changes[STORAGE_KEY].newValue };
    const root = document.documentElement;
    if (root.getAttribute("data-soft98-pro-settings") === encodeURIComponent(JSON.stringify(next))) return;
    applySettings(next);
  });
  readSettings(applySettings);
  if (api.runtime.getManifest().manifest_version === 2) {
    installScriptDiscovery();
    document.addEventListener("soft98-pro:request-upstream-script", requestPatchedUpstream);
  }

  document.addEventListener("soft98-pro:settings-changed", () => {
    try {
      const raw = document.documentElement.getAttribute("data-soft98-pro-settings") || "";
      const next = { ...DEFAULT_SETTINGS, ...JSON.parse(decodeURIComponent(raw)) };
      api.storage.local.set({ [STORAGE_KEY]: next });
      sendRuntime({ type: "soft98:set-interception", enabled: next.patchScripts });
    } catch (_error) {}
  });

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
    if (message.type === "soft98:compatibility") {
      const report = message.report && typeof message.report === "object" ? message.report : null;
      if (report) {
        inject(`
          try {
            document.documentElement.setAttribute("data-soft98-pro-compatibility", encodeURIComponent(${JSON.stringify(JSON.stringify(report))}));
            window.dispatchEvent(new CustomEvent("soft98-pro:compatibility"));
          } catch (_) {}
        `);
      }
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });
})();
