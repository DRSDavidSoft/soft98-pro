(function soft98HeaderQueue() {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const { catalog, icons } = Soft98DownloadCatalog;
  const locale = [navigator.language, ...(navigator.languages || [])].some(lang => /^fa(?:-|$)/i.test(lang)) ||
    Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Tehran" ? "fa" : "en";
  const text = (key, values = {}) => (catalog[locale][key] || catalog.en[key] || "")
    .replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
  const $ = (id) => document.getElementById(id);
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 1 });
  const units = Object.fromEntries(["hour", "minute", "second"].map(unit =>
    [unit, new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short" })]));
  const bytes = Soft98DownloadView.fileBytes;
  const rule = /^[a-f0-9-]{36}$/i;
  const rows = new Map();
  let timer, pending = false, dirty = false, rendered = false;

  function icon(node, name) {
    if (node.dataset.icon === name) return;
    node.dataset.icon = name;
    node.innerHTML = icons[name] || "";
    node.firstElementChild?.setAttribute("aria-hidden", "true");
  }

  function update(node, value) {
    if (node.textContent !== value) node.textContent = value;
    node.hidden = !value;
  }

  function remaining(stamp) {
    const seconds = Math.ceil((stamp - Date.now()) / 1000);
    if (!(seconds > 0)) return "";
    const [unit, divisor] = seconds >= 3600 ? ["hour", 3600] : seconds >= 60 ? ["minute", 60] : ["second", 1];
    return text("eta", { duration: units[unit].format(Math.ceil(seconds / divisor)) });
  }

  function row(id) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.className = "row";
    link.href = "downloads.html#job=" + id;
    link.target = "_blank";
    link.rel = "noopener";
    link.innerHTML = '<span class="file-mark" aria-hidden="true"></span><span class="row-copy"><span class="row-name"><bdi></bdi></span>' +
      '<span class="facts"><span class="transfer-state"></span><bdi></bdi><bdi></bdi><span></span></span><progress></progress></span><span aria-hidden="true"></span>';
    icon(link.lastElementChild, "chevron-right");
    item.append(link);
    return { item, mark: link.firstElementChild, name: link.querySelector(".row-name bdi"), progress: link.querySelector("progress"),
      facts: [...link.querySelector(".facts").children] };
  }

  function render(snapshot) {
    if (!Array.isArray(snapshot?.items)) {
      if (!rendered) update($("status"), text("queueUnavailable"));
      return;
    }
    rendered = true;
    for (const node of $("counts").children) {
      const count = snapshot.counts[node.dataset.count];
      node.hidden = !count;
      node.firstElementChild.textContent = count ? number.format(count) : "";
    }
    $("held").hidden = !snapshot.held;
    if (!snapshot.items.length) {
      const mark = document.createElement("span");
      icon(mark, "download");
      $("status").replaceChildren(mark, text("empty"));
    }
    $("status").hidden = snapshot.items.length > 0;
    const list = $("items");
    const present = new Set();
    let next = list.firstElementChild;
    for (const info of snapshot.items) {
      if (!rule.test(info.id)) continue;
      let nodes = rows.get(info.id);
      if (!nodes) { nodes = row(info.id); rows.set(info.id, nodes); }
      present.add(info.id);
      const active = info.group === "active";
      const done = info.status === "complete";
      const ratio = active && info.total > 0 ? Math.min(1, (info.bytes || 0) / info.total) : null;
      nodes.item.dataset.group = info.group;
      nodes.item.dataset.state = info.status;
      update(nodes.name, info.name);
      if (nodes.name.title !== info.name) nodes.name.title = info.name;
      icon(nodes.mark, Soft98DownloadView.fileIcon(info.type, info.mime));
      update(nodes.facts[0], text(info.status));
      update(nodes.facts[1], ratio === null ? "" : percent.format(ratio));
      const received = info.bytes ?? (active ? 0 : null);
      update(nodes.facts[2], active && info.total > 0 && received !== info.total
        ? text("bytes", { received: bytes(received), total: bytes(info.total) })
        : Number.isFinite(received ?? info.total) ? bytes(done ? info.total ?? received : received ?? info.total) : "");
      update(nodes.facts[3], info.status === "downloading" ? remaining(info.eta) : "");
      nodes.progress.hidden = !active;
      nodes.progress.setAttribute("aria-label", text(info.status) + ": " + info.name);
      if (ratio === null) nodes.progress.removeAttribute("value");
      else nodes.progress.value = ratio;
      if (nodes.item === next) next = next.nextElementSibling;
      else list.insertBefore(nodes.item, next);
    }
    for (const [id, nodes] of rows) {
      if (!present.has(id)) { nodes.item.remove(); rows.delete(id); }
    }
  }

  function refresh() {
    clearTimeout(timer);
    if (document.hidden) return;
    if (pending) { dirty = true; return; }
    pending = true;
    const message = { type: "soft98:header-queue" };
    function finish(snapshot) {
      pending = false;
      if (document.hidden) return;
      render(snapshot);
      if (dirty) {
        dirty = false;
        timer = setTimeout(refresh, 120);
      } else if (snapshot?.counts?.active || !snapshot) timer = setTimeout(refresh, snapshot ? 900 : 3000);
    }
    try {
      if (typeof browser !== "undefined") api.runtime.sendMessage(message).then(finish, () => finish(null));
      else api.runtime.sendMessage(message, result => { finish(api.runtime.lastError ? null : result); });
    } catch { finish(null); }
  }

  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
  document.title = text("queue");
  for (const node of document.querySelectorAll("[data-copy]")) node.textContent = text(node.dataset.copy);
  icon($("header-mark"), "download");
  icon($("manager-mark"), "external-link");
  icon($("close-queue"), "x");
  $("close-queue").setAttribute("aria-label", text("close"));
  $("close-queue").title = text("close");
  for (const key of ["active", "waiting", "finished"]) {
    const count = document.createElement("span");
    count.dataset.count = key;
    count.hidden = true;
    count.append(document.createElement("strong"), text(key));
    $("counts").append(count);
  }
  const close = () => window.parent.postMessage("soft98-pro:header-queue-close", "*");
  $("close-queue").addEventListener("click", close);
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
  });
  document.addEventListener("visibilitychange", refresh);
  api.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.soft98DownloadQueue) refresh();
  });
  refresh();
})();
