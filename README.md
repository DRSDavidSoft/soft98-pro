# Soft98 Pro

Soft98 Pro improves the Soft98 browsing experience with ad blocking, anti-adblock patching, download-link recovery, PersianBlocker notice cleanup, and an optional modern dark interface. It ships as both a userscript and browser extensions for Chrome, Edge, and Firefox. 🧭

The userscript and extensions are built from the same shared runtime in `src/runtime.js`, so the blocking logic, diagnostics, i18n, dark theme, favicon status indicator, and link recovery behavior stay aligned.

## Screenshot

![Soft98 Pro dark mode running on Soft98](docs/assets/soft98-pro-dark.png)

## Logo candidates

The current Soft98 logo was supplied to ChatGPT as the structural reference for two transparent, high-resolution Soft98 Pro candidates with the updated Persian motto `تجربه‌ای پاک‌تر، سریع‌تر و حرفه‌ای‌تر`:

- [Light-page logo candidate](docs/assets/soft98-pro-logo-light.png)
- [Dark Pro logo candidate](docs/assets/soft98-pro-logo-dark.png)

These are review assets and are not wired into the runtime until one is approved.

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

Build outputs:

- `soft98-pro.user.js`: root userscript for raw GitHub install/update.
- `dist/userscript/soft98-pro.user.js`: release userscript copy.
- `dist/chromium`: Manifest V3 build for Chrome and Edge.
- `dist/firefox`: Firefox build with early page-runtime injection.
- `dist/packages/*.zip`: release-ready ZIPs.
- `docs/assets/soft98-pro-dark.png`: local proof screenshot generated from the live Soft98 harness.

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
