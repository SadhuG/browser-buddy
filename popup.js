const $ = (selector) => document.querySelector(selector);
const BB = globalThis.BrowserBuddy;
const state = { settings: BB.settings.normalizeSettings({}), scopeAll: false, tabs: [], groups: [], undoTabs: [], undoTimer: null, justClosed: false, closedRows: [] };
const UNDO_MS = 8000;
const FOLD_MS = 180;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindNavigation();
  bindYoutubeControls();
  bindTabControls();
  await Promise.all([loadYoutubeState(), loadVideoSettings(), loadAmazonCartState()]);
}

function bindNavigation() {
  document.querySelectorAll('.app-tab').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.app-tab, .view').forEach((el) => el.classList.remove('is-active'));
    document.querySelectorAll('.app-tab').forEach((tab) => tab.setAttribute('aria-pressed', String(tab === button)));
    button.classList.add('is-active');
    $(`#${button.dataset.panel}`).classList.add('is-active');
    showTabsHome();
    showYoutubeScreen('youtubeHome');
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
  [['#qualityRow', 'qualityScreen'], ['#audioRow', 'audioScreen'], ['#captionsRow', 'captionsScreen']].forEach(([row, screen]) =>
    $(row).addEventListener('click', () => showYoutubeScreen(screen)));
  document.querySelectorAll('.back-to-youtube').forEach((link) => link.addEventListener('click', () => showYoutubeScreen('youtubeHome')));
  buildQualityOptions();
  bindCaptionControls();
  document.querySelectorAll('.back-to-captions').forEach((link) => link.addEventListener('click', () => showYoutubeScreen('captionsScreen')));
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

// Resolution, audio and captions. Every control writes chrome.storage.local at once, and
// everything shown comes from normalizeSettings so the popup matches what the page applies.
async function loadVideoSettings() {
  state.settings = BB.settings.normalizeSettings(await chrome.storage.local.get(BB.settings.SETTING_KEYS));
  renderVideoSettings();
}
async function saveSettings(patch) {
  state.settings = BB.settings.normalizeSettings({ ...state.settings, ...patch });
  renderVideoSettings();
  await chrome.storage.local.set(patch);
}
function renderVideoSettings() {
  renderYoutubeSummary(state.settings);
  renderQualityScreen(state.settings);
  renderCaptionsScreen(state.settings);
}
const CAPTION_MODE_TEXT = { youtube: 'YouTube decides', on: 'always on', off: 'always off' };
const languageNames = new Intl.DisplayNames(undefined, { type: 'language' });
function languageName(code) { try { return languageNames.of(code) || code; } catch (_) { return code; } }
function qualityText(quality) { return quality === 'auto' ? 'Auto' : quality === 'highest' ? 'Highest' : `${quality}p`; }
function presetName(settings) {
  if (settings.captionPresetId === null) return 'Custom';
  return BB.presets.listPresets(settings).find((preset) => preset.id === settings.captionPresetId)?.name || 'Custom';
}
function renderYoutubeSummary(settings) {
  $('#qualityRow .row-value').textContent = qualityText(settings.quality);
  $('#audioRow .row-value').textContent = settings.audioTrackEnabled ? settings.myLanguages.map(languageName).join(' → ') : 'Off';
  $('#captionsRow .row-value').textContent = `${settings.captionStyleEnabled ? presetName(settings) : 'Style off'} · ${CAPTION_MODE_TEXT[settings.captionsMode]}`;
}
const QUALITY_OPTIONS = [['auto', 'Auto', 'YouTube decides'], ['highest', 'Highest available', ''],
  ...['2160', '1440', '1080', '720', '480', '360', '240', '144'].map((h) => [h, `${h}p`, h === '2160' ? '4K' : ''])];
function buildQualityOptions() {
  $('#qualityOptions').replaceChildren(...QUALITY_OPTIONS.map(([value, label, hint]) => {
    const choice = element('label', 'choice');
    const input = element('input'); input.type = 'radio'; input.name = 'quality'; input.value = value;
    input.addEventListener('change', () => saveSettings({ quality: value }));
    choice.append(input, element('span', 'choice-label', label));
    if (hint) choice.append(element('span', 'choice-hint', hint));
    return choice;
  }));
}
function renderQualityScreen(settings) {
  $('#qualityChip').textContent = qualityText(settings.quality);
  document.querySelectorAll('input[name=quality]').forEach((input) => { input.checked = input.value === settings.quality; });
}

// Captions: mode, style switch, preview, presets and the style values YouTube offers. Any control
// change makes the style Custom (captionPresetId null); presets and Reset copy a whole style.
const NUMERIC_STYLE_FIELDS = ['fontFamily', 'textOpacity', 'backgroundOpacity', 'windowOpacity', 'charEdgeStyle', 'sizePercent'];
function setStyleField(field, raw) {
  const value = NUMERIC_STYLE_FIELDS.includes(field) ? Number(raw) : raw;
  saveSettings({ captionStyle: { ...state.settings.captionStyle, [field]: value }, captionPresetId: null });
}
function pickPreset(id) { saveSettings(BB.presets.applyPreset(state.settings, id)); }
function bindCaptionControls() {
  const CS = BB.captionStyle;
  document.querySelectorAll('#captionsMode button').forEach((button) => button.addEventListener('click', () => saveSettings({ captionsMode: button.dataset.mode })));
  $('#captionStyleEnabled').addEventListener('change', (event) => saveSettings({ captionStyleEnabled: event.target.checked }));
  $('#resetCaptionStyle').addEventListener('click', () => pickPreset('classic'));
  $('#managePresets').addEventListener('click', () => showYoutubeScreen('presetsScreen'));
  const options = (select, list, field) => {
    select.replaceChildren(...list.map((item) => { const option = element('option', '', item.label); option.value = item.value; return option; }));
    select.addEventListener('change', () => setStyleField(field, select.value));
  };
  options($('#capFont'), CS.FONT_FAMILIES, 'fontFamily');
  options($('#capEdge'), CS.EDGE_STYLES, 'charEdgeStyle');
  ['#capColor', '#capBackground', '#capWindowColor'].forEach((id) => $(id).replaceChildren(...CS.COLORS.map((color) => {
    const swatch = element('button', 'swatch'); swatch.type = 'button'; swatch.dataset.value = color.value;
    swatch.setAttribute('aria-label', color.label); swatch.title = color.label;
    const chip = element('span'); chip.style.background = color.value; swatch.append(chip);
    return swatch;
  })));
  const segments = (id, list) => $(id).replaceChildren(...list.map((item) => {
    const button = element('button', '', item.label); button.type = 'button'; button.dataset.value = item.value; return button;
  }));
  segments('#capTextOpacity', CS.TEXT_OPACITIES);
  segments('#capBackgroundOpacity', CS.FILL_OPACITIES);
  segments('#capWindowOpacity', CS.FILL_OPACITIES);
  segments('#capSize', CS.SIZE_STEPS.map((step) => ({ value: step.percent, label: `${step.percent}%` })));
  document.querySelectorAll('#captionStyleControls [data-field]').forEach((group) => group.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (button) setStyleField(group.dataset.field, button.dataset.value);
  }));
}
function applyPreviewCss(node, style) {
  const css = BB.captionStyle.previewCss(style);
  Object.assign(node.style, { color: css.color, backgroundColor: css.backgroundColor, fontFamily: css.fontFamily, fontVariant: css.fontVariant, fontSize: css.fontSize, textShadow: css.textShadow });
  return css;
}
function presetTile(preset, active) {
  const tile = element('button', 'preset-tile'); tile.type = 'button'; tile.dataset.preset = preset.id;
  tile.setAttribute('aria-pressed', String(active));
  const sample = element('span', 'preset-sample'); sample.setAttribute('aria-hidden', 'true');
  const text = element('span', '', 'Aa'); applyPreviewCss(text, preset.style); sample.append(text);
  const meta = element('span', 'preset-meta'); meta.append(element('b', '', preset.name));
  if (active) meta.append(element('small', '', 'active'));
  tile.append(sample, meta);
  tile.addEventListener('click', () => pickPreset(preset.id));
  return tile;
}
function renderCaptionsScreen(settings) {
  const style = settings.captionStyle;
  $('#captionsChip').textContent = settings.captionStyleEnabled ? presetName(settings) : 'Style off';
  document.querySelectorAll('#captionsMode button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === settings.captionsMode)));
  $('#captionStyleEnabled').checked = settings.captionStyleEnabled;
  $('#captionStyleControls').classList.toggle('is-off', !settings.captionStyleEnabled);
  $('#captionWindow').style.backgroundColor = applyPreviewCss($('#captionPreview'), style).windowColor;
  $('#presetPicker').replaceChildren(...BB.presets.listPresets(settings).map((preset) => presetTile(preset, preset.id === settings.captionPresetId)));
  $('#capFont').value = String(style.fontFamily);
  $('#capEdge').value = String(style.charEdgeStyle);
  document.querySelectorAll('#captionStyleControls [data-field]').forEach((group) => group.querySelectorAll('button[data-value]').forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset.value === String(style[group.dataset.field])))));
}

