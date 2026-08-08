import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { displayNameFor, splitFullName } from './names';

describe('splitFullName', () => {
  it('rejects an empty or whitespace-only name', () => {
    assert.equal(splitFullName(''), null);
    assert.equal(splitFullName('   '), null);
  });

  it('rejects a single token, because Clerk requires a last name', () => {
    assert.equal(splitFullName('Ada'), null);
    assert.equal(splitFullName('  Ada  '), null);
  });

  it('splits a two-part name', () => {
    assert.deepEqual(splitFullName('Ada Lovelace'), { firstName: 'Ada', lastName: 'Lovelace' });
  });

  it('keeps every extra token in the last name', () => {
    assert.deepEqual(splitFullName('Ada King Lovelace'), { firstName: 'Ada', lastName: 'King Lovelace' });
  });

  it('collapses irregular whitespace', () => {
    assert.deepEqual(splitFullName('  Ada   King  Lovelace '), {
      firstName: 'Ada',
      lastName: 'King Lovelace',
    });
  });
});

describe('displayNameFor', () => {
  it('prefers the full name', () => {
    assert.equal(displayNameFor({ fullName: 'Ada Lovelace', firstName: 'Ada', email: 'ada@x.com' }), 'Ada Lovelace');
  });

  it('falls back to the first name', () => {
    assert.equal(displayNameFor({ fullName: null, firstName: 'Ada', email: 'ada@x.com' }), 'Ada');
  });

  it('falls back to the email local-part, tidied up', () => {
    // Apple withholds the name on every authorisation after the first, so this
    // branch is the normal case there, not an edge case.
    assert.equal(displayNameFor({ email: 'ada.lovelace@example.com' }), 'Ada lovelace');
    assert.equal(displayNameFor({ email: 'ada_king@example.com' }), 'Ada king');
  });

  it('ignores whitespace-only values', () => {
    assert.equal(displayNameFor({ fullName: '  ', firstName: ' ', email: 'ada@x.com' }), 'Ada');
  });

  it('falls back to a generic label when nothing is known', () => {
    assert.equal(displayNameFor({}), 'Partner 1');
    assert.equal(displayNameFor({ fullName: null, firstName: null, email: null }), 'Partner 1');
  });
});
