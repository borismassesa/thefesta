import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findDuplicates,
  guestNameTokens,
  guestPhoneKey,
  normalizeGuestName,
  phoneLooksValid,
  toIdentity,
  worstLevel,
  type GuestIdentity,
} from './guest-duplicates'

// The fixtures are the real Moses Seeta rows that exposed the defect: the list
// mixed 0XXXXXXXXX and 255XXXXXXXXX for the same numbers, and the old guard
// compared raw digits, so it let both through.

function identity(fullName: string, phone: string | null, id: string | null = null): GuestIdentity {
  return toIdentity({ id, full_name: fullName, phone, whatsapp_phone: phone })
}

test('every Tanzanian format of one number normalizes to the same key', () => {
  const expected = '255757200767'
  for (const written of [
    '0757200767',
    '757200767',
    '+255757200767',
    '255 757 200 767',
    '0757-200-767',
    '(0757) 200 767',
  ]) {
    assert.equal(guestPhoneKey(written), expected, `failed for ${written}`)
  }
})

test('the number a send goes to wins: whatsapp_phone over phone', () => {
  assert.equal(guestPhoneKey('0712345678', '0757200767'), '255757200767')
  // Blank whatsapp_phone must fall through rather than normalize to null.
  assert.equal(guestPhoneKey('0757200767', ''), '255757200767')
  assert.equal(guestPhoneKey('0757200767', '   '), '255757200767')
})

test('no digits at all is a genuine missing number, not a comparable value', () => {
  for (const empty of [null, undefined, '', '   ', '-', 'n/a']) {
    assert.equal(guestPhoneKey(empty as string | null), null)
  }
})

test('two records that the OLD raw-digit guard let through now collide', () => {
  // This is the exact defect. '0757200767' and '255757200767' differ as digit
  // strings, so the old guard saw no clash.
  const roster = [identity('Robert Munisi', '0757200767', 'g1')]
  const incoming = identity('Mr & Mrs Lameck', '+255757200767')

  const matches = findDuplicates(incoming, roster)
  assert.equal(worstLevel(matches), 'blocked')
  assert.match(matches[0].reason, /already assigned to Robert Munisi/)
  assert.equal(matches[0].existingId, 'g1')
})

test('the second real conflict blocks too', () => {
  const roster = [identity('Mama Meena', '0766241854', 'g2')]
  const matches = findDuplicates(identity('Mr & Mrs G. Msuya', '0766241854'), roster)
  assert.equal(worstLevel(matches), 'blocked')
})

test('titles do not hide a duplicate name', () => {
  assert.equal(normalizeGuestName('Mr & Mrs G. Msuya'), 'g msuya')
  assert.equal(normalizeGuestName('Mama Meena'), 'meena')
  assert.equal(normalizeGuestName('  ROBERT   MUNISI  '), 'robert munisi')
  assert.equal(normalizeGuestName('Familia Aden'), 'aden')
})

test('a title-only name keeps the title rather than matching every other one', () => {
  // Normalizing "Mama" to '' would make it equal "Bwana" and every other
  // title-only record, blocking unrelated guests.
  assert.equal(normalizeGuestName('Mama'), 'mama')
  assert.notEqual(normalizeGuestName('Mama'), normalizeGuestName('Bi'))
})

test('same name with different numbers is blocked, not merely flagged', () => {
  const roster = [identity('Robert Munisi', '0757200767', 'g1')]
  const matches = findDuplicates(identity('robert munisi', '0788000111'), roster)
  assert.equal(worstLevel(matches), 'blocked')
  assert.match(matches[0].reason, /already on the list/)
})

test('a near-identical name is held for review, never auto-accepted', () => {
  const roster = [identity('Baraka Mwalwega', '0755000111', 'g1')]
  const matches = findDuplicates(identity('Baraka Mwalenga', '0755000222'), roster)
  assert.equal(worstLevel(matches), 'review')
  assert.match(matches[0].reason, /Very similar to Baraka Mwalwega/)
})

test('a short name one edit away is not treated as a typo', () => {
  // "Joel" vs "Joe" are plausibly two people; blocking or holding them would
  // be noise on a 700-row list.
  const roster = [identity('Joel', '0755000111', 'g1')]
  const matches = findDuplicates(identity('Joe', '0755000222'), roster)
  assert.notEqual(worstLevel(matches), 'review')
})

