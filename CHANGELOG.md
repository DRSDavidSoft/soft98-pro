# Changelog

All notable user-facing changes to Soft98 Pro are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The search results tip now has a “Got it” button that remembers your choice.

- Added a Telegram community link for questions and support.
- Added configurable download buttons that can queue a file, start it immediately, or copy the link, with one-time actions in the context menu.
- Added a review dialog for pasted links and text files, with file details, filters, sorting, and resizable columns.
- Grouped multipart downloads, preserved their source pages, and added native download notifications and progress back on the article.
- Added adaptive side columns for related posts and downloads.
- Added category icons to the sticky header and redesigned its menus to match the rest of Soft98 Pro.
- Kept the full download box in the article even when a second copy appears in the sidebar.
- Redesigned Linkdoni with light and dark themes and a date-grouped archive, retaining its original search and article links.
- Added collapsible dates, a link-count badge, and Persian page numbers to Linkdoni. Archive pages now load without a full refresh and support Back and Forward. The Control Center stays visible while scrolling.
- Added Download Manager settings, file-type icons, context menus, and a built-in guide. Completed files open from their names. The sticky header shows queue progress, and F2 focuses search.
- Added relative dates for recent downloads and file updates, with an automatic, Solar Hijri, or Gregorian calendar setting.
- Added the Download Manager to the extension toolbar. Article rows and the Control Center now show live progress, file sizes, and queue state.
- Added a test button for browser notifications in Download Manager settings.
- Added shared theme, accent color, animated RGB, and Control Center settings to Download Manager.
- Added optional download sounds with volume control and a preview for each event, shared by the Download Manager and toolbar popup.
- Related posts and the useful-software list now show the artwork published on linked posts, with a browser cache and a neutral fallback.
- Added a sticky-header download dropdown with live file progress and status. Ctrl-click, Command-click, and middle-click open the full manager.

### Changed

- Grouped Copy All and Download All beside the expand/collapse button, with space between the title and the controls.

- Search results open at the first match, and individual software pages open at the product heading without waiting for the full page to load.

- Download All lets you search the batch, check or uncheck individual files, and see the selected count and size before starting.

- The updates and technology news cards share one collapse button and remember their state. Hide both with the close button and bring them back from the Control Center.

- Reworked the light theme with a sage canvas, flat card headings, and distinct colors for links, downloads, and notices. The Control Center, Download Manager, and Linkdoni now share the same palette.

### Fixed

- “Read more” now reveals actual download links next to the post on listing pages, including links published as structured data.

- Removed the extra scrollbar from the search field, kept suggestions inside the viewport, and improved keyboard focus and mixed-language input.

- The Control Center's three-dot menu opens next to its header button instead of beside the floating launcher.

- The download review shows the file-details permission button only when a selected link needs access. File details still load automatically when access is already available.

- Trimmed excess padding from the Pro logos. Turning off Pirate branding now uses transparent copies of the original header and navbar logos in both themes.

- RGB mode no longer darkens or desaturates artwork. The animated accents stay active without dimming article text.

- Recovered the original article and download links when the userscript encounters an early page clear on ordinary reload.

- Turning off the Pro theme now restores Soft98's original header, layout, and download controls without reloading or disabling ad blocking.

- Matched the useful-software dialog's Close button to both themes and removed the flash from its blurred backdrop.

- Kept Persian userscript labels readable in legacy decoders, restored mixed download lists on reload, and removed leftover sidebar ad cards and neutral gray surfaces.

- Kept Download Manager tabs stable when switching views and replaced native dropdowns with keyboard-friendly menus.

- Unified the sticky header without changing the previous palette, centered the new inline chevrons, and removed the accent stripe from rounded navigation buttons.

