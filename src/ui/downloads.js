(function soft98DownloadsUi() {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const usesPromises = typeof browser !== "undefined";
  const catalog = __SOFT98_DOWNLOAD_MESSAGES__;
  const icons = __SOFT98_DOWNLOAD_ICONS__;
  const locale = [navigator.language, ...(navigator.languages || [])].some((lang) => /^fa(?:-|$)/i.test(lang)) ||
    Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Tehran" ? "fa" : "en";
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const latin = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 1 });
  const soundPercent = new Intl.NumberFormat(locale, { style: "percent" });
  let movingSoundSlider = false;
  let previewingSound = false;
  const durations = Object.fromEntries(["hour", "minute", "second"].map(unit =>
    [unit, new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short" })]));
  const calendarKey = "soft98DownloadDateCalendar";
  const directionKey = "soft98DownloadTableDirection";
  const dates = Soft98DownloadView.dates(locale, text);
  const states = {
    active: new Set(["starting", "resuming", "downloading"]),
    waiting: new Set(["queued", "resume-queued", "paused"]),
    finished: new Set(["complete", "interrupted", "canceled", "missing", "review"]),
  };
  const $ = (id) => document.getElementById(id);
  const rows = new Map();
  const groups = new Map();
  let focusedJob;
  const actionIcons = { pause: "player-pause", resume: "player-play", cancel: "x", retry: "rotate-clockwise", show: "folder-open", remove: "trash" };
  const paintIndicator = Soft98DownloadView.indicator(text);
  let state;
  let inFlight;
  let busy = false;
  let timer;
  let calendar = "auto";
  let calendarRevision = 0;
  let direction = "ltr";
  let directionRevision = 0;

  function text(key, values = {}) {
    return (catalog[locale][key] || catalog.en[key] || catalog[locale]["native-error"])
      .replace(/\{(\w+)\}/g, (_, name) => typeof values[name] === "number" ? number.format(values[name]) : values[name] ?? "");
  }

  function bytes(value) {
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    const unit = value > 0 ? Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024))) : 0;
    return `${latin.format(value / 1024 ** unit)} ${units[unit]}`;
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
    const complete = job.status === "complete";
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
    const ratio = !complete && known && job.total > 0 ? Math.min(received / job.total, 1) : null;
    const showTotal = known && !complete && received !== job.total;
    const estimated = job.estimatedEndAt > now ? (job.estimatedEndAt - now) / 1000 :
      known && sample?.speed > 0 ? (job.total - received) / sample.speed : null;
    const facts = {
      percent: ratio !== null ? percent.format(ratio) : "",
      bytes: known || active || received ? bytes(received) : "",
      total: showTotal ? bytes(job.total) : "",
      speed: active && sample?.speed > 0 ? `${bytes(sample.speed)}/s` : "",
      eta: active ? estimated !== null ? text("eta", { duration:duration(estimated) }) : text("etaUnknown") : "",
      elapsed: active && job.startedAt ? text("elapsed", { duration:duration((now - job.startedAt) / 1000) }) : "",
    };
    for (const node of nodes.metrics.children) {
      const key = node.dataset.metric;
      const value = facts[key];
      const field = node.querySelector("bdi") || node;
      if (field.textContent !== value) field.textContent = value;
      node.hidden = !value;
    }
    nodes.metrics.dataset.received = received;
    nodes.metrics.dataset.total = known ? job.total : "";
    nodes.metrics.title = showTotal ? text("bytes", { received:`${latin.format(received)} B`, total:`${latin.format(job.total)} B` }) :
      known ? `${latin.format(received)} B` : "";
  }

  function setIcon(node, icon) {
    if (node.dataset.icon === icon) return;
    node.dataset.icon = icon;
    const template = document.createElement("template");
    template.innerHTML = icons[icon];
    template.content.firstElementChild?.setAttribute("aria-hidden", "true");
    node.replaceChildren(template.content);
  }

  function buttonContent(node, label, icon) {
    if (node.dataset.label === label) return;
    node.dataset.label = label;
    node.replaceChildren();
    if (icon) {
      const mark = document.createElement("span");
      setIcon(mark, icon);
      node.append(mark);
    }
    if (!node.classList.contains("icon-button")) node.append(text(label));
  }

  function option(value, label) {
    return new Option(label, value);
  }

  function createRow(job) {
    const row = document.createElement("li");
    row.className = "job";
    row.dataset.id = job.id;
    row.innerHTML = '<div class="job-shell"><article class="job-content"><div class="job-head"><span class="file-mark" aria-hidden="true"></span><strong><bdi></bdi><button class="file-open" type="button" data-action="open" hidden></button></strong><span class="state"></span><button class="job-menu icon-button" type="button" aria-haspopup="menu"></button></div><div class="source"><bdi dir="ltr"></bdi><a target="_blank" rel="noopener noreferrer" hidden></a><span class="meta-type" hidden></span><bdi class="meta-size" dir="ltr" hidden></bdi><time class="meta-date" hidden></time><span class="meta-completed" hidden><span></span><time></time></span></div><progress hidden></progress><div class="job-footer"><div class="metrics"><bdi data-metric="percent" dir="ltr"></bdi><span data-metric="bytes"><bdi dir="ltr"></bdi></span><span data-metric="total"><span data-copy="total"></span><bdi dir="ltr"></bdi></span><bdi data-metric="speed" dir="ltr"></bdi><bdi data-metric="eta"></bdi><bdi data-metric="elapsed"></bdi></div><div class="actions"></div></div><small class="detail" hidden></small></article></div>';
    const nodes = Object.fromEntries(Object.entries({
      name: "strong > bdi", open: ".file-open", mark: ".file-mark", menu: ".job-menu", state: ".state",
      source: ".source > bdi:first-child", origin: ".source a", type: ".meta-type", size: ".meta-size", date: ".meta-date", completed: ".meta-completed time",
      progress: "progress", metrics: ".metrics", actions: ".actions", detail: ".detail",
    }).map(([key, selector]) => [key, row.querySelector(selector)]));
    nodes.row = row;
    nodes.open.dataset.id = job.id;
    nodes.completed.previousElementSibling.textContent = text("completedDate");
    nodes.metrics.querySelector("[data-copy]").textContent = text("total");
    nodes.menu.setAttribute("aria-label", text("actions"));
    buttonContent(nodes.menu, "actions", "dots");
    nodes.origin.textContent = text("originalPage");
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

  function renderRow(job, nodes, file) {
    const name = (job.name || job.filename?.split("/").pop() || file.name).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu, "");
    const status = job.status;
    nodes.row.dataset.state = status;
    if (nodes.name.textContent !== name) nodes.name.textContent = name;
    nodes.displayName = name;
    const canOpen = status === "complete" && job.exists && Number.isInteger(job.browserId);
    if (nodes.open.hidden === canOpen) {
      nodes.open.hidden = !canOpen;
      if (canOpen) nodes.open.append(nodes.name);
      else nodes.open.before(nodes.name);
    }
    nodes.open.title = text("open");
    const nameType = Soft98DownloadLinks.fileType(job.name || job.filename?.split("/").at(-1));
    const type = nameType || job.metadata?.type || (job.name && job.mime && Soft98DownloadView.fileIcon("", job.mime) !== "file" ? "" : file.type);
    const mime = job.mime || job.metadata?.mime;
    setIcon(nodes.mark, Soft98DownloadView.fileIcon(type, mime));
    nodes.state.textContent = text(job.manualStart ? "manual" : status);
    nodes.source.textContent = file.host;
    const source = Soft98DownloadLinks.normalize(job.source);
    nodes.origin.hidden = !source;
    if (source) nodes.origin.href = source;
    else nodes.origin.removeAttribute("href");
    const meta = job.metadata;
    nodes.type.textContent = type || mime || "";
    nodes.size.textContent = meta?.size != null && meta.size !== job.total ? bytes(meta.size) : "";
    paintRowDates(job, nodes);
    for (const field of [nodes.type, nodes.size]) field.hidden = !field.textContent;
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
      const { action } = button.dataset;
      const label = action === "resume" && job.manualStart ? "start" : action;
      const allowed = available[action];
      buttonContent(button, label, actionIcons[action]);
      button.hidden = !allowed;
      button.disabled = !allowed;
      button.setAttribute("aria-label", `${text(label)}: ${name}`);
    }
  }

  function paintRowDates(job, nodes) {
    dates.paint(nodes.date, job.metadata?.date, text("column_date"));
    nodes.completed.parentElement.hidden = !dates.paint(nodes.completed,
      job.status === "complete" ? job.endedAt : undefined, text("completedDate"));
  }

  function placeRows(container, nodes) {
    let next = container.firstElementChild;
    for (const node of nodes) {
      if (node === next) next = next.nextElementSibling;
      else container.insertBefore(node, next);
    }
  }

  function renderGroup(group, members) {
    let entry = groups.get(group.key);
    if (!entry) {
      const row = document.createElement("li");
      row.className = "job-group";
      row.innerHTML = '<div class="job-shell"><details open><summary><bdi></bdi><span class="group-facts"><small></small><bdi dir="ltr" class="group-size"></bdi><bdi dir="ltr" class="group-total"></bdi></span></summary><ul></ul></details></div>';
      entry = { row, title: row.querySelector("bdi"), status: row.querySelector("small"), size: row.querySelector(".group-size"), total: row.querySelector(".group-total"), list: row.querySelector("ul") };
      entry.title.textContent = group.name;
      groups.set(group.key, entry);
    }
    const ordered = [...members].sort((a, b) => a.part - b.part);
    placeRows(entry.list, ordered.map(({ nodes }) => nodes.row));
    const sizes = members.map(({ job }) => job.total ?? job.metadata?.size);
    const total = sizes.every(Number.isFinite) ? sizes.reduce((sum, size) => sum + size, 0) : null;
    const done = members.filter(({ job }) => job.status === "complete").length;
    const status = done === members.length ? text("groupComplete") : text("groupStatus", { count: members.length, done });
    const loaded = members.reduce((sum, { job }) => sum + (job.bytes || 0), 0);
    entry.status.textContent = status;
    entry.size.textContent = total === null ? "" : bytes(loaded);
    entry.total.textContent = total === null || total === loaded ? "" : bytes(total);
    entry.size.hidden = !entry.size.textContent;
    entry.total.hidden = !entry.total.textContent;
    Soft98DownloadView.setFiltered(entry.row, members.every(({ nodes }) => nodes.row.hasAttribute("data-filtered")));
    return entry.row;
  }

  function render() {
    const hold = $("hold");
    const hasQueueWork = state?.jobs.some(job => states.active.has(job.status) || job.status === "queued" || job.status === "resume-queued");
    if (!hasQueueWork && document.activeElement === hold) $("open-import").focus({ preventScroll: true });
    hold.hidden = hold.disabled = !hasQueueWork;
    $("limit").disabled = !state;
    $("native-notifications").disabled = !state;
    $("download-sounds").disabled = $("sound-volume").disabled = !state;
    if (!state) return;
    if ($("limit").options.length !== state.maxParallel)
      $("limit").replaceChildren(...Array.from({ length: state.maxParallel }, (_, index) => option(index + 1, number.format(index + 1))));
    $("limit").value = state.limit;
    selectControls.sync($("limit"));
    selectControls.sync($("filter"));
    $("native-notifications").checked = state.notifications !== false;
    $("download-sounds").checked = state.sounds?.enabled === true;
    if (!movingSoundSlider) $("sound-volume").value = state.sounds?.volume ?? Soft98DownloadAudio.DEFAULT_VOLUME;
    renderSoundLevel();
    $("clear").disabled = !state.jobs.some((job) => states.finished.has(job.status) && !(job.status === "interrupted" && job.resumable));
    buttonContent(hold, state.held ? "unhold" : "hold", state.held ? "player-play" : "player-pause");
    $("notice").textContent = state.held && hasQueueWork ? text("held") : "";
    const query = $("search").value.trim().toLowerCase();
    const filter = $("filter").value;
    const counts = { active: 0, waiting: 0, finished: 0 };
    const present = new Set();
    const presentGroups = new Map();
    const entries = [];
    let visible = 0;
    for (const job of state.jobs) {
      present.add(job.id);
      const group = Object.keys(states).find((key) => states[key].has(job.status));
      counts[group] += 1;
      const nodes = rows.get(job.id) || createRow(job);
      const file = Soft98DownloadLinks.describe(job.url);
      renderRow(job, nodes, file);
      const filtered = (filter !== "all" && filter !== group) || !`${nodes.displayName} ${nodes.source.textContent} ${job.source || ""}`.toLowerCase().includes(query);
      Soft98DownloadView.setFiltered(nodes.row, filtered);
      if (!filtered) visible += 1;
      if (!file.group) entries.push(nodes.row);
      else {
        const { key, part } = file.group;
        if (!presentGroups.has(key)) {
          presentGroups.set(key, []);
          entries.push(file.group);
        }
        presentGroups.get(key).push({ job, part, nodes });
      }
    }
    placeRows($("jobs"), entries.map((item) => item.key ? renderGroup(item, presentGroups.get(item.key)) : item));
    for (const [key, nodes] of groups) if (!presentGroups.has(key)) {
      nodes.row.remove();
      groups.delete(key);
    }
    for (const [id, nodes] of rows) if (!present.has(id)) {
      nodes.row.remove();
      rows.delete(id);
    }
    for (const [key, count] of Object.entries(counts)) {
      const value = $("count-" + key);
      value.textContent = count > 0 ? number.format(count) : "";
      value.parentElement.hidden = count === 0;
    }
    $("counts").hidden = !state.jobs.length;
    $("empty").textContent = visible ? "" : text(state.jobs.length ? "noMatches" : "empty");
    $("queue-empty").hidden = Boolean(visible);
    $("empty-action").hidden = Boolean(visible);
    buttonContent($("empty-action"), state.jobs.length ? "resetFilters" : "importOpen", state.jobs.length ? "rotate-clockwise" : "plus");
    paintIndicator(state.jobs);
    if (focusedJob) {
      const target = rows.get(focusedJob)?.row;
      focusedJob = null;
      if (target) {
        if (target.inert) {
          $("search").value = "";
          $("filter").value = "all";
          render();
        }
        const details = target.closest("details");
        if (details) details.open = true;
        target.setAttribute("data-highlight", "");
        target.scrollIntoView({ block: "center" });
      }
    }
  }

  function report(message, error = false) {
    $("feedback").textContent = message;
    $("feedback").dataset.error = String(error);
  }

  function initializeAppearance() {
    const panel = $("appearance-settings");
    function choice(group, name, value, label, icon) {
      const item = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.value = value;
      input.className = "visually-hidden";
      const face = document.createElement("span");
      const mark = document.createElement("span");
      setIcon(mark, icon);
      face.append(mark);
      if (name === "accentColor") {
        item.title = text(label);
        if (value !== "default") item.dataset.s98pAccent = value;
        face.className = "accent-sample";
        const title = document.createElement("span");
        title.className = "visually-hidden";
        title.textContent = text(label);
        face.append(title);
      } else face.append(text(label));
      item.append(input, face);
      $(group).append(item);
    }

    choice("appearance-theme", "darkDesign", "light", "themeLight", "sun");
    choice("appearance-theme", "darkDesign", "dark", "themeDark", "moon");
    for (const accent of Soft98Theme.accents) choice("appearance-accent", "accentColor", accent, "accent_" + accent, "check");

    let current = {}, pending = Promise.resolve(), revision = 0;
    const apply = (settings) => {
      const mode = settings.darkDesign === false ? "light" : "dark";
      for (const choice of panel.querySelectorAll("[name=darkDesign]")) choice.checked = !settings.rgbMode && choice.value === mode;
      const accent = Soft98Theme.accents.includes(settings.accentColor) ? settings.accentColor : "default";
      panel.querySelector('[name=accentColor][value=' + accent + ']').checked = true;
      $("appearance-rgb").checked = Boolean(settings.rgbMode);
      $("control-center-visible").checked = settings.controlCenter !== false;
      $("control-center-sound").checked = Boolean(settings.soundFeedback);
    };
    Soft98Theme.observe(settings => { current = settings; apply(settings); });
    panel.addEventListener("change", ({ target }) => {
      const { name, checked, value } = target;
      if (!["darkDesign", "accentColor", "rgbMode", "controlCenter", "soundFeedback"].includes(name) ||
          (target.type === "radio" && !checked)) return;
      const patch = name === "darkDesign" ? { darkDesign: value === "dark", rgbMode: false } :
        { [name]: name === "accentColor" ? value : checked };
      const change = ++revision;
      pending = pending.then(async () => {
        const key = Soft98Theme.key;
        const stored = await localStorageCall("get", key);
        await localStorageCall("set", { [key]: { ...stored?.[key], ...patch } });
        if (revision === change) report("");
      }).catch(() => {
        if (revision !== change) return;
        apply(current);
        report(text("appearanceSaveFailed"), true);
      });
    });
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
      const response = await send(message);
      if (!response?.ok) {
        report(text(response?.error || "native-error"), true);
        if (!state) $("queue-empty").hidden = true;
        render();
        return false;
      }
      state = response.state;
      render();
      if (action === "add") {
        const messages = [state.added ? text("added", state) : "", state.duplicates ? text("skipped", state) : ""].filter(Boolean);
        report(messages[0] || text("added", { added: 0 }));
        if (messages[1]) {
          const extra = document.createElement("span");
          extra.textContent = messages[1];
          $("feedback").append(extra);
        }
      }
      else if (action !== "list") report("");
      return true;
    } catch (_error) {
      report(text("native-error"), true);
      if (!state) $("queue-empty").hidden = true;
      return false;
    }
  }

  function send(message) {
    return usesPromises ? api.runtime.sendMessage(message) : new Promise((resolve, reject) => {
      api.runtime.sendMessage(message, (value) => {
        const error = api.runtime.lastError;
        if (error) reject(error);
        else resolve(value);
      });
    });
  }

  function localStorageCall(method, value) {
    const storage = api.storage.local;
    if (usesPromises) return storage[method](value);
    return new Promise((resolve, reject) => storage[method](value, result => {
      const error = api.runtime.lastError;
      if (error) reject(error);
      else resolve(result);
    }));
  }

  function refreshDates() {
    for (const job of state?.jobs || []) {
      const nodes = rows.get(job.id);
      if (nodes) paintRowDates(job, nodes);
    }
    review.refreshDates();
  }

  function applyCalendar(value) {
    calendar = dates.setCalendar(value);
    $("date-calendar").value = calendar;
    selectControls.sync($("date-calendar"));
    refreshDates();
  }

  async function initializeCalendar() {
    const revision = calendarRevision;
    try {
      const settings = await localStorageCall("get", calendarKey);
      if (calendarRevision === revision) applyCalendar(settings?.[calendarKey]);
    } catch (_error) {
      // Keep Auto available if storage is temporarily unavailable.
    } finally {
      $("date-calendar").disabled = false;
    }
  }

  function applyDirection(value) {
    direction = value === "rtl" ? "rtl" : "ltr";
    $("table-direction").value = direction;
    selectControls.sync($("table-direction"));
    review.setDirection(direction);
  }

  async function initializeDirection() {
    const revision = directionRevision;
    try {
      const settings = await localStorageCall("get", directionKey);
      if (directionRevision === revision) applyDirection(settings?.[directionKey]);
    } catch (_error) {} finally {
      $("table-direction").disabled = false;
    }
  }

  function refresh(immediate = false) {
    clearTimeout(timer);
    const pending = !state || state.jobs.some(job => states.active.has(job.status));
    if (immediate || !document.hidden || pending) timer = setTimeout(async () => {
      await request("list");
      if (!state || state.jobs.some((job) => states.active.has(job.status))) refresh();
    }, immediate ? 0 : document.hidden ? 1000 : 500);
  }

  function copyLink(url) {
    void navigator.clipboard.writeText(url).then(() => report(text("linkCopied")), () => report(text("copyFailed"), true));
  }

  function externalLink(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openNative(id) {
    if (usesPromises) return api.downloads.open(id);
    return new Promise((resolve, reject) => api.downloads.open(id, () => {
      const error = api.runtime.lastError;
      if (error) reject(error);
      else resolve();
    }));
  }

  async function runJobAction(action, id, button) {
    if (busy) return;
    if (action === "cancel" && !confirm(text("cancelConfirm"))) return;
    if (action === "show" || action === "open") {
      const job = state?.jobs.find(item => item.id === id && item.status === "complete" && item.exists && Number.isInteger(item.browserId));
      if (job) {
        try {
          if (action === "open") await openNative(job.browserId);
          else await api.downloads.show(job.browserId);
        } catch (_error) { report(text("no-file"), true); }
      }
    } else if (await request(action, { id })) {
      if (button?.hidden || (button && !button.isConnected)) {
        const next = rows.get(id)?.actions.querySelector("button:not([hidden])");
        (next || $("search")).focus();
      }
    }
  }

  function jobMenu(event) {
    const row = event.target.closest(".job");
    const job = row && state?.jobs.find(item => item.id === row.dataset.id);
    if (!job) return;
    const nodes = rows.get(job.id);
    const origin = Soft98DownloadLinks.normalize(job.source);
    const items = [];
    if (!nodes.open.hidden) items.push({ label: "open", icon: "external-link", run: () => runJobAction("open", job.id) });
    for (const button of nodes.actions.querySelectorAll("button:not([hidden])")) {
      const { action, label } = button.dataset;
      items.push({ label, icon: actionIcons[action], run: () => runJobAction(action, job.id, button) });
    }
    items.push({ label: "copyLink", icon: "clipboard", group: "links", run: () => copyLink(job.url) });
    if (origin) items.push({ label: "originalPage", icon: "link", group: "links", run: () => externalLink(origin) });
    view.showMenu(event, items, event.target.closest("a,button") || nodes.menu);
  }

  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "fa" ? "rtl" : "ltr";
  document.title = `${text("title")} | Soft98 Pro`;
  for (const node of document.querySelectorAll("[data-copy]")) node.textContent = text(node.dataset.copy);
  for (const key of ["all", ...Object.keys(states)]) $("filter").append(option(key, text(key)));
  for (const cue of Soft98DownloadAudio.cues) $("sound-cue").append(option(cue, text(`sound_${cue}`)));
  $("sound-cue").value = "complete";
  renderSoundLevel();
  $("search").placeholder = text("search");
  $("empty").textContent = text("loading");
  setIcon($("empty-icon"), "download");
  const selectControls = createDownloadSelects(setIcon);
  const view = Soft98DownloadView.create({
    text, buttonContent, closeSelect: selectControls.close,
    async importToken(token) {
      try {
        const response = await send({ type: "soft98:download-prefill", token });
        if (response?.urls?.length && location.hash === "#import") review.append(response.urls, response.source);
        else if (location.hash === "#import") review.expired();
      } catch (_error) { review.expired(); }
    },
    highlight(job) { focusedJob = job; if (state) render(); },
  });
  const review = createSoft98DownloadImport({ api, usesPromises, locale, text, bytes, buttonContent, setIcon, request, send, view, copyLink, externalLink, dates });
  for (const [value, label] of [["auto", "calendarAuto"], ["persian", "calendarPersian"], ["gregory", "calendarGregorian"]]) {
    $("date-calendar").append(option(value, text(label)));
  }
  $("date-calendar").addEventListener("change", async event => {
    const previous = calendar;
    const revision = ++calendarRevision;
    applyCalendar(event.target.value);
    try {
      await localStorageCall("set", { [calendarKey]: calendar });
    } catch (_error) {
      if (calendarRevision !== revision) return;
      applyCalendar(previous);
      report(text("calendarSaveFailed"), true);
    }
  });
  for (const [value, label] of [["ltr", "columnsLtr"], ["rtl", "columnsRtl"]]) {
    $("table-direction").append(option(value, text(label)));
  }
  $("table-direction").addEventListener("change", async event => {
    const previous = direction;
    const revision = ++directionRevision;
    applyDirection(event.target.value);
    try {
      await localStorageCall("set", { [directionKey]: direction });
    } catch (_error) {
      if (directionRevision !== revision) return;
      applyDirection(previous);
      report(text("directionSaveFailed"), true);
    }
  });
  $("manager-nav").setAttribute("aria-label", text("managerPages"));
  $("pro-settings-link").title = text("proSettings");
  buttonContent($("expand-manager"), "openFullManager", "external-link");
  $("expand-manager").title = text("openFullManager");
  $("expand-manager").setAttribute("aria-label", text("openFullManager"));
  buttonContent($("open-guide"), "help", "help-circle");
  $("open-guide").title = text("managerGuide");
  $("open-guide").setAttribute("aria-label", text("managerGuide"));
  for (const [id, label, icon] of [["queue-tab", "queue", "list-details"], ["settings-tab", "settings", "settings"], ["close-guide", "close", "x"]]) {
    buttonContent($(id), label, icon);
    if (id === "close-guide") $(id).setAttribute("aria-label", text(label));
  }
  buttonContent($("hold"), "hold", "player-pause");
  buttonContent($("clear"), "clear", "trash");
  buttonContent($("test-notification"), "testNotification", "bell");
  setIcon($("sound-icon"), "volume");
  buttonContent($("preview-sound"), "previewSound", "player-play");
  function renderSoundLevel() {
    const slider = $("sound-volume");
    const reading = soundPercent.format(Number(slider.value) / 100);
    $("sound-level").value = reading;
    slider.setAttribute("aria-valuetext", reading);
    $("preview-sound").disabled = previewingSound || Number(slider.value) === 0;
  }
  $("hold").addEventListener("click", event => {
    if (!event.currentTarget.hidden) void request("configure", { held: !state?.held });
  });
  $("limit").addEventListener("change", async () => {
    if (!await request("configure", { limit: Number($("limit").value) })) render();
  });
  $("native-notifications").addEventListener("change", async (event) => {
    if (!await request("configure", { notifications: event.target.checked })) render();
  });
  $("test-notification").addEventListener("click", async ({ currentTarget: button }) => {
    if (button.disabled) return;
    button.disabled = true;
    report(text("notificationSending"));
    try {
      const result = await send({ type: "soft98:test-download-notification" });
      report(text(result?.ok ? "notificationSent" : result?.error || "notificationFailed"), !result?.ok);
    } catch (_error) {
      report(text("notificationFailed"), true);
    } finally {
      button.disabled = false;
    }
  });
  $("clear").addEventListener("click", () => request("clear"));
  $("download-sounds").addEventListener("change", async (event) => {
    if (!await request("configure", { soundEnabled: event.target.checked })) render();
  });
  $("sound-volume").addEventListener("input", () => {
    movingSoundSlider = true;
    renderSoundLevel();
  });
  $("sound-volume").addEventListener("change", async (event) => {
    const volume = Number(event.target.value);
    movingSoundSlider = false;
    if (!await request("configure", { soundVolume: volume })) render();
  });
  $("preview-sound").addEventListener("click", async () => {
    previewingSound = true;
    renderSoundLevel();
    try {
      const { ok } = await send({ type: "soft98:test-download-sound", cue: $("sound-cue").value, volume: Number($("sound-volume").value) });
      report(text(ok ? "soundPlayed" : "soundFailed"), !ok);
    } catch {
      report(text("soundFailed"), true);
    } finally {
      previewingSound = false;
      renderSoundLevel();
    }
  });
  $("empty-action").addEventListener("click", () => {
    if (!state?.jobs.length) $("open-import").click();
    else {
      $("search").value = "";
      $("filter").value = "all";
      render();
      $("search").focus();
    }
  });
  $("search").addEventListener("input", render);
  $("filter").addEventListener("change", render);
  $("jobs").addEventListener("click", event => {
    if (event.target.closest(".job-menu")) return jobMenu(event);
    const button = event.target.closest("button[data-action]");
    if (button && !button.disabled && !button.hidden) void runJobAction(button.dataset.action, button.dataset.id, button);
  });
  $("jobs").addEventListener("contextmenu", jobMenu);
  $("jobs").addEventListener("keydown", event => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) jobMenu(event);
  });
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.soft98DownloadQueue) refresh(true);
    if (changes[calendarKey]) {
      calendarRevision++;
      if (changes[calendarKey].newValue !== calendar) applyCalendar(changes[calendarKey].newValue);
    }
    if (changes[directionKey]) {
      directionRevision++;
      if (changes[directionKey].newValue !== direction) applyDirection(changes[directionKey].newValue);
    }
  });
  document.addEventListener("visibilitychange", () => {
    refresh();
    if (!document.hidden) refreshDates();
  });
  setInterval(() => { if (!document.hidden) refreshDates(); }, 30000);
  async function initialize() {
    initializeAppearance();
    void initializeCalendar();
    void initializeDirection();
    view.route();
    await request("list");
    refresh();
  }
  initialize();
})();
