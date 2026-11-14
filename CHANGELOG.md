# Changelog

All notable user-facing changes to Soft98 Pro are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

See the [visual change log](docs/changes/v1.2.0.md) for before-and-after captures and verification notes.
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

## [1.1.1] - 2026-07-11

### Added

- Added installable Chromium and Firefox browser extensions alongside the userscript.
- Added a shared resilient runtime for ad cleanup, anti-adblock patching, and download-link recovery.
- Added automatic GitHub release checks and packaged release metadata.

### Changed

- Unified extension and userscript maintenance in the Soft98 Pro repository.

[Unreleased]: https://github.com/DRSDavidSoft/soft98-pro/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/DRSDavidSoft/soft98-pro/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/DRSDavidSoft/soft98-pro/releases/tag/v1.1.1