- Restored downloads in Chrome when the site left the list clipped to zero height.
- Replaced legacy gray article callouts with the Pro palette.
- Made download rows and their action buttons highlight together without moving on hover.
- Removed repeated download rules and separated the dialog backdrop fade from the panel entrance.
- Matched the sidebar cards and updated download controls, tooltips, and user ratings.
- Restored download links from the article's own data when the site leaves them unresolved after a reload.
- Left-aligned the technology news share buttons.
- Kept file sizes in English digits even in Persian and stopped repeating the total when a download is complete. Download dialogs now follow the URL and close when clicked outside.
- Replaced the final percentage and stale elapsed timer with a localized completion status.
- Fixed access to the download queue when refreshing the manager directly on Settings or another built-in view.
- Hid empty queue counters and showed queue-wide pause and resume only when there is work to manage.
- Improved the download review dialog with row selection, animated save options, and reorderable columns with their own menus.
- Improved file details for downloads, added file-specific icons to the queue and review, and made the review table left to right by default with a direction setting.
- Simplified article download actions, made copying the default, and added a configurable size limit for review before internal downloads.
- Restyled article quotes, warnings, and secondary notices to match the Pro themes.
- Fixed FAQ expand arrows and themed the answer checkmark.
- Put download section actions beside their titles, with adjustable layouts and button labels, remembered collapse state, and confirmation before starting small bulk downloads.
- Styled the Download All confirmation header and action buttons and added a close control.
- Fixed repeated download sizes, aligned status badges without shifting row buttons, and restored the hover border on file-help buttons.
- Removed stray backgrounds around content cards and synchronized the sidebar download box with the original, fading it in proportion to the original's visibility.
- Fixed sticky navigation wrapping when the logo is hidden at the top of the page.
- Replaced legacy category menu chevrons with direction-aware hover and focus arrows, and refined the megamenu's light and dark surfaces.

### Removed

- Removed the Ready badge so preserving or recovering a link no longer makes its download row taller.

## [1.2.2] - 2026-11-14

### Fixed

- Kept the Ready badge on one line and aligned it with the download text, including on the RustDesk mirror link.

## [1.2.1] - 2026-11-14

### Changed

- Kept real previews for the page features they show clearly and used labeled illustrations for settings that are hard to see in a screenshot.
- Bundled preview assets with the extension and userscript, so previews do not depend on a network request.

### Fixed

- Restored before-and-after previews for every setting, including keyboard and touch access in extension Settings and a reduced-motion RGB preview.
- Kept Settings, the browser popup, and Downloads in sync with the selected Pro light or dark theme.

- Restored the Soft98 Pro icon in the browser toolbar and add-on manager.
- Matched the settings and toolbar popup typography to Downloads and rewrote the Persian settings copy.

See the [visual change log](docs/changes/v1.2.1.md) for examples of the preview styles and both themes.

## [1.2.0] - 2026-08-13

### Added

- Added opt-in Quick Browsing for software listings and pagination, with a mountain preloader and browser Back and Forward support.
- Added a dedicated Pro light theme with its own palette for the page, header, and control center.
- Added a browser download queue with parallel transfers, progress, pause and resume where supported, and the browser's Save As options.
- Added article download previews for public direct links, a top-bar shortcut to useful software that is enabled by default, and optional interface sounds.
- Added control-center previews from live screenshots, including an animated RGB comparison, plus a technical report, a keyboard-friendly context menu, and a launcher that remembers its docked corner.
- Added an optional animated RGB Pro mode with a subdued night palette, animated neon borders and active states, responsive interactions, keyboard focus treatments, and reduced-motion support.
- Added responsive semantic layout refinement that organizes primary content and supporting panels without relying on generated Soft98 identifiers.
- Added a reviewed compatibility catalog covering 65 archived Soft98 packed-script hashes.
- Added extension service-worker monitoring that detects the active packed script, verifies its SHA-256 fingerprint, and caches short-lived compatibility results.
- Added a browser-level application-script gateway that routes the original Soft98 payload through the extension service worker and shared patch engine before execution.
- Added a server-side build command and CI artifact for deploying the current unpacked, reviewed, patched Soft98 application script.
- Added a compatibility notice for unreviewed Soft98 scripts with controls to keep protection enabled, disable the modification engine, or open a structured GitHub report.
- Added automatic upstream monitoring for Soft98 and PersianBlocker changes.
- Added native English and Persian settings, compatibility states, diagnostics, and page controls based on browser language and Tehran time-zone fallback.
- Added Chromium, Edge, Firefox, and userscript release packages with checksums and build provenance.

