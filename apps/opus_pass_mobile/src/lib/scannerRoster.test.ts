import assert from 'node:assert/strict';
import test from 'node:test';
import {
  arrivedHeads,
  avatarColorFor,
  clampArrived,
  countLabel,
  expectedHeads,
  groupRoster,
  initialsOf,
  partySizeLabel,
  UNGROUPED_LABEL,
} from './scannerRoster';
import type { RosterEntry } from '../types/checkin';

/**
 * These derivations produce the numbers a door attendant acts on and the couple
 * is billed against, so the arithmetic is worth pinning down: a head miscount
 * is invisible on screen and only surfaces in the catering invoice.
 */

function guest(overrides: Partial<RosterEntry> & { fullName: string }): RosterEntry {
  return {
    invitationId: overrides.fullName,
    entryCode: null,
    passId: null,
    partySize: 1,
    checkedInAt: null,
    checkedInPartySize: null,
    checkedInDoor: null,
    checkedInBy: null,
    groupTag: null,
    isVip: false,
    phone: null,
    table: null,
    ...overrides,
  };
}

test('initials take the first and last word, not the middle', () => {
  assert.equal(initialsOf('Natasha Fernandes'), 'NF');
  assert.equal(initialsOf('Asha Grace Mwakalinga'), 'AM');
  assert.equal(initialsOf('Aryeh'), 'A');
  assert.equal(initialsOf('   '), '?');
});

test('initials skip titles and joining words, not the name itself', () => {
  // The case the avatar exists to tell apart: every married couple on the
  // roster reduced to the same two letters before this.
  assert.equal(initialsOf('Mr & Mrs Boris Massesa'), 'BM');
  assert.equal(initialsOf('Mr and Mrs Boris Massesa'), 'BM');
  assert.equal(initialsOf('Bwana na Bibi Juma Kileo'), 'JK');
  assert.equal(initialsOf('Dr. Asha Mwakalinga'), 'AM');
  assert.equal(initialsOf('The Massesa Family'), 'M');
  // A nickname in brackets initials on its letter, not its punctuation.
  assert.equal(initialsOf('Mary Mary (Mhasibu)'), 'MM');
  // Nothing but titles still beats showing "?" next to a visible name.
  assert.equal(initialsOf('Mr & Mrs'), 'MM');
});

test('avatar colour is stable for a key and varies across keys', () => {
  assert.equal(avatarColorFor('Natasha Fernandes'), avatarColorFor('Natasha Fernandes'));
  const distinct = new Set(
    ["Bride's Family", "Groom's Side", 'Work Friends', 'University'].map(avatarColorFor)
  );
  assert.ok(distinct.size > 1, 'a single-colour palette would defeat the point');
});

test('expected heads counts the party, arrived heads counts only who came', () => {
  const roster = [
    guest({ fullName: 'A', partySize: 4, checkedInAt: '2027-07-18T18:00:00Z', checkedInPartySize: 2 }),
    guest({ fullName: 'B', partySize: 3, checkedInAt: '2027-07-18T18:05:00Z' }),
    guest({ fullName: 'C', partySize: 2 }),
  ];

  assert.equal(expectedHeads(roster), 9);
  // A brought 2 of 4; B was admitted with no correction so the full 3 count;
  // C has not arrived and contributes nothing.
  assert.equal(arrivedHeads(roster), 5);
});

test('untagged guests collect under one heading and sort last', () => {
  const groups = groupRoster([
    guest({ fullName: 'A', groupTag: 'Work Friends' }),
    guest({ fullName: 'B', groupTag: null }),
    guest({ fullName: 'C', groupTag: '  ' }),
    guest({ fullName: 'D', groupTag: "Bride's Family", partySize: 2 }),
    guest({ fullName: 'E', groupTag: "Bride's Family", checkedInAt: '2027-07-18T18:00:00Z' }),
  ]);

  assert.deepEqual(
    groups.map((g) => g.tag),
    ["Bride's Family", 'Work Friends', UNGROUPED_LABEL]
  );
  assert.equal(groups[0].guests.length, 2);
  assert.equal(groups[0].heads, 3);
  assert.equal(groups[0].arrivedCount, 1);
  // Whitespace-only tags are not their own group.
  assert.equal(groups[2].guests.length, 2);
});

