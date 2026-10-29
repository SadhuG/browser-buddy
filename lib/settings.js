// Settings defaults and normalization shared by content scripts, the popup and the Node unit tests.
(function (root) {
  const DEFAULT_SETTINGS = Object.freeze({
    playbackSpeed: 1,
    tutorialMode: false,
    subscriptionCleanMode: false,
    hideAmazonCart: false,
    quality: 'auto',
  });
  const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);
  const QUALITY_CHOICES = ['auto', 'highest', '144', '240', '360', '480', '720', '1080', '1440', '2160'];

  const toBoolean = (value) => !!value;
  const oneOf = (choices) => (value, fallback) => (choices.includes(value) ? value : fallback);
  const NORMALIZERS = {
    playbackSpeed: (value, fallback) => (typeof value === 'number' && value > 0 ? Math.min(4, Math.max(0.25, value)) : fallback),
    tutorialMode: toBoolean,
    subscriptionCleanMode: toBoolean,
    hideAmazonCart: toBoolean,
    quality: oneOf(QUALITY_CHOICES),
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
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.BrowserBuddy = root.BrowserBuddy || {}).settings = api;
})(globalThis);
