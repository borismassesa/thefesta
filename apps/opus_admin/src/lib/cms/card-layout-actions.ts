'use server'

import { revalidatePath } from 'next/cache'

import {
  validateLayoutGeometry,
  type CardLayout,
  type CardLayoutState,
  type LayoutDiagnostic,
} from '@opusfesta/lib'

import { getCallerEmail, requireAdminRole, type AdminAccessRole } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

// Saving and activating a card's layout.
//
// These are two operations on purpose, and keeping them apart is the whole
// point of the module:
//
//   SAVE      records what an admin has drawn. It never changes what production
//             renders. A card that is live stays live on its existing active
//             revision while the edit sits beside it as a draft.
//   ACTIVATE  moves production onto a specific revision. Someone chooses to do
//             this, knowing which revision they are promoting.
//
// Collapsing them would mean that pressing Save on a card currently selling
// changes every order of that card immediately, with no review — which is
// exactly the failure the layout state machine exists to prevent.
//
// The concurrency and drift checks live in save_card_layout() in Postgres rather
// than here, because the read and the write have to be one transaction and
// because a contract in the database cannot be bypassed by the next caller who
// forgets it. This layer does the things the database cannot: authorisation, and
// validating the layout's GEOMETRY before it is stored.

/** Editing a card's layout is catalogue work, same as mapping its layers. */
const LAYOUT_ROLES: AdminAccessRole[] = ['owner', 'admin', 'editor']

/**
 * Activating is not.
 *
 * It is the moment production output changes for every order of a card, which
 * is the same weight as attesting a font licence.
 */
const ACTIVATION_ROLES: AdminAccessRole[] = ['owner', 'admin']

const CARD_PATH = (productId: string) => `/opus-pass/digital-cards/cards/${productId}`

export type SaveLayoutResult =
  | { ok: true; revision: number; revisionId: string; state: CardLayoutState }
  /** Somebody else saved while this admin was editing. */
  | {
      ok: false
      code: 'LAYOUT_CONFLICT'
      currentRevision: number
      submittedRevision: number
      artworkChanged: boolean
    }
  /** The artwork was re-uploaded, so these boxes were measured on a dead export. */
  | {
      ok: false
      code: 'ARTWORK_CHANGED'
      expectedArtworkSha256: string
      currentArtworkSha256: string
    }
  /** The layout itself is not coherent. Reported per issue, not as a sentence. */
  | { ok: false; code: 'LAYOUT_INVALID'; diagnostics: LayoutDiagnostic[] }
  | { ok: false; code: 'PRODUCT_NOT_FOUND' | 'SAVE_FAILED'; message?: string }

/**
 * Store a layout as a new draft revision.
 *
 * The caller passes the revision and artwork SHA it LOADED, not the ones it
 * thinks are current. That is what makes the conflict detectable: if either has
 * moved, this refuses and hands back both values so the Studio can tell the
 * admin what happened. It must never silently merge geometry edits — two people
 * dragging the same box do not have a mergeable intention.
 */
