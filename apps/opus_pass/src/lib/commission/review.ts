import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase'
import type { CardOrderRow } from './orders'

/**
 * Client review, revisions and the asset gate.
 * Specs: OP-CCS-PRD-001 §7.6, §7.10; OP-CCS-TDD-001 §7.4; loopholes L14, L19.
 *
 * The rule that governs this whole module: BEFORE SETTLEMENT the customer can
 * see a watermarked preview and nothing else. Approval does not unlock the
 * file — the balance does. So there is exactly one function here that hands
 * out a URL, it always serves from the previews bucket while money is
 * outstanding, and the clean master does not exist in storage until settlement
 * anyway.
 */

export const PREVIEWS_BUCKET = 'commission-previews'
export const VERSIONS_BUCKET = 'commission-versions'

/** Five minutes, per TDD §7.4. Long enough to look at, short enough to be useless if forwarded. */
const SIGNED_URL_SECONDS = 300

export type ReviewVersion = {
  id: string
  versionNo: number
  submittedAt: string
  /** Signed, short-lived, and watermarked unless the order is settled. */
  url: string | null
  watermarked: boolean
}

/**
 * The version currently in front of the customer.
 *
 * Which FILE is served is decided by the order's settlement state, not by any
 * argument a caller can pass. That is deliberate: a bug at a call site should
 * not be able to hand out a clean master.
 */
export async function getReviewableVersion(order: CardOrderRow): Promise<ReviewVersion | null> {
  const supabase = createSupabaseServerClient()

  const { data, error } = await supabase
    .from('design_versions')
    .select('id, version_no, submitted_at, preview_path, master_png_path, svg_path')
    .eq('order_id', order.id)
    .not('qa_passed_at', 'is', null)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string
      version_no: number
      submitted_at: string
      preview_path: string
      master_png_path: string | null
      svg_path: string
    }>()
  if (error) throw new Error(`getReviewableVersion failed: ${error.message}`)
  if (!data) return null

  // The gate. `settled`, `delivered` and `closed` are the only states in which
  // a customer may hold anything but a watermarked preview.
  const released = ['settled', 'delivered', 'closed'].includes(order.status)
  const bucket = released && data.master_png_path ? VERSIONS_BUCKET : PREVIEWS_BUCKET
  const path = released && data.master_png_path ? data.master_png_path : data.preview_path

  const { data: signed, error: signErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_SECONDS)
  if (signErr) {
    console.error('[commission] could not sign preview', signErr)
    return {
      id: data.id,
      versionNo: data.version_no,
      submittedAt: data.submitted_at,
      url: null,
      watermarked: !released,
    }
  }

  return {
    id: data.id,
    versionNo: data.version_no,
    submittedAt: data.submitted_at,
    url: signed?.signedUrl ?? null,
    watermarked: !released,
  }
}

export type RevisionItem = { element: string; type: string; comment: string }

/**
 * Validate a revision request.
 *
 * "Revision means ONE CONSOLIDATED SET of requested changes" (PRD §7.11.6).
 * Four messages arriving separately are four revisions, and the product has to
 * make that concrete or it becomes an argument. So the form takes a list and
 * submits it as one round — which is also why an empty list is rejected here
 * rather than silently opening an empty round.
 */
export function validateRevisionItems(raw: unknown): { ok: true; items: RevisionItem[] } | { ok: false; message: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, message: 'Tell us at least one thing you would like changed.' }
  }
  if (raw.length > 25) {
    return { ok: false, message: 'That is a lot of changes for one round — please call us instead.' }
  }
  const items: RevisionItem[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const comment = typeof e.comment === 'string' ? e.comment.trim() : ''
    if (!comment) continue
    items.push({
      element: typeof e.element === 'string' ? e.element.slice(0, 60) : 'general',
      type: typeof e.type === 'string' ? e.type.slice(0, 30) : 'text',
      comment: comment.slice(0, 2000),
    })
  }
  if (items.length === 0) {
    return { ok: false, message: 'Add a note describing what you would like changed.' }
  }
  return { ok: true, items }
}

/** Open a revision round through the database, which owns the allowance counter. */
export async function openRevisionRound(input: {
  orderId: string
  items: RevisionItem[]
  isCorrection: boolean
  actorId: string | null
}): Promise<{ ok: true; roundId: string } | { ok: false; message: string; needsTopup: boolean }> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.rpc('open_revision_round', {
    p_order_id: input.orderId,
    p_items: input.items,
    p_is_correction: input.isCorrection,
    p_actor_id: input.actorId,
    p_requested_by: input.actorId,
  })
  if (error) {
    // The allowance wall is the one failure the UI must handle specially: it
    // is not an error, it is the moment to offer the paid top-up.
    const needsTopup = /no revisions remaining/i.test(error.message)
    return { ok: false, message: error.message, needsTopup }
  }
  return { ok: true, roundId: String(data) }
}

/**
 * Accept the top-up charge.
 *
 * Adds to `total_tzs` and therefore to the outstanding balance — it does NOT
 * take a payment now. One payment at the end is how customers expect this to
 * work, and it is why design can reopen immediately.
 */
export async function acceptTopup(orderId: string, actorId: string | null): Promise<{ ok: true; chargeTzs: number } | { ok: false; message: string }> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.rpc('accept_revision_topup', {
    p_order_id: orderId,
    p_actor_id: actorId,
  })
  if (error) return { ok: false, message: error.message }
  return { ok: true, chargeTzs: Number(data ?? 0) }
}

/** The order's revision history, for the review screen. */
export async function getRevisionRounds(orderId: string): Promise<
  { roundNo: number; items: RevisionItem[]; isCorrection: boolean; openedAt: string; closedAt: string | null }[]
> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('revision_rounds')
    .select('round_no, items, is_correction, opened_at, closed_at')
    .eq('order_id', orderId)
    .order('round_no', { ascending: false })
  if (error) throw new Error(`getRevisionRounds failed: ${error.message}`)
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>
    return {
      roundNo: Number(row.round_no),
      items: (row.items as RevisionItem[]) ?? [],
      isCorrection: Boolean(row.is_correction),
      openedAt: String(row.opened_at),
      closedAt: (row.closed_at as string) ?? null,
    }
  })
}
