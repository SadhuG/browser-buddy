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

chrome.storage.local.get(['playbackSpeed', 'tutorialMode', 'subscriptionCleanMode', 'hideAmazonCart'], (values) => {
  playbackSpeed = values.playbackSpeed || 1;
  tutorialMode = !!values.tutorialMode;
  subscriptionCleanMode = !!values.subscriptionCleanMode;
  hideAmazonCart = !!values.hideAmazonCart;
  applySettings(); scheduleSubscriptionClean(); scheduleAmazonCartHide();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.playbackSpeed) playbackSpeed = changes.playbackSpeed.newValue || 1;
  if (changes.tutorialMode) tutorialMode = !!changes.tutorialMode.newValue;
  if (changes.subscriptionCleanMode) subscriptionCleanMode = !!changes.subscriptionCleanMode.newValue;
  if (changes.hideAmazonCart) hideAmazonCart = !!changes.hideAmazonCart.newValue;
  applySettings(); scheduleSubscriptionClean(); scheduleAmazonCartHide();
});
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'FOCUS_LOST') pauseVideo();
  if (message.type === 'FOCUS_GAINED') resumeVideo();
  if (message.type === 'TUTORIAL_MODE_UPDATED') tutorialMode = !!message.enabled;
  if (message.type === 'SUBSCRIPTION_CLEAN_UPDATED') { subscriptionCleanMode = !!message.enabled; scheduleSubscriptionClean(); }
  if (message.type === 'AMAZON_CART_STATUS') return Promise.resolve({ found: amazonCartSidebarFound() });
});
document.addEventListener('visibilitychange', () => document.hidden ? pauseVideo() : resumeVideo());
window.addEventListener('blur', pauseVideo); window.addEventListener('focus', resumeVideo);

function getVideoId(value) { try { const url = new URL(value); return url.hostname.includes('youtube.com') && url.pathname === '/watch' ? url.searchParams.get('v') : null; } catch (_) { return null; } }
function isTutorialMode() { return !!currentVideoId && tutorialMode; }
function videoElement() { const video = document.querySelector('video'); if (video !== lastVideo) { lastVideo = video; wasAutoPaused = false; } return video; }
function pauseVideo() { if (!isTutorialMode()) return; const video = videoElement(); if (video && !video.paused) { video.pause(); wasAutoPaused = true; } }
function resumeVideo() { if (!isTutorialMode() || !wasAutoPaused) return; const video = videoElement(); if (video?.paused) video.play().catch(() => {}); wasAutoPaused = false; }
function applySettings() { const video = videoElement(); if (video && Math.abs(video.playbackRate - playbackSpeed) > .01) video.playbackRate = playbackSpeed; }

function isSubscriptions() { try { return new URL(location.href).pathname === '/feed/subscriptions'; } catch (_) { return false; } }
function shouldHide(section) {
  if (section.querySelector('a[href^="/shorts/"], a[href*="youtube.com/shorts/"]')) return true;
  const title = (section.querySelector('#title, h2, yt-formatted-string')?.textContent || '').trim().toLowerCase();
  return title === 'shorts' || title.includes('most relevant');
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

const amazonCartSelectors = [
  '#nav-flyout-ewc', '#ewc-smart-wagon-desktop-sideSheet',
  '#nav-flyout-cart', '#attach-sidesheet', '#attach-sidesheet-container',
  '#sc-subtotal-right', '#sc-buy-box', '[data-feature-name="cart-sidebar"]', '[data-testid="cart-sidebar"]'
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
