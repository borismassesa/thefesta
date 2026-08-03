import {
  assertGuestSubstituted,
  matchCardFonts,
  pinCardFonts,
  readRequiredFonts,
  renderCardForGuest,
  resolveRasterFonts,
  type CardFieldBinding,
  type CardFontFace,
  type PinnableFace,
  type RasterErrorCode,
  type RasterFontCandidate,
} from '@opusfesta/lib'
import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveAssetToken, hashAssetToken } from './asset-tokens'
import { rasteriseCard, type RasterFont } from './raster'

// Turning an approved release into one guest's card image.
//
// The first production consumer of both the release identity and the raster
// wrapper. Everything it does is arranged around one property: a card that is
// wrong must never reach a guest, and every way this can go wrong is silent, so
// the service refuses far more readily than it renders.
//
// Two things worth knowing before reading it.
//
// CLAIM BEFORE RENDER. The unique key on (release, guest, variant) makes a
// duplicate row impossible, but on its own it does not stop two workers both
// rendering and then racing at insert time. That wastes a couple of seconds of
// CPU per guest and leaves an orphaned PNG behind. So the row is inserted FIRST,
// pending, and only the worker whose insert won renders anything.
//
// THE TOKEN IS DERIVED, NOT STORED. A retry has to hand back the same URL, and
// the table only ever holds a hash. So the token is an HMAC over the three
// immutable identifiers: reproducible by anyone holding the secret, unguessable
// by anyone who is not, and revocable through revoked_at without rotating it.

export type PrepareGuestCardAssetInput = {
  designReleaseId: string
  guestId: string
  renderVariant: string
}

export type PrepareGuestCardAssetResult =
  | { ok: true; status: 'created' | 'reused'; assetId: string; pngStoragePath: string }
  | { ok: false; code: PrepareFailureCode }

/**
 * Every way preparation can refuse.
 *
 * Declared as a value and the type derived from it, not the other way round.
 * The stored `render_error_code` has to be validated at runtime when it is read
 * back, and a hand-maintained second list would drift: a code missing from it
 * gets silently coerced to RASTER_RUNTIME_FAILED, turning a permanent fault into
 * one that retries forever.
 */
export const PREPARE_FAILURE_CODES = [
  'RELEASE_NOT_FOUND',
  'GUEST_NOT_FOUND',
  'RELEASE_SVG_MISSING',
  'GUEST_NAME_MISSING',
  'GUEST_ROLE_UNMAPPED',
  'FONT_UNRESOLVED',
  'FONT_FORMAT_UNSUPPORTED',
  'FONT_NOT_LICENSED',
  'FONT_DOWNLOAD_FAILED',
  'SVG_INVALID',
  'OUTPUT_BLANK',
  'OUTPUT_LIMIT_EXCEEDED',
  /** The renderer itself faulted. Might be the runtime, so bounded retries. */
  'RASTER_RUNTIME_FAILED',
  /** The artwork cannot be rendered. Will fail identically forever. */
  'RASTER_INPUT_UNSUPPORTED',
  'STORAGE_WRITE_FAILED',
  /** The route found a ready row whose object had gone. Rebuildable. */
  'STORAGE_OBJECT_MISSING',
  /**
   * Another worker holds the claim and has not finished.
   *
   * Not in the original contract, but the claim protocol makes it reachable and
   * the alternative would be reporting 'reused' for an asset with no PNG yet.
   */
  'PREPARATION_IN_PROGRESS',
  /** Deployment misconfiguration: the token secret is absent. */
  'TOKEN_SECRET_MISSING',
] as const

export type PrepareFailureCode = (typeof PREPARE_FAILURE_CODES)[number]

/**
 * The slice of the Supabase client this service uses.
 *
 * Named rather than inferred from the factory so a test double has something to
 * satisfy, and so widening the surface is a deliberate edit here.
 */
export type PreparationClient = SupabaseClient

const RELEASES_BUCKET = 'card-releases'
const FONTS_BUCKET = 'card-fonts'
const ASSETS_BUCKET = 'card-guest-assets'

