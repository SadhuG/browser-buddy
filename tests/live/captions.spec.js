const { test, expect, setSetting } = require('../e2e/fixtures');
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
