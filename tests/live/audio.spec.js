const { test, expect, tabStatus } = require('../e2e/fixtures');
const { openVideo } = require('./live-helpers');
const videos = require('./videos');

// The track the real player is playing, parsed with the same rules the extension uses.
const playingTrack = (page) => page.evaluate(() => {
  const p = document.getElementById('movie_player');
  const current = p.getAudioTrack();
  const info = Object.values(current).find((v) => v && typeof v === 'object' && typeof v.name === 'string' && typeof v.id === 'string');
  return info ? { name: info.name, id: info.id } : null;
});

async function openWithAudio(context, popup, id) {
  await popup.evaluate(() => chrome.storage.local.set({ audioTrackEnabled: true, myLanguages: ['en', 'hi'] }));
  return openVideo(context, id);
}

test('multiDub plays the English original', async ({ context, popup }) => {
  const page = await openWithAudio(context, popup, videos.multiDub);
  await expect.poll(async () => (await tabStatus(popup, page))?.audioChoice, { timeout: 20000 }).toEqual({ reason: 'original', language: 'en' });
  await expect.poll(async () => (await playingTrack(page))?.id, { timeout: 15000 }).toMatch(/^en.*\.4$/);
});

test('hindiOriginal plays Hindi', async ({ context, popup }) => {
  const page = await openWithAudio(context, popup, videos.hindiOriginal);
  await expect.poll(async () => (await tabStatus(popup, page))?.audioChoice, { timeout: 20000 }).toEqual({ reason: 'original', language: 'hi' });
  await expect.poll(async () => (await playingTrack(page))?.id, { timeout: 15000 }).toBe('hi.4');
});

test('foreignWithEnglishDub plays the English dub', async ({ context, popup }) => {
  const page = await openWithAudio(context, popup, videos.foreignWithEnglishDub);
  await expect.poll(async () => (await tabStatus(popup, page))?.audioChoice, { timeout: 20000 }).toEqual({ reason: 'dub', language: 'en' });
  await expect.poll(async () => (await playingTrack(page))?.id, { timeout: 15000 }).toMatch(/^en.*\.3$/);
});
