// Preferred resolution: picks the YouTube quality level for a video from the user's choice,
// falling back to the closest lower level and stepping down in the miniplayer or on low battery.
(function (root) {
  const LADDER = [144, 240, 360, 480, 720, 1080, 1440, 2160];
  const BATTERY_FLOOR = 480;
  const MINIPLAYER_FLOOR = 360;

  // Player data: { qualityLabel: '1080p', quality: 'hd1080', isPlayable, paygatedQualityDetails? }.
  function normalizeQualityData(raw) {
    return (Array.isArray(raw) ? raw : []).flatMap((entry) => {
      const match = /(\d{3,4})p/.exec((entry && entry.qualityLabel) || '');
      if (!match) return [];
      return [{ quality: entry.quality, height: Number(match[1]), playable: entry.isPlayable !== false, premium: !!entry.paygatedQualityDetails }];
    });
  }

  function stepDown(height, steps) {
    let index = LADDER.indexOf(height);
    if (index < 0) index = LADDER.filter((h) => h < height).length;
    return LADDER[Math.max(0, index - steps)];
  }

  function pickQuality({ available, preference, miniplayer = false, lowBattery = false }) {
    const usable = (available || []).filter((level) => level.playable && !level.premium);
    const heights = usable.map((level) => level.height);
    const maxHeight = heights.length ? Math.max(...heights) : null;
    if (preference === 'auto' || !usable.length) return { quality: null, height: null, reason: null, maxHeight };

    const atMost = (limit) => {
      const lower = heights.filter((h) => h <= limit);
      return lower.length ? Math.max(...lower) : Math.min(...heights);
    };
    const target = preference === 'highest' ? maxHeight : Number(preference);
    const base = atMost(target);
    const battery = lowBattery ? Math.min(base, Math.max(stepDown(base, 1), BATTERY_FLOOR)) : base;
    const mini = miniplayer ? Math.min(base, Math.max(stepDown(base, 2), MINIPLAYER_FLOOR)) : base;
    const want = Math.min(battery, mini);
    const height = atMost(want);

    let reason = null;
    if (want < base) reason = mini <= battery ? 'miniplayer' : 'battery';
    else if (preference !== 'highest' && base !== target) reason = 'fallback';
    const quality = usable.find((level) => level.height === height).quality;
    return { quality, height, reason, maxHeight };
  }

  const api = { LADDER, normalizeQualityData, pickQuality };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.BrowserBuddy = root.BrowserBuddy || {}).quality = api;
})(globalThis);