// One YouTube screen at a time: the home view or one sub-screen. Going back focuses the row
// that opened the screen, so keyboard users land where they left.
function showYoutubeScreen(id) {
  const from = document.querySelector('#youtubeHome:not([hidden]), .yt-screen:not([hidden])')?.id;
  document.querySelectorAll('#youtubeHome, .yt-screen').forEach((screen) => { screen.hidden = screen.id !== id; });
  if (from === id) return;
  const rowFor = { qualityScreen: '#qualityRow', audioScreen: '#audioRow', captionsScreen: '#captionsRow' };
  if (id === 'youtubeHome' && rowFor[from]) $(rowFor[from]).focus();
  else if (id !== 'youtubeHome') $(`#${id} .back-link`).focus();
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
  state.closedRows.forEach((closed) => clearTimeout(closed.timer));
  state.closedRows = [];
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
    // A tab reopened by Undo has only pendingUrl until it starts loading.
    state.tabs = (await chrome.tabs.query(state.scopeAll ? {} : { currentWindow: true })).map((tab) => ({ ...tab, url: tab.url || tab.pendingUrl }));
    state.groups = buildDuplicateGroups(state.tabs);
    renderGroups();
  } catch (_) { $('#tabSummary').textContent = 'Unable to read browser tabs.'; }
}

