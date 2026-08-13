# Changelog

All notable user-facing changes to Soft98 Pro are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-08-13

### Added

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

- Restored the bilingual, screenshot-first documentation experience with accessible SVG branding, meaningful emoji navigation, stronger first-run guidance, and a durable documentation style guide.
- Reworked the shared patch engine so browser execution and historical compatibility tests use the same fail-safe transformations.
- Refined the default Pro dark theme, distinct expert control console, megamenus, transition-safe tabbed cards, nested content surfaces, download-link presentation, logo treatment, and favicon status.
- Made Pro styles self-healing with constructable stylesheets so page scripts cannot silently remove layout and theme repairs.
- Improved ad and warning cleanup through structural, geometric, source, and behavior signals rather than generated page identifiers.
- Improved release automation with curated changelog notes, richer workflow summaries, deterministic packages, and integrity guidance.

### Fixed

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
