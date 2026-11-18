# CI/CD and Releases

Soft98 Pro treats release packaging and upstream compatibility as separate concerns. Every workflow uses immutable action pins and publishes a concise GitHub step summary.

## Build and Test

`☠️ Soft98 Pro · Build and Test` runs for pull requests, active development, `main`, and merge queues. It validates localized copy, builds all three formats, checks deterministic archives, exercises the runtime in Chromium, verifies PersianBlocker compatibility, and uploads inspectable artifacts.

### Test a Pull Request

Sign in to GitHub, open the pull request's **Checks** tab, and open its completed **Build and Test** run. The run summary links directly to the Chromium ZIP, Firefox ZIP, userscript, and SHA-256 checksums. Downloads are kept for 14 days. They do not replace the published release.

- **Chrome, Edge, or Brave:** extract the Chromium ZIP, enable Developer mode on your browser's extensions page, and choose **Load unpacked**. Select the folder containing `manifest.json`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select the Firefox ZIP. Firefox removes it on restart.
- **Userscript:** import `soft98-pro.user.js` into your userscript manager. Test the extension and userscript separately.

## Upstream Compatibility

`🧬 Soft98 Pro · Upstream Compatibility` runs daily and on demand. It fetches Soft98 directly, identifies the packed application script, computes SHA-256, and compares it with `src/compatibility/soft98-scripts.json`.

An unfamiliar hash creates or updates a structured GitHub issue and fails the compatibility gate until the revision has been unpacked, compared, patched, and tested. The installed extension performs the same fingerprint check in its background worker and offers a fail-safe choice when an unfamiliar script appears.

To triage a new report, run `node tools/check-soft98-upstream.js --check --audit --capture`. Add `--page <article-url>` to inspect a particular article. The command saves the exact response as `dist/upstream-source.txt` and its URL, SHA-256, applied patches, and parse failures as `dist/compatibility-report.json`. The audit parses the packed text without executing the site code. The scheduled workflow attaches the same evidence; a hash match does not substitute for browser testing.

## Repository Health and Security

`🛡️ Soft98 Pro · Repository Health` validates required policy files, release documentation, action pins, issue-evidence policy, workflow syntax, and whitespace. `🛡️ Soft98 Pro · CodeQL` analyzes both the JavaScript project and GitHub Actions workflows.

Use the state and area labels defined in [`.github/labels.json`](https://github.com/DRSDavidSoft/soft98-pro/blob/main/.github/labels.json) to triage issues and pull requests. Keep the plain compatibility labels unchanged because the issue forms and upstream monitor use their names.

## Release

Merging into `main` runs CI but does not publish. After approval, manually run `🏴‍☠️ Soft98 Pro · Release` on `main` with the version tag from `package.json`. The workflow:

1. Verifies that `package.json` and the requested tag agree.
2. Rebuilds and runs the entire acceptance suite.
3. Confirms the current Soft98 packed script is reviewed.
4. Generates release notes from the English `CHANGELOG.md` section.
5. Attests the userscript, browser archives, checksums, and metadata.
6. Publishes the release with Chromium, Firefox, and userscript downloads.

GitHub's Release asset URLs are stable inputs for userscript auto-updates and extension update notices.
