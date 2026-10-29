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

// Serve a captured HTML file from tests/fixtures/ at a real-looking URL so the
// content script runs on it as if it were the live site.
const serveFixture = (context, url, file) =>
  context.route(url, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', path: path.resolve(__dirname, '../fixtures', file) }));

const setSetting = (popup, key, value) => popup.evaluate(([k, v]) => chrome.storage.local.set({ [k]: v }), [key, value]);

const dupeTabs = (popup) => popup.evaluate(() => chrome.tabs.query({ url: 'https://dupes.test/*' }));

// Open the stand-in YouTube player (tests/fixtures/youtube/stub-player.html) at a
// real watch URL. `config` becomes window.__bbStubConfig before the page loads.
async function openStubVideo(context, { id = 'stub1', config = {}, host = 'www.youtube.com' } = {}) {
  await context.route(`https://${host}/watch*`, (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', path: path.resolve(__dirname, '../fixtures/youtube/stub-player.html') }));
  const page = await context.newPage();
  await page.addInitScript((value) => { window.__bbStubConfig = value; }, config);
  await page.goto(`https://${host}/watch?v=${id}`);
  return page;
}

// Send a message from the popup to one tab: a Page, an exact URL, or (default)
// the first youtube.com tab. Resolves to null when the tab has no content script.
function messageTab(popup, message, target) {
  const url = typeof target === 'string' ? target : target ? target.url() : null;
  return popup.evaluate(async ([msg, exact]) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => (exact ? t.url === exact : /^https:\/\/www\.youtube\.com\//.test(t.url || '')));
    if (!tab) return null;
    try { return (await chrome.tabs.sendMessage(tab.id, msg)) ?? null; } catch (_) { return null; }
  }, [message, url]);
}
const tabStatus = (popup, target) => messageTab(popup, { type: 'GET_TAB_STATUS' }, target);
const clearTouch = (popup, setting, target) => messageTab(popup, { type: 'CLEAR_TOUCH', setting }, target);

module.exports = { test, expect, openPages, dupeTabs, serveFixture, setSetting, openStubVideo, tabStatus, clearTouch };
