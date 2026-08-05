// No 'server-only' marker here, matching lib/cards/prepare-guest-asset.ts: the
// tests exercise this module directly, and the marker throws under the CJS test
// runner. Server-only-ness is still enforced — the lazily imported
// '@/lib/supabase' carries the marker, so a client component that reached this
// code would trip it. The quantity rules a client component DOES need live in
// ./topup-quantity, which is pure by design.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Treatment } from '@/components/guests/InvitationVisual'
import type { InitiateItem } from './types'
import { validateTopupGuests } from './topup-quantity'

// Resolving what a top-up actually buys.
//
// The browser sends two things and only two things: which released card, and
// how many guests. Everything that has consequences — the event, the card
// identity, the tier, the per-guest price, the release the extra guests will
// receive — is looked up here from the parent order. A top-up request that
// carried its own price or its own event_id would be a request to charge an
// arbitrary amount and credit an arbitrary event.
//
// "Which released card" is itself validated, not trusted: the id names a
// design release, and the release has to belong to a paid, non-refunded,
// released order that this couple owns and that is scoped to this event.

/** One card the couple can top up: a released design on a paid parent order. */
export interface TopupCandidate {
  /** invitation_card_design_releases.id — pinned onto the top-up order. */
  releaseId: string
  /** The design job this release came from — used for the preview URL. */
  designId: string
  /** The original purchase. Never itself a top-up. */
  parentOrderId: string
  parentRef: string
  cardName: string
  cardTier: string | null
  cardImageUrl: string | null
  cardTreatment: Treatment | null
  /** Authenticated preview of the frozen artwork — what the couple will see. */
  previewUrl: string
  /** TZS per guest, inherited. See resolveTopupUnitPrice. */
  unitPrice: number
  /** Guests the parent order itself bought — context for the picker. */
  parentGuests: number
  releasedAt: string | null
}

type DesignRow = {
  id: string
  order_id: string
  line_index: number
  product_name: string | null
  current_release_id: string | null
  released_at: string | null
}

type ParentOrderRow = {
  id: string
  ref: string
  user_id: string | null
  event_id: string | null
  status: string
  fulfillment_status: string
  order_kind: string | null
  items: InitiateItem[] | null
}

/** Just enough of the Supabase client for this module — the seam tests inject
 *  through. The real service-role client satisfies it without a cast. */
export type TopupClient = Pick<SupabaseClient, 'from'>

/** Fulfillment states that mean the card is released and sendable. Mirrors
 *  isOrderReleasedForInvites in lib/dashboard/queries.ts — a card that is not
 *  released has nothing to top up. */
const RELEASED = new Set(['ready', 'delivered'])

/**
 * The per-guest rate a top-up is charged at.
 *
 * Taken from what the parent order actually paid (`pricePerGuest`, written by
 * priceOrder at purchase), NOT from today's CMS tier price. The tier price is
 * editable; a couple who bought at 1,500 and tops up after a price rise is
 * topping up their purchase, not making a new one at the new rate. Orders
 * placed before priceOrder recorded pricePerGuest fall back to deriving it
 * from the line total, which is the same number by construction.
 */
function resolveTopupUnitPrice(line: InitiateItem): number | null {
  if (typeof line.pricePerGuest === 'number' && line.pricePerGuest > 0) {
    return Math.round(line.pricePerGuest)
  }
  // Legacy line: recover the rate from what was charged. extrasTotal (prints,
  // swag) is excluded — those are one-off add-ons, not per-guest capacity, and
  // a top-up buys none of them.
  const guests = typeof line.guests === 'number' ? Math.floor(line.guests) : 0
  const extras = Math.max(0, Math.round(Number(line.extrasTotal) || 0))
  const core = Math.round(Number(line.total) || 0) - extras
  if (guests > 0 && core > 0) return Math.round(core / guests)
  return null
}

/** The order line a design job belongs to. line_index is 1-based. */
function lineFor(order: ParentOrderRow, lineIndex: number): InitiateItem | null {
  const items = order.items ?? []
  return items[lineIndex - 1] ?? null
}

/**
 * Every card on this event the couple could top up.
 *
 * Returns one entry per released design, newest release first. An event with
 * two released cards yields two entries, and the caller must make the couple
 * choose — picking "the newest" for them would mean the artwork the extra
 * guests receive is decided by an ordering rule nobody can see.
 */
