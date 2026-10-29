// Language matching by base language: "en-US", "en-GB" and YouTube's "en-US.4" all count as "en".
(function (root) {
  const LEGACY = { iw: 'he', in: 'id', ji: 'yi' };

  function baseLanguage(code) {
    const base = String(code || '').split(/[.\-_]/)[0].toLowerCase();
    return LEGACY[base] || base;
  }

  function languageRank(code, myLanguages) {
    return (myLanguages || []).indexOf(baseLanguage(code));
  }

  const api = { baseLanguage, languageRank };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.BrowserBuddy = root.BrowserBuddy || {}).languages = api;
})(globalThis);
