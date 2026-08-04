import assert from 'node:assert/strict'
import test from 'node:test'
import { redactPassLinks } from './redact'

/**
 * The stub provider prints what it "would send". Session texts now carry the
 * guest's /p/<token> pass link, which is a capability: anyone holding it can
 * open that guest's pass and mint a wallet object with their admission
 * credential.
 *
 * This provider is selected whenever Meta credentials are absent, which is
 * precisely the staging shape where wallet tokens ARE configured and WhatsApp
 * is not live yet, so the unredacted version wrote live capabilities to stdout.
 */

test('a pass link is redacted out of a logged message body', () => {
  const body =
    'Asante! Tumepokea uthibitisho wako.\n\nHii hapa tiketi yako ya kuingia:\n' +
    'https://opuspass.opusfesta.com/p/WMT1:s3cr3t-token-value'

  const redacted = redactPassLinks(body)
  assert.equal(redacted.includes('s3cr3t-token-value'), false)
  assert.equal(redacted.includes('WMT1'), false)
  assert.ok(redacted.includes('https://opuspass.opusfesta.com/p/<redacted>'))
})

test('the rest of the message survives, so the log stays useful', () => {
  const redacted = redactPassLinks('Asante! https://opuspass.opusfesta.com/p/WMT1:abc')
  assert.ok(redacted.startsWith('Asante! '))
})

test('a message with no link is untouched', () => {
  const plain = 'Asante kwa kutujulisha. 💐'
  assert.equal(redactPassLinks(plain), plain)
})

test('several links in one body are all redacted', () => {
  const redacted = redactPassLinks('a /p/AAA b /p/BBB c')
  assert.equal(redacted, 'a /p/<redacted> b /p/<redacted> c')
})

test('redaction keys on the path, not the token format', () => {
  // Matching /p/ rather than the WMT1: prefix means a later change to the token
  // format cannot silently start logging live tokens again.
  assert.equal(redactPassLinks('https://x/p/NEWFORMAT9'), 'https://x/p/<redacted>')
})
