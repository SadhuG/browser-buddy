const { test, expect, openStubVideo, tabStatus, setSetting, clearTouch } = require('./fixtures');
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

// YouTube keeps one caption style for every tab (the stub models this), so a style picked in
// YouTube's menu is shared: every tab shows it until the touched video ends.
async function touchGreen(popup, page) {
  await page.bringToFront();
  await page.click('#movie_player');
  await page.evaluate(() => window.__bbStub.userSetStyle({ color: '#0f0' }));
  await expect.poll(async () => (await status(popup, page)).touched?.captionStyle?.color).toBe('#0f0');
}
async function touchedThenSecondTab(context, popup) {
  const tabA = await open(context, popup, true, 'high-contrast', 'stubA');
  await expect.poll(async () => (await youtubeStyle(tabA)).color).toBe('#ff0');
  await touchGreen(popup, tabA);
  const tabB = await openStubVideo(context, { id: 'stubB', config });
  // Wait until tab B's bridge has read the shared touch, instead of a fixed delay.
  await expect.poll(async () => (await status(popup, tabB)).touched?.captionStyle?.color, { timeout: 10000 }).toBe('#0f0');
  return { tabA, tabB };
}

test('a style touched in one tab holds in every tab when another tab starts a video', async ({ context, popup }) => {
  const { tabA, tabB } = await touchedThenSecondTab(context, popup);
  expect((await youtubeStyle(tabA)).color).toBe('#0f0');
  expect((await youtubeStyle(tabB)).color).toBe('#0f0');
  expect((await status(popup, tabB)).touched?.captionStyle?.color).toBe('#0f0');
});

test('the shared style touch ends when its video ends', async ({ context, popup }) => {
  const { tabA, tabB } = await touchedThenSecondTab(context, popup);
  await tabA.evaluate(() => window.__bbStub.loadVideo('stub2'));
  await expect.poll(async () => (await youtubeStyle(tabA)).color).toBe('#ff0');
  await expect.poll(async () => (await youtubeStyle(tabB)).color).toBe('#ff0');
  await expect.poll(async () => (await status(popup, tabB)).touched?.captionStyle).toBeUndefined();
});

test('Use Browser Buddy setting in another tab ends the shared style touch', async ({ context, popup }) => {
  const { tabA, tabB } = await touchedThenSecondTab(context, popup);
  await clearTouch(popup, 'captionStyle', tabB);
  await expect.poll(async () => (await youtubeStyle(tabB)).color).toBe('#ff0');
  await expect.poll(async () => (await youtubeStyle(tabA)).color).toBe('#ff0');
  await expect.poll(async () => (await status(popup, tabA)).touched?.captionStyle).toBeUndefined();
});

// The newest deliberate choice wins: YouTube can't show two styles at once, so a popup style
// change replaces a touched style everywhere instead of skipping the touched video.
test('a popup style change replaces a touched style in every tab', async ({ context, popup }) => {
  const { tabA, tabB } = await touchedThenSecondTab(context, popup);
  await setSetting(popup, 'captionStyle', style('large-print'));
  await expect.poll(async () => (await youtubeStyle(tabA)).fontSizeIncrement).toBe(1);
  await expect.poll(async () => (await youtubeStyle(tabB)).fontSizeIncrement).toBe(1);
  await expect.poll(async () => (await status(popup, tabA)).touched?.captionStyle).toBeUndefined();
});

// Re-applying a style YouTube already has would blink captions off and on for nothing.
test('leaves a style YouTube already has alone, without blinking captions', async ({ context, popup }) => {
  await popup.evaluate((s) => chrome.storage.local.set({ captionStyleEnabled: true, captionStyle: s }), style('high-contrast'));
  const page = await openStubVideo(context, { config: { ...config, style: toYoutubeSettings(style('high-contrast')) } });
  const toggles = () => page.evaluate(() => window.__bbStub.callsTo('toggleSubtitles'));
  await page.waitForTimeout(2000);
  expect(await updates(page)).toEqual([]);
  expect(await toggles()).toEqual([]);
  await page.evaluate(() => window.__bbStub.loadVideo('stub2'));
  await page.waitForTimeout(1500);
  expect(await updates(page)).toEqual([]);
  expect(await toggles()).toEqual([]);
});

test('waits out an ad without errors', async ({ context, popup }) => {
  const errors = [];
  // Listen before the page opens so errors on load and in the first ticks count too.
  context.on('page', (opened) => opened.on('pageerror', (error) => errors.push(error)));
  const page = await open(context, popup, false);
  await page.evaluate(() => window.__bbStub.startAd());
  await setSetting(popup, 'captionStyleEnabled', true);
  await page.waitForTimeout(2000);
  expect(await updates(page)).toEqual([]);
  await page.evaluate(() => window.__bbStub.endAd());
  await expect.poll(async () => (await youtubeStyle(page)).color).toBe('#ff0');
  expect(errors).toEqual([]);
});
