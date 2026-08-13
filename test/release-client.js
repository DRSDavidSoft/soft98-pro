"use strict";

const assert = require("assert");
const client = require("../src/release-client.js");

async function main() {
  assert.equal(client.newer("1.2.0", "1.1.1"), true);
  assert.equal(client.newer("v1.1.1", "1.1.1"), false);
  assert.equal(client.newer("1.0.9", "1.1.0"), false);

  const apiPayload = {
    tag_name: "v1.2.0",
    html_url: "https://github.com/DRSDavidSoft/soft98-pro/releases/tag/v1.2.0",
    assets: [
      { name: "soft98-pro.user.js", browser_download_url: "userscript", size: 1 },
      { name: "soft98-pro-chromium-1.2.0.zip", browser_download_url: "chromium", size: 2 },
      { name: "soft98-pro-firefox-1.2.0.zip", browser_download_url: "firefox", size: 3 },
    ],
  };
  const normalized = client.normalizeApiRelease(apiPayload);

  assert.equal(normalized.version, "1.2.0");
  assert.equal(normalized.userscript.url, "userscript");
  assert.equal(normalized.chromium.url, "chromium");
  assert.equal(normalized.firefox.url, "firefox");
  assert.equal(normalized.source, "github-api");

  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url) => {
    requests.push(String(url));
    if (requests.length === 1) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => apiPayload };
  };
  try {
    const fallback = await client.latest("1.1.1");
    assert.equal(fallback.source, "github-api");
    assert.equal(fallback.version, "1.2.0");
    assert.match(requests[0], /latest\/download\/latest\.json/);
    assert.equal(requests[1], client.apiUrl);
  } finally {
    global.fetch = originalFetch;
  }

  console.log("Soft98 release client validation passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