test('one name contained in another is a warning only', () => {
  const roster = [identity('Joel Leo', '0657286868', 'g1')]
  const matches = findDuplicates(identity('Joel', null), roster)
  assert.equal(worstLevel(matches), 'possible')
  assert.match(matches[0].reason, /May be the same guest as Joel Leo/)
})

test('a shared surname with different numbers never blocks', () => {
  const roster = [identity('Gwamaka Mwakugile', '0784833999', 'g1')]
  const matches = findDuplicates(identity('Mama Mwakugile', '0755123456'), roster)
  assert.equal(worstLevel(matches), 'possible')
})

test('a CONFIRMED shared contact stops blocking but stays visible', () => {
  const approved = {
    ...identity('Mama Meena', '0766241854', 'g2'),
    sharedContactGroupId: 'grp-1',
    sharedContactConfirmed: true,
  }
  const incoming = {
    ...identity('Mr & Mrs G. Msuya', '0766241854'),
    sharedContactGroupId: 'grp-1',
    sharedContactConfirmed: true,
  }

  const matches = findDuplicates(incoming, [approved])
  assert.equal(worstLevel(matches), 'possible', 'approved override must not block')
  assert.match(matches[0].reason, /Shares an approved contact number/)
  assert.ok(matches.length > 0, 'an override must never silently remove the warning')
})

test('an override on only one side of the pair still blocks', () => {
  // Approving one record does not license a third guest onto the same number.
  const approved = {
    ...identity('Mama Meena', '0766241854', 'g2'),
    sharedContactGroupId: 'grp-1',
    sharedContactConfirmed: true,
  }
  const matches = findDuplicates(identity('Someone Else', '0766241854'), [approved])
  assert.equal(worstLevel(matches), 'blocked')
})

test('a group parked pending a decision is NOT treated as settled', () => {
  // The live Meena / Msuya pair: recorded as sharing a number so both rows can
  // coexist, but nobody has decided whether that is right. Treating the group
  // id alone as approval would wave through the only unresolved conflict on
  // the system.
  const pending = (name: string, id: string | null) => ({
    ...identity(name, '0766241854', id),
    sharedContactGroupId: 'grp-1',
    sharedContactConfirmed: false,
  })
  const matches = findDuplicates(pending('Mr & Mrs G. Msuya', null), [pending('Mama Meena', 'g2')])
  assert.equal(worstLevel(matches), 'blocked')
})

test('a guest is never reported as a duplicate of itself', () => {
  const self = identity('Robert Munisi', '0757200767', 'g1')
  assert.deepEqual(findDuplicates(self, [self]), [])
})

test('missing numbers do not make guests duplicates of each other', () => {
  // Seven Moses Seeta rows have no phone. They must not all collide on null.
  const roster = [identity('Joel', null, 'g1'), identity('Familia Aden', null, 'g2')]
  const matches = findDuplicates(identity('Tumaini Kimambo', null), roster)
  assert.equal(worstLevel(matches), null)
})

test('all matches are returned, strongest first', () => {
  const roster = [
    identity('Grace Munisi', '0755000111', 'g1'),
    identity('Robert Munisi', '0757200767', 'g2'),
  ]
  // Clashes on number with g2 and shares a surname with g1.
  const matches = findDuplicates(identity('Gwakisa Munisi', '0757200767'), roster)
  assert.equal(matches[0].level, 'blocked')
  assert.ok(matches.length > 1, 'a second, weaker match must still be reported')
})

test('valid Tanzanian mobiles pass, malformed ones do not', () => {
  assert.equal(phoneLooksValid('255757200767'), true)
  assert.equal(phoneLooksValid('255657286868'), true)
  assert.equal(phoneLooksValid('25575720076'), false, 'too short')
  assert.equal(phoneLooksValid('2557572007670'), false, 'too long')
  assert.equal(phoneLooksValid('255157200767'), false, 'not a mobile prefix')
  assert.equal(phoneLooksValid(null), false)
})

test('name tokens support last-name-first search', () => {
  assert.deepEqual(guestNameTokens('Robert Munisi'), ['robert', 'munisi'])
  assert.deepEqual(guestNameTokens('Mr & Mrs Lameck'), ['lameck'])
})