### Changed

- Redesigned Pro light mode, including a higher-contrast open header, a grouped megamenu, and a footer with direct project and settings links.
- Redesigned the article discussion and comment form for light and dark modes while keeping the site's posting and reply controls.
- Added licensed Java Duke and LeoMoon ParsiNegar artwork, plus distinct tiles for other named software and clearer icons for categories.
- Reworked the sticky header, megamenus, article cards, and footer with clearer focus states, readable surfaces, and room for ultrawide displays.
- Replaced legacy top-bar icons and softened news counters, download notice motion, and the old green accents.
- Made the useful-software list and discussion controls easier to navigate, with cleaner product artwork and spacing.
- Restored the bilingual documentation experience with an SVG-first hero, meaningful emoji navigation, stronger first-run guidance, direction-safe Persian copy, and a durable documentation style guide.
- Reworked the shared patch engine so browser execution and historical compatibility tests use the same fail-safe transformations.
- Refined the default Pro dark theme, distinct expert control console, megamenus, transition-safe tabbed cards, nested content surfaces, download-link presentation, logo treatment, and favicon status.
- Redesigned the download list with modern platform icons, brighter primary actions, and quieter secondary links.
- Matched the responsive tabs, sticky navigation buttons, and password controls with a consistent raised style.
- Added password copy and select-all controls, plus a clearer password field.
- Replaced the Linux and Android icons with simpler, more readable artwork and unified the platform icon colors.
- Replaced the old double bars in card headings with a consistent rounded accent.
- Added optional article widening when scrolling past the sidebar. By default, scrolling does not resize the article.
- Added a separate size and date line to download links. Direct Soft98 file links can show cached file details, with Solar Hijri dates in Persian.
- Replaced legacy utility sprites with transparent artwork and reduced the visual weight of news view counts.
- Grouped the sticky navigation controls and moved dropdown markers inside the buttons.
- Restyled article headers and organized the category, author, date, and views into one metadata row.
- Made the optional success notification brief and off by default.
- Made Pro styles self-healing with constructable stylesheets so page scripts cannot silently remove layout and theme repairs.
- Improved ad and warning cleanup through structural, geometric, source, and behavior signals rather than generated page identifiers.
- Improved release automation with curated changelog notes, richer workflow summaries, deterministic packages, and integrity guidance.

### Fixed

