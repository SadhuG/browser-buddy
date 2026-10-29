const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SETTINGS, SETTING_KEYS, normalizeSettings } = require('../../lib/settings.js');

test('empty storage normalizes to the defaults', () => assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS));

test('undefined normalizes to the defaults', () => assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS));

test('the existing settings keep their defaults', () => {
  assert.deepEqual(
    { playbackSpeed: DEFAULT_SETTINGS.playbackSpeed, tutorialMode: DEFAULT_SETTINGS.tutorialMode, subscriptionCleanMode: DEFAULT_SETTINGS.subscriptionCleanMode, hideAmazonCart: DEFAULT_SETTINGS.hideAmazonCart },
    { playbackSpeed: 1, tutorialMode: false, subscriptionCleanMode: false, hideAmazonCart: false },
  );
  assert.deepEqual(SETTING_KEYS, Object.keys(DEFAULT_SETTINGS));
});

test('speed is clamped to 0.25–4 and falls back to 1', () => {
  assert.equal(normalizeSettings({ playbackSpeed: 9 }).playbackSpeed, 4);
  assert.equal(normalizeSettings({ playbackSpeed: 0.1 }).playbackSpeed, 0.25);
  assert.equal(normalizeSettings({ playbackSpeed: 0 }).playbackSpeed, 1);
  assert.equal(normalizeSettings({ playbackSpeed: 'fast' }).playbackSpeed, 1);
});

test('booleans are coerced', () => assert.equal(normalizeSettings({ tutorialMode: 1 }).tutorialMode, true));

test('unknown keys are dropped', () => assert.equal('foo' in normalizeSettings({ foo: 1 }), false));

test('the result is a fresh copy', () => {
  const settings = normalizeSettings({});
  settings.playbackSpeed = 2;
  assert.equal(DEFAULT_SETTINGS.playbackSpeed, 1);
});
