let playbackSpeed = 1;
let tutorialMode = false;
let subscriptionCleanMode = false;
let hideAmazonCart = false;
let currentVideoId = getVideoId(location.href);
let wasAutoPaused = false;
let lastVideo = null;
let lastUrl = location.href;
const hiddenAttribute = 'data-browser-buddy-hidden';
let hiddenNodes = [];

// Keep Amazon page content flush with the viewport without depending on
// Amazon's generated body-class names.
if (/(^|\.)amazon\./.test(location.hostname)) {
  const amazonBodyPaddingStyle = document.createElement('style');
  amazonBodyPaddingStyle.textContent = 'body { padding-right: 0px !important; } .nav-ewc-arrow { display: none !important; }';
  document.documentElement.appendChild(amazonBodyPaddingStyle);
}

let settings = BrowserBuddy.settings.normalizeSettings({});
function loadSettings() {
  chrome.storage.local.get(null, (values) => {
    // A failed read would normalize to defaults and reset every video: keep what we have.
    if (chrome.runtime.lastError || !values) return;
    settings = BrowserBuddy.settings.normalizeSettings(values);
    ({ playbackSpeed, tutorialMode, subscriptionCleanMode, hideAmazonCart } = settings);
    sendSettingsToPage();
    applySettings(); scheduleSubscriptionClean(); scheduleAmazonCartHide(); syncOneVideo();
  });
}
loadSettings();
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local') loadSettings(); });
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'FOCUS_LOST') pauseVideo();
  if (message.type === 'FOCUS_GAINED') resumeVideo();
  if (message.type === 'TUTORIAL_MODE_UPDATED') tutorialMode = !!message.enabled;
  if (message.type === 'SUBSCRIPTION_CLEAN_UPDATED') { subscriptionCleanMode = !!message.enabled; scheduleSubscriptionClean(); }
  if (message.type === 'AMAZON_CART_STATUS') return Promise.resolve({ found: amazonCartSidebarFound() });
  if (message.type === 'GET_TAB_STATUS') return Promise.resolve(tabStatus());
  if (message.type === 'CLEAR_TOUCH') { clearTouch(message.setting); return Promise.resolve(true); }
  if (message.type === 'ONE_VIDEO_PAUSE') return Promise.resolve(oneVideoPause());
  if (message.type === 'ONE_VIDEO_RESUME') return oneVideoResume();
});

// Relay to page-bridge.js, which runs in the page's world and calls YouTube's player.
const isYoutubePage = /(^|\.)youtube\.com$/.test(location.hostname);
const bridgeMessage = (type, extra = {}) => window.postMessage({ source: 'browser-buddy', to: 'page', type, ...extra }, location.origin);
let bridgeStatus = null;
// YouTube's own scripts can read page messages, so send only what the bridge uses.
const BRIDGE_SETTINGS = ['quality', 'captionsMode', 'captionStyleEnabled', 'captionStyle', 'myLanguages', 'audioTrackEnabled'];
function sendSettingsToPage() {
  if (!isYoutubePage) return;
  bridgeMessage('settings', { settings: Object.fromEntries(BRIDGE_SETTINGS.map((key) => [key, settings[key]])) });
}
// Page scripts can post a fake status too: keep only the shape and keys the popup reads.
const STATUS_KEYS = { touched: ['quality', 'captions', 'audio', 'captionStyle'], auto: ['quality'], unavailable: ['quality', 'captions', 'audio'] };
function cleanStatus(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // null is a real value here (e.g. a touched audio track without an id), so only drop missing keys.
  const pick = (value, keys) => Object.fromEntries(keys.filter((key) => value && typeof value === 'object' && Object.hasOwn(value, key) && value[key] !== undefined).map((key) => [key, value[key]]));
  const choice = raw.audioChoice;
  return {
    videoId: typeof raw.videoId === 'string' ? raw.videoId : null,
    surface: typeof raw.surface === 'string' ? raw.surface : null,
    viewing: Number.isFinite(raw.viewing) ? raw.viewing : 0,
    touched: pick(raw.touched, STATUS_KEYS.touched),
    auto: pick(raw.auto, STATUS_KEYS.auto),
    unavailable: pick(raw.unavailable, STATUS_KEYS.unavailable),
    ...(choice && typeof choice === 'object' ? { audioChoice: { reason: String(choice.reason), language: choice.language == null ? null : String(choice.language) } } : {}),
  };
}
if (isYoutubePage) {
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window || !data || data.source !== 'browser-buddy' || data.to !== 'extension') return;
    if (data.type === 'hello') sendSettingsToPage();
    if (data.type === 'status') { const status = cleanStatus(data.status); if (status) { bridgeStatus = status; applySettings(); } }
  });
}
function tabStatus() {
  if (!isYoutubePage) return null;
  const status = bridgeStatus || { videoId: null, surface: null, touched: {}, auto: {}, unavailable: {} };
  return { ...status, touched: { ...status.touched, ...speedTracker.touches() } };
}
function clearTouch(setting) {
  // "Use Browser Buddy setting" is newer than any click in the player before it.
  if (setting === 'speed') { speedTracker.clear('speed'); lastUserInput = -Infinity; applySettings(); return; }
  if (isYoutubePage) bridgeMessage('clear-touch', { setting });
}
document.addEventListener('visibilitychange', () => document.hidden ? pauseVideo() : resumeVideo());
window.addEventListener('blur', pauseVideo); window.addEventListener('focus', resumeVideo);

