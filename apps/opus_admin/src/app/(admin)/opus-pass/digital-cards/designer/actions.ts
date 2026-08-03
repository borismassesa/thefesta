'use server'

import { randomBytes } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  getCallerEmail,
  requireAdminRole,
  requirePermission,
  type AdminAccessRole,
} from '@/lib/admin-auth'
import { releaseApprovedDesign } from '@/lib/cms/release-card'
import { mergeCardDesignerValues } from '@/lib/cms/card-designer-values'
import { sendCardReviewRequest } from '@/lib/card-review-email'
import { readOrderLine, type OrderLineItem } from '@/lib/cms/order-add-ons'
import { requestableFields, type CardFieldBinding } from '@opusfesta/lib'

const DESIGNER_ROLES: AdminAccessRole[] = ['owner', 'admin', 'editor']

/**
 * `warning` is for a transition that SUCCEEDED but whose side effect did not:
 * the job moved, yet nobody could be emailed. Reporting that as an error would
 * be a lie, and swallowing it would leave a card sitting in review that no one
 * knows about.
 */
type Result = { ok: true; warning?: string } | { ok: false; error: string }

/**
 * Whether the caller is the person assigned to this job.
 *
 * `assigned_to` is a workforce_employees id while the caller is identified by
 * email, so the two have to be reconciled rather than compared. An unresolvable
 * assignee returns false: blocking a review because a staff row was deleted
 * would strand the card.
 */
async function isSelfReview(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  assignedTo: string | null,
  callerEmail: string,
): Promise<boolean> {
  if (!assignedTo || !callerEmail) return false
  const { data } = await supabase
    .from('workforce_employees')
    .select('email')
    .eq('id', assignedTo)
    .maybeSingle<{ email: string | null }>()
  const assigneeEmail = (data?.email ?? '').trim().toLowerCase()
  return Boolean(assigneeEmail) && assigneeEmail === callerEmail.trim().toLowerCase()
}

/**
 * Start a design job for one card line.
 *
 * Quantities are copied from the order at this moment rather than read live,
 * so a later edit to the order can't silently change a print run already
 * underway. The order's own fulfillment_status moves to 'in_progress', which is
 * the 'In design' step the couple already sees on their dashboard.
 */
export async function startDesignJob(orderId: string, lineIndex: number): Promise<Result> {
  await requireAdminRole(DESIGNER_ROLES)
  const supabase = createSupabaseAdminClient()

  const { data: order, error: orderError } = await supabase
    .from('invitation_orders')
    .select('id, status, reviewed_at, items, fulfillment_status')
    .eq('id', orderId)
    .maybeSingle<{
      id: string
      status: string
      reviewed_at: string | null
      items: OrderLineItem[] | null
      fulfillment_status: string | null
    }>()
  if (orderError) return { ok: false, error: orderError.message }
  if (!order) return { ok: false, error: 'Order not found.' }

  // Re-check approval server-side. The queue already filters on it, but a stale
  // page must not be able to push an unreviewed order into design.
  if (order.status !== 'paid' || !order.reviewed_at) {
    return { ok: false, error: 'This order has not been approved by finance yet.' }
  }

  const items = Array.isArray(order.items) ? order.items : []
  const item = items[lineIndex - 1]
  if (!item) return { ok: false, error: `Order has no card at line ${lineIndex}.` }

  const quantities = readOrderLine(item)

  const { error: insertError } = await supabase.from('invitation_card_designs').upsert(
    {
      order_id: orderId,
      line_index: lineIndex,
      product_id: item.id ?? '',
      product_name: item.name ?? '',
      digital_qty: quantities.digitalCards,
      print_qty: quantities.printedCards,
      status: 'awaiting_info',
    },
    // Idempotent: double-clicking "Start" must not create a second job or
    // reset one already in progress.
    { onConflict: 'order_id,line_index', ignoreDuplicates: true },
  )
  if (insertError) return { ok: false, error: insertError.message }

  // Only advance the order; never move it backwards from a later stage.
  if (order.fulfillment_status === 'not_started') {
    const { error: orderUpdateError } = await supabase
      .from('invitation_orders')
      .update({ fulfillment_status: 'in_progress', fulfillment_updated_at: new Date().toISOString() })
      .eq('id', orderId)
    if (orderUpdateError) return { ok: false, error: orderUpdateError.message }
  }

  revalidatePath('/opus-pass/digital-cards/designer')
  return { ok: true }
}

