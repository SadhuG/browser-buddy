const { test, expect, openStubVideo, setSetting } = require('./fixtures');

const GRACE_MS = 8000; // lib/one-video.js ENDED_GRACE_MS
const open = (context, id, seconds = 30) => openStubVideo(context, { id, config: { media: { seconds } } });
const play = (page) => page.evaluate(() => document.querySelector('video').play());
const pauseVideo = (page) => page.evaluate(() => document.querySelector('video').pause());
const isPlaying = (page) => page.evaluate(() => !document.querySelector('video').paused);
const sessionState = (popup) => popup.evaluate(async () => (await chrome.storage.session.get('oneVideo')).oneVideo ?? null);
const tabId = (popup, id) => popup.evaluate(async (v) => (await chrome.tabs.query({ url: `https://www.youtube.com/watch?v=${v}` }))[0]?.id, id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// A silent 8 kHz mono WAV of `seconds`, like the stub player's own media.
function silentWav(seconds) {
  const samples = seconds * 8000, buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(8000, 24);
  buf.writeUInt32LE(16000, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(samples * 2, 40);
  return buf;
}
// From now on, count every time the page's video starts playing (window.__plays).
const countPlays = (page) => page.evaluate(() => { window.__plays = 0; document.querySelector('video').addEventListener('play', () => { window.__plays++; }); });

async function startTwo(context, { seconds } = {}) {
  const a = await open(context, 'a1');
  await play(a);
  await expect.poll(() => isPlaying(a)).toBe(true);
  const b = await open(context, 'b1', seconds);
  await play(b);
  await expect.poll(() => isPlaying(b)).toBe(true);
  return { a, b };
}

test.describe('on', () => {
  test.beforeEach(async ({ popup }) => { await setSetting(popup, 'oneVideoAtATime', true); });

  test('starting a video in a second tab pauses the first', async ({ context }) => {
    const { a } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
  });

  test('closing the second tab resumes the first', async ({ context }) => {
    const { a, b } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
    await b.close();
    await expect.poll(() => isPlaying(a)).toBe(true);
  });

  test('pausing the second video leaves the first paused', async ({ context }) => {
    const { a, b } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
    await pauseVideo(b);
    await wait(1000);
    expect(await isPlaying(a)).toBe(false);
  });

  test('a video that ends resumes the first after the grace', async ({ context }) => {
    test.setTimeout(30000);
    const { a } = await startTwo(context, { seconds: 1 });
    await expect.poll(() => isPlaying(a)).toBe(false);
    await expect.poll(() => isPlaying(a), { timeout: GRACE_MS + 4000 }).toBe(true);
  });

  test('video that plays again within the grace keeps the other paused', async ({ context }) => {
    test.setTimeout(30000);
    const { a, b } = await startTwo(context, { seconds: 1 });
    await expect.poll(() => isPlaying(a)).toBe(false);
    await countPlays(a);
    await expect.poll(() => b.evaluate(() => document.querySelector('video').ended)).toBe(true);
    await play(b); // like autoplay or a playlist moving on in the same tab
    await wait(GRACE_MS + 1000);
    expect(await a.evaluate(() => window.__plays)).toBe(0); // not even briefly
  });

  test('muted video does not pause others', async ({ context }) => {
    const a = await open(context, 'a1');
    await play(a);
    const b = await open(context, 'b1');
    await b.evaluate(() => { document.querySelector('video').muted = true; });
    await play(b);
    await expect.poll(() => isPlaying(b)).toBe(true);
    await wait(1000);
    expect(await isPlaying(a)).toBe(true);
  });

  test('navigating the playing tab off YouTube resumes the first', async ({ context }) => {
    const { a, b } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
    await b.goto('https://dupes.test/elsewhere');
    await expect.poll(() => isPlaying(a)).toBe(true);
  });

  // In-page navigation as real YouTube does it (checked live 2026-11-22): the URL changes,
  // `yt-navigate-finish` fires, and the player is unloaded with no `pause` event. Back fires
  // no `yt-navigate-start`, so only the finish is simulated. unload: false is the mini-player.
  const navigateInPage = (page, path, { unload = true } = {}) => page.evaluate(([to, unloadPlayer]) => {
    history.pushState({}, '', to);
    document.dispatchEvent(new CustomEvent('yt-navigate-finish', { bubbles: true }));
    if (unloadPlayer) { const v = document.querySelector('video'); v.removeAttribute('src'); v.srcObject = null; v.load(); }
  }, [path, unload]);

  test('leaving the playing video for Home resumes the first', async ({ context }) => {
    const { a, b } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
    await navigateInPage(b, '/');
    await expect.poll(() => isPlaying(a)).toBe(true);
  });

  test('going back to search results resumes the first', async ({ context }) => {
    const { a, b } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
    await navigateInPage(b, '/results?search_query=lofi');
    await expect.poll(() => isPlaying(a)).toBe(true);
  });

  test('leaving a video the user paused leaves the first paused', async ({ context }) => {
    const { a, b } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
    await pauseVideo(b);
    await wait(500);
    await navigateInPage(b, '/');
    await wait(2500);
    expect(await isPlaying(a)).toBe(false);
  });

  test('a video still playing in the mini-player keeps the first paused', async ({ context }) => {
    const { a, b } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
    await navigateInPage(b, '/', { unload: false });
    await wait(2500);
    expect(await isPlaying(b)).toBe(true);
    expect(await isPlaying(a)).toBe(false);
  });

  test('moving to another video in the same tab keeps the first paused', async ({ context }) => {
    const { a, b } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
    await countPlays(a);
    const src = await b.evaluate(() => document.querySelector('video').src);
    await navigateInPage(b, '/watch?v=b2');
    await b.evaluate((s) => { const v = document.querySelector('video'); v.src = s; return v.play(); }, src); // the next video starts
    await expect.poll(() => isPlaying(b)).toBe(true);
    await wait(2500);
    expect(await a.evaluate(() => window.__plays)).toBe(0);
  });

  // Closing the mini-player fires pause and then unloads it; pausing it keeps it loaded (live 2026-11-22).
  test('closing the mini-player of the second video resumes the first', async ({ context }) => {
    const { a, b } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
    await navigateInPage(b, '/', { unload: false });
    await wait(1500);
    await b.evaluate(() => { const v = document.querySelector('video'); v.pause(); setTimeout(() => { v.removeAttribute('src'); v.load(); }, 150); });
    await expect.poll(() => isPlaying(a)).toBe(true);
  });

  test('pausing the mini-player of the second video leaves the first paused', async ({ context }) => {
    const { a, b } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
    await navigateInPage(b, '/', { unload: false });
    await wait(1500);
    await pauseVideo(b);
    await wait(2500);
    expect(await isPlaying(a)).toBe(false);
  });

  test('a video that starts while the first is resuming wins', async ({ context }) => {
    const { a, b } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
    const c = await open(context, 'c1');
    // A's resume takes a moment (its media arrives slowly), and C starts during it, like a
    // background tab that starts when closing B brings it to the front. A's own playing event
    // must not count as a new start.
    await context.route('https://www.youtube.com/slow-media.wav', async (route) => {
      await wait(800);
      await route.fulfill({ contentType: 'audio/wav', body: silentWav(30) });
    });
    await a.evaluate(() => { const v = document.querySelector('video'); v.preload = 'none'; v.src = '/slow-media.wav'; });
    await b.close();
    await wait(200);
    await play(c);
    await expect.poll(() => isPlaying(a)).toBe(false);
    await wait(2000);
    expect(await isPlaying(c)).toBe(true);
    expect(await isPlaying(a)).toBe(false);
  });

  test('resume plays the same video element that was paused', async ({ context }) => {
    const a = await open(context, 'a1');
    // A second player on the page (like the Shorts player next to the hidden watch player) plays.
    await a.evaluate(() => {
      const holder = document.createElement('div'); holder.id = 'shorts-player';
      const v = document.createElement('video'); v.src = document.querySelector('#movie_player video').src;
      holder.append(v); document.body.append(holder); return v.play();
    });
    const shortsPlaying = () => a.evaluate(() => !document.querySelector('#shorts-player video').paused);
    await expect.poll(shortsPlaying).toBe(true);
    const b = await open(context, 'b1');
    await play(b);
    await expect.poll(shortsPlaying).toBe(false);
    await b.close();
    await expect.poll(shortsPlaying).toBe(true);
    expect(await isPlaying(a)).toBe(false); // the watch player stays put
  });

  test('reloading the second tab and leaving it idle resumes the first', async ({ context }) => {
    const { a, b } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
    await b.reload();
    await expect.poll(() => isPlaying(a), { timeout: 8000 }).toBe(true);
  });

  test('reloading the second tab into a playing video keeps the first paused', async ({ context }) => {
    const { a, b } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
    await countPlays(a);
    await b.reload();
    await play(b);
    await wait(4500); // past the new page's load check
    expect(await a.evaluate(() => window.__plays)).toBe(0);
  });

  test('going to YouTube Music in the second tab resumes the first', async ({ context }) => {
    await context.route('https://music.youtube.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Music</title>' }));
    const { a, b } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
    await b.goto('https://music.youtube.com/');
    await expect.poll(() => isPlaying(a)).toBe(true);
  });

  test('first mode: closing C resumes A and B stays paused', async ({ context, popup }) => {
    await setSetting(popup, 'oneVideoResume', 'first');
    const { a, b } = await startTwo(context);
    const c = await open(context, 'c1');
    await play(c);
    await expect.poll(() => isPlaying(b)).toBe(false);
    await c.close();
    await expect.poll(() => isPlaying(a)).toBe(true);
    expect(await isPlaying(b)).toBe(false);
  });

  test('state is kept in session storage', async ({ context, popup }) => {
    const { a } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
    const [idA, idB] = [await tabId(popup, 'a1'), await tabId(popup, 'b1')];
    await expect.poll(() => sessionState(popup)).toEqual({ current: idB, waiting: [idA], held: null });
  });

  test('a waiting tab that moved to another video is not resumed', async ({ context }) => {
    const { a, b } = await startTwo(context);
    await expect.poll(() => isPlaying(a)).toBe(false);
    await a.evaluate(() => { window.__bbStub.state.videoId = 'a2'; }); // the player now holds another video
    await wait(2500);
    await b.close();
    await wait(1500);
    expect(await isPlaying(a)).toBe(false);
  });

  test('an ended video that is waiting does not replay', async ({ context }) => {
    const a = await open(context, 'a1', 1);
    await play(a);
    await expect.poll(() => a.evaluate(() => document.querySelector('video').ended)).toBe(true);
    const b = await open(context, 'b1'); // starts within A's grace, so A is put in line
    await play(b);
    await expect.poll(() => isPlaying(b)).toBe(true);
    await a.evaluate(() => { window.__plays = 0; document.querySelector('video').addEventListener('play', () => { window.__plays++; }); });
    await b.close();
    await wait(1500);
    expect(await a.evaluate(() => window.__plays)).toBe(0);
  });

  test('tutorial mode on: nothing is tracked', async ({ context, popup }) => {
    await setSetting(popup, 'tutorialMode', true);
    await startTwo(context);
    await wait(1000);
    expect(await sessionState(popup)).toBe(null);
  });
});

test('feature off: both videos play', async ({ context }) => {
  const { a } = await startTwo(context);
  await wait(1000);
  expect(await isPlaying(a)).toBe(true);
});

test('turning it on while a video plays tracks that video', async ({ context, popup }) => {
  const a = await open(context, 'a1');
  await play(a);
  await expect.poll(() => isPlaying(a)).toBe(true);
  await setSetting(popup, 'oneVideoAtATime', true);
  await wait(500);
  const b = await open(context, 'b1');
  await play(b);
  await expect.poll(() => isPlaying(a)).toBe(false);
});
