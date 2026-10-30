const { test, expect } = require('./fixtures');

const rowValue = (popup, row) => popup.locator(`#${row} .row-value`);

test('summary rows show stored values', async ({ popup }) => {
  await popup.evaluate(() => chrome.storage.local.set({
    quality: '1080', audioTrackEnabled: true, captionsMode: 'on', captionStyleEnabled: true, captionPresetId: 'high-contrast',
  }));
  await popup.reload();
  await expect(rowValue(popup, 'qualityRow')).toHaveText('1080p');
  await expect(rowValue(popup, 'audioRow')).toHaveText('English → Hindi');
  await expect(rowValue(popup, 'captionsRow')).toHaveText('High contrast · always on');
});

test('defaults read Auto, Off, Style off · YouTube decides', async ({ popup }) => {
  await expect(rowValue(popup, 'qualityRow')).toHaveText('Auto');
  await expect(rowValue(popup, 'audioRow')).toHaveText('Off');
  await expect(rowValue(popup, 'captionsRow')).toHaveText('Style off · YouTube decides');
});

test('rows open their screens and back returns', async ({ popup }) => {
  for (const [row, screen] of [['qualityRow', 'qualityScreen'], ['audioRow', 'audioScreen'], ['captionsRow', 'captionsScreen']]) {
    await popup.click(`#${row}`);
    await expect(popup.locator(`#${screen}`)).toBeVisible();
    await expect(popup.locator('#youtubeHome')).toBeHidden();
    await popup.locator(`#${screen} .back-to-youtube`).click();
    await expect(popup.locator('#youtubeHome')).toBeVisible();
    await expect(popup.locator(`#${screen}`)).toBeHidden();
  }
});

test('a custom style reads Custom', async ({ popup }) => {
  await popup.evaluate(() => chrome.storage.local.set({ captionStyleEnabled: true, captionPresetId: null, captionsMode: 'off' }));
  await popup.reload();
  await expect(rowValue(popup, 'captionsRow')).toHaveText('Custom · always off');
});
