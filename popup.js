const $ = (selector) => document.querySelector(selector);
const state = { scopeAll: false, tabs: [], groups: [], undoTabs: [], undoTimer: null, justClosed: false };

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindNavigation();
  bindYoutubeControls();
  bindTabControls();
  await Promise.all([loadYoutubeState(), loadAmazonCartState()]);
}

function bindNavigation() {
  document.querySelectorAll('.app-tab').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.app-tab, .view').forEach((el) => el.classList.remove('is-active'));
    document.querySelectorAll('.app-tab').forEach((tab) => tab.setAttribute('aria-pressed', String(tab === button)));
    button.classList.add('is-active');
    $(`#${button.dataset.panel}`).classList.add('is-active');
    showTabsHome();
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
function updateSpeedUI(speed) {
  $('#speedSlider').value = speed;
  $('#speedValue').textContent = speed.toFixed(2);
  $('.speed-bar').style.setProperty('--pct', (speed - .25) / 3.75);
  const delta = Math.round((speed - 1) * 100);
  const chip = $('#speedDelta');
  chip.textContent = delta ? `${delta > 0 ? '+' : '−'}${Math.abs(delta)}%` : 'normal';
  chip.classList.toggle('is-hot', !!delta);
  document.querySelectorAll('.presets button').forEach((button) => {
    const active = Number(button.dataset.speed) === speed;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
async function saveTutorialPreference(event) {
  await chrome.storage.local.set({ tutorialMode: event.target.checked });
}
async function saveSubscriptionPreference(event) {
  await chrome.storage.local.set({ subscriptionCleanMode: event.target.checked });
}

function bindAmazonCartControl() {
  $('#hideAmazonCart').addEventListener('change', saveAmazonCartPreference);
}
async function loadAmazonCartState() {
  bindAmazonCartControl();
  const { hideAmazonCart = false } = await chrome.storage.local.get('hideAmazonCart');
  $('#hideAmazonCart').checked = hideAmazonCart;
  if (hideAmazonCart) await updateAmazonCartWarning();
}
async function saveAmazonCartPreference(event) {
  await chrome.storage.local.set({ hideAmazonCart: event.target.checked });
  await updateAmazonCartWarning();
}
async function updateAmazonCartWarning() {
  const warning = $('#amazonCartWarning');
  warning.hidden = true;
  if (!$('#hideAmazonCart').checked) return;
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || !isAmazonUrl(activeTab.url)) return;
  try {
    const result = await chrome.tabs.sendMessage(activeTab.id, { type: 'AMAZON_CART_STATUS' });
    if (!result?.found) showAmazonCartWarning('No cart sidebar on this page.', 'It will be hidden on pages that show one, like search and product pages.');
  } catch (_) { showAmazonCartWarning('Can’t check this Amazon page.', 'Reload the tab, then open Browser Buddy again.'); }
}
function showAmazonCartWarning(title, text) {
  $('#amazonCartWarningTitle').textContent = title;
  $('#amazonCartWarningText').textContent = text;
  $('#amazonCartWarning').hidden = false;
}
function isAmazonUrl(value) { try { return /(^|\.)amazon\.(com|ca|com\.mx|com\.br|co\.uk|de|fr|es|it|nl|se|pl|com\.tr|ae|sa|eg|in|sg|com\.au|co\.jp|com\.be|ie|co\.za)$/.test(new URL(value).hostname); } catch (_) { return false; } }

function bindTabControls() {
  $('#launchDuplicateTool').addEventListener('click', openDuplicateTool);
  $('#backToTools').addEventListener('click', showTabsHome);
  $('#scopeWindow').addEventListener('click', () => setScope(false));
  $('#scopeAll').addEventListener('click', () => setScope(true));
  $('#searchAllWindows').addEventListener('click', () => setScope(true));
  $('#tabSearch').addEventListener('input', renderGroups);
  $('#removeAll').addEventListener('click', showRemoveConfirmation);
  $('#cancelRemove').addEventListener('click', hideRemoveConfirmation);
  $('#confirmRemove').addEventListener('click', removeAllDuplicates);
  $('#undoRemove').addEventListener('click', undoRemoval);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#confirmDialog').hidden) { event.preventDefault(); hideRemoveConfirmation(); } });
}

async function openDuplicateTool() {
  $('#tabsHome').hidden = true;
  $('#duplicateTool').hidden = false;
  document.body.classList.add('is-tool-open');
  state.justClosed = false;
  await refreshTabs();
}
function showTabsHome() {
  $('#tabsHome').hidden = false;
  $('#duplicateTool').hidden = true;
  document.body.classList.remove('is-tool-open');
  hideRemoveConfirmation();
}
async function setScope(all) {
  if (state.scopeAll === all) return;
  state.scopeAll = all;
  state.justClosed = false;
  [['#scopeWindow', !all], ['#scopeAll', all]].forEach(([selector, active]) => { $(selector).classList.toggle('is-active', active); $(selector).setAttribute('aria-pressed', String(active)); });
  await refreshTabs();
}

async function refreshTabs() {
  try {
    state.tabs = await chrome.tabs.query(state.scopeAll ? {} : { currentWindow: true });
    state.groups = buildDuplicateGroups(state.tabs);
    renderGroups();
  } catch (_) { $('#tabSummary').textContent = 'Unable to read browser tabs.'; }
}

function renderGroups() {
  const query = $('#tabSearch').value.trim().toLowerCase();
  const groups = state.groups.filter((group) => group.tabs.some((tab) => `${tab.title} ${tab.url}`.toLowerCase().includes(query)));
  const closeCount = uniqueRemoveIds(state.groups).length;
  const chip = $('#duplicateCount');
  chip.textContent = `${closeCount} to close`;
  chip.classList.toggle('is-hot', !!closeCount);
  $('#tabSummary').textContent = `${closeCount} extra tab${plural(closeCount)} in ${state.groups.length} group${plural(state.groups.length)}. Pinned tabs are never closed.`;
  $('#tabSummary').hidden = !closeCount;
  $('#removeAll').disabled = !closeCount;
  $('#removeAll').textContent = closeCount ? `Close ${closeCount} duplicate${plural(closeCount)}` : 'Close duplicates';
  $('#duplicateGroups').replaceChildren(...groups.map(groupCard));
  renderEmptyState(closeCount, groups.length, query);
  renderVariantWarnings();
}
function renderEmptyState(closeCount, visibleGroups, query) {
  const scope = state.scopeAll ? 'any window' : 'this window';
  let title = '';
  let text = '';
  if (closeCount && !visibleGroups) { title = 'No matches'; text = `No duplicate tabs match “${query}”.`; }
  else if (!closeCount && state.justClosed) { title = 'No duplicates left'; text = state.scopeAll ? 'Every tab is open once.' : 'Every tab in this window is open once.'; }
  else if (!closeCount) { title = `No duplicates in ${scope}`; text = `${state.scopeAll ? 'Every tab' : 'Every tab here'} is open once.\nPinned tabs are never counted.`; }
  $('#emptyState').hidden = !title;
  $('#emptyTitle').textContent = title;
  $('#emptyText').textContent = text;
  $('#searchAllWindows').hidden = !(title && !closeCount && !state.justClosed && !state.scopeAll);
}
function plural(count) { return count === 1 ? '' : 's'; }

function groupCard(group) {
  const card = element('article', 'group');
  const keptActive = group.tabs.find((tab) => tab.id === group.keepId)?.active;
  const head = element('div', 'group-head');
  head.append(element('b', '', `${group.tabs.length} matching tabs`), element('small', '', `keeping the ${keptActive ? 'active' : 'earliest'} tab`));
  card.append(head);
  group.tabs.forEach((tab) => {
    const kept = tab.id === group.keepId;
    const row = element('div', `tab-row${kept ? ' is-kept' : ''}`);
    const tabButton = element('button', 'tab-link'); tabButton.type = 'button'; tabButton.title = tab.url;
    const copy = element('span', 'tab-copy');
    copy.append(element('span', 'tab-title', tab.title || 'Untitled tab'), element('span', 'tab-url', shortUrl(tab.url)));
    tabButton.append(favicon(tab), copy);
    tabButton.addEventListener('click', () => chrome.tabs.update(tab.id, { active: true }).then(() => chrome.windows.update(tab.windowId, { focused: true })));
    row.append(tabButton);
    if (kept) row.append(element('span', 'keep-badge', 'keep'));
    else { const close = element('button', 'close-tab', '×'); close.type = 'button'; close.setAttribute('aria-label', `Close ${tab.title || 'tab'}`); close.addEventListener('click', () => removeTabs([tab])); row.append(close); }
    card.append(row);
  });
  return card;
}
function favicon(tab) {
  const holder = element('span', 'favicon');
  const letter = () => { try { return new URL(tab.url).hostname.replace(/^www\./, '')[0]?.toUpperCase() || '·'; } catch (_) { return '·'; } };
  if (tab.favIconUrl && /^https?:|^data:image\//.test(tab.favIconUrl)) {
    const img = document.createElement('img'); img.alt = ''; img.src = tab.favIconUrl;
    img.addEventListener('error', () => holder.replaceChildren(letter()));
    holder.append(img);
  } else holder.textContent = letter();
  return holder;
}
function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function renderVariantWarnings() {
  const duplicateKeys = new Set(state.groups.map((group) => group.key));
  const variants = new Map();
  state.tabs.filter((tab) => !tab.pinned && tab.url && !duplicateKeys.has(normalizeUrl(tab.url))).forEach((tab) => { const key = variantKey(tab.url); if (!variants.has(key)) variants.set(key, []); variants.get(key).push(tab); });
  const count = [...variants.values()].filter((tabs) => new Set(tabs.map((tab) => normalizeUrl(tab.url))).size > 1).reduce((sum, tabs) => sum + tabs.length, 0);
  $('#variantWarnings').hidden = !count;
  $('#variantWarningText').textContent = `${count} URL variants stay open: their query parameters differ.`;
}
function shortUrl(value) { try { const url = new URL(value); return `${url.hostname}${url.pathname}${url.search}`; } catch (_) { return value; } }

function showRemoveConfirmation() { const ids = uniqueRemoveIds(state.groups); if (!ids.length) return; $('#confirmTitle').textContent = `Close ${ids.length} duplicate tab${plural(ids.length)}?`; $('#confirmDialog').hidden = false; $('#confirmRemove').focus(); }
function hideRemoveConfirmation() { $('#confirmDialog').hidden = true; }
async function removeAllDuplicates() { hideRemoveConfirmation(); const ids = uniqueRemoveIds(state.groups); const tabs = state.groups.flatMap((group) => group.tabs.filter((tab) => ids.includes(tab.id))); await removeTabs(tabs); }
async function removeTabs(tabs) {
  const valid = tabs.filter((tab) => tab?.id && !tab.pinned); if (!valid.length) return;
  state.undoTabs = valid.map((tab) => ({ url: tab.url, windowId: tab.windowId, index: tab.index }));
  await chrome.tabs.remove(valid.map((tab) => tab.id));
  state.justClosed = true;
  await refreshTabs(); showToast(`Closed ${valid.length} duplicate tab${plural(valid.length)}.`, true);
}
function showToast(message, canUndo) { clearTimeout(state.undoTimer); $('#toastText').textContent = message; $('#undoRemove').hidden = !canUndo; $('#toast').hidden = false; state.undoTimer = setTimeout(() => { $('#toast').hidden = true; state.undoTabs = []; }, 8000); }
async function undoRemoval() { const grouped = new Map(); state.undoTabs.forEach((tab) => { if (!grouped.has(tab.windowId)) grouped.set(tab.windowId, []); grouped.get(tab.windowId).push(tab); }); for (const [windowId, tabs] of grouped) { for (const tab of tabs.sort((a, b) => a.index - b.index)) await chrome.tabs.create({ windowId, url: tab.url, index: tab.index, active: false }); } state.undoTabs = []; state.justClosed = false; $('#toast').hidden = true; await refreshTabs(); }

function getYoutubeVideoId(value) { try { const url = new URL(value); return url.hostname.includes('youtube.com') && url.pathname === '/watch' ? url.searchParams.get('v') : null; } catch (_) { return null; } }
function isSubscriptionsUrl(value) { try { const url = new URL(value); return url.hostname.includes('youtube.com') && url.pathname === '/feed/subscriptions'; } catch (_) { return false; } }
