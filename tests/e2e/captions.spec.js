const { test, expect, openStubVideo, tabStatus, setSetting, clearTouch } = require('./fixtures');

const T = (languageCode, kind = '') => ({ languageCode, kind, languageName: languageCode, vss_id: `${kind === 'asr' ? 'a' : ''}.${languageCode}` });
const L = (languageCode) => ({ languageCode, languageName: languageCode });
const captions = (tracks, extra = {}) => ({ captions: { tracks, translationLanguages: [L('en'), L('hi')], ...extra } });

const isOn = (page) => page.evaluate(() => document.getElementById('movie_player').isSubtitlesOn());
const trackSet = (page) => page.evaluate(() => window.__bbStub.callsTo('setOption').filter((c) => c[1] === 'captions' && c[2] === 'track').map((c) => c[3]));
const captionCalls = (page) => page.evaluate(() => window.__bbStub.calls.filter((c) => ['setOption', 'loadModule', 'unloadModule', 'toggleSubtitles', 'toggleSubtitlesOn'].includes(c[0])));
const status = async (popup, page) => (await tabStatus(popup, page)) || {};

async function open(context, popup, mode, config = captions([T('es'), T('en', 'asr')])) {
  await setSetting(popup, 'captionsMode', mode);
  return openStubVideo(context, { config });
}

test('youtube mode leaves captions alone', async ({ context, popup }) => {
  const page = await open(context, popup, 'youtube');
  await page.waitForTimeout(2000);
  expect(await captionCalls(page)).toEqual([]);
});

test('on picks the auto-generated English track', async ({ context, popup }) => {
  const page = await open(context, popup, 'on');
  await expect.poll(() => isOn(page)).toBe(true);
  expect(await trackSet(page)).toContainEqual(expect.objectContaining({ languageCode: 'en', kind: 'asr' }));
});

test('on translates when only foreign tracks exist', async ({ context, popup }) => {
  const page = await open(context, popup, 'on', captions([T('es')]));
  await expect.poll(() => trackSet(page)).toContainEqual(expect.objectContaining({ languageCode: 'es', translationLanguage: L('en') }));
});

test('off turns captions off', async ({ context, popup }) => {
  const page = await open(context, popup, 'off', captions([T('es')], { on: true, track: T('es') }));
  await expect.poll(() => isOn(page)).toBe(false);
});

test('turning captions off in the player holds', async ({ context, popup }) => {
  const page = await open(context, popup, 'on');
  await expect.poll(() => isOn(page)).toBe(true);
  await page.click('#movie_player');
  await page.evaluate(() => window.__bbStub.userSetCaptions(false));
  await page.waitForTimeout(4000);
  expect(await isOn(page)).toBe(false);
  await expect.poll(async () => (await status(popup, page)).touched?.captions).toBe('off');
});

test('the next video resets', async ({ context, popup }) => {
  const page = await open(context, popup, 'on');
  await expect.poll(() => isOn(page)).toBe(true);
  await page.click('#movie_player');
  await page.evaluate(() => window.__bbStub.userSetCaptions(false));
  await expect.poll(async () => (await status(popup, page)).touched?.captions).toBe('off');
  await page.evaluate(() => window.__bbStub.loadVideo('stub2'));
  await expect.poll(() => isOn(page)).toBe(true);
});

test('no tracks reports unavailable', async ({ context, popup }) => {
  const errors = [];
  // Listen before the page opens so errors on load and in the first ticks count too.
  context.on('page', (opened) => opened.on('pageerror', (error) => errors.push(error)));
  const page = await open(context, popup, 'on', captions([]));
  await expect.poll(async () => (await status(popup, page)).unavailable?.captions, { timeout: 12000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('miniplayer is skipped', async ({ context, popup }) => {
  const page = await open(context, popup, 'youtube');
  await page.evaluate(() => window.__bbStub.setMiniplayer(true));
  await setSetting(popup, 'captionsMode', 'on');
  await page.waitForTimeout(2000);
  expect(await captionCalls(page)).toEqual([]);
});

// Clicking a related video or "Skip ad" is input, but YouTube settling its own captions
// right after is not the user's choice. The bridge's tick is called directly to pin the timing.
const tick = (page) => page.evaluate(() => window.BrowserBuddy.bridge.tick());

test('a click that starts the next video does not count as a touch', async ({ context, popup }) => {
  const page = await open(context, popup, 'on');
  await expect.poll(() => isOn(page)).toBe(true);
  await page.click('#movie_player');
  await page.evaluate(() => { window.__bbStub.loadVideo('stub2'); window.BrowserBuddy.bridge.tick(); window.__bbStub.userSetCaptions(false); });
  await tick(page);
  expect((await status(popup, page)).touched?.captions).toBeUndefined();
  await expect.poll(() => isOn(page), { timeout: 6000 }).toBe(true);
});

test('a click that skips an ad does not count as a touch', async ({ context, popup }) => {
  const page = await open(context, popup, 'on');
  await expect.poll(() => isOn(page)).toBe(true);
  await page.evaluate(() => window.__bbStub.startAd());
  await tick(page);
  await page.click('#movie_player');
  await page.evaluate(() => { window.__bbStub.endAd(); window.BrowserBuddy.bridge.tick(); window.__bbStub.userSetCaptions(false); });
  await tick(page);
  expect((await status(popup, page)).touched?.captions).toBeUndefined();
  await expect.poll(() => isOn(page), { timeout: 6000 }).toBe(true);
});

// "Use Browser Buddy setting" is newer than the player click before it, so it isn't undone.
test('Use Browser Buddy setting right after a player click restores captions', async ({ context, popup }) => {
  const page = await open(context, popup, 'on');
  await expect.poll(() => isOn(page)).toBe(true);
  await page.click('#movie_player');
  await page.evaluate(() => { window.__bbStub.userSetCaptions(false); window.BrowserBuddy.bridge.tick(); });
  // The status reaches the popup asynchronously (page -> content script -> popup).
  await expect.poll(async () => (await status(popup, page)).touched?.captions).toBe('off');
  await clearTouch(popup, 'captions', page);
  await expect.poll(() => isOn(page)).toBe(true);
  expect((await status(popup, page)).touched?.captions).toBeUndefined();
});
