const { test, expect, setSetting, tabStatus } = require('../e2e/fixtures');
const { BUILT_IN_PRESETS } = require('../../lib/caption-style.js');
const { openVideo } = require('./live-helpers');
const videos = require('./videos');

const highContrast = BUILT_IN_PRESETS.find((p) => p.id === 'high-contrast').style;
const captionState = (page) => page.evaluate(() => {
  const p = document.getElementById('movie_player');
  const track = p.isSubtitlesOn() ? p.getOption('captions', 'track') : null;
  return { on: p.isSubtitlesOn(), language: track && track.languageCode, translatedTo: track && track.translationLanguage && track.translationLanguage.languageCode };
});
const styleColor = (page) => page.evaluate(() => (document.getElementById('movie_player').getSubtitlesUserSettings() || {}).color);

test('captions on in English on the multi-dub video', async ({ context, popup }) => {
  await setSetting(popup, 'captionsMode', 'on');
  const page = await openVideo(context, videos.multiDub);
  await expect.poll(async () => (await captionState(page)).on, { timeout: 20000 }).toBe(true);
  expect((await captionState(page)).language).toMatch(/^en/);
});

test('High contrast is applied and re-applied after YouTube changes it', async ({ context, popup }) => {
  await popup.evaluate((style) => chrome.storage.local.set({ captionStyleEnabled: true, captionStyle: style }), highContrast);
  const page = await openVideo(context, videos.multiDub);
  await expect.poll(() => styleColor(page), { timeout: 20000 }).toBe('#ff0');
  // A change with no user input, like YouTube's own reset, is drift and gets corrected.
  await page.evaluate(() => document.getElementById('movie_player').updateSubtitlesUserSettings({ color: '#fff' }));
  await expect.poll(() => styleColor(page), { timeout: 10000 }).toBe('#ff0');
});

test('a foreign video gets English captions by auto-translation', async ({ context, popup }) => {
  await setSetting(popup, 'captionsMode', 'on');
  const page = await openVideo(context, videos.foreignNoDubWithCaptions);
  await expect.poll(async () => (await captionState(page)).translatedTo, { timeout: 20000 }).toBe('en');
});

// Review focus 1. YouTube keeps one caption style for all tabs and pushes every change to the
// other tabs' players within 0.5 s (measured 2026-10-30), so a style picked in tab A's menu is
// shared: tab B starting a video must not replace it, and both tabs show it until A's video ends.
test('a style touched in one tab holds in every tab when another tab starts a video', async ({ context, popup }) => {
  await popup.evaluate((style) => chrome.storage.local.set({ captionStyleEnabled: true, captionStyle: style }), highContrast);
  const tabA = await openVideo(context, videos.multiDub);
  await expect.poll(() => styleColor(tabA), { timeout: 20000 }).toBe('#ff0');
  await tabA.keyboard.press('Shift'); // trusted input, as when using YouTube's menu
  await tabA.evaluate(() => document.getElementById('movie_player').updateSubtitlesUserSettings({ color: '#0f0' }));
  await expect.poll(async () => (await tabStatus(popup, tabA))?.touched?.captionStyle?.color, { timeout: 10000 }).toBe('#0f0');
  // Two videos playing at once in a test browser make YouTube show "Something went wrong" after
  // ~40 s, with or without Browser Buddy; pausing tab A keeps that out of this check.
  await tabA.evaluate(() => document.querySelector('#movie_player video').pause());

  const tabB = await openVideo(context, videos.foreignWithEnglishDub);
  await tabB.waitForTimeout(4000);
  expect(await styleColor(tabB)).toBe('#0f0');
  expect(await styleColor(tabA)).toBe('#0f0');
  expect((await tabStatus(popup, tabA))?.touched?.captionStyle?.color).toBe('#0f0');
  expect((await tabStatus(popup, tabB))?.touched?.captionStyle?.color).toBe('#0f0');
});
