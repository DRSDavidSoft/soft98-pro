# Soft98 Ad Blocker Extension

A browser extension version of Soft98 Ad Blocker for Chrome, Edge, and Firefox.

The extension is the preferred install when users want deeper control than a userscript can provide: a popup/options surface, cross-tab settings, page-code patching at `document_start`, Soft98 Pro visual upgrades, and stronger removal of both Soft98 anti-adblock warnings and external blocker-side notices such as the PersianBlocker/MasterKia banner reported against Soft98.

## Build

```bash
npm ci
npm run ci
```

Build outputs:

- `dist/chromium`: Manifest V3 build for Chrome and Edge.
- `dist/firefox`: Firefox build with an injected page runtime.
- `dist/packages/*.zip`: packaged artifacts for manual installation or release upload.

## Install Unpacked

Chrome or Edge:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Load unpacked: `dist/chromium`.

Firefox:

1. Open `about:debugging#/runtime/this-firefox`.
2. Load Temporary Add-on.
3. Select `dist/firefox/manifest.json`.

## Design

The extension keeps Soft98-specific detection resilient by favoring behavior, structure, script signatures, and link preservation over generated class names or short random identifiers.