/** Width of the delivered image. One value, because the variant names the shape. */
const OUTPUT_WIDTH_PX = 1080

/**
 * How long a render lease is honoured before another worker may take it over.
 *
 * Long enough that a legitimately slow render is not stolen mid-flight, short
 * enough that a worker killed by a deploy does not strand a guest's card until
 * someone notices.
 */
const CLAIM_LEASE_MS = 90_000

/**
 * ROTATION IS A BREAKING CHANGE for URLs already sent. See asset-tokens.ts: new
 * assets mint from CURRENT while PREVIOUS stays accepted, so a rotation is a
 * two-deploy operation rather than a silent outage mid-send.
 */

/** How long a loser waits for the winner before telling the caller to retry. */
const WAIT_FOR_WINNER_MS = 3_000
const WAIT_POLL_MS = 250

type ReleaseRow = {
  id: string
  design_id: string
  svg_storage_path: string
  superseded_at: string | null
}

type AssetRow = {
  id: string
  status: 'pending' | 'ready' | 'failed'
  png_storage_path: string | null
  render_error_code: string | null
  claimed_at: string
  attempt_count: number
}

/**
 * Log line for a preparation failure.
 *
 * Codes and identifiers only. A guest's name, a storage path, a font URL or a
 * provider's message would put customer data and infrastructure detail into logs
 * that are read by more people and retained longer than the rows themselves.
 */
function logFailure(input: PrepareGuestCardAssetInput, code: PrepareFailureCode): void {
  console.warn(
    `[card-asset] prepare failed code=${code} release=${input.designReleaseId} guest=${input.guestId} variant=${input.renderVariant}`,
  )
}

/** Deterministic and free of anything mutable or identifying. */
export function assetStoragePath(input: PrepareGuestCardAssetInput): string {
  return `${input.designReleaseId}/${input.guestId}/${input.renderVariant}.png`
}

/**
 * Prepare one guest's card image, or explain why it cannot be prepared.
 *
 * Idempotent on (release, guest, variant): a second call after success returns
 * `reused` and writes nothing.
 */
