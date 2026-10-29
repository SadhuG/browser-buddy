const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LADDER, normalizeQualityData, pickQuality } = require('../../lib/quality.js');

const KEY = { 144: 'tiny', 240: 'small', 360: 'medium', 480: 'large', 720: 'hd720', 1080: 'hd1080', 1440: 'hd1440', 2160: 'hd2160' };
const lv = (h, extra = {}) => ({ quality: KEY[h], height: h, playable: true, premium: false, ...extra });
const levels = (...heights) => heights.map((h) => lv(h));
const all = LADDER.map((h) => lv(h));
const pick = (available, preference, conditions = {}) => pickQuality({ available, preference, ...conditions });
const short = (result) => ({ quality: result.quality, reason: result.reason });

test('auto leaves it alone', () => {
  const result = pick(all, 'auto');
  assert.deepEqual(short(result), { quality: null, reason: null });
  assert.equal(result.maxHeight, 2160);
});

test('exact match', () => assert.deepEqual(short(pick(all, '1080')), { quality: 'hd1080', reason: null }));

test('falls back to closest lower', () => {
  const result = pick(levels(1080, 720), '1440');
  assert.deepEqual(short(result), { quality: 'hd1080', reason: 'fallback' });
  assert.equal(result.maxHeight, 1080);
});

test('nothing lower takes the lowest', () => assert.deepEqual(short(pick(levels(720, 480), '360')), { quality: 'large', reason: 'fallback' }));

test('highest available', () => assert.deepEqual(short(pick(levels(2160, 1080), 'highest')), { quality: 'hd2160', reason: null }));

test('premium and unplayable are skipped', () => {
  assert.deepEqual(short(pick([lv(1080, { premium: true }), lv(1440, { playable: false }), lv(720)], '1440')), { quality: 'hd720', reason: 'fallback' });
});

test('low battery steps down one', () => assert.deepEqual(short(pick(all, '1080', { lowBattery: true })), { quality: 'hd720', reason: 'battery' }));

test('battery floor is 480', () => assert.deepEqual(short(pick(all, '720', { lowBattery: true })), { quality: 'large', reason: 'battery' }));

test('battery never raises', () => assert.deepEqual(short(pick(all, '360', { lowBattery: true })), { quality: 'medium', reason: null }));

test('miniplayer steps down two', () => assert.deepEqual(short(pick(all, '1080', { miniplayer: true })), { quality: 'large', reason: 'miniplayer' }));

test('miniplayer from 4K', () => assert.deepEqual(short(pick(all, '2160', { miniplayer: true })), { quality: 'hd1080', reason: 'miniplayer' }));

test('miniplayer floor is 360', () => assert.deepEqual(short(pick(all, '480', { miniplayer: true })), { quality: 'medium', reason: 'miniplayer' }));

test('miniplayer never raises', () => assert.deepEqual(short(pick(all, '240', { miniplayer: true })), { quality: 'small', reason: null }));

test('both take the lower', () => assert.deepEqual(short(pick(all, '1080', { miniplayer: true, lowBattery: true })), { quality: 'large', reason: 'miniplayer' }));

test('adjusted target still respects availability', () => assert.deepEqual(short(pick(levels(2160, 720), '2160', { miniplayer: true })), { quality: 'hd720', reason: 'miniplayer' }));

test('empty list', () => assert.deepEqual(pick([], '1080'), { quality: null, height: null, reason: null, maxHeight: null }));

test('normalizes the player quality data, marking premium and dropping auto', () => {
  const data = normalizeQualityData([
    { formatId: 'a', qualityLabel: '1080p', quality: 'hd1080', isPlayable: true },
    { qualityLabel: '1080p Premium', quality: 'hd1080', isPlayable: true, paygatedQualityDetails: {} },
    { qualityLabel: '1080p60', quality: 'hd1080', isPlayable: false },
    { qualityLabel: 'auto', quality: 'auto' },
  ]);
  assert.deepEqual(data, [
    { quality: 'hd1080', height: 1080, playable: true, premium: false },
    { quality: 'hd1080', height: 1080, playable: true, premium: true },
    { quality: 'hd1080', height: 1080, playable: false, premium: false },
  ]);
});
