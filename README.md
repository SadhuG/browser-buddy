# Browser Buddy

Browser Buddy is a compact Manifest V3 extension for Chromium browsers. It brings together a few focused utilities for everyday browsing: YouTube playback controls and a safe duplicate-tab cleanup workflow.

It is designed as a toolbar popup for Chrome and Microsoft Edge, with a monospaced interface set in Azeret Mono, in light and dark themes.

## Features

### Appearance

- Light and dark themes. The sun and moon switch in the popup header picks one and remembers it; until you pick, the popup follows the system setting.

### YouTube

The YouTube tab shows playback speed, one summary row each for Resolution, Audio and Captions, and the Tutorial mode and Subscription clean switches. Each row shows its current setting; select it to open its screen, and **← YouTube** to come back.

- Playback speed from 0.25× to 4×, with quick presets. A speed you pick in YouTube's own player holds for that video; the next video uses Browser Buddy's speed again.
- **Resolution** screen: a preferred resolution for every video, from 144p to 4K or Highest available. If a video doesn't offer it, the closest lower resolution plays. In the miniplayer (two steps lower) and on battery below 20% (one step lower), Browser Buddy plays a little lower automatically. A quality you pick in YouTube's own menu holds for that video.
- **Captions** screen: always on, always off, or YouTube's choice, in your languages (English and Hindi by default; auto-translated when a video has neither). With **Style captions** on, your style, built only from YouTube's own options, is applied on every video and restored if YouTube resets it. A live preview shows it over a grey video frame. Pick one of four built-in looks (Classic, High contrast, Minimal, Large print), or set font, color, opacity, size, edge, background and window yourself; **Reset to Classic** goes back. Captions you switch off or restyle in YouTube's own player stay that way for that video. YouTube uses one caption style for all its tabs, so a style you pick in its player shows in every YouTube tab until that video ends; choosing a style in the popup, or **Use Browser Buddy setting** in any tab, switches every tab back.
- **Presets** screen (from **Manage presets**): save the current style as your own preset, then rename, edit or delete it. Built-in looks can be edited too, and an edited one can be reset. When you've restyled captions in YouTube's player, the Captions screen offers to save that look as a preset.
- **Audio** screen: with **Choose audio track** on, originals in your languages play as-is. Other videos play your first available dub, preferring human dubs over AI dubs, or the original with captions in your language when there's no dub. **My languages** (English and Hindi by default) is a ranked list you can add to, reorder with the up and down buttons, and trim; it also picks caption languages. A track you pick in YouTube's own menu holds for that video.
- Notes about the video in the active tab: when you changed a setting in YouTube's player, a blue note says so ("This video: 1.5× set in player") with **Use Browser Buddy setting** to switch back. A change lasts while you watch that video, including in the miniplayer; leaving it (for Home or a Short) and coming back starts it fresh. Grey notes tell you when Browser Buddy lowered the resolution on its own ("720p on battery") or when a video can't follow a setting ("This video tops out at 1080p", "No other audio tracks on this video").
- Global Tutorial Mode. When enabled, a YouTube video automatically pauses when its tab or browser window loses focus, and resumes only if Browser Buddy paused it.
- Global Subscription Clean. On the YouTube Subscriptions feed, hides Shorts shelves and the "Most relevant" shelf. Shorts shelves are recognized by page structure in any language; other shelves and videos are left alone.
- Settings can be changed from any browser tab. They are only applied on relevant YouTube pages; YouTube Music is excluded and keeps its own playback speed.

### Tabs

The Tabs section opens to a tools landing page. Select **Open** on **Close duplicate tabs** to launch the cleanup workspace.

- **Hide Amazon cart** is off by default. When enabled, it immediately hides Amazon's cart sidebar on supported Amazon storefronts and continues to hide it as the page updates. If no recognized sidebar is present on the active Amazon page, the popup shows an amber note explaining that the cart will be hidden on pages that show one. The cart page's own Subtotal and Proceed to checkout box is never hidden.
- The docked cart sidebar has been verified on amazon.com, amazon.co.uk, amazon.de, amazon.in and amazon.co.jp, on product, search results and "Added to cart" pages.
- On Amazon pages, Browser Buddy removes docked-panel right padding and hides the cart arrow for a cleaner layout.

- Finds duplicate, unpinned tabs by normalized URL.
- Removes URL fragments, trailing slashes, and common tracking parameters when comparing URLs.
- Keeps query-string variants separate. For example, `/articles?sort=new` and `/articles?sort=top` are not treated as duplicates; the tool flags this distinction in amber.
- Shows how many tabs will be closed, and names that count on the close button.
- Searches by tab title or URL.
- Supports the current window or all open browser windows. When the current window has no duplicates, it offers to search all windows.
- Shows the browser tab title in each result. Clicking a title focuses that tab and its window.
- Keeps the active tab in a duplicate group, or otherwise the earliest tab. Pinned tabs are never removed.
- Lets you close a single duplicate or remove every removable duplicate in the selected scope.
- Closing a single duplicate leaves a dimmed "Closed" row in its place with Undo right under the cursor. A thin line counts down eight seconds, then the row folds away.
- Requests confirmation before a bulk removal and offers Undo in a single message for eight seconds afterward.

