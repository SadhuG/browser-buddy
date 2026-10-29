// "Your touch wins": tells Browser Buddy's own changes apart from the user's changes in YouTube's player.
// observe() returns 'ignored' | 'same' | 'drift' | 'touched'.
(function (root) {
  function createTouchTracker({ comparators = {}, graceMs = 3000 } = {}) {
    let applied = new Map(); // setting -> { value, at }
    let touched = new Map(); // setting -> value
    const equals = (setting, a, b) => (comparators[setting] || Object.is)(a, b);

    return {
      applied(setting, value, now) { applied.set(setting, { value, at: now }); },
      observe(setting, value, now, { userInitiated = false } = {}) {
        if (value === null || value === undefined) return 'ignored';
        if (touched.has(setting)) {
          if (!userInitiated) return 'ignored';
          touched.set(setting, value);
          return 'touched';
        }
        const last = applied.get(setting);
        if (!last) return 'ignored';
        if (equals(setting, value, last.value)) return 'same';
        if (now - last.at < graceMs) return 'ignored';
        if (!userInitiated) return 'drift';
        touched.set(setting, value);
        return 'touched';
      },
      isTouched(setting) { return touched.has(setting); },
      touches() { return Object.fromEntries(touched); },
      clear(setting) { touched.delete(setting); },
      reset() { applied = new Map(); touched = new Map(); },
    };
  }

  const api = { createTouchTracker };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.BrowserBuddy = root.BrowserBuddy || {}).touch = api;
})(globalThis);
