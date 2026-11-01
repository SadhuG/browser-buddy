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

  // Only input aimed at the player counts: typing a comment or clicking Like isn't a choice
  // about the video. Keys count outside text fields because YouTube's shortcuts work page-wide.
  const PLAYER_UI = '#movie_player, #shorts-player, .html5-video-player, ytd-player, .ytp-popup, ytd-popup-container, tp-yt-iron-dropdown';
  const isPlayerInput = (event) => {
    if (!event.isTrusted) return false;
    const target = event.target instanceof Element ? event.target : null;
    if (event.type === 'keydown') return !target || !(target.isContentEditable || target.closest('input, textarea, select'));
    return !!target && !!target.closest(PLAYER_UI);
  };
  const markInput = (event) => { if (isPlayerInput(event)) lastInput = performance.now(); };
  window.addEventListener('pointerdown', markInput, true);
  window.addEventListener('keydown', markInput, true);

  const post = (type, extra = {}) => window.postMessage({ source: SOURCE, to: 'extension', type, ...extra }, location.origin);

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window || !data || data.source !== SOURCE || data.to !== 'page') return;
    if (data.type === 'settings') {
      // A new style in the popup replaces a touched style everywhere: YouTube can't show two.
      const styleOf = (s) => JSON.stringify([s.captionStyle, s.captionStyleEnabled]);
      if (settings && styleOf(settings) !== styleOf(data.settings)) endStyleTouch();
      settings = data.settings; lastStatusJson = ''; tick();
    }
    if (data.type === 'clear-touch') {
      const state = stateFor(visiblePlayer());
      if (data.setting === 'captionStyle') endStyleTouch();
      else if (state) state.tracker.clear(data.setting);
      lastInput = -Infinity; // the popup's choice is newer than any click in the player
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
    if (!state) {
      const tracker = BB.touch.createTouchTracker({ comparators: { captionStyle: (a, b) => BB.captionStyle.stylesEqual(a, b) } });
      state = { videoId: undefined, video: {}, tracker };
      players.set(player, state);
    }
    return state;
  }
  function safe(fn) { try { return fn(); } catch (_) { return null; } }

  // YouTube keeps one caption style for every tab (localStorage, pushed to other tabs' players
  // through the "storage" event; measured 2026-10-30). So a style touch is shared: the tab that
  // owns it keeps a note in localStorage, refreshed every tick, and every tab leaves the style
  // alone while the note is live. It ends when the owner's video ends or its tab closes, or when
  // the user picks a style in the popup or taps "Use Browser Buddy setting" in any tab.
  const STYLE_TOUCH_KEY = 'browser-buddy-caption-style-touch';
  const STYLE_TOUCH_STALE_MS = 5 * 60 * 1000; // an owner tab that crashed or was discarded
  const tabToken = Math.random().toString(36).slice(2);
  let otherTabStyleAt = -Infinity;
  window.addEventListener('storage', (event) => { if (event.key === 'yt-player-caption-display-settings') otherTabStyleAt = performance.now(); });
  function sharedStyleTouch() {
    const note = safe(() => JSON.parse(localStorage.getItem(STYLE_TOUCH_KEY)));
    return note && note.style && Date.now() - note.at < STYLE_TOUCH_STALE_MS ? note : null;
  }
  function writeStyleTouch(style) { safe(() => localStorage.setItem(STYLE_TOUCH_KEY, JSON.stringify({ owner: tabToken, style, at: Date.now() }))); }
  function dropOwnStyleTouch() { if (sharedStyleTouch()?.owner === tabToken) safe(() => localStorage.removeItem(STYLE_TOUCH_KEY)); }
  function endStyleTouch() {
    safe(() => localStorage.removeItem(STYLE_TOUCH_KEY));
    const state = stateFor(visiblePlayer());
    if (state) { state.tracker.clear('captionStyle'); state.ownsStyleTouch = false; }
  }
  window.addEventListener('pagehide', dropOwnStyleTouch);

  // A new viewing ends every touch and forgets what was applied: another video, another player
  // (watch page vs Shorts), or coming back after the video wasn't shown for AWAY_TICKS ticks
  // (Home, search). The miniplayer still shows the video, so it doesn't count as leaving.
  // `viewing` counts them; content.js keys the speed touch on it.
  const AWAY_TICKS = 2;
  let viewing = 0;
  let lastPlayer = null;
  function newViewing(state, videoId) {
    if (state.ownsStyleTouch) dropOwnStyleTouch();
    state.videoId = videoId; state.video = {}; state.tracker.reset(); state.ownsStyleTouch = false;
    // The click that opened it (a related video, autoplay's "Play now") isn't a choice about it.
    lastInput = -Infinity;
    viewing++;
  }

  function tick() {
    const status = { videoId: null, surface: null, viewing, touched: {}, auto: {}, unavailable: {} };
    const player = visiblePlayer();
    const state = stateFor(player);
    if (player) {
      const videoId = safe(() => player.getVideoData().video_id) || null;
      status.surface = surface();
      const cameBack = status.surface && state.away >= AWAY_TICKS;
      state.away = status.surface ? 0 : (state.away || 0) + 1;
      if (state.videoId !== videoId || player !== lastPlayer || cameBack) newViewing(state, videoId);
      status.videoId = videoId;
      status.viewing = viewing;
      const ad = player.classList.contains('ad-showing');
      // Likewise "Skip ad": YouTube settling its captions or audio after the ad isn't the user's.
      if (state.ad && !ad) lastInput = -Infinity;
      state.ad = ad;
      if (settings && videoId && status.surface && !ad) {
        const ctx = { settings, tracker: state.tracker, now: Date.now(), userInitiated: performance.now() - lastInput < INPUT_WINDOW_MS, status, state };
        for (const applier of appliers) {
          try { applier.apply(player, ctx); } catch (_) { /* YouTube changed or is mid-load; retry next tick */ }
        }
      }
      if (state.ownsStyleTouch) writeStyleTouch(state.tracker.touches().captionStyle);
      status.touched = { ...state.tracker.touches(), ...status.touched };
    }
    lastPlayer = player;
    const json = JSON.stringify(status);
    if (json !== lastStatusJson) { lastStatusJson = json; post('status', { status }); }
  }

  // Resolution. Battery is read lazily so a page can provide navigator.getBattery late.
  let battery = null;
  let batteryRequested = false;
  function lowBattery() {
    if (!batteryRequested && typeof navigator.getBattery === 'function') {
      batteryRequested = true;
      navigator.getBattery().then((value) => { battery = value; }).catch(() => {});
    }
    return !!battery && !battery.charging && battery.level < 0.2;
  }
  // A pick in YouTube's quality menu moves the user preference; Browser Buddy's range does not.
  // YouTube keeps that preference across videos, so picking the same quality again on the next
  // video leaves it unchanged: right after input, a playing quality equal to it counts too.
  function observeQualityPick(player, tracker, now, state, userInitiated) {
    const userPreference = typeof player.getUserPlaybackQualityPreference === 'function' ? player.getUserPlaybackQualityPreference() : 'auto';
    const playing = player.getPlaybackQuality();
    const changed = state.lastQualityPreference !== undefined && userPreference !== state.lastQualityPreference;
    state.lastQualityPreference = userPreference;
    const userPicked = changed || (userInitiated && userPreference !== 'auto' && userPreference === playing);
    return tracker.observe('quality', playing, now, { userInitiated: userPicked });
  }
  appliers.push({
    name: 'quality',
    apply(player, { settings, tracker, now, status, state, userInitiated }) {
      const preference = settings.quality;
      if (tracker.isTouched('quality')) { observeQualityPick(player, tracker, now, state, userInitiated); return; }
      if (preference === 'auto') {
        if (state.qualityManaged) { state.qualityManaged = false; player.setPlaybackQualityRange('auto', 'auto'); }
        // Keep tracking YouTube's preference so switching back from Auto isn't read as a menu pick,
        // and forget the applied quality so it is applied again.
        if (typeof player.getUserPlaybackQualityPreference === 'function') state.lastQualityPreference = player.getUserPlaybackQualityPreference();
        delete state.video.quality;
        return;
      }
      const available = BB.quality.normalizeQualityData(player.getAvailableQualityData());
      const pick = BB.quality.pickQuality({ available, preference, miniplayer: status.surface === 'miniplayer', lowBattery: lowBattery() });
      if (pick.reason === 'miniplayer' || pick.reason === 'battery') status.auto.quality = { height: pick.height, reason: pick.reason };
      if (pick.maxHeight && /^\d+$/.test(preference) && Number(preference) > pick.maxHeight) status.unavailable.quality = { maxHeight: pick.maxHeight };
      if (!pick.quality) return;
      const result = observeQualityPick(player, tracker, now, state, userInitiated);
      if (tracker.isTouched('quality')) return;
      if (pick.quality !== state.video.quality || result === 'drift') {
        player.setPlaybackQualityRange(pick.quality, pick.quality);
        tracker.applied('quality', pick.quality, now);
        state.video.quality = pick.quality;
        state.qualityManaged = true;
      }
    },
  });

  // Captions on/off and language. ctx.forceCaptionsLanguage (set by the audio applier when a
  // foreign video has no dub in My languages) turns captions on in that language whatever the mode.
  const CAPTION_LOAD_TRIES = 5;
  function captionKey(player) {
    const on = player.isSubtitlesOn();
    const track = on ? player.getOption('captions', 'track') : null;
    return BB.captionTrack.captionStateKey({ on, track, translationLanguage: track && track.translationLanguage });
  }
  appliers.push({
    name: 'captions',
    apply(player, ctx) {
      const { settings, tracker, now, status, state } = ctx;
      if (status.surface === 'miniplayer') return;
      const force = ctx.forceCaptionsLanguage;
      const mode = force ? 'on' : settings.captionsMode;
      if (mode === 'youtube') return;
      const result = tracker.observe('captions', captionKey(player), now, { userInitiated: ctx.userInitiated });
      if (tracker.isTouched('captions')) return;

      let wanted;
      let show;
      if (mode === 'off') {
        wanted = 'off';
        show = () => player.unloadModule('captions');
      } else {
        const tracks = player.getOption('captions', 'tracklist', { includeAsr: true }) || [];
        if (!tracks.length) {
          state.video.captionTries = (state.video.captionTries || 0) + 1;
          // Slow connections can take a while: after the first tries, report it but keep retrying.
          if (state.video.captionTries > CAPTION_LOAD_TRIES) status.unavailable.captions = true;
          if (state.video.captionTries <= CAPTION_LOAD_TRIES || state.video.captionTries % CAPTION_LOAD_TRIES === 0) player.loadModule('captions');
          return;
        }
        const myLanguages = force ? [force, ...settings.myLanguages.filter((code) => code !== force)] : settings.myLanguages;
        const pick = BB.captionTrack.pickCaptionTrack({ tracks, translationLanguages: player.getOption('captions', 'translationLanguages') || [], myLanguages });
        if (!pick) { status.unavailable.captions = true; return; }
        wanted = BB.captionTrack.captionStateKey({ on: true, track: pick.track, translationLanguage: pick.translationLanguage });
        show = () => player.setOption('captions', 'track', pick.translationLanguage ? { ...pick.track, translationLanguage: pick.translationLanguage } : pick.track);
      }
      if (wanted !== state.video.captions || result === 'drift') {
        show();
        tracker.applied('captions', wanted, now);
        state.video.captions = wanted;
      }
    },
  });

  // Audio track, from My languages. Runs before the captions applier, which it asks to turn
  // captions on (ctx.forceCaptionsLanguage) when a foreign original has no dub you speak.
  appliers.splice(appliers.findIndex((applier) => applier.name === 'captions'), 0, {
    name: 'audio',
    apply(player, ctx) {
      const { settings, tracker, now, status, state, userInitiated } = ctx;
      if (!settings.audioTrackEnabled) return;
      const raw = player.getAvailableAudioTracks() || [];
      const tracks = raw.map(BB.audioTrack.parseAudioTrack);
      const pick = BB.audioTrack.pickAudioTrack(tracks.filter(Boolean), settings.myLanguages);
      status.audioChoice = { reason: pick.reason, language: pick.language };
      if (pick.reason === 'single-track') { status.unavailable.audio = true; return; }
      const current = player.getAudioTrack();
      const result = tracker.observe('audio', current && current.id, now, { userInitiated });
      if (tracker.isTouched('audio')) return;
      if (pick.captionLanguage) ctx.forceCaptionsLanguage = pick.captionLanguage;
      if (pick.trackId && (pick.trackId !== state.video.audio || result === 'drift')) {
        // setAudioTrack needs the raw track object, not its id (findings Q4).
        if (!current || current.id !== pick.trackId) player.setAudioTrack(raw[tracks.findIndex((track) => track && track.id === pick.trackId)]);
        tracker.applied('audio', pick.trackId, now);
        state.video.audio = pick.trackId;
      }
    },
  });

  // Caption style. Re-applied at the start of every video and whenever YouTube's stored style
  // drifts (it expires after 30 days); a change made in YouTube's own menu is a touch.
  appliers.push({
    name: 'captionStyle',
    apply(player, { settings, tracker, now, status, state, userInitiated }) {
      if (status.surface === 'miniplayer' || !settings.captionStyleEnabled) return;
      const raw = player.getSubtitlesUserSettings();
      if (!raw) return;
      const current = BB.captionStyle.fromYoutubeSettings(raw);
      const shared = sharedStyleTouch();
      // The touch this tab owned ended somewhere else (another tab's popup note, a newer touch).
      if (state.ownsStyleTouch && shared?.owner !== tabToken) { state.ownsStyleTouch = false; tracker.clear('captionStyle'); }
      if (shared && shared.owner !== tabToken) {
        // Another tab's touch: follow it. A pick in this tab's own menu takes the touch over.
        if (tracker.observe('captionStyle', current, now, { userInitiated }) === 'touched') { state.ownsStyleTouch = true; return; }
        tracker.applied('captionStyle', shared.style, now);
        status.touched.captionStyle = shared.style;
        state.video.style = null; // re-apply Browser Buddy's style once the touch ends
        return;
      }
      const result = tracker.observe('captionStyle', current, now, { userInitiated });
      if (tracker.isTouched('captionStyle')) { state.ownsStyleTouch = true; return; }
      // Another tab just changed YouTube's shared style: wait for its touch note before correcting.
      if (result === 'drift' && performance.now() - otherTabStyleAt < 3000) return;
      const wanted = settings.captionStyle;
      if (!state.video.style || result === 'drift' || !BB.captionStyle.stylesEqual(state.video.style, wanted)) {
        // Skip a style YouTube already has: re-applying it blinks the captions for nothing.
        if (!BB.captionStyle.stylesEqual(current, wanted)) {
          player.updateSubtitlesUserSettings(BB.captionStyle.toYoutubeSettings(wanted));
          // Captions already on screen only pick up the new style after an off/on (findings Q6).
          if (player.isSubtitlesOn()) { player.toggleSubtitles(); player.toggleSubtitles(); }
        }
        tracker.applied('captionStyle', wanted, now);
        state.video.style = wanted;
      }
    },
  });

  window.BrowserBuddy.bridge = { appliers, tick };
  post('hello');
  setInterval(tick, 1000);
})();
