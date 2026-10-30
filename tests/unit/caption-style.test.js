const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  FONT_FAMILIES, COLORS, TEXT_OPACITIES, FILL_OPACITIES, EDGE_STYLES, SIZE_STEPS,
  DEFAULT_STYLE, BUILT_IN_PRESETS, normalizeStyle, toYoutubeSettings, fromYoutubeSettings, stylesEqual,
} = require('../../lib/caption-style.js');

const YOUTUBE_DEFAULT = { background: '#080808', backgroundOpacity: 0.75, charEdgeStyle: 0, color: '#fff', fontFamily: 4, fontSizeIncrement: 0, fontStyle: 0, textOpacity: 1, windowColor: '#080808', windowOpacity: 0 };
const preset = (id) => BUILT_IN_PRESETS.find((p) => p.id === id).style;
const edge = (label) => EDGE_STYLES.find((e) => e.label === label).value;

test('option lists match YouTube’s menu', () => {
  assert.equal(FONT_FAMILIES.length, 7);
  assert.equal(COLORS.length, 8);
  assert.deepEqual(TEXT_OPACITIES.map((o) => o.value), [0.25, 0.5, 0.75, 1]);
  assert.deepEqual(FILL_OPACITIES.map((o) => o.value), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(EDGE_STYLES.map((e) => [e.label, e.value]), [['None', 0], ['Drop Shadow', 4], ['Raised', 1], ['Depressed', 2], ['Outline', 3]]);
  assert.equal(COLORS.find((c) => c.label === 'Black').value, '#080808');
});

test('Classic maps to YouTube’s observed default', () => assert.deepEqual(toYoutubeSettings(DEFAULT_STYLE), YOUTUBE_DEFAULT));

test('size percents map to increments', () => {
  assert.deepEqual(SIZE_STEPS.map((s) => [s.percent, s.increment]), [[50, -2], [75, -1], [100, 0], [150, 1], [200, 2], [300, 3], [400, 4]]);
  assert.equal(toYoutubeSettings({ ...DEFAULT_STYLE, sizePercent: 300 }).fontSizeIncrement, 3);
});

test('increments map back to the size step', () => {
  const size = (fontSizeIncrement) => fromYoutubeSettings({ ...YOUTUBE_DEFAULT, fontSizeIncrement }).sizePercent;
  assert.deepEqual([-2, 1, 4, -5, 9, 1.5].map(size), [50, 150, 400, 50, 400, 150]);
});

test('fromYoutubeSettings round-trips Classic', () => assert.deepEqual(fromYoutubeSettings(YOUTUBE_DEFAULT), DEFAULT_STYLE));

test('invalid fields fall back to Classic', () => {
  const style = normalizeStyle({ color: '#123456', sizePercent: 120, fontFamily: 6 });
  assert.equal(style.color, '#fff');
  assert.equal(style.sizePercent, 100);
  assert.equal(style.fontFamily, 6);
  assert.deepEqual(normalizeStyle(null), DEFAULT_STYLE);
});

test('stylesEqual ignores fontStyle and compares normalized values', () => {
  assert.equal(stylesEqual(fromYoutubeSettings({ ...YOUTUBE_DEFAULT, fontStyle: 3 }), DEFAULT_STYLE), true);
  assert.equal(stylesEqual({ ...DEFAULT_STYLE, color: '#ff0' }, DEFAULT_STYLE), false);
});

test('four built-in presets with the spec’s looks', () => {
  assert.deepEqual(BUILT_IN_PRESETS.map((p) => [p.id, p.name]), [['classic', 'Classic'], ['high-contrast', 'High contrast'], ['minimal', 'Minimal'], ['large-print', 'Large print']]);
  assert.deepEqual(preset('classic'), DEFAULT_STYLE);
  assert.deepEqual(preset('high-contrast'), { ...DEFAULT_STYLE, color: '#ff0', backgroundOpacity: 1 });
  assert.deepEqual(preset('minimal'), { ...DEFAULT_STYLE, backgroundOpacity: 0, charEdgeStyle: edge('Drop Shadow') });
  assert.deepEqual(preset('large-print'), { ...DEFAULT_STYLE, sizePercent: 150, charEdgeStyle: edge('Outline') });
});

test('previewCss turns a style into CSS for the popup preview', () => {
  const { previewCss } = require('../../lib/caption-style.js');
  const css = previewCss(preset('high-contrast'));
  assert.equal(css.color, 'rgba(255, 255, 0, 1)');
  assert.equal(css.backgroundColor, 'rgba(8, 8, 8, 1)');
  assert.equal(css.fontSize, '11px');
  assert.equal(previewCss({ ...DEFAULT_STYLE, sizePercent: 200 }).fontSize, '22px');
  assert.equal(previewCss(DEFAULT_STYLE).backgroundColor, 'rgba(8, 8, 8, 0.75)');
  assert.equal(previewCss(DEFAULT_STYLE).textShadow, 'none');
  assert.notEqual(previewCss(preset('minimal')).textShadow, 'none');
  assert.equal(new Set(FONT_FAMILIES.map((f) => previewCss({ ...DEFAULT_STYLE, fontFamily: f.value }).fontFamily)).size, 7);
});