function getVideoId(value) { try { const url = new URL(value); return url.hostname.includes('youtube.com') && url.pathname === '/watch' ? url.searchParams.get('v') : null; } catch (_) { return null; } }
function isTutorialMode() { return !!currentVideoId && tutorialMode; }
function videoElement() { const video = document.querySelector('video'); if (video !== lastVideo) { lastVideo = video; wasAutoPaused = false; speedTracker.reset(); } return video; }
function pauseVideo() { if (!isTutorialMode()) return; const video = videoElement(); if (video && !video.paused) { video.pause(); wasAutoPaused = true; } }
function resumeVideo() { if (!isTutorialMode() || !wasAutoPaused) return; const video = videoElement(); if (video?.paused) video.play().catch(() => {}); wasAutoPaused = false; }

// "Your touch wins" for speed: a rate the user picks in YouTube's player holds for that
// video; a rate change without user input (e.g. YouTube's own) is reverted.
const speedTracker = BrowserBuddy.touch.createTouchTracker({ graceMs: 0, comparators: { speed: (a, b) => Math.abs(a - b) < .01 } });
let lastUserInput = -Infinity;
// Only input aimed at the player counts (see page-bridge.js): typing a comment isn't a speed pick.
const PLAYER_UI = '#movie_player, #shorts-player, .html5-video-player, ytd-player, .ytp-popup, ytd-popup-container, tp-yt-iron-dropdown';
function isPlayerInput(event) {
  if (!event.isTrusted) return false;
  const target = event.target instanceof Element ? event.target : null;
  if (event.type === 'keydown') return !target || !(target.isContentEditable || target.closest('input, textarea, select'));
  return !!target && !!target.closest(PLAYER_UI);
}
const markUserInput = (event) => { if (isPlayerInput(event)) lastUserInput = performance.now(); };
const userJustActed = () => performance.now() - lastUserInput < 2000;
window.addEventListener('pointerdown', markUserInput, true);
window.addEventListener('keydown', markUserInput, true);
document.addEventListener('ratechange', (event) => {
  if (event.target !== videoElement()) return;
  const result = speedTracker.observe('speed', event.target.playbackRate, Date.now(), { userInitiated: userJustActed() });
  if (result === 'drift') applySettings();
}, true);
// Watch pages and Shorts both count as "a video" for ending a touch. On YouTube the bridge decides
// (video id plus its viewing count): the miniplayer moves the page to "/" while the same video
// keeps playing, and coming back to a video after leaving it is a new viewing.
function videoKey(value) { try { const url = new URL(value); return url.searchParams.get('v') || (url.pathname.match(/^\/shorts\/([^/]+)/) || [])[1] || null; } catch (_) { return null; } }
const currentVideoKey = () => (bridgeStatus ? `${bridgeStatus.videoId}#${bridgeStatus.viewing}` : videoKey(location.href));
let lastVideoKey = videoKey(location.href);
// The click that opened the next video isn't a choice about that video's speed.
function noteNavigation() { const key = currentVideoKey(); if (key !== lastVideoKey) { lastVideoKey = key; lastUserInput = -Infinity; speedTracker.reset(); } }

