# Documentation Style Guide

Soft98 Pro documentation is a bilingual product surface. English and Persian readers should receive the same current, polished, and actionable guidance.

## Required Structure

- Keep `README.md` and `README.fa.md` aligned in structure and meaning.
- Keep the English and Persian SVG language selectors visible at the top of both READMEs.
- Show the branded hero before the real product screenshot, and keep both before setup instructions.
- Place the table of contents before long-form sections and link every major section.
- Keep Getting Started focused on a first successful installation and visit to Soft98.
- Maintain matching English and Persian wiki pages for user-facing guides.

## Visual Language

- Use accessible repository-owned SVG artwork for durable product visuals.
- Use a restrained, meaningful emoji in major headings and important navigation links.
- Preserve descriptive alt text for every image.
- Do not commit screenshots created only for an issue or pull request; upload those through GitHub user attachments.
- Verify SVG identifiers are unique and assets render correctly on GitHub light and dark surfaces.

## Writing And Localization

- Write concise, professional English.
- Write natural Iranian Persian rather than literal word-for-word translation.
- Wrap Persian documents in an RTL container while preserving LTR behavior for code, paths, and commands.
- Begin every rendered Persian heading, sentence, paragraph, list item, and table cell with Persian text; a Latin product or technical term must follow a Persian lead-in.
- Keep installation steps, release behavior, supported browsers, and limitations accurate in both languages.
- Update both READMEs in the same pull request whenever shared behavior changes.

## Review Checklist

- Language switcher works in both directions.
- Screenshot and SVG assets resolve from GitHub.
- The hero appears before the screenshot in both READMEs.
- Heading anchors match the table of contents.
- First-time installation can be completed without searching another page.
- Narrow screens are not forced to display wide comparison tables.
- `git diff --check` and the repository documentation checks pass.
