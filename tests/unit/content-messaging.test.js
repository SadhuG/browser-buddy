const { readFileSync } = require('node:fs');
const path = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('content replies through the callback on browsers that ignore returned promises', async () => {
  let listener;
  const context = {
    URL,
    clearTimeout,
    location: new URL('https://www.youtube.com/watch?v=test'),
    BrowserBuddy: { settings: require('../../lib/settings'), touch: require('../../lib/touch') },
    chrome: {
      storage: { local: { get() {} }, onChanged: { addListener() {} } },
      runtime: { onMessage: { addListener(fn) { listener = fn; } } },
    },
    document: { addEventListener() {}, querySelectorAll: () => [] },
    window: { addEventListener() {} },
    MutationObserver: class { observe() {} },
    setInterval() {},
  };
  runInNewContext(readFileSync(path.join(__dirname, '../../content.js'), 'utf8'), context);
  for (const [type, check] of [
    ['GET_TAB_STATUS', (response) => assert.equal(response.videoId, null)],
    ['AMAZON_CART_STATUS', (response) => assert.equal(response.found, false)],
    ['ONE_VIDEO_PAUSE', (response) => assert.equal(response, true)],
    ['ONE_VIDEO_RESUME', (response) => assert.equal(response, false)],
  ]) {
    let responded = false;
    let response;
    const keepOpen = listener({ type }, {}, (value) => { responded = true; response = value; });
    assert.equal(responded || keepOpen === true, true, type);
    await Promise.resolve();
    assert.equal(responded, true, type);
    check(response);
  }
});
