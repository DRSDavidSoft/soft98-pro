# Download Manager

[فارسی](fa/Download-Manager.md)

## Review links before downloading

Open **Download Manager** from the Soft98 header, footer, or Control Center. Paste with **Ctrl+V** or **Command+V**, or drop a plain text `.txt` file onto the manager. You can also use **Import links** to pick a text file or enter a single address. Nothing downloads until you submit the checked links.

Right-click a row for its available actions. Use **Shift+F10** from a focused row control to open the same menu with the keyboard. Close the review dialog with **Escape** or a click outside it. The built-in **Download guide** works offline.

![The download review dialog with selectable links, file sizes, dates, and a file type filter](../assets/comparison/download-manager-import.webp)

- Search by file name or host, filter by type, and click a column heading to sort in either direction.
- Drag a column divider to resize it. With the divider focused, use the Left and Right arrow keys.
- **Select visible** checks the filtered rows. It keeps earlier selections, even if those rows are now filtered out. **Clear selection** unchecks all rows. Review up to 120 candidates and submit up to 30 per batch.
- Size, type, and last-modified date are checked automatically for selected links. **Fetch details** retries and may ask the browser for access to the selected sites. It sends HEAD requests without cookies or a referrer. Soft98's download CDN is covered automatically; cross-site restrictions, missing headers, or servers that reject HEAD can leave values unavailable without disabling the download. Persian mode shows dates in the Solar Hijri calendar.
- **Save options** lets you request a save prompt or enter a relative path for a single file.

## Follow downloads

Files such as `Artwork.part01.rar` and `Artwork.part02.rar` appear under one expandable group. Parts stay in numeric order and each keeps its own progress, pause, and cancel controls. **Original page** returns to the article when a download was added from there. Pasted links without a known source do not get a guessed origin page.

Click a completed filename to open it through the browser. Press **F2** to search and follow progress in the sticky header or browser tab icon. File sizes always use English digits. The **Settings** tab holds the parallel download limit, browser notifications, and the action to clear finished entries from the queue without deleting files.

![A grouped archive with one part complete, another waiting, and original page links](../assets/comparison/download-manager-multipart.webp)

On a Soft98 article, use the row menu to queue, start, copy, or review one link. The menu arrow appears when you hover or focus its controls and stays visible on touchscreens. At the section heading, **Copy all** copies the direct links and **Download all** opens them for review before starting any downloads. The original site link is unchanged. A status badge appears only when the manager tracks the file and opens its queue.

The **Wide-screen columns** setting is on by default. From 1280 CSS pixels, related posts can move to the left. On ultrawide screens (at least 1720 pixels and a 2:1 viewport, or 2200 pixels regardless of aspect ratio), a second download box appears on the right once Soft98 supplies its links. The original download tab stays in place. The **−** and **+** buttons collapse or expand each box independently. Narrowing the window or turning off Wide-screen columns removes the extra box.

**Browser notifications** cover completion and downloads that need attention. They use the extension's background worker, so the manager does not need to stay open. Click a notification to open the corresponding queue entry. Turn them off in the manager, or control their delivery in your browser and system settings.

The screenshots show the actual packaged interface with sample files and local HEAD responses. To regenerate them in PowerShell, set `$env:SOFT98_DOWNLOAD_SCREENSHOTS='1'`, then run `npm run build` and `node test/runtime-browser.js`.
