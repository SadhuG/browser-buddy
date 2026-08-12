const $ = (selector) => document.querySelector(selector);
const state = { scopeAll: false, tabs: [], groups: [], undoTabs: [], undoTimer: null };

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindNavigation();
  bindYoutubeControls();
  bindTabControls();
  await loadYoutubeState();
}

function bindNavigation() {
  document.querySelectorAll('.app-tab').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.app-tab, .panel').forEach((el) => el.classList.remove('is-active'));
    button.classList.add('is-active');
    $(`#${button.dataset.panel}`).classList.add('is-active');
    if (button.dataset.panel === 'tabs') showTabsHome();
  }));
}

function bindYoutubeControls() {
  const slider = $('#speedSlider');
  slider.addEventListener('input', () => updateSpeed(Number(slider.value)));
  $('#btnMinus').addEventListener('click', () => updateSpeed(Number(slider.value) - .05));
  $('#btnPlus').addEventListener('click', () => updateSpeed(Number(slider.value) + .05));
  document.querySelectorAll('.presets button').forEach((button) => button.addEventListener('click', () => updateSpeed(Number(button.dataset.speed))));
  $('#tutorialMode').addEventListener('change', saveTutorialPreference);
  $('#subscriptionCleanMode').addEventListener('change', saveSubscriptionPreference);
}

async function loadYoutubeState() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tutorial = $('#tutorialMode');
  const clean = $('#subscriptionCleanMode');
  tutorial.dataset.tabId = activeTab?.id || '';
  clean.dataset.tabId = activeTab?.id || '';
  const stored = await chrome.storage.local.get(['playbackSpeed', 'tutorialMode', 'subscriptionCleanMode']);
  updateSpeedUI(stored.playbackSpeed || 1);
  tutorial.checked = !!stored.tutorialMode;
  clean.checked = !!stored.subscriptionCleanMode;
}

function updateSpeed(speed) {
  const value = Math.round(Math.max(.25, Math.min(4, speed)) * 100) / 100;
  updateSpeedUI(value);
  chrome.storage.local.set({ playbackSpeed: value });
}
function updateSpeedUI(speed) { $('#speedSlider').value = speed; $('#speedValue').textContent = speed.toFixed(2); }
async function saveTutorialPreference(event) {
  await chrome.storage.local.set({ tutorialMode: event.target.checked });
}
async function saveSubscriptionPreference(event) {
  await chrome.storage.local.set({ subscriptionCleanMode: event.target.checked });
}

function bindTabControls() {
  $('#launchDuplicateTool').addEventListener('click', openDuplicateTool);
  $('#backToTools').addEventListener('click', showTabsHome);
  $('#allWindowsToggle').addEventListener('change', async (event) => { state.scopeAll = event.target.checked; $('.scope-switch').classList.toggle('is-all', state.scopeAll); await refreshTabs(); });
  $('#tabSearch').addEventListener('input', renderGroups);
  $('#removeAll').addEventListener('click', showRemoveConfirmation);
  $('#cancelRemove').addEventListener('click', hideRemoveConfirmation);
  $('#confirmRemove').addEventListener('click', removeAllDuplicates);
  $('#undoRemove').addEventListener('click', undoRemoval);
}

async function openDuplicateTool() {
  $('#tabsHome').hidden = true;
  $('#duplicateTool').hidden = false;
  await refreshTabs();
}
function showTabsHome() {
  $('#tabsHome').hidden = false;
  $('#duplicateTool').hidden = true;
  hideRemoveConfirmation();
}

async function refreshTabs() {
  try {
    state.tabs = await chrome.tabs.query(state.scopeAll ? {} : { currentWindow: true });
    state.groups = buildDuplicateGroups(state.tabs);
    renderGroups();
  } catch (_) { $('#tabSummary').textContent = 'Unable to read browser tabs.'; }
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'].forEach((name) => url.searchParams.delete(name));
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch (_) { return value || ''; }
}
function variantKey(value) {
  try { const url = new URL(value); return `${url.origin}${url.pathname.replace(/\/+$/, '')}`; } catch (_) { return value || ''; }
}
function buildDuplicateGroups(tabs) {
  const buckets = new Map();
  tabs.filter((tab) => !tab.pinned && tab.url).forEach((tab) => {
    const key = normalizeUrl(tab.url);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(tab);
  });
  return [...buckets.entries()].filter(([, tabsInGroup]) => tabsInGroup.length > 1).map(([key, tabsInGroup]) => ({ key, tabs: tabsInGroup, keepId: chooseKeptTab(tabsInGroup) }));
}
function chooseKeptTab(tabs) { return (tabs.find((tab) => tab.active) || [...tabs].sort((a, b) => a.index - b.index)[0]).id; }
function uniqueRemoveIds(groups) { return groups.flatMap((group) => group.tabs.filter((tab) => tab.id !== group.keepId).map((tab) => tab.id)); }

function renderGroups() {
  const query = $('#tabSearch').value.trim().toLowerCase();
  const groups = state.groups.filter((group) => group.tabs.some((tab) => `${tab.title} ${tab.url}`.toLowerCase().includes(query)));
  const closeCount = uniqueRemoveIds(groups).length;
  $('#duplicateCount').textContent = closeCount;
  $('#tabSummary').textContent = closeCount ? `${closeCount} extra tab${closeCount === 1 ? '' : 's'} across ${groups.length} duplicate group${groups.length === 1 ? '' : 's'}. Pinned tabs are protected.` : 'No removable duplicates in this scope.';
  $('#removeAll').disabled = !closeCount;
  $('#duplicateGroups').replaceChildren(...groups.map(groupCard));
  $('#emptyState').hidden = !!closeCount;
  renderVariantWarnings();
}

