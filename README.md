# Browser Buddy

Browser Buddy is a compact Manifest V3 extension for Chromium browsers. It brings together a few focused utilities for everyday browsing: YouTube playback controls and a safe duplicate-tab cleanup workflow.

It is designed as a toolbar popup for Chrome and Microsoft Edge, with a minimal dark interface.

## Features

### YouTube

- Playback speed from 0.25× to 4×, with quick presets.
- Global Tutorial Mode. When enabled, a YouTube video automatically pauses when its tab or browser window loses focus, and resumes only if Browser Buddy paused it.
- Global Subscription Clean. On the YouTube Subscriptions feed, hides Shorts shelves and the "Most relevant" shelf.
- Settings can be changed from any browser tab. They are only applied on relevant YouTube pages.

### Tabs

The Tabs section opens to a tools landing page. Select **Remove Duplicates** to launch the cleanup workspace.

- Finds duplicate, unpinned tabs by normalized URL.
- Removes URL fragments, trailing slashes, and common tracking parameters when comparing URLs.
- Keeps query-string variants separate. For example, `/articles?sort=new` and `/articles?sort=top` are not treated as duplicates; the tool flags this distinction in amber.
- Searches by tab title or URL.
- Supports the current window or all open browser windows.
- Shows the browser tab title in each result. Clicking a title focuses that tab and its window.
- Keeps the active tab in a duplicate group, or otherwise the earliest tab. Pinned tabs are never removed.
- Lets you close a single duplicate or remove every removable duplicate in the selected scope.
- Requests confirmation before a bulk removal and offers Undo for eight seconds afterward.

## Install locally

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this `browser-buddy` folder.
5. Pin Browser Buddy from the extensions menu if desired.

Reload the extension on that page after changing source files. Refresh any already-open YouTube page after a reload so its content script is available.

## Project layout

| File | Responsibility |
| --- | --- |
| `manifest.json` | Extension metadata, permissions, popup, service worker, and YouTube content-script registration. |
| `popup.html` | Toolbar popup structure and both feature views. |
| `popup.css` | Dark popup interface and UI states. |
| `popup.js` | Popup controls, tab discovery, grouping, confirmation, and Undo. |
| `background.js` | Detects tab/window focus changes and notifies YouTube pages. |
| `content.js` | Applies YouTube speed, Tutorial Mode, and Subscription Clean behavior. |

## Permissions and privacy

Browser Buddy uses:

- `tabs` to list, focus, create, and close tabs for the duplicate-tab tool.
- `storage` to save playback speed and the two global YouTube preferences locally in the browser.
- `*://*.youtube.com/*` and `*://music.youtube.com/*` only to run the helper on YouTube and YouTube Music pages.

The extension does not send browsing data or settings to a remote service. Tab URLs and titles are read only while the popup is open and are used locally to render duplicate groups.

## Development notes

This project uses plain HTML, CSS, and JavaScript—there is no build step. At minimum, validate edited JavaScript with:

```powershell
node --check popup.js
node --check background.js
node --check content.js
```

Then reload the unpacked extension and test a YouTube video, the Subscriptions feed, individual duplicate removal, bulk removal, and Undo.

## Known limitations

- Subscription Clean uses YouTube page structure and visible English labels; YouTube UI changes or another language can affect which shelves it recognizes.
- Undo recreates closed tabs by URL and approximate original index. It cannot restore a tab's back/forward history or unsaved form state.
- Browser-internal pages that do not expose ordinary URLs cannot meaningfully be grouped as duplicates.
