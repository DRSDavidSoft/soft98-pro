# Soft98 Pro Roadmap

[فارسی](ROADMAP.fa.md)

## Historical Feature Parity

The [last legacy release before the rewrite](https://github.com/DRSDavidSoft/user-scripts/blob/b5c2875/soft98_ad-unblocker.user.js) was reviewed against the current shared runtime. Earlier commits also document the transition from jQuery to native DOM, duplicate-caption handling, and link-target repair.

| Legacy behavior | Current implementation |
|---|---|
| Detect newly inserted ads and warnings | Mutation observer with structural, media, and destination checks |
| Preserve links, undo target changes, and retry recovery | In-memory preservation, click repair, and bounded fresh-page recovery |
| Disambiguate identical captions by section | Section heading and definition-list context with unique-destination checks |
| Diagnostic commands, trap checks, and document query recovery | `window.Soft98Pro` diagnostics and `resetHandles()` |
| Swap and restore logos | Bundled light/dark assets for the main and compact brands |
| Success message and console feedback | Opt-in console message and diagnostic logging |
| Restore site-modified document methods and clear the console | Retired. Restoring page overrides can undo repairs, and clearing the console erases diagnostic evidence. |

## Backlog

- **DL-01 · Download inventory.** Search, filter, select, and copy direct links. Keep site-managed download actions available.
- **DL-02 · File details.** Show file size and modification date when the host provides them.
- **DL-03 · Download queue.** Use browser-managed downloads for progress, pause/resume, retry, and Save As.
- **DL-04 · Accessible menus.** Add keyboard and touch access to link and queue commands in both directions.
- **DL-05 · Integrity and mirrors.** Explore checksums, duplicate detection, and mirror health.
- **BR-01 · Compact artwork.** Create dedicated transparent light and dark artwork for the navbar.
- **DIST-01 · Filter-list integration.** Evaluate which cosmetic fixes can ship as filter rules alongside the extension.
