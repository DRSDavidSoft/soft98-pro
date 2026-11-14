const Soft98DownloadQueue = (() => {
  "use strict";

  const STORAGE_KEY = "soft98DownloadQueue";
  const CHANNEL = "soft98:downloads";
  const MAX_JOBS = 160;
  const MAX_BATCH = 30;
  const MAX_PARALLEL = 6;
  const ACTIVE = new Set(["starting", "resuming", "downloading"]);
  const TERMINAL = new Set(["complete", "canceled", "interrupted", "missing", "review"]);

  function fail(code) {
    throw Object.assign(new Error(code), { queueCode: code });
  }

  function directUrl(input) {
    if (typeof input !== "string") fail("invalid-url");
    const value = input.trim();
    const authority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1];
    if (!authority || authority.includes("@") || value.length > 4096 || /[\s\\\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value)) fail("invalid-url");
    let url;
    try { url = new URL(value); } catch (_error) { fail("invalid-url"); }
    if (!url.hostname || url.username || url.password) fail("invalid-url");
    url.hash = "";
    if (url.href.length > 4096) fail("invalid-url");
    return url.href;
  }

  function relativeFilename(input) {
    if (input === undefined || input === "") return "";
    if (typeof input !== "string" || input.length > 240 || /[\\:*?"<>|\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(input)) fail("invalid-path");
    for (const component of input.split("/")) {
      if (!component || /^[.\s]|[.\s]$/u.test(component) || /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\s*\.|$)/i.test(component)) fail("invalid-path");
    }
    return input;
  }

  function errorCode(error) {
    const message = error && error.message;
    return typeof message === "string" && /^[A-Z]+(?:_[A-Z0-9]+)+$/.test(message) && message.length < 64 ? message : "native-error";
  }

  function trustedSender(sender, extensionId, pageUrl) {
    return Boolean(sender && sender.id === extensionId && sender.url === pageUrl &&
      (sender.frameId === undefined || sender.frameId === 0) && !sender.incognito && !sender.tab?.incognito);
  }

  function applyNative(job, item) {
    if (!item) {
      if (!TERMINAL.has(job.status)) Object.assign(job, { status: "missing", error: "missing", resumable: false });
      job.resumable = false;
      delete job.browserId;
      job.exists = false;
      return;
    }
    job.name = String(item.filename || "").split(/[/\\]/).pop().slice(0, 255);
    job.bytes = Math.max(0, item.bytesReceived || 0);
    job.total = item.totalBytes >= 0 ? item.totalBytes : null;
    job.exists = item.exists === true;
    job.resumable = item.canResume === true;
    job.error = "";
    const resumeQueued = job.status === "resume-queued" && job.resumable;
    if (item.state === "complete") {
      if (job.total === null && item.fileSize >= 0) job.total = item.fileSize;
      if (job.total !== null) job.bytes = job.total;
      const html = /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(item.mime || "");
      job.status = html ? "review" : "complete";
      job.error = html ? "html-response" : "";
    } else if (item.paused) {
      // Firefox reports a paused transfer as interrupted with USER_CANCELED.
      job.status = resumeQueued ? "resume-queued" : "paused";
    } else if (item.state === "interrupted") {
      job.status = item.error === "USER_CANCELED" ? "canceled" : resumeQueued ? "resume-queued" : "interrupted";
      job.error = errorCode({ message: item.error });
    } else {
      job.status = "downloading";
    }
  }

  function create({ storage, downloads, extensionId, now = Date.now, makeId = () => crypto.randomUUID() }) {
    let state;
    let persisted;
    let pending = Promise.resolve();
    const starting = new Set();
    const resuming = new Map();

    function serial(task) {
      const result = pending.then(task);
      pending = result.catch(() => {});
      return result;
    }

    async function load() {
      if (state) return;
      const saved = await storage.read();
      state = saved?.version === 1 && Array.isArray(saved.jobs) ? saved : { version: 1, limit: 3, held: false, jobs: [] };
    }

    async function save() {
      const snapshot = { ...state, jobs: state.jobs.map((job) => {
        if (TERMINAL.has(job.status)) return job;
        const { bytes, total, ...entry } = job;
        return entry;
      }) };
      const encoded = JSON.stringify(snapshot);
      if (persisted === encoded) return;
      await storage.write(JSON.parse(encoded));
      persisted = encoded;
    }

    function view() {
      return { limit: state.limit, maxParallel: MAX_PARALLEL, held: state.held, jobs: state.jobs.map((job) => ({ ...job })) };
    }

    async function refreshNative() {
      const tracked = new Set(state.jobs.map((job) => job.browserId));
      await Promise.all(state.jobs.map(async (job) => {
        if (Number.isInteger(job.browserId)) {
          if (job.status === "complete" || (job.status === "review" && job.error === "html-response")) return;
          const [item] = await downloads.search({ id: job.browserId });
          updateFromBrowser(job, item);
        } else if (job.status === "starting" && !starting.has(job.id)) {
          // If the worker stopped between launch and acknowledgement, never silently start it again.
          const matches = (await downloads.search({ url: job.url, startedAfter: new Date(job.attemptAt - 1).toISOString() })).filter((item) =>
            !item.incognito && item.byExtensionId === extensionId && item.url === job.url && !tracked.has(item.id));
          if (matches.length === 1) {
            job.browserId = matches[0].id;
            applyNative(job, matches[0]);
          } else Object.assign(job, { status: "review", error: "unknown-start" });
        }
      }));
    }

    function authorizedItem(item) {
      return item?.incognito || (item?.byExtensionId && item.byExtensionId !== extensionId) ? null : item;
    }

    function updateFromBrowser(job, value) {
      const item = authorizedItem(value);
      if (job.status === "resuming" && resuming.has(job.id) && item?.canResume && (item.paused || item.state === "interrupted")) return;
      applyNative(job, item);
    }

    function deferResult(queueId, options) {
      starting.add(queueId);
      Promise.resolve().then(() => downloads.download(options)).then((id) => serial(async () => {
        const job = state.jobs.find((entry) => entry.id === queueId);
        job.browserId = id;
        job.status = "downloading";
        await save();
        await refreshNative();
        await save();
        await advance();
      }), (error) => serial(async () => {
        const job = state.jobs.find((entry) => entry.id === queueId);
        const code = errorCode(error);
        Object.assign(job, { status: code === "USER_CANCELED" ? "canceled" : "interrupted", error: code, resumable: false });
        await save();
        await advance();
      })).catch(() => {}).finally(() => starting.delete(queueId));
    }

    function deferResume(queueId, browserId) {
      const attempt = {};
      resuming.set(queueId, attempt);
      const settle = (error) => serial(async () => {
        if (resuming.get(queueId) !== attempt) return;
        resuming.delete(queueId);
        await refreshNative();
        const job = state.jobs.find((entry) => entry.id === queueId && entry.browserId === browserId);
        if (error && job && !job.error && job.status === "paused") job.error = errorCode(error);
        await save();
        await advance();
      });
      // Firefox resolves resume on completion, not when the transfer begins.
      Promise.resolve().then(() => downloads.resume(browserId)).then(() => settle(), settle).catch(() => {});
    }

    async function advance() {
      if (state.held) return;
      let slots = state.limit - state.jobs.filter((job) => ACTIVE.has(job.status)).length;
      for (const job of state.jobs) {
        if (slots <= 0) break;
        if (job.status === "queued") {
          const options = { url: directUrl(job.url), conflictAction: "uniquify" };
          if (job.filename) options.filename = relativeFilename(job.filename);
          if (job.saveAs) options.saveAs = true;
          const previousAttempt = job.attemptAt;
          Object.assign(job, { status: "starting", attemptAt: now() });
          try { await save(); } catch (error) {
            Object.assign(job, { status: "queued", attemptAt: previousAttempt });
            throw error;
          }
          deferResult(job.id, options);
          slots -= 1;
        } else if (job.status === "resume-queued") {
          job.status = "resuming";
          try { await save(); } catch (error) {
            job.status = "resume-queued";
            throw error;
          }
          deferResume(job.id, job.browserId);
          slots -= 1;
        }
      }
    }

    function add(message) {
      const { urls, filename, saveAs } = message;
      if (!Array.isArray(urls) || !urls.length || urls.length > MAX_BATCH) fail("invalid-batch");
      const path = relativeFilename(filename);
      if (path && urls.length !== 1) fail("invalid-path");
      const normalized = [...new Set(urls.map(directUrl))];
      const existing = new Set(state.jobs.filter((job) => !TERMINAL.has(job.status) || job.resumable).map((job) => job.url));
      const newUrls = normalized.filter((url) => !existing.has(url));
      if (state.jobs.length + newUrls.length > MAX_JOBS) fail("queue-full");
      const createdAt = now();
      state.jobs.push(...newUrls.map((url) => ({ id: makeId(), url, filename: path, saveAs: saveAs === true, status: "queued", createdAt })));
      return { added: newUrls.length, duplicates: urls.length - newUrls.length };
    }

    async function itemAction(action, id) {
      const job = state.jobs.find((entry) => entry.id === id);
      if (!job) fail("not-found");
      const status = job.status;
      if (action === "remove" && TERMINAL.has(status) && !(status === "interrupted" && job.resumable)) {
        state.jobs.splice(state.jobs.indexOf(job), 1);
      } else if (action === "retry" && ["interrupted", "canceled", "missing", "review"].includes(status) && !job.resumable && job.error !== "html-response") {
        if (state.jobs.some((entry) => entry !== job && entry.url === job.url && (!TERMINAL.has(entry.status) || entry.resumable))) fail("duplicate");
        const { id, url, filename, saveAs, createdAt } = job;
        state.jobs.splice(state.jobs.indexOf(job), 1);
        state.jobs.push({ id, url, filename, saveAs, createdAt, status: "queued" });
      } else if (action === "pause" && (status === "queued" || status === "resume-queued")) {
        job.status = "paused";
      } else if (action === "pause" && status === "downloading") {
        await downloads.pause(job.browserId);
        const [item] = await downloads.search({ id: job.browserId });
        updateFromBrowser(job, item);
      } else if (action === "resume" && status === "paused" && !Number.isInteger(job.browserId)) {
        job.status = "queued";
      } else if (action === "resume" && ["paused", "interrupted"].includes(status) && job.resumable) {
        job.status = "resume-queued";
      } else if (action === "cancel" && (["queued", "resume-queued", "paused", "downloading"].includes(status) || (status === "interrupted" && job.resumable))) {
        if (Number.isInteger(job.browserId)) {
          try { await downloads.cancel(job.browserId); } catch (error) {
            const [item] = await downloads.search({ id: job.browserId });
            if (item?.state === "complete") {
              updateFromBrowser(job, item);
              return;
            }
            if (item && (item.canResume || item.state === "in_progress")) throw error;
          }
          const [item] = await downloads.search({ id: job.browserId });
          if (item?.state === "complete") {
            updateFromBrowser(job, item);
            return;
          }
          // Detach from canceled entries so browser history cannot restart them through this queue.
          delete job.browserId;
        }
        Object.assign(job, { status: "canceled", error: "", resumable: false });
      } else fail("not-allowed");
    }

    function request(message, nativeId) {
      return serial(async () => {
        await load();
        if (nativeId !== undefined && !state.jobs.some((job) => job.browserId === nativeId)) return;
        if (nativeId !== undefined) {
          // Completed entries are normally skipped by polling; inspect if their native history changes.
          const [item] = await downloads.search({ id: nativeId });
          const job = state.jobs.find((entry) => entry.browserId === nativeId);
          updateFromBrowser(job, item);
        }
        await refreshNative();
        const before = JSON.stringify(state);
        let result;
        const action = message.action;
        if (action === "add") result = add(message);
        else if (action === "configure") {
          if (message.limit !== undefined && (!Number.isInteger(message.limit) || message.limit < 1 || message.limit > MAX_PARALLEL)) fail("invalid-limit");
          if (message.limit !== undefined) state.limit = message.limit;
          if (typeof message.held === "boolean") state.held = message.held;
        } else if (action === "clear") {
          state.jobs = state.jobs.filter((job) => !TERMINAL.has(job.status) || (job.status === "interrupted" && job.resumable));
        } else if (action !== "list") await itemAction(action, message.id);
        try { await save(); } catch (error) {
          state = JSON.parse(before);
          throw error;
        }
        await advance();
        return { ...view(), ...result };
      });
    }

    return { request };
  }

  return { CHANNEL, STORAGE_KEY, directUrl, relativeFilename, trustedSender, create };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Soft98DownloadQueue;
