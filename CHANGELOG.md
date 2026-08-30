# Changelog

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
