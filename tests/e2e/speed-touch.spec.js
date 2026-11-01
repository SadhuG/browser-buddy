const { test, expect, openStubVideo, tabStatus, clearTouch, setSetting } = require('./fixtures');

const rate = (page) => page.evaluate(() => document.querySelector('video').playbackRate);
const setRate = (page, value) => page.evaluate((v) => { document.querySelector('video').playbackRate = v; }, value);
// A real click gives the page trusted input, so the next change counts as the user's.
const userSetRate = async (page, value) => { await page.click('video'); await setRate(page, value); };

async function openAt(context, popup, speed, options) {
  await setSetting(popup, 'playbackSpeed', speed);
  const page = await openStubVideo(context, options);
  await expect.poll(() => rate(page)).toBe(speed);
  return page;
}

test('applies the popup speed', async ({ context, popup }) => {
  await openAt(context, popup, 1.25);
});

test('a speed change made with user input holds', async ({ context, popup }) => {
  const page = await openAt(context, popup, 1.25);
  await userSetRate(page, 1.5);
  await page.waitForTimeout(2500);
  expect(await rate(page)).toBe(1.5);
  await expect.poll(async () => (await tabStatus(popup, page)).touched.speed).toBe(1.5);
});

test('a rate change without user input is reverted', async ({ context, popup }) => {
  const page = await openAt(context, popup, 1.25);
  await setRate(page, 2);
  await expect.poll(() => rate(page), { timeout: 2000 }).toBe(1.25);
  expect((await tabStatus(popup, page)).touched.speed).toBeUndefined();
});

test('the touch ends on the next video', async ({ context, popup }) => {
  const page = await openAt(context, popup, 1.25);
  await userSetRate(page, 1.5);
  await expect.poll(async () => (await tabStatus(popup, page)).touched.speed).toBe(1.5);
  await page.evaluate(() => window.__bbStub.loadVideo('stub2'));
  await expect.poll(() => rate(page)).toBe(1.25);
  await expect.poll(async () => (await tabStatus(popup, page)).touched.speed).toBeUndefined();
});

test('a popup change skips a touched video and reaches other tabs', async ({ context, popup }) => {
  const touchedTab = await openAt(context, popup, 1.25, { id: 'stubA' });
  const otherTab = await openStubVideo(context, { id: 'stubB' });
  await expect.poll(() => rate(otherTab)).toBe(1.25);
  await touchedTab.bringToFront();
  await userSetRate(touchedTab, 1.5);
  await expect.poll(async () => (await tabStatus(popup, touchedTab)).touched.speed).toBe(1.5);
  await setSetting(popup, 'playbackSpeed', 1.75);
  await expect.poll(() => rate(otherTab)).toBe(1.75);
  expect(await rate(touchedTab)).toBe(1.5);
});

test('CLEAR_TOUCH restores the Browser Buddy speed', async ({ context, popup }) => {
  const page = await openAt(context, popup, 1.25);
  await userSetRate(page, 1.5);
  await expect.poll(async () => (await tabStatus(popup, page)).touched.speed).toBe(1.5);
  await clearTouch(popup, 'speed', page);
  await expect.poll(() => rate(page)).toBe(1.25);
});

// YouTube's speed menu and shortcut redraw part of the page in the same step as the rate change.
test('a player speed change that also updates the page holds', async ({ context, popup }) => {
  const page = await openAt(context, popup, 1.25);
  await page.click('video');
  await page.evaluate(() => { document.querySelector('video').playbackRate = 1.5; document.body.append(document.createElement('div')); });
  await page.waitForTimeout(2500);
  expect(await rate(page)).toBe(1.5);
  await expect.poll(async () => (await tabStatus(popup, page)).touched.speed).toBe(1.5);
});

// The miniplayer moves the page to "/" while the same video keeps playing.
test('the speed touch holds in the miniplayer', async ({ context, popup }) => {
  const page = await openAt(context, popup, 1.25);
  await userSetRate(page, 1.5);
  await expect.poll(async () => (await tabStatus(popup, page)).touched.speed).toBe(1.5);
  await page.evaluate(() => { window.__bbStub.setMiniplayer(true); history.pushState({}, '', '/'); });
  await page.waitForTimeout(2500);
  expect(await rate(page)).toBe(1.5);
  expect((await tabStatus(popup, page)).touched.speed).toBe(1.5);
});

// The click that opens the next video isn't a choice about that video's speed, so YouTube's
// remembered speed arriving right after it is reverted, not kept as a touch.
test('the click that opens the next video does not make its speed a touch', async ({ context, popup }) => {
  const page = await openAt(context, popup, 1.25);
  await page.click('video');
  await page.evaluate(() => { window.__bbStub.loadVideo('stub2'); window.BrowserBuddy.bridge.tick(); });
  await expect.poll(async () => (await tabStatus(popup, page)).videoId).toBe('stub2');
  await setRate(page, 2);
  await expect.poll(() => rate(page), { timeout: 2000 }).toBe(1.25);
  expect((await tabStatus(popup, page)).touched.speed).toBeUndefined();
});

test('coming back to a video from Home ends the speed touch', async ({ context, popup }) => {
  const page = await openAt(context, popup, 1.25);
  await userSetRate(page, 1.5);
  await expect.poll(async () => (await tabStatus(popup, page)).touched.speed).toBe(1.5);
  await page.evaluate(() => history.pushState({}, '', '/'));
  await page.waitForTimeout(2500);
  await page.evaluate(() => history.pushState({}, '', '/watch?v=stub1'));
  await expect.poll(() => rate(page)).toBe(1.25);
  expect((await tabStatus(popup, page)).touched.speed).toBeUndefined();
});

test('typing in a text field outside the player is not a speed pick', async ({ context, popup }) => {
  const page = await openAt(context, popup, 1.25);
  // Like typing a comment or a search: trusted input, but not aimed at the player.
  await page.evaluate(() => { const field = document.createElement('textarea'); field.id = 'comment'; document.body.append(field); });
  await page.click('#comment');
  await page.keyboard.type('nice video');
  await setRate(page, 2);
  await expect.poll(() => rate(page), { timeout: 2000 }).toBe(1.25);
  expect((await tabStatus(popup, page)).touched.speed).toBeUndefined();
});

test('a status posted by the page keeps only the shape the popup reads', async ({ context, popup }) => {
  const page = await openAt(context, popup, 1.25);
  await page.evaluate(() => window.postMessage({
    source: 'browser-buddy', to: 'extension', type: 'status',
    status: { videoId: 42, viewing: 'x', touched: { quality: 'large', injected: true }, auto: 'not an object', unavailable: { captions: true } },
  }, location.origin));
  await expect.poll(async () => (await tabStatus(popup, page)).unavailable?.captions).toBe(true);
  const status = await tabStatus(popup, page);
  expect(status.videoId).toBeNull();
  expect(status.viewing).toBe(0);
  expect(status.touched.injected).toBeUndefined();
  expect(status.touched.quality).toBe('large');
  expect(status.auto).toEqual({});
});
