// Settings defaults and normalization shared by content scripts, the popup and the Node unit tests.
// Load after lib/languages.js and lib/caption-style.js.
(function (root) {
  const inNode = typeof module !== 'undefined' && module.exports;
  const { baseLanguage } = inNode ? require('./languages.js') : root.BrowserBuddy.languages;
  const { DEFAULT_STYLE, BUILT_IN_PRESETS, normalizeStyle } = inNode ? require('./caption-style.js') : root.BrowserBuddy.captionStyle;

  const DEFAULT_SETTINGS = Object.freeze({
    playbackSpeed: 1,
    tutorialMode: false,
    subscriptionCleanMode: false,
    hideAmazonCart: false,
    quality: 'auto',
    captionsMode: 'youtube',
    captionStyleEnabled: false,
    captionStyle: DEFAULT_STYLE,
    captionPresetId: 'classic',
    myLanguages: Object.freeze(['en', 'hi']),
    audioTrackEnabled: false,
    customPresets: Object.freeze([]),
    builtInPresetEdits: Object.freeze({}),
  });
  const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);
  const QUALITY_CHOICES = ['auto', 'highest', '144', '240', '360', '480', '720', '1080', '1440', '2160'];
  const MAX_LANGUAGES = 10;

  const toBoolean = (value) => !!value;
  const oneOf = (choices) => (value, fallback) => (choices.includes(value) ? value : fallback);
  const NORMALIZERS = {
    playbackSpeed: (value, fallback) => (typeof value === 'number' && value > 0 ? Math.min(4, Math.max(0.25, value)) : fallback),
    tutorialMode: toBoolean,
    subscriptionCleanMode: toBoolean,
    hideAmazonCart: toBoolean,
    quality: oneOf(QUALITY_CHOICES),
    captionsMode: oneOf(['youtube', 'on', 'off']),
    captionStyleEnabled: toBoolean,
    audioTrackEnabled: toBoolean,
    captionStyle: (value) => normalizeStyle(value),
    captionPresetId: (value, fallback) => (value === null || typeof value === 'string' ? value : fallback),
    myLanguages: (value, fallback) => {
      if (!Array.isArray(value)) return fallback;
      const codes = [...new Set(value.filter((code) => typeof code === 'string').map(baseLanguage).filter(Boolean))].slice(0, MAX_LANGUAGES);
      return codes.length ? codes : fallback;
    },
    customPresets: (value, fallback) => (Array.isArray(value)
      ? value.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.style && typeof p.style === 'object')
        .map((p) => ({ id: p.id, name: p.name, style: normalizeStyle(p.style) }))
      : fallback),
    builtInPresetEdits: (value, fallback) => (value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(BUILT_IN_PRESETS.filter((p) => value[p.id] && typeof value[p.id] === 'object').map((p) => [p.id, normalizeStyle(value[p.id])]))
      : fallback),
  };

  const copy = (value) => (value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);

  function normalizeSettings(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const settings = {};
    for (const key of SETTING_KEYS) {
      const fallback = copy(DEFAULT_SETTINGS[key]);
      settings[key] = key in source ? NORMALIZERS[key](source[key], fallback) : fallback;
    }
    return settings;
  }

  const api = { DEFAULT_SETTINGS, SETTING_KEYS, normalizeSettings };
  if (inNode) module.exports = api;
  else (root.BrowserBuddy = root.BrowserBuddy || {}).settings = api;
})(globalThis);
