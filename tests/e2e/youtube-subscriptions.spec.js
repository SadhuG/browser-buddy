const { test, expect, serveFixture, setSetting } = require('./fixtures');

// Captured from the live Subscriptions feed: tests/fixtures/youtube/en-GB-subscriptions.html
const feedUrl = 'https://www.youtube.com/feed/subscriptions';
const fixture = 'youtube/en-GB-subscriptions.html';

async function openFeed(context, url = feedUrl) {
  await serveFixture(context, url, fixture);
  const page = await context.newPage();
  await page.goto(url);
  const sections = page.locator('ytd-rich-grid-renderer > #contents > ytd-rich-section-renderer');
  return {
    page,
    latest: sections.nth(0),
    mostRelevant: sections.nth(1),
    shorts: sections.nth(2),
    videos: page.locator('ytd-rich-grid-renderer > #contents > ytd-rich-item-renderer'),
  };
}

async function expectVideosVisible(videos) {
  await expect(videos).toHaveCount(3);
  for (const video of await videos.all()) await expect(video).toBeVisible();
}

test('the fixture has the captured shelves in order', async ({ context }) => {
  const feed = await openFeed(context);
  await expect(feed.latest.locator('#title').first()).toHaveText('Latest');
  await expect(feed.mostRelevant.locator('#title').first()).toHaveText('Most relevant');
  await expect(feed.shorts.locator('#title').first()).toHaveText('Shorts');
});

test('hides Shorts and Most relevant, keeps Latest and videos, restores without a reload', async ({ context, popup }) => {
  await setSetting(popup, 'subscriptionCleanMode', true);
  const feed = await openFeed(context);
  await expect(feed.shorts).toBeHidden();
  await expect(feed.mostRelevant).toBeHidden();
  await expect(feed.latest).toBeVisible();
  await expectVideosVisible(feed.videos);

  await setSetting(popup, 'subscriptionCleanMode', false);
  await expect(feed.shorts).toBeVisible();
  await expect(feed.mostRelevant).toBeVisible();
});

test('changes nothing while the setting is off (the default)', async ({ context }) => {
  const feed = await openFeed(context);
  await expect(feed.shorts).toBeVisible();
  await expect(feed.mostRelevant).toBeVisible();
  await expectVideosVisible(feed.videos);
});

test('changes nothing outside the Subscriptions feed', async ({ context, popup }) => {
  await setSetting(popup, 'subscriptionCleanMode', true);
  const feed = await openFeed(context, 'https://www.youtube.com/feed/history');
  await expect(feed.shorts).toBeVisible();
  await expect(feed.mostRelevant).toBeVisible();
});

test('recognizes the Shorts shelf by structure, without its title or links', async ({ context, popup }) => {
  const feed = await openFeed(context);
  // Stand-in for another UI language and for lockups without plain /shorts/ links.
  await feed.shorts.evaluate((section) => {
    section.querySelectorAll('#title').forEach((title) => { title.textContent = 'Untitled shelf'; });
    section.querySelectorAll('a[href*="/shorts/"]').forEach((link) => link.removeAttribute('href'));
  });
  await setSetting(popup, 'subscriptionCleanMode', true);
  await expect(feed.shorts).toBeHidden();
});

test('keeps a shelf whose title only contains "most relevant"', async ({ context, popup }) => {
  const feed = await openFeed(context);
  await feed.mostRelevant.evaluate((section) => {
    section.querySelector('#title').textContent = 'The most relevant uploads this week';
  });
  await setSetting(popup, 'subscriptionCleanMode', true);
  await expect(feed.shorts).toBeHidden();
  await expect(feed.mostRelevant).toBeVisible();
});

test('hides a Shorts shelf that loads in later', async ({ context, popup }) => {
  await setSetting(popup, 'subscriptionCleanMode', true);
  const feed = await openFeed(context);
  await expect(feed.shorts).toBeHidden();
  // Infinite scroll appends more sections; append a copy of the captured Shorts shelf.
  await feed.page.evaluate(() => {
    const contents = document.querySelector('ytd-rich-grid-renderer > #contents');
    const copy = contents.querySelector('ytd-rich-section-renderer:has([is-shorts])').cloneNode(true);
    copy.removeAttribute('data-browser-buddy-hidden');
    copy.querySelectorAll('[data-browser-buddy-hidden]').forEach((n) => n.removeAttribute('data-browser-buddy-hidden'));
    copy.style.display = '';
    copy.querySelectorAll('[style]').forEach((n) => { n.style.display = ''; });
    copy.id = 'late-shorts';
    contents.append(copy);
  });
  await expect(feed.page.locator('#late-shorts')).toBeHidden();
});