- Added a Downloads tab with queue counts to the extension's control center and improved Persian text rendering in the full manager.
- Made the Downloads manager accessible from the site header and direct download rows, with live percentage, transferred bytes, speed, and estimated time remaining.
- Showed a brief checkmark when a download link is activated without changing the site's download behavior.
- Hid promotional banners before the Photoshop article and similar pages finish loading.
- Replaced the stock green pagination highlight with the Pro accent in all themes.
- Kept megamenu headings and their indicators from shifting on hover or keyboard focus.
- Kept platform links together in the megamenu so labels with Windows and Mac links no longer split into separate lines.
- Removed the second height jump at the end of FAQ expansion.
- Opened links wrapped by href.li directly without sending a referrer, while preserving destination parameters and fragments.
- Restored the site's original notification messages in Pro's themed toasts, including the archive password instructions.
- Replaced the stock grey and olive download-help colors with the Pro palette, including hover and keyboard focus.
- Reduced stutter while scrolling, dragging the control center, and expanding FAQ answers. Recognized scroll detectors are stopped before registration instead of adding more work to each scroll event.
- Kept the article tabs in normal flow and stabilized scrolling from related posts through the footer.
- Stopped the site's repeating style edits and injected download checks from shifting the page, without removing its download link handler.
- Made listing previews show actual file links only. Articles with no direct file links no longer show a download preview.
- Made F2 refocus an already open search and kept the discussion styling on read-only threads.
- Clarified that the download group copy action copies direct links only.
- Restored the Pro palette on the related-posts card, replacing the stock gray background.
- Animated the docking guide as it moves from the launcher toward the nearest edge.
- Added smooth, reversible transitions to the control center, its technical report, and the expanded useful-software list.
- Rebuilt the footer with solid theme colors, clearer project and support links, and quick access to settings and the top of the page.
- Preserved dark surface gradients in RGB mode and added animated multicolor accents to the control center frame, launcher, tabs, navigation, and card headings.
- Kept the article download tab usable when the site's tab handler fails, and restored the download list when its own wrapper was left hidden.
- Centered the technology news shortcuts and kept the latest-content tabs working even when the site's tab script is unavailable.
- Removed the permanent favicon dot. The tab icon now pulses briefly for notifications and stays still when reduced motion is enabled.
- Aligned the latest-content tabs with the technology news header and refreshed the news rows, shortcuts, and view counts.
- Kept Pro tools available when switching between light and dark modes.
- Kept the news panel and article surround in the Pro palette when Soft98's own night mode loads first, and removed the empty strip between them.
- Kept settings rows and scroll position stable when a preview opens.
- Kept the sidebar on the same side while the article widens and reclaimed its space when no sidebar content remains.
- Repaired leftover ad cards, orphaned dividers, and the floating feedback banner.
- Aligned multi-line download rows, removed the stock hover ring, added copy and collapse controls where direct links are available, and kept archive passwords selected while showing copy feedback.
- Synced the site night-mode toggle with Soft98 Pro and added F2 for search.
- Fixed control-center scrolling, animated accents, and menu placement after settings and viewport changes.

- Restored right-to-left layout for Persian content and isolated mixed-direction titles and platform names.
- Corrected spacing, capitalization, and mixed-direction punctuation in visible download labels without changing their destinations.
- Matched the utility card, icon tiles, dividers, and download icons to the dark theme.
- Added controls for the top latest-posts and news panel and extra site prompts.

- Fixed the Firefox console layout and the narrow utility sidebar. Optional Soft98 Pro messages stay inside the console, and wide header ads are removed along with their fallback placeholders.
- Applied the selected Pro branding to the compact navigation logo as well as the main logo.
- Improved recovery for download links with identical labels in different sections.
- Detect upstream script moves and metadata changes even when the script contents are unchanged.
- Prevented queued application-script payloads from colliding, sanitized extension update destinations, and aligned installation links with the stable GitHub Release asset.
- Restored original logo accessibility and responsive-image attributes when Pro branding is disabled or changed.
- Prevented malformed upstream JavaScript from removing page content or stopping Soft98 Pro cleanup.
- Prevented scroll-triggered anti-adblock checks from restoring warnings after the page is cleaned.
- Removed residual advertisement containers and separators while preserving surrounding content structure.
- Neutralized PersianBlocker warning overlays at browser USER style origin.
- Corrected theme contrast, icon rendering, tab styling, logo transparency, dialog transitions, and RTL/LTR presentation.
- Repaired repeated icon-and-copy utility lists, including the useful-software sidebar, without relying on changing classes or headings.

Soft98 currently serves some download buttons as placeholders and fills in their destinations through its own click handler. This release preserves those controls and restores a hidden download list. Listing previews only show direct file links found in the article. See the [visual change log](docs/changes/v1.2.0.md) for before-and-after captures and verification notes.

## [1.1.1] - 2026-07-11

### Added

- Added installable Chromium and Firefox browser extensions alongside the userscript.
- Added a shared resilient runtime for ad cleanup, anti-adblock patching, and download-link recovery.
- Added automatic GitHub release checks and packaged release metadata.

### Changed

- Unified extension and userscript maintenance in the Soft98 Pro repository.

[Unreleased]: https://github.com/DRSDavidSoft/soft98-pro/compare/v1.2.2...HEAD
[1.2.2]: https://github.com/DRSDavidSoft/soft98-pro/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/DRSDavidSoft/soft98-pro/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/DRSDavidSoft/soft98-pro/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/DRSDavidSoft/soft98-pro/releases/tag/v1.1.1
