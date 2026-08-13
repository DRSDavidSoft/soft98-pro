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

The CI workflow validates and uploads packages for every pull request. The release workflow additionally checks that the Git tag matches `package.json`, attests the artifacts, and publishes packages, update metadata, and checksums to GitHub Releases.

Extension update checks are shared through `src/release-client.js`. The client prefers the release asset `latest.json` and falls back to GitHub's Releases API, so upgrades from releases created before the metadata feed was introduced keep working.