test('the head count is dropped when it says nothing beyond the row count', () => {
  assert.equal(countLabel(1, 1), '1 guest');
  assert.equal(countLabel(5, 5), '5 guests');
  assert.equal(countLabel(5, 12), '5 guests · 12 people');
});

test('clampArrived offers exactly the range the server records: 1..party_size', () => {
  // In range passes through untouched — a Double with one arrival.
  assert.equal(clampArrived(1, 2), 1);
  assert.equal(clampArrived(2, 2), 2);
  // Never below one: an admitted guest is at least one person in the room.
  assert.equal(clampArrived(0, 4), 1);
  assert.equal(clampArrived(-3, 4), 1);
  // Never above the invitation — the couple can't be billed past the RSVP.
  assert.equal(clampArrived(9, 6), 6);
  // Fractions truncate rather than round up a head.
  assert.equal(clampArrived(2.9, 6), 2);
  // Degenerate party sizes still yield a recordable count of one.
  assert.equal(clampArrived(3, 0), 1);
  assert.equal(clampArrived(3, -2), 1);
});

test('party badges speak the language the tickets are sold in', () => {
  assert.equal(partySizeLabel(1), 'Single');
  assert.equal(partySizeLabel(2), 'Double');
  // Hand-entered special invitations can exceed a Double; fall back to count.
  assert.equal(partySizeLabel(6), 'Party of 6');
});

test('grouping preserves every row, so no guest becomes unreachable', () => {
  // An invisible guest is one nobody can check in, so this is the property
  // that matters more than any individual count.
  const roster = [
    guest({ fullName: 'Asha Mwakalinga', groupTag: 'Bus A' }),
    guest({ fullName: 'Neema Kileo', groupTag: null }),
    guest({ fullName: 'Tumaini Sanga', groupTag: '   ' }),
    guest({ fullName: 'Zawadi Mrema', groupTag: 'Bus A' }),
    guest({ fullName: 'Baraka Lyimo', groupTag: 'Family' }),
  ];
  const groups = groupRoster(roster);
  const regrouped = groups.flatMap((g) => g.guests);

  assert.equal(regrouped.length, roster.length);
  assert.deepEqual(
    new Set(regrouped.map((g) => g.invitationId)),
    new Set(roster.map((g) => g.invitationId))
  );
  // Heads survive the split too, or a group total would disagree with the bar.
  assert.equal(
    groups.reduce((sum, g) => sum + g.heads, 0),
    expectedHeads(roster)
  );
});

test('arrived and pending partition the roster at every head count', () => {
  const roster = [
    // Full party arrived.
    guest({ fullName: 'Asha Mwakalinga', partySize: 3, checkedInAt: 'now', checkedInPartySize: 3 }),
    // Part of a party arrived — the couple is billed for 2, not 4.
    guest({ fullName: 'Neema Kileo', partySize: 4, checkedInAt: 'now', checkedInPartySize: 2 }),
    // Scanned with no recorded count, so the RSVP'd party stands in.
    guest({ fullName: 'Zawadi Mrema', partySize: 2, checkedInAt: 'now', checkedInPartySize: null }),
    // Never turned up.
    guest({ fullName: 'Baraka Lyimo', partySize: 5 }),
  ];
  const arrived = roster.filter((g) => g.checkedInAt);
  const pending = roster.filter((g) => !g.checkedInAt);

  assert.equal(arrived.length + pending.length, roster.length);
  assert.equal(arrivedHeads(arrived), 3 + 2 + 2);
  // Pending guests contribute nothing to the arrived figure even though the
  // reducer sees the whole roster.
  assert.equal(arrivedHeads(roster), arrivedHeads(arrived));
  assert.equal(expectedHeads(roster), 3 + 4 + 2 + 5);
});

test('an empty roster reads as zero rather than throwing', () => {
  assert.deepEqual(groupRoster([]), []);
  assert.equal(expectedHeads([]), 0);
  assert.equal(arrivedHeads([]), 0);
});