export async function prepareGuestCardAsset(
  input: PrepareGuestCardAssetInput,
  /**
   * Injected only by tests.
   *
   * The interesting behaviour here is ordering and the claim race, neither of
   * which can be exercised through a pure function, so the seam is the client
   * itself. Production callers omit it and get the service-role client.
   */
  client?: PreparationClient,
): Promise<PrepareGuestCardAssetResult> {
  // Imported lazily so `@/lib/supabase`'s server-only marker is not evaluated
  // when a caller supplies its own client. The marker still protects production:
  // a client component that reached this code would trip it at runtime, and
  // node:crypto above would already have failed the build.
  const supabase =
    client ?? (await import('@/lib/supabase')).createSupabaseServerClient()

  const fail = (code: PrepareFailureCode): PrepareGuestCardAssetResult => {
    logFailure(input, code)
    return { ok: false, code }
  }

  const token = deriveAssetToken(input)
  if (!token) return fail('TOKEN_SECRET_MISSING')

  // ── The release, which must still be the one this asset is bound to ──
  const { data: release } = await supabase
    .from('invitation_card_design_releases')
    .select('id, design_id, svg_storage_path, superseded_at')
    .eq('id', input.designReleaseId)
    .maybeSingle<ReleaseRow>()
  if (!release) return fail('RELEASE_NOT_FOUND')
  if (!release.svg_storage_path) return fail('RELEASE_SVG_MISSING')

  const { data: guest } = await supabase
    .from('guest_contacts')
    .select('id, full_name')
    .eq('id', input.guestId)
    .maybeSingle<{ id: string; full_name: string | null }>()
  if (!guest) return fail('GUEST_NOT_FOUND')

  const guestName = (guest.full_name ?? '').trim()
  // Refused before anything is claimed or rendered: a card addressed to nobody
  // is not worth the work, and a blank guest layer looks like a broken card.
  if (!guestName) return fail('GUEST_NAME_MISSING')

  // ── Claim ──
  const claim = await claimAsset(supabase, input, hashAssetToken(token))
  if (claim.kind === 'existing') {
    if (claim.row.status === 'ready' && claim.row.png_storage_path) {
      return { ok: true, status: 'reused', assetId: claim.row.id, pngStoragePath: claim.row.png_storage_path }
    }
    if (claim.row.status === 'failed') {
      // Report what was recorded, so a retry does not re-run a render that is
      // going to fail the same way for the same reason. Transient faults are the
      // exception and were already retaken inside claimAsset.
      return fail(asFailureCode(claim.row.render_error_code))
    }
    return fail('PREPARATION_IN_PROGRESS')
  }
  if (claim.kind === 'error') return fail('STORAGE_WRITE_FAILED')

  const assetId = claim.row.id
  const markFailed = async (code: PrepareFailureCode): Promise<PrepareGuestCardAssetResult> => {
    await supabase
      .from('invitation_card_delivery_assets')
      .update({ status: 'failed', render_error_code: code })
      .eq('id', assetId)
    return fail(code)
  }

  // ── The frozen artefact ──
  const { data: svgBlob } = await supabase.storage
    .from(RELEASES_BUCKET)
    .download(release.svg_storage_path)
  if (!svgBlob) return markFailed('RELEASE_SVG_MISSING')
  const frozenSvg = await svgBlob.text()
  if (!frozenSvg.trim()) return markFailed('RELEASE_SVG_MISSING')

  // ── Guest substitution, proved from the renderer's own metadata ──
  const bindings = await loadBindings(supabase, release.design_id)
  const guestBindings = bindings.filter((b) => b.role === 'guest_name')
  // No binding, or several, and there is nothing unambiguous to write into.
  if (guestBindings.length !== 1) return markFailed('GUEST_ROLE_UNMAPPED')
  if (guestBindings[0].rasterised) return markFailed('GUEST_ROLE_UNMAPPED')

  const rendered = renderCardForGuest(frozenSvg, bindings, guestName)
  const appliedGuest = rendered.applied.filter((role) => role === 'guest_name').length
  // Exactly once. Zero means the layer was skipped, which renderCardForGuest
  // reports rather than throwing; more than once should be impossible and would
  // mean the binding matched several layers.
  if (appliedGuest !== 1) return markFailed('GUEST_ROLE_UNMAPPED')
  if (rendered.skipped.some((skip) => skip.role === 'guest_name')) {
    return markFailed('GUEST_ROLE_UNMAPPED')
  }
  // Belt and braces on top of the metadata, never instead of it: catches a
  // surviving placeholder, which means a second guest layer went unwritten.
  if (!assertGuestSubstituted(rendered.svg, guestName, rendered.applied).ok) {
    return markFailed('GUEST_ROLE_UNMAPPED')
  }

  // ── Fonts, read from the FROZEN svg rather than the source artwork ──
  const required = readRequiredFonts(frozenSvg)
  const library = await loadFontLibrary(supabase)
  const candidates = buildCandidates(required, library)

  const resolution = resolveRasterFonts(
    required.map((font) => font.primary),
    candidates,
  )
  if (!resolution.ok) return markFailed(fromRasterCode(resolution.code))

  const bytes = await downloadFaces(supabase, resolution.faceIds, library)
  if (!bytes) return markFailed('FONT_DOWNLOAD_FAILED')

  const fonts: RasterFont[] = resolution.faces.map((face, index) => ({
    face,
    bytes: bytes[resolution.faceIds[index]],
  }))
  if (fonts.some((font) => !font.bytes)) return markFailed('FONT_DOWNLOAD_FAILED')

  // ── Pin, then rasterise ──
  const pinned = pinCardFonts(rendered.svg, resolution.faces)
  if (pinned.unresolved.length > 0) return markFailed('FONT_UNRESOLVED')

  const raster = await rasteriseCard({ svg: pinned.svg, fonts, widthPx: OUTPUT_WIDTH_PX })
  if (!raster.ok) return markFailed(fromRasterCode(raster.code))

  // ── Store, then publish ──
  //
  // Upload before the row is marked ready, so a `ready` row always has an
  // object behind it. The reverse order would advertise a card that is not
  // there yet.
  const pngStoragePath = assetStoragePath(input)
  const { error: uploadError } = await supabase.storage
    .from(ASSETS_BUCKET)
    .upload(pngStoragePath, Buffer.from(raster.png), {
      contentType: 'image/png',
      // Overwriting is safe only because we hold the claim and the row is still
      // pending. Once ready, the object is immutable and this path is not reached
      // again: the caller gets `reused` instead.
      upsert: true,
    })
  if (uploadError) return markFailed('STORAGE_WRITE_FAILED')

  const { error: readyError } = await supabase
    .from('invitation_card_delivery_assets')
    .update({ status: 'ready', png_storage_path: pngStoragePath, render_error_code: null })
    .eq('id', assetId)
  if (readyError) return markFailed('STORAGE_WRITE_FAILED')

  return { ok: true, status: 'created', assetId, pngStoragePath }
}

