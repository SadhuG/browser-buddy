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

test('quality accepts the listed choices and falls back to auto', () => {
  assert.equal(normalizeSettings({}).quality, 'auto');
  assert.equal(normalizeSettings({ quality: '1080' }).quality, '1080');
  assert.equal(normalizeSettings({ quality: 'highest' }).quality, 'highest');
  assert.equal(normalizeSettings({ quality: '999' }).quality, 'auto');
  assert.equal(normalizeSettings({ quality: 1080 }).quality, 'auto');
});

test('custom presets keep only valid entries with normalized styles', () => {
  const settings = normalizeSettings({ customPresets: [{ id: 'x' }, { id: 'c1', name: 'N', style: { color: '#123' } }, 'junk'] });
  assert.equal(settings.customPresets.length, 1);
  assert.deepEqual([settings.customPresets[0].id, settings.customPresets[0].name, settings.customPresets[0].style.color], ['c1', 'N', '#fff']);
  assert.deepEqual(normalizeSettings({}).customPresets, []);
});

test('built-in preset edits keep only known built-in ids', () => {
  const settings = normalizeSettings({ builtInPresetEdits: { nope: {}, minimal: { color: '#ff0' } } });
  assert.deepEqual(Object.keys(settings.builtInPresetEdits), ['minimal']);
  assert.equal(settings.builtInPresetEdits.minimal.color, '#ff0');
  assert.deepEqual(normalizeSettings({}).builtInPresetEdits, {});
});

test('audio track choice is off by default', () => {
  assert.equal(normalizeSettings({}).audioTrackEnabled, false);
  assert.equal(normalizeSettings({ audioTrackEnabled: 1 }).audioTrackEnabled, true);
});

test('caption settings default to changing nothing', () => {
  const { DEFAULT_STYLE } = require('../../lib/caption-style.js');
  const settings = normalizeSettings({});
  assert.equal(settings.captionsMode, 'youtube');
  assert.equal(settings.captionStyleEnabled, false);
  assert.deepEqual(settings.captionStyle, DEFAULT_STYLE);
  assert.equal(settings.captionPresetId, 'classic');
  assert.deepEqual(settings.myLanguages, ['en', 'hi']);
});

test('captionsMode accepts youtube, on and off only', () => {
  assert.equal(normalizeSettings({ captionsMode: 'on' }).captionsMode, 'on');
  assert.equal(normalizeSettings({ captionsMode: 'sometimes' }).captionsMode, 'youtube');
});

test('myLanguages keeps base codes in order without duplicates', () => {
  assert.deepEqual(normalizeSettings({ myLanguages: ['en-US', 'EN', 'hi'] }).myLanguages, ['en', 'hi']);
  assert.deepEqual(normalizeSettings({ myLanguages: [] }).myLanguages, ['en', 'hi']);
  assert.deepEqual(normalizeSettings({ myLanguages: 'en' }).myLanguages, ['en', 'hi']);
  assert.equal(normalizeSettings({ myLanguages: 'abcdefghijkl'.split('') }).myLanguages.length, 10);
});

test('captionStyle is normalized and captionPresetId may be null', () => {
  assert.equal(normalizeSettings({ captionStyle: { color: '#123' } }).captionStyle.color, '#fff');
  assert.equal(normalizeSettings({ captionPresetId: null }).captionPresetId, null);
  assert.equal(normalizeSettings({ captionPresetId: 'custom-1' }).captionPresetId, 'custom-1');
  assert.equal(normalizeSettings({ captionPresetId: 5 }).captionPresetId, 'classic');
});

test('the result is a fresh copy', () => {
  const defaults = structuredClone(DEFAULT_SETTINGS);
  const settings = normalizeSettings({});
  // Nested values must not be shared with the defaults (or between calls).
  assert.notEqual(settings.myLanguages, DEFAULT_SETTINGS.myLanguages);
  assert.notEqual(settings.captionStyle, DEFAULT_SETTINGS.captionStyle);
  assert.notEqual(settings.customPresets, DEFAULT_SETTINGS.customPresets);
  settings.playbackSpeed = 2;
  settings.myLanguages.push('fr');
  settings.captionStyle.color = '#0f0';
  settings.customPresets.push({ id: 'x' });
  assert.deepEqual(DEFAULT_SETTINGS, defaults);
  assert.deepEqual(normalizeSettings({}), defaults);
});
