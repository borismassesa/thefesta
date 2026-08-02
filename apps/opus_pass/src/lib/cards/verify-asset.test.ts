import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FakePreparationClient } from './fake-preparation-client'
import {
  downgradeMissingObject,
  resolveAssetByTokenHash,
  verifyPreparedGuestAsset,
} from './verify-asset'
import { deriveAssetToken, hashAssetToken, tokenFromSegment } from './asset-tokens'

process.env.CARD_ASSET_TOKEN_SECRET_CURRENT ??= 'current-test-secret'
process.env.CARD_ASSET_TOKEN_SECRET_PREVIOUS ??= 'previous-test-secret'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const PATH = 'release-1/guest-1/whatsapp_header_v1.png'

function makeClient(row: Record<string, unknown>, withObject = true): FakePreparationClient {
  const client = new FakePreparationClient({ invitation_card_delivery_assets: [row] })
  if (withObject) client.put('card-guest-assets', PATH, PNG)
  return client
}

const readyRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'asset-1',
  design_release_id: 'release-1',
  guest_id: 'guest-1',
  render_variant: 'whatsapp_header_v1',
  token_hash: 'hash-1',
  status: 'ready',
  png_storage_path: PATH,
  revoked_at: null,
  expires_at: null,
  render_error_code: null,
  claimed_at: new Date().toISOString(),
  attempt_count: 1,
  ...overrides,
})

const as = (c: FakePreparationClient) => c as unknown as SupabaseClient

test('a ready asset with its object present is servable', async () => {
  const client = makeClient(readyRow())

  const result = await resolveAssetByTokenHash(as(client), 'hash-1')

  assert.equal(result.presence, 'ready_and_present')
  assert.ok(result.bytes)
  assert.equal(result.pngStoragePath, PATH)
})

test('every invalid state reports not_ready, so the route can flatten them', async () => {
  for (const overrides of [
    { status: 'pending' },
    { status: 'failed' },
    { png_storage_path: null },
    { revoked_at: new Date().toISOString() },
    { expires_at: new Date(Date.now() - 1000).toISOString() },
  ]) {
    const client = makeClient(readyRow(overrides))
    const result = await resolveAssetByTokenHash(as(client), 'hash-1')
    assert.equal(result.presence, 'not_ready', `expected not_ready for ${JSON.stringify(overrides)}`)
    assert.equal(result.bytes, null)
  }
})

test('an unknown token is not_ready and identifies nothing', async () => {
  const client = makeClient(readyRow())

  const result = await resolveAssetByTokenHash(as(client), 'no-such-hash')

  assert.equal(result.presence, 'not_ready')
  assert.equal(result.assetId, null)
  assert.equal(result.designReleaseId, null)
})

test('a missing object is object_missing, not storage_unavailable', async () => {
  const client = makeClient(readyRow(), false)

  const result = await resolveAssetByTokenHash(as(client), 'hash-1')

  assert.equal(result.presence, 'object_missing')
  assert.equal(result.assetId, 'asset-1')
})

test('an ambiguous storage failure is never read as a missing object', async () => {
  // The distinction that stops a provider blip demoting a good card mid-send.
  const client = makeClient(readyRow())
  client.storage = {
    from: () => ({
      download: async () => ({ data: null, error: { status: 503, message: 'upstream timeout' } }),
      upload: async () => ({ data: null, error: null }),
    }),
  } as unknown as FakePreparationClient['storage']

  const result = await resolveAssetByTokenHash(as(client), 'hash-1')

  assert.equal(result.presence, 'storage_unavailable')
})

test('downgrade happens exactly once under concurrent requests', async () => {
  const client = makeClient(readyRow(), false)

  const [a, b] = await Promise.all([
    downgradeMissingObject(as(client), 'asset-1', PATH),
    downgradeMissingObject(as(client), 'asset-1', PATH),
  ])

  assert.equal([a, b].filter(Boolean).length, 1, 'exactly one caller may downgrade')
  const row = client.asset()
  assert.equal(row?.status, 'failed')
  assert.equal(row?.render_error_code, 'STORAGE_OBJECT_MISSING')
  assert.equal(row?.png_storage_path, null)
})

test('a downgrade cannot clobber a repair that already happened', async () => {
  // The stale-request case: another worker rebuilt the asset at a new path
  // between our failed download and our update. Conditioning on the path we
  // observed means our downgrade matches nothing.
  const client = makeClient(readyRow({ png_storage_path: 'release-1/guest-1/rebuilt.png' }))

  const didDowngrade = await downgradeMissingObject(as(client), 'asset-1', PATH)

  assert.equal(didDowngrade, false)
  assert.equal(client.asset()?.status, 'ready', 'the repair survives')
})

test('verifyPreparedGuestAsset answers by asset id for the send preflight', async () => {
  const present = makeClient(readyRow())
  assert.equal((await verifyPreparedGuestAsset(as(present), 'asset-1')).presence, 'ready_and_present')

  const gone = makeClient(readyRow(), false)
  assert.equal((await verifyPreparedGuestAsset(as(gone), 'asset-1')).presence, 'object_missing')

  const pending = makeClient(readyRow({ status: 'pending' }))
  assert.equal((await verifyPreparedGuestAsset(as(pending), 'asset-1')).presence, 'not_ready')

  const unknown = makeClient(readyRow())
  assert.equal((await verifyPreparedGuestAsset(as(unknown), 'nope')).presence, 'not_ready')
})

// ── Tokens ────────────────────────────────────────────────────────────────

test('lookup is rotation-agnostic: a token minted under either secret resolves', async () => {
  // What is stored is the hash of the token that was minted, and the guest
  // presents that same string, so the lookup does not care which key signed it.
  const subject = { designReleaseId: 'release-1', guestId: 'guest-1', renderVariant: 'whatsapp_header_v1' }

  const current = deriveAssetToken(subject) as string
  const client = makeClient(readyRow({ token_hash: hashAssetToken(current) }))
  assert.equal((await resolveAssetByTokenHash(as(client), hashAssetToken(current))).presence, 'ready_and_present')

  // An asset minted before rotation keeps working, because its stored hash is
  // still the hash of the token in the guest's message.
  const legacyToken = 'a-token-minted-under-the-old-key'
  const legacy = makeClient(readyRow({ token_hash: hashAssetToken(legacyToken) }))
  assert.equal((await resolveAssetByTokenHash(as(legacy), hashAssetToken(legacyToken))).presence, 'ready_and_present')
})

test('minting always uses the current secret, never the previous one', () => {
  const subject = { designReleaseId: 'r', guestId: 'g', renderVariant: 'v' }
  const minted = deriveAssetToken(subject)

  const saved = process.env.CARD_ASSET_TOKEN_SECRET_CURRENT
  process.env.CARD_ASSET_TOKEN_SECRET_CURRENT = 'a-different-current'
  const afterRotation = deriveAssetToken(subject)
  process.env.CARD_ASSET_TOKEN_SECRET_CURRENT = saved

  assert.notEqual(minted, afterRotation, 'rotating current changes what new assets mint')
})

test('the url extension is stripped before hashing', () => {
  assert.equal(tokenFromSegment('abc.png'), 'abc')
  assert.equal(tokenFromSegment('abc'), 'abc')
  // A token that merely contains the substring must not be truncated.
  assert.equal(tokenFromSegment('a.pngb'), 'a.pngb')
})
