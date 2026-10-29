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
    settings = BrowserBuddy.settings.normalizeSettings(values);
    ({ playbackSpeed, tutorialMode, subscriptionCleanMode, hideAmazonCart } = settings);
    sendSettingsToPage();
    applySettings(); scheduleSubscriptionClean(); scheduleAmazonCartHide();
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
});

// Relay to page-bridge.js, which runs in the page's world and calls YouTube's player.
const isYoutubePage = /(^|\.)youtube\.com$/.test(location.hostname);
const bridgeMessage = (type, extra = {}) => window.postMessage({ source: 'browser-buddy', to: 'page', type, ...extra }, location.origin);
let bridgeStatus = null;
function sendSettingsToPage() { if (isYoutubePage) bridgeMessage('settings', { settings }); }
if (isYoutubePage) {
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window || !data || data.source !== 'browser-buddy' || data.to !== 'extension') return;
    if (data.type === 'hello') sendSettingsToPage();
    if (data.type === 'status') bridgeStatus = data.status;
  });
}
function tabStatus() {
  if (!isYoutubePage) return null;
  const status = bridgeStatus || { videoId: null, surface: null, touched: {}, auto: {}, unavailable: {} };
  return { ...status, touched: { ...status.touched } };
}
function clearTouch(setting) { if (isYoutubePage) bridgeMessage('clear-touch', { setting }); }
document.addEventListener('visibilitychange', () => document.hidden ? pauseVideo() : resumeVideo());
window.addEventListener('blur', pauseVideo); window.addEventListener('focus', resumeVideo);

function getVideoId(value) { try { const url = new URL(value); return url.hostname.includes('youtube.com') && url.pathname === '/watch' ? url.searchParams.get('v') : null; } catch (_) { return null; } }
function isTutorialMode() { return !!currentVideoId && tutorialMode; }
function videoElement() { const video = document.querySelector('video'); if (video !== lastVideo) { lastVideo = video; wasAutoPaused = false; } return video; }
function pauseVideo() { if (!isTutorialMode()) return; const video = videoElement(); if (video && !video.paused) { video.pause(); wasAutoPaused = true; } }
function resumeVideo() { if (!isTutorialMode() || !wasAutoPaused) return; const video = videoElement(); if (video?.paused) video.play().catch(() => {}); wasAutoPaused = false; }
function applySettings() { const video = videoElement(); if (video && Math.abs(video.playbackRate - playbackSpeed) > .01) video.playbackRate = playbackSpeed; }

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
