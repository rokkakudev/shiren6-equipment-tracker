'use strict';
// This file runs after the real app initialization, on the isolated test origin.
const testKey = 'shiren6-rack-v1';
let testPassed;
if (testCase === 'legacy') {
  testPassed = state.items[0].blue === '?' && JSON.parse(localStorage.getItem(testKey)).items[0].blue === '?';
} else {
  testPassed = localStorage.getItem(testKey) === testRaw &&
    document.querySelector('#storage-warning').style.display === 'block' && !storageReady &&
    (testCase === 'proto' || window.testFullParseCalls === 0);
}
const summary = document.createElement('p');
summary.id = 'summary';
summary.style.cssText = `position:fixed;z-index:9999;top:0;left:0;background:white;color:${testPassed ? 'green' : 'red'};padding:1em`;
summary.textContent = `${testPassed ? 'PASS' : 'FAIL'}: 起動時 ${testCase}`;
document.body.prepend(summary);
localStorage.removeItem(testKey);