function renderGroups() {
  const query = $('#tabSearch').value.trim().toLowerCase();
  const matches = (tab) => `${tab.title} ${tab.url}`.toLowerCase().includes(query);
  const groups = displayGroups().filter((group) => group.items.some((item) => matches(item.tab)));
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
// Live duplicate groups, plus closed rows still inside their Undo window. A group whose
// last extra copy was just closed stays visible until its closed rows fold away.
function displayGroups() {
  const groups = state.groups.map((group) => ({ key: group.key, keepId: group.keepId, items: group.tabs.map((tab) => ({ tab })) }));
  state.closedRows.forEach((closed) => {
    let group = groups.find((candidate) => candidate.key === closed.key);
    if (!group) {
      const live = state.tabs.filter((tab) => !tab.pinned && tab.url && normalizeUrl(tab.url) === closed.key);
      group = { key: closed.key, keepId: live[0]?.id, items: live.map((tab) => ({ tab })) };
      groups.push(group);
    }
    const after = group.items.findIndex((item) => item.tab.id === closed.afterId);
    group.items.splice(after + 1, 0, { tab: closed.tab, closed });
  });
  return groups;
}
function renderEmptyState(closeCount, visibleGroups, query) {
  const scope = state.scopeAll ? 'any window' : 'this window';
  let title = '';
  let text = '';
  if (visibleGroups) title = '';
  else if (query && (closeCount || state.closedRows.length)) { title = 'No matches'; text = `No duplicate tabs match “${query}”.`; }
  else if (state.justClosed) { title = 'No duplicates left'; text = state.scopeAll ? 'Every tab is open once.' : 'Every tab in this window is open once.'; }
  else { title = `No duplicates in ${scope}`; text = `${state.scopeAll ? 'Every tab' : 'Every tab here'} is open once.\nPinned tabs are never counted.`; }
  $('#emptyState').hidden = !title;
  $('#emptyTitle').textContent = title;
  $('#emptyText').textContent = text;
  $('#searchAllWindows').hidden = !(title && !closeCount && !state.justClosed && !state.scopeAll);
}
function plural(count) { return count === 1 ? '' : 's'; }

function groupCard(group) {
  const card = element('article', 'group');
  const live = group.items.filter((item) => !item.closed);
  const keptActive = live.find((item) => item.tab.id === group.keepId)?.tab.active;
  const head = element('div', 'group-head');
  head.append(element('b', '', `${live.length} matching tab${plural(live.length)}`), element('small', '', `keeping the ${keptActive ? 'active' : 'earliest'} tab`));
  card.append(head);
  group.items.forEach(({ tab, closed }) => card.append(closed ? closedRow(closed) : tabRow(tab, tab.id === group.keepId)));
  return card;
}
function tabRow(tab, kept) {
  const row = element('div', `tab-row${kept ? ' is-kept' : ''}`);
  const tabButton = element('button', 'tab-link'); tabButton.type = 'button'; tabButton.title = tab.url;
  const copy = element('span', 'tab-copy');
  copy.append(element('span', 'tab-title', tab.title || 'Untitled tab'), element('span', 'tab-url', shortUrl(tab.url)));
  tabButton.append(favicon(tab), copy);
  tabButton.addEventListener('click', () => chrome.tabs.update(tab.id, { active: true }).then(() => chrome.windows.update(tab.windowId, { focused: true })));
  row.append(tabButton);
  if (kept) row.append(element('span', 'keep-badge', 'keep'));
  else { const close = element('button', 'close-tab', '×'); close.type = 'button'; close.setAttribute('aria-label', `Close ${tab.title || 'tab'}`); close.addEventListener('click', () => closeTabInRow(tab)); row.append(close); }
  return row;
}
function closedRow(closed) {
  const row = element('div', 'tab-row is-closed');
  row.dataset.closedId = closed.tab.id;
  const copy = element('span', 'closed-copy');
  copy.append(element('b', '', 'Closed'), element('span', '', closed.tab.title || 'Untitled tab'));
  const undo = element('button', 'undo-link', 'Undo'); undo.type = 'button';
  undo.setAttribute('aria-label', `Undo closing ${closed.tab.title || 'tab'}`);
  undo.addEventListener('click', () => undoClosedRow(closed));
  const countdown = element('span', 'row-countdown');
  countdown.style.animationDuration = `${UNDO_MS}ms`;
  countdown.style.animationDelay = `${closed.closedAt - Date.now()}ms`;
  row.append(copy, undo, countdown);
  return row;
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
// A single closed tab stays in place as a "Closed" row with its own Undo, so the
// action sits under the cursor. Bulk removal has no one row to attach to and uses the toast.
async function closeTabInRow(tab) {
  const group = displayGroups().find((candidate) => candidate.items.some((item) => item.tab.id === tab.id));
  const position = group ? group.items.findIndex((item) => item.tab.id === tab.id) : -1;
  await chrome.tabs.remove(tab.id);
  const closed = { tab: { ...tab }, key: normalizeUrl(tab.url), afterId: position > 0 ? group.items[position - 1].tab.id : null, closedAt: Date.now() };
  closed.timer = setTimeout(() => foldClosedRow(closed), UNDO_MS);
  state.closedRows.push(closed);
  state.justClosed = true;
  await refreshTabs();
  closedRowElement(closed)?.querySelector('.undo-link').focus();
}
function closedRowElement(closed) { return document.querySelector(`[data-closed-id="${closed.tab.id}"]`); }
function foldClosedRow(closed) {
  closedRowElement(closed)?.classList.add('is-folding');
  setTimeout(() => { state.closedRows = state.closedRows.filter((row) => row !== closed); renderGroups(); }, FOLD_MS);
}
async function undoClosedRow(closed) {
  clearTimeout(closed.timer);
  state.closedRows = state.closedRows.filter((row) => row !== closed);
  await chrome.tabs.create({ windowId: closed.tab.windowId, index: closed.tab.index, url: closed.tab.url, active: false });
  await refreshTabs();
}
function showToast(message, canUndo) { clearTimeout(state.undoTimer); $('#toastText').textContent = message; $('#undoRemove').hidden = !canUndo; $('#toast').hidden = false; state.undoTimer = setTimeout(() => { $('#toast').hidden = true; state.undoTabs = []; }, UNDO_MS); }
async function undoRemoval() { const grouped = new Map(); state.undoTabs.forEach((tab) => { if (!grouped.has(tab.windowId)) grouped.set(tab.windowId, []); grouped.get(tab.windowId).push(tab); }); for (const [windowId, tabs] of grouped) { for (const tab of tabs.sort((a, b) => a.index - b.index)) await chrome.tabs.create({ windowId, url: tab.url, index: tab.index, active: false }); } state.undoTabs = []; state.justClosed = false; $('#toast').hidden = true; await refreshTabs(); }

function getYoutubeVideoId(value) { try { const url = new URL(value); return url.hostname.includes('youtube.com') && url.pathname === '/watch' ? url.searchParams.get('v') : null; } catch (_) { return null; } }
function isSubscriptionsUrl(value) { try { const url = new URL(value); return url.hostname.includes('youtube.com') && url.pathname === '/feed/subscriptions'; } catch (_) { return false; } }
