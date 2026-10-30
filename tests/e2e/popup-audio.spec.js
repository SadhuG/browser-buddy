const { test, expect } = require('./fixtures');

const stored = (popup, key) => popup.evaluate(async (k) => (await chrome.storage.local.get(k))[k], key);
const items = (popup) => popup.locator('#myLanguages [data-lang]');
const openScreen = (popup) => popup.click('#audioRow');

test('the switch stores audioTrackEnabled', async ({ popup }) => {
  await openScreen(popup);
  await expect(popup.locator('#audioTrackEnabled')).not.toBeChecked();
  await popup.locator('#audioScreen .toggle').click();
  await expect.poll(() => stored(popup, 'audioTrackEnabled')).toBe(true);
  await expect(popup.locator('#audioChip')).toHaveText('on');
});

test('default list is English, Hindi', async ({ popup }) => {
  await openScreen(popup);
  await expect(items(popup)).toHaveCount(2);
  await expect(items(popup).nth(0)).toHaveAttribute('data-lang', 'en');
  await expect(items(popup).nth(0)).toContainText('English');
  await expect(items(popup).nth(1)).toContainText('Hindi');
});

test("add Spanish appends 'es'", async ({ popup }) => {
  await openScreen(popup);
  await popup.selectOption('#addLanguage', 'es');
  await expect.poll(() => stored(popup, 'myLanguages')).toEqual(['en', 'hi', 'es']);
  await expect(items(popup).nth(2)).toContainText('Spanish');
  await expect(popup.locator('#addLanguage')).toHaveValue('');
});

test("move Hindi up stores ['hi','en']", async ({ popup }) => {
  await openScreen(popup);
  await popup.locator('#myLanguages [data-lang=hi] .move-up').click();
  await expect.poll(() => stored(popup, 'myLanguages')).toEqual(['hi', 'en']);
  await expect(popup.locator('#myLanguages [data-lang=hi] .move-up')).toBeDisabled();
  await expect(popup.locator('#myLanguages [data-lang=en] .move-down')).toBeDisabled();
});

test('remove is disabled on the last language', async ({ popup }) => {
  await openScreen(popup);
  await popup.locator('#myLanguages [data-lang=hi] .remove').click();
  await expect.poll(() => stored(popup, 'myLanguages')).toEqual(['en']);
  await expect(popup.locator('#myLanguages [data-lang=en] .remove')).toBeDisabled();
});

test('adding a language already in the list is impossible', async ({ popup }) => {
  await openScreen(popup);
  await expect(popup.locator('#addLanguage option[value=en]')).toHaveCount(0);
  await expect(popup.locator('#addLanguage option[value=hi]')).toHaveCount(0);
  await expect(popup.locator('#addLanguage option[value=es]')).toHaveCount(1);
});

test('move buttons have accessible names', async ({ popup }) => {
  await openScreen(popup);
  await expect(popup.getByRole('button', { name: 'Move Hindi up' })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Remove Hindi' })).toBeVisible();
});

test('focus follows the moved language', async ({ popup }) => {
  await openScreen(popup);
  await popup.locator('#myLanguages [data-lang=en] .move-down').focus();
  await popup.keyboard.press('Enter');
  await expect.poll(() => stored(popup, 'myLanguages')).toEqual(['hi', 'en']);
  // English is now last, so its Move down is disabled; focus lands on its Move up.
  await expect(popup.locator('#myLanguages [data-lang=en] .move-up')).toBeFocused();
});
