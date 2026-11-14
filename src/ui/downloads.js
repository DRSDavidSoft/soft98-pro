(function soft98DownloadsUi() {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const usesPromises = typeof browser !== "undefined";
  const catalog = __SOFT98_DOWNLOAD_MESSAGES__;
  const icons = __SOFT98_DOWNLOAD_ICONS__;
  const locale = [navigator.language, ...(navigator.languages || [])].some((lang) => /^fa(?:-|$)/i.test(lang)) ||
    Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Tehran" ? "fa" : "en";
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const durations = Object.fromEntries(["hour", "minute", "second"].map(unit =>
    [unit, new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short" })]));
  const states = {
    active: new Set(["starting", "resuming", "downloading"]),
    waiting: new Set(["queued", "resume-queued", "paused"]),
    finished: new Set(["complete", "interrupted", "canceled", "missing", "review"]),
  };
  const $ = (id) => document.getElementById(id);
  const rows = new Map();
  const actionIcons = { pause: "player-pause", resume: "player-play", cancel: "x", retry: "rotate-clockwise", show: "folder-open", remove: "trash" };
  let state;
  let inFlight;
  let busy = false;
  let timer;

  function text(key, values = {}) {
    return (catalog[locale][key] || catalog.en[key] || catalog[locale]["native-error"])
      .replace(/\{(\w+)\}/g, (_, name) => typeof values[name] === "number" ? number.format(values[name]) : values[name] ?? "");
  }

  function bytes(value) {
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    const unit = value > 0 ? Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024))) : 0;
    return `\u2066${number.format(value / 1024 ** unit)} ${units[unit]}\u2069`;
  }

  function duration(seconds) {
    const remaining = Math.ceil(Math.max(0, seconds));
    const parts = [];
    if (remaining >= 3600) parts.push(durations.hour.format(Math.floor(remaining / 3600)));
    if (remaining >= 60) parts.push(durations.minute.format(Math.floor(remaining % 3600 / 60)));
    if (remaining < 3600 && (remaining < 60 || remaining % 60)) parts.push(durations.second.format(remaining % 60));
    return parts.join(" ");
  }

  function updateMetrics(job, nodes) {
    const now = Date.now();
    const received = job.bytes || 0;
    const known = Number.isFinite(job.total) && job.total >= 0;
    const active = job.status === "downloading";
    let sample = nodes.sample;
    if (!active || !sample || sample.browserId !== job.browserId || received < sample.bytes) {
      const started = active && !sample && job.startedAt && now > job.startedAt && now - job.startedAt < 30000;
      sample = active ? { at: started ? job.startedAt : now, bytes: started ? 0 : received, browserId: job.browserId } : null;
    }
    if (sample && now - sample.at >= 250) {
      const rate = (received - sample.bytes) * 1000 / (now - sample.at);
      sample.speed = rate ? (sample.speed ? sample.speed * .55 + rate * .45 : rate) : 0;
      sample.at = now;
      sample.bytes = received;
    }
    nodes.sample = sample;
    const ratio = job.status === "complete" ? 1 : known && job.total > 0 ? Math.min(received / job.total, 1) : null;
    const estimated = job.estimatedEndAt > now ? (job.estimatedEndAt - now) / 1000 :
      known && sample?.speed > 0 ? (job.total - received) / sample.speed : null;
    const facts = {
      percent: ratio !== null ? percent.format(ratio) : "",
      bytes: known ? text("bytes", { received:bytes(received), total:bytes(job.total) }) : active || received ? bytes(received) : "",
      speed: active && sample?.speed > 0 ? text("speed", { rate:bytes(sample.speed) }) : "",
      eta: active ? estimated !== null ? text("eta", { duration:duration(estimated) }) : text("etaUnknown") : "",
      elapsed: job.startedAt ? text("elapsed", { duration:duration(((job.endedAt || now) - job.startedAt) / 1000) }) : "",
    };
    for (const node of nodes.metrics.children) {
      node.textContent = facts[node.dataset.metric];
      node.hidden = !node.textContent;
    }
    nodes.metrics.dataset.received = received;
    nodes.metrics.dataset.total = known ? job.total : "";
    nodes.metrics.title = known ? text("bytes", { received:`\u2066${number.format(received)} B\u2069`, total:`\u2066${number.format(job.total)} B\u2069` }) : "";
  }

  function buttonContent(node, label, icon) {
    if (node.dataset.label === label) return;
    node.dataset.label = label;
    node.replaceChildren();
    if (icon) {
      // Only bundled icon files are parsed; URLs and browser data are always rendered as text.
      const template = document.createElement("template");
      template.innerHTML = icons[icon];
      template.content.firstElementChild.setAttribute("aria-hidden", "true");
      node.append(template.content);
    }
    node.append(text(label));
  }

  function option(value, label) {
    return new Option(label, value);
  }

  function createRow(job) {
    const row = document.createElement("li");
    row.className = "job";
    row.innerHTML = '<div class="job-head"><strong><bdi></bdi></strong><span class="state"></span></div><div class="source"><bdi dir="ltr"></bdi></div><progress hidden></progress><div class="job-footer"><div class="metrics"><bdi data-metric="percent"></bdi><bdi data-metric="bytes"></bdi><bdi data-metric="speed"></bdi><bdi data-metric="eta"></bdi><bdi data-metric="elapsed"></bdi></div><div class="actions"></div></div><small class="detail" hidden></small>';
    const nodes = { row, name: row.querySelector("strong bdi"), state: row.querySelector(".state"), source: row.querySelector(".source bdi"), progress: row.querySelector("progress"), metrics: row.querySelector(".metrics"), actions: row.querySelector(".actions"), detail: row.querySelector(".detail") };
    for (const [action, icon] of Object.entries(actionIcons)) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.action = action;
      button.dataset.id = job.id;
      buttonContent(button, action, icon);
      nodes.actions.append(button);
    }
    rows.set(job.id, nodes);
    return nodes;
  }

  function renderRow(job, nodes) {
    const url = new URL(job.url);
    const segment = url.pathname.split("/").pop();
    let name = segment || url.hostname;
    try { name = decodeURIComponent(name); } catch (_error) {}
    name = (job.name || job.filename?.split("/").pop() || name).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu, "");
    const status = job.status;
    nodes.row.dataset.state = status;
    nodes.name.textContent = name;
    nodes.state.textContent = text(status);
    nodes.source.textContent = url.host;
    const received = job.bytes || 0;
    const known = Number.isFinite(job.total) && job.total >= 0;
    updateMetrics(job, nodes);
    nodes.progress.hidden = status !== "downloading";
    nodes.progress.setAttribute("aria-label", `${text(status)}: ${name}`);
    if (known && job.total > 0) {
      nodes.progress.max = job.total;
      nodes.progress.value = Math.min(received, job.total);
    } else nodes.progress.removeAttribute("value");
    const detail = job.error || (status === "paused" && Number.isInteger(job.browserId) && !job.resumable ? "not-resumable" : "");
    nodes.detail.hidden = !detail;
    nodes.detail.textContent = detail ? text(detail) : "";
    const available = {
      pause: ["queued", "resume-queued", "downloading"].includes(status),
      resume: (status === "paused" && (!Number.isInteger(job.browserId) || job.resumable)) || (status === "interrupted" && job.resumable),
      cancel: ["queued", "resume-queued", "paused", "downloading"].includes(status) || (status === "interrupted" && job.resumable),
      retry: ["canceled", "interrupted", "missing", "review"].includes(status) && !job.resumable && job.error !== "html-response",
      show: status === "complete" && job.exists && Number.isInteger(job.browserId),
      remove: states.finished.has(status) && !(status === "interrupted" && job.resumable),
    };
    for (const button of nodes.actions.children) {
      const allowed = available[button.dataset.action];
      button.hidden = !allowed;
      button.disabled = !allowed;
      button.setAttribute("aria-label", `${text(button.dataset.action)}: ${name}`);
    }
  }

  function render() {
    $("add").disabled = !state;
    $("hold").disabled = !state;
    $("limit").disabled = !state;
    if (!state) return;
    if ($("limit").options.length !== state.maxParallel) {
      for (let index = 1; index <= state.maxParallel; index += 1) $("limit").append(option(index, number.format(index)));
    }
    $("limit").value = state.limit;
    $("clear").disabled = !state.jobs.some((job) => states.finished.has(job.status) && !(job.status === "interrupted" && job.resumable));
    buttonContent($("hold"), state.held ? "unhold" : "hold", state.held ? "player-play" : "player-pause");
    $("notice").textContent = state.held ? text("held") : "";
    const query = $("search").value.trim().toLowerCase();
    const filter = $("filter").value;
    const counts = { active: 0, waiting: 0, finished: 0 };
    const present = new Set();
    let visible = 0;
    for (const job of state.jobs) {
      present.add(job.id);
      const group = Object.keys(states).find((key) => states[key].has(job.status));
      counts[group] += 1;
      const nodes = rows.get(job.id) || createRow(job);
      renderRow(job, nodes);
      nodes.row.hidden = (filter !== "all" && filter !== group) || !`${nodes.name.textContent} ${nodes.source.textContent}`.toLowerCase().includes(query);
      if (!nodes.row.hidden) visible += 1;
    }
    let previous = null;
    for (const job of state.jobs) {
      const { row } = rows.get(job.id);
      if ((previous ? previous.nextElementSibling : $("jobs").firstElementChild) !== row) $("jobs").insertBefore(row, previous ? previous.nextElementSibling : $("jobs").firstElementChild);
      previous = row;
    }
    for (const [id, nodes] of rows) if (!present.has(id)) {
      nodes.row.remove();
      rows.delete(id);
    }
    $("counts").textContent = text("counts", counts);
    $("empty").textContent = visible ? "" : text(state.jobs.length ? "noMatches" : "empty");
  }

  function report(message, error = false) {
    $("feedback").textContent = message;
    $("feedback").dataset.error = String(error);
  }

  async function request(action, payload = {}) {
    if (action === "list") return busy || inFlight ? false : fetchState(action, payload);
    if (busy) return false;
    busy = true;
    try {
      await inFlight;
      return await fetchState(action, payload);
    } finally { busy = false; }
  }

  async function fetchState(action, payload) {
    const operation = inFlight = exchange(action, payload);
    try { return await operation; } finally { inFlight = undefined; }
  }

  async function exchange(action, payload) {
    try {
      const message = { type: "soft98:downloads", action, ...payload };
      const response = usesPromises ? await api.runtime.sendMessage(message) : await new Promise((resolve, reject) => {
        api.runtime.sendMessage(message, (value) => {
          const error = api.runtime.lastError;
          if (error) reject(error);
          else resolve(value);
        });
      });
      if (!response?.ok) {
        report(text(response?.error || "native-error"), true);
        if (!state) $("empty").textContent = "";
        render();
        return false;
      }
      state = response.state;
      render();
      if (action === "add") report(text("added", state));
      else if (action !== "list") report("");
      return true;
    } catch (_error) {
      report(text("native-error"), true);
      if (!state) $("empty").textContent = "";
      return false;
    }
  }

  function refresh() {
    clearTimeout(timer);
    if (!document.hidden) timer = setTimeout(async () => {
      await request("list");
      if (!state || state.jobs.some((job) => states.active.has(job.status))) refresh();
    }, 500);
  }

  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
  document.title = `${text("title")} | Soft98 Pro`;
  for (const node of document.querySelectorAll("[data-copy]")) node.textContent = text(node.dataset.copy);
  for (const key of ["all", ...Object.keys(states)]) $("filter").append(option(key, text(key)));
  $("search").placeholder = text("search");
  $("empty").textContent = text("loading");
  buttonContent($("add"), "add", "plus");
  buttonContent($("hold"), "hold", "player-pause");
  buttonContent($("clear"), "clear", "trash");
  $("composer").addEventListener("submit", async (event) => {
    event.preventDefault();
    const urls = $("urls").value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    if (await request("add", { urls, filename: $("filename").value, saveAs: $("save-as").checked })) $("composer").reset();
  });
  $("hold").addEventListener("click", () => request("configure", { held: !state?.held }));
  $("limit").addEventListener("change", () => request("configure", { limit: Number($("limit").value) }));
  $("clear").addEventListener("click", () => request("clear"));
  $("search").addEventListener("input", render);
  $("filter").addEventListener("change", render);
  $("jobs").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || button.disabled || busy) return;
    const { action, id } = button.dataset;
    if (action === "cancel" && !confirm(text("cancelConfirm"))) return;
    if (action === "show") {
      const job = state.jobs.find((item) => item.id === id && item.status === "complete" && item.exists);
      if (job) {
        try { await api.downloads.show(job.browserId); } catch (_error) { report(text("no-file"), true); }
      }
    } else if (await request(action, { id })) {
      if (button.hidden || !button.isConnected) {
        const next = rows.get(id)?.actions.querySelector("button:not([hidden])");
        (next || $("search")).focus();
      }
    }
  });
  api.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.soft98DownloadQueue) refresh();
  });
  document.addEventListener("visibilitychange", refresh);
  async function initialize() {
    const token = /^#import=([a-f0-9-]{36})$/.exec(location.hash)?.[1];
    if (token) {
      try {
        const message = { type: "soft98:download-prefill", token };
        const response = usesPromises ? await api.runtime.sendMessage(message) : await new Promise((resolve) => {
          api.runtime.sendMessage(message, result => { void api.runtime.lastError; resolve(result); });
        });
        if (response?.url) {
          $("urls").value = response.url;
          $("urls").focus();
        } else report(text("importExpired"), true);
      } catch (_error) { report(text("importExpired"), true); }
      finally { history.replaceState(null, "", location.pathname); }
    }
    await request("list");
    refresh();
  }
  initialize();
})();