## Install locally

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this `browser-buddy` folder.
5. Pin Browser Buddy from the extensions menu if desired.

Reload the extension on that page after changing source files. Refresh any already-open YouTube or Amazon page after a reload so its content script is available.

## Project layout

| File | Responsibility |
| --- | --- |
| `manifest.json` | Extension metadata, permissions, popup, service worker, and YouTube/Amazon content-script registration. |
| `popup.html` | Toolbar popup structure and both feature views. |
| `popup.css` | Popup interface, light and dark theme colors, and UI states. |
| `theme.js` | Applies the saved or system theme before the popup paints, and handles the theme switch. |
| `fonts/` | Bundled Azeret Mono variable font used by the popup, with its OFL license. |
| `popup.js` | Popup controls: speed, the Resolution, Audio, Captions and Presets screens, per-video notes, tab discovery, confirmation, and Undo. |
| `lib/duplicate-tabs.js` | Duplicate-tab URL normalization and grouping, shared by the popup and the unit tests. |
| `lib/settings.js` | Setting defaults and validation, shared by the content scripts, popup and unit tests. |
| `lib/quality.js` | Picks the resolution to play from your choice, what the video offers, the miniplayer and the battery. |
| `lib/languages.js` | Matches languages by base language, so every English variant counts as English. |
| `lib/caption-style.js` | YouTube's caption style values, the built-in presets, and the CSS for the popup's caption preview. |
| `lib/caption-track.js` | Chooses the caption track from My languages. |
| `lib/audio-track.js` | Reads YouTube's audio tracks and chooses one from My languages. |
| `lib/presets.js` | Creates, renames, edits, deletes and resets caption presets. |
| `lib/touch.js` | Tells Browser Buddy's own changes apart from changes you make in YouTube's player, so your change holds for that video. |
| `background.js` | Detects tab/window focus changes and notifies YouTube pages. |
| `content.js` | Applies YouTube controls and the Amazon cart-sidebar preference, and relays settings to `page-bridge.js`. |
| `page-bridge.js` | Runs inside YouTube pages to reach YouTube's own player controls; talks to `content.js` through window messages. |
| `package.json`, `playwright.config.js`, `playwright.live.config.js`, `tests/` | Dev-only test tooling. The extension never loads these. |

## Permissions and privacy

Browser Buddy uses:

- `tabs` to list, focus, create, and close tabs for the duplicate-tab tool.
- `storage` to save playback speed and global preferences locally in the browser. The theme choice is kept in the popup's own local storage.
- YouTube and Amazon storefront host access only to run the helper on those pages. YouTube Music is excluded from the helper.

The extension does not send browsing data or settings to a remote service. Tab URLs and titles are read only while the popup is open and are used locally to render duplicate groups.

## Development notes

The extension itself uses plain HTML, CSS, and JavaScript with no build step and no runtime dependencies. Automated tests use Node and Playwright as dev-only tooling:

```powershell
npm install
npx playwright install chromium
npm test
```

`npm test` runs `node --check` on the scripts, the Node unit tests in `tests/unit/`, and the Playwright end-to-end tests in `tests/e2e/`, which load the unpacked extension in Chromium. GitHub Actions runs the same command on every push and pull request.

`npm run test:live` runs `tests/live/` against real youtube.com videos (listed in `tests/live/videos.js`). It needs the network and is slower and flakier because of ads, so it runs locally only, not in CI. YouTube behavior the e2e tests can't capture is tested against a stand-in player, `tests/fixtures/youtube/stub-player.html`.

Duplicate-tab removal, bulk confirmation, Undo, the Amazon cart sidebar toggle, and Subscription Clean are covered automatically. Amazon and YouTube tests run against trimmed, anonymized pages captured from the live sites in `tests/fixtures/`. After reloading the unpacked extension, still check playback speed and Tutorial Mode on a YouTube video by hand, and glance at the live Subscriptions feed with Subscription Clean on.

## Known limitations

- Subscription Clean finds Shorts shelves by page structure, which works in any UI language. The "Most relevant" shelf has no structural marker, so it is matched by its exact title and is only recognized in English (verified with en-GB); in other languages it stays visible. YouTube page changes can affect either check.
- Amazon's page structure can change; Browser Buddy shows a popup warning when it cannot recognize a cart sidebar on the current Amazon page. Other supported storefronts use the same sidebar as the verified ones (amazon.com, .co.uk, .de, .in and .co.jp) but are not covered by captured test pages.
- Undo recreates closed tabs by URL and approximate original index. It cannot restore a tab's back/forward history or unsaved form state.
- Browser-internal pages that do not expose ordinary URLs cannot meaningfully be grouped as duplicates.
