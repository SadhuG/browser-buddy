const { test, expect, openStubVideo, tabStatus } = require('./fixtures');
const { BUILT_IN_PRESETS } = require('../../lib/caption-style.js');

const builtIn = (id) => BUILT_IN_PRESETS.find((p) => p.id === id).style;
const stored = (popup) => popup.evaluate(() => chrome.storage.local.get(['customPresets', 'builtInPresetEdits', 'captionPresetId', 'captionStyle']));
const set = (popup, values) => popup.evaluate((v) => chrome.storage.local.set(v), values);
const openPresets = async (popup) => { await popup.click('#captionsRow'); await popup.click('#managePresets'); };
const row = (popup, id) => popup.locator(`[data-preset-id="${id}"]`);

async function createPreset(popup, name) {
  await popup.fill('#newPresetName', name);
  await popup.click('#savePreset');
}

test('create from current controls', async ({ popup }) => {
  await set(popup, { captionStyleEnabled: true, captionStyle: { ...builtIn('classic'), color: '#0ff' }, captionPresetId: null });
  await popup.reload();
  await openPresets(popup);
  await expect(popup.locator('#customPresetsEmpty')).toBeVisible();
  await createPreset(popup, 'Cyan');
  await expect.poll(async () => (await stored(popup)).customPresets?.length).toBe(1);
  const { customPresets, captionPresetId } = await stored(popup);
  expect(customPresets[0]).toMatchObject({ name: 'Cyan', style: { ...builtIn('classic'), color: '#0ff' } });
  expect(captionPresetId).toBe(customPresets[0].id);
  await expect(row(popup, customPresets[0].id)).toContainText('Cyan');
  await expect(popup.locator('#customPresetsEmpty')).toBeHidden();
  await expect(popup.locator('#newPresetName')).toHaveValue('');
});

test('duplicate name shows the error text and saves nothing', async ({ popup }) => {
  await openPresets(popup);
  await createPreset(popup, 'classic');
  await expect(popup.locator('#presetNameError')).toHaveText('A preset named classic already exists.');
  expect((await stored(popup)).customPresets).toBeUndefined();
});

test('rename a custom preset', async ({ popup }) => {
  await openPresets(popup);
  await createPreset(popup, 'Mine');
  await expect.poll(async () => (await stored(popup)).customPresets?.length).toBe(1);
  const id = (await stored(popup)).customPresets[0].id;
  await row(popup, id).locator('.rename').click();
  const input = row(popup, id).getByRole('textbox', { name: 'New name for Mine' });
  await input.fill('Night');
  await input.press('Enter');
  await expect.poll(async () => (await stored(popup)).customPresets[0].name).toBe('Night');
  await expect(row(popup, id)).toContainText('Night');
});

test('edit Classic, then Reset Classic', async ({ popup }) => {
  await set(popup, { captionStyleEnabled: true });
  await popup.reload();
  await openPresets(popup);
  await row(popup, 'classic').locator('.edit').click();
  await expect(popup.locator('#captionsScreen')).toBeVisible();
  await expect(popup.locator('#editingPreset')).toContainText('Classic');
  await popup.click('#capSize [data-value="150"]');
  await expect.poll(async () => (await stored(popup)).builtInPresetEdits?.classic?.sizePercent).toBe(150);
  expect((await stored(popup)).captionPresetId).toBe('classic');
  await popup.click('#doneEditing');
  await expect(popup.locator('#presetsScreen')).toBeVisible();
  await expect(row(popup, 'classic')).toContainText('edited');
  await row(popup, 'classic').locator('.reset').click();
  await expect.poll(async () => (await stored(popup)).builtInPresetEdits).toEqual({});
  expect((await stored(popup)).captionStyle).toEqual(builtIn('classic'));
  await expect(row(popup, 'classic').locator('.reset')).toHaveCount(0);
});

test('delete the active custom preset keeps the style and clears the id', async ({ popup }) => {
  await set(popup, { captionStyle: { ...builtIn('classic'), color: '#f0f' } });
  await popup.reload();
  await openPresets(popup);
  await createPreset(popup, 'Pink');
  await expect.poll(async () => (await stored(popup)).customPresets?.length).toBe(1);
  const id = (await stored(popup)).customPresets[0].id;
  await row(popup, id).locator('.delete').click();
  await expect.poll(async () => (await stored(popup)).customPresets).toEqual([]);
  const after = await stored(popup);
  expect(after.captionPresetId).toBeNull();
  expect(after.captionStyle.color).toBe('#f0f');
});

test('Save as preset? appears for a touched style', async ({ context, popup }) => {
  // High contrast differs from the player's starting style, so applying it is a visible update.
  await set(popup, { captionStyleEnabled: true, captionPresetId: 'high-contrast', captionStyle: builtIn('high-contrast') });
  const page = await openStubVideo(context, { config: { captions: { on: true, tracks: [{ languageCode: 'en', kind: '' }], track: { languageCode: 'en', kind: '' } } } });
  // A player change counts as a touch only after Browser Buddy has applied its own style.
  await expect.poll(() => page.evaluate(() => window.__bbStub.callsTo('updateSubtitlesUserSettings').length)).toBeGreaterThan(0);
  await page.click('#movie_player');
  await page.evaluate(() => window.__bbStub.userSetStyle({ color: '#0f0' }));
  await expect.poll(async () => (await tabStatus(popup, page))?.touched?.captionStyle?.color).toBe('#0f0');
  await popup.reload();
  await popup.click('#captionsRow');
  await expect(popup.locator('#savePresetPrompt')).toBeVisible();
  await popup.locator('#savePresetPrompt').getByRole('button', { name: 'Save preset' }).click();
  await expect.poll(async () => (await stored(popup)).customPresets?.[0]?.style?.color).toBe('#0f0');
  await expect(popup.locator('#savePresetPrompt')).toBeHidden();
});
