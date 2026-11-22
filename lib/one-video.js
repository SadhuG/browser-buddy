// One video at a time: decides which YouTube tab to pause when another starts making sound,
// and which paused tab to bring back when the playing one ends or closes. Pure; the service
// worker keeps the state (chrome.storage.session) and carries out the actions.
(function (root) {
  // After a video ends, wait this long for its tab to play again (autoplay, playlist, an ad
  // handing over to the video) before treating it as finished.
  const ENDED_GRACE_MS = 8000;
  const RESUME_MODES = ['previous', 'first'];

  // current: tab whose audible video started last and still plays. waiting: tabs Browser Buddy
  // paused, oldest first. held: the tab the user paused while it was current.
  const emptyState = () => ({ current: null, waiting: [], held: null });

  function cleanState(state) {
    if (!state || typeof state !== 'object' || !Array.isArray(state.waiting)) return emptyState();
    return { current: state.current ?? null, waiting: state.waiting.slice(), held: state.held ?? null };
  }

  // The playing tab is done: hand over to the next waiting tab.
  function handOver(state, mode, actions) {
    state.current = null;
    state.held = null;
    const next = mode === 'first' ? state.waiting.shift() : state.waiting.pop();
    if (next !== undefined) { state.current = next; actions.push({ type: 'resume', tabId: next }); }
  }

  // event: { type: 'started' | 'paused' | 'finished' | 'closed', tabId }. Returns the new state
  // and actions [{ type: 'pause' | 'resume', tabId }]; the given state is never changed.
  function reduce(previous, event, mode) {
    const state = cleanState(previous);
    const actions = [];
    const tab = event.tabId;
    const without = (list) => list.filter((id) => id !== tab);
    switch (event.type) {
      case 'started':
        if (state.current === tab) break;
        // Nothing was playing and this isn't the video the user paused: a fresh start, so
        // older paused videos aren't brought back hours later.
        if (state.current === null && state.held !== tab) state.waiting = [];
        state.waiting = without(state.waiting);
        state.held = null;
        if (state.current !== null) {
          state.waiting = state.waiting.filter((id) => id !== state.current).concat(state.current);
          actions.push({ type: 'pause', tabId: state.current });
        }
        state.current = tab;
        break;
      case 'paused':
        if (state.current === tab) { state.current = null; state.held = tab; }
        break;
      case 'finished':
        if (state.current === tab) handOver(state, mode, actions);
        break;
      case 'closed':
        state.waiting = without(state.waiting);
        // Closing a video you'd paused yourself brings nothing back: you'd stopped listening.
        if (state.held === tab) { state.held = null; state.waiting = []; }
        if (state.current === tab) handOver(state, mode, actions);
        break;
    }
    return { state, actions };
  }

  const api = { ENDED_GRACE_MS, RESUME_MODES, emptyState, reduce };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.BrowserBuddy = root.BrowserBuddy || {}).oneVideo = api;
})(globalThis);
