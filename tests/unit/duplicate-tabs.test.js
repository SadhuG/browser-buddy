const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUrl, buildDuplicateGroups, chooseKeptTab, uniqueRemoveIds } = require('../../lib/duplicate-tabs.js');

let nextId = 1;
const tab = (url, extra = {}) => ({ id: nextId++, index: nextId, url, pinned: false, active: false, ...extra });

test('normalizeUrl drops fragments, trailing slashes and tracking parameters', () => {
  assert.equal(normalizeUrl('https://a.test/x/?utm_source=n&id=1#top'), 'https://a.test/x?id=1');
});

test('query-string variants are not grouped together', () => {
  const groups = buildDuplicateGroups([tab('https://a.test/articles?sort=new'), tab('https://a.test/articles?sort=top')]);
  assert.equal(groups.length, 0);
});

test('identical normalized URLs form one group', () => {
  const groups = buildDuplicateGroups([tab('https://a.test/a'), tab('https://a.test/a/#x'), tab('https://a.test/b')]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].tabs.length, 2);
});

test('pinned tabs are excluded from duplicate groups', () => {
  const groups = buildDuplicateGroups([tab('https://a.test/a', { pinned: true }), tab('https://a.test/a')]);
  assert.equal(groups.length, 0);
});

test('chooseKeptTab prefers the active tab', () => {
  const tabs = [tab('https://a.test/a', { index: 0 }), tab('https://a.test/a', { index: 1, active: true })];
  assert.equal(chooseKeptTab(tabs), tabs[1].id);
});

test('chooseKeptTab otherwise keeps the earliest tab', () => {
  const tabs = [tab('https://a.test/a', { index: 5 }), tab('https://a.test/a', { index: 2 }), tab('https://a.test/a', { index: 9 })];
  assert.equal(chooseKeptTab(tabs), tabs[1].id);
});

test('uniqueRemoveIds never includes a kept tab', () => {
  const groups = buildDuplicateGroups([tab('https://a.test/a'), tab('https://a.test/a'), tab('https://a.test/a'), tab('https://a.test/b'), tab('https://a.test/b')]);
  const ids = uniqueRemoveIds(groups);
  assert.equal(ids.length, 3);
  groups.forEach((group) => assert.ok(!ids.includes(group.keepId)));
});
