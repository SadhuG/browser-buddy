const { test } = require('node:test');
const assert = require('node:assert/strict');
const { baseLanguage, languageRank } = require('../../lib/languages.js');

test('base language strips region, script and YouTube suffixes', () => {
  for (const [input, out] of [['en-US', 'en'], ['en-US.4', 'en'], ['EN', 'en'], ['hi.3', 'hi'], ['zh-Hans', 'zh'], ['en_GB', 'en'], ['', ''], [null, '']]) {
    assert.equal(baseLanguage(input), out, `baseLanguage(${input})`);
  }
});

test('legacy codes map to current ones', () => {
  assert.equal(baseLanguage('iw'), 'he');
  assert.equal(baseLanguage('in'), 'id');
  assert.equal(baseLanguage('ji'), 'yi');
});

test('every English variant ranks as English', () => {
  for (const code of ['en', 'en-US', 'en-GB', 'en-CA', 'en-IN']) assert.equal(languageRank(code, ['en', 'hi']), 0);
});

test('rank follows the list order and misses are -1', () => {
  assert.equal(languageRank('hi', ['en', 'hi']), 1);
  assert.equal(languageRank('es', ['en', 'hi']), -1);
});
