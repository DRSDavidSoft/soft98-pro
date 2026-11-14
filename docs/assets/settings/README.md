# Settings previews

These before/after images come from the live AnyDesk page in an unsigned-in Firefox profile. The RGB loop uses real browser captures at evenly spaced points in the site's RGB cycle. Reduced-motion mode uses a single captured frame instead.

Set `SOFT98_CONTROL_PREVIEWS` to a temporary output directory and run `node tools/firefox-live-smoke.js` with the local Firefox WebDriver and the latest built Firefox package. Crop the captures to 16:9 and resize to 460 pixels wide for these WebP assets. The expanding-article pair uses a centered crop; the remaining pairs use a top-aligned crop. Encode the RGB sequence in filename order with a 320 ms frame duration and a continuous loop.
