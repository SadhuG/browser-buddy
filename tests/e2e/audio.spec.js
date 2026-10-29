const { test, expect, openStubVideo, tabStatus, setSetting } = require('./fixtures');
const fixture = require('../unit/fixtures/audio-tracks.json');

// Real tracks from the multi-dub video (English original, Arabic/Hindi/Spanish dubs).
const real = fixture['0e3GPea1Tyg'];
const realId = (name) => real.find((t) => t.info.name === name).id;
// Synthetic tracks: YouTube's id suffix .4 = original, .3 = human dub, .10 = AI dub.
const suffix = { original: 4, dub: 3, ai: 10 };
const raw = (language, kind = 'dub') => ({ id: `${language}-${kind}`, info: { name: language, id: `${language}.${suffix[kind]}`, isDefault: kind === 'original', isAutoDubbed: kind === 'ai' } });

const currentTrack = (page) => page.evaluate(() => document.getElementById('movie_player').getAudioTrack().id);
const switches = (page) => page.evaluate(() => window.__bbStub.callsTo('setAudioTrack'));
const status = async (popup, page) => (await tabStatus(popup, page)) || {};

async function open(context, popup, { tracks = real, current = realId('Hindi'), enabled = true, captions, id } = {}) {
  await setSetting(popup, 'audioTrackEnabled', enabled);
  return openStubVideo(context, { id, config: { audio: { tracks, current }, ...(captions ? { captions } : {}) } });
}

test('disabled never switches tracks', async ({ context, popup }) => {
  const page = await open(context, popup, { enabled: false });
  await page.waitForTimeout(2000);
  expect(await switches(page)).toEqual([]);
});

test('switches from a Hindi dub back to the English original', async ({ context, popup }) => {
  const page = await open(context, popup);
  await expect.poll(() => currentTrack(page)).toBe(realId('English (US) original'));
  await expect.poll(async () => (await status(popup, page)).audioChoice).toEqual({ reason: 'original', language: 'en' });
});

test('foreign original switches to the English dub', async ({ context, popup }) => {
  const page = await open(context, popup, { tracks: [raw('es', 'original'), raw('hi'), raw('en')], current: 'es-original' });
  await expect.poll(() => currentTrack(page)).toBe('en-dub');
});

test('no match plays the original and turns English captions on even when captions are off', async ({ context, popup }) => {
  await setSetting(popup, 'captionsMode', 'off');
  const page = await open(context, popup, {
    tracks: [raw('es', 'original'), raw('fr')],
    current: 'fr-dub',
    captions: { tracks: [{ languageCode: 'es', kind: '' }], translationLanguages: [{ languageCode: 'en', languageName: 'English' }] },
  });
  await expect.poll(() => currentTrack(page)).toBe('es-original');
  await expect.poll(() => page.evaluate(() => {
    const p = document.getElementById('movie_player');
    const track = p.getOption('captions', 'track');
    return p.isSubtitlesOn() && track.translationLanguage && track.translationLanguage.languageCode;
  })).toBe('en');
});

test('a track picked in the player holds', async ({ context, popup }) => {
  const page = await open(context, popup);
  await expect.poll(() => currentTrack(page)).toBe(realId('English (US) original'));
  await page.click('#movie_player');
  await page.evaluate((id) => window.__bbStub.userSetAudio(id), realId('Hindi'));
  await page.waitForTimeout(4000);
  expect(await currentTrack(page)).toBe(realId('Hindi'));
  await expect.poll(async () => (await status(popup, page)).touched?.audio).toBe(realId('Hindi'));
});

test('single-track video reports unavailable and makes no calls', async ({ context, popup }) => {
  const page = await open(context, popup, { tracks: [], current: null });
  await expect.poll(async () => (await status(popup, page)).unavailable?.audio).toBe(true);
  expect(await switches(page)).toEqual([]);
});

test('the next video resets the touch', async ({ context, popup }) => {
  const page = await open(context, popup);
  await expect.poll(() => currentTrack(page)).toBe(realId('English (US) original'));
  await page.click('#movie_player');
  await page.evaluate((id) => window.__bbStub.userSetAudio(id), realId('Hindi'));
  await expect.poll(async () => (await status(popup, page)).touched?.audio).toBe(realId('Hindi'));
  await page.evaluate(() => window.__bbStub.loadVideo('stub2'));
  await expect.poll(() => currentTrack(page)).toBe(realId('English (US) original'));
});
