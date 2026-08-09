import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { test } from 'node:test'
import { parseAdmissionCredential } from '@/lib/checkin/credential-core'
import { buildGoogleSaveLink, googleClassId, googleObjectId } from './google-core'
import { PROOF_CREDENTIAL_ID, PROOF_EVENT_ID, PROOF_INVITATION_ID, proofPassModel } from './redirect-proof'
import { validatePassModel } from './types'

const ISSUER_ID = '3388000000023183279'

function testConfig() {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  return {
    issuerId: ISSUER_ID,
    serviceAccountEmail: 'opuspass-wallet-issuer@opusfesta-498919.iam.gserviceaccount.com',
    privateKey,
    origin: 'https://opuspass.opusfesta.com',
    assetOrigin: 'https://opuspass.opusfesta.com',
  }
}

test('the proof model is one Google would accept', () => {
  assert.equal(validatePassModel(proofPassModel()), null)
})

test('the proof credential is a syntactically valid OP1 credential', () => {
  // buildGoogleSaveLink refuses a model whose credential the DOOR's parser
  // rejects, so a proof pass that cannot be built would fail for a reason
  // unrelated to the thing being proved.
  const parsed = parseAdmissionCredential(proofPassModel().credential)
  assert.equal(parsed?.kind, 'opaque_v1')
})

test('the proof credential announces itself as fake to anyone who scans it', () => {
  // The whole safety argument for putting this string in a QR that will exist
  // indefinitely. If someone later renames it to something random-looking, a
  // stray test pass becomes indistinguishable from a live admission at a glance.
  assert.match(proofPassModel().credential, /proof-only-not-a-real/)
})

test('the proof pass carries no venue, date or Pass ID', () => {
  // Nothing to keep in sync with a real event, and nothing that reads as a
  // genuine admission if the object is ever seen out of context.
  const model = proofPassModel()
  assert.equal(model.venueName, null)
  assert.equal(model.startsAt, null)
  assert.equal(model.passId, null)
})

test('the script and the route derive the same object', () => {
  // THE invariant of milestone 1. The provisioning script creates an object at
  // Google; the route signs a link that references it by id. Google returns no
  // id, both sides derive it, and a mismatch would produce a save link pointing
  // at nothing — a failed proof that says nothing about WhatsApp.
  const model = proofPassModel()
  const first = googleObjectId(ISSUER_ID, model.invitationId, model.credentialId)
  const second = googleObjectId(ISSUER_ID, PROOF_INVITATION_ID, PROOF_CREDENTIAL_ID)
  assert.equal(first, second)
  assert.equal(googleClassId(ISSUER_ID, model.eventId), googleClassId(ISSUER_ID, PROOF_EVENT_ID))
})

test('the proof ids cannot collide with a real admission', () => {
  // Real invitations and events are UUIDs. These are words, so no live guest
  // can ever derive the same object.
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  assert.equal(uuid.test(PROOF_INVITATION_ID), false)
  assert.equal(uuid.test(PROOF_EVENT_ID), false)
})

test('the save link stays well inside what a URL can carry', () => {
  // The reason the object is pre-created rather than defined inline. An inline
  // definition measured 2,111 characters against Google's ~1,800 guidance; a
  // reference is flat in pass size. If this ever grows past a few hundred
  // characters, something has started travelling in the link that should not.
  const link = buildGoogleSaveLink(testConfig(), proofPassModel())
  assert.ok(link.saveUrl.startsWith('https://pay.google.com/gp/v/save/'))
  assert.ok(link.saveUrl.length < 1200, `save url was ${link.saveUrl.length} chars`)
})

test('the save link references the object and never carries the credential', () => {
  // base64url is not encryption. If the credential is anywhere in this URL it
  // is in the guest's browser history and synced across their profile.
  const link = buildGoogleSaveLink(testConfig(), proofPassModel())
  const jwt = link.saveUrl.slice('https://pay.google.com/gp/v/save/'.length)
  const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())
  assert.deepEqual(payload.payload.eventTicketObjects, [{ id: link.objectId }])
  assert.equal(link.saveUrl.includes('proof-only'), false)
})