export async function listTopupCandidates(
  userId: string,
  eventId: string,
  /**
   * Injected only by tests.
   *
   * What matters here is which orders are admitted as parents, and that is
   * expressed as query filters rather than as branches a pure function could
   * be handed. The client is the seam. Production callers omit it.
   */
  client?: TopupClient,
): Promise<TopupCandidate[]> {
  // Imported lazily so '@/lib/supabase''s server-only marker is not evaluated
  // when a caller supplies its own client.
  const supabase = client ?? (await import('@/lib/supabase')).createSupabaseServerClient()

  // Parent orders: this couple's own, paid, released, scoped to this event, and
  // themselves purchases. Guest-checkout matching (email/phone) is deliberately
  // NOT used here — topping up writes a new paid order against a parent, and an
  // order this user has not claimed must not become a parent on a coincidental
  // contact match.
  const { data: orderData, error: orderError } = await supabase
    .from('invitation_orders')
    .select('id, ref, user_id, event_id, status, fulfillment_status, order_kind, items')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .eq('status', 'paid')
    .eq('order_kind', 'purchase')
    .in('fulfillment_status', [...RELEASED])
  if (orderError) throw new Error(`listTopupCandidates orders failed: ${orderError.message}`)

  const orders = new Map<string, ParentOrderRow>()
  for (const row of (orderData ?? []) as ParentOrderRow[]) orders.set(row.id, row)
  if (orders.size === 0) return []

  const { data: designData, error: designError } = await supabase
    .from('invitation_card_designs')
    .select('id, order_id, line_index, product_name, current_release_id, released_at')
    .in('order_id', [...orders.keys()])
    .in('status', ['ready', 'delivered'])
    .not('current_release_id', 'is', null)
    .order('released_at', { ascending: false })
  if (designError) throw new Error(`listTopupCandidates designs failed: ${designError.message}`)

  const candidates: TopupCandidate[] = []
  for (const design of (designData ?? []) as DesignRow[]) {
    const order = orders.get(design.order_id)
    if (!order || !design.current_release_id) continue
    const line = lineFor(order, design.line_index)
    if (!line) continue
    const unitPrice = resolveTopupUnitPrice(line)
    // A line whose rate cannot be established is not offered. Guessing a price
    // is the one failure mode here that takes the wrong amount of money.
    if (unitPrice == null || unitPrice <= 0) continue

    candidates.push({
      releaseId: design.current_release_id,
      designId: design.id,
      parentOrderId: order.id,
      parentRef: order.ref,
      cardName: line.name || design.product_name || 'Your card',
      cardTier: line.tier ?? null,
      cardImageUrl: line.image ?? null,
      cardTreatment: line.treatment ?? null,
      previewUrl: `/api/my/card/${encodeURIComponent(design.id)}`,
      unitPrice,
      parentGuests: typeof line.guests === 'number' ? Math.floor(line.guests) : 0,
      releasedAt: design.released_at,
    })
  }
  return candidates
}

export type TopupResolution =
  | { ok: true; candidate: TopupCandidate; guests: number; unitPrice: number; amount: number }
  | { ok: false; message: string }

/**
 * Turn a (releaseId, guests) request into the exact order that will be written.
 *
 * Every rejection here is a rejection of something the client asked for, so the
 * messages are the ones the couple sees. The quantity rules live in
 * topup-quantity.ts so the stepper and this check cannot drift.
 */
export async function resolveTopup(
  input: {
    userId: string
    eventId: string
    releaseId: string
    guests: unknown
  },
  /** Injected only by tests — see listTopupCandidates. */
  client?: TopupClient,
): Promise<TopupResolution> {
  const quantity = validateTopupGuests(input.guests)
  if (!quantity.ok) {
    return {
      ok: false,
      message:
        quantity.error === 'below_minimum'
          ? 'The smallest top-up is 10 invitations.'
          : quantity.error === 'bad_step'
            ? 'Choose a quantity in steps of 5 (10, 15, 20, and so on).'
            : quantity.error === 'above_maximum'
              ? 'That top-up is larger than we can process online. Please contact us.'
              : 'Choose how many invitations to add.',
    }
  }

  const candidates = await listTopupCandidates(input.userId, input.eventId, client)
  const candidate = candidates.find((c) => c.releaseId === input.releaseId)
  if (!candidate) {
    // Covers every failure the client could have caused: unknown release, a
    // release on another couple's order, another event's card, an unreleased or
    // refunded order, or a release that has since been superseded.
    return { ok: false, message: 'That card is no longer available to top up. Refresh and try again.' }
  }

  return {
    ok: true,
    candidate,
    guests: quantity.guests,
    unitPrice: candidate.unitPrice,
    amount: candidate.unitPrice * quantity.guests,
  }
}

/**
 * The single order line a top-up writes.
 *
 * Shaped to match the parent's card line, because the entitlement query reads
 * `items[].guests` and the dashboard reads name/image/tier off the same array.
 * Add-ons are intentionally absent: a top-up buys sending capacity, not another
 * print run.
 */
export function topupOrderItem(candidate: TopupCandidate, guests: number, amount: number): InitiateItem {
  return {
    id: `topup:${candidate.parentOrderId}:${candidate.releaseId}`,
    name: candidate.cardName,
    summary: `${guests} extra invitations`,
    image: candidate.cardImageUrl ?? undefined,
    treatment: candidate.cardTreatment ?? undefined,
    tier: candidate.cardTier ?? undefined,
    guests,
    pricePerGuest: candidate.unitPrice,
    total: amount,
    kind: 'topup',
  }
}
