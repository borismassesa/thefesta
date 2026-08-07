import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldPromptForParty } from './partyPrompt';

/**
 * The case that mattered: a Double could not be admitted by scan at all. The
 * sheet asked how many arrived, and answering re-opened it, because the rule
 * that opened it was still true after it closed.
 */

const SCAN = { status: 'success', partySize: 2, scanRequestId: 'req-1', promptedRequestId: null };

test('a scanned party of more than one is asked about', () => {
  assert.equal(shouldPromptForParty(SCAN), true);
});

test('answering ends the question for that scan', () => {
  // The sheet closing does not change the scan result, so without keying on
  // the scan this returns true forever and the door is stuck.
  assert.equal(shouldPromptForParty({ ...SCAN, promptedRequestId: 'req-1' }), false);
});

test('the next scan is asked again', () => {
  assert.equal(shouldPromptForParty({ ...SCAN, scanRequestId: 'req-2', promptedRequestId: 'req-1' }), true);
});

test('a Single is never asked', () => {
  assert.equal(shouldPromptForParty({ ...SCAN, partySize: 1 }), false);
  assert.equal(shouldPromptForParty({ ...SCAN, partySize: null }), false);
});

test('only a successful admission is asked about', () => {
  for (const status of ['duplicate', 'invalid', 'error', null]) {
    assert.equal(shouldPromptForParty({ ...SCAN, status }), false, `status ${status}`);
  }
});

test('a manual admission is not asked, having already counted heads', () => {
  assert.equal(shouldPromptForParty({ ...SCAN, scanRequestId: null }), false);
});
