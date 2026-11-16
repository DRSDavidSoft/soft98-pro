"use strict";

function createSoft98DownloadImport({ api, usesPromises, locale, text, bytes, buttonContent, request, report }) {
  const $ = (id) => document.getElementById(id);
  const { MAX_BATCH, MAX_IMPORT, MAX_TEXT, describe, headers, normalize, parse } = Soft98DownloadLinks;
  const dialog = $("import");
  const candidates = new Map();
  const selected = new Set();
  const widths = { name: 268, type: 105, size: 104, date: 142 };
  const dates = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, { dateStyle: "medium" });
  const collator = new Intl.Collator(locale, { numeric: true });
  let sort = { key: "name", direction: 1 };
  let probe;
  let autoTimer;
  let submitting = false;

  function notify(key, values) {
    $("import-notice").textContent = key ? text(key, values) : "";
  }

  function open() {
    if (!dialog.open) dialog.showModal();
    scheduleDetails();
  }

  function append(urls, source) {
    open();
    for (const url of urls) {
      if (candidates.size >= MAX_IMPORT) break;
      if (candidates.has(url)) continue;
      candidates.set(url, { url, ...describe(url), source: normalize(source) });
      if (selected.size < MAX_BATCH) selected.add(url);
    }
    render();
    scheduleDetails();
  }

  function importText(input) {
    const { urls, ignored } = parse(input);
    append(urls);
    notify(urls.length ? (ignored || input.length > MAX_TEXT ? "importIgnored" : "") : "noLinks");
  }

  async function importFile(file) {
    open();
    if (!file || !(/\.txt$/i.test(file.name) || file.type === "text/plain") || file.size > MAX_TEXT) return notify("badFile");
    try { importText(await file.text()); } catch (_error) { notify("badFile"); }
  }

  function visibleRows() {
    const filter = $("import-type").value;
    const query = $("import-search").value.trim().toLowerCase();
    return [...candidates.values()].filter((row) => (!filter || (row.type || row.mime || "?") === filter) &&
      (!query || `${row.name} ${row.host} ${row.url}`.toLowerCase().includes(query))).sort((a, b) => {
      const value = (row) => sort.key === "type" ? row.type || row.mime || null : row[sort.key];
      const x = value(a), y = value(b);
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
      return sort.direction * (typeof x === "number" ? x - y : collator.compare(x, y));
    });
  }

  function updateSelection() {
    for (const box of $("import-links").querySelectorAll("input")) box.checked = selected.has(box.value);
    $("import-count").textContent = text("selectionCount", { count: selected.size, total: candidates.size });
    $("add").disabled = !selected.size || submitting;
    $("probe-import").disabled = !selected.size || Boolean(probe);
    $("select-import").disabled = selected.size >= MAX_BATCH || !visibleRows().some(({ url }) => !selected.has(url));
    $("clear-import").disabled = !selected.size;
    $("filename").disabled = selected.size !== 1;
  }

  function render() {
    const focused = $("import-links").contains(document.activeElement) && document.activeElement.value;
    const filter = $("import-type").value;
    const types = [...new Set([...candidates.values()].map((row) => row.type || row.mime || "?"))].sort();
    $("import-type").replaceChildren(new Option(text("allTypes"), ""), ...types.map((type) => new Option(type === "?" ? text("unavailable") : type, type)));
    $("import-type").value = types.includes(filter) ? filter : "";
    for (const col of $("import-table").querySelectorAll("th[data-column]")) {
      col.setAttribute("aria-sort", col.dataset.column === sort.key ? (sort.direction === 1 ? "ascending" : "descending") : "none");
    }
    const rows = visibleRows();
    const body = document.createDocumentFragment();
    for (const row of rows) {
      const tr = document.createElement("tr");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.value = row.url;
      check.setAttribute("aria-label", row.name);
      const toggle = tr.insertCell();
      toggle.append(check);
      const file = tr.insertCell();
      const name = document.createElement("bdi");
      name.textContent = row.name;
      name.title = row.name;
      const host = document.createElement("small");
      host.textContent = row.host;
      host.dir = "ltr";
      file.append(name, host);
      const type = tr.insertCell();
      type.textContent = row.type || row.mime || text("unavailable");
      type.title = row.mime || type.textContent;
      const size = tr.insertCell();
      size.textContent = row.size != null ? bytes(row.size) : text("unavailable");
      const date = tr.insertCell();
      date.textContent = row.date != null ? dates.format(row.date) : text("unavailable");
      if (row.probeFailed) { size.title = text("headersUnavailable"); date.title = size.title; }
      body.append(tr);
    }
    $("import-links").replaceChildren(body);
    if (focused) [...$("import-links").querySelectorAll("input")].find((box) => box.value === focused)?.focus({ preventScroll: true });
    $("import-empty").hidden = Boolean(rows.length);
    $("import-empty").textContent = text(candidates.size ? "noMatches" : "importEmpty");
    updateSelection();
  }

  function resize(key, value) {
    widths[key] = Math.min(640, Math.max(72, value));
    $("import-table").querySelector(`col[data-column="${key}"]`).style.width = `${widths[key]}px`;
    $("import-table").style.minWidth = `${Object.values(widths).reduce((a, b) => a + b, 42)}px`;
    $("import-table").querySelector(`th[data-column="${key}"] [role=separator]`).setAttribute("aria-valuenow", widths[key]);
  }

  for (const th of $("import-table").querySelectorAll("th[data-column]")) {
    const key = th.dataset.column;
    const order = document.createElement("button");
    order.type = "button";
    order.textContent = text("column_" + key);
    order.addEventListener("click", () => {
      sort = { key, direction: sort.key === key ? -sort.direction : 1 };
      render();
    });
    const handle = document.createElement("span");
    handle.tabIndex = 0;
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-label", text("resizeColumn", { column: order.textContent }));
    handle.setAttribute("aria-valuemin", "72");
    handle.setAttribute("aria-valuemax", "640");
    let anchor;
    const dir = locale === "fa" ? -1 : 1;
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      anchor = { x: event.clientX, width: widths[key] };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (anchor) resize(key, anchor.width + dir * (event.clientX - anchor.x));
    });
    handle.addEventListener("lostpointercapture", () => { anchor = null; });
    handle.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      resize(key, widths[key] + (event.key === "ArrowRight" ? 12 : -12) * dir);
    });
    th.append(order, handle);
    resize(key, widths[key]);
  }

  function permissions(origins) {
    const options = { origins };
    if (usesPromises) return api.permissions.request(options);
    return new Promise((resolve) => api.permissions.request(options, (allowed) => {
      void api.runtime.lastError;
      resolve(allowed);
    }));
  }

  function scheduleDetails() {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => { if (dialog.open) void fetchDetails(false); }, 200);
  }

  async function fetchDetails(askPermission) {
    if (probe || !selected.size) return;
    const entries = [...selected].map((url) => candidates.get(url)).filter((entry) => askPermission || !entry.probed);
    if (!entries.length) return;
    const origins = [...new Set(entries.map(({ url }) => {
      const { protocol, hostname } = new URL(url);
      return `${protocol}//${hostname}/*`;
    }))];
    const controller = new AbortController();
    probe = controller;
    updateSelection();
    try {
      if (askPermission && !await permissions(origins)) return notify("permissionDeclined");
      if (controller.signal.aborted) return;
      if (askPermission) notify("fetchingDetails");
      let index = 0;
      let failed = 0;
      await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
        while (index < entries.length && !controller.signal.aborted) {
          const entry = entries[index++];
          const timeout = new AbortController();
          const abort = () => timeout.abort();
          const timer = setTimeout(abort, 6500);
          controller.signal.addEventListener("abort", abort, { once: true });
          try {
            const response = await fetch(entry.url, { method: "HEAD", credentials: "omit", referrerPolicy: "no-referrer", signal: timeout.signal });
            if (!response.ok) throw new Error("HEAD unavailable");
            Object.assign(entry, headers(response.headers), { probeFailed: false });
          } catch (_error) { if (!controller.signal.aborted) { entry.probeFailed = true; failed++; } }
          finally {
            if (!controller.signal.aborted) entry.probed = true;
            clearTimeout(timer);
            controller.signal.removeEventListener("abort", abort);
          }
        }
      }));
      if (!controller.signal.aborted) {
        render();
        if (askPermission || failed) notify(failed ? "detailsPartial" : "detailsDone", { count: failed });
      }
    } catch (_error) { notify("permissionDeclined"); }
    finally {
      if (probe === controller) probe = null;
      updateSelection();
      if ([...selected].some((url) => !candidates.get(url)?.probed)) scheduleDetails();
    }
  }

  const manual = () => {
    const url = normalize($("import-url").value);
    if (!url) return notify("invalid-url");
    $("import-url").value = "";
    append([url]);
    notify("");
  };
  document.addEventListener("paste", (event) => {
    if (event.target.matches?.("input:not(#import-url),[contenteditable]") || !event.clipboardData) return;
    const input = event.clipboardData.getData("text/plain");
    if (!input) return;
    event.preventDefault();
    importText(input);
  });
  document.addEventListener("dragover", (event) => {
    if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
  });
  document.addEventListener("drop", (event) => {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    void importFile(event.dataTransfer.files[0]);
  });
  $("choose-file").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", () => {
    void importFile($("import-file").files[0]);
    $("import-file").value = "";
  });
  $("paste-links").addEventListener("click", async () => {
    try { importText(await navigator.clipboard.readText()); } catch (_error) { notify("pasteShortcut"); }
  });
  $("open-import").addEventListener("click", open);
  $("close-import").addEventListener("click", () => dialog.close());
  $("add-url").addEventListener("click", manual);
  $("import-url").addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); manual(); }
  });
  $("import-search").addEventListener("input", render);
  $("import-type").addEventListener("change", render);
  $("probe-import").addEventListener("click", () => { void fetchDetails(true); });
  $("select-import").addEventListener("click", () => {
    for (const { url } of visibleRows()) {
      if (selected.size >= MAX_BATCH) break;
      selected.add(url);
    }
    updateSelection();
    scheduleDetails();
  });
  $("clear-import").addEventListener("click", () => { selected.clear(); updateSelection(); });
  $("import-links").addEventListener("change", (event) => {
    const { checked, value } = event.target;
    if (!checked) selected.delete(value);
    else if (selected.size < MAX_BATCH) selected.add(value);
    else notify("invalid-batch");
    updateSelection();
    scheduleDetails();
  });
  dialog.addEventListener("close", () => { clearTimeout(autoTimer); probe?.abort(); });
  $("composer").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting || !selected.size) return;
    const urls = [...selected];
    submitting = true;
    updateSelection();
    const ok = await request("add", { urls, sources: Object.fromEntries(urls.map((url) => [url, candidates.get(url).source])),
      metadata: Object.fromEntries(urls.map((url) => {
        const { size, date, mime, type } = candidates.get(url);
        return [url, { size, date, mime, type }];
      })),
      filename: urls.length === 1 ? $("filename").value : "", saveAs: $("save-as").checked });
    submitting = false;
    if (ok) {
      for (const url of urls) { candidates.delete(url); selected.delete(url); }
      $("filename").value = "";
      dialog.close();
    } else notify("importFailed");
    render();
  });
  for (const [id, key, icon] of [
    ["open-import", "importOpen", "plus"], ["add-url", "addLink", "plus"], ["paste-links", "pasteLinks", "clipboard"],
    ["choose-file", "chooseFile", "file-upload"], ["probe-import", "fetchDetails", "list-details"], ["add", "add", "download"],
  ]) buttonContent($(id), key, icon);
  buttonContent($("close-import"), "close", "x");
  $("close-import").setAttribute("aria-label", text("close"));
  $("import-type").setAttribute("aria-label", text("allTypes"));
  $("check-column").setAttribute("aria-label", text("selection"));
  $("import-search").placeholder = text("search");
  render();
  return { append, expired: () => report(text("importExpired"), true) };
}
