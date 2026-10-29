const { test, expect, openStubVideo, tabStatus, setSetting } = require('./fixtures');
const { BUILT_IN_PRESETS, toYoutubeSettings } = require('../../lib/caption-style.js');

const style = (id) => BUILT_IN_PRESETS.find((p) => p.id === id).style;
const youtubeStyle = (page) => page.evaluate(() => document.getElementById('movie_player').getSubtitlesUserSettings());
const updates = (page) => page.evaluate(() => window.__bbStub.callsTo('updateSubtitlesUserSettings'));
const status = async (popup, page) => (await tabStatus(popup, page)) || {};
const config = { captions: { on: true, tracks: [{ languageCode: 'en', kind: '' }], track: { languageCode: 'en', kind: '' } } };

async function open(context, popup, enabled, presetId = 'high-contrast', id) {
  await popup.evaluate(([on, s]) => chrome.storage.local.set({ captionStyleEnabled: on, captionStyle: s }), [enabled, style(presetId)]);
  return openStubVideo(context, { id, config });
}

test('disabled leaves YouTube’s style alone', async ({ context, popup }) => {
  const page = await open(context, popup, false);
  await page.waitForTimeout(2000);
  expect(await updates(page)).toEqual([]);
});

test('applies the High contrast preset', async ({ context, popup }) => {
  const page = await open(context, popup, true);
  await expect.poll(() => youtubeStyle(page)).toEqual(toYoutubeSettings(style('high-contrast')));
});

test('re-applies after YouTube resets the style', async ({ context, popup }) => {
  const page = await open(context, popup, true);
  await expect.poll(() => youtubeStyle(page)).toEqual(toYoutubeSettings(style('high-contrast')));
  await page.evaluate((classic) => window.__bbStub.driftStyle(classic), toYoutubeSettings(style('classic')));
  await expect.poll(async () => (await youtubeStyle(page)).color, { timeout: 6000 }).toBe('#ff0');
  expect((await status(popup, page)).touched?.captionStyle).toBeUndefined();
});

test('a style changed in the player holds and is reported', async ({ context, popup }) => {
  const page = await open(context, popup, true);
  await expect.poll(async () => (await youtubeStyle(page)).color).toBe('#ff0');
  await page.click('#movie_player');
  await page.evaluate(() => window.__bbStub.userSetStyle({ color: '#0f0' }));
  await page.waitForTimeout(4000);
  expect((await youtubeStyle(page)).color).toBe('#0f0');
  await expect.poll(async () => (await status(popup, page)).touched?.captionStyle?.color).toBe('#0f0');
});

test('a popup style change reaches untouched tabs only', async ({ context, popup }) => {
  const touchedTab = await open(context, popup, true, 'high-contrast', 'stubA');
  const otherTab = await openStubVideo(context, { id: 'stubB', config });
  await expect.poll(async () => (await youtubeStyle(otherTab)).color).toBe('#ff0');
  await touchedTab.bringToFront();
  await expect.poll(async () => (await youtubeStyle(touchedTab)).color).toBe('#ff0');
  await touchedTab.click('#movie_player');
  await touchedTab.evaluate(() => window.__bbStub.userSetStyle({ color: '#0f0' }));
  await expect.poll(async () => (await status(popup, touchedTab)).touched?.captionStyle?.color).toBe('#0f0');
  await setSetting(popup, 'captionStyle', style('large-print'));
  await expect.poll(async () => (await youtubeStyle(otherTab)).fontSizeIncrement).toBe(1);
  expect((await youtubeStyle(touchedTab)).color).toBe('#0f0');
});

test('waits out an ad without errors', async ({ context, popup }) => {
  const errors = [];
  const page = await open(context, popup, false);
  page.on('pageerror', (error) => errors.push(error));
  await page.evaluate(() => window.__bbStub.startAd());
  await setSetting(popup, 'captionStyleEnabled', true);
  await page.waitForTimeout(2000);
  expect(await updates(page)).toEqual([]);
  await page.evaluate(() => window.__bbStub.endAd());
  await expect.poll(async () => (await youtubeStyle(page)).color).toBe('#ff0');
  expect(errors).toEqual([]);
});