/**
 * Order-level fulfilment stage each design status implies, and the source of
 * the status type. One map rather than a parallel list, so a new status cannot
 * be added without deciding what it means for the order the couple is watching.
 */
const ORDER_STAGE = {
  awaiting_info: 'in_progress',
  in_design: 'in_progress',
  in_review: 'in_progress',
  ready: 'ready',
  delivered: 'delivered',
} as const

type DesignStatus = keyof typeof ORDER_STAGE

/**
 * Roll the ORDER forward to the stage every one of its cards has reached.
 *
 * An order can hold six cards. Advancing it the moment one is ready would show
 * the couple "Design ready" while three of theirs are still being drawn.
 */
async function syncOrderStage(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  orderId: string,
  now: string,
): Promise<void> {
  const { data: siblings } = await supabase
    .from('invitation_card_designs')
    .select('status')
    .eq('order_id', orderId)

  const stages = (siblings ?? []).map((s) => ORDER_STAGE[s.status as DesignStatus] ?? 'in_progress')
  const orderStage = stages.includes('in_progress')
    ? 'in_progress'
    : stages.includes('ready')
      ? 'ready'
      : 'delivered'

  await supabase
    .from('invitation_orders')
    .update({ fulfillment_status: orderStage, fulfillment_updated_at: now })
    .eq('id', orderId)
}

/** Append to the job's history. Never throws: a lost log entry must not fail a transition. */
async function recordDesignEvent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  event: {
    designId: string
    author: string
    body: string
    fromStatus?: string | null
    toStatus?: string | null
    kind?: 'system' | 'note'
  },
): Promise<void> {
  await supabase
    .from('invitation_card_design_events')
    .insert({
      design_id: event.designId,
      kind: event.kind ?? 'system',
      author: event.author,
      body: event.body,
      from_status: event.fromStatus ?? null,
      to_status: event.toStatus ?? null,
    })
    .then(
      () => undefined,
      () => undefined,
    )
}

type DesignRow = {
  id: string
  order_id: string
  status: DesignStatus
  assigned_to: string | null
  product_name: string
}

const DESIGN_SELECT = 'id, order_id, status, assigned_to, product_name'

/**
 * Hand a finished card to a reviewer.
 *
 * Deliberately NOT a generic status setter. The old `setDesignStatus` accepted
 * any status from any status, which made the review stage advisory: a designer
 * could mark their own work ready and nothing recorded who decided what. A
 * wedding card cannot be recalled, so the second pair of eyes is the point.
 */
export async function submitForReview(designId: string): Promise<Result> {
  await requirePermission('cms.write')
  const supabase = createSupabaseAdminClient()
  const author = (await getCallerEmail()) ?? 'unknown'
  const now = new Date().toISOString()

  const { data: design } = await supabase
    .from('invitation_card_designs')
    .select(DESIGN_SELECT)
    .eq('id', designId)
    .maybeSingle<DesignRow>()
  if (!design) return { ok: false, error: 'Design job not found.' }
  if (design.status === 'in_review') return { ok: true }
  if (design.status !== 'in_design' && design.status !== 'awaiting_info') {
    return { ok: false, error: `A job that is "${design.status}" cannot be submitted for review.` }
  }

  const { error } = await supabase
    .from('invitation_card_designs')
    .update({
      status: 'in_review',
      submitted_for_review_at: now,
      submitted_by: author,
      // Clear the previous decision so a resubmitted job does not still show
      // the note that sent it back.
      review_note: '',
      reviewed_by: '',
      reviewed_at: null,
    })
    .eq('id', designId)
  if (error) return { ok: false, error: error.message }

  await recordDesignEvent(supabase, {
    designId,
    author,
    body: 'Submitted for review',
    fromStatus: design.status,
    toStatus: 'in_review',
  })
  await syncOrderStage(supabase, design.order_id, now)

  // Email is best-effort: a mail outage must not leave the job in limbo.
  const notified = await sendCardReviewRequest(designId).catch(() => ({
    sent: false,
    recipients: [] as string[],
    reason: 'send_failed',
  }))

  revalidatePath('/opus-pass/digital-cards/designer')
  revalidatePath(`/opus-pass/digital-cards/designer/${designId}`)
  return notified.sent || notified.recipients.length > 0
    ? { ok: true }
    : { ok: true, warning: 'Submitted, but no reviewer could be emailed. Tell someone directly.' }
}

