# Contributing to Soft98 Pro

Thank you for improving Soft98 Pro. Changes should preserve content and download access while avoiding generated Soft98 identifiers and brittle page strings.

## Development

1. Install Node.js 24 and run `npm ci`.
2. Make focused changes in `src/`; generated files in `dist/` are rebuilt automatically.
3. Put all user-visible English and Persian copy in `src/messages.json`.
4. Run `npm run ci` before opening a pull request.
5. Add user-facing changes to `CHANGELOG.md` under the current release.

## Compatibility work

Use `npm run check:soft98-upstream` to inspect the current packed script. An unfamiliar hash must be reviewed against the archived history and exercised by the shared patch engine before it is marked compatible.

Do not commit screenshots made only for issue investigation. Paste those images into GitHub's issue or pull request editor and use the resulting `github.com/user-attachments` URL.

## Pull requests

Keep commits reviewable, describe live-site verification separately from harness results, and never include secrets or browsing data. A pull request is ready only when CI, deterministic packaging, browser acceptance, and repository-health checks pass.
