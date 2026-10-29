const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pickCaptionTrack, captionStateKey } = require('../../lib/caption-track.js');

const T = (languageCode, kind = '') => ({ languageCode, kind });
const L = (languageCode) => ({ languageCode, languageName: languageCode });
const my = ['en', 'hi'];
const pick = (tracks, translationLanguages = []) => pickCaptionTrack({ tracks, translationLanguages, myLanguages: my });

test('creator track in first language', () => {
  const tracks = [T('en'), T('en', 'asr')];
  assert.deepEqual(pick(tracks), { track: tracks[0], translationLanguage: null });
});

test('creator in second language beats asr in first', () => {
  const tracks = [T('hi'), T('en', 'asr')];
  assert.equal(pick(tracks).track, tracks[0]);
});

test('asr in my languages beats translation', () => {
  const tracks = [T('es'), T('en', 'asr')];
  assert.deepEqual(pick(tracks, [L('en')]), { track: tracks[1], translationLanguage: null });
});

test('regional variants match', () => {
  const tracks = [T('en-GB')];
  assert.equal(pick(tracks).track, tracks[0]);
});

test('translates when nothing matches', () => {
  const tracks = [T('es'), T('es', 'asr')];
  const languages = [L('en'), L('hi')];
  assert.deepEqual(pick(tracks, languages), { track: tracks[0], translationLanguage: languages[0] });
});

test('translation target follows list order', () => {
  const tracks = [T('es')];
  const languages = [L('hi')];
  assert.deepEqual(pick(tracks, languages), { track: tracks[0], translationLanguage: languages[0] });
});

test('translation uses an asr source when there is no creator track', () => {
  const tracks = [T('es', 'asr')];
  assert.deepEqual(pick(tracks, [L('en')]), { track: tracks[0], translationLanguage: L('en') });
});

test('no tracks', () => assert.equal(pick([], [L('en')]), null));

test('no usable target', () => assert.equal(pick([T('es')], [L('fr')]), null));

test('caption state keys', () => {
  assert.equal(captionStateKey({ on: false }), 'off');
  assert.equal(captionStateKey({ on: true, track: T('en-US') }), 'en');
  assert.equal(captionStateKey({ on: true, track: T('en', 'asr') }), 'en:asr');
  assert.equal(captionStateKey({ on: true, track: T('es'), translationLanguage: L('en') }), 'es>en');
  assert.equal(captionStateKey({ on: true, track: null }), 'on');
});
