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

  // CSS that approximates YouTube's caption look for the popup preview (11px is the 100% size).
  const FONT_CSS = {
    1: '"Courier New", Courier, "Nimbus Mono L", monospace', 2: '"Times New Roman", Times, Georgia, serif',
    3: '"Lucida Console", "DejaVu Sans Mono", Monaco, monospace', 4: 'Roboto, "YouTube Noto", Arial, Helvetica, sans-serif',
    5: '"Comic Sans MS", Impact, Handlee, fantasy', 6: '"Monotype Corsiva", "URW Chancery L", "Apple Chancery", "Dancing Script", cursive',
    7: 'Arial, Helvetica, Verdana, "Marcellus SC", sans-serif',
  };
  const EDGE_CSS = {
    0: 'none', 1: '1px 1px 0 rgba(34, 34, 34, 0.8)', 2: '-1px -1px 0 rgba(204, 204, 204, 0.6), 1px 1px 0 rgba(34, 34, 34, 0.8)',
    3: '0 0 1px #080808, 0 0 1px #080808, 0 0 1px #080808, 0 0 1px #080808', 4: '2px 2px 3px rgba(34, 34, 34, 0.9)',
  };
  function rgba(hex, opacity) {
    const digits = hex.slice(1);
    const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  function previewCss(style) {
    const s = normalizeStyle(style);
    return {
      color: rgba(s.color, s.textOpacity),
      backgroundColor: rgba(s.background, s.backgroundOpacity),
      windowColor: rgba(s.windowColor, s.windowOpacity),
      fontFamily: FONT_CSS[s.fontFamily],
      fontVariant: s.fontFamily === 7 ? 'small-caps' : 'normal',
      fontSize: `${11 * s.sizePercent / 100}px`,
      textShadow: EDGE_CSS[s.charEdgeStyle],
    };
  }

  const api = { FONT_FAMILIES, COLORS, TEXT_OPACITIES, FILL_OPACITIES, EDGE_STYLES, SIZE_STEPS, DEFAULT_STYLE, BUILT_IN_PRESETS, normalizeStyle, toYoutubeSettings, fromYoutubeSettings, stylesEqual, previewCss };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.BrowserBuddy = root.BrowserBuddy || {}).captionStyle = api;
})(globalThis);
