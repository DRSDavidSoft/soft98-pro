"use strict";

function createSoft98DownloadImport({ api, usesPromises, locale, text, bytes, buttonContent, setIcon, request, send, view, copyLink, externalLink, dates }) {
  const $ = (id) => document.getElementById(id);
  const { MAX_BATCH, MAX_IMPORT, MAX_TEXT, describe, normalize, parse } = Soft98DownloadLinks;
  const dialog = $("import");
  const table = $("import-table");
  const accessButton = $("probe-import");
  const headingRow = table.tHead.rows[0];
  const candidates = new Map();
  const rowNodes = new Map();
  const selected = new Set();
  const widths = { name: 268, type: 105, size: 104, date: 142 };
  const defaultColumns = Object.keys(widths);
  const columnIcons = { name: "file", type: "tag", size: "database", date: "calendar" };
  const layoutKey = "soft98-pro.import-columns";
  const rtl = () => table.dir === "rtl";
  const collator = new Intl.Collator(locale, { numeric: true });
  let sort = { key: "name", direction: 1 };
  let columnOrder = defaultColumns;
  let columnDrag;
  let suppressedDragClick;
  let probe;
  let autoTimer;
  let submitting = false;
  let notice;
  try { columnOrder = readOrder(localStorage.getItem(layoutKey)); } catch (_error) {}

  function readOrder(value) {
    try {
      const saved = JSON.parse(value);
      if (Array.isArray(saved) && saved.length === defaultColumns.length && defaultColumns.every(key => saved.includes(key))) return saved;
    } catch (_error) {}
    return defaultColumns;
  }

  function placeColumns(row) {
    let next = row.firstElementChild.nextElementSibling;
    for (const key of columnOrder) {
      const node = row.querySelector(`:scope > [data-column="${key}"]`);
      if (node === next) next = next.nextElementSibling;
      else row.insertBefore(node, next);
    }
  }

  function applyOrder(next, persist = false) {
    if (next.join() === columnOrder.join() && !persist) return;
    const focused = headingRow.contains(document.activeElement) ? document.activeElement : null;
    columnOrder = next;
    placeColumns(table.querySelector("colgroup"));
    placeColumns(headingRow);
    for (const { tr } of rowNodes.values()) placeColumns(tr);
    focused?.focus({ preventScroll: true });
    if (persist) {
      try { localStorage.setItem(layoutKey, JSON.stringify(columnOrder)); } catch (_error) {}
    }
  }

  function reorderColumn(source, destination, after) {
    if (source === destination) return;
    const next = columnOrder.filter(key => key !== source);
    next.splice(next.indexOf(destination) + (after ? 1 : 0), 0, source);
    applyOrder(next, true);
  }

  function moveColumn(key, delta) {
    const destination = columnOrder[columnOrder.indexOf(key) + delta];
    if (destination) reorderColumn(key, destination, delta > 0);
  }

  function notify(key, values) {
    notice = key;
    $("import-notice").textContent = key ? text(key, values) : "";
  }

  function selectedForDetails(askPermission) {
    return [...selected].map(url => candidates.get(url)).filter(row => row && (
      askPermission ? row.probeStatus === "permission" && row.permissionOrigin : !row.probeStatus
    ));
  }

  function open() {
    if (!dialog.open) view.openImport();
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
    for (const [url, { tr, check }] of rowNodes) {
      check.checked = selected.has(url);
      tr.toggleAttribute("data-selected", check.checked);
    }
    $("import-count").textContent = text("selectionCount", { count: selected.size, total: candidates.size });
    $("add").disabled = !selected.size || submitting;
    const needsAccess = selectedForDetails(true).length > 0;
    const moveFocus = !needsAccess && document.activeElement === accessButton;
    accessButton.hidden = !needsAccess;
    accessButton.disabled = !needsAccess || Boolean(probe);
    if (!needsAccess && (notice === "detailsNeedAccess" || notice === "permissionDeclined")) notify("");
    if (moveFocus && dialog.open) ($("add").disabled ? $("import-search") : $("add")).focus({ preventScroll: true });
    $("select-import").disabled = selected.size >= MAX_BATCH || !visibleRows().some(({ url }) => !selected.has(url));
    $("clear-import").disabled = !selected.size;
    $("filename").disabled = selected.size !== 1;
  }

  function render() {
    const body = $("import-links");
    const filter = $("import-type").value;
    const types = [...new Set([...candidates.values()].map((row) => row.type || row.mime || "?"))].sort();
    $("import-type").replaceChildren(new Option(text("allTypes"), ""), ...types.map((type) => new Option(type === "?" ? text("unavailable") : type, type)));
    $("import-type").value = types.includes(filter) ? filter : "";
    for (const col of $("import-table").querySelectorAll("th[data-column]")) {
      col.setAttribute("aria-sort", col.dataset.column === sort.key ? (sort.direction === 1 ? "ascending" : "descending") : "none");
    }
    const rows = visibleRows();
    const visible = new Set(rows.map(row => row.url));
    const ordered = [...rows, ...[...candidates.values()].filter(row => !visible.has(row.url))];
    for (const [url, { tr }] of rowNodes) if (!candidates.has(url)) {
      tr.remove();
      rowNodes.delete(url);
    }
    let next = body.firstElementChild;
    for (const row of ordered) {
      if (!rowNodes.has(row.url)) rowNodes.set(row.url, createRow(row));
      const { tr, mark, type, size, date } = rowNodes.get(row.url);
      const filtered = !visible.has(row.url);
      if (filtered && tr.contains(document.activeElement)) $("import-search").focus({ preventScroll: true });
      tr.toggleAttribute("data-filtered", filtered);
      tr.inert = filtered;
      setIcon(mark, Soft98DownloadView.fileIcon(row.type, row.mime));
      type.textContent = row.type || row.mime || text("unavailable");
      type.title = row.mime || type.textContent;
      size.dir = row.size != null ? "ltr" : "auto";
      size.textContent = row.size != null ? bytes(row.size) : text("unavailable");
      paintDate(date, row.date);
      size.parentElement.title = date.parentElement.title = row.probeStatus === "permission" ? text("detailsNeedAccess") :
        row.probeStatus === "unavailable" ? text("headersUnavailable") : "";
      if (tr === next) next = next.nextElementSibling;
      else body.insertBefore(tr, next);
    }
    $("import-empty").hidden = Boolean(rows.length);
    $("import-empty").textContent = text(candidates.size ? "noMatches" : "importEmpty");
    updateSelection();
  }

  function paintDate(date, stamp) {
    const fallback = date.nextElementSibling;
    const available = dates.paint(date, stamp, text("column_date"));
    fallback.hidden = available;
    const label = available ? "" : text("unavailable");
    if (fallback.textContent !== label) fallback.textContent = label;
  }

  function refreshDates() {
    for (const [url, { date }] of rowNodes) paintDate(date, candidates.get(url)?.date);
  }

  function createRow(row) {
    const tr = document.createElement("tr");
    tr.dataset.url = row.url;
    tr.innerHTML = '<td><input type="checkbox"></td><td data-column="name" class="import-name"><span class="file-mark"></span><span><bdi></bdi><small dir="ltr"></small></span></td><td data-column="type"></td><td data-column="size" class="import-size"><bdi></bdi></td><td data-column="date"><time></time><span></span></td>';
    const check = tr.querySelector("input");
    check.value = row.url;
    check.setAttribute("aria-label", row.name);
    const name = tr.querySelector("bdi");
    name.textContent = name.title = row.name;
    tr.querySelector("small").textContent = row.host;
    const nodes = { tr, check, mark: tr.querySelector(".file-mark"), type: tr.cells[2],
      size: tr.cells[3].firstElementChild, date: tr.cells[4].firstElementChild };
    placeColumns(tr);
    return nodes;
  }

  function resize(key, value) {
    widths[key] = Math.min(640, Math.max(72, value));
    table.querySelector(`col[data-column="${key}"]`).style.width = `${widths[key]}px`;
    table.style.minWidth = `${Object.values(widths).reduce((a, b) => a + b, 42)}px`;
    headingRow.querySelector(`th[data-column="${key}"] [role=separator]`).setAttribute("aria-valuenow", widths[key]);
  }

  function applySort(key, direction) {
    sort = { key, direction };
    render();
  }

  function columnMenu(event, th) {
    const { column: key } = th.dataset;
    const index = columnOrder.indexOf(key);
    const moveLeft = rtl() ? 1 : -1;
    const choices = [
      { label: "sortAscending", icon: "sort-ascending", run: () => applySort(key, 1) },
      { label: "sortDescending", icon: "sort-descending", run: () => applySort(key, -1) },
    ];
    for (const [label, icon, delta] of [["moveColumnLeft", "arrow-left", moveLeft], ["moveColumnRight", "arrow-right", -moveLeft]]) {
      if (columnOrder[index + delta]) choices.push({ label, icon, group: "columns", run: () => moveColumn(key, delta) });
    }
    choices.push({ label: "resetColumnOrder", icon: "rotate-clockwise", group: "columns", run: () => applyOrder(defaultColumns, true) });
    view.showMenu(event, choices, th.querySelector(".column-menu"));
  }

  function isDragClick(event) {
    return event.detail > 0 && suppressedDragClick?.handle === event.currentTarget && suppressedDragClick.until >= performance.now();
  }

  for (const th of headingRow.querySelectorAll("th[data-column]")) {
    const key = th.dataset.column;
    const controls = document.createElement("span");
    controls.className = "column-tools";
    const order = document.createElement("button");
    order.type = "button";
    order.className = "column-sort";
    order.setAttribute("data-column-drag", "");
    const icon = document.createElement("span");
    const label = document.createElement("span");
    label.dir = "auto";
    label.textContent = text("column_" + key);
    setIcon(icon, columnIcons[key]);
    order.append(icon, label);
    order.addEventListener("click", event => {
      if (!isDragClick(event)) applySort(key, sort.key === key ? -sort.direction : 1);
    });
    const grip = document.createElement("button");
    grip.type = "button";
    grip.className = "column-menu icon-button";
    grip.setAttribute("data-column-drag", "");
    grip.setAttribute("aria-haspopup", "menu");
    grip.setAttribute("aria-expanded", "false");
    grip.setAttribute("aria-label", text("columnActions", { column: label.textContent }));
    grip.title = text("columnActions", { column: label.textContent });
    buttonContent(grip, "actions", "grip-vertical");
    grip.addEventListener("click", event => { if (!isDragClick(event)) columnMenu(event, th); });
    controls.append(order, grip);
    const handle = document.createElement("span");
    handle.tabIndex = 0;
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-label", text("resizeColumn", { column: label.textContent }));
    handle.setAttribute("aria-valuemin", "72");
    handle.setAttribute("aria-valuemax", "640");
    let anchor;
    const dir = () => rtl() ? -1 : 1;
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      anchor = { x: event.clientX, width: widths[key] };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (anchor) resize(key, anchor.width + dir() * (event.clientX - anchor.x));
    });
    handle.addEventListener("lostpointercapture", () => { anchor = null; });
    handle.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      resize(key, widths[key] + (event.key === "ArrowRight" ? 12 : -12) * dir());
    });
    th.append(controls, handle);
    resize(key, widths[key]);
  }

  placeColumns(table.querySelector("colgroup"));
  placeColumns(headingRow);
  window.addEventListener("storage", event => {
    if (event.key === layoutKey && !columnDrag) applyOrder(readOrder(event.newValue));
  });

  function clearColumnDrag() {
    if (!columnDrag) return;
    columnDrag.source.removeAttribute("data-col-dragging");
    columnDrag.target?.removeAttribute("data-col-drop");
    columnDrag = null;
  }

  function dropAfter(event, th) {
    const box = th.getBoundingClientRect();
    return rtl() ? event.clientX < box.left + box.width / 2 : event.clientX >= box.left + box.width / 2;
  }

  headingRow.addEventListener("pointerdown", event => {
    const handle = event.target.closest("[data-column-drag]");
    if (!handle || event.button !== 0 || !event.isPrimary || columnDrag) return;
    columnDrag = { handle, source: handle.closest("th[data-column]"), id: event.pointerId, x: event.clientX, y: event.clientY };
    handle.setPointerCapture(event.pointerId);
  });
  headingRow.addEventListener("pointermove", event => {
    const drag = columnDrag;
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return;
      drag.moved = true;
      view.closeMenu();
      drag.source.setAttribute("data-col-dragging", "");
    }
    event.preventDefault();
    const region = table.parentElement;
    const box = region.getBoundingClientRect();
    if (event.clientY >= box.top && event.clientY <= box.bottom && region.scrollWidth > region.clientWidth) {
      if (event.clientX >= box.left && event.clientX <= box.left + 20) region.scrollBy(-12, 0);
      else if (event.clientX <= box.right && event.clientX >= box.right - 20) region.scrollBy(12, 0);
    }
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("th[data-column]");
    const destination = target && target !== drag.source && headingRow.contains(target) ? target : null;
    if (drag.target !== destination) drag.target?.removeAttribute("data-col-drop");
    drag.target = destination;
    if (destination) destination.dataset.colDrop = dropAfter(event, destination) ? "after" : "before";
  });
  headingRow.addEventListener("pointerup", event => {
    const drag = columnDrag;
    if (!drag || event.pointerId !== drag.id) return;
    clearColumnDrag();
    if (!drag.moved) return;
    suppressedDragClick = { handle: drag.handle, until: performance.now() + 300 };
    if (drag.target) reorderColumn(drag.source.dataset.column, drag.target.dataset.column, dropAfter(event, drag.target));
  });
  headingRow.addEventListener("pointercancel", clearColumnDrag);
  headingRow.addEventListener("lostpointercapture", clearColumnDrag);

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
    const entries = selectedForDetails(askPermission);
    if (!entries.length) return;
    const origins = [...new Set(entries.map(entry => entry.permissionOrigin).filter(Boolean))];
    const controller = new AbortController();
    probe = controller;
    updateSelection();
    try {
      if (askPermission && !await permissions(origins)) {
        if (!controller.signal.aborted && selectedForDetails(true).length) notify("permissionDeclined");
        return;
      }
      if (controller.signal.aborted) return;
      if (askPermission) notify("fetchingDetails");
      let index = 0;
      let failed = 0;
      await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
        while (index < entries.length && !controller.signal.aborted) {
          const entry = entries[index++];
          const result = await send({ type: "soft98:download-details", url: entry.url }).catch(() => null);
          if (controller.signal.aborted) return;
          entry.probeStatus = result?.status || "unavailable";
          entry.permissionOrigin = result?.origin;
          if (entry.probeStatus === "ok") {
            entry.size = result.size;
            entry.date = result.date;
            entry.mime = result.mime;
            entry.type = result.type || entry.type;
          } else if (entry.probeStatus !== "permission") {
            failed++;
          }
        }
      }));
      if (!controller.signal.aborted) {
        render();
        if (selectedForDetails(true).length) notify("detailsNeedAccess");
        else if (askPermission || failed) notify(failed ? "detailsPartial" : "detailsDone", { count: failed });
      }
    } catch (_error) {
      if (askPermission && !controller.signal.aborted && selectedForDetails(true).length) notify("permissionDeclined");
    }
    finally {
      if (probe === controller) probe = null;
      updateSelection();
      if ([...selected].some((url) => !candidates.get(url)?.probeStatus)) scheduleDetails();
    }
  }

  const manual = () => {
    const url = normalize($("import-url").value);
    if (!url) return notify("invalid-url");
    $("import-url").value = "";
    append([url]);
    notify("");
  };
  function setSelected(url, checked) {
    if (!checked) selected.delete(url);
    else if (selected.size < MAX_BATCH) selected.add(url);
    else notify("invalid-batch");
    updateSelection();
    scheduleDetails();
  }

  function tableMenu(event) {
    const th = event.target.closest("th[data-column]");
    if (th) return columnMenu(event, th);
    const row = event.target.closest("tr[data-url]");
    const url = row?.dataset.url;
    const items = [];
    if (url) {
      const checked = selected.has(url);
      items.push({ label: checked ? "deselectLink" : "selectLink", icon: checked ? "square" : "square-check", run: () => setSelected(url, !checked) },
        { label: "copyLink", icon: "clipboard", group: "links", run: () => copyLink(url) },
        { label: "openLink", icon: "external-link", group: "links", run: () => externalLink(url) });
    }
    for (const [id, label, icon] of [["select-import", "selectVisible", "square-check"], ["clear-import", "deselectAll", "square"], ["probe-import", "allowDetails", "lock-open"]]) {
      const button = $(id);
      if (!button.hidden && !button.disabled) items.push({ label, icon, group: "table", run: () => button.click() });
    }
    view.showMenu(event, items, row?.querySelector("input") || event.target.closest("button") || dialog.querySelector(".import-grid"));
  }

  const grid = dialog.querySelector(".import-grid");
  grid.addEventListener("contextmenu", tableMenu);
  grid.addEventListener("keydown", event => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) tableMenu(event);
  });
  document.addEventListener("paste", (event) => {
    if (document.querySelector("#guide[open]") || event.target.matches?.("input:not(#import-url),[contenteditable]") || !event.clipboardData) return;
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
  $("close-import").addEventListener("click", view.closeDialog);
  $("save-options").addEventListener("click", (event) => {
    const toggle = event.currentTarget;
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    $("save-fields").inert = !open;
  });
  $("add-url").addEventListener("click", manual);
  $("import-url").addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); manual(); }
  });
  $("import-search").addEventListener("input", render);
  $("import-type").addEventListener("change", render);
  accessButton.addEventListener("click", () => { void fetchDetails(true); });
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
    setSelected(value, checked);
  });
  $("import-links").addEventListener("click", event => {
    if (event.target.closest("input,button,a,label") || event.defaultPrevented) return;
    const row = event.target.closest("tr[data-url]");
    if (!row || row.inert) return;
    const selection = getSelection();
    if (selection && !selection.isCollapsed && row.contains(selection.anchorNode)) return;
    setSelected(row.dataset.url, !selected.has(row.dataset.url));
  });
  dialog.addEventListener("close", () => { clearTimeout(autoTimer); probe?.abort(); clearColumnDrag(); });
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
      view.closeDialog();
    } else notify("importFailed");
    render();
  });
  for (const [id, key, icon] of [
    ["open-import", "importOpen", "plus"], ["add-url", "addLink", "plus"], ["paste-links", "pasteLinks", "clipboard"],
    ["choose-file", "chooseFile", "file-upload"], ["probe-import", "allowDetails", "lock-open"], ["add", "add", "download"],
    ["save-options", "saveOptions", "chevron-down"],
  ]) buttonContent($(id), key, icon);
  buttonContent($("close-import"), "close", "x");
  $("close-import").setAttribute("aria-label", text("close"));
  $("import-type").setAttribute("aria-label", text("allTypes"));
  $("check-column").setAttribute("aria-label", text("selection"));
  $("import-search").placeholder = text("search");
  render();
  return { append, refreshDates, setDirection(value) {
    clearColumnDrag();
    table.dir = grid.dir = value;
  }, expired: () => notify("importExpired") };
}
