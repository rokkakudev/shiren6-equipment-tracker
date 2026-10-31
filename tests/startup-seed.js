'use strict';
// This file runs only in the disposable test server, before app.js.
const testCase = new URLSearchParams(location.search).get('case');
const testValid = '{"version":1,"items":[{"type":"weapon","name":"木刀","normal":true,"blue":2,"gold":8}]}';
const testInputs = {
  deep: '['.repeat(5) + ']'.repeat(5),
  wide: '[' + '0,'.repeat(4100) + '0]',
  proto: testValid.replace('"version":1', '"version":1,"\\u005f_proto__":{"polluted":true}'),
  legacy: testValid
};
const testRaw = testInputs[testCase];
if (typeof testRaw !== 'string') throw Error('Unknown startup test case');
localStorage.setItem('shiren6-rack-v1', testRaw);

// Detect attempts to pass the complete resource-heavy input to native JSON.parse.
if (testCase === 'deep' || testCase === 'wide') {
  window.testFullParseCalls = 0;
  const nativeParse = JSON.parse;
  JSON.parse = function (text, ...args) {
    if (text === testRaw) window.testFullParseCalls++;
    return nativeParse.call(this, text, ...args);
  };
}
