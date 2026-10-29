// Chooses the caption track for My languages: a creator-made track in the best-ranked
// language, then an auto-generated one, then an auto-translation into the first language.
// Load after lib/languages.js.
(function (root) {
  const inNode = typeof module !== 'undefined' && module.exports;
  const { baseLanguage, languageRank } = inNode ? require('./languages.js') : root.BrowserBuddy.languages;

  function bestRanked(tracks, myLanguages) {
    let best = null;
    let bestRank = Infinity;
    for (const track of tracks) {
      const rank = languageRank(track.languageCode, myLanguages);
      if (rank >= 0 && rank < bestRank) { best = track; bestRank = rank; }
    }
    return best;
  }

  function pickCaptionTrack({ tracks, translationLanguages, myLanguages }) {
    const list = Array.isArray(tracks) ? tracks : [];
    const creator = list.filter((track) => track.kind !== 'asr');
    const generated = list.filter((track) => track.kind === 'asr');
    const direct = bestRanked(creator, myLanguages) || bestRanked(generated, myLanguages);
    if (direct) return { track: direct, translationLanguage: null };

    const source = creator[0] || generated[0];
    if (!source) return null;
    for (const language of myLanguages || []) {
      const target = (translationLanguages || []).find((entry) => baseLanguage(entry.languageCode) === language);
      if (target) return { track: source, translationLanguage: target };
    }
    return null;
  }

  // A comparable label for what the player shows: 'off', 'en', 'en:asr', 'es>en'.
  function captionStateKey({ on, track, translationLanguage }) {
    if (!on) return 'off';
    if (!track || !track.languageCode) return 'on';
    return `${baseLanguage(track.languageCode)}${track.kind === 'asr' ? ':asr' : ''}${translationLanguage ? '>' + baseLanguage(translationLanguage.languageCode) : ''}`;
  }

  const api = { pickCaptionTrack, captionStateKey };
  if (inNode) module.exports = api;
  else (root.BrowserBuddy = root.BrowserBuddy || {}).captionTrack = api;
})(globalThis);
