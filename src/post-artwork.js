const Soft98PostArtwork = (() => {
  "use strict";

  const CACHE_KEY = "soft98-pro.post-artwork.v1";
  const MAX_ENTRIES = 128;
  const MAX_BYTES = 640 * 1024;
  const MAX_FETCHES = 2;
  const REQUEST_SPACING = 450;
  const WEEK = 7 * 86400000;
  const RETRY = 15 * 60000;

  function destination(value, origin) {
    try {
      const url = new URL(value, origin);
      if (!/^https?:$/.test(url.protocol) || url.origin !== origin || url.username || url.password ||
          !/\/\d+-[^/]+\.html$/i.test(url.pathname)) return "";
      return url.origin + url.pathname;
    } catch { return ""; }
  }

  function imageUrl(value, articleUrl) {
    if (!value?.trim()) return "";
    try {
      const url = new URL(value, articleUrl);
      const trustedOrigin = url.origin === new URL(articleUrl).origin ||
        (url.protocol === "https:" && !url.port && url.hostname.endsWith(".soft98.ir"));
      return trustedOrigin && /^https?:$/.test(url.protocol) && !url.username && !url.password &&
        /\.(?:jpe?g|png|webp|avif|gif|svg)$/i.test(url.pathname) ? url.href : "";
    } catch { return ""; }
  }

  function extract(document, html, articleUrl, complete) {
    // Template contents are inert: no scripts, frames, or incidental images are loaded.
    const template = document.createElement("template");
    template.innerHTML = html;
    const { content } = template;
    const type = content.querySelector('meta[property="og:type"]')?.content;
    const article = complete && content.querySelector("main article, article");
    if (type && type !== "article") return "";
    if (type === "article" || article) {
      for (const meta of content.querySelectorAll('meta[property="og:image"],meta[property="og:image:secure_url"],meta[property="twitter:image"],meta[name="twitter:image"]')) {
        const image = imageUrl(meta.content, articleUrl);
        if (image) return image;
      }
    }
    if (!article) return "";
    for (const image of article.querySelectorAll('link[itemprop="image"],img[itemprop="image"],header img')) {
      const url = imageUrl(image.getAttribute("data-src") || image.getAttribute("src") || image.getAttribute("href"), articleUrl);
      if (url) return url;
    }
    return "";
  }

  async function fetchArtwork(url, fetchPage, document) {
    try {
      const response = await fetchPage(url, { credentials: "omit", mode: "same-origin", signal: AbortSignal.timeout(6000) });
      if (response.status === 429 || response.status === 503) {
        const header = response.headers.get("Retry-After");
        const delay = header && (/^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now());
        if (response.body) void response.body.cancel().catch(() => {});
        return { delay: delay > 0 ? Math.max(1000, delay) : 15000 };
      }
      if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("text/html")) return "";
      const articleUrl = response.url || url;
      if (!destination(articleUrl, new URL(url).origin)) return "";
      const reader = response.body.getReader();
      try {
        const decoder = new TextDecoder();
        let html = "";
        let bytes = 0;
        let inspectedHead = false;
        while (bytes < MAX_BYTES) {
          const { value, done } = await reader.read();
          if (done) return extract(document, html + decoder.decode(), articleUrl, true);
          const chunk = value.subarray(0, MAX_BYTES - bytes);
          bytes += chunk.byteLength;
          html += decoder.decode(chunk, { stream: true });
          if (!inspectedHead) {
            const end = /<\/head\s*>/i.exec(html);
            if (!end) continue;
            inspectedHead = true;
            const image = extract(document, html.slice(0, end.index), articleUrl, false);
            if (image) return image;
          }
        }
        return extract(document, html, articleUrl, true);
      } finally { await reader.cancel().catch(() => {}); }
    } catch { return ""; }
  }

  function create({ fetchPage, document, storage, origin, now = Date.now }) {
    const memory = new Map();
    const inFlight = new Map();
    const waiting = [];
    let active = 0;
    let nextRequestAt = 0;
    let timer;

    function read() {
      try { return JSON.parse(storage()?.getItem(CACHE_KEY)) || {}; } catch { return {}; }
    }

    function remember(url, image) {
      const entry = { image, expires: now() + (image ? WEEK : RETRY) };
      memory.set(url, entry);
      if (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value);
      try {
        const saved = { ...read(), [url]: entry };
        const entries = Object.entries(saved).filter(([key, value]) => destination(key, origin) && value?.expires > now());
        entries.sort((a, b) => b[1].expires - a[1].expires);
        storage()?.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(0, MAX_ENTRIES))));
      } catch { /* Private or restricted storage: keep the in-memory cache. */ }
    }

    function advance() {
      clearTimeout(timer);
      while (active < MAX_FETCHES && waiting.length) {
        const delay = nextRequestAt - now();
        if (delay > 60000) {
          for (const { url, resolve } of waiting.splice(0)) {
            inFlight.delete(url);
            resolve("");
          }
          return;
        }
        if (delay > 0) {
          timer = setTimeout(advance, delay);
          return;
        }
        nextRequestAt = now() + REQUEST_SPACING;
        const entry = waiting.shift();
        const { url, resolve } = entry;
        active++;
        fetchArtwork(url, fetchPage, document).then((image) => {
          if (image?.delay) {
            nextRequestAt = Math.max(nextRequestAt, now() + image.delay);
            // Retry a visible row once. A throttled origin must not turn into a page full of stale failures.
            if (!entry.retried && image.delay <= 60000) {
              entry.retried = true;
              waiting.unshift(entry);
              return;
            }
            image = "";
          } else remember(url, image);
          inFlight.delete(url);
          resolve(image);
        }).finally(() => { active--; advance(); });
      }
    }

    function get(value) {
      const url = destination(value, origin);
      if (!url || !fetchPage) return Promise.resolve("");
      if (inFlight.has(url)) return inFlight.get(url);
      const cached = memory.get(url) ?? read()[url];
      if (cached?.expires > now() && typeof cached.image === "string") return Promise.resolve(imageUrl(cached.image, url));
      const result = new Promise((resolve) => waiting.push({ url, resolve }));
      inFlight.set(url, result);
      advance();
      return result;
    }

    return { get, unavailable: (url) => { if (destination(url, origin)) remember(url, ""); } };
  }

  return { destination, imageUrl, create };
})();
