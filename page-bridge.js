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
    if (!state) {
      const tracker = BB.touch.createTouchTracker({ comparators: { captionStyle: (a, b) => BB.captionStyle.stylesEqual(a, b) } });
      state = { videoId: undefined, video: {}, tracker };
      players.set(player, state);
    }
    return state;
  }
  function safe(fn) { try { return fn(); } catch (_) { return null; } }

  function tick() {
    const status = { videoId: null, surface: null, touched: {}, auto: {}, unavailable: {} };
    const player = visiblePlayer();
    const state = stateFor(player);
    if (player) {
      const videoId = safe(() => player.getVideoData().video_id) || null;
      // A new video ends every touch and forgets what was applied to the last one.
      if (state.videoId !== videoId) { state.videoId = videoId; state.video = {}; state.tracker.reset(); }
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
  appliers.push({
    name: 'quality',
    apply(player, { settings, tracker, now, status, state }) {
      const preference = settings.quality;
      if (preference === 'auto') {
        if (state.qualityManaged) { state.qualityManaged = false; player.setPlaybackQualityRange('auto', 'auto'); }
        return;
      }
      const available = BB.quality.normalizeQualityData(player.getAvailableQualityData());
      const pick = BB.quality.pickQuality({ available, preference, miniplayer: status.surface === 'miniplayer', lowBattery: lowBattery() });
      if (pick.reason === 'miniplayer' || pick.reason === 'battery') status.auto.quality = { height: pick.height, reason: pick.reason };
      if (pick.maxHeight && /^\d+$/.test(preference) && Number(preference) > pick.maxHeight) status.unavailable.quality = { maxHeight: pick.maxHeight };
      if (!pick.quality) return;
      // A pick in YouTube's quality menu moves the user preference; Browser Buddy's range does not.
      const userPreference = typeof player.getUserPlaybackQualityPreference === 'function' ? player.getUserPlaybackQualityPreference() : 'auto';
      const userPicked = state.lastQualityPreference !== undefined && userPreference !== state.lastQualityPreference;
      state.lastQualityPreference = userPreference;
      const result = tracker.observe('quality', player.getPlaybackQuality(), now, { userInitiated: userPicked });
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
          if (state.video.captionTries > CAPTION_LOAD_TRIES) status.unavailable.captions = true;
          else player.loadModule('captions');
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
      const result = tracker.observe('captionStyle', BB.captionStyle.fromYoutubeSettings(raw), now, { userInitiated });
      if (tracker.isTouched('captionStyle')) return;
      const wanted = settings.captionStyle;
      if (!state.video.style || result === 'drift' || !BB.captionStyle.stylesEqual(state.video.style, wanted)) {
        player.updateSubtitlesUserSettings(BB.captionStyle.toYoutubeSettings(wanted));
        // Captions already on screen only pick up the new style after an off/on (findings Q6).
        if (player.isSubtitlesOn()) { player.toggleSubtitles(); player.toggleSubtitles(); }
        tracker.applied('captionStyle', wanted, now);
        state.video.style = wanted;
      }
    },
  });

  window.BrowserBuddy.bridge = { appliers, tick };
  post('hello');
  setInterval(tick, 1000);
})();
