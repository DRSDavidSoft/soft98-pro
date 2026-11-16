# Download Manager

[فارسی](fa/Download-Manager.md)

## Review links before downloading

Open **Download Manager** from the Soft98 header, footer, or Control Center. Paste with **Ctrl+V** or **Command+V**, or drop a plain text `.txt` file onto the manager. You can also use **Import links** to pick a text file or enter a single address. Nothing downloads until you submit the checked links.

Click the Soft98 Pro toolbar icon to open the same queue in a compact view. The arrow in its header opens the full manager in a tab. **Soft98 Pro** still opens the extension's general settings.

Right-click a row for its available actions. Use **Shift+F10** from a focused row control to open the same menu with the keyboard. Close the review dialog with **Escape** or a click outside it. The **Help** button in the header opens the built-in guide, even offline.

![The download review dialog with selectable links, file sizes, dates, and a file type filter](../assets/comparison/download-manager-import.webp)

- Search by file name or host, filter by type, and click a column heading to sort in either direction.
- Drag a column header or its grip to reorder it. Right-click the header or open its grip menu to move it with the keyboard. Drag a divider to resize; its Left and Right arrow keys do the same.
- Click anywhere on a file row to toggle its checkbox. Selected rows stay tinted while you review the list.
- **Select visible** checks the filtered rows. It keeps earlier selections, even if those rows are now filtered out. **Clear selection** unchecks all rows. Review up to 120 candidates and submit up to 30 per batch.
- Size, type, and last-modified date are checked automatically for selected links on Soft98's download hosts. For external download hosts, choose **Allow file details** and confirm access in the browser. The extension checks response headers without cookies or a referrer and can retry with a one-byte range when HEAD is unavailable. Missing details never prevent downloading.
- The review table runs left to right by default, including in Persian. Choose **Settings → Review table direction** to change the column direction without changing the language.
- **Save options** lets you request a save prompt or enter a relative path for a single file.

## Follow downloads

Files such as `Artwork.part01.rar` and `Artwork.part02.rar` appear under one expandable group. Parts stay in numeric order and each keeps its own progress, pause, and cancel controls. **Original page** returns to the article when a download was added from there. Pasted links without a known source do not get a guessed origin page.

Click a completed filename to open it through the browser. Press **F2** to search and follow progress in the sticky header or browser tab icon. File sizes always use English digits. The **Settings** tab holds the parallel download limit, browser notifications, and the action to clear finished entries from the queue without deleting files.

Recent dates appear as relative time, such as **2 days ago**. Hover over or focus the date to see its exact value. Under **Settings → Date calendar**, choose **Auto**, **Solar Hijri**, or **Gregorian**. Auto follows the interface language.

![A grouped archive with one part complete, another waiting, and original page links](../assets/comparison/download-manager-multipart.webp)

On an article, the row button copies the link by default. Hover or focus the row to reveal **⋯**, or right-click the row. The menu offers **Copy link** and **Internal download**. Change the default or turn off the custom right-click menu in **Control Center → Downloads**. The three dots still work when right-click is disabled, and the original site link is unchanged.

**Internal download** starts directly for a file under **100 MB**. **Download all** asks for confirmation when the verified total is under the limit. At or above the limit, or when a size is unknown, the manager opens the review list instead of showing an extra confirmation. Change the limit in **Control Center → Downloads**. The article shows a notice, and the row badge opens the tracked file in the queue.

**Download all** and **Copy all** sit beside the section title by default. In **Control Center → Downloads**, swap their position with the collapse button or show the text labels. Sections that are clearly only for other operating systems start collapsed. Other sections stay open. Your choice is saved for the article and shared between both copies of the download box.

Tracked rows show the current state, transfer size, and remaining time when available. In **Control Center → Downloads**, the totals cover the whole queue, but the file list only includes downloads from the current article. Select a tracked file to open its entry in the manager.

The **Wide-screen columns** setting is on by default. From 1280 CSS pixels, related posts can move to the left. On ultrawide screens (at least 1720 pixels and a 2:1 viewport, or 2200 pixels regardless of aspect ratio), a second download box appears on the right once Soft98 supplies its links. It fades in proportion to how much of the original is visible. Either box's **−** and **+** buttons update both copies. Narrowing the window or turning off Wide-screen columns removes the extra box.

**Browser notifications** cover completion and downloads that need attention. They use the extension's background worker, so the manager does not need to stay open. Click a notification to open the corresponding queue entry. Use **Settings → Send test notification** to check delivery even if automatic alerts are off. If no banner appears, check your browser and system notification settings.

**Settings → Appearance** shares light/dark mode, accent color, and animated RGB across the manager and Soft98 Pro. Under **Control Center**, you can hide or restore its launcher on Soft98 pages and change sound feedback.

The screenshots show the actual packaged interface with sample files and local HEAD responses. To regenerate them in PowerShell, set `$env:SOFT98_DOWNLOAD_SCREENSHOTS='1'`, then run `npm run build` and `node test/runtime-browser.js`.
