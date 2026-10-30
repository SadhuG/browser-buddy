const { test, expect, openStubVideo, tabStatus, setSetting, openPopupForTab, openPages } = require('./fixtures');

const LEVELS = { 2160: 'hd2160', 1440: 'hd1440', 1080: 'hd1080', 720: 'hd720', 480: 'large', 360: 'medium', 240: 'small', 144: 'tiny' };
const levels = (max) => Object.entries(LEVELS).filter(([h]) => Number(h) <= max).sort((a, b) => b[0] - a[0])
  .map(([h, quality]) => ({ qualityLabel: `${h}p`, quality, isPlayable: true }));
const rate = (page) => page.evaluate(() => document.querySelector('video').playbackRate);
const status = async (popup, page) => (await tabStatus(popup, page)) || {};

test('touched speed shows a note and Use Browser Buddy setting restores it', async ({ context, popup }) => {
  await setSetting(popup, 'playbackSpeed', 1.25);
  const page = await openStubVideo(context);
  await expect.poll(() => rate(page)).toBe(1.25);
  await page.click('video');
  await page.evaluate(() => { document.querySelector('video').playbackRate = 1.5; });
  await expect.poll(async () => (await status(popup, page)).touched?.speed).toBe(1.5);
  await openPopupForTab(popup, page);
  const note = popup.locator('.touch-note[data-setting=speed]');
  await expect(note).toContainText('This video: 1.5× set in player');
  await note.locator('.use-bb-setting').click();
  await expect.poll(() => rate(page)).toBe(1.25);
  await expect(note).toHaveCount(0);
});

test('touched quality shows its value', async ({ context, popup }) => {
  await setSetting(popup, 'quality', '1080');
  const page = await openStubVideo(context, { config: { quality: { available: levels(2160), current: 'hd720' } } });
  await expect.poll(() => page.evaluate(() => document.getElementById('movie_player').getPlaybackQuality())).toBe('hd1080');
  await page.click('#movie_player');
  await page.evaluate(() => window.__bbStub.userSetQuality('large'));
  await expect.poll(async () => (await status(popup, page)).touched?.quality).toBe('large');
  await openPopupForTab(popup, page);
  await expect(popup.locator('#qualityRow .row-note')).toContainText('This video: 480p set in player');
  await popup.click('#qualityRow');
  await expect(popup.locator('#qualityScreen .touch-note[data-setting=quality]')).toContainText('This video: 480p set in player');
});

test('miniplayer shows "480p in miniplayer"', async ({ context, popup }) => {
  await setSetting(popup, 'quality', '1080');
  const page = await openStubVideo(context, { config: { quality: { available: levels(2160), current: 'hd720' } } });
  await page.evaluate(() => window.__bbStub.setMiniplayer(true));
  await expect.poll(async () => (await status(popup, page)).auto?.quality).toEqual({ height: 480, reason: 'miniplayer' });
  await openPopupForTab(popup, page);
  await expect(popup.locator('#qualityRow .auto-note[data-setting=quality]')).toHaveText('480p in miniplayer');
  await popup.click('#qualityRow');
  await expect(popup.locator('#qualityScreen .auto-note[data-setting=quality]')).toContainText('480p in miniplayer');
});

test('max-1080 video shows the unavailable note for a 1440p choice', async ({ context, popup }) => {
  await setSetting(popup, 'quality', '1440');
  const page = await openStubVideo(context, { config: { quality: { available: levels(1080), current: 'hd720' } } });
  await expect.poll(async () => (await status(popup, page)).unavailable?.quality).toEqual({ maxHeight: 1080 });
  await openPopupForTab(popup, page);
  await popup.click('#qualityRow');
  await expect(popup.locator('#qualityScreen .unavailable-note[data-setting=quality]')).toHaveText('This video tops out at 1080p.');
});

test('no notes on a non-YouTube tab', async ({ context, popup }) => {
  const [page] = await openPages(context, ['https://dupes.test/a']);
  await openPopupForTab(popup, page);
  await expect(popup.locator('.touch-note, .auto-note, .unavailable-note, .row-note')).toHaveCount(0);
  await expect(popup.locator('#qualityRow .row-value')).toHaveText('Auto');
});