/**
 * Approve a card and publish it to the couple.
 *
 * Two gates, both deliberate:
 *
 *   cms.publish  — the key that already means "can release" elsewhere.
 *   not yours    — a reviewer may not approve a job they were assigned. Every
 *                  card gets a second pair of eyes, which is the whole reason
 *                  this stage exists.
 */
export async function approveAndRelease(designId: string): Promise<Result> {
  await requirePermission('cms.publish')
  const supabase = createSupabaseAdminClient()
  const author = (await getCallerEmail()) ?? 'unknown'
  const now = new Date().toISOString()

  const { data: design } = await supabase
    .from('invitation_card_designs')
    .select(DESIGN_SELECT)
    .eq('id', designId)
    .maybeSingle<DesignRow>()
  if (!design) return { ok: false, error: 'Design job not found.' }
  if (design.status === 'ready' || design.status === 'delivered') return { ok: true }
  if (design.status !== 'in_review') {
    return { ok: false, error: 'Only a job that is in review can be approved.' }
  }

  if (await isSelfReview(supabase, design.assigned_to, author)) {
    return {
      ok: false,
      error:
        'You are assigned to this card, so someone else has to approve it. That second pair of eyes is the point of the review step.',
    }
  }

  // Writes the frozen card first, then flips the status. A job marked ready
  // with no artefact would promise the couple a card that does not exist.
  const released = await releaseApprovedDesign(supabase, design, author, now)
  if (!released.ok) return released

  await recordDesignEvent(supabase, {
    designId,
    author,
    body: 'Approved and released',
    fromStatus: 'in_review',
    toStatus: 'ready',
  })
  await syncOrderStage(supabase, design.order_id, now)

  revalidatePath('/opus-pass/digital-cards/designer')
  revalidatePath(`/opus-pass/digital-cards/designer/${designId}`)
  return released
}

/**
 * Send a card back to the designer with a reason.
 *
 * The note lives on the row as well as in the event log, because the designer
 * needs to see it at the top of the job they are reopening rather than having
 * to read a history.
 */
export async function requestChanges(designId: string, note: string): Promise<Result> {
  await requirePermission('cms.publish')
  const trimmed = note.trim()
  if (!trimmed) return { ok: false, error: 'Say what needs changing.' }

  const supabase = createSupabaseAdminClient()
  const author = (await getCallerEmail()) ?? 'unknown'
  const now = new Date().toISOString()

  const { data: design } = await supabase
    .from('invitation_card_designs')
    .select(DESIGN_SELECT)
    .eq('id', designId)
    .maybeSingle<DesignRow>()
  if (!design) return { ok: false, error: 'Design job not found.' }
  if (design.status !== 'in_review') {
    return { ok: false, error: 'Only a job that is in review can be sent back.' }
  }

  const { error } = await supabase
    .from('invitation_card_designs')
    .update({
      status: 'in_design',
      review_note: trimmed.slice(0, 2000),
      reviewed_by: author,
      reviewed_at: now,
    })
    .eq('id', designId)
  if (error) return { ok: false, error: error.message }

  await recordDesignEvent(supabase, {
    designId,
    author,
    body: trimmed.slice(0, 2000),
    fromStatus: 'in_review',
    toStatus: 'in_design',
    kind: 'note',
  })
  await syncOrderStage(supabase, design.order_id, now)

  revalidatePath('/opus-pass/digital-cards/designer')
  revalidatePath(`/opus-pass/digital-cards/designer/${designId}`)
  return { ok: true }
}

/**
 * Mark a released card as handed over.
 *
 * Separate from release because delivery is an operational fact, not a quality
 * decision, so it does not need a reviewer.
 */
