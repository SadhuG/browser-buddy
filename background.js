importScripts('lib/one-video.js');
let lastActiveYoutubeTabId = null;
function isYoutube(url) { try { return typeof url === 'string' && /(^|\.)youtube\.com/.test(new URL(url).hostname); } catch (_) { return false; } }

async function notify(tabId, type) {
  if (!tabId) return;
  try { await chrome.tabs.sendMessage(tabId, { type }); } catch (_) { /* no injected script */ }
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const previous = lastActiveYoutubeTabId;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (previous && previous !== tabId) await notify(previous, 'FOCUS_LOST');
    if (isYoutube(tab.url)) { lastActiveYoutubeTabId = tabId; await notify(tabId, 'FOCUS_GAINED'); }
  } catch (_) { /* tab disappeared */ }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return notify(lastActiveYoutubeTabId, 'FOCUS_LOST');
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab && isYoutube(tab.url)) { lastActiveYoutubeTabId = tab.id; await notify(tab.id, 'FOCUS_GAINED'); }
  } catch (_) { /* window disappeared */ }
});

// One video at a time (lib/one-video.js): YouTube tabs report audible playback; this keeps the
// shared state in session storage (it outlives the worker going idle) and pauses/resumes tabs.
// Events run one at a time so state reads and writes never interleave.
const oneVideo = globalThis.BrowserBuddy.oneVideo;
let oneVideoQueue = Promise.resolve();
const enqueueOneVideo = (event) => { oneVideoQueue = oneVideoQueue.then(() => handleOneVideo(event)).catch(() => {}); return oneVideoQueue; };
const clearOneVideo = () => chrome.storage.session.remove('oneVideo');

async function handleOneVideo(event) {
  const { oneVideoAtATime, oneVideoResume, tutorialMode } = await chrome.storage.local.get(['oneVideoAtATime', 'oneVideoResume', 'tutorialMode']);
  // Tutorial mode wins: while it's on, this feature does nothing.
  if (!oneVideoAtATime || tutorialMode) return clearOneVideo();
  const { oneVideo: saved } = await chrome.storage.session.get('oneVideo');
  const { state, actions } = oneVideo.reduce(saved, event, oneVideoResume);
  await chrome.storage.session.set({ oneVideo: state });
  for (const action of actions) {
    if (action.type === 'pause') {
      try { await chrome.tabs.sendMessage(action.tabId, { type: 'ONE_VIDEO_PAUSE' }); } catch (_) { /* tab gone */ }
    } else {
      let resumed = false;
      try { resumed = (await chrome.tabs.sendMessage(action.tabId, { type: 'ONE_VIDEO_RESUME' })) === true; } catch (_) { /* tab gone */ }
      // It can't play any more (closed, moved off the video): give the next waiting tab its turn.
      if (!resumed) await handleOneVideo({ type: 'closed', tabId: action.tabId });
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'ONE_VIDEO_EVENT' || !sender.tab?.id) return;
  if (['started', 'paused', 'finished'].includes(message.event)) enqueueOneVideo({ type: message.event, tabId: sender.tab.id });
});
chrome.tabs.onRemoved.addListener((tabId) => enqueueOneVideo({ type: 'closed', tabId }));
// Leaving YouTube in a tab ends its video just like closing the tab.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => { if (changeInfo.url && !isYoutube(changeInfo.url)) enqueueOneVideo({ type: 'closed', tabId }); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.oneVideoAtATime?.newValue === false || changes.tutorialMode?.newValue === true) oneVideoQueue = oneVideoQueue.then(clearOneVideo).catch(() => {});
});
