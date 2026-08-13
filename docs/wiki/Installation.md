# Installation 📦

Use the latest release from https://github.com/DRSDavidSoft/soft98-pro/releases/latest.

## Browser Extension

Chrome and Edge:

1. Download `soft98-pro-chromium-*.zip`.
2. Extract it.
3. Open `chrome://extensions` or `edge://extensions`.
4. Enable Developer mode.
5. Choose **Load unpacked** and select the extracted folder.

Firefox:

1. Download `soft98-pro-firefox-*.zip`.
2. Extract it.
3. Open `about:debugging#/runtime/this-firefox`.
4. Choose **Load Temporary Add-on**.
5. Select `manifest.json`.

The unpacked extension checks GitHub Releases automatically at install, browser startup, and every six hours. It falls back to GitHub's Releases API when an older release has no `latest.json` feed. When a newer release is available, the toolbar is marked and the settings page links directly to the correct package. Browser policy requires the user to load an unpacked update; silent replacement is limited to store-distributed or signed extensions.

## Userscript

Install `soft98-pro.user.js` with a userscript manager such as Tampermonkey or Violentmonkey.

The userscript uses `releases/latest/download/soft98-pro.user.js` for both update metadata and installation. Keep automatic update checks enabled in the userscript manager.
