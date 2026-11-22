const { test } = require('node:test');
const assert = require('node:assert/strict');
const { emptyState, reduce, ENDED_GRACE_MS, RESUME_MODES } = require('../../lib/one-video.js');

const A = 1, B = 2, C = 3;
const pause = (tabId) => ({ type: 'pause', tabId });
const resume = (tabId) => ({ type: 'resume', tabId });
const started = (tabId) => ({ type: 'started', tabId });
const paused = (tabId) => ({ type: 'paused', tabId });
const finished = (tabId) => ({ type: 'finished', tabId });
const closed = (tabId) => ({ type: 'closed', tabId });

// Fold events from an empty state; returns the last step's state and actions.
function run(events, mode = 'previous', from = emptyState()) {
  let result = { state: from, actions: [] };
  for (const event of events) result = reduce(result.state, event, mode);
  return result;
}

test('exports the grace window and resume modes', () => {
  assert.equal(ENDED_GRACE_MS, 8000);
  assert.deepEqual(RESUME_MODES, ['previous', 'first']);
  assert.deepEqual(emptyState(), { current: null, waiting: [], held: null });
});

test('starting a second video pauses the first', () => {
  const { state, actions } = run([started(A), started(B)]);
  assert.deepEqual(actions, [pause(A)]);
  assert.deepEqual(state, { current: B, waiting: [A], held: null });
});

test('starting the same tab again does nothing', () => {
  assert.deepEqual(run([started(A), started(A)]).actions, []);
});

test('finishing the playing video resumes the one it paused', () => {
  const { state, actions } = run([started(A), started(B), finished(B)]);
  assert.deepEqual(actions, [resume(A)]);
  assert.deepEqual(state, { current: A, waiting: [], held: null });
});

test('closing the playing tab resumes like finishing', () => {
  assert.deepEqual(run([started(A), started(B), closed(B)]).actions, [resume(A)]);
});

test('previous: three tabs come back newest first', () => {
  const step = run([started(A), started(B), started(C), closed(C)]);
  assert.deepEqual(step.actions, [resume(B)]);
  assert.deepEqual(run([closed(B)], 'previous', step.state).actions, [resume(A)]);
});

test('first: closing C resumes A and B waits', () => {
  const step = run([started(A), started(B), started(C), closed(C)], 'first');
  assert.deepEqual(step.actions, [resume(A)]);
  assert.deepEqual(step.state.waiting, [B]);
  assert.deepEqual(run([finished(A)], 'first', step.state).actions, [resume(B)]);
});

test('first falls back when the first tab is gone', () => {
  assert.deepEqual(run([started(A), started(B), started(C), closed(A), closed(C)], 'first').actions, [resume(B)]);
});

test('pausing the playing video resumes nothing', () => {
  const step = run([started(A), started(B), paused(B)]);
  assert.deepEqual(step.actions, []);
  const after = run([closed(B)], 'previous', step.state);
  assert.deepEqual(after.actions, []);
  assert.deepEqual(after.state.waiting, []);
});

test('playing a paused video again continues the chain', () => {
  const step = run([started(A), started(B), paused(B), started(B)]);
  assert.deepEqual(step.actions, []);
  assert.deepEqual(run([finished(B)], 'previous', step.state).actions, [resume(A)]);
});

test('playing a waiting video yourself pauses the playing one', () => {
  const { state, actions } = run([started(A), started(B), started(A)]);
  assert.deepEqual(actions, [pause(B)]);
  assert.deepEqual(state, { current: A, waiting: [B], held: null });
});

test('a fresh start after a user pause forgets older waiting videos', () => {
  const { state, actions } = run([started(A), started(B), paused(B), started(C)]);
  assert.deepEqual(actions, []);
  assert.deepEqual(state.waiting, []);
});

test('closing a waiting tab removes it', () => {
  const { state, actions } = run([started(A), started(B), closed(A)]);
  assert.deepEqual(actions, []);
  assert.deepEqual(state, { current: B, waiting: [], held: null });
});

test('events for tabs that are not playing are ignored', () => {
  assert.deepEqual(run([finished(9)]).actions, []);
  assert.deepEqual(run([paused(9)]).actions, []);
  assert.deepEqual(run([paused(9)]).state, emptyState());
});

test('does not change the state it is given', () => {
  const state = { current: B, waiting: [A], held: null };
  const copy = structuredClone(state);
  reduce(state, started(C), 'previous');
  reduce(state, closed(B), 'first');
  assert.deepEqual(state, copy);
});

test('a malformed state starts empty', () => {
  assert.equal(reduce(null, started(A), 'previous').state.current, A);
  assert.equal(reduce({ waiting: 'x' }, started(A), 'previous').state.current, A);
});