export async function markDelivered(designId: string): Promise<Result> {
  await requirePermission('cms.write')
  const supabase = createSupabaseAdminClient()
  const author = (await getCallerEmail()) ?? 'unknown'
  const now = new Date().toISOString()

  const { data: design } = await supabase
    .from('invitation_card_designs')
    .select(DESIGN_SELECT)
    .eq('id', designId)
    .maybeSingle<DesignRow>()
  if (!design) return { ok: false, error: 'Design job not found.' }
  if (design.status === 'delivered') return { ok: true }
  if (design.status !== 'ready') {
    return { ok: false, error: 'Only a released card can be marked delivered.' }
  }

  const { error } = await supabase
    .from('invitation_card_designs')
    .update({ status: 'delivered', delivered_at: now })
    .eq('id', designId)
  if (error) return { ok: false, error: error.message }

  await recordDesignEvent(supabase, {
    designId,
    author,
    body: 'Marked delivered',
    fromStatus: 'ready',
    toStatus: 'delivered',
  })
  await syncOrderStage(supabase, design.order_id, now)

  revalidatePath('/opus-pass/digital-cards/designer')
  revalidatePath(`/opus-pass/digital-cards/designer/${designId}`)
  return { ok: true }
}

/**
 * Ask the couple for a set of fields.
 *
 * Roles are validated against the card's own bindings, not just the global
 * role list: asking for a field the artwork has no layer for would produce a
 * question whose answer can never be placed.
 */
export async function requestDesignInfo(
  designId: string,
  roles: string[],
): Promise<Result> {
  await requireAdminRole(DESIGNER_ROLES)
  const supabase = createSupabaseAdminClient()

  const { data: design, error } = await supabase
    .from('invitation_card_designs')
    .select('id, product_id, share_token')
    .eq('id', designId)
    .maybeSingle<{ id: string; product_id: string; share_token: string | null }>()
  if (error) return { ok: false, error: error.message }
  if (!design) return { ok: false, error: 'Design job not found.' }

  const { data: product } = await supabase
    .from('website_invitations_products')
    .select('field_bindings')
    .eq('id', design.product_id)
    .maybeSingle<{ field_bindings: CardFieldBinding[] | null }>()

  const askable = new Set(
    requestableFields(product?.field_bindings ?? []).map((f) => f.role.key),
  )
  const clean = [...new Set(roles.map((r) => String(r).trim()).filter(Boolean))]
  const unknown = clean.filter((r) => !askable.has(r))
  if (unknown.length > 0) {
    return { ok: false, error: `This card has no field for: ${unknown.join(', ')}.` }
  }

  const { error: updateError } = await supabase
    .from('invitation_card_designs')
    .update({
      requested_fields: clean,
      // Mint the share token on the first real request and keep it thereafter,
      // so a link already sent to a couple never stops working.
      ...(clean.length > 0 && !design.share_token
        ? { share_token: randomBytes(24).toString('base64url') }
        : {}),
      // Clearing the timestamp when nothing is asked keeps "has an outstanding
      // request" a single, honest check rather than two fields that can disagree.
      info_requested_at: clean.length > 0 ? new Date().toISOString() : null,
      status: clean.length > 0 ? 'awaiting_info' : 'in_design',
    })
    .eq('id', designId)
  if (updateError) return { ok: false, error: updateError.message }

  revalidatePath('/opus-pass/digital-cards/designer')
  revalidatePath(`/opus-pass/digital-cards/designer/${designId}`)
  return { ok: true }
}

/**
 * Write field values — the designer's override.
 *
 * The couple's own submission goes through the same column, so this is
 * deliberately a merge rather than a replace: saving one corrected name must
 * not wipe the eleven answers the couple already sent.
 */
