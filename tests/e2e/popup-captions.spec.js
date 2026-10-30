const { test, expect } = require('./fixtures');

const stored = (popup) => popup.evaluate(() => chrome.storage.local.get(['captionsMode', 'captionStyle', 'captionPresetId', 'captionStyleEnabled']));
const builtIn = (popup, id) => popup.evaluate((presetId) => BrowserBuddy.captionStyle.BUILT_IN_PRESETS.find((p) => p.id === presetId).style, id);
const openScreen = (popup) => popup.click('#captionsRow');
const enableStyle = async (popup) => { await popup.evaluate(() => chrome.storage.local.set({ captionStyleEnabled: true })); await popup.reload(); };

test('mode buttons store captionsMode and set aria-pressed', async ({ popup }) => {
  await openScreen(popup);
  await expect(popup.locator('#captionsMode [data-mode=youtube]')).toHaveAttribute('aria-pressed', 'true');
  await popup.click('#captionsMode [data-mode=on]');
  await expect.poll(async () => (await stored(popup)).captionsMode).toBe('on');
  await expect(popup.locator('#captionsMode [data-mode=on]')).toHaveAttribute('aria-pressed', 'true');
  await expect(popup.locator('#captionsMode [data-mode=youtube]')).toHaveAttribute('aria-pressed', 'false');
});

test('the style switch stores captionStyleEnabled', async ({ popup }) => {
  await openScreen(popup);
  await popup.locator('#captionsScreen .toggle').click();
  await expect.poll(async () => (await stored(popup)).captionStyleEnabled).toBe(true);
});

test('picking High contrast stores its style and id', async ({ popup }) => {
  await enableStyle(popup);
  await openScreen(popup);
  await popup.click('#presetPicker [data-preset=high-contrast]');
  await expect.poll(async () => (await stored(popup)).captionPresetId).toBe('high-contrast');
  expect((await stored(popup)).captionStyle).toEqual(await builtIn(popup, 'high-contrast'));
  await expect(popup.locator('#presetPicker [data-preset=high-contrast]')).toHaveAttribute('aria-pressed', 'true');
  await expect(popup.locator('#captionsChip')).toHaveText('High contrast');
});

test('changing one control clears captionPresetId and keeps other fields', async ({ popup }) => {
  await enableStyle(popup);
  await openScreen(popup);
  await popup.click('#presetPicker [data-preset=high-contrast]');
  await popup.click('#capSize [data-value="150"]');
  await expect.poll(async () => (await stored(popup)).captionPresetId).toBeNull();
  const { captionStyle } = await stored(popup);
  expect(captionStyle).toEqual({ ...(await builtIn(popup, 'high-contrast')), sizePercent: 150 });
  await expect(popup.locator('#captionsChip')).toHaveText('Custom');
  await popup.selectOption('#capFont', '1');
  await expect.poll(async () => (await stored(popup)).captionStyle.fontFamily).toBe(1);
  expect((await stored(popup)).captionStyle.sizePercent).toBe(150);
});

test('Reset restores Classic', async ({ popup }) => {
  await openScreen(popup);
  await popup.click('#presetPicker [data-preset=minimal]');
  await popup.click('#capColor [data-value="#ff0"]');
  await popup.click('#resetCaptionStyle');
  await expect.poll(async () => (await stored(popup)).captionPresetId).toBe('classic');
  expect((await stored(popup)).captionStyle).toEqual(await builtIn(popup, 'classic'));
});

test('the preview reflects the style', async ({ popup }) => {
  await openScreen(popup);
  const color = () => popup.locator('#captionPreview').evaluate((el) => getComputedStyle(el).color);
  expect(await color()).toBe('rgb(255, 255, 255)');
  await popup.click('#presetPicker [data-preset=high-contrast]');
  await expect.poll(color).toBe('rgb(255, 255, 0)');
});

test("controls offer only YouTube's values", async ({ popup }) => {
  await openScreen(popup);
  await expect(popup.locator('#capFont option')).toHaveCount(7);
  await expect(popup.locator('#capColor [data-value]')).toHaveCount(8);
  await expect(popup.locator('#capSize [data-value]')).toHaveCount(7);
  await expect(popup.locator('#capTextOpacity [data-value]')).toHaveCount(4);
  await expect(popup.locator('#capBackgroundOpacity [data-value]')).toHaveCount(5);
  await expect(popup.locator('#capEdge option')).toHaveCount(5);
});
