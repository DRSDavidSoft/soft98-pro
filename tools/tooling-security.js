"use strict";

const SOFT98_ORIGINS = ["https://soft98.ir", "https://www.soft98.ir", "https://img.soft98.ir"];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 4;

function devToolsPageUrl(value, debugPort) {
  if (typeof value !== "string" || !Number.isInteger(debugPort) || debugPort < 1 || debugPort > 65535) {
    throw new Error("Invalid local DevTools endpoint");
  }
  const url = new URL(value);
  const page = /^\/devtools\/page\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
  if (url.protocol !== "ws:" || url.hostname !== "127.0.0.1" || Number(url.port || 80) !== debugPort ||
      url.username || url.password || url.search || url.hash || !page) {
    throw new Error("Invalid local DevTools endpoint");
  }
  const canonical = `ws://127.0.0.1:${debugPort}/devtools/page/${page[1]}`;
  // Reject aliases, encoded paths and URL-parser normalization before using a fixed loopback origin.
  if (value !== canonical) throw new Error("Invalid local DevTools endpoint");
  return canonical;
}

function soft98Url(value) {
  if (typeof value !== "string") throw new Error("Unsupported Soft98 destination");
  const url = new URL(value);
  const origin = SOFT98_ORIGINS.find(approved => approved === url.origin);
  if (url.protocol !== "https:" || url.port || url.username || url.password || !origin) {
    throw new Error("Unsupported Soft98 destination");
  }
  return `${origin}${url.pathname}${url.search}`;
}

async function fetchSoft98(value, fetchImpl = fetch) {
  let target = value;
  const signal = AbortSignal.timeout(15000);
  for (let redirects = 0; ; redirects++) {
    const url = soft98Url(target);
    const response = await fetchImpl(url, {
      redirect: "manual",
      signal,
      headers: { "user-agent": "Mozilla/5.0 Soft98AdBlockerProof" },
    });
    if (!REDIRECT_STATUSES.has(response.status)) return { response, url };
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (!location || redirects >= MAX_REDIRECTS) throw new Error("Invalid Soft98 redirect chain");
    target = new URL(location, url).href;
  }
}

function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtmlAttribute(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

module.exports = { devToolsPageUrl, soft98Url, fetchSoft98, jsonForScript, escapeHtmlAttribute };
