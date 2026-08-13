# Soft98 Pro

Soft98 Pro improves the Soft98 browsing experience with ad blocking, anti-adblock patching, download-link recovery, PersianBlocker notice cleanup, and an optional modern dark interface. It ships as both a userscript and browser extensions for Chrome, Edge, and Firefox. 🧭

The userscript and extensions are built from the same shared runtime in `src/runtime.js`, so the blocking logic, diagnostics, i18n, dark theme, favicon status indicator, and link recovery behavior stay aligned.

## Screenshot

![Soft98 Pro dark mode running on Soft98](docs/assets/soft98-pro-dark.png)

## 🏴‍☠️ Bundled Branding

The project includes two transparent, high-resolution Soft98 Pro variants and optimized runtime copies:

- [Light-page logo](docs/assets/soft98-pro-logo-light.png)
- [Pirate-themed dark Pro logo](docs/assets/soft98-pro-logo-dark.png), with the motto `یکی از تبلیغ‌دار ترین مراجع نرم‌افزاری ایران`

Both images are converted to inlined PNG data URLs during the build. After successful cleanup, the runtime chooses the light or pirate-dark version from the active theme without downloading an external logo.

## ✨ What It Does

- Blocks ad surfaces using source, shape, size, and link behavior.
- Patches packed Soft98 code before fragile anti-adblock logic can break the page.
- Preserves and restores download links when page scripts try to sabotage them.
- Removes Soft98 and PersianBlocker warning notices without deleting the article body.
- Enables Soft98 Pro and the dark theme by default.
- Uses Persian UI when browser language is `fa` or timezone is `Asia/Tehran`; English otherwise.
- Updates the favicon with a canvas-generated status icon after successful cleanup.

## 📦 Downloads

Use the latest GitHub release:

- `soft98-pro-chromium-*.zip` for Chrome and Edge.
- `soft98-pro-firefox-*.zip` for Firefox temporary/manual install.
- `soft98-pro.user.js` for Tampermonkey, Violentmonkey, or another userscript manager.

Latest release: https://github.com/DRSDavidSoft/soft98-pro/releases/latest

### Updates

- Userscript managers check and install `releases/latest/download/soft98-pro.user.js` through the standard `@updateURL` and `@downloadURL` metadata.
- The browser extension checks GitHub Releases at install, browser startup, and every six hours. It uses `latest.json` when available and falls back to GitHub's Releases API for older releases, then marks the toolbar and links directly to the correct Chromium or Firefox package.
- Unpacked extensions cannot silently replace themselves because Chrome, Edge, and Firefox reserve that capability for extension-store or signed update channels. The GitHub package workflow therefore provides automatic detection and a verified one-click package download; a future store build can use the same version feed with native browser updates.
- Every release includes `latest.json` and `SHA256SUMS.txt` so update clients and users can verify the exact assets.

## 🧩 Userscript vs Browser Extension

The userscript is the quickest path. Install `soft98-pro.user.js` in a userscript manager and it runs directly on Soft98 at `document-start`. It is easy to inspect, update, and share, but it depends on the userscript manager’s injection timing and page-world behavior.

The browser extension is the stronger option. It can ship UI, persistent extension storage, content-script bridges, and browser-specific injection paths. Chrome and Edge use a Manifest V3 main-world runtime; Firefox uses a content bridge plus early page-runtime injection. The extension is better when you want richer settings, more predictable browser integration, and future room for advanced controls.

Both options use the same core code. Choose the userscript for speed and transparency; choose the extension for durability and a fuller product surface. 🛠️

## 🧪 Build

```bash
npm ci
npm run ci
npm run screenshot
```

All English and Persian runtime, settings, diagnostics, taunt, and update copy lives in [`src/messages.json`](src/messages.json). The build validates matching locale keys and inlines the catalog into the userscript and both extensions; the runtime does not fetch translations.

Build outputs:

- `soft98-pro.user.js`: root userscript for raw GitHub install/update.
- `dist/userscript/soft98-pro.user.js`: release userscript copy.
- `dist/chromium`: Manifest V3 build for Chrome and Edge.
- `dist/firefox`: Firefox build with early page-runtime injection.
- `dist/packages/*.zip`: release-ready ZIPs.
- `dist/release/latest.json`: machine-readable update metadata and direct package links.
- `dist/release/SHA256SUMS.txt`: release checksums.
- `docs/assets/soft98-pro-dark.png`: local proof screenshot generated from the live Soft98 harness.

## ⚙️ CI/CD

- `☠️ Soft98 Pro CI` builds every pull request and main-branch change, audits critical dependencies, runs static validation and real headless-browser acceptance tests, uploads all installable packages, and publishes a branded artifact summary.
- `🏴‍☠️ Soft98 Pro Release` validates version/tag parity, rebuilds and retests from source, creates provenance attestations, publishes or updates the GitHub Release, and uploads packages, the standalone userscript, update metadata, and checksums.
- Push `v<package.json version>` or run the release workflow manually with that exact tag to publish.

## 🚀 Install Unpacked

Chrome or Edge:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Load unpacked: `dist/chromium`.

Firefox:

1. Open `about:debugging#/runtime/this-firefox`.
2. Load Temporary Add-on.
3. Select `dist/firefox/manifest.json`.

## 🕵️ Diagnostics

Console diagnostics are available through:

- `window.Soft98AdBlocker.report()`
- `window.Soft98AdBlocker.trapCheck()`
- `window.Soft98AdBlocker.resetHandles()`
- `window.Soft98AdBlocker.events`
- `window.Soft98AdBlocker.stats`

The public alias `window.Soft98Pro` is also exposed when page conditions allow it.

## 📚 Wiki

Project wiki pages live in [`docs/wiki`](docs/wiki/Home.md). They cover installation, diagnostics, development, and the practical differences between the userscript and browser extension.
