'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@clerk/nextjs/server'
import {
  blockingErrors,
  validateCommissionSvg,
  watermarkSvg,
  type SvgValidationReport,
} from '@opusfesta/lib'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requirePermission } from '@/lib/admin-auth'

/**
 * Studio actions: assignment, acceptance, version upload and internal QA.
 * Specs: OP-CCS-PRD-001 §7.4, §7.6; OP-CCS-TDD-001 §5.4, §6.
 *
 * Every state change goes through `transition_order()`. Nothing here writes
 * `card_orders.status`, and nothing here decides whether a transition is legal
 * — the database does, so a bug in this file cannot produce an illegal state.
 */

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

const VERSIONS_BUCKET = 'commission-versions'
const PREVIEWS_BUCKET = 'commission-previews'

async function callerEmployeeId(): Promise<string | null> {
  const { userId: clerkId } = await auth()
  if (!clerkId) return null
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('workforce_employees')
    .select('id')
    .eq('clerk_user_id', clerkId)
    .maybeSingle<{ id: string }>()
  return data?.id ?? null
}

function refresh(): void {
  revalidatePath('/opus-pass/commissions')
  revalidatePath('/opus-pass/commissions/my-tasks')
}

// ─────────────────────────────────────────────────────────────────────────────
//  Assignment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assign an order, either automatically or to a named designer.
 *
 * The ranking, the capacity check and the transition all happen inside
 * `assign_card_order()` so that the admin button, the sweeper and any future
 * retry cannot disagree about who is next.
 *
 * A NULL return means nobody is eligible. That is a real outcome, not a
 * failure: there is no freelance overflow, so the honest response is to leave
 * the order queued and tell Ops, never to assign someone over capacity.
 */
export async function assignCommission(formData: FormData): Promise<ActionResult> {
  await requirePermission('commissions.manage')
  const orderId = String(formData.get('orderId') ?? '')
  const designerId = String(formData.get('designerId') ?? '') || null
  if (!orderId) return { ok: false, message: 'Missing order.' }

  const actorId = await callerEmployeeId()
  const supabase = createSupabaseAdminClient()

  const { data, error } = await supabase.rpc('assign_card_order', {
    p_order_id: orderId,
    p_employee_id: designerId,
    p_actor_type: 'admin',
    p_actor_id: actorId,
  })
  if (error) return { ok: false, message: error.message }

  refresh()
  if (!data) {
    return {
      ok: false,
      message:
        'No designer is available for this order — every eligible designer is at capacity, on leave, or lacks this category. The order stays queued.',
    }
  }
  return { ok: true, message: designerId ? 'Assigned.' : 'Auto-assigned to the best available designer.' }
}

