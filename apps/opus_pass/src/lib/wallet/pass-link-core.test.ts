import assert from 'node:assert/strict'
import test from 'node:test'
import { decidePassLink, passLinkUrl, rsvpConfirmationMessage, samePhone } from './pass-link-core'

/**
 * Unit suite for the pass-link decision.
 *
 *   npx tsx --test src/lib/wallet/pass-link-core.test.ts
 *
 * `/p/<token>` is a CAPABILITY: whoever holds it can view a guest's pass and
 * mint a wallet object carrying their admission credential. Almost every
 * assertion here is about refusing to hand it out when the recipient is not
 * unambiguously the person it belongs to.
 */

const EVENT = '22222222-2222-2222-2222-222222222222'
const INVITATION = '44444444-0000-0000-0000-000000000001'
const GUEST_PHONE = '+255 712 345 678'
const SENDER = '255712345678'

test('a confirmed guest at a known event is offered their pass', () => {
  assert.deepEqual(decidePassLink('attending', EVENT, [INVITATION], GUEST_PHONE, [GUEST_PHONE]), {
    offer: true,
    invitationId: INVITATION,
  })
})

test('a guest who declined is never sent a pass', () => {
  // Sending one would also read as not having registered the decline.
  for (const status of ['declined', 'pending', 'maybe', '']) {
    assert.deepEqual(decidePassLink(status, EVENT, [INVITATION], GUEST_PHONE, [GUEST_PHONE]), {
      offer: false,
      invitationId: null,
    })
  }
})

test('a tap that names no event is refused rather than guessed', () => {
  // Legacy sends carry no event id, and the RSVP update then flips EVERY event
  // the guest is invited to. Picking one would hand them another wedding's
  // pass, which is both wrong and a capability leak across events.
  for (const eventId of [null, undefined, '']) {
    assert.deepEqual(decidePassLink('attending', eventId, [INVITATION], GUEST_PHONE, [GUEST_PHONE]), {
      offer: false,
      invitationId: null,
    })
  }
})

test('an ambiguous match is refused, not resolved by picking the first', () => {
  const several = [INVITATION, '44444444-0000-0000-0000-000000000002']
  assert.deepEqual(decidePassLink('attending', EVENT, several, GUEST_PHONE, [GUEST_PHONE]), {
    offer: false,
    invitationId: null,
  })
})

test('no matching admission means no link', () => {
  assert.deepEqual(decidePassLink('attending', EVENT, [], GUEST_PHONE, [GUEST_PHONE]), { offer: false, invitationId: null })
})

test('a matched row with no id is refused rather than producing /p/undefined', () => {
  assert.deepEqual(decidePassLink('attending', EVENT, [undefined as unknown as string], GUEST_PHONE, [GUEST_PHONE]), {
    offer: false,
    invitationId: null,
  })
})

test('a forwarded invitation does not hand the forwarder the pass', () => {
  // THE ONE THAT MATTERS. The webhook identifies the guest from the
  // public_token in the button payload, then replies to whatever number sent
  // the tap — and nothing upstream requires those to be the same person.
  // Alice forwards her invite; Bob taps "Nitafika". The tap resolves to Alice
  // and the reply goes to Bob. Without this check Bob receives Alice's pass
  // link, opens her pass, saves it to his own wallet and walks in as her.
  assert.deepEqual(
    decidePassLink('attending', EVENT, [INVITATION], '255755999888', [GUEST_PHONE]),
    { offer: false, invitationId: null }
  )
})

test('the number on file is matched across the formats the roster actually holds', () => {
  // Meta returns 255712345678; couples type +255 712 345 678, 0712 345 678, or
  // 0712-345-678. A check that refused those would fire on most of the roster
  // and be quietly disabled, which is worse than not having it.
  for (const onFile of ['+255 712 345 678', '0712 345 678', '0712-345-678', '255712345678']) {
    assert.equal(samePhone(SENDER, onFile), true, `should match ${onFile}`)
  }
})

test('a guest reachable on a second number still gets their pass', () => {
  // guest_contacts carries both phone and whatsapp_phone, and for many guests
  // the WhatsApp number is the second one.
  assert.deepEqual(
    decidePassLink('attending', EVENT, [INVITATION], SENDER, ['0755000111', GUEST_PHONE]),
    { offer: true, invitationId: INVITATION }
  )
})

test('a guest with no number on file matches nobody', () => {
  // Otherwise an empty stored number normalises to '' and compares equal to
  // every sender, turning the check into the opposite of itself.
  for (const stored of [null, undefined, '', '   ', 'n/a']) {
    assert.equal(samePhone(SENDER, stored), false, `should not match ${String(stored)}`)
  }
  assert.deepEqual(decidePassLink('attending', EVENT, [INVITATION], SENDER, [null, null]), {
    offer: false,
    invitationId: null,
  })
})

test('a too-short sender number cannot match by suffix', () => {
  // A partial or malformed sender must not match on a short tail.
  assert.equal(samePhone('5678', GUEST_PHONE), false)
  assert.equal(samePhone('', GUEST_PHONE), false)
})

test('two different numbers sharing a tail shorter than 9 digits do not match', () => {
  assert.equal(samePhone('255712345678', '255799345678'), false)
})

test('the acknowledgement survives a pass link that could not be minted', () => {
  // The whole degradation contract. A guest tapped a button and is owed the
  // confirmation whether or not the keyring is configured, the token minted, or
  // Google reachable. Losing it would make the tap look like it did nothing.
  const withoutLink = rsvpConfirmationMessage('attending', null)
  assert.ok(withoutLink.includes('Asante!'))
  assert.equal(withoutLink.includes('/p/'), false)
})

test('the link is appended to the confirmation, not substituted for it', () => {
  const plain = rsvpConfirmationMessage('attending', null)
  const withLink = rsvpConfirmationMessage('attending', 'https://opuspass.opusfesta.com/p/WMT1:abc')

  assert.ok(withLink.startsWith(plain), 'the acknowledgement must still be there in full')
  assert.ok(withLink.includes('https://opuspass.opusfesta.com/p/WMT1:abc'))
})

test('a decline never carries a link even if one is handed in', () => {
  // Defensive: the caller decides, but a decline message must not be a place a
  // capability can arrive by mistake.
  const message = rsvpConfirmationMessage('declined', 'https://opuspass.opusfesta.com/p/WMT1:abc')
  assert.equal(message.includes('/p/'), false)
})

test('the link is absolute, so it is tappable in a WhatsApp thread', () => {
  assert.equal(
    passLinkUrl('https://opuspass.opusfesta.com', 'WMT1:abc'),
    'https://opuspass.opusfesta.com/p/WMT1:abc'
  )
})

test('a trailing slash on the origin does not produce a double slash', () => {
  // publicOrigin() already strips one, but this function is what builds the
  // URL a guest taps, and //p/ is a 404.
  assert.equal(
    passLinkUrl('https://opuspass.opusfesta.com/', 'WMT1:abc'),
    'https://opuspass.opusfesta.com/p/WMT1:abc'
  )
})
