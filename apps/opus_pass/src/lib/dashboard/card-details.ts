import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase'
import { getOrdersForUser } from '@/lib/payments/orders'
import { requireDashboardUser } from './auth'

// The details our team needs from a couple before their card can be drawn.
//
// The questions are chosen per card by a designer in the admin (they depend on
// which text layers that artwork actually has), so this surface never invents
// its own field list — it only renders what was asked for.

export { cardFieldLabel } from './card-details-labels'

export type CardDetailRequest = {
  designId: string
  orderRef: string
  cardName: string
  cardImage: string | null
  /** Roles still outstanding, in the admin's order. */
  requested: string[]
  /** Answers already recorded, so a couple can see and correct them. */
  values: Record<string, string>
  requestedAt: string | null
}

type DesignRow = {
  id: string
  order_id: string
  product_id: string
  product_name: string
  requested_fields: string[] | null
  field_values: Record<string, string> | null
  info_requested_at: string | null
}

/**
 * Outstanding detail requests for the signed-in couple.
 *
 * Ownership comes from getOrdersForUser — the same user/email/phone matching
 * the orders dashboard uses, including guest checkouts — so a couple can never
 * be shown, or write to, a design job attached to someone else's order.
 */
export async function getCardDetailRequests(): Promise<CardDetailRequest[]> {
  const user = await requireDashboardUser()
  const supabase = createSupabaseServerClient()

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone')
    .eq('user_id', user.id)
    .maybeSingle<{ whatsapp_phone: string | null }>()

  const orders = await getOrdersForUser(user.id, user.email, profile?.whatsapp_phone ?? null)
  if (orders.length === 0) return []

  const orderRefs = new Map(orders.map((o) => [o.id, o.ref]))

  const { data: designData } = await supabase
    .from('invitation_card_designs')
    .select('id, order_id, product_id, product_name, requested_fields, field_values, info_requested_at')
    .in('order_id', [...orderRefs.keys()])
    .eq('status', 'awaiting_info')

  const designs = ((designData ?? []) as DesignRow[]).filter(
    (d) => (d.requested_fields ?? []).length > 0,
  )
  if (designs.length === 0) return []

  const { data: products } = await supabase
    .from('website_invitations_products')
    .select('id, image_url')
    .in('id', [...new Set(designs.map((d) => d.product_id))])
  const images = new Map(
    ((products ?? []) as { id: string; image_url: string | null }[]).map((p) => [p.id, p.image_url]),
  )

  return designs.map((design) => ({
    designId: design.id,
    orderRef: orderRefs.get(design.order_id) ?? '',
    cardName: design.product_name || design.product_id,
    cardImage: images.get(design.product_id) ?? null,
    requested: design.requested_fields ?? [],
    values: design.field_values ?? {},
    requestedAt: design.info_requested_at,
  }))
}

/**
 * Save a couple's answers.
 *
 * Re-checks ownership rather than trusting the designId from the form, and
 * only accepts roles that were actually asked for — otherwise a crafted request
 * could write arbitrary keys into the design.
 */
export async function submitCardDetails(
  designId: string,
  answers: Record<string, string>,
): Promise<{ ok: true; remaining: number } | { ok: false; error: string }> {
  const user = await requireDashboardUser()
  const supabase = createSupabaseServerClient()

  const { data: design } = await supabase
    .from('invitation_card_designs')
    .select('id, order_id, requested_fields, field_values')
    .eq('id', designId)
    .maybeSingle<DesignRow>()
  if (!design) return { ok: false, error: 'That request no longer exists.' }

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone')
    .eq('user_id', user.id)
    .maybeSingle<{ whatsapp_phone: string | null }>()
  const orders = await getOrdersForUser(user.id, user.email, profile?.whatsapp_phone ?? null)
  if (!orders.some((o) => o.id === design.order_id)) {
    return { ok: false, error: 'That request belongs to a different account.' }
  }

  const asked = new Set(design.requested_fields ?? [])
  const merged = { ...(design.field_values ?? {}) }
  for (const [role, value] of Object.entries(answers)) {
    // Silently ignoring an unexpected key would hide a bug; refusing is louder.
    if (!asked.has(role)) return { ok: false, error: `"${role}" was not requested.` }
    const trimmed = String(value ?? '').trim()
    if (trimmed) merged[role] = trimmed
  }

  const remaining = [...asked].filter((role) => !merged[role])

  const { error } = await supabase
    .from('invitation_card_designs')
    .update({
      field_values: merged,
      requested_fields: remaining,
      // Only hand the job back to the designer once nothing is outstanding —
      // a partial answer keeps it in the couple's court.
      ...(remaining.length === 0
        ? { info_received_at: new Date().toISOString(), status: 'in_design' }
        : {}),
    })
    .eq('id', designId)
  if (error) return { ok: false, error: error.message }

  return { ok: true, remaining: remaining.length }
}

