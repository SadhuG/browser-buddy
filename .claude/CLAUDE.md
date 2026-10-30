# Browser Buddy

Manifest V3 extension for Chrome and Edge. Plain JavaScript, HTML and CSS with no build step or dependencies. Load the repo folder unpacked from `chrome://extensions` or `edge://extensions` to test.

- `manifest.json`: permissions, host matches, content script registration
- `popup.html` / `popup.css` / `popup.js`: toolbar popup UI
- `theme.js`: loaded in the popup `<head>`; sets `data-theme` on `<html>` from `localStorage` (or the system setting) before first paint. Light colors override the dark tokens under `:root[data-theme="light"]` in `popup.css`; any new color token needs a value in both blocks.
- `content.js`: YouTube and Amazon page behavior (isolated world; owns `chrome.storage`; answers the popup's `GET_TAB_STATUS` / `CLEAR_TOUCH`)
- `page-bridge.js`: `"world": "MAIN"` content script on YouTube that calls YouTube's player API. Talks to `content.js` only through `window.postMessage` (`source: 'browser-buddy'`). Feature logic registers in its `appliers` list.
- "Your touch wins": a change the user makes in YouTube's own player (speed, quality, captions, audio) holds for that video and resets on the next one; Browser Buddy's own changes never count. Logic in `lib/touch.js`; a change counts as the user's only after trusted pointer/key input in the last 2 s.
- `background.js`: service worker
- `lib/`: pure logic shared by extension scripts and Node tests. Plain scripts that end with a `module.exports` guard, loaded via `<script>` or the manifest.
- Tests (dev-only, never loaded by the extension): `package.json`, `playwright.config.js`, `tests/unit/` (`node:test`), `tests/e2e/` (Playwright loads the unpacked extension; `tests/e2e/fixtures.js` provides `context`, `extensionId`, `popup`, plus `serveFixture` to serve captured pages from `tests/fixtures/` at real site URLs). Run `npm test`. CI: `.github/workflows/test.yml`. YouTube player behavior is tested against a stand-in player (`tests/fixtures/youtube/stub-player.html`, opened with `openStubVideo`); `npm run test:live` runs `tests/live/` against real youtube.com (local only, not CI; video ids in `tests/live/videos.js`).
- `fonts/`: bundled Azeret Mono variable font (+ OFL license) used by the popup, bundled so it works offline without remote requests

Popup design source: Figma file "Browser Buddy", page "Popup UI". YouTube tab and its screens (R2, v1.3): dark container "Browser Buddy · YouTube preferences (R2)" (node 35:3), light "… (R2) · Light" (35:4), new tokens on "R2 · New color tokens" (35:5458). Tabs section (R1): dark frame "Browser Buddy · Complete UI (R1)" (node 11:3719). Light: frame "Browser Buddy · Complete UI (R1) · Light" (node 14:6). All frames use hard-coded colors, not Figma variables (the file allows only one variable mode), so a token change means replacing that hex in every frame of the theme. Tokens live as CSS variables at the top of `popup.css`.

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
- Text color tokens (`--text`, `--muted`, `--faint`, `--warn`, …) must reach WCAG AA 4.5:1 on every surface they appear on, in both themes (disabled controls are exempt, as in WCAG 1.4.3, and stay dimmed with `--faint`), and keep a visible step between text, muted and faint. Change Figma and `popup.css` together.
