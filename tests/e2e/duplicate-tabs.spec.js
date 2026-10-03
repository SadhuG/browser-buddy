const { test, expect, openPages, dupeTabs } = require('./fixtures');

const urls = (...paths) => paths.map((p) => `https://dupes.test${p}`);

async function openTool(popup) {
  await popup.bringToFront();
  await popup.click('.app-tab[data-panel="tabs"]');
  await popup.click('#launchDuplicateTool');
}

test('bulk removal closes every extra copy after confirmation', async ({ context, popup }) => {
  await openPages(context, urls('/a', '/a', '/a', '/b'));
  await openTool(popup);
  await expect(popup.locator('#duplicateCount')).toHaveText(/^2 /);
  await popup.click('#removeAll');
  await expect(popup.locator('#confirmDialog')).toBeVisible();
  await popup.click('#confirmRemove');
  await expect(popup.locator('#toast')).toBeVisible();
  const remaining = await dupeTabs(popup);
  expect(remaining.map((tab) => new URL(tab.url).pathname).sort()).toEqual(['/a', '/b']);
});

test('cancel leaves every tab open', async ({ context, popup }) => {
  await openPages(context, urls('/a', '/a'));
  await openTool(popup);
  await popup.click('#removeAll');
  await popup.click('#cancelRemove');
  await expect(popup.locator('#confirmDialog')).toBeHidden();
  expect(await dupeTabs(popup)).toHaveLength(2);
});

test('Escape dismisses the confirmation without closing tabs', async ({ context, popup }) => {
  await openPages(context, urls('/a', '/a'));
  await openTool(popup);
  await popup.click('#removeAll');
  await popup.keyboard.press('Escape');
  await expect(popup.locator('#confirmDialog')).toBeHidden();
  expect(await dupeTabs(popup)).toHaveLength(2);
});

test('a single duplicate closes in place with Undo in its row, not a toast', async ({ context, popup }) => {
  await openPages(context, urls('/a', '/a', '/a'));
  await openTool(popup);
  await popup.locator('.close-tab').first().click();
  const closed = popup.locator('.tab-row.is-closed');
  await expect(closed).toHaveCount(1);
  await expect(closed).toContainText('Closed');
  await expect(closed.locator('.undo-link')).toBeFocused();
  await expect(popup.locator('#toast')).toBeHidden();
  await expect(popup.locator('#duplicateCount')).toHaveText(/^1 /);
  expect(await dupeTabs(popup)).toHaveLength(2);
});

test('the closed row stays when its group has no duplicates left', async ({ context, popup }) => {
  await openPages(context, urls('/a', '/a'));
  await openTool(popup);
  await popup.locator('.close-tab').click();
  await expect(popup.locator('.tab-row.is-closed')).toHaveCount(1);
  await expect(popup.locator('#emptyState')).toBeHidden();
  await expect(popup.locator('#removeAll')).toBeDisabled();
});

test('Undo in the row reopens that tab', async ({ context, popup }) => {
  await openPages(context, urls('/a', '/a', '/a'));
  await openTool(popup);
  await popup.locator('.close-tab').first().click();
  await popup.locator('.tab-row.is-closed .undo-link').click();
  await expect(popup.locator('.tab-row.is-closed')).toHaveCount(0);
  await expect.poll(async () => (await dupeTabs(popup)).length).toBe(3);
  await expect(popup.locator('#duplicateCount')).toHaveText(/^2 /);
});

test('a closed row folds away after eight seconds', async ({ context, popup }) => {
  await popup.clock.install();
  await popup.reload();
  await openPages(context, urls('/a', '/a'));
  await openTool(popup);
  await popup.locator('.close-tab').click();
  await expect(popup.locator('.tab-row.is-closed')).toHaveCount(1);
  await popup.clock.fastForward(7900);
  await expect(popup.locator('.tab-row.is-closed')).toHaveCount(1);
  await popup.clock.fastForward(400);
  await expect(popup.locator('.tab-row.is-closed')).toHaveCount(0);
  await expect(popup.locator('#emptyTitle')).toHaveText('No duplicates left');
});

test('pinned duplicates are never offered for removal', async ({ context, popup }) => {
  await openPages(context, urls('/a', '/a'));
  await popup.evaluate(async () => {
    const [first] = await chrome.tabs.query({ url: 'https://dupes.test/*' });
    await chrome.tabs.update(first.id, { pinned: true });
  });
  await openTool(popup);
  await expect(popup.locator('#duplicateCount')).toHaveText(/^0 /);
  await expect(popup.locator('#removeAll')).toBeDisabled();
});

test('query-string variants are not grouped and are flagged', async ({ context, popup }) => {
  await openPages(context, urls('/list?sort=new', '/list?sort=top'));
  await openTool(popup);
  await expect(popup.locator('#duplicateCount')).toHaveText(/^0 /);
  await expect(popup.locator('#variantWarnings')).toBeVisible();
});

test('Undo reopens the closed tabs', async ({ context, popup }) => {
  await openPages(context, urls('/a', '/a', '/a', '/b', '/b'));
  await openTool(popup);
  await popup.click('#removeAll');
  await popup.click('#confirmRemove');
  await expect(popup.locator('#toast')).toBeVisible();
  expect(await dupeTabs(popup)).toHaveLength(2);
  await popup.click('#undoRemove');
  await expect(popup.locator('#toast')).toBeHidden();
  await expect.poll(async () => (await dupeTabs(popup)).map((tab) => new URL(tab.url || tab.pendingUrl).pathname).sort())
    .toEqual(['/a', '/a', '/a', '/b', '/b']);
});

test('Undo is offered for eight seconds', async ({ context, popup }) => {
  await popup.clock.install();
  await popup.reload();
  await openPages(context, urls('/a', '/a'));
  await openTool(popup);
  await popup.click('#removeAll');
  await popup.click('#confirmRemove');
  await expect(popup.locator('#toast')).toBeVisible();
  await popup.clock.fastForward(7900);
  await expect(popup.locator('#toast')).toBeVisible();
  await popup.clock.fastForward(200);
  await expect(popup.locator('#toast')).toBeHidden();
});
