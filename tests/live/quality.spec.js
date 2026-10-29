const { test, expect, tabStatus, setSetting } = require('../e2e/fixtures');
const { openVideo } = require('./live-helpers');
const videos = require('./videos');

const playing = (page) => page.evaluate(() => document.getElementById('movie_player').getPlaybackQuality());

test('plays the chosen 720p on a real video', async ({ context, popup }) => {
  await setSetting(popup, 'quality', '720');
  const page = await openVideo(context, videos.multiDub);
  await expect.poll(() => playing(page), { timeout: 20000 }).toBe('hd720');
});

test('a low-quality video falls back and reports its maximum', async ({ context, popup }) => {
  await setSetting(popup, 'quality', '1080');
  const page = await openVideo(context, videos.lowQuality);
  await expect.poll(async () => (await tabStatus(popup, page))?.unavailable?.quality, { timeout: 20000 }).toEqual({ maxHeight: 240 });
  await expect.poll(() => playing(page), { timeout: 20000 }).toBe('small');
});
