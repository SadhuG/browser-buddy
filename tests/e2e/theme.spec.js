const { test, expect } = require('./fixtures');

const theme = (popup) => popup.evaluate(() => document.documentElement.dataset.theme);
const background = (popup) => popup.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('follows the system theme until the user picks one', async ({ popup }) => {
  await popup.emulateMedia({ colorScheme: 'light' });
  await popup.reload();
  expect(await theme(popup)).toBe('light');
  await expect(popup.locator('[data-theme-choice="light"]')).toHaveAttribute('aria-pressed', 'true');

  await popup.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => theme(popup)).toBe('dark');
});

test('the toggle switches themes and the choice survives reopening', async ({ popup }) => {
  await popup.emulateMedia({ colorScheme: 'dark' });
  await popup.reload();
  expect(await background(popup)).toBe('rgb(19, 18, 18)');

  await popup.click('[data-theme-choice="light"]');
  expect(await theme(popup)).toBe('light');
  expect(await background(popup)).toBe('rgb(250, 250, 249)');
  await expect(popup.locator('[data-theme-choice="light"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(popup.locator('[data-theme-choice="dark"]')).toHaveAttribute('aria-pressed', 'false');

  await popup.reload();
  expect(await theme(popup)).toBe('light');

  // A saved choice wins over the system setting. theme.js registered its
  // change listener first, so once ours has fired, theme.js has handled it too.
  // The system is already dark here, so go light first to get a real change.
  await popup.emulateMedia({ colorScheme: 'light' });
  await popup.evaluate(() => {
    window.systemChanged = false;
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { window.systemChanged = true; });
  });
  await popup.emulateMedia({ colorScheme: 'dark' });
  await popup.waitForFunction(() => window.systemChanged);
  expect(await theme(popup)).toBe('light');

  await popup.click('[data-theme-choice="dark"]');
  expect(await theme(popup)).toBe('dark');
});
