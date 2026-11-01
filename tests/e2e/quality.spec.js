const { test, expect, openStubVideo, tabStatus, setSetting } = require('./fixtures');

const LEVELS = { 2160: 'hd2160', 1440: 'hd1440', 1080: 'hd1080', 720: 'hd720', 480: 'large', 360: 'medium', 240: 'small', 144: 'tiny' };
const levels = (max = 2160) => Object.entries(LEVELS).filter(([h]) => Number(h) <= max).sort((a, b) => b[0] - a[0])
  .map(([h, quality]) => ({ qualityLabel: `${h}p`, quality, isPlayable: true }));
const qualityConfig = (max) => ({ quality: { available: levels(max), current: 'hd720' } });

const current = (page) => page.evaluate(() => document.getElementById('movie_player').getPlaybackQuality());
const rangeCalls = (page) => page.evaluate(() => window.__bbStub.callsTo('setPlaybackQualityRange'));
const status = async (popup, page) => (await tabStatus(popup, page)) || {};

async function open(context, popup, quality, { max, id } = {}) {
  await setSetting(popup, 'quality', quality);
  return openStubVideo(context, { id, config: qualityConfig(max) });
}

test('auto never touches quality', async ({ context, popup }) => {
  const page = await open(context, popup, 'auto');
  await page.waitForTimeout(2000);
  expect(await rangeCalls(page)).toEqual([]);
});

test('applies the chosen resolution', async ({ context, popup }) => {
  const page = await open(context, popup, '1080');
  await expect.poll(() => rangeCalls(page)).toContainEqual(['setPlaybackQualityRange', 'hd1080', 'hd1080']);
  expect(await current(page)).toBe('hd1080');
});

test('falls back and reports the maximum', async ({ context, popup }) => {
  const page = await open(context, popup, '1440', { max: 1080 });
  await expect.poll(() => current(page)).toBe('hd1080');
  await expect.poll(async () => (await status(popup, page)).unavailable?.quality).toEqual({ maxHeight: 1080 });
});

test('a user pick holds', async ({ context, popup }) => {
  const page = await open(context, popup, '1080');
  await expect.poll(() => current(page)).toBe('hd1080');
  await page.click('#movie_player');
  await page.evaluate(() => window.__bbStub.userSetQuality('large'));
  await page.waitForTimeout(4000);
  expect(await current(page)).toBe('large');
  await expect.poll(async () => (await status(popup, page)).touched?.quality).toBe('large');
});

test('drift is corrected', async ({ context, popup }) => {
  const page = await open(context, popup, '1080');
  await expect.poll(() => current(page)).toBe('hd1080');
  await page.evaluate(() => window.__bbStub.driftQuality('medium'));
  await expect.poll(() => current(page), { timeout: 6000 }).toBe('hd1080');
  expect((await status(popup, page)).touched?.quality).toBeUndefined();
});

test('a popup change skips the touched video', async ({ context, popup }) => {
  const touchedTab = await open(context, popup, '1080', { id: 'stubA' });
  const otherTab = await openStubVideo(context, { id: 'stubB', config: qualityConfig() });
  await expect.poll(() => current(otherTab)).toBe('hd1080');
  await expect.poll(() => current(touchedTab)).toBe('hd1080');
  await touchedTab.evaluate(() => window.__bbStub.userSetQuality('large'));
  await expect.poll(async () => (await status(popup, touchedTab)).touched?.quality).toBe('large');
  await setSetting(popup, 'quality', '720');
  await expect.poll(() => current(otherTab)).toBe('hd720');
  expect(await current(touchedTab)).toBe('large');
});

test('the next video resets the touch', async ({ context, popup }) => {
  const page = await open(context, popup, '1080');
  await expect.poll(() => current(page)).toBe('hd1080');
  await page.evaluate(() => window.__bbStub.userSetQuality('large'));
  await expect.poll(async () => (await status(popup, page)).touched?.quality).toBe('large');
  await page.evaluate(() => window.__bbStub.loadVideo('stub2'));
  await expect.poll(() => current(page)).toBe('hd1080');
  await expect.poll(async () => (await status(popup, page)).touched?.quality).toBeUndefined();
});

test('miniplayer steps down and back', async ({ context, popup }) => {
  const page = await open(context, popup, '1080');
  await expect.poll(() => current(page)).toBe('hd1080');
  await page.evaluate(() => window.__bbStub.setMiniplayer(true));
  await expect.poll(() => current(page)).toBe('large');
  await expect.poll(async () => (await status(popup, page)).auto?.quality).toEqual({ height: 480, reason: 'miniplayer' });
  await page.evaluate(() => window.__bbStub.setMiniplayer(false));
  await expect.poll(() => current(page)).toBe('hd1080');
});

