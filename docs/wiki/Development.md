<div align="center">

<a href="Development.md"><img src="../assets/badge-en.svg" alt="English" height="22"/></a>&nbsp;
<a href="fa/Development.md"><img src="../assets/badge-fa.svg" alt="فارسی" height="22"/></a>

</div>

---

# Development 🛠️

Install and validate locally:

```bash
npm ci
npm run ci
```

Build outputs:

- `soft98-pro.user.js`
- `dist/userscript/soft98-pro.user.js`
- `dist/chromium`
- `dist/firefox`
- `dist/packages/*.zip`
- `dist/release/latest.json`
- `dist/release/SHA256SUMS.txt`

The main runtime lives in `src/runtime.js`. Keep browser-extension and userscript behavior shared there unless a browser-specific bridge is required.

Maintain all English and Persian runtime, settings, diagnostics, taunt, and update copy in `src/messages.json`. The build requires identical locale keys and inlines the catalog into every JavaScript target.

The CI workflow validates and uploads packages for every pull request. Merging the active-development PR into `main` runs the release workflow, derives the version tag from `package.json`, rejects reuse of an existing version on another commit, attests the artifacts, and publishes packages, update metadata, and checksums to GitHub Releases. A matching tag push or manual dispatch can rerun the same release commit.

Extension update checks are shared through `src/release-client.js`. The client prefers the release asset `latest.json` and falls back to GitHub's Releases API, so upgrades from releases created before the metadata feed was introduced keep working.

PersianBlocker compatibility is represented by the narrow upstream snapshot in `test/fixtures/persianblocker-soft98.json`. Run `npm run sync:persianblocker` to refresh it after review. Scheduled CI runs `npm run check:persianblocker-upstream` and reports when Soft98-specific rules change. `test/persianblocker-compat.js` verifies the current warning against the packaged Chromium USER-origin and Firefox user-origin injection paths.
