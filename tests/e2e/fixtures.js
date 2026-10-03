const { test: base, expect, chromium } = require('@playwright/test');
const path = require('node:path');

const extensionPath = path.resolve(__dirname, '../..');

const test = base.extend({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await context.route('https://dupes.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: `<title>${new URL(route.request().url()).pathname}</title>` }));
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },
  popup: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await use(page);
  },
});

async function openPages(context, urls) {
  const pages = [];
  for (const url of urls) {
    const page = await context.newPage();
    await page.goto(url);
    pages.push(page);
  }
  return pages;
}

const dupeTabs = (popup) => popup.evaluate(() => chrome.tabs.query({ url: 'https://dupes.test/*' }));

module.exports = { test, expect, openPages, dupeTabs };
