import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createHmac } from 'node:crypto'
import { FakePreparationClient } from './fake-preparation-client'
import {
  assetStoragePath,
  deriveTokenForTest,
  prepareGuestCardAsset,
  type PreparationClient,
} from './prepare-guest-asset'

// Gating tests for the preparation service.
//
// The font is Dancing Script, already committed under the OFL. The frozen
// release is a synthetic card in the shape a real one takes, with a guest layer
// carrying the neutral placeholder that a real release now carries.
//
// KNOWN GAP: none of these can prove the card came out in the RIGHT typeface,
// only that it came out. Proving that needs two visually distinct redistributable
// faces and the repository holds one. See docs/CARD_GUEST_DELIVERY_PLAN.md.

process.env.CARD_ASSET_TOKEN_SECRET ??= 'test-secret-not-a-real-one'

const FONT_BYTES = new Uint8Array(
  readFileSync(path.join(process.cwd(), 'public/fonts/DancingScript-Regular.ttf')),
)

const RELEASE_ID = 'release-1'
const GUEST_ID = 'guest-1'
const VARIANT = 'whatsapp_header_v1'
const SVG_PATH = 'design-1/1785615674060.svg'

const PLACEHOLDER = 'Jina la Mgeni'

/** A frozen release: couple values written in, guest layer left replaceable. */
const FROZEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#ffffff"/>
  <g id="Familia_ya"><text x="40" y="70" font-size="26" font-family="DancingScript-Regular, Dancing Script">Familia ya</text></g>
  <g id="guest_layer"><text x="40" y="150" font-size="34" font-family="DancingScript-Regular, Dancing Script">${PLACEHOLDER}</text></g>
  <g id="couple_name_1"><text x="40" y="250" font-size="40" font-family="DancingScript-Regular, Dancing Script">Samuel Hawassi</text></g>