function groupCard(group) {
  const card = document.createElement('article'); card.className = 'duplicate-card';
  const title = document.createElement('div'); title.className = 'duplicate-card-title';
  title.innerHTML = `<span>${group.tabs.length} matching tabs</span><small>Keeping ${group.tabs.find((tab) => tab.id === group.keepId)?.active ? 'active' : 'earliest'} tab</small>`;
  card.append(title);
  group.tabs.forEach((tab) => {
    const row = document.createElement('div'); row.className = `tab-row${tab.id === group.keepId ? ' kept' : ''}`;
    const tabButton = document.createElement('button'); tabButton.className = 'tab-link'; tabButton.type = 'button'; tabButton.title = tab.url;
    tabButton.innerHTML = `<span class="favicon">${tab.favIconUrl ? `<img src="${tab.favIconUrl}" alt="">` : '◻'}</span><span class="tab-copy"><b>${escapeHtml(tab.title || 'Untitled tab')}</b><small>${escapeHtml(shortUrl(tab.url))}</small></span>${tab.id === group.keepId ? '<em>Keep</em>' : ''}`;
    tabButton.addEventListener('click', () => chrome.tabs.update(tab.id, { active: true }).then(() => chrome.windows.update(tab.windowId, { focused: true }))); row.append(tabButton);
    if (tab.id !== group.keepId) { const close = document.createElement('button'); close.className = 'close-tab'; close.type = 'button'; close.setAttribute('aria-label', `Close ${tab.title || 'tab'}`); close.textContent = '×'; close.addEventListener('click', () => removeTabs([tab])); row.append(close); }
    card.append(row);
  });
  return card;
}
function renderVariantWarnings() {
  const duplicateKeys = new Set(state.groups.map((group) => group.key));
  const variants = new Map();
  state.tabs.filter((tab) => !tab.pinned && tab.url && !duplicateKeys.has(normalizeUrl(tab.url))).forEach((tab) => { const key = variantKey(tab.url); if (!variants.has(key)) variants.set(key, []); variants.get(key).push(tab); });
  const near = [...variants.values()].filter((tabs) => new Set(tabs.map((tab) => normalizeUrl(tab.url))).size > 1);
  const holder = $('#variantWarnings'); holder.replaceChildren(); holder.hidden = !near.length;
  near.slice(0, 3).forEach((tabs) => { const note = document.createElement('p'); note.textContent = `${tabs.length} URL variants are kept separate because their query parameters differ.`; holder.append(note); });
}
function shortUrl(value) { try { const url = new URL(value); return `${url.hostname}${url.pathname}${url.search}`; } catch (_) { return value; } }
function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }

function showRemoveConfirmation() { const ids = uniqueRemoveIds(state.groups); if (!ids.length) return; $('#confirmText').textContent = `This will close ${ids.length} duplicate tab${ids.length === 1 ? '' : 's'} and keep one tab from each group. Pinned tabs are never closed.`; $('#confirmDialog').hidden = false; }
function hideRemoveConfirmation() { $('#confirmDialog').hidden = true; }
async function removeAllDuplicates() { hideRemoveConfirmation(); const ids = uniqueRemoveIds(state.groups); const tabs = state.groups.flatMap((group) => group.tabs.filter((tab) => ids.includes(tab.id))); await removeTabs(tabs); }
async function removeTabs(tabs) {
  const valid = tabs.filter((tab) => tab?.id && !tab.pinned); if (!valid.length) return;
  state.undoTabs = valid.map((tab) => ({ url: tab.url, windowId: tab.windowId, index: tab.index }));
  await chrome.tabs.remove(valid.map((tab) => tab.id));
  await refreshTabs(); showToast(`${valid.length} duplicate tab${valid.length === 1 ? '' : 's'} closed.`, true);
}
function showToast(message, canUndo) { clearTimeout(state.undoTimer); $('#toastText').textContent = message; $('#undoRemove').hidden = !canUndo; $('#toast').hidden = false; state.undoTimer = setTimeout(() => { $('#toast').hidden = true; state.undoTabs = []; }, 8000); }
async function undoRemoval() { const grouped = new Map(); state.undoTabs.forEach((tab) => { if (!grouped.has(tab.windowId)) grouped.set(tab.windowId, []); grouped.get(tab.windowId).push(tab); }); for (const [windowId, tabs] of grouped) { for (const tab of tabs.sort((a, b) => a.index - b.index)) await chrome.tabs.create({ windowId, url: tab.url, index: tab.index, active: false }); } state.undoTabs = []; $('#toast').hidden = true; await refreshTabs(); }

function getYoutubeVideoId(value) { try { const url = new URL(value); return url.hostname.includes('youtube.com') && url.pathname === '/watch' ? url.searchParams.get('v') : null; } catch (_) { return null; } }
function isSubscriptionsUrl(value) { try { const url = new URL(value); return url.hostname.includes('youtube.com') && url.pathname === '/feed/subscriptions'; } catch (_) { return false; } }
