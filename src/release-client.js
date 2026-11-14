(function soft98ReleaseClient(root) {
  "use strict";

  const METADATA_URL = "https://github.com/DRSDavidSoft/soft98-pro/releases/latest/download/latest.json";
  const API_URL = "https://api.github.com/repos/DRSDavidSoft/soft98-pro/releases/latest";
  const RELEASES_URL = "https://github.com/DRSDavidSoft/soft98-pro/releases/latest";

  function parts(value) {
    return String(value || "").replace(/^v/i, "").split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  }

  function newer(candidate, installed) {
    const left = parts(candidate);
    const right = parts(installed);
    for (let index = 0; index < 3; index += 1) {
      if (left[index] !== right[index]) return left[index] > right[index];
    }
    return false;
  }

  function findAsset(release, matcher) {
    const asset = Array.isArray(release.assets) ? release.assets.find((entry) => matcher.test(entry.name || "")) : null;
    return asset ? { url: asset.browser_download_url, bytes: asset.size || 0 } : null;
  }

  function normalizeApiRelease(release) {
    return {
      schemaVersion: 1,
      version: String(release.tag_name || "").replace(/^v/i, ""),
      releaseUrl: release.html_url || RELEASES_URL,
      userscript: findAsset(release, /^soft98-pro\.user\.js$/i),
      chromium: findAsset(release, /^soft98-pro-chromium-[\w.+-]+\.zip$/i),
      firefox: findAsset(release, /^soft98-pro-firefox-[\w.+-]+\.zip$/i),
      source: "github-api",
    };
  }

  async function request(url) {
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`release endpoint returned ${response.status}`);
    return response.json();
  }

  async function latest(installedVersion) {
    try {
      return await request(`${METADATA_URL}?installed=${encodeURIComponent(installedVersion || "")}`);
    } catch (metadataError) {
      try {
        return normalizeApiRelease(await request(API_URL));
      } catch (apiError) {
        throw new Error(`release metadata unavailable: ${metadataError.message}; ${apiError.message}`);
      }
    }
  }

  const client = { latest, newer, normalizeApiRelease, metadataUrl: METADATA_URL, apiUrl: API_URL, releasesUrl: RELEASES_URL };
  root.Soft98Release = client;
  if (typeof module === "object" && module.exports) module.exports = client;
})(typeof globalThis === "object" ? globalThis : this);
