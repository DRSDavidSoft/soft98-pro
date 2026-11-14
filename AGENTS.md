# Working on Soft98 Pro

- Use Node.js and the repository's existing build tools. Edit the source under `src/`, then regenerate the userscript and packages with `npm run build`. Do not hand-edit generated files.
- Keep both delivery formats in sync through the shared runtime. Put extension-only behavior behind the existing browser-specific boundaries.
- Do not depend on generated Soft98 class names, IDs, or obfuscated symbols for page structure. Prefer semantics, layout, and destination signals. Normal attributes such as `role`, `aria-controls`, or `data-toggle="tab"` can corroborate a match.
- Preserve original navigation, download destinations, accessibility, and the ability to turn the appearance changes off. For text cleanup, change visible labels only and preserve version numbers, file names, and URLs.
- Keep user-facing copy in `src/messages.json`. Use everyday Persian and English, and test mixed Persian and Latin text. Start Persian documentation sentences and headings in Persian.
- In Persian, never put a full stop after a verb-less phrase, label, heading, or fragment. Reserve sentence-ending punctuation for complete sentences; prefer short, useful labels over explanatory filler.
- Keep the two READMEs aligned, with clear language links, the SVG hero before the screenshot, and the existing onboarding, emoji, and SVG assets. Write user-facing changelog entries in English.
- Run `npm run ci`. For changes visible on the site, check a real Soft98 page in a separate, unsigned-in profile. Check desktop and mobile where practical. Say which browser and delivery format were tested; a fixture is not proof of a live page.
- Store general, reproducible before/after previews in `docs/assets/comparison/`. Use GitHub attachments for issue-only evidence; do not commit browser profiles, downloads, or screenshots containing personal data.
- Update the relevant PR or issue with the result, clearly separating what is verified from what is still pending. Answer actionable Copilot review threads and resolve them after addressing the concern. Do not treat a passing build as a published release.