</svg>`

const FONT_ROW = {
  id: 'face-1',
  storage_path: 'fonts/dancing.ttf',
  format: 'ttf',
  family_name: 'Dancing Script',
  subfamily_name: 'Regular',
  postscript_name: 'DancingScript-Regular',
  weight_class: 400,
  is_italic: false,
  match_keys: ['dancingscriptregular', 'dancingscript'],
  embeddable: true,
  fs_type_no_embedding: false,
}

type Overrides = {
  guestName?: string | null
  bindings?: unknown
  fontRow?: Partial<typeof FONT_ROW>
  releases?: Record<string, unknown>[]
  svg?: string
  omitFontBytes?: boolean
}

function makeClient(overrides: Overrides = {}): FakePreparationClient {
  const client = new FakePreparationClient({
    invitation_card_design_releases: overrides.releases ?? [
      { id: RELEASE_ID, design_id: 'design-1', svg_storage_path: SVG_PATH, superseded_at: null },
    ],
    guest_contacts: [
      {
        id: GUEST_ID,
        full_name: overrides.guestName === undefined ? 'Bw. Juma Ally' : overrides.guestName,
      },
      { id: 'guest-2', full_name: 'Bi. Neema Said' },
    ],
    invitation_card_designs: [{ id: 'design-1', product_id: 'product-1' }],
    website_invitations_products: [
      {
        id: 'product-1',
        field_bindings:
          overrides.bindings ?? [{ role: 'guest_name', layerIds: ['guest_layer'] }],
      },
    ],
    card_fonts: [{ ...FONT_ROW, ...overrides.fontRow }],
  })

  client.put('card-releases', SVG_PATH, overrides.svg ?? FROZEN_SVG)
  if (!overrides.omitFontBytes) {
    client.put('card-fonts', (overrides.fontRow?.storage_path ?? FONT_ROW.storage_path) as string, FONT_BYTES)
  }
  return client
}

const run = (client: FakePreparationClient, guestId = GUEST_ID) =>
  prepareGuestCardAsset(
    { designReleaseId: RELEASE_ID, guestId, renderVariant: VARIANT },
    client as unknown as PreparationClient,
  )

test('successful preparation creates one row and one png', async () => {
  const client = makeClient()

  const result = await run(client)

  assert.equal(result.ok, true, result.ok ? '' : `failed: ${result.code}`)
  if (!result.ok) return
  assert.equal(result.status, 'created')
  assert.equal(result.pngStoragePath, `${RELEASE_ID}/${GUEST_ID}/${VARIANT}.png`)
  assert.equal(client.assets().length, 1)
  assert.equal(client.uploadCount, 1)
  assert.equal(client.asset()?.status, 'ready')
  assert.equal(client.asset()?.png_storage_path, result.pngStoragePath)
})

test('a retry after success is reused and writes nothing', async () => {
  const client = makeClient()
  const first = await run(client)

  const second = await run(client)

  assert.equal(second.ok, true)
  if (!second.ok || !first.ok) return
  assert.equal(second.status, 'reused')
  assert.equal(second.assetId, first.assetId)
  // The whole point of the idempotency key: no second PNG, no second row.
  assert.equal(client.uploadCount, 1)
  assert.equal(client.assets().length, 1)
})

test('two concurrent claims produce one render', async () => {
  const client = makeClient()

  const [a, b] = await Promise.all([run(client), run(client)])

  assert.equal(client.assets().length, 1)
  // Exactly one render happened even though both callers arrived together.
  assert.equal(client.uploadCount, 1)
  const outcomes = [a, b].map((r) => (r.ok ? r.status : r.code)).sort()
  // The loser either waited and saw the finished asset, or was told to retry.
  assert.ok(
    outcomes.includes('created'),
    `expected one winner, got ${JSON.stringify(outcomes)}`,
  )
  assert.ok(
    outcomes.includes('reused') || outcomes.includes('PREPARATION_IN_PROGRESS'),
    `expected one loser, got ${JSON.stringify(outcomes)}`,
  )
})

test('a new release produces a different asset', async () => {
  const client = makeClient({
    releases: [
      { id: RELEASE_ID, design_id: 'design-1', svg_storage_path: SVG_PATH, superseded_at: null },
      { id: 'release-2', design_id: 'design-1', svg_storage_path: SVG_PATH, superseded_at: null },
    ],
  })

  const first = await run(client)
  const second = await prepareGuestCardAsset(
    { designReleaseId: 'release-2', guestId: GUEST_ID, renderVariant: VARIANT },
    client as unknown as PreparationClient,
  )

  assert.equal(first.ok && second.ok, true)
  if (!first.ok || !second.ok) return
  assert.notEqual(first.assetId, second.assetId)
  // Distinct paths, so the artefact already sent is never overwritten.
  assert.notEqual(first.pngStoragePath, second.pngStoragePath)
  assert.equal(client.assets().length, 2)
})

test('two guests get different png bytes', async () => {
  const client = makeClient()

  await run(client, GUEST_ID)
  await run(client, 'guest-2')

  const bucket = client.buckets['card-guest-assets']
  const paths = Object.keys(bucket)
  assert.equal(paths.length, 2)
  const [one, two] = paths.map((p) => Buffer.from(bucket[p]).toString('base64'))
  assert.notEqual(one, two)
})

test('a missing guest name fails before anything is claimed or rendered', async () => {
  const client = makeClient({ guestName: '   ' })

  const result = await run(client)

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'GUEST_NAME_MISSING')
  // Nothing claimed, nothing uploaded: the refusal is before the work.
  assert.equal(client.assets().length, 0)
  assert.equal(client.uploadCount, 0)
})

test('an unmapped guest role writes no png and records the reason', async () => {
  const client = makeClient({ bindings: [{ role: 'couple_name_1', layerIds: ['couple_name_1'] }] })

  const result = await run(client)

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'GUEST_ROLE_UNMAPPED')
  assert.equal(client.uploadCount, 0)
  assert.equal(client.asset()?.status, 'failed')
  assert.equal(client.asset()?.render_error_code, 'GUEST_ROLE_UNMAPPED')
})

test('a rasterised guest layer is refused rather than left as the placeholder', async () => {
  const client = makeClient({
    bindings: [{ role: 'guest_name', layerIds: ['guest_layer'], rasterised: true }],
  })

  const result = await run(client)

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'GUEST_ROLE_UNMAPPED')
  assert.equal(client.uploadCount, 0)
})

test('an unresolved font writes no png', async () => {
  // The library holds a face that answers nothing the artwork asks for.
  const client = makeClient({
    fontRow: {
      family_name: 'Some Other Family',
      postscript_name: 'SomeOther-Regular',
      match_keys: ['someotherregular'],
    },
  })

  const result = await run(client)

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'FONT_UNRESOLVED')
  assert.equal(client.uploadCount, 0)
  assert.equal(client.asset()?.render_error_code, 'FONT_UNRESOLVED')
})

test('a woff face writes no png', async () => {
  const client = makeClient({ fontRow: { format: 'woff' } })

  const result = await run(client)

  assert.equal(result.ok, false)
  if (result.ok) return
  // Measured: resvg renders woff blank, so this must never reach the rasteriser.
  assert.equal(result.code, 'FONT_FORMAT_UNSUPPORTED')
  assert.equal(client.uploadCount, 0)
})

test('an uncleared licence writes no png', async () => {
  const client = makeClient({ fontRow: { embeddable: false } })

  const result = await run(client)

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'FONT_NOT_LICENSED')
  assert.equal(client.uploadCount, 0)
})

test('unreachable font bytes fail without a partial render', async () => {
  const client = makeClient({ omitFontBytes: true })

  const result = await run(client)

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'FONT_DOWNLOAD_FAILED')
  assert.equal(client.uploadCount, 0)
})

test('a storage failure leaves a recoverable failed state, never ready', async () => {
  const client = makeClient()
  client.failUploadOnce = true

  const result = await run(client)

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'STORAGE_WRITE_FAILED')
  const asset = client.asset()
  assert.equal(asset?.status, 'failed')
  // Never ready without an object behind it, which is why the upload precedes
  // the status change.
  assert.notEqual(asset?.status, 'ready')
  assert.equal(asset?.png_storage_path ?? null, null)
})

test('a missing frozen svg fails and is recorded', async () => {
  const client = makeClient()
  delete client.buckets['card-releases'][SVG_PATH]

  const result = await run(client)

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'RELEASE_SVG_MISSING')
  assert.equal(client.uploadCount, 0)
})

test('an unknown release or guest is refused before any row exists', async () => {
  const missingRelease = await prepareGuestCardAsset(
    { designReleaseId: 'nope', guestId: GUEST_ID, renderVariant: VARIANT },
    makeClient() as unknown as PreparationClient,
  )
  assert.equal(missingRelease.ok, false)
  if (!missingRelease.ok) assert.equal(missingRelease.code, 'RELEASE_NOT_FOUND')

  const client = makeClient()
  const missingGuest = await run(client, 'no-such-guest')
  assert.equal(missingGuest.ok, false)
  if (!missingGuest.ok) assert.equal(missingGuest.code, 'GUEST_NOT_FOUND')
  assert.equal(client.assets().length, 0)
})

test('a stale pending claim is reclaimed and completed', async () => {
  const client = makeClient()
  // A worker that died mid-render: pending, with an expired lease.
  client.tables['invitation_card_delivery_assets'] = [
    {
      id: 'stranded',
      design_release_id: RELEASE_ID,
      guest_id: GUEST_ID,
      render_variant: VARIANT,
      token_hash: 'whatever',
      status: 'pending',
      png_storage_path: null,
      render_error_code: null,
      claimed_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      attempt_count: 1,
    },
  ]

  const result = await run(client)

  assert.equal(result.ok, true, result.ok ? '' : `failed: ${result.code}`)
  if (!result.ok) return
  assert.equal(result.assetId, 'stranded')
  assert.equal(client.assets().length, 1)
  assert.equal(client.asset()?.status, 'ready')
  assert.equal(client.uploadCount, 1)
})

test('a fresh pending claim is left alone', async () => {
  const client = makeClient()
  client.tables['invitation_card_delivery_assets'] = [
    {
      id: 'in-flight',
      design_release_id: RELEASE_ID,
      guest_id: GUEST_ID,
      render_variant: VARIANT,
      token_hash: 'whatever',
      status: 'pending',
      png_storage_path: null,
      render_error_code: null,
      claimed_at: new Date().toISOString(),
      attempt_count: 1,
    },
  ]

  const result = await run(client)

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'PREPARATION_IN_PROGRESS')
  // Somebody else is rendering it; we must not render a second copy.
  assert.equal(client.uploadCount, 0)
})

test('a recorded failure is reported again rather than re-rendered', async () => {
  const client = makeClient()
  client.tables['invitation_card_delivery_assets'] = [
    {
      id: 'already-failed',
      design_release_id: RELEASE_ID,
      guest_id: GUEST_ID,
      render_variant: VARIANT,
      token_hash: 'whatever',
      status: 'failed',
      png_storage_path: null,
      render_error_code: 'FONT_UNRESOLVED',
      claimed_at: new Date().toISOString(),
      attempt_count: 1,
    },
  ]

  const result = await run(client)

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'FONT_UNRESOLVED')
  assert.equal(client.uploadCount, 0)
})

test('a surviving placeholder blocks the asset', async () => {
  // Two guest-placeholder layers, only one of them bound. The bound one is
  // written and the other keeps the neutral placeholder, so the card would go
  // out addressed to the guest in one place and to nobody in another. The
  // renderer reports success for the layer it did write, which is exactly why
  // the placeholder check exists on top of the applied/skipped metadata.
  const twoLayers = FROZEN_SVG.replace(
    '</svg>',
    `<g id="second_guest_layer"><text x="40" y="340" font-size="20" font-family="DancingScript-Regular, Dancing Script">${PLACEHOLDER}</text></g></svg>`,
  )
  const client = makeClient({ svg: twoLayers })

  const result = await run(client)

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'GUEST_ROLE_UNMAPPED')
  assert.equal(client.uploadCount, 0)
  assert.equal(client.asset()?.status, 'failed')
})

// That only guest-scoped roles are substituted at all is pinned where the
// substitution happens, in packages/lib/card-render.test.ts: the delivery path
// hands renderCardForGuest the frozen release and a guest name, never the
// couple's field values, so there is nothing here that could reach them.

test('the storage path carries no guest name, token or mutable data', () => {
  const path = assetStoragePath({
    designReleaseId: RELEASE_ID,
    guestId: GUEST_ID,
    renderVariant: VARIANT,
  })

  assert.equal(path, `${RELEASE_ID}/${GUEST_ID}/${VARIANT}.png`)
  assert.doesNotMatch(path, /Juma|Ally|Neema/)
})

test('persisted failure codes are stable identifiers, never provider text', async () => {
  const client = makeClient({ fontRow: { format: 'woff2' } })

  await run(client)

  const stored = String(client.asset()?.render_error_code ?? '')
  // Screams if somebody later stores a message: codes are SHOUT_CASE only.
  assert.match(stored, /^[A-Z_]+$/)
  assert.doesNotMatch(stored, /https?:|\/|\s/)
})

test('two simultaneous reclaimers of a stale lease produce one render', async () => {
  // The case a status-only predicate would get wrong: both workers read the same
  // stale row and both believe they may take it. Compare-and-swap on the observed
  // claimed_at means only the first write succeeds.
  const client = makeClient()
  const stale = new Date(Date.now() - 10 * 60_000).toISOString()
  client.tables['invitation_card_delivery_assets'] = [
    {
      id: 'stranded', design_release_id: RELEASE_ID, guest_id: GUEST_ID,
      render_variant: VARIANT, token_hash: 'whatever', status: 'pending',
      png_storage_path: null, render_error_code: null, claimed_at: stale, attempt_count: 1,
    },
  ]

  const [a, b] = await Promise.all([run(client), run(client)])

  assert.equal(client.assets().length, 1)
  assert.equal(client.uploadCount, 1, 'exactly one reclaimer may render')
  const outcomes = [a, b].map((r) => (r.ok ? r.status : r.code))
  assert.ok(outcomes.includes('created'), `expected one winner, got ${JSON.stringify(outcomes)}`)
  assert.equal(client.asset()?.status, 'ready')
})

test('a transient failure is retried rather than remembered forever', async () => {
  // A storage blip must not strand a guest's invitation. The first attempt fails
  // on upload; the second retakes the asset and completes it.
  const client = makeClient()
  client.failUploadOnce = true

  const first = await run(client)
  assert.equal(first.ok, false)
  if (!first.ok) assert.equal(first.code, 'STORAGE_WRITE_FAILED')
  assert.equal(client.asset()?.status, 'failed')

  const second = await run(client)

  assert.equal(second.ok, true, second.ok ? '' : `still failing: ${second.code}`)
  if (!second.ok) return
  assert.equal(second.status, 'created')
  assert.equal(client.asset()?.status, 'ready')
  assert.equal(client.asset()?.render_error_code ?? null, null)
  // Deterministic path means the retry overwrites any object the failed run left.
  assert.equal(client.assets().length, 1)
})

test('a permanent failure is not retried', async () => {
  // An unresolved font will fail identically forever. Retrying it on every send
  // would burn a render per guest to reach the same answer.
  const client = makeClient({
    fontRow: { family_name: 'Other', postscript_name: 'Other-Regular', match_keys: ['otherregular'] },
  })

  await run(client)
  const before = client.uploadCount
  const second = await run(client)

  assert.equal(second.ok, false)
  if (!second.ok) assert.equal(second.code, 'FONT_UNRESOLVED')
  assert.equal(client.uploadCount, before)
})

test('the token is domain-separated and versioned', () => {
  // Guards against the same secret minting colliding values for another purpose,
  // and leaves room to change the format without silently breaking sent URLs.
  const token = deriveTokenForTest({
    designReleaseId: RELEASE_ID, guestId: GUEST_ID, renderVariant: VARIANT,
  })
  const expected = createHmac('sha256', process.env.CARD_ASSET_TOKEN_SECRET as string)
    .update(`opus-card-asset:v1:${RELEASE_ID}:${GUEST_ID}:${VARIANT}`)
    .digest('base64url')

  assert.equal(token, expected)
})

test('a transient fault stops retrying at the attempt cap', async () => {
  // Without this, an artwork that kills the renderer every time would be retried
  // on every send for every guest, forever, to reach the same answer.
  const client = makeClient()
  client.tables['invitation_card_delivery_assets'] = [
    {
      id: 'exhausted', design_release_id: RELEASE_ID, guest_id: GUEST_ID,
      render_variant: VARIANT, token_hash: 'whatever', status: 'failed',
      png_storage_path: null, render_error_code: 'RASTER_RUNTIME_FAILED',
      claimed_at: new Date().toISOString(), attempt_count: 3,
    },
  ]

  const result = await run(client)

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'RASTER_RUNTIME_FAILED')
  // Reported, not retried.
  assert.equal(client.uploadCount, 0)
  assert.equal(client.asset()?.attempt_count, 3)
})

test('each retake increments the attempt counter', async () => {
  const client = makeClient()
  client.failUploadOnce = true

  await run(client)
  assert.equal(client.asset()?.attempt_count, 1, 'first attempt')

  await run(client)

  assert.equal(client.asset()?.attempt_count, 2, 'retake counts as an attempt')
  assert.equal(client.asset()?.status, 'ready')
})

test('a permanent raster fault is never retried, whatever the count', async () => {
  const client = makeClient()
  client.tables['invitation_card_delivery_assets'] = [
    {
      id: 'bad-input', design_release_id: RELEASE_ID, guest_id: GUEST_ID,
      render_variant: VARIANT, token_hash: 'whatever', status: 'failed',
      png_storage_path: null, render_error_code: 'RASTER_INPUT_UNSUPPORTED',
      claimed_at: new Date().toISOString(), attempt_count: 1,
    },
  ]

  const result = await run(client)

  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'RASTER_INPUT_UNSUPPORTED')
  assert.equal(client.uploadCount, 0)
})
