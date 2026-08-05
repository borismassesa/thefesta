import 'server-only'

import { requestableFields, type CardFieldBinding } from '@opusfesta/lib'

import { createSupabaseServerClient } from '@/lib/supabase'
import { getOrdersForUser } from '@/lib/payments/orders'
import { requireDashboardUser } from './auth'
import { notifyChangeRequested } from './card-change-notify'

// The content that goes on a couple's cards, filled in by the couple.
//
// This surface is driven by what they BOUGHT, not by whether a designer has got
// round to asking. Every paid card line gets an editor as soon as the order is
// paid, seeded with the fields that card's artwork can actually hold, and the
// couple sends it to the design team when they're ready.
//
// The field list is still never invented here. It comes from the card's own
// layer bindings (requestableFields), so a question is only ever asked when
// there is a layer on that artwork to print the answer into.

export { cardFieldLabel } from './card-details-labels'

/** Design statuses where the card is already out and its content is fixed. */
const RELEASED = new Set(['ready', 'delivered'])

export type CardDetailField = {
  role: string
  /** True when a designer explicitly asked for this one — worth flagging. */
  requested: boolean
}

export type CardDetailCard = {
  /** Null until anything has been saved for this line. */
  designId: string | null
  orderId: string
  /** 1-based position in invitation_orders.items, the design job's key. */
  lineIndex: number
  orderRef: string
  cardName: string
  cardImage: string | null
  /** Catalogue category ("Wedding invitation"), for the header. */
  category: string | null
  /**
   * The card's layer→role mapping, sent to the browser so the live preview can
   * re-render locally as the couple types instead of asking the server to
   * re-render a 2 MB SVG on every keystroke.
   *
   * Layer ids and role keys only. It reveals nothing about the couple, and the
   * save path re-derives its own accepted field list from this same mapping
   * server-side, so a tampered copy buys nothing.
   */
  bindings: CardFieldBinding[]
  /** False when no SVG is attached yet, so the form can skip the preview. */
  hasArtwork: boolean
  /** Every field this artwork can hold, in the reading order of the card. */
  fields: CardDetailField[]
  /** What we hold today, so the couple can check and correct it. */
  values: Record<string, string>
  /** Content is on a card guests already have, so it can no longer be edited. */
  locked: boolean
  /** Set once the couple has sent this card's details to the design team. */
  submittedAt: string | null
  requestedAt: string | null
  /**
   * When the couple last asked for a change to the released card, so the form
   * can say "we have this" instead of offering the box again and leaving them
   * unsure whether the first one arrived.
   */
  changeRequestedAt: string | null
}

type DesignRow = {
  id: string
  order_id: string
  line_index: number
  product_id: string
  status: string
  requested_fields: string[] | null
  field_values: Record<string, string> | null
  info_requested_at: string | null
  info_received_at: string | null
  change_requested_at: string | null
}

type ProductRow = {
  id: string
  image_url: string | null
  artwork_svg_url: string | null
  field_bindings: CardFieldBinding[] | null
  category: string | null
}