type ClaimOutcome =
  | { kind: 'claimed'; row: { id: string } }
  | { kind: 'existing'; row: AssetRow }
  | { kind: 'error' }

/**
 * Take responsibility for rendering this asset, or report who already has.
 *
 * The insert is the claim: the unique key means exactly one caller can win it.
 * A conflict is not an error, it is the answer, so the existing row is read and
 * returned instead.
 */
async function claimAsset(
  supabase: PreparationClient,
  input: PrepareGuestCardAssetInput,
  tokenHash: string,
): Promise<ClaimOutcome> {
  const { data, error } = await supabase
    .from('invitation_card_delivery_assets')
    .insert({
      design_release_id: input.designReleaseId,
      guest_id: input.guestId,
      render_variant: input.renderVariant,
      token_hash: tokenHash,
      status: 'pending',
      attempt_count: 1,
    })
    .select('id')
    .maybeSingle<{ id: string }>()

  if (data) return { kind: 'claimed', row: data }
  // 23505 is the unique violation, i.e. somebody else got here first.
  if (error && error.code !== '23505') return { kind: 'error' }

  const existing = await readAsset(supabase, input)
  if (!existing) return { kind: 'error' }

  // A pending row whose lease has expired belongs to a worker that is not coming
  // back. Reclaim it with a conditional update so only one of several retriers
  // can win, then render as if we had claimed it first.
  if (existing.status === 'pending' && isLeaseExpired(existing.claimed_at)) {
    const reclaimed = await takeOver(supabase, existing, 'pending')
    if (reclaimed) return { kind: 'claimed', row: reclaimed }
  }

  // A recorded fault that was about infrastructure rather than about this card
  // must not be permanent. Leaving it would mean one storage blip strands a
  // guest's invitation forever, since every later attempt just replays the code.
  if (
    existing.status === 'failed' &&
    RETRYABLE_FAILURES.has(existing.render_error_code ?? '') &&
    existing.attempt_count < MAX_TRANSIENT_ATTEMPTS
  ) {
    const retaken = await takeOver(supabase, existing, 'failed')
    if (retaken) return { kind: 'claimed', row: retaken }
  }

  // Still being rendered: give the winner a moment rather than immediately
  // telling a caller preparing 200 guests to come back.
  if (existing.status === 'pending') {
    const settled = await waitForWinner(supabase, input)
    if (settled) return { kind: 'existing', row: settled }
  }

  return { kind: 'existing', row: existing }
}

/**
 * Faults worth trying again.
 *
 * Everything else is a fact about the card, not about the run: an unresolved
 * font or an unmapped guest layer will fail identically forever, and retrying it
 * on every send would burn a render per guest to reach the same answer.
 */
const RETRYABLE_FAILURES = new Set<string>([
  'STORAGE_WRITE_FAILED',
  // Set by the public route when a ready asset's object had vanished. Rebuilding
  // it is exactly what preparation is for, so it must be retryable.
  'STORAGE_OBJECT_MISSING',
  'FONT_DOWNLOAD_FAILED',
  'RASTER_RUNTIME_FAILED',
  'PREPARATION_IN_PROGRESS',
])