/** A designer accepting their own task. */
export async function acceptCommission(formData: FormData): Promise<ActionResult> {
  await requirePermission('commissions.design')
  const orderId = String(formData.get('orderId') ?? '')
  const employeeId = await callerEmployeeId()
  if (!orderId || !employeeId) return { ok: false, message: 'Missing order or employee.' }

  const supabase = createSupabaseAdminClient()
  // A designer may only accept a task that is actually theirs. The RLS policy
  // says the same thing, but this path runs as service_role, so the check has
  // to be explicit here.
  const { data: order } = await supabase
    .from('card_orders')
    .select('assigned_designer_id')
    .eq('id', orderId)
    .maybeSingle<{ assigned_designer_id: string | null }>()
  if (!order || order.assigned_designer_id !== employeeId) {
    return { ok: false, message: 'That task is not assigned to you.' }
  }

  const { error } = await supabase.rpc('transition_order', {
    p_order_id: orderId,
    p_to: 'in_design',
    p_event_type: 'task.accepted',
    p_actor_type: 'designer',
    p_actor_id: employeeId,
    p_payload: {},
  })
  if (error) return { ok: false, message: error.message }
  refresh()
  return { ok: true, message: 'Accepted. The first-draft clock is running.' }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Version upload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload a card version. The validator is a BLOCKING gate.
 *
 * A file that fails validation is not stored at all and the order does not
 * move — TDD §10 is explicit that the order stays `in_design` with the SLA
 * still running, because a rejected upload is unfinished work, not a pause.
 *
 * The watermarked preview is composited HERE, server-side, from the uploaded
 * SVG. The clean file goes to a bucket with no end-user policy; the preview
 * goes to a separate one. That separation is what makes Gate 2 real: there is
 * no clean master anywhere the customer's session can reach until settlement.
 */
export async function uploadCommissionVersion(formData: FormData): Promise<ActionResult> {
  await requirePermission('commissions.design')
  const orderId = String(formData.get('orderId') ?? '')
  const file = formData.get('svg')
  const employeeId = await callerEmployeeId()
  if (!orderId || !employeeId) return { ok: false, message: 'Missing order or employee.' }
  if (!(file instanceof File)) return { ok: false, message: 'Attach the card SVG.' }

  const supabase = createSupabaseAdminClient()
  const { data: order } = await supabase
    .from('card_orders')
    .select('assigned_designer_id, category_id, status')
    .eq('id', orderId)
    .maybeSingle<{ assigned_designer_id: string | null; category_id: string; status: string }>()
  if (!order || order.assigned_designer_id !== employeeId) {
    return { ok: false, message: 'That task is not assigned to you.' }
  }

  const source = await file.text()
  const { data: category } = await supabase
    .from('card_categories')
    .select('ticketed')
    .eq('id', order.category_id)
    .maybeSingle<{ ticketed: boolean }>()

  const report: SvgValidationReport = validateCommissionSvg(source, {
    requireQrSlot: Boolean(category?.ticketed),
  })

  if (!report.ok) {
    const errors = blockingErrors(report)
    // Nothing is written on failure — no orphan storage object, no version row.
    return {
      ok: false,
      message: `The card did not pass validation (${errors.length} issue${errors.length === 1 ? '' : 's'}): ${errors
        .slice(0, 3)
        .map((e) => e.message)
        .join(' ')}`,
    }
  }

  const { data: versionNo, error: vErr } = await supabase
    .rpc('next_design_version_no', { p_order_id: orderId })
    .returns<number>()
  if (vErr) return { ok: false, message: vErr.message }
  const n = Number(versionNo ?? 1)

  const svgPath = `${orderId}/v${n}.svg`
  const previewPath = `${orderId}/v${n}-preview.svg`

  const up1 = await supabase.storage
    .from(VERSIONS_BUCKET)
    .upload(svgPath, new TextEncoder().encode(source), {
      contentType: 'image/svg+xml',
      upsert: true,
    })
  if (up1.error) return { ok: false, message: `Upload failed: ${up1.error.message}` }

  const up2 = await supabase.storage
    .from(PREVIEWS_BUCKET)
    .upload(previewPath, new TextEncoder().encode(watermarkSvg(source)), {
      contentType: 'image/svg+xml',
      upsert: true,
    })
  if (up2.error) return { ok: false, message: `Preview generation failed: ${up2.error.message}` }

  // The version row is written only AFTER both uploads confirm, so a storage
  // failure mid-submit leaves no orphan row (TDD §10).
  const { error: rowErr } = await supabase.from('design_versions').insert({
    order_id: orderId,
    version_no: n,
    designer_id: employeeId,
    svg_path: svgPath,
    preview_path: previewPath,
    layer_schema: report.schema,
    validator_report: report,
  })
  if (rowErr) return { ok: false, message: rowErr.message }

  const { error: transErr } = await supabase.rpc('transition_order', {
    p_order_id: orderId,
    p_to: 'internal_qa',
    p_event_type: 'version.submitted',
    p_actor_type: 'designer',
    p_actor_id: employeeId,
    p_payload: { version_no: n },
  })
  if (transErr) {
    return { ok: false, message: `Version ${n} saved, but the order did not move: ${transErr.message}` }
  }

  refresh()
  return { ok: true, message: `Version ${n} submitted for internal QA.` }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Internal QA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pass or fail internal QA.
 *
 * A real gate with real authority, not a rating: because every designer is an
 * employee on the OpusStudio ladder (PRD §4.1), a design lead can reject and
 * coach. Requires `commissions.manage`, so a designer cannot pass their own
 * work.
 */
export async function reviewCommissionVersion(formData: FormData): Promise<ActionResult> {
  await requirePermission('commissions.manage')
  const orderId = String(formData.get('orderId') ?? '')
  const versionId = String(formData.get('versionId') ?? '')
  const pass = String(formData.get('decision') ?? '') === 'pass'
  const note = String(formData.get('note') ?? '').trim()
  if (!orderId || !versionId) return { ok: false, message: 'Missing order or version.' }
  // A rejection with no notes is not coaching, it is just a bounce.
  if (!pass && note.length < 3) {
    return { ok: false, message: 'Say what needs changing — the designer sees this note.' }
  }

  const employeeId = await callerEmployeeId()
  const supabase = createSupabaseAdminClient()

  const { error: vErr } = await supabase
    .from('design_versions')
    .update({
      qa_passed_at: pass ? new Date().toISOString() : null,
      qa_by: employeeId,
      qa_note: note || null,
    })
    .eq('id', versionId)
  if (vErr) return { ok: false, message: vErr.message }

  const { error } = await supabase.rpc('transition_order', {
    p_order_id: orderId,
    p_to: pass ? 'client_review' : 'in_design',
    // qa.rejected is admin-only on the timeline: the customer has no use for
    // our internal bounce and it would read as a delay we caused.
    p_event_type: pass ? 'version.ready' : 'qa.rejected',
    p_actor_type: 'admin',
    p_actor_id: employeeId,
    p_payload: { version_id: versionId, note },
  })
  if (error) return { ok: false, message: error.message }

  refresh()
  return {
    ok: true,
    message: pass
      ? 'Passed QA. The customer can now review it.'
      : 'Sent back to the designer with your notes.',
  }
}

/** Ask the customer a question mid-design. This pauses the SLA clock. */
export async function askCommissionClarification(formData: FormData): Promise<ActionResult> {
  await requirePermission('commissions.design')
  const orderId = String(formData.get('orderId') ?? '')
  const question = String(formData.get('question') ?? '').trim()
  if (!orderId || question.length < 5) {
    return { ok: false, message: 'Write the question you need answered.' }
  }

  const employeeId = await callerEmployeeId()
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('brief_clarifications')
    .insert({ order_id: orderId, asked_by: employeeId, question })
  if (error) return { ok: false, message: error.message }

  refresh()
  return {
    ok: true,
    message: 'Sent. Your SLA clock is paused until the customer answers.',
  }
}

// REMOVED: signCommissionAsset(bucket, path).
//
// It was an exported action in a 'use server' module, so it was callable from
// any browser holding a session, and it signed whatever path it was given
// after checking only `commissions.read`. Its own docstring said "callers must
// have already checked authorisation" — but the caller here is the network,
// and it had no call sites at all, so it was attack surface serving nothing.
// Three buckets of commission briefs, customer artwork and unreleased previews
// were reachable by anyone who could guess a key.
//
// Deleted rather than patched, because there was nothing to preserve. If asset
// signing is needed again, resolve the object from a row scoped to the
// commission the caller is entitled to, the way getApprovalAttachmentUrl does
// in approvals/attachment-actions.ts, and never accept a path as an argument.
