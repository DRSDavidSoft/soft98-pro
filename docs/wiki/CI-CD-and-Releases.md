# CI/CD and Releases

Soft98 Pro treats release packaging and upstream compatibility as separate concerns. Every workflow uses immutable action pins and publishes a concise GitHub step summary.

## Build and Test

`☠️ Soft98 Pro · Build and Test` runs for pull requests, active development, `main`, and merge queues. It validates localized copy, builds all three formats, checks deterministic archives, exercises the runtime in Chromium, verifies PersianBlocker compatibility, and uploads inspectable artifacts.

## Upstream Compatibility

`🧬 Soft98 Pro · Upstream Compatibility` runs daily and on demand. It fetches Soft98 directly, identifies the packed application script, computes SHA-256, and compares it with `src/compatibility/soft98-scripts.json`.

An unfamiliar hash creates or updates a structured GitHub issue and fails the compatibility gate until the revision has been unpacked, compared, patched, and tested. The installed extension performs the same fingerprint check in its background worker and offers a fail-safe choice when an unfamiliar script appears.

## Repository Health and Security

`🛡️ Soft98 Pro · Repository Health` validates required policy files, release documentation, action pins, issue-evidence policy, workflow syntax, and whitespace. `🛡️ Soft98 Pro · CodeQL` analyzes both the JavaScript project and GitHub Actions workflows.

## Release

Merging active development into `main` runs `🏴‍☠️ Soft98 Pro · Release`. The workflow:

1. Verifies that `package.json` and the requested tag agree.
2. Rebuilds and runs the entire acceptance suite.
3. Confirms the current Soft98 packed script is reviewed.
4. Generates release notes from the English `CHANGELOG.md` section.
5. Attests the userscript, browser archives, checksums, and metadata.
6. Publishes the release with Chromium, Firefox, and userscript downloads.

GitHub's Release asset URLs are stable inputs for userscript auto-updates and extension update notices.
