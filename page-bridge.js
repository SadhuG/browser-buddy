// Runs in the YouTube page's own world ("world": "MAIN") so it can call the player API.
// content.js owns chrome.storage and talks to this script with window.postMessage:
//   page -> extension: hello, status      extension -> page: settings, clear-touch
// Feature appliers (resolution, captions, audio) register in `appliers`; each gets the
// visible player and a ctx { settings, tracker, now, userInitiated, status, state }.
(function () {
  if (window.__browserBuddyBridge) return;
  window.__browserBuddyBridge = true;

  const BB = window.BrowserBuddy;
  const SOURCE = 'browser-buddy';
  const INPUT_WINDOW_MS = 2000;
  const appliers = [];
  const players = new WeakMap(); // player element -> { videoId, tracker }
  let settings = null;
  let lastInput = -Infinity;
  let lastStatusJson = '';

  // A change counts as the user's only right after real input in this page.
  const markInput = (event) => { if (event.isTrusted) lastInput = performance.now(); };
  window.addEventListener('pointerdown', markInput, true);
  window.addEventListener('keydown', markInput, true);

  const post = (type, extra = {}) => window.postMessage({ source: SOURCE, to: 'extension', type, ...extra }, location.origin);

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window || !data || data.source !== SOURCE || data.to !== 'page') return;
    if (data.type === 'settings') { settings = data.settings; lastStatusJson = ''; tick(); }
    if (data.type === 'clear-touch') {
      const state = stateFor(visiblePlayer());
      if (state) state.tracker.clear(data.setting);
      tick();
    }
  });

  function onShorts() { return location.pathname.startsWith('/shorts/'); }
  function visiblePlayer() {
    const player = document.querySelector(onShorts() ? '#shorts-player' : '#movie_player');
    return player && typeof player.getVideoData === 'function' ? player : null;
  }
  // The miniplayer keeps #movie_player but moves the page to another URL (often "/").
  function surface() {
    if (document.querySelector('ytd-app[miniplayer-is-active]')) return 'miniplayer';
    if (onShorts()) return 'shorts';
    if (location.pathname === '/watch') return 'watch';
    return null;
  }
  function stateFor(player) {
    if (!player) return null;
    let state = players.get(player);
    if (!state) { state = { videoId: undefined, tracker: BB.touch.createTouchTracker() }; players.set(player, state); }
    return state;
  }
  function safe(fn) { try { return fn(); } catch (_) { return null; } }

  function tick() {
    const status = { videoId: null, surface: null, touched: {}, auto: {}, unavailable: {} };
    const player = visiblePlayer();
    const state = stateFor(player);
    if (player) {
      const videoId = safe(() => player.getVideoData().video_id) || null;
      if (state.videoId !== videoId) { state.videoId = videoId; state.tracker.reset(); }
      status.videoId = videoId;
      status.surface = surface();
      const ad = player.classList.contains('ad-showing');
      if (settings && videoId && status.surface && !ad) {
        const ctx = { settings, tracker: state.tracker, now: Date.now(), userInitiated: performance.now() - lastInput < INPUT_WINDOW_MS, status, state };
        for (const applier of appliers) {
          try { applier.apply(player, ctx); } catch (_) { /* YouTube changed or is mid-load; retry next tick */ }
        }
      }
      status.touched = { ...state.tracker.touches(), ...status.touched };
    }
    const json = JSON.stringify(status);
    if (json !== lastStatusJson) { lastStatusJson = json; post('status', { status }); }
  }

  window.BrowserBuddy.bridge = { appliers, tick };
  post('hello');
  setInterval(tick, 1000);
})();
