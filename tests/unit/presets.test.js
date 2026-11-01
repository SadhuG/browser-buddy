const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BUILT_IN_PRESETS, DEFAULT_STYLE } = require('../../lib/caption-style.js');
const { listPresets, validateName, createPreset, renamePreset, updatePresetStyle, deletePreset, resetBuiltIn, applyPreset, afterDelete } = require('../../lib/presets.js');

const empty = { customPresets: [], builtInPresetEdits: {} };
const green = { ...DEFAULT_STYLE, color: '#0f0' };
const deepFreeze = (value) => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
const withNight = () => createPreset(empty, 'Night', green, 'custom-1').state;

test('lists four built-ins then customs', () => {
  const list = listPresets(withNight());
  assert.deepEqual(list.map((p) => [p.id, p.builtIn, p.edited]), [
    ['classic', true, false], ['high-contrast', true, false], ['minimal', true, false], ['large-print', true, false], ['custom-1', false, false],
  ]);
});

test('editing a built-in marks it edited and reset restores it', () => {
  const edited = updatePresetStyle(empty, 'classic', green).state;
  const classic = listPresets(edited).find((p) => p.id === 'classic');
  assert.deepEqual([classic.edited, classic.style.color, classic.name], [true, '#0f0', 'Classic']);
  const reset = resetBuiltIn(edited, 'classic').state;
  assert.deepEqual(listPresets(reset).find((p) => p.id === 'classic').style, BUILT_IN_PRESETS[0].style);
  assert.deepEqual(reset.builtInPresetEdits, {});
});

test('editing a built-in back to its original removes the edit', () => {
  const edited = updatePresetStyle(empty, 'classic', green).state;
  assert.deepEqual(updatePresetStyle(edited, 'classic', DEFAULT_STYLE).state.builtInPresetEdits, {});
});

test('creates a custom preset with a trimmed name', () => {
  const { state, preset } = createPreset(empty, '  Night  ', green, 'custom-1');
  assert.deepEqual(preset, { id: 'custom-1', name: 'Night', style: green });
  assert.equal(state.customPresets.length, 1);
});

test('rejects empty, too-long and duplicate names, case-insensitive', () => {
  assert.equal(validateName(empty, '   '), 'empty');
  assert.equal(validateName(empty, 'x'.repeat(25)), 'too-long');
  assert.equal(validateName(empty, 'x'.repeat(24)), null);
  assert.equal(validateName(empty, 'classic'), 'duplicate');
  assert.equal(validateName(withNight(), 'NIGHT'), 'duplicate');
  assert.equal(validateName(withNight(), 'Night', 'custom-1'), null);
  assert.deepEqual(createPreset(empty, 'Classic', green, 'c2'), { error: 'duplicate' });
});

test('rename keeps the id; renaming a built-in is refused', () => {
  const renamed = renamePreset(withNight(), 'custom-1', 'Late night').state;
  assert.deepEqual(renamed.customPresets.map((p) => [p.id, p.name]), [['custom-1', 'Late night']]);
  assert.deepEqual(renamePreset(empty, 'classic', 'Mine'), { error: 'built-in' });
});

test('edits a custom preset’s style', () => {
  const state = updatePresetStyle(withNight(), 'custom-1', { ...DEFAULT_STYLE, color: '#f00' }).state;
  assert.equal(state.customPresets[0].style.color, '#f00');
});

test('deletes a custom preset; deleting a built-in is refused', () => {
  assert.deepEqual(deletePreset(withNight(), 'custom-1').state.customPresets, []);
  assert.deepEqual(deletePreset(empty, 'minimal'), { error: 'built-in' });
});

test('refuses a 21st custom preset', () => {
  let state = empty;
  for (let i = 0; i < 20; i++) state = createPreset(state, `P${i}`, green, `c${i}`).state;
  assert.deepEqual(createPreset(state, 'One more', green, 'c20'), { error: 'limit' });
});

test('applyPreset copies the style and sets the id', () => {
  const settings = { ...withNight(), captionStyle: DEFAULT_STYLE, captionPresetId: 'classic' };
  assert.deepEqual(applyPreset(settings, 'custom-1'), { captionStyle: green, captionPresetId: 'custom-1' });
  assert.deepEqual(applyPreset(settings, 'high-contrast').captionStyle, BUILT_IN_PRESETS[1].style);
});

test('deleting the active preset clears captionPresetId but keeps captionStyle', () => {
  assert.deepEqual(afterDelete({ captionPresetId: 'custom-1', captionStyle: green }, 'custom-1'), { captionPresetId: null });
  assert.deepEqual(afterDelete({ captionPresetId: 'classic' }, 'custom-1'), { captionPresetId: 'classic' });
});

test('functions never mutate their input', () => {
  // Compare against snapshots: a frozen object would make a stray write fail silently.
  const state = withNight();
  const before = structuredClone(state);
  const calls = [
    () => createPreset(state, 'Day', DEFAULT_STYLE, 'c2'),
    () => renamePreset(state, 'custom-1', 'Dusk'),
    () => updatePresetStyle(state, 'custom-1', DEFAULT_STYLE),
    () => updatePresetStyle(state, 'classic', green),
    () => deletePreset(state, 'custom-1'),
  ];
  for (const call of calls) { call(); assert.deepEqual(state, before); }
  const edited = updatePresetStyle(state, 'classic', green).state;
  const editedBefore = structuredClone(edited);
  resetBuiltIn(edited, 'classic');
  assert.deepEqual(edited, editedBefore);
});
