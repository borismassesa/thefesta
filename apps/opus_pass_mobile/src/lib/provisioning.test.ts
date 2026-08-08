import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideOutcome } from './provisioning-outcome';

describe('decideOutcome', () => {
  it('reports an existing row without claiming credit for it', () => {
    assert.equal(decideOutcome({ hadRowBefore: true, httpOk: true, rowAfter: 'uuid' }), 'already-provisioned');
  });

  it('treats a created row as success', () => {
    assert.equal(decideOutcome({ hadRowBefore: false, httpOk: true, rowAfter: 'uuid' }), 'provisioned');
  });

  it('trusts the row over the status code', () => {
    // The edge function answers non-2xx when it can't write Clerk metadata,
    // and the response can be lost outright on a flaky connection — while the
    // users row it was asked to create exists and works. The row decides.
    assert.equal(decideOutcome({ hadRowBefore: false, httpOk: false, rowAfter: 'uuid' }), 'provisioned');
  });

  it('reports unresolved when no row appeared', () => {
    assert.equal(decideOutcome({ hadRowBefore: false, httpOk: false, rowAfter: null }), 'unresolved');
  });

  it('reports unresolved even when the call claimed success', () => {
    assert.equal(decideOutcome({ hadRowBefore: false, httpOk: true, rowAfter: null }), 'unresolved');
  });
});
