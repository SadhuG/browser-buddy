# Changelog

## Unreleased

### Changed

- Secondary and faint text has more contrast in both themes, so the search placeholder, closed-tab titles and unselected toggle labels meet WCAG AA (4.5:1). Secondary text is brighter in dark mode and darker in light mode, keeping a clear step between regular, secondary and faint text.
- A playback speed you pick in YouTube's own player now holds for that video; the next video uses Browser Buddy's speed again.

## v1.2.0

Release: 2026-10-29

### Added

- Light theme, with a sun and moon switch in the popup header. The choice is remembered; until one is picked, the popup follows the system light or dark setting.
- End-to-end tests for the theme switch: following the system setting, switching themes, and keeping the choice when the popup reopens.
- End-to-end tests for Hide Amazon cart, using pages captured from amazon.com, .co.uk, .de, .in and .co.jp: hiding and restoring the sidebar, a sidebar that appears after load, and the popup's "no sidebar found" check.
- End-to-end tests for Subscription Clean, using an anonymized capture of the Subscriptions feed.

### Changed

- Subscription Clean recognizes Shorts shelves by page structure, not by their "Shorts" title, so it works in any YouTube UI language.
- Closing a single duplicate no longer shows a floating message that covered the bottom of the list. The tab stays in place as a "Closed" row with its own Undo and an eight-second countdown line, then folds away. Bulk removal still uses a single message with Undo.

### Fixed

- Tabs reopened by Undo are counted again immediately, before they finish loading.
- Hide Amazon cart no longer hides the Subtotal and Proceed to checkout box on the cart page, and the popup no longer counts that box as a cart sidebar.
- Subscription Clean only hides a shelf titled exactly "Most relevant"; shelves whose titles merely contain those words stay visible.

## v1.1.0

Release: 2026-10-04

### Added

- Automated tests: Node unit tests for duplicate-tab grouping, and Playwright end-to-end tests for duplicate removal, bulk confirmation and Undo. GitHub Actions runs them on every push and pull request.

### Changed

- Redesigned the popup: monospaced Azeret Mono type (bundled locally), square panels with breadcrumb headers, a large speed readout with a scale bar, and off/on segmented switches.
- Duplicates shows a "to close" count, names the exact number on the close button, and asks for confirmation with the same count.
- Empty duplicate results offer **Search all windows**; after closing, the list says no duplicates are left while Undo is available.
- The Amazon cart note now explains that the cart will be hidden on pages that show one.

## v1.0.3

Release: 2026-08-30

### Fixed

- Exclude YouTube Music from the content script so Browser Buddy never changes its playback speed.

## v1.0.2

Release: 2026-08-30

### Added

- Hide Amazon cart toggle in Tabs. It is off by default, applies immediately to open Amazon tabs, and warns in the popup when no supported cart sidebar is found.

### Changed

- Remove Amazon's docked-panel right padding and hide its cart arrow to keep the page layout clean.

## v1.0.0

Release: 2026-08-12

### Added

- Toolbar popup with YouTube and Tabs areas.
- YouTube playback-speed controls and presets.
- Global Tutorial Mode for automatically pausing and resuming YouTube videos on focus changes. The control is available from any tab and applies only to YouTube video pages.
- Global Subscription Clean for hiding Shorts and "Most relevant" content on the YouTube Subscriptions feed. The control is available from any tab and applies only to the Subscriptions feed.
- A Tabs tools landing page and dedicated Remove Duplicates workflow.
- Duplicate detection with current-window and all-windows scope.
- Search by tab title or URL, clickable tab titles, individual removal, protected pinned tabs, bulk confirmation, and Undo.
- Amber warnings for query-string URL variants that are intentionally not merged.
- Hidden confirmation and Undo UI states, preventing them from appearing when the popup opens.
