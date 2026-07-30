'use server'

import { randomBytes } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requireAdminRole, type AdminAccessRole } from '@/lib/admin-auth'
import { readOrderLine, type OrderLineItem } from '@/lib/cms/order-add-ons'
import {
  CARD_FIELD_ROLE_KEYS,
  requestableFields,
  type CardFieldBinding,
} from '@/lib/cms/card-field-roles'

const DESIGNER_ROLES: AdminAccessRole[] = ['owner', 'admin', 'editor']

type Result = { ok: true } | { ok: false; error: string }

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

const ALLOWED_STATUSES = ['awaiting_info', 'in_design', 'in_review', 'ready', 'delivered'] as const
type DesignStatus = (typeof ALLOWED_STATUSES)[number]

/** Order-level fulfilment stage each design status implies. */
const ORDER_STAGE: Record<DesignStatus, string> = {
  awaiting_info: 'in_progress',
  in_design: 'in_progress',
  in_review: 'in_progress',
  ready: 'ready',
  delivered: 'delivered',
}

export async function setDesignStatus(designId: string, status: string): Promise<Result> {
  await requireAdminRole(DESIGNER_ROLES)
  if (!(ALLOWED_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: `"${status}" is not a valid design status.` }
  }
  const next = status as DesignStatus

  const supabase = createSupabaseAdminClient()
  const now = new Date().toISOString()

  const { data: design, error } = await supabase
    .from('invitation_card_designs')
    .update({
      status: next,
      ...(next === 'ready' ? { ready_at: now } : {}),
      ...(next === 'delivered' ? { delivered_at: now } : {}),
    })
    .eq('id', designId)
    .select('order_id')
    .maybeSingle<{ order_id: string }>()
  if (error) return { ok: false, error: error.message }
  if (!design) return { ok: false, error: 'Design job not found.' }

  // The order shows the couple one progress bar, but an order can hold several
  // cards. It may only advance to a stage every one of its cards has reached —
  // otherwise a couple sees "Design ready" while three of their six cards are
  // still being drawn.
  const { data: siblings } = await supabase
    .from('invitation_card_designs')
    .select('status')
    .eq('order_id', design.order_id)

  const stages = (siblings ?? []).map((s) => ORDER_STAGE[s.status as DesignStatus] ?? 'in_progress')
  const orderStage = stages.includes('in_progress')
    ? 'in_progress'
    : stages.includes('ready')
      ? 'ready'
      : 'delivered'

  await supabase
    .from('invitation_orders')
    .update({ fulfillment_status: orderStage, fulfillment_updated_at: now })
    .eq('id', design.order_id)

  revalidatePath('/opus-pass/digital-cards/designer')
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

  const merged = { ...(design.field_values ?? {}) }
  for (const [role, value] of Object.entries(values)) {
    if (!CARD_FIELD_ROLE_KEYS.includes(role)) {
      return { ok: false, error: `"${role}" is not a known card field.` }
    }
    const trimmed = String(value ?? '').trim()
    // An emptied field is a removal, not a stored empty string — otherwise
    // "answered" counts would include blanks.
    if (trimmed) merged[role] = trimmed
    else delete merged[role]
  }

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
