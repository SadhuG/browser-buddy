const { test, expect } = require('./fixtures');

const stored = (popup) => popup.evaluate(async () => (await chrome.storage.local.get('quality')).quality);
const openScreen = (popup) => popup.click('#qualityRow');

test('Auto is selected by default', async ({ popup }) => {
  await openScreen(popup);
  await expect(popup.locator('input[name=quality][value=auto]')).toBeChecked();
  await expect(popup.locator('#qualityOptions')).toHaveAttribute('role', 'radiogroup');
  await expect(popup.locator('input[name=quality]')).toHaveCount(10);
});

test("choosing 1440p stores '1440' and updates the row", async ({ popup }) => {
  await openScreen(popup);
  await popup.locator('#qualityOptions label', { hasText: '1440p' }).click();
  await expect.poll(() => stored(popup)).toBe('1440');
  await expect(popup.locator('#qualityChip')).toHaveText('1440p');
  await popup.locator('#qualityScreen .back-to-youtube').click();
  await expect(popup.locator('#qualityRow .row-value')).toHaveText('1440p');
});

test('arrow keys move the selection', async ({ popup }) => {
  await openScreen(popup);
  await popup.locator('input[name=quality][value=auto]').focus();
  await popup.keyboard.press('ArrowDown');
  await expect(popup.locator('input[name=quality][value=highest]')).toBeChecked();
  await popup.keyboard.press('ArrowDown');
  await expect(popup.locator('input[name=quality][value="2160"]')).toBeChecked();
  await expect.poll(() => stored(popup)).toBe('2160');
});