/** An SVG is the only artwork a live preview can write text into. */
function isPreviewable(artworkSvgUrl: string | null | undefined): boolean {
  return Boolean(artworkSvgUrl?.trim() && /\.svg(\?|#|$)/i.test(artworkSvgUrl))
}

type OrderLine = { id?: string; name?: string }

/**
 * Every card the signed-in couple has paid for, with its content editor.
 *
 * Ownership comes from getOrdersForUser — the same user/email/phone matching
 * the orders dashboard uses, including guest checkouts — so a couple can never
 * be shown, or write to, a card attached to someone else's order.
 */
export async function getPurchasedCardDetails(): Promise<CardDetailCard[]> {
  const user = await requireDashboardUser()
  const supabase = createSupabaseServerClient()

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone')
    .eq('user_id', user.id)
    .maybeSingle<{ whatsapp_phone: string | null }>()

  const orders = (
    await getOrdersForUser(user.id, user.email, profile?.whatsapp_phone ?? null)
  ).filter(
    // Only paid purchases have a card to personalise. A top-up buys extra
    // capacity on a card that was designed once already, so it has no content
    // of its own and must not appear here as a second, empty editor.
    (order) => order.status === 'paid' && order.order_kind === 'purchase',
  )
  if (orders.length === 0) return []

  const lines = orders.flatMap((order) =>
    (Array.isArray(order.items) ? (order.items as OrderLine[]) : []).map((item, i) => ({
      orderId: order.id,
      orderRef: order.ref,
      // 1-based, matching SQL ordinality and the design job's line_index.
      lineIndex: i + 1,
      productId: item.id ?? '',
      productName: item.name ?? '',
    })),
  )
  if (lines.length === 0) return []

  const [{ data: designData }, { data: productData }] = await Promise.all([
    supabase
      .from('invitation_card_designs')
      .select(
        'id, order_id, line_index, product_id, status, requested_fields, field_values, info_requested_at, info_received_at, change_requested_at',
      )
      .in('order_id', [...new Set(lines.map((l) => l.orderId))]),
    supabase
      .from('website_invitations_products')
      .select('id, image_url, artwork_svg_url, field_bindings, category')
      .in('id', [...new Set(lines.map((l) => l.productId).filter(Boolean))]),
  ])

  const designs = new Map(
    ((designData ?? []) as DesignRow[]).map((d) => [`${d.order_id}:${d.line_index}`, d]),
  )
  const products = new Map(((productData ?? []) as ProductRow[]).map((p) => [p.id, p]))

  return lines
    .map((line) => {
      const product = products.get(line.productId)
      const design = designs.get(`${line.orderId}:${line.lineIndex}`)
      const asked = new Set(design?.requested_fields ?? [])

      const fields = requestableFields(
        product?.field_bindings ?? [],
        product?.category ?? null,
      ).map((field) => ({ role: field.role.key, requested: asked.has(field.role.key) }))

      return {
        designId: design?.id ?? null,
        orderId: line.orderId,
        lineIndex: line.lineIndex,
        orderRef: line.orderRef,
        cardName: line.productName || line.productId,
        cardImage: product?.image_url ?? null,
        category: product?.category ?? null,
        bindings: product?.field_bindings ?? [],
        hasArtwork: isPreviewable(product?.artwork_svg_url),
        fields,
        values: design?.field_values ?? {},
        locked: RELEASED.has(design?.status ?? ''),
        changeRequestedAt: design?.change_requested_at ?? null,
        submittedAt: design?.info_received_at ?? null,
        requestedAt: design?.info_requested_at ?? null,
      }
    })
    // A card whose artwork has no live text layers yet has nothing to ask. An
    // empty editor would read as "we lost your card", so it stays off the page
    // until an admin has mapped the artwork.
    .filter((card) => card.fields.length > 0)
}

/**
 * How many purchased cards still have something for the couple to type.
 *
 * Used by the waiting state on Send invites, where "your designer is waiting on
 * you" outranks every other suggestion — so it counts cards with a blank field,
 * not cards a designer has got round to asking about.
 */
export async function countCardsNeedingDetails(): Promise<number> {
  const cards = await getPurchasedCardDetails()
  return cards.filter(
    (card) => !card.locked && card.fields.some((field) => !card.values[field.role]),
  ).length
}

/**
 * Send one card's content to the design team.
 *
 * Addressed by ORDER LINE rather than by design id, because the couple can now
 * be first: on a card no designer has opened there is no row yet, and trusting
 * an id from the form would be the one thing that lets a crafted request write
 * into someone else's card. The line is re-checked against the couple's own
 * paid orders here, and the accepted field list is re-derived from the card's
 * artwork, so neither can be supplied by the browser.
 */
export async function submitCardDetails(
  orderId: string,
  lineIndex: number,
  answers: Record<string, string>,
): Promise<{ ok: true; filled: number } | { ok: false; error: string }> {
  const user = await requireDashboardUser()
  const supabase = createSupabaseServerClient()

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone')
    .eq('user_id', user.id)
    .maybeSingle<{ whatsapp_phone: string | null }>()

  const orders = await getOrdersForUser(user.id, user.email, profile?.whatsapp_phone ?? null)
  const order = orders.find((o) => o.id === orderId)
  if (!order) return { ok: false, error: 'That card belongs to a different account.' }
  if (order.status !== 'paid' || order.order_kind !== 'purchase') {
    return { ok: false, error: 'That order has no card to personalise.' }
  }

  const items = Array.isArray(order.items) ? (order.items as OrderLine[]) : []
  const item = items[lineIndex - 1]
  if (!item) return { ok: false, error: 'That card is no longer on this order.' }

  const { data: product } = await supabase
    .from('website_invitations_products')
    .select('field_bindings, category')
    .eq('id', item.id ?? '')
    .maybeSingle<{ field_bindings: CardFieldBinding[] | null; category: string | null }>()

  const fillable = new Set(
    requestableFields(product?.field_bindings ?? [], product?.category ?? null).map(
      (f) => f.role.key,
    ),
  )

  const { data: design } = await supabase
    .from('invitation_card_designs')
    .select('id, status, field_values, requested_fields')
    .eq('order_id', orderId)
    .eq('line_index', lineIndex)
    .maybeSingle<{
      id: string
      status: string
      field_values: Record<string, string> | null
      requested_fields: string[] | null
    }>()

  if (design && RELEASED.has(design.status)) {
    return {
      ok: false,
      error: 'This card has already been sent out, so its details can no longer be changed here.',
    }
  }

  // Merge rather than replace: a designer may have corrected a value, and a
  // second save of one field must not wipe the other thirteen.
  const merged = { ...(design?.field_values ?? {}) }
  for (const [role, value] of Object.entries(answers)) {
    // Silently ignoring an unexpected key would hide a bug; refusing is louder.
    if (!fillable.has(role)) return { ok: false, error: `"${role}" is not a field on this card.` }
    const trimmed = String(value ?? '').trim()
    if (trimmed) merged[role] = trimmed
    else delete merged[role]
  }

  // Anything a designer asked for and has now been answered stops being
  // outstanding; whatever is still blank stays on their list.
  const stillOutstanding = (design?.requested_fields ?? []).filter((role) => !merged[role])
  const now = new Date().toISOString()

  const { error } = await supabase.from('invitation_card_designs').upsert(
    {
      order_id: orderId,
      line_index: lineIndex,
      product_id: item.id ?? '',
      product_name: item.name ?? '',
      field_values: merged,
      requested_fields: stillOutstanding,
      info_received_at: now,
      // Never touched: `status` and `started_at`. A couple sending their
      // content does not put the job into design — a designer still has to
      // pick it up — and quantities are copied from the order at that moment
      // so a print run can't be changed by this write.
    },
    { onConflict: 'order_id,line_index' },
  )
  if (error) return { ok: false, error: error.message }

  return { ok: true, filled: Object.keys(merged).length }
}

/** Long enough to be useful to a designer, short enough not to be an essay. */
const CHANGE_REQUEST_MAX = 1000

/**
 * Ask for a change to a card that has already been released.
 *
 * The couple's editor locks on release: every field is disabled and there is no
 * submit. That is correct — the released file is what guests are being served,
 * and it must not move under them — but it left the couple with nowhere to go
 * except a sentence telling them to message us, which recorded nothing.
 *
 * What this does NOT do, deliberately:
 *
 *   It does not change `status`, and it does not touch the release. A card at
 *   'ready' or 'delivered' is what OpusPass resolves guest cards from, so
 *   pulling it out of those statuses on a couple's say-so would break the card
 *   for every guest already holding a link while the order still claims it was
 *   delivered. A request is a fact ABOUT the job, not a transition OF it.
 *
 *   It does not edit field_values. The designer decides what to change and
 *   republishes through the reviewed path; letting this write values directly
 *   would put uncontrolled edits behind a released, approved artefact.
 *
 * So it appends to the history and raises a flag. Staff answer it by
 * republishing, which is what clears the flag.
 */
export async function requestCardChange(
  orderId: string,
  lineIndex: number,
  message: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const note = message.trim()
  if (!note) return { ok: false, error: 'Tell us what needs changing.' }

  const user = await requireDashboardUser()
  const supabase = createSupabaseServerClient()

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone')
    .eq('user_id', user.id)
    .maybeSingle<{ whatsapp_phone: string | null }>()

  // Same ownership check the save path uses: resolve the caller's own orders
  // and look for this one among them, rather than trusting the id from the
  // browser. The client is service-role, so this IS the authorisation.
  const orders = await getOrdersForUser(user.id, user.email, profile?.whatsapp_phone ?? null)
  const order = orders.find((o) => o.id === orderId)
  if (!order) return { ok: false, error: 'That card belongs to a different account.' }

  const { data: design } = await supabase
    .from('invitation_card_designs')
    .select('id, status, product_name')
    .eq('order_id', orderId)
    .eq('line_index', lineIndex)
    .maybeSingle<{ id: string; status: string; product_name: string }>()
  if (!design) return { ok: false, error: 'That card is no longer on this order.' }

  // Only once locked. Before release the couple can still edit the fields
  // themselves, and a second channel there would compete with the very form
  // the designer is working from.
  if (!RELEASED.has(design.status)) {
    return {
      ok: false,
      error: 'This card is still being made, so you can edit its details directly above.',
    }
  }

  const now = new Date().toISOString()
  const { error: eventError } = await supabase.from('invitation_card_design_events').insert({
    design_id: design.id,
    kind: 'note',
    // The couple, not a staff member. Every other author in this log is an
    // admin email, so the address alone would read as one of ours.
    author: `${user.email} (couple)`,
    body: note.slice(0, CHANGE_REQUEST_MAX),
  })
  // The event IS the request. If it could not be written there is nothing for
  // staff to read, so this fails rather than reporting a request nobody has.
  if (eventError) return { ok: false, error: 'We could not send that just now. Please try again.' }

  const { error: flagError } = await supabase
    .from('invitation_card_designs')
    .update({ change_requested_at: now })
    .eq('id', design.id)
  if (flagError) {
    // The note landed, so the request exists and telling the couple it failed
    // would be a lie that makes them send it twice. What is missing is only the
    // queue badge, which is an operator problem — hence a log rather than an
    // error, and hence not swallowed silently either.
    console.error('[card-details] change request flag not set', {
      designId: design.id,
      message: flagError.message,
    })
  }

  // Best-effort and awaited: the queue badge is a passive signal, and a request
  // nobody is told about waits for someone to happen to look.
  await notifyChangeRequested({
    designId: design.id,
    cardName: design.product_name || 'your card',
    orderRef: order.ref ?? '',
    coupleEmail: user.email,
    message: note.slice(0, CHANGE_REQUEST_MAX),
  })

  return { ok: true }
}

// ── Token-addressed access ────────────────────────────────────────────────
//
// The same content, reachable without signing in. A couple gets this link over
// WhatsApp and taps it on their phone; forcing a sign-in at that moment loses
// most of them. The token IS the authorisation, so it must be unguessable
// (24 random bytes, minted by the admin) and the page must never be indexed.
//
// Deliberately narrow: a token resolves to exactly one card, exposes only that
// card's fields, and accepts only those fields back. It carries no session and
// grants nothing else.

export type TokenCardDetailCard = CardDetailCard & {
  /** Shown so the couple knows whose wedding this is before they type. */
  coupleName: string | null
}

export async function getCardDetailRequestByToken(
  token: string,
): Promise<TokenCardDetailCard | null> {
  const clean = token.trim()
  if (!clean) return null

  const supabase = createSupabaseServerClient()
  const { data: design } = await supabase
    .from('invitation_card_designs')
    .select(
      'id, order_id, line_index, product_id, product_name, status, requested_fields, field_values, info_requested_at, info_received_at, change_requested_at',
    )
    .eq('share_token', clean)
    .maybeSingle<DesignRow & { product_name: string }>()
  if (!design) return null

  const [{ data: order }, { data: product }] = await Promise.all([
    supabase
      .from('invitation_orders')
      .select('ref, contact_name')
      .eq('id', design.order_id)
      .maybeSingle<{ ref: string; contact_name: string | null }>(),
    supabase
      .from('website_invitations_products')
      .select('image_url, artwork_svg_url, field_bindings, category')
      .eq('id', design.product_id)
      .maybeSingle<{
        image_url: string | null
        artwork_svg_url: string | null
        field_bindings: CardFieldBinding[] | null
        category: string | null
      }>(),
  ])

  const asked = new Set(design.requested_fields ?? [])

  return {
    designId: design.id,
    orderId: design.order_id,
    lineIndex: design.line_index,
    orderRef: order?.ref ?? '',
    cardName: design.product_name || design.product_id,
    cardImage: product?.image_url ?? null,
    category: product?.category ?? null,
    bindings: product?.field_bindings ?? [],
    hasArtwork: isPreviewable(product?.artwork_svg_url),
    fields: requestableFields(
      product?.field_bindings ?? [],
      product?.category ?? null,
    ).map((field) => ({ role: field.role.key, requested: asked.has(field.role.key) })),
    values: design.field_values ?? {},
    locked: RELEASED.has(design.status),
    changeRequestedAt: design.change_requested_at ?? null,
    submittedAt: design.info_received_at,
    requestedAt: design.info_requested_at,
    coupleName: order?.contact_name ?? null,
  }
}

/**
 * Save answers against a token rather than a session.
 *
 * Mirrors submitCardDetails' guarantees without the sign-in: only fields this
 * card's artwork actually has are accepted, so a crafted request can't write
 * arbitrary keys, and the token is re-resolved here rather than trusting any
 * identifier from the form.
 */
export async function submitCardDetailsByToken(
  token: string,
  answers: Record<string, string>,
): Promise<{ ok: true; filled: number } | { ok: false; error: string }> {
  const supabase = createSupabaseServerClient()
  const { data: design } = await supabase
    .from('invitation_card_designs')
    .select('id, product_id, status, requested_fields, field_values')
    .eq('share_token', token.trim())
    .maybeSingle<{
      id: string
      product_id: string
      status: string
      requested_fields: string[] | null
      field_values: Record<string, string> | null
    }>()
  if (!design) return { ok: false, error: 'This link is no longer valid.' }

  if (RELEASED.has(design.status)) {
    return {
      ok: false,
      error: 'This card has already been sent out, so its details can no longer be changed here.',
    }
  }

  const { data: product } = await supabase
    .from('website_invitations_products')
    .select('field_bindings, category')
    .eq('id', design.product_id)
    .maybeSingle<{ field_bindings: CardFieldBinding[] | null; category: string | null }>()

  const fillable = new Set(
    requestableFields(product?.field_bindings ?? [], product?.category ?? null).map(
      (f) => f.role.key,
    ),
  )

  const merged = { ...(design.field_values ?? {}) }
  for (const [role, value] of Object.entries(answers)) {
    if (!fillable.has(role)) return { ok: false, error: `"${role}" is not a field on this card.` }
    const trimmed = String(value ?? '').trim()
    if (trimmed) merged[role] = trimmed
    else delete merged[role]
  }

  const stillOutstanding = (design.requested_fields ?? []).filter((role) => !merged[role])

  const { error } = await supabase
    .from('invitation_card_designs')
    .update({
      field_values: merged,
      requested_fields: stillOutstanding,
      info_received_at: new Date().toISOString(),
    })
    .eq('id', design.id)
  if (error) return { ok: false, error: error.message }

  return { ok: true, filled: Object.keys(merged).length }
}

// ── Live preview ──────────────────────────────────────────────────────────

/** Which card a preview request is asking about, in either addressing scheme. */
export type CardArtworkSource =
  | { token: string }
  | { orderId: string; lineIndex: number }

/**
 * The artwork file behind one card the caller is entitled to see.
 *
 * The preview routes serve bytes, so ownership is re-established here rather
 * than trusted from the query string: a token is re-resolved against its own
 * design row, and an order line is re-checked against the signed-in couple's
 * paid orders — the same two gates the save paths use. Returns null for
 * "not yours" and "no such card" alike, so neither answer confirms the other.
 */
export async function resolveCardArtworkUrl(
  source: CardArtworkSource,
): Promise<string | null> {
  const supabase = createSupabaseServerClient()

  let productId: string | null = null

  if ('token' in source) {
    const clean = source.token.trim()
    if (!clean) return null
    const { data: design } = await supabase
      .from('invitation_card_designs')
      .select('product_id')
      .eq('share_token', clean)
      .maybeSingle<{ product_id: string }>()
    productId = design?.product_id ?? null
  } else {
    const user = await requireDashboardUser()
    const { data: profile } = await supabase
      .from('couple_profiles')
      .select('whatsapp_phone')
      .eq('user_id', user.id)
      .maybeSingle<{ whatsapp_phone: string | null }>()

    const orders = await getOrdersForUser(user.id, user.email, profile?.whatsapp_phone ?? null)
    const order = orders.find((o) => o.id === source.orderId)
    if (!order || order.status !== 'paid' || order.order_kind !== 'purchase') return null

    const items = Array.isArray(order.items) ? (order.items as OrderLine[]) : []
    productId = items[source.lineIndex - 1]?.id ?? null
  }

  if (!productId) return null

  const { data: product } = await supabase
    .from('website_invitations_products')
    .select('artwork_svg_url')
    .eq('id', productId)
    .maybeSingle<{ artwork_svg_url: string | null }>()

  return isPreviewable(product?.artwork_svg_url) ? (product?.artwork_svg_url as string) : null
}

/**
 * Read a preview request's addressing off the query string.
 *
 * Returns null for a malformed request rather than guessing, so a missing
 * `line` can never be read as line 1 of someone's order.
 */
export function readCardArtworkSource(params: URLSearchParams): CardArtworkSource | null {
  const token = params.get('token')?.trim()
  if (token) return { token }

  const orderId = params.get('order')?.trim()
  const lineIndex = Number(params.get('line'))
  if (!orderId || !Number.isInteger(lineIndex) || lineIndex < 1) return null
  return { orderId, lineIndex }
}
