const { test, expect, setSetting } = require('../e2e/fixtures');
const { openVideo, waitForPlayback } = require('./live-helpers');
const videos = require('./videos');

// One video at a time only counts audible videos; openVideo starts them muted.
const unmute = (page) => page.evaluate(() => { const v = document.querySelector('#movie_player video'); v.muted = false; v.volume = 1; });
const isPlaying = (page) => page.evaluate(() => !document.querySelector('#movie_player video').paused);

// A plays; B opens from search results in another tab (an in-page navigation, as when you
// click a result), which pauses A.
async function startTwo(context, popup) {
  await setSetting(popup, 'oneVideoAtATime', true);
  const a = await openVideo(context, videos.multiDub);
  await unmute(a);
  const b = await context.newPage();
  await b.goto('https://www.youtube.com/results?search_query=lofi+hip+hop', { waitUntil: 'domcontentloaded' });
  await b.locator('ytd-video-renderer a#thumbnail[href*="watch"]').first().click();
  await waitForPlayback(b);
  await unmute(b);
  await expect.poll(() => isPlaying(a), { timeout: 15000 }).toBe(false);
  return { a, b };
}

test('Back from the second video to search results resumes the first', async ({ context, popup }) => {
  const { a, b } = await startTwo(context, popup);
  await b.goBack();
  await expect.poll(() => isPlaying(a), { timeout: 15000 }).toBe(true);
});

test('the YouTube logo from the second video resumes the first', async ({ context, popup }) => {
  const { a, b } = await startTwo(context, popup);
  await b.locator('ytd-masthead a#logo').first().click();
  await expect.poll(() => isPlaying(a), { timeout: 15000 }).toBe(true);
});