test('low battery steps down', async ({ context, popup }) => {
  const page = await open(context, popup, '1080');
  await expect.poll(() => current(page)).toBe('hd1080');
  await page.evaluate(() => window.__bbStub.setBattery({ charging: false, level: 0.15 }));
  await expect.poll(() => current(page)).toBe('hd720');
  await expect.poll(async () => (await status(popup, page)).auto?.quality).toEqual({ height: 720, reason: 'battery' });
  await page.evaluate(() => window.__bbStub.setBattery({ charging: true, level: 0.15 }));
  await expect.poll(() => current(page)).toBe('hd1080');
});

test('nothing applies during an ad', async ({ context, popup }) => {
  const page = await open(context, popup, '1080');
  await expect.poll(() => current(page)).toBe('hd1080');
  await page.evaluate(() => window.__bbStub.startAd());
  const before = (await rangeCalls(page)).length;
  await setSetting(popup, 'quality', '480');
  await page.waitForTimeout(2000);
  expect((await rangeCalls(page)).length).toBe(before);
  await page.evaluate(() => window.__bbStub.endAd());
  await expect.poll(() => current(page)).toBe('large');
});

test('switching back to auto releases the player', async ({ context, popup }) => {
  const page = await open(context, popup, '1080');
  await expect.poll(() => current(page)).toBe('hd1080');
  await setSetting(popup, 'quality', 'auto');
  await expect.poll(() => rangeCalls(page)).toContainEqual(['setPlaybackQualityRange', 'auto', 'auto']);
  await page.waitForTimeout(1500);
  expect((await rangeCalls(page)).filter((call) => call[1] === 'auto')).toHaveLength(1);
});

// YouTube keeps the menu pick from video to video, so the same pick on the next video
// doesn't change the stored preference.
test('picking the same resolution again on the next video holds', async ({ context, popup }) => {
  const page = await open(context, popup, '1080');
  await expect.poll(() => current(page)).toBe('hd1080');
  await page.click('#movie_player');
  await page.evaluate(() => window.__bbStub.userSetQuality('large'));
  await expect.poll(async () => (await status(popup, page)).touched?.quality).toBe('large');
  await page.evaluate(() => window.__bbStub.loadVideo('stub2'));
  await expect.poll(() => current(page)).toBe('hd1080');
  await page.click('#movie_player');
  await page.evaluate(() => window.__bbStub.userSetQuality('large'));
  await page.waitForTimeout(4000);
  expect(await current(page)).toBe('large');
  await expect.poll(async () => (await status(popup, page)).touched?.quality).toBe('large');
});

test('switching to auto skips the touched video', async ({ context, popup }) => {
  const page = await open(context, popup, '1080');
  await expect.poll(() => current(page)).toBe('hd1080');
  await page.click('#movie_player');
  await page.evaluate(() => window.__bbStub.userSetQuality('large'));
  await expect.poll(async () => (await status(popup, page)).touched?.quality).toBe('large');
  await setSetting(popup, 'quality', 'auto');
  await page.waitForTimeout(2000);
  expect((await rangeCalls(page)).filter((call) => call[1] === 'auto')).toEqual([]);
  expect(await current(page)).toBe('large');
});

// The repeat-pick rule needs input: YouTube moving to the remembered menu quality on its own
// on the next video is drift and gets corrected.
test('on the next video, YouTube moving to the remembered pick by itself is corrected', async ({ context, popup }) => {
  const page = await open(context, popup, '1080');
  await expect.poll(() => current(page)).toBe('hd1080');
  await page.click('#movie_player');
  await page.evaluate(() => window.__bbStub.userSetQuality('large'));
  await expect.poll(async () => (await status(popup, page)).touched?.quality).toBe('large');
  await page.evaluate(() => window.__bbStub.loadVideo('stub2'));
  await expect.poll(() => current(page)).toBe('hd1080');
  await page.evaluate(() => window.__bbStub.driftQuality('large'));
  await expect.poll(() => current(page), { timeout: 6000 }).toBe('hd1080');
  expect((await status(popup, page)).touched?.quality).toBeUndefined();
});

// Leaving a video (Home, a Short) and coming back to it later is a new viewing: the touch ends.
// The miniplayer isn't leaving (see 'miniplayer steps down and back').
for (const [where, away] of [['Home', '/'], ['a Short', '/shorts/abc']]) {
  test(`coming back to a video from ${where} starts fresh`, async ({ context, popup }) => {
    const page = await open(context, popup, '1080');
    await expect.poll(() => current(page)).toBe('hd1080');
    await page.click('#movie_player');
    await page.evaluate(() => window.__bbStub.userSetQuality('large'));
    await expect.poll(async () => (await status(popup, page)).touched?.quality).toBe('large');
    await page.evaluate((path) => history.pushState({}, '', path), away);
    // Leaving needs AWAY_TICKS (2) one-second ticks: wait until the bridge reports it, then
    // allow two more ticks so a slow runner still counts the video as left.
    await expect.poll(async () => (await status(popup, page)).surface ?? null).toBeNull();
    await page.waitForTimeout(2500);
    await page.evaluate(() => history.pushState({}, '', '/watch?v=stub1'));
    await expect.poll(() => current(page)).toBe('hd1080');
    expect((await status(popup, page)).touched?.quality).toBeUndefined();
  });
}
