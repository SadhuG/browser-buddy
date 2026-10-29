// Audio track choice from My languages: the original if it's in your languages, otherwise the
// best-ranked dub (human before AI), otherwise the original with captions in your first language.
// Load after lib/languages.js.
(function (root) {
  const inNode = typeof module !== 'undefined' && module.exports;
  const { baseLanguage } = inNode ? require('./languages.js') : root.BrowserBuddy.languages;
  const INFO_ID = /^[A-Za-z]{2,3}([-_][A-Za-z0-9]+)*\.\d+$/;

  // YouTube's track id is "<itag>;<base64url protobuf>"; the protobuf holds readable markers
  // such as "acont original", "acont dubbed" and "acont dubbed-auto" (findings Q4).
  function decodeTrackId(id) {
    try {
      const encoded = String(id).split(';')[1] || '';
      const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((encoded.length + 3) % 4);
      return atob(base64);
    } catch (_) { return ''; }
  }

  function parseAudioTrack(raw) {
    if (!raw || typeof raw !== 'object') return null;
    // The info object sits under a minified key that changes between player builds; find it by shape.
    const info = Object.values(raw).find((value) => value && typeof value === 'object' && typeof value.name === 'string' && typeof value.id === 'string' && INFO_ID.test(value.id));
    if (!info) return null;
    const decoded = decodeTrackId(raw.id);
    const isOriginal = /original/.test(decoded) || /\.4$/.test(info.id) || /\boriginal\b/i.test(info.name);
    const isAutoDubbed = info.isAutoDubbed === true || /dubbed-auto/.test(decoded);
    return { id: raw.id, language: baseLanguage(info.id), name: info.name, isOriginal, isAutoDubbed };
  }

  function pickAudioTrack(tracks, myLanguages) {
    const none = (reason) => ({ trackId: null, captionLanguage: null, reason, language: null });
    const list = (tracks || []).filter(Boolean);
    if (list.length < 2) return none('single-track');
    const original = list.find((track) => track.isOriginal);
    if (original && myLanguages.includes(original.language)) return { trackId: original.id, captionLanguage: null, reason: 'original', language: original.language };
    for (const language of myLanguages) {
      const dubs = list.filter((track) => !track.isOriginal && track.language === language);
      const dub = dubs.find((track) => !track.isAutoDubbed) || dubs[0];
      if (dub) return { trackId: dub.id, captionLanguage: null, reason: dub.isAutoDubbed ? 'ai-dub' : 'dub', language };
    }
    if (original) return { trackId: original.id, captionLanguage: myLanguages[0] || null, reason: 'no-match', language: original.language };
    return none('unknown-original');
  }

  const api = { parseAudioTrack, pickAudioTrack };
  if (inNode) module.exports = api;
  else (root.BrowserBuddy = root.BrowserBuddy || {}).audioTrack = api;
})(globalThis);
