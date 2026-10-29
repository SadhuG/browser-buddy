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