/**
 * Attempts allowed for a transient fault before it is treated as permanent.
 *
 * RASTER_RUNTIME_FAILED is the reason this exists. It cannot distinguish a
 * runtime hiccup from an artwork that kills the renderer every time, so without
 * a ceiling one broken design would burn a render per guest on every send,
 * forever, to arrive at the same answer.
 */
const MAX_TRANSIENT_ATTEMPTS = 3

/**
 * Take an asset over from whoever held it, atomically.
 *
 * Compare-and-swap on the lease value we actually observed, not merely on
 * status. Two workers reading the same stale row would otherwise both satisfy a
 * status-only predicate; matching claimed_at means the first writer moves the
 * value and the second's condition no longer holds. That makes the single-winner
 * property a property of the row rather than of the isolation level.
 *
 * Also clears any recorded error, so a retaken asset is not reported with the
 * previous run's failure if this one dies before writing its own.
 */
async function takeOver(
  supabase: PreparationClient,
  observed: AssetRow,
  expectedStatus: 'pending' | 'failed',
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('invitation_card_delivery_assets')
    .update({
      status: 'pending',
      claimed_at: new Date().toISOString(),
      last_attempted_at: new Date().toISOString(),
      // Safe as a read-then-write because it rides the same compare-and-swap:
      // a competing writer moves claimed_at and this update matches nothing.
      attempt_count: observed.attempt_count + 1,
      render_error_code: null,
    })
    .eq('id', observed.id)
    .eq('status', expectedStatus)
    .eq('claimed_at', observed.claimed_at)
    .select('id')
    .maybeSingle<{ id: string }>()
  return data ?? null
}

async function waitForWinner(
  supabase: PreparationClient,
  input: PrepareGuestCardAssetInput,
): Promise<AssetRow | null> {
  const deadline = Date.now() + WAIT_FOR_WINNER_MS
  let latest: AssetRow | null = null
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS))
    latest = await readAsset(supabase, input)
    if (!latest || latest.status !== 'pending') return latest
  }
  return latest
}

async function readAsset(
  supabase: PreparationClient,
  input: PrepareGuestCardAssetInput,
): Promise<AssetRow | null> {
  const { data } = await supabase
    .from('invitation_card_delivery_assets')
    .select('id, status, png_storage_path, render_error_code, claimed_at, attempt_count')
    .eq('design_release_id', input.designReleaseId)
    .eq('guest_id', input.guestId)
    .eq('render_variant', input.renderVariant)
    .maybeSingle<AssetRow>()
  return data ?? null
}

function isLeaseExpired(claimedAt: string): boolean {
  const at = Date.parse(claimedAt)
  if (Number.isNaN(at)) return false
  return Date.now() - at > CLAIM_LEASE_MS
}

/**
 * Translate a raster refusal into a preparation failure.
 *
 * Written out rather than cast. `RasterErrorCode` carries
 * WASM_INITIALIZATION_FAILED, which is not a PrepareFailureCode, so a cast would
 * compile happily and then persist a code this service does not define and no
 * caller handles. An exhaustive map means adding a raster code forces a decision
 * here instead of leaking one.
 */
function fromRasterCode(code: RasterErrorCode): PrepareFailureCode {
  switch (code) {
    case 'FONT_UNRESOLVED':
    case 'FONT_FORMAT_UNSUPPORTED':
    case 'FONT_NOT_LICENSED':
    case 'FONT_DOWNLOAD_FAILED':
    case 'SVG_INVALID':
    case 'OUTPUT_BLANK':
    case 'OUTPUT_LIMIT_EXCEEDED':
      return code
    // Broad by nature: it covers a resvg throw that is not a parse error, which
    // may be the runtime or may be this artwork. Treated as runtime so it can be
    // retried, but the attempt cap stops that becoming unbounded.
    case 'RASTER_FAILED':
      return 'RASTER_RUNTIME_FAILED'
    // An initialisation failure is an infrastructure fault, not a fact about
    // this card. Reported as a generic raster failure so a retry is sensible.
    case 'WASM_INITIALIZATION_FAILED':
      return 'RASTER_RUNTIME_FAILED'
    default: {
      // Compile-time exhaustiveness: an unhandled code cannot slip past.
      const exhaustive: never = code
      return exhaustive
    }
  }
}

