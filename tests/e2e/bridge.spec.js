const { test, expect, openStubVideo, tabStatus, setSetting } = require('./fixtures');

test('reports the stub video id and watch surface', async ({ context, popup }) => {
  await openStubVideo(context);
  await expect.poll(() => tabStatus(popup)).toMatchObject({ videoId: 'stub1', surface: 'watch' });
});

test('follows navigation to the next video without a reload', async ({ context, popup }) => {
  const page = await openStubVideo(context);
  await expect.poll(() => tabStatus(popup)).toMatchObject({ videoId: 'stub1' });
  await page.evaluate(() => window.__bbStub.loadVideo('stub2'));
  await expect.poll(() => tabStatus(popup)).toMatchObject({ videoId: 'stub2' });
});

test('reports the miniplayer surface', async ({ context, popup }) => {
  const page = await openStubVideo(context);
  await page.evaluate(() => window.__bbStub.setMiniplayer(true));
  await expect.poll(() => tabStatus(popup)).toMatchObject({ surface: 'miniplayer' });
});

test('sends normalized settings to the page', async ({ context, popup }) => {
  const page = await openStubVideo(context);
  await page.evaluate(() => window.addEventListener('message', (event) => {
    if (event.data && event.data.source === 'browser-buddy' && event.data.type === 'settings') window.__lastSettings = event.data.settings;
  }));
  await setSetting(popup, 'playbackSpeed', 9);
  await expect.poll(() => page.evaluate(() => window.__lastSettings && window.__lastSettings.playbackSpeed)).toBe(4);
});

test('does not run on YouTube Music', async ({ context, popup }) => {
  await openStubVideo(context, { host: 'music.youtube.com' });
  await popup.waitForTimeout(1500);
  expect(await tabStatus(popup, 'https://music.youtube.com/watch?v=stub1')).toBeNull();
});

test('answers null on a non-YouTube tab', async ({ context, popup }) => {
  const page = await context.newPage();
  await page.goto('https://dupes.test/a');
  expect(await tabStatus(popup, 'https://dupes.test/a')).toBeNull();
});
