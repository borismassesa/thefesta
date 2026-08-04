import assert from 'node:assert/strict'
import test from 'node:test'
import { decidePassLink, passLinkUrl, rsvpConfirmationMessage } from './pass-link-core'

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

test('a confirmed guest at a known event is offered their pass', () => {
  assert.deepEqual(decidePassLink('attending', EVENT, [INVITATION]), {
    offer: true,
    invitationId: INVITATION,
  })
})

test('a guest who declined is never sent a pass', () => {
  // Sending one would also read as not having registered the decline.
  for (const status of ['declined', 'pending', 'maybe', '']) {
    assert.deepEqual(decidePassLink(status, EVENT, [INVITATION]), {
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
    assert.deepEqual(decidePassLink('attending', eventId, [INVITATION]), {
      offer: false,
      invitationId: null,
    })
  }
})

test('an ambiguous match is refused, not resolved by picking the first', () => {
  const several = [INVITATION, '44444444-0000-0000-0000-000000000002']
  assert.deepEqual(decidePassLink('attending', EVENT, several), {
    offer: false,
    invitationId: null,
  })
})

test('no matching admission means no link', () => {
  assert.deepEqual(decidePassLink('attending', EVENT, []), { offer: false, invitationId: null })
})

test('a matched row with no id is refused rather than producing /p/undefined', () => {
  assert.deepEqual(decidePassLink('attending', EVENT, [undefined as unknown as string]), {
    offer: false,
    invitationId: null,
  })
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