// ── Token-addressed access ────────────────────────────────────────────────
//
// The same request, reachable without signing in. A couple gets this link over
// WhatsApp and taps it on their phone; forcing a sign-in at that moment loses
// most of them. The token IS the authorisation, so it must be unguessable
// (24 random bytes, minted by the admin) and the page must never be indexed.
//
// Deliberately narrow: a token resolves to exactly one design job, exposes only
// that job's requested fields, and accepts only those fields back. It carries
// no session and grants nothing else.

export type TokenCardDetailRequest = CardDetailRequest & {
  /** Shown so the couple knows whose wedding this is before they type. */
  coupleName: string | null
}

export async function getCardDetailRequestByToken(
  token: string,
): Promise<TokenCardDetailRequest | null> {
  const clean = token.trim()
  if (!clean) return null

  const supabase = createSupabaseServerClient()
  const { data: design } = await supabase
    .from('invitation_card_designs')
    .select(
      'id, order_id, product_id, product_name, requested_fields, field_values, info_requested_at, status',
    )
    .eq('share_token', clean)
    .maybeSingle<DesignRow & { status: string }>()
  if (!design) return null

  const [{ data: order }, { data: product }] = await Promise.all([
    supabase
      .from('invitation_orders')
      .select('ref, contact_name')
      .eq('id', design.order_id)
      .maybeSingle<{ ref: string; contact_name: string | null }>(),
    supabase
      .from('website_invitations_products')
      .select('image_url')
      .eq('id', design.product_id)
      .maybeSingle<{ image_url: string | null }>(),
  ])

  return {
    designId: design.id,
    orderRef: order?.ref ?? '',
    cardName: design.product_name || design.product_id,
    cardImage: product?.image_url ?? null,
    requested: design.requested_fields ?? [],
    values: design.field_values ?? {},
    requestedAt: design.info_requested_at,
    coupleName: order?.contact_name ?? null,
  }
}

/**
 * Save answers against a token rather than a session.
 *
 * Mirrors submitCardDetails' guarantees without the sign-in: only fields that
 * were actually requested are accepted, so a crafted request can't write
 * arbitrary keys, and the token is re-resolved here rather than trusting any
 * design id from the form.
 */
export async function submitCardDetailsByToken(
  token: string,
  answers: Record<string, string>,
): Promise<{ ok: true; remaining: number } | { ok: false; error: string }> {
  const supabase = createSupabaseServerClient()
  const { data: design } = await supabase
    .from('invitation_card_designs')
    .select('id, requested_fields, field_values')
    .eq('share_token', token.trim())
    .maybeSingle<DesignRow>()
  if (!design) return { ok: false, error: 'This link is no longer valid.' }

  const asked = new Set(design.requested_fields ?? [])
  const merged = { ...(design.field_values ?? {}) }
  for (const [role, value] of Object.entries(answers)) {
    if (!asked.has(role)) return { ok: false, error: `"${role}" was not requested.` }
    const trimmed = String(value ?? '').trim()
    if (trimmed) merged[role] = trimmed
  }

  const remaining = [...asked].filter((role) => !merged[role])

  const { error } = await supabase
    .from('invitation_card_designs')
    .update({
      field_values: merged,
      requested_fields: remaining,
      ...(remaining.length === 0
        ? { info_received_at: new Date().toISOString(), status: 'in_design' }
        : {}),
    })
    .eq('id', design.id)
  if (error) return { ok: false, error: error.message }

  return { ok: true, remaining: remaining.length }
}