function applySettings() {
  noteNavigation();
  const video = videoElement();
  if (!video || speedTracker.isTouched('speed')) return;
  if (Math.abs(video.playbackRate - playbackSpeed) > .01) {
    // A rate the user just picked can be seen here before its ratechange event fires.
    if (userJustActed() && speedTracker.observe('speed', video.playbackRate, Date.now(), { userInitiated: true }) === 'touched') return;
    video.playbackRate = playbackSpeed;
  }
  speedTracker.applied('speed', playbackSpeed, Date.now());
}

// One video at a time: report this tab's audible playback to the service worker, which pauses
// and resumes tabs (lib/one-video.js). Tutorial mode wins: while it's on, this stands down.
const oneVideoActive = () => isYoutubePage && settings.oneVideoAtATime && !settings.tutorialMode;
const isAudible = (video) => !video.muted && video.volume > 0;
let reportedVideo = null; // the video this tab reported as started; null when not playing
let endedTimer = null;
// What Browser Buddy paused, if it paused a playing video: that element and its viewing
// (currentVideoKey). Only that viewing, in that element, may come back.
let pausedVideo = null;
let pausedKey = null;
let documentReported = false; // whether this page has told the worker anything yet
function reportOneVideo(event) {
  if (!oneVideoActive()) return;
  documentReported = true;
  chrome.runtime.sendMessage({ type: 'ONE_VIDEO_EVENT', event }).catch(() => {});
}
function onMediaEvent(event) {
  const video = event.target;
  if (!(video instanceof HTMLVideoElement) || !oneVideoActive()) return;
  if ((event.type === 'playing' || event.type === 'volumechange') && !video.paused && isAudible(video)) {
    clearTimeout(endedTimer); endedTimer = null;
    if (reportedVideo !== video) { reportedVideo = video; reportOneVideo('started'); }
    return;
  }
  if (video !== reportedVideo) return;
  if (event.type === 'ended') {
    reportedVideo = null;
    clearTimeout(endedTimer);
    // Autoplay, a playlist or an ad handing over plays again in this tab within the grace.
    endedTimer = setTimeout(() => { endedTimer = null; if (!reportedVideo) reportOneVideo('finished'); }, BrowserBuddy.oneVideo.ENDED_GRACE_MS);
  } else if ((event.type === 'pause' && !video.ended) || (event.type === 'volumechange' && !isAudible(video))) {
    // Off a video page this is the mini-player, or the player going away: the left check decides.
    if (!isVideoPage()) { scheduleLeftCheck(); return; }
    reportedVideo = null;
    reportOneVideo('paused');
  }
}
if (isYoutubePage) ['playing', 'pause', 'ended', 'volumechange'].forEach((type) => document.addEventListener(type, onMediaEvent, true));
// Leaving the video page in the tab (Back, the logo, Home, search) unloads the player with no
// pause event, and Back fires no yt-navigate-start. Closing the mini-player fires pause, then
// unloads it; pausing the mini-player fires only pause and keeps the video loaded (all checked
// live 2026-11-22). So a moment after landing off a video page, or after a pause there: still
// playing is the mini-player (nothing to report), loaded but quiet is a pause, and an unloaded
// player means the tab is done with its video, as if closed.
const LEFT_CHECK_MS = 1000;
const isVideoPage = () => /^\/(watch$|shorts\/|live\/)/.test(location.pathname);
let leftTimer = null;
function scheduleLeftCheck() {
  clearTimeout(leftTimer);
  leftTimer = setTimeout(() => {
    leftTimer = null;
    if (!oneVideoActive() || isVideoPage()) return;
    const video = reportedVideo;
    const loaded = video && video.isConnected && video.readyState > HTMLMediaElement.HAVE_NOTHING;
    if (loaded && !video.paused && isAudible(video)) return;
    reportedVideo = null;
    clearTimeout(endedTimer); endedTimer = null;
    reportOneVideo(loaded ? 'paused' : 'left');
  }, LEFT_CHECK_MS);
}
function onYoutubeNavigated() {
  clearTimeout(leftTimer); leftTimer = null;
  if (oneVideoActive() && !isVideoPage()) scheduleLeftCheck();
}
if (isYoutubePage) document.addEventListener('yt-navigate-finish', onYoutubeNavigated);
const LOAD_CHECK_MS = 3000;
let loadCheckScheduled = false;
// Turned on (or Tutorial mode off) while a video already plays: report it, so the next start pauses
// it. Turned off: drop everything pending, so nothing from before reaches a later session.
function syncOneVideo() {
  if (!oneVideoActive()) {
    reportedVideo = null; pausedVideo = null; pausedKey = null;
    clearTimeout(endedTimer); endedTimer = null;
    clearTimeout(leftTimer); leftTimer = null;
    return;
  }
  // A new page in this tab (a reload, a link) ends whatever its old page was playing. If this page
  // hasn't started anything soon, tell the worker, so a video waiting on that old page comes back.
  if (!loadCheckScheduled) {
    loadCheckScheduled = true;
    setTimeout(() => { if (!documentReported) reportOneVideo('left'); }, LOAD_CHECK_MS);
  }
  const playing = [...document.querySelectorAll('video')].find((v) => !v.paused && isAudible(v));
  if (playing && playing !== reportedVideo) { reportedVideo = playing; reportOneVideo('started'); }
}
function oneVideoPause() {
  const video = reportedVideo || [...document.querySelectorAll('video')].find((v) => !v.paused && isAudible(v));
  // The worker already moved on to the other tab: this pause isn't the user's.
  reportedVideo = null;
  clearTimeout(endedTimer); endedTimer = null;
  // Only a video Browser Buddy actually stopped may come back later.
  const stopping = video && !video.paused;
  pausedVideo = stopping ? video : null;
  pausedKey = stopping ? currentVideoKey() : null;
  if (stopping) video.pause();
  return true;
}
// Long enough for a background tab to rebuffer on a slow connection; other tabs' events wait at most this.
const RESUME_TIMEOUT_MS = 5000;
async function oneVideoResume() {
  if (!oneVideoActive()) return false;
  const [video, key] = [pausedVideo, pausedKey];
  pausedVideo = null; pausedKey = null;
  // Not the viewing it paused (another video, left for Home, the element replaced), or it already
  // ended: the worker hands over to the next waiting tab instead.
  if (!video || !video.isConnected || key !== currentVideoKey() || video.ended || !isAudible(video)) return false;
  if (!video.paused) return true;
  // The worker already counts this tab as playing, so its own playing event isn't a new start
  // (a new start would pause whichever tab began in the meantime).
  reportedVideo = video;
  let timer;
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        // Cancel the pending play before the worker hands over to another tab.
        if (reportedVideo === video) reportedVideo = null;
        video.pause();
        resolve(false);
      }, RESUME_TIMEOUT_MS);
    });
    return await Promise.race([video.play().then(() => true), timeout]);
  } catch (_) {
    if (reportedVideo === video) reportedVideo = null;
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function isSubscriptions() { try { return new URL(location.href).pathname === '/feed/subscriptions'; } catch (_) { return false; } }
// Shorts shelves are recognized by structure, so any UI language works. Seen on
// the Subscriptions feed (tests/fixtures/youtube, 2026-10): ytd-rich-shelf-renderer[is-shorts]
// holding ytm-shorts-lockup-view-model items with /shorts/ links.
const shortsShelfSelector = '[is-shorts], ytd-reel-shelf-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, a[href^="/shorts/"], a[href*="youtube.com/shorts/"]';
// "Most relevant" is an ordinary ytd-rich-shelf-renderer with no structural
// marker, so it is matched by its exact title. Only add captured labels.
const mostRelevantLabels = ['most relevant'];
function normalizeLabel(text) { return (text || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase(); }
function shouldHide(section) {
  if (section.matches('[is-shorts]') || section.querySelector(shortsShelfSelector)) return true;
  return mostRelevantLabels.includes(normalizeLabel(section.querySelector('#title')?.textContent));
}
let scheduled = false;
function scheduleSubscriptionClean() { if (scheduled) return; scheduled = true; requestAnimationFrame(applySubscriptionClean); }
function applySubscriptionClean() {
  scheduled = false;
  if (!subscriptionCleanMode || !isSubscriptions()) {
    hiddenNodes.forEach((node) => { if (node?.getAttribute(hiddenAttribute) === '1') { node.style.display = ''; node.removeAttribute(hiddenAttribute); } });
    hiddenNodes = []; return;
  }
  document.querySelectorAll('ytd-rich-section-renderer,ytd-item-section-renderer,ytd-shelf-renderer,ytd-rich-shelf-renderer').forEach((section) => {
    if (section.getAttribute(hiddenAttribute) !== '1' && shouldHide(section)) { section.style.display = 'none'; section.setAttribute(hiddenAttribute, '1'); hiddenNodes.push(section); }
  });
}
new MutationObserver(() => { if (location.href !== lastUrl) { lastUrl = location.href; currentVideoId = getVideoId(lastUrl); wasAutoPaused = false; } applySettings(); scheduleSubscriptionClean(); scheduleAmazonCartHide(); }).observe(document.documentElement, { childList:true, subtree:true });
setInterval(() => { if (location.href !== lastUrl) { lastUrl = location.href; currentVideoId = getVideoId(lastUrl); } applySettings(); scheduleSubscriptionClean(); scheduleAmazonCartHide(); }, 1000);

// Cart sidebar roots only. Never list the cart page's own checkout box
// (#sc-buy-box): hiding it removes "Proceed to checkout".
const amazonCartSelectors = [
  // Docked cart sidebar on product, search and "Added to cart" pages. Seen on
  // .com, .co.uk, .de, .in and .co.jp (tests/fixtures/amazon, 2026-10).
  '#nav-flyout-ewc',
  // Older or regional sidebar variants, not seen in the 2026-10 captures.
  '#ewc-smart-wagon-desktop-sideSheet', '#nav-flyout-cart', '#attach-sidesheet', '#attach-sidesheet-container',
  '[data-feature-name="cart-sidebar"]', '[data-testid="cart-sidebar"]'
];
const amazonCartHiddenAttribute = 'data-browser-buddy-amazon-cart-hidden';
let amazonCartScheduled = false;
function isAmazonPage() { return /(^|\.)amazon\./.test(location.hostname); }
function amazonCartNodes() { return isAmazonPage() ? amazonCartSelectors.flatMap((selector) => [...document.querySelectorAll(selector)]) : []; }
function amazonCartSidebarFound() { return amazonCartNodes().length > 0; }
function scheduleAmazonCartHide() { if (amazonCartScheduled) return; amazonCartScheduled = true; requestAnimationFrame(applyAmazonCartHide); }
function applyAmazonCartHide() {
  amazonCartScheduled = false;
  amazonCartNodes().forEach((node) => {
    if (hideAmazonCart) { node.style.setProperty('display', 'none', 'important'); node.setAttribute(amazonCartHiddenAttribute, '1'); }
    else if (node.getAttribute(amazonCartHiddenAttribute) === '1') { node.style.removeProperty('display'); node.removeAttribute(amazonCartHiddenAttribute); }
  });
}
