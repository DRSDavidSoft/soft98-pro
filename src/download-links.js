const Soft98DownloadLinks = (() => {
  "use strict";

  const MAX_BATCH = 30;
  const MAX_IMPORT = 120;
  const MAX_TEXT = 256 * 1024;
  const MULTIPART = /^(.*?)(?:[._ -]part[._ -]?(\d{1,5})(\.[a-z\d]{1,8})?|(\.(?:zip|7z|rar))\.(\d{3}))$/i;
  const FILE = /\.(?:zip|rar|7z|exe|msi|msix|appx|dmg|apk|iso|deb|rpm|tar|gz|xz|bz2|bin|img|pkg)$/i;

  function normalize(input) {
    if (typeof input !== "string") return "";
    const value = input.trim();
    const authority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1];
    if (!authority || authority.includes("@") || value.length > 4096 || /[\s\\\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value)) return "";
    try {
      const url = new URL(value);
      url.hash = "";
      return url.hostname && !url.username && !url.password && url.href.length <= 4096 ? url.href : "";
    } catch (_error) { return ""; }
  }

  function describe(url) {
    const { pathname, host } = new URL(url);
    const slash = pathname.lastIndexOf("/");
    let name = pathname.slice(slash + 1) || host;
    try { name = decodeURIComponent(name); } catch (_error) {}
    name = name.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu, "");
    const match = MULTIPART.exec(name);
    const suffix = match ? match[3] || match[4] || "" : /\.[a-z0-9]{1,8}$/i.exec(name)?.[0] || "";
    const group = match && match[1] ? { key: JSON.stringify([host, pathname.slice(0, slash), match[1], suffix.toLowerCase()]), name: match[1] + suffix, part: Number(match[2] || match[5]) } : null;
    return { name, host, type: group && !suffix ? "PART" : suffix.slice(1).toUpperCase(), group };
  }

  function parse(input) {
    const urls = new Set();
    let ignored = 0;
    const content = String(input).slice(0, MAX_TEXT);
    for (const match of content.matchAll(/https?:\/\/[^\s<>"`]+/giu)) {
      let [chunk] = match;
      if (content[match.index - 1] === "(" && chunk.endsWith(")")) chunk = chunk.slice(0, -1);
      const url = normalize(chunk);
      if (!url || urls.has(url) || urls.size >= MAX_IMPORT) ignored++;
      else urls.add(url);
    }
    return { urls: [...urls], ignored };
  }

  function headers(response) {
    const length = response.get("content-length");
    const size = /^\d+$/.test(length || "") ? Number(length) : null;
    const stamp = Date.parse(response.get("last-modified") || "");
    const mime = response.get("content-type")?.split(";")[0].trim().toLowerCase() || "";
    return { size: Number.isSafeInteger(size) ? size : null, date: Number.isFinite(stamp) ? stamp : null, mime: mime.slice(0, 100) };
  }

  function articleFile(url) {
    return url.protocol === "https:" && !url.port && (FILE.test(url.pathname) || Boolean(describe(url.href).group));
  }

  function metadata(value) {
    if (!value || typeof value !== "object") return undefined;
    const size = Number.isSafeInteger(value.size) && value.size >= 0 ? value.size : undefined;
    const date = Number.isFinite(value.date) && Math.abs(value.date) <= 8.64e15 ? value.date : undefined;
    const mime = typeof value.mime === "string" && /^[a-z0-9.+-]+\/[a-z0-9.+_-]{1,75}$/i.test(value.mime) ? value.mime : undefined;
    const type = typeof value.type === "string" && /^[A-Z0-9]{1,8}$/.test(value.type) ? value.type : undefined;
    return size !== undefined || date !== undefined || mime || type ? { size, date, mime, type } : undefined;
  }

  return { MAX_BATCH, MAX_IMPORT, MAX_TEXT, normalize, describe, parse, headers, articleFile, metadata };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Soft98DownloadLinks;
