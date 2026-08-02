import type { SupabaseClient } from '@supabase/supabase-js'

// Is a prepared card actually there?
//
// Two callers need this and they need different answers from it. The public
// route must say nothing: every invalid state is the same generic 404, because
// distinguishing them tells a stranger which tokens exist. The send preflight
// (PR 4) must say exactly what is wrong, because an operator about to message two
// hundred guests needs to know whether to wait, repair or stop.
//
// So the check reports precisely, and the route flattens. Putting it here rather
// than inside the route is what stops PR 4 growing a second, subtly different
// copy of the storage-integrity rules.

export const ASSETS_BUCKET = 'card-guest-assets'

export type AssetPresence =
  /** Row says ready and the object is there. Safe to serve and safe to send. */
  | 'ready_and_present'
  /** Pending, failed, revoked, expired, or no such asset. */
  | 'not_ready'
  /** Row says ready but the object is gone. Recoverable by re-preparing. */
  | 'object_missing'
  /**
   * Storage could not answer.
   *
   * Deliberately distinct from object_missing. A timeout is not evidence that an
   * object is absent, and rewriting state on ambiguous evidence would let a
   * provider blip demote a perfectly good card mid-send.
   */
  | 'storage_unavailable'

export type VerifiedAsset = {
  presence: AssetPresence
  assetId: string | null
  designReleaseId: string | null
  pngStoragePath: string | null
}

type AssetRow = {
  id: string
  design_release_id: string
  status: string
  png_storage_path: string | null
  revoked_at: string | null
  expires_at: string | null
}

const ASSET_COLUMNS = 'id, design_release_id, status, png_storage_path, revoked_at, expires_at'

/** Object-not-found, as opposed to any other reason storage declined to answer. */
function isObjectMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { status?: number; statusCode?: string | number; message?: string }
  const status = Number(candidate.status ?? candidate.statusCode)
  if (status === 404) return true
  // Supabase surfaces this as a message on some paths and a status on others.
  return /not[_ ]?found|does not exist|no such/i.test(candidate.message ?? '')
}

function usable(row: AssetRow): boolean {
  if (row.status !== 'ready' || !row.png_storage_path) return false
  if (row.revoked_at) return false
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return false
  return true
}

async function inspect(
  supabase: SupabaseClient,
  row: AssetRow | null,
): Promise<VerifiedAsset> {
  if (!row || !usable(row)) {
    return {
      presence: 'not_ready',
      assetId: row?.id ?? null,
      designReleaseId: row?.design_release_id ?? null,
      pngStoragePath: null,
    }
  }

  const path = row.png_storage_path as string
  const { data, error } = await supabase.storage.from(ASSETS_BUCKET).download(path)
  const base = { assetId: row.id, designReleaseId: row.design_release_id, pngStoragePath: path }

  if (data) return { presence: 'ready_and_present', ...base }
  if (isObjectMissing(error)) return { presence: 'object_missing', ...base }
  return { presence: 'storage_unavailable', ...base }
}

/** Readiness for a known asset id. This is the seam PR 4's send preflight uses. */
export async function verifyPreparedGuestAsset(
  supabase: SupabaseClient,
  assetId: string,
): Promise<VerifiedAsset> {
  const { data } = await supabase
    .from('invitation_card_delivery_assets')
    .select(ASSET_COLUMNS)
    .eq('id', assetId)
    .maybeSingle<AssetRow>()
  return inspect(supabase, data ?? null)
}

export type ResolvedByToken = VerifiedAsset & { bytes: Blob | null }

/**
 * Resolve a presented token to its bytes, or to why it cannot be served.
 *
 * The lookup is by hash of the token, which is rotation-agnostic: whatever
 * secret minted the token, the guest presents that same string and its hash is
 * what the row stores.
 */
export async function resolveAssetByTokenHash(
  supabase: SupabaseClient,
  tokenHash: string,
): Promise<ResolvedByToken> {
  const { data: row } = await supabase
    .from('invitation_card_delivery_assets')
    .select(ASSET_COLUMNS)
    .eq('token_hash', tokenHash)
    .maybeSingle<AssetRow>()

  if (!row || !usable(row)) {
    return {
      presence: 'not_ready',
      assetId: row?.id ?? null,
      designReleaseId: row?.design_release_id ?? null,
      pngStoragePath: null,
      bytes: null,
    }
  }

  const path = row.png_storage_path as string
  const { data, error } = await supabase.storage.from(ASSETS_BUCKET).download(path)
  const base = { assetId: row.id, designReleaseId: row.design_release_id, pngStoragePath: path }

  if (data) return { presence: 'ready_and_present', ...base, bytes: data }
  if (isObjectMissing(error)) return { presence: 'object_missing', ...base, bytes: null }
  return { presence: 'storage_unavailable', ...base, bytes: null }
}

/**
 * Demote a ready row whose object has gone, so preparation can rebuild it.
 *
 * Conditional on the path we actually observed, not merely on status. Between
 * the download failing and this update running, another worker may have repaired
 * the asset; without the path in the predicate this request would demote the
 * repair. Same compare-and-swap reasoning as the render lease.
 *
 * Returns whether THIS caller performed the downgrade, so concurrent requests
 * for a missing object produce exactly one state change.
 */
export async function downgradeMissingObject(
  supabase: SupabaseClient,
  assetId: string,
  observedPath: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('invitation_card_delivery_assets')
    .update({
      status: 'failed',
      render_error_code: 'STORAGE_OBJECT_MISSING',
      png_storage_path: null,
    })
    .eq('id', assetId)
    .eq('status', 'ready')
    .eq('png_storage_path', observedPath)
    .select('id')
    .maybeSingle<{ id: string }>()
  return Boolean(data)
}
