// Caption style limited to the values YouTube's own ⚙ → Subtitles → Options menu offers
// (read from the menu on 2026-10-29). Size is stored as YouTube's percentage label;
// YouTube itself stores a step ("fontSizeIncrement").
(function (root) {
  const FONT_FAMILIES = [
    { value: 1, label: 'Monospaced Serif' }, { value: 2, label: 'Proportional Serif' },
    { value: 3, label: 'Monospaced Sans-Serif' }, { value: 4, label: 'Proportional Sans-Serif' },
    { value: 5, label: 'Casual' }, { value: 6, label: 'Cursive' }, { value: 7, label: 'Small Capitals' },
  ];
  const COLORS = [
    { value: '#fff', label: 'White' }, { value: '#ff0', label: 'Yellow' }, { value: '#0f0', label: 'Green' },
    { value: '#0ff', label: 'Cyan' }, { value: '#00f', label: 'Blue' }, { value: '#f0f', label: 'Magenta' },
    { value: '#f00', label: 'Red' }, { value: '#080808', label: 'Black' },
  ];
  const percent = (value) => ({ value, label: `${Math.round(value * 100)}%` });
  const TEXT_OPACITIES = [0.25, 0.5, 0.75, 1].map(percent);
  const FILL_OPACITIES = [0, 0.25, 0.5, 0.75, 1].map(percent);
  const EDGE_STYLES = [
    { value: 0, label: 'None' }, { value: 4, label: 'Drop Shadow' }, { value: 1, label: 'Raised' },
    { value: 2, label: 'Depressed' }, { value: 3, label: 'Outline' },
  ];
  const SIZE_STEPS = [[50, -2], [75, -1], [100, 0], [150, 1], [200, 2], [300, 3], [400, 4]].map(([p, increment]) => ({ percent: p, increment }));

  const DEFAULT_STYLE = Object.freeze({
    fontFamily: 4, color: '#fff', textOpacity: 1, background: '#080808', backgroundOpacity: 0.75,
    windowColor: '#080808', windowOpacity: 0, charEdgeStyle: 0, sizePercent: 100,
  });
  const preset = (id, name, changes) => ({ id, name, style: Object.freeze({ ...DEFAULT_STYLE, ...changes }) });
  const BUILT_IN_PRESETS = [
    preset('classic', 'Classic', {}),
    preset('high-contrast', 'High contrast', { color: '#ff0', backgroundOpacity: 1 }),
    preset('minimal', 'Minimal', { backgroundOpacity: 0, charEdgeStyle: 4 }),
    preset('large-print', 'Large print', { sizePercent: 150, charEdgeStyle: 3 }),
  ];

  const values = (list) => list.map((item) => item.value);
  const ALLOWED = {
    fontFamily: values(FONT_FAMILIES), color: values(COLORS), textOpacity: values(TEXT_OPACITIES),
    background: values(COLORS), backgroundOpacity: values(FILL_OPACITIES), windowColor: values(COLORS),
    windowOpacity: values(FILL_OPACITIES), charEdgeStyle: values(EDGE_STYLES), sizePercent: SIZE_STEPS.map((s) => s.percent),
  };
  const FIELDS = Object.keys(ALLOWED);

  function normalizeStyle(style) {
    const source = style && typeof style === 'object' ? style : {};
    const result = {};
    for (const field of FIELDS) result[field] = ALLOWED[field].includes(source[field]) ? source[field] : DEFAULT_STYLE[field];
    return result;
  }

  function toYoutubeSettings(style) {
    const { sizePercent, ...rest } = normalizeStyle(style);
    return { ...rest, fontSizeIncrement: SIZE_STEPS.find((s) => s.percent === sizePercent).increment, fontStyle: 0 };
  }

  function fromYoutubeSettings(settings) {
    const source = settings || {};
    const increment = Math.min(4, Math.max(-2, Math.floor(Number(source.fontSizeIncrement) || 0)));
    const sizePercent = SIZE_STEPS.find((s) => s.increment === increment).percent;
    return normalizeStyle({ ...source, sizePercent });
  }

  function stylesEqual(a, b) {
    const x = normalizeStyle(a);
    const y = normalizeStyle(b);
    return FIELDS.every((field) => x[field] === y[field]);
  }

  const api = { FONT_FAMILIES, COLORS, TEXT_OPACITIES, FILL_OPACITIES, EDGE_STYLES, SIZE_STEPS, DEFAULT_STYLE, BUILT_IN_PRESETS, normalizeStyle, toYoutubeSettings, fromYoutubeSettings, stylesEqual };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.BrowserBuddy = root.BrowserBuddy || {}).captionStyle = api;
})(globalThis);
