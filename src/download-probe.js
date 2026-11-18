const Soft98DownloadProbe = (() => {
  "use strict";

  function originPattern(url) {
    const { protocol, hostname } = new URL(url);
    return `${protocol}//${hostname}/*`;
  }

  function filenameType(value, url, links) {
    const extended = /(?:^|;)\s*filename\*\s*=\s*UTF-8'[^']*'([^;]+)/i.exec(value)?.[1];
    const simple = /(?:^|;)\s*filename\s*=\s*(?:"([^"]+)"|([^;]+))/i.exec(value);
    let name = simple?.[1] || simple?.[2];
    if (extended) {
      try { name = decodeURIComponent(extended.trim()); } catch (_error) {}
    }
    return links.fileType(name?.trim().split(/[/\\]/).pop()) || links.describe(url).type;
  }

  async function inspect(input, { allowed, fetchFile = fetch, links = Soft98DownloadLinks }) {
    const url = links.normalize(input);
    if (!url) return { status: "unavailable" };
    const origin = originPattern(url);
    if (!await allowed(origin)) return { status: "permission", origin };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    const options = { credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", signal: controller.signal };

    async function read(response) {
      const destination = links.normalize(response.url || url);
      if (!destination) return { status: "unavailable" };
      const host = originPattern(destination);
      if (host !== origin && !await allowed(host)) return { status: "permission", origin: host };
      const facts = links.headers(response.headers);
      const disposition = response.headers.get("content-disposition") || "";
      const html = /^(?:text\/html|application\/xhtml\+xml)$/.test(facts.mime);
      if (!response.ok || (html && !/^attachment\b/i.test(disposition))) return { status: "unavailable" };
      if (response.status === 206) {
        // Content-Length is the size of the returned slice, not of the file.
        const total = Number(/^bytes 0-0\/(\d+)$/i.exec(response.headers.get("content-range") || "")?.[1]);
        facts.size = Number.isSafeInteger(total) && total > 0 ? total : null;
      }
      const type = filenameType(disposition, destination, links);
      return { status: "ok", ...facts, type };
    }

    try {
      const response = await fetchFile(url, { ...options, method: "HEAD" }).catch(() => null);
      const head = response ? await read(response) : { status: "unavailable" };
      if (head.status === "permission" || (head.status === "ok" && head.size !== null && head.date !== null)) return head;
      if (controller.signal.aborted || (response && !response.ok && ![403, 405, 501].includes(response.status))) return head;
      if (response?.ok && head.status !== "ok") return head;
      const partial = await fetchFile(url, { ...options, method: "GET", headers: { Range: "bytes=0-0" } })
        .then(response => {
          // Stop immediately if the host ignores Range; never consume a download body.
          if (response.body) void response.body.cancel().catch(() => {});
          return read(response);
        }).catch(() => ({ status: "unavailable" }));
      if (partial.status !== "ok") return head.status === "ok" ? head : partial;
      return { status: "ok", size: partial.size ?? head.size ?? null, date: partial.date ?? head.date ?? null,
        mime: partial.mime || head.mime || "", type: partial.type || head.type || "" };
    } catch (_error) {
      return { status: "unavailable" };
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  async function planArticleDownloads(urls, maxMB, getDetails, timeoutMs = 7000, links = Soft98DownloadLinks) {
    if (!urls.length || urls.length > links.MAX_BATCH) return null;
    const limit = links.reviewLimit(maxMB) * 1000000;
    let next = 0, total = 0, stopped = false, timer;
    const results = Object.create(null);
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); });
    // Resolve as soon as any file forces review; do not start more probes in that case.
    let requireReview;
    const review = new Promise(resolve => { requireReview = () => { stopped = true; resolve(null); }; });
    const workers = Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
      while (!stopped && next < urls.length) {
        const url = urls[next++];
        const details = await getDetails(url).catch(() => null);
        if (stopped) return;
        if (details?.status !== "ok" || !Number.isSafeInteger(details.size) || details.size < 0 || details.size >= limit) return requireReview();
        total += details.size;
        if (total >= limit) return requireReview();
        results[url] = details;
      }
    }));
    try {
      return await Promise.race([workers.then(() => stopped ? null : results), timeout, review]);
    } finally {
      stopped = true;
      clearTimeout(timer);
    }
  }

  return { inspect, planArticleDownloads };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Soft98DownloadProbe;
