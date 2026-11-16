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

  function fileType(name) {
    if (!name) return "";
    const part = MULTIPART.exec(name);
    const suffix = part ? part[3] || part[4] || "" : /\.[a-z0-9]{1,8}$/i.exec(name)?.[0] || "";
    return part && !suffix ? "PART" : suffix.slice(1).toUpperCase();
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
    return { name, host, type: pathname.endsWith("/") ? "" : fileType(name), group };
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

  function declaredArticleLinks(raw, keys) {
    if (typeof raw !== "string" || raw.length > MAX_TEXT || !keys.length || keys.length > MAX_IMPORT ||
        keys.some(key => !key) || new Set(keys).size !== keys.length) return null;
    let records;
    try { records = JSON.parse(raw); } catch (_error) { return null; }
    if (!records || typeof records !== "object" || Array.isArray(records) || Object.keys(records).length !== keys.length) return null;
    let ordered;
    if (keys.every(key => Object.hasOwn(records, key))) {
      ordered = keys.map(key => records[key]);
    } else {
      // Soft98's numbered records are emitted in row order, even when platform sections leave gaps.
      const numbered = Object.keys(records).map(key => /^([A-Za-z_][\w-]*?)([1-9]\d{0,3})$/.exec(key));
      if (numbered.some(entry => !entry || entry[1] !== numbered[0][1])) return null;
      const order = numbered.map(([, , number]) => Number(number));
      if (order[0] !== 1 || order.some((number, index) => index > 0 && number <= order[index - 1])) return null;
      ordered = numbered.map(([key]) => records[key]);
    }
    const urls = ordered.map((record) => {
      if (!record || typeof record !== "object" || Array.isArray(record)) return "";
      const values = Object.values(record);
      if (values.length < 3 || values.length > 4 || values.some(value => typeof value !== "string")) return "";
      const schemes = values.filter(value => value === "https" || value === "http");
      const hosts = values.filter(value => /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z][a-z\d-]*$/i.test(value));
      const paths = values.filter(value => /^\/(?!\/)/.test(value) && !/[?#]/.test(value));
      if (schemes.length !== 1 || hosts.length !== 1 || paths.length !== 1) return "";
      const [scheme] = schemes, [host] = hosts, [path] = paths;
      const query = values.find(value => value !== scheme && value !== host && value !== path);
      if (values.length === 4 && (!query || !/^(?:\?[^?]+|https?:\/\/)/i.test(query))) return "";
      return normalize(`${scheme}://${host}${path}${query && (query.startsWith("?") ? query : "?" + query) || ""}`);
    });
    return urls.every(Boolean) ? urls : null;
  }

  function metadata(value) {
    if (!value || typeof value !== "object") return undefined;
    const size = Number.isSafeInteger(value.size) && value.size >= 0 ? value.size : undefined;
    const date = Number.isFinite(value.date) && Math.abs(value.date) <= 8.64e15 ? value.date : undefined;
    const mime = typeof value.mime === "string" && /^[a-z0-9.+-]+\/[a-z0-9.+_-]{1,75}$/i.test(value.mime) ? value.mime : undefined;
    const type = typeof value.type === "string" && /^[A-Z0-9]{1,8}$/.test(value.type) ? value.type : undefined;
    return size !== undefined || date !== undefined || mime || type ? { size, date, mime, type } : undefined;
  }

  return { MAX_BATCH, MAX_IMPORT, MAX_TEXT, normalize, describe, fileType, parse, headers, articleFile, declaredArticleLinks, metadata };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Soft98DownloadLinks;