export async function saveDesignFieldValues(
  designId: string,
  values: Record<string, string>,
): Promise<Result> {
  await requireAdminRole(DESIGNER_ROLES)
  const supabase = createSupabaseAdminClient()

  const { data: design, error } = await supabase
    .from('invitation_card_designs')
    .select('id, field_values, requested_fields')
    .eq('id', designId)
    .maybeSingle<{
      id: string
      field_values: Record<string, string> | null
      requested_fields: string[] | null
    }>()
  if (error) return { ok: false, error: error.message }
  if (!design) return { ok: false, error: 'Design job not found.' }

  const mergedResult = mergeCardDesignerValues(design.field_values, values)
  if (!mergedResult.ok) return mergedResult
  const merged = mergedResult.values

  // Anything now answered is no longer outstanding.
  const stillOutstanding = (design.requested_fields ?? []).filter((role) => !merged[role])

  const { error: updateError } = await supabase
    .from('invitation_card_designs')
    .update({
      field_values: merged,
      requested_fields: stillOutstanding,
      ...(stillOutstanding.length === 0 && (design.requested_fields ?? []).length > 0
        ? { info_received_at: new Date().toISOString(), status: 'in_design' }
        : {}),
    })
    .eq('id', designId)
  if (updateError) return { ok: false, error: updateError.message }

  revalidatePath('/opus-pass/digital-cards/designer')
  revalidatePath(`/opus-pass/digital-cards/designer/${designId}`)
  return { ok: true }
}

/**
 * Save corrections to an already-released card and publish them as a new,
 * immutable release.
 *
 * The existing release is never overwritten: invitations already sent keep
 * resolving to the version they received, while OpusPass previews and future
 * guest assets follow the design's new current_release_id.
 */
export async function saveAndPublishReleasedDesign(
  designId: string,
  values: Record<string, string>,
): Promise<Result> {
  await requirePermission('cms.publish')
  const supabase = createSupabaseAdminClient()
  const author = (await getCallerEmail()) ?? 'unknown'
  const now = new Date().toISOString()

  const { data: design, error } = await supabase
    .from('invitation_card_designs')
    .select('id, order_id, status, assigned_to, product_name, field_values, requested_fields')
    .eq('id', designId)
    .maybeSingle<
      DesignRow & {
        field_values: Record<string, string> | null
        requested_fields: string[] | null
      }
    >()
  if (error) return { ok: false, error: error.message }
  if (!design) return { ok: false, error: 'Design job not found.' }
  if (design.status !== 'ready' && design.status !== 'delivered') {
    return { ok: false, error: 'Only an already-released card can be published as an update.' }
  }
  if (await isSelfReview(supabase, design.assigned_to, author)) {
    return {
      ok: false,
      error: 'You are assigned to this card, so another publisher must release the update.',
    }
  }

  const mergedResult = mergeCardDesignerValues(design.field_values, values)
  if (!mergedResult.ok) return mergedResult
  const merged = mergedResult.values
  const stillOutstanding = (design.requested_fields ?? []).filter((role) => !merged[role])

  const { data: savedDesign, error: updateError } = await supabase
    .from('invitation_card_designs')
    .update({
      field_values: merged,
      requested_fields: stillOutstanding,
      ...(stillOutstanding.length === 0 && (design.requested_fields ?? []).length > 0
        ? { info_received_at: now }
        : {}),
    })
    .eq('id', designId)
    .eq('status', design.status)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (updateError) return { ok: false, error: updateError.message }
  if (!savedDesign) {
    return { ok: false, error: 'The card stage changed while you were editing. Refresh and try again.' }
  }

  const released = await releaseApprovedDesign(supabase, design, author, now)
  if (!released.ok) {
    return {
      ok: false,
      error: `Your values were saved, but the updated card was not published: ${released.error}`,
    }
  }

  // A card that had already been handed over comes back to Ready, and that is
  // the honest state: what the couple is holding is now the SUPERSEDED release.
  // Leaving the job at "delivered" would assert that the version now current
  // had been delivered, which is exactly the kind of quiet lie this pipeline
  // exists to prevent. Say it out loud instead of letting the stage slide back
  // without explanation.
  const wasDelivered = design.status === 'delivered'
  await recordDesignEvent(supabase, {
    designId,
    author,
    body: wasDelivered
      ? 'Published updated card release, superseding the version already delivered'
      : 'Published updated card release',
    fromStatus: design.status,
    toStatus: 'ready',
  })
  await syncOrderStage(supabase, design.order_id, now)

  revalidatePath('/opus-pass/digital-cards/designer')
  revalidatePath(`/opus-pass/digital-cards/designer/${designId}`)
  if (!wasDelivered) return released
  const supersedeWarning = released.warning ? `${released.warning} ` : ''
  return {
    ok: true,
    warning: `${supersedeWarning}This card had already been delivered, so it is back at Ready. Send the couple the updated card, then mark it delivered again.`,
  }
}
