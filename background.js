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