/** Derived, so it cannot fall behind the union. */
const FAILURE_CODES: ReadonlySet<string> = new Set(PREPARE_FAILURE_CODES)

function asFailureCode(stored: string | null): PrepareFailureCode {
  return stored && FAILURE_CODES.has(stored) ? (stored as PrepareFailureCode) : 'RASTER_RUNTIME_FAILED'
}

async function loadBindings(
  supabase: PreparationClient,
  designId: string,
): Promise<CardFieldBinding[]> {
  const { data: design } = await supabase
    .from('invitation_card_designs')
    .select('product_id')
    .eq('id', designId)
    .maybeSingle<{ product_id: string }>()
  if (!design) return []

  const { data: product } = await supabase
    .from('website_invitations_products')
    .select('field_bindings')
    .eq('id', design.product_id)
    .maybeSingle<{ field_bindings: CardFieldBinding[] | null }>()
  return product?.field_bindings ?? []
}

type FontRow = {
  id: string
  storage_path: string
  format: string
  family_name: string
  subfamily_name: string
  postscript_name: string
  weight_class: number
  is_italic: boolean
  match_keys: string[]
  embeddable: boolean
  fs_type_no_embedding: boolean
}

async function loadFontLibrary(
  supabase: PreparationClient,
): Promise<FontRow[]> {
  const { data } = await supabase
    .from('card_fonts')
    .select(
      'id, storage_path, format, family_name, subfamily_name, postscript_name, weight_class, is_italic, match_keys, embeddable, fs_type_no_embedding',
    )
  return (data ?? []) as FontRow[]
}

/**
 * Pair each font the artwork asks for with the library face that answers it.
 *
 * Matching is the shared matchCardFonts, the same routine the admin preview and
 * the release freeze use, so the raster path cannot disagree with the card a
 * reviewer approved.
 */
function buildCandidates(
  required: ReturnType<typeof readRequiredFonts>,
  library: FontRow[],
): RasterFontCandidate[] {
  const faces: CardFontFace[] = library.map((row) => ({
    id: row.id,
    familyName: row.family_name,
    subfamilyName: row.subfamily_name,
    postscriptName: row.postscript_name,
    weightClass: row.weight_class,
    isItalic: row.is_italic,
    matchKeys: row.match_keys,
    embeddable: row.embeddable,
    restricted: row.fs_type_no_embedding,
  }))
  const byId = new Map(library.map((row) => [row.id, row]))

  const candidates: RasterFontCandidate[] = []
  for (const match of matchCardFonts(required, faces)) {
    if (!match.face) continue
    const row = byId.get(match.face.id)
    if (!row) continue
    candidates.push({
      faceId: row.id,
      requiredPrimary: match.required.primary,
      // The family the FILE declares, which is what resvg matches on.
      canonicalFamily: row.family_name,
      weight: row.weight_class,
      italic: row.is_italic,
      format: row.format,
      licenceCleared: row.embeddable,
    })
  }
  return candidates
}

/** Bytes for the faces the resolution asked for, or null if any is unreachable. */
async function downloadFaces(
  supabase: PreparationClient,
  faceIds: string[],
  library: FontRow[],
): Promise<Record<string, Uint8Array> | null> {
  const byId = new Map(library.map((row) => [row.id, row]))
  const out: Record<string, Uint8Array> = {}
  for (const faceId of faceIds) {
    const row = byId.get(faceId)
    if (!row) return null
    const { data } = await supabase.storage.from(FONTS_BUCKET).download(row.storage_path)
    if (!data) return null
    out[faceId] = new Uint8Array(await data.arrayBuffer())
  }
  return out
}

export type { PinnableFace }