export async function saveCardLayout(input: {
  productId: string
  expectedRevision: number
  expectedArtworkSha256: string
  layout: CardLayout
  /** Only ever 'review_required' or 'blocked'; a save cannot activate. */
  state?: Extract<CardLayoutState, 'review_required' | 'blocked'>
  changeSummary?: string
}): Promise<SaveLayoutResult> {
  await requireAdminRole(LAYOUT_ROLES)
  const author = (await getCallerEmail()) ?? ''

  // Validated HERE, before the write, and never trusting the client's own
  // verdict: the Studio computes the same diagnostics for its badges, but a
  // browser is not a place a production constraint can be enforced.
  const blockers = validateLayoutGeometry(input.layout).filter(
    (issue) => issue.severity === 'blocker',
  )
  if (blockers.length > 0) {
    return { ok: false, code: 'LAYOUT_INVALID', diagnostics: blockers }
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('save_card_layout', {
    p_product_id: input.productId,
    p_expected_revision: input.expectedRevision,
    p_expected_artwork_sha: input.expectedArtworkSha256,
    p_layout: input.layout,
    p_state: input.state ?? null,
    p_author: author,
    p_summary: input.changeSummary ?? '',
  })

  if (error) return { ok: false, code: 'SAVE_FAILED', message: error.message }

  const result = data as Record<string, unknown> | null
  if (!result || result.ok !== true) {
    return normaliseFailure(result)
  }

  revalidatePath(CARD_PATH(input.productId))
  return {
    ok: true,
    revision: Number(result.revision),
    revisionId: String(result.revisionId),
    state: result.state as CardLayoutState,
  }
}

export type ActivateLayoutResult =
  | { ok: true; revision: number }
  | {
      ok: false
      code: 'ARTWORK_CHANGED'
      expectedArtworkSha256: string
      currentArtworkSha256: string
    }
  | { ok: false; code: 'REVISION_NOT_FOUND' | 'PRODUCT_NOT_FOUND' | 'ACTIVATE_FAILED'; message?: string }

/**
 * Point production at a specific layout revision.
 *
 * Takes a revision id rather than "activate the current draft", so what is being
 * promoted is unambiguous even if a save landed between the admin reading the
 * screen and pressing the button.
 */
export async function activateCardLayout(input: {
  productId: string
  revisionId: string
}): Promise<ActivateLayoutResult> {
  await requireAdminRole(ACTIVATION_ROLES)
  const author = (await getCallerEmail()) ?? ''

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('activate_card_layout', {
    p_product_id: input.productId,
    p_revision_id: input.revisionId,
    p_author: author,
  })

  if (error) return { ok: false, code: 'ACTIVATE_FAILED', message: error.message }

  const result = data as Record<string, unknown> | null
  if (!result || result.ok !== true) {
    const code = String(result?.code ?? 'ACTIVATE_FAILED')
    if (code === 'ARTWORK_CHANGED') {
      return {
        ok: false,
        code,
        expectedArtworkSha256: String(result?.expectedArtworkSha256 ?? ''),
        currentArtworkSha256: String(result?.currentArtworkSha256 ?? ''),
      }
    }
    return { ok: false, code: code === 'REVISION_NOT_FOUND' ? code : 'ACTIVATE_FAILED' }
  }

  revalidatePath(CARD_PATH(input.productId))
  return { ok: true, revision: Number(result.revision) }
}

/**
 * Take production off the layout engine.
 *
 * Not a rollback to an older layout: a straight return to the in-place renderer,
 * which is the fastest way to make a card behave exactly as it did before any of
 * this existed. Kept deliberately simple because it is what somebody reaches for
 * when a card is misbehaving and they want it to stop now.
 */
export async function deactivateCardLayout(productId: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdminRole(ACTIVATION_ROLES)

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('website_invitations_products')
    .update({ card_layout_state: 'draft', active_layout_revision_id: null })
    .eq('id', productId)

  if (error) return { ok: false, error: error.message }
  revalidatePath(CARD_PATH(productId))
  return { ok: true }
}

function normaliseFailure(result: Record<string, unknown> | null): SaveLayoutResult {
  const code = String(result?.code ?? 'SAVE_FAILED')
  if (code === 'LAYOUT_CONFLICT') {
    return {
      ok: false,
      code,
      currentRevision: Number(result?.currentRevision ?? 0),
      submittedRevision: Number(result?.submittedRevision ?? 0),
      artworkChanged: Boolean(result?.artworkChanged),
    }
  }
  if (code === 'ARTWORK_CHANGED') {
    return {
      ok: false,
      code,
      expectedArtworkSha256: String(result?.expectedArtworkSha256 ?? ''),
      currentArtworkSha256: String(result?.currentArtworkSha256 ?? ''),
    }
  }
  if (code === 'PRODUCT_NOT_FOUND') return { ok: false, code }
  return { ok: false, code: 'SAVE_FAILED' }
}
