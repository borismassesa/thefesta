import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getOrderById, transitionOrder, TransitionError } from './orders'

/**
 * Releasing the finished card into the couple's event.
 * Specs: OP-CCS-PRD-001 §7.10; OP-CCS-TDD-001 §6.3, §7.4; loophole L14.
 *
 * This is the ONLY place a watermark is ever removed, and it runs only for an
 * order that is already `settled` — a state the state machine will not grant
 * unless `fully_settled()` is true. So the sequence is:
 *
 *   balance verified → settled → clean master written → published → delivered
 *
 * and there is no ordering of those steps that produces a releasable file for
 * an unpaid order. Before this runs, the clean master does not exist in
 * storage at all, which is what makes a leaked preview URL harmless.
 *
 * Idempotent by design: it is called at settlement AND retried by the sweeper,
 * because TDD §10 is explicit that a verified payment must never be rolled
 * back due to a downstream publish failure. Settlement stands; delivery
 * retries.
 */

const VERSIONS_BUCKET = 'commission-versions'
const PREVIEWS_BUCKET = 'commission-previews'

export type PublishResult = { ok: true; alreadyDone: boolean } | { ok: false; message: string }

type ApprovedVersion = {
  id: string
  version_no: number
  svg_path: string
  master_png_path: string | null
  layer_schema: Record<string, unknown>
}

export async function publishSettledOrder(orderId: string): Promise<PublishResult> {
  const supabase = createSupabaseServerClient()
  const order = await getOrderById(orderId)
  if (!order) return { ok: false, message: 'Order not found.' }

  // Belt and braces. The state machine already guarantees this, but publishing
  // is the one irreversible step and it is worth refusing twice.
  if (order.status !== 'settled') {
    return { ok: false, message: `Order is ${order.status}, not settled — refusing to publish.` }
  }
  if (!order.event_id) {
    return { ok: false, message: 'Order has no event yet — it must be claimed first.' }
  }

  const { data: version, error: vErr } = await supabase
    .rpc('approved_version', { p_order_id: orderId })
    .returns<ApprovedVersion | ApprovedVersion[]>()
  if (vErr) return { ok: false, message: vErr.message }
  const approved = (Array.isArray(version) ? version[0] : version) as ApprovedVersion | null
  if (!approved?.id) return { ok: false, message: 'No QA-passed version to publish.' }

  // ── 1. The clean master ──────────────────────────────────────────────────
  // The stored SVG is already unwatermarked: the watermark was only ever
  // composited into the SEPARATE preview file. So "stripping the watermark" is
  // really "promoting the clean source", which is safer than trying to remove
  // marks from a rendered image.
  let masterPath = approved.master_png_path
  if (!masterPath) {
    masterPath = `${orderId}/v${approved.version_no}-master.svg`

    const { data: sourceBlob, error: dlErr } = await supabase.storage
      .from(VERSIONS_BUCKET)
      .download(approved.svg_path)
    if (dlErr || !sourceBlob) {
      return { ok: false, message: `Could not read the approved artwork: ${dlErr?.message ?? 'missing'}` }
    }
    const source = await sourceBlob.text()

    const { error: upErr } = await supabase.storage
      .from(VERSIONS_BUCKET)
      .upload(masterPath, new TextEncoder().encode(source), {
        contentType: 'image/svg+xml',
        upsert: true,
      })
    if (upErr) return { ok: false, message: `Could not write the master: ${upErr.message}` }

    // Recorded through an RPC that re-checks settlement, so the column meaning
    // "a releasable artefact exists" cannot be set on an unpaid order even by
    // a bug here.
    const { error: recErr } = await supabase.rpc('record_master_asset', {
      p_order_id: orderId,
      p_version_id: approved.id,
      p_master_path: masterPath,
    })
    if (recErr) return { ok: false, message: recErr.message }
  }

  // ── 2. Publish into the event ────────────────────────────────────────────
  // The commission becomes a first-class card asset on the couple's event, so
  // it feeds the existing per-guest compositing, QR-ticket and WhatsApp send
  // pipelines. No new delivery pipeline is built: this feature only supplies a
  // new SOURCE of card artwork.
  const { error: linkErr } = await supabase.from('invitation_card_designs').upsert(
    {
      order_id: null,
      line_index: 1,
      product_id: `commission:${order.order_no}`,
      product_name: order.provisional_event_name || 'Custom commissioned card',
      digital_qty: 0,
      print_qty: 0,
      status: 'delivered',
      field_values: (approved.layer_schema as Record<string, unknown>) ?? {},
      // The commission was designed and delivered through its own pipeline, so
      // the mirror row is started and finished the moment it is written. Left
      // null it would read as an unstarted job on the designer queue.
      started_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
    },
    { onConflict: 'order_id,line_index', ignoreDuplicates: true },
  )
  // A failure to mirror into the legacy design table must not block delivery:
  // the card itself is already released and readable through the order page.
  // Log it and carry on rather than trapping a paid customer behind a
  // bookkeeping row.
  if (linkErr) {
    console.error('[commission] could not mirror into invitation_card_designs', linkErr)
  }

  // ── 3. Revoke the watermarked preview ────────────────────────────────────
  // Housekeeping, not security: the customer now holds the real file. Failing
  // here is not worth blocking delivery over.
  const previewPath = `${orderId}/v${approved.version_no}-preview.svg`
  const { error: rmErr } = await supabase.storage.from(PREVIEWS_BUCKET).remove([previewPath])
  if (rmErr) console.warn('[commission] preview cleanup failed', rmErr.message)

  // ── 4. Delivered ─────────────────────────────────────────────────────────
  try {
    await transitionOrder({
      orderId,
      to: 'delivered',
      eventType: 'order.delivered',
      actorType: 'system',
      payload: { version_no: approved.version_no, master_path: masterPath },
    })
  } catch (error) {
    if (error instanceof TransitionError) {
      // Another sweeper run got there first. The asset is published either
      // way, which is the outcome that matters.
      return { ok: true, alreadyDone: true }
    }
    throw error
  }

  return { ok: true, alreadyDone: false }
}
