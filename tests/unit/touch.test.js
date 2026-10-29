const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTouchTracker } = require('../../lib/touch.js');

const user = { userInitiated: true };

test('nothing applied yet is ignored', () => {
  const t = createTouchTracker();
  assert.equal(t.observe('quality', 'hd720', 0), 'ignored');
});

test('mismatch inside the grace window is ignored', () => {
  const t = createTouchTracker();
  t.applied('quality', 'hd1080', 0);
  assert.equal(t.observe('quality', 'hd720', 1000, user), 'ignored');
});

test('same value after grace is same', () => {
  const t = createTouchTracker();
  t.applied('quality', 'hd1080', 0);
  assert.equal(t.observe('quality', 'hd1080', 4000), 'same');
});

test('non-user mismatch is drift and not a touch', () => {
  const t = createTouchTracker();
  t.applied('quality', 'hd1080', 0);
  assert.equal(t.observe('quality', 'hd720', 5000), 'drift');
  assert.equal(t.isTouched('quality'), false);
});

test('user mismatch is a touch with its value', () => {
  const t = createTouchTracker();
  t.applied('quality', 'hd1080', 0);
  assert.equal(t.observe('quality', 'hd720', 5000, user), 'touched');
  assert.equal(t.isTouched('quality'), true);
  assert.deepEqual(t.touches(), { quality: 'hd720' });
});

test('a touched setting follows further user changes and ignores non-user ones', () => {
  const t = createTouchTracker();
  t.applied('quality', 'hd1080', 0);
  t.observe('quality', 'hd720', 5000, user);
  assert.equal(t.observe('quality', 'hd480', 6000, user), 'touched');
  assert.equal(t.observe('quality', 'hd1080', 7000), 'ignored');
  assert.deepEqual(t.touches(), { quality: 'hd480' });
});

test('null observations are ignored', () => {
  const t = createTouchTracker();
  t.applied('speed', 1.25, 0);
  assert.equal(t.observe('speed', null, 5000, user), 'ignored');
  assert.equal(t.observe('speed', undefined, 5000, user), 'ignored');
});

test('graceMs 0 judges immediately', () => {
  const t = createTouchTracker({ graceMs: 0 });
  t.applied('speed', 1.25, 0);
  assert.equal(t.observe('speed', 1.5, 0, user), 'touched');
});

test('custom comparator', () => {
  const t = createTouchTracker({ comparators: { s: (a, b) => a.c === b.c } });
  t.applied('s', { c: 1, x: 1 }, 0);
  assert.equal(t.observe('s', { c: 1, x: 2 }, 5000), 'same');
});

test('clear removes one touch', () => {
  const t = createTouchTracker({ graceMs: 0 });
  t.applied('a', 1, 0);
  t.applied('b', 1, 0);
  t.observe('a', 2, 1, user);
  t.observe('b', 2, 1, user);
  t.clear('a');
  assert.deepEqual(t.touches(), { b: 2 });
});

test('reset forgets touches and applied values', () => {
  const t = createTouchTracker({ graceMs: 0 });
  t.applied('a', 1, 0);
  t.observe('a', 2, 1, user);
  t.reset();
  assert.deepEqual(t.touches(), {});
  assert.equal(t.observe('a', 3, 2, user), 'ignored');
});
