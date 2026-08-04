import assert from 'node:assert/strict'
import test from 'node:test'
import { samePhone, shouldAutoSendEntrancePass } from './auto-entrance-pass'

/**
 * The gate on the automatic entrance-pass send.
 *
 * Run with:
 *   npx tsx --test src/lib/whatsapp/auto-entrance-pass.test.ts
 */

const EVENT = '11111111-1111-4111-8111-111111111111'
const GUEST_PHONE = '0712345678'
const SENDER = '255712345678'

test('a guest confirming from their own number is sent their ticket', () => {
  assert.equal(shouldAutoSendEntrancePass('attending', EVENT, SENDER, [GUEST_PHONE]), true)
})

test('a decline never sends a ticket', () => {
  for (const status of ['declined', 'maybe', 'pending', '']) {
    assert.equal(shouldAutoSendEntrancePass(status, EVENT, SENDER, [GUEST_PHONE]), false)
  }
})

test('a tap that cannot be attributed to one event sends nothing', () => {
  // Legacy sends carry no event id, so the RSVP write touched every invitation
  // the guest holds. There is no single admission to draw a ticket for.
  for (const eventId of [null, undefined, '']) {
    assert.equal(shouldAutoSendEntrancePass('attending', eventId, SENDER, [GUEST_PHONE]), false)
  }
})

test('a forwarded invite tapped from another handset sends nothing', () => {
  // THE POINT OF THIS MODULE. WhatsApp forwards templates with their buttons
  // intact, so Bob tapping Alice's invite resolves to Alice. The ticket would
  // still go to Alice, but the send spends one of the couple's paid credits
  // and puts a live check-in QR in a thread nobody asked for it in.
  assert.equal(
    shouldAutoSendEntrancePass('attending', EVENT, '255755999888', [GUEST_PHONE]),
    false
  )
})

test('either number on file counts as the guest', () => {
  // Rosters carry a phone and a separate whatsapp_phone; a guest replying from
  // the second one is still the guest.
  assert.equal(
    shouldAutoSendEntrancePass('attending', EVENT, SENDER, ['0755000111', GUEST_PHONE]),
    true
  )
})

test('a guest with no number on file is never matched', () => {
  assert.equal(shouldAutoSendEntrancePass('attending', EVENT, SENDER, [null, null]), false)
})

test('the same number in three roster formats all match one Meta sender', () => {
  for (const onFile of ['0712345678', '+255 712 345 678', '255712345678']) {
    assert.equal(samePhone(SENDER, onFile), true, onFile)
  }
})

test('a too-short sender number cannot match by suffix', () => {
  assert.equal(samePhone('5678', GUEST_PHONE), false)
  assert.equal(samePhone('', GUEST_PHONE), false)
  assert.equal(samePhone(null, GUEST_PHONE), false)
})

test('two different numbers sharing a tail shorter than 9 digits do not match', () => {
  assert.equal(samePhone('255712345678', '255799345678'), false)
})
