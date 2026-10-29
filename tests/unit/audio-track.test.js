const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseAudioTrack, pickAudioTrack } = require('../../lib/audio-track.js');
const fixture = require('./fixtures/audio-tracks.json');

// Real tracks captured from YouTube on 2026-10-30.
const real = (videoId, name) => fixture[videoId].find((t) => t.info.name === name);

test('parses the real original English track', () => {
  const track = parseAudioTrack(real('0e3GPea1Tyg', 'English (US) original'));
  assert.deepEqual({ language: track.language, isOriginal: track.isOriginal, isAutoDubbed: track.isAutoDubbed }, { language: 'en', isOriginal: true, isAutoDubbed: false });
});

test('parses the real Hindi dub', () => {
  const track = parseAudioTrack(real('0e3GPea1Tyg', 'Hindi'));
  assert.deepEqual({ language: track.language, isOriginal: track.isOriginal }, { language: 'hi', isOriginal: false });
});

test('parses a real AI dub and a real Hindi original', () => {
  const ai = parseAudioTrack(real('bRtSGQYY3m4', 'English (US)'));
  const hindi = parseAudioTrack(real('bRtSGQYY3m4', 'Hindi original'));
  assert.deepEqual([ai.language, ai.isOriginal, ai.isAutoDubbed], ['en', false, true]);
  assert.deepEqual([hindi.language, hindi.isOriginal], ['hi', true]);
});

test('the parser finds the info object by shape, under any key', () => {
  const { id, info } = real('0e3GPea1Tyg', 'Hindi');
  assert.equal(parseAudioTrack({ id, Zq: info, other: { foo: 1 } }).language, 'hi');
});

test('an object without an info shape parses to null', () => {
  assert.equal(parseAudioTrack({ id: 'x', foo: { bar: 1 } }), null);
  assert.equal(parseAudioTrack(null), null);
});

test('detects the original from the decoded id alone', () => {
  const { id } = real('0e3GPea1Tyg', 'English (US) original');
  const track = parseAudioTrack({ id, info: { name: 'English', id: 'en-US.7', isDefault: false, isAutoDubbed: false } });
  assert.equal(track.isOriginal, true);
});

let nextId = 0;
const P = (language, { original = false, ai = false } = {}) => ({ id: `t${nextId++}`, language, name: language, isOriginal: original, isAutoDubbed: ai });
const pick = (tracks) => pickAudioTrack(tracks, ['en', 'hi']);
const chosen = (tracks, result) => tracks.find((t) => t.id === result.trackId);

test('single track does nothing', () => {
  assert.deepEqual(pick([P('en', { original: true })]), { trackId: null, captionLanguage: null, reason: 'single-track', language: null });
  assert.equal(pick([]).reason, 'single-track');
});

test('English original plays', () => {
  const tracks = [P('en', { original: true }), P('hi')];
  const result = pick(tracks);
  assert.equal(result.reason, 'original');
  assert.equal(chosen(tracks, result), tracks[0]);
});

test('Hindi original plays', () => {
  const tracks = [P('hi', { original: true }), P('en')];
  const result = pick(tracks);
  assert.deepEqual([result.reason, result.language], ['original', 'hi']);
  assert.equal(chosen(tracks, result), tracks[0]);
});

test('foreign original takes the English dub', () => {
  const tracks = [P('es', { original: true }), P('hi'), P('en')];
  const result = pick(tracks);
  assert.deepEqual([result.reason, result.language], ['dub', 'en']);
  assert.equal(chosen(tracks, result), tracks[2]);
});

test('foreign original takes Hindi when no English', () => {
  const result = pick([P('es', { original: true }), P('hi')]);
  assert.deepEqual([result.reason, result.language], ['dub', 'hi']);
});

test('human dub beats AI in the same language', () => {
  const tracks = [P('es', { original: true }), P('en', { ai: true }), P('en')];
  const result = pick(tracks);
  assert.equal(result.reason, 'dub');
  assert.equal(chosen(tracks, result), tracks[2]);
});

test('AI dub in a higher language beats a human dub lower down', () => {
  const tracks = [P('es', { original: true }), P('en', { ai: true }), P('hi')];
  const result = pick(tracks);
  assert.deepEqual([result.reason, result.language], ['ai-dub', 'en']);
  assert.equal(chosen(tracks, result), tracks[1]);
});

test('no match plays the original with captions', () => {
  const tracks = [P('es', { original: true }), P('fr')];
  const result = pick(tracks);
  assert.deepEqual([result.reason, result.language, result.captionLanguage], ['no-match', 'es', 'en']);
  assert.equal(chosen(tracks, result), tracks[0]);
});

test('no original flagged', () => {
  assert.deepEqual(pick([P('es'), P('fr')]), { trackId: null, captionLanguage: null, reason: 'unknown-original', language: null });
});
