const fs = require('node:fs');
const path = require('node:path');
const { test, expect, serveFixture, setSetting } = require('./fixtures');

// Fixtures are captured from live storefronts: tests/fixtures/amazon/<tld>-<page>.html
const pagePaths = {
  product: '/dp/B0FIXTURE',
  search: '/s?k=cable',
  'added-to-cart': '/cart/smart-wagon',
  cart: '/gp/cart/view.html',
  'home-empty': '/',
};
const fixtures = fs.readdirSync(path.resolve(__dirname, '../fixtures/amazon'))
  .map((file) => {
    const [, tld, kind] = file.match(/^(.+?)-(.+)\.html$/);
    return { file: `amazon/${file}`, tld, kind, url: `https://www.amazon.${tld}${pagePaths[kind]}` };
  });
const withSidebar = fixtures.filter((f) => ['product', 'search', 'added-to-cart'].includes(f.kind));
const cartPages = fixtures.filter((f) => f.kind === 'cart');

async function openAmazon(context, fixture) {
  await serveFixture(context, fixture.url, fixture.file);
  const page = await context.newPage();
  await page.goto(fixture.url);
  return page;
}

// Ask the content script in the Amazon tab what the popup warning would ask.
const cartStatus = (popup, tld) => popup.evaluate(async (pattern) => {
  const [tab] = await chrome.tabs.query({ url: pattern });
  return (await chrome.tabs.sendMessage(tab.id, { type: 'AMAZON_CART_STATUS' })).found;
}, `https://www.amazon.${tld}/*`);

for (const fixture of withSidebar) {
  test(`hides and restores the cart sidebar: ${fixture.tld} ${fixture.kind}`, async ({ context, popup }) => {
    await setSetting(popup, 'hideAmazonCart', true);
    const page = await openAmazon(context, fixture);
    const sidebar = page.locator('#nav-flyout-ewc');
    await expect(sidebar).toBeHidden();
    await expect.poll(() => cartStatus(popup, fixture.tld)).toBe(true);

    await setSetting(popup, 'hideAmazonCart', false);
    await expect(sidebar).toBeVisible();
  });
}

for (const fixture of cartPages) {
  test(`never hides the checkout box on the cart page: ${fixture.tld}`, async ({ context, popup }) => {
    await setSetting(popup, 'hideAmazonCart', true);
    const page = await openAmazon(context, fixture);
    await expect.poll(() => cartStatus(popup, fixture.tld)).toBe(false);
    await expect(page.locator('#sc-buy-box')).toBeVisible();
  });
}

test('leaves the sidebar alone while the setting is off (the default)', async ({ context, popup }) => {
  const page = await openAmazon(context, fixtures.find((f) => f.tld === 'com' && f.kind === 'product'));
  await expect.poll(() => cartStatus(popup, 'com')).toBe(true);
  await expect(page.locator('#nav-flyout-ewc')).toBeVisible();
});

test('reports no sidebar on a page without one', async ({ context, popup }) => {
  await setSetting(popup, 'hideAmazonCart', true);
  await openAmazon(context, fixtures.find((f) => f.kind === 'home-empty'));
  await expect.poll(() => cartStatus(popup, 'co.uk')).toBe(false);
});

test('hides a sidebar that appears after the page loads', async ({ context, popup }) => {
  const source = fixtures.find((f) => f.tld === 'com' && f.kind === 'product');
  const sidebarHtml = fs.readFileSync(path.resolve(__dirname, '../fixtures', source.file), 'utf8')
    .match(/<div id="nav-flyout-ewc"[\s\S]*(?=\n<\/body>)/)[0];
  await setSetting(popup, 'hideAmazonCart', true);
  const page = await openAmazon(context, { ...fixtures.find((f) => f.kind === 'home-empty'), url: 'https://www.amazon.com/' });
  await expect.poll(() => cartStatus(popup, 'com')).toBe(false);

  await page.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html), sidebarHtml);
  await expect(page.locator('#nav-flyout-ewc')).toBeHidden();
  await expect.poll(() => cartStatus(popup, 'com')).toBe(true);
});
