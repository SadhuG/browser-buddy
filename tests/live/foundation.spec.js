const { test, expect, tabStatus, setSetting } = require('../e2e/fixtures');
const { openVideo } = require('./live-helpers');
const videos = require('./videos');

test('bridge reports status on a real watch page', async ({ context, popup }) => {
  const page = await openVideo(context, videos.multiDub);
  await expect.poll(async () => (await tabStatus(popup, page))?.videoId, { timeout: 30000 }).toBe(videos.multiDub);
});

test('popup speed applies to a real video and a player change holds', async ({ context, popup }) => {
  await setSetting(popup, 'playbackSpeed', 1.25);
  const page = await openVideo(context, videos.multiDub);
  const rate = () => page.evaluate(() => document.querySelector('#movie_player video').playbackRate);
  await expect.poll(rate, { timeout: 15000 }).toBe(1.25);
  // A real click, then a speed change through YouTube's own player API: the user's change.
  await page.locator('#movie_player').hover();
  await page.mouse.down(); await page.mouse.up();
  await page.evaluate(() => document.getElementById('movie_player').setPlaybackRate(1.5));
  await page.waitForTimeout(3000);
  expect(await rate()).toBe(1.5);
  await expect.poll(async () => (await tabStatus(popup, page)).touched.speed).toBe(1.5);
});
