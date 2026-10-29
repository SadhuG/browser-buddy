// Helpers for live tests on real youtube.com.

// Open a real video and wait until it plays with no ad: clicks Skip when offered
// and accepts a consent dialog if one appears.
async function openVideo(context, id, { path = 'watch' } = {}) {
  const page = await context.newPage();
  await page.goto(path === 'shorts' ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`, { waitUntil: 'domcontentloaded' });
  await waitForPlayback(page, path === 'shorts' ? '#shorts-player' : '#movie_player');
  return page;
}

async function waitForPlayback(page, selector = '#movie_player', timeout = 90000) {
  const consent = page.locator('button[aria-label^="Accept all"], form[action*="consent"] button').first();
  await page.waitForFunction((sel) => { const p = document.querySelector(sel); return p && typeof p.getVideoData === 'function'; }, selector, { timeout });
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await consent.isVisible().catch(() => false)) await consent.click().catch(() => {});
    const playing = await page.evaluate((sel) => {
      const p = document.querySelector(sel);
      const video = p.querySelector('video');
      if (video && video.paused) { video.muted = true; video.play().catch(() => {}); }
      return !p.classList.contains('ad-showing') && p.getPlayerState() === 1;
    }, selector);
    if (playing) return;
    const skip = page.locator('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern');
    if (await skip.count()) await skip.first().click({ timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }
  throw new Error('video did not start playing without an ad');
}

module.exports = { openVideo, waitForPlayback };
