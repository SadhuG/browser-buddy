// Duplicate-tab grouping shared by the popup and the Node unit tests.
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

if (typeof module !== 'undefined') module.exports = { normalizeUrl, variantKey, buildDuplicateGroups, chooseKeptTab, uniqueRemoveIds };
