const { test, expect } = require('./fixtures');

const stored = (popup, key) => popup.evaluate(async (k) => (await chrome.storage.local.get(k))[k], key);
const toggle = (popup) => popup.locator('label.toggle:has(#oneVideoAtATime)');
const tutorialToggle = (popup) => popup.locator('label.toggle:has(#tutorialMode)');
const choice = (popup, resume) => popup.locator(`#oneVideoResumeMode button[data-resume="${resume}"]`);

test('row is off by default and the choice is hidden', async ({ popup }) => {
  await expect(popup.locator('#oneVideoTitle')).toHaveText('One video at a time');
  await expect(popup.locator('#oneVideoDescription')).toHaveText('Pause other tabs when a video starts.');
  await expect(popup.locator('#oneVideoAtATime')).not.toBeChecked();
  await expect(popup.locator('#oneVideoResume')).toBeHidden();
});

test('turning it on saves and shows the choice', async ({ popup }) => {
  await toggle(popup).click();
  await expect.poll(() => stored(popup, 'oneVideoAtATime')).toBe(true);
  await expect(popup.locator('#oneVideoResume')).toBeVisible();
  await expect(popup.locator('#oneVideoResumeLabel')).toHaveText('When it ends or its tab closes, resume');
  await expect(choice(popup, 'previous')).toHaveText('Previous video');
  await expect(choice(popup, 'previous')).toHaveAttribute('aria-pressed', 'true');
  await expect(choice(popup, 'first')).toHaveText('First video');
  await expect(choice(popup, 'first')).toHaveAttribute('aria-pressed', 'false');
});

test('picking First video saves it', async ({ popup }) => {
  await toggle(popup).click();
  await choice(popup, 'first').click();
  await expect.poll(() => stored(popup, 'oneVideoResume')).toBe('first');
  await expect(choice(popup, 'first')).toHaveAttribute('aria-pressed', 'true');
  await popup.reload();
  await expect(popup.locator('#oneVideoAtATime')).toBeChecked();
  await expect(choice(popup, 'first')).toHaveAttribute('aria-pressed', 'true');
});

test('tutorial mode dims the switch and hides the choice', async ({ popup }) => {
  await toggle(popup).click();
  await tutorialToggle(popup).click();
  await expect(popup.locator('#oneVideoAtATime')).toBeDisabled();
  await expect(popup.locator('#oneVideoAtATime')).toBeChecked();
  await expect(popup.locator('#oneVideoDescription')).toHaveText('Tutorial mode is in charge.');
  await expect(popup.locator('#oneVideoResume')).toBeHidden();
  await tutorialToggle(popup).click();
  await expect(popup.locator('#oneVideoAtATime')).toBeEnabled();
  await expect(popup.locator('#oneVideoDescription')).toHaveText('Pause other tabs when a video starts.');
  await expect(popup.locator('#oneVideoResume')).toBeVisible();
});
