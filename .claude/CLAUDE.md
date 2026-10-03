# Browser Buddy

Manifest V3 extension for Chrome and Edge. Plain JavaScript, HTML and CSS with no build step or dependencies. Load the repo folder unpacked from `chrome://extensions` or `edge://extensions` to test.

- `manifest.json`: permissions, host matches, content script registration
- `popup.html` / `popup.css` / `popup.js`: toolbar popup UI
- `content.js`: YouTube and Amazon page behavior
- `background.js`: service worker

Keep `README.md` and `CHANGELOG.md` in sync with user-facing changes, and bump `version` in `manifest.json` on release.

## Scratch folder

Use `.claude/scratch/` for Figma MCP scratch files: exported screenshots, design context dumps, generated HTML for `import_html_layers`, and other throwaway artifacts. It is gitignored. Never reference files in it from extension code, and don't put anything there that needs to be kept.

## Keeping this file current

This file is a living document. Update it in the same change whenever the project grows or a durable rule emerges:

- **Rules and instructions first.** When the user states a rule, preference or constraint that should apply beyond the current task ("always…", "never…", "from now on…"), or corrects how something should be done, add it under **Rules** below right away.
- **Project changes.** Add new files, modules, permissions, supported sites, tooling, or workflows to the overview above when they're introduced. Remove or fix entries that become wrong.
- Keep it short and factual. Record what isn't obvious from the code; don't duplicate the README or git history.

## Rules

- Use `.claude/scratch/` for Figma MCP scratch files (see above).
