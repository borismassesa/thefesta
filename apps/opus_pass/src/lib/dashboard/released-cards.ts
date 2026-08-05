import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase'
import { getOrdersForUser, type OrderRow } from '@/lib/payments/orders'
import { requireDashboardUser } from './auth'
import { getWhatsAppEntitlement } from './queries'

// The cards a couple owns, and the one card they are looking at.
//
// Until now a couple never saw their own card. They filled in a form, our team
// drew it, and the only rendered copy lived in whichever designer's browser had
// the job open. "Your design is ready" was an email with an order reference in
// it and nothing else.
//
// What this reads is the FROZEN file written when a reviewer approved the card,
// never a fresh render. That distinction is the whole point: a card must not
// change underneath the couple because the artwork was later re-exported or a
// font licence lapsed.
//
// One deliberate exception, and only one: a publisher correcting an already
// released card (saveAndPublishReleasedDesign in opus_admin) cuts a new release
// and moves release_svg_path, so what this returns does change. That is the
// point of the action. Guest URLs already sent are unaffected, because they
// bind to a specific release id rather than to this column.
//
// WHAT A COUPLE MUST NOT SEE. The design row and its event log are shared with
// the internal designer console, and three fields there are written for us and
// not for them: `notes` (production notes), `review_note` (why a reviewer sent
// artwork back), and `invitation_card_design_events.author` (staff emails).
// Rejection notes are logged as kind='note' with the reviewer's own words as
// the body. None of those columns are selected here, the event feed is filtered
// to kind='system', and even the system bodies are re-worded from the status
// transition rather than echoed. Anything added to these queries later has to
// clear the same bar.

/** Where a card is in production. Mirrors the invitation_card_designs CHECK. */
export type CardStatus = 'awaiting_info' | 'in_design' | 'in_review' | 'ready' | 'delivered'

const CARD_STATUSES: CardStatus[] = [
  'awaiting_info',
  'in_design',
  'in_review',
  'ready',
  'delivered',
]

/** Statuses whose artwork is finished, so a couple may see and download it. */
const RELEASED_STATUSES: CardStatus[] = ['ready', 'delivered']

function asCardStatus(value: string): CardStatus {
  return (CARD_STATUSES as string[]).includes(value) ? (value as CardStatus) : 'in_design'
}

/** One card in the couple's gallery, at any stage of production. */
export type GalleryCard = {
  designId: string
  orderId: string
  orderRef: string
  cardName: string
  /** Catalogue category, e.g. "Wedding Invitations". */
  category: string | null
  status: CardStatus
  /** Catalogue hero. The real artwork is served by its own route once released. */
  cardImage: string | null
  /** True when a frozen artefact exists to render and download. */
  hasArtefact: boolean
  digitalQty: number
  printQty: number
  purchasedAt: string | null
  updatedAt: string | null
  releasedAt: string | null
}

/** One approved version of a card. Newest first; exactly one is current. */
export type CardVersion = {
  id: string
  /** 1-based, oldest release is 1 — what the couple sees as "Version 2". */
  number: number
  releasedAt: string | null
  supersededAt: string | null
  isCurrent: boolean
}

/** A step in the card's life. `at` is null while the step is still ahead. */
export type CardTimelineStep = {
  key: string
  label: string
  at: string | null
  done: boolean
}

/** One couple-facing entry in the card's history. */
export type CardActivityEntry = {
  id: string
  at: string
  label: string
}

/** Guests this specific card can be sent to, and what has been made from it. */
export type CardAllowance = {
  /** The card's own purchase. */
  purchased: number
  /** Extra capacity bought later against this card's releases. */
  toppedUp: number
  total: number
  /** Personalised guest cards rendered from this card's releases. */
  generated: number
  generatedAt: string | null
}

/**
 * Sending figures for the event this card belongs to.
 *
 * Deliberately event-level, not card-level: sends draw on one pool per event
 * and pick the newest released card, so attributing a send to a particular card
 * would be a guess. Labelled as event figures in the UI for the same reason.
 */
export type CardEventUsage = {
  eventId: string
  purchased: number
  used: number
  remaining: number
}

export type CardDetail = GalleryCard & {
  designer: string | null
  /** Theme colours from the catalogue entry. */
  palette: string[]
  infoReceivedAt: string | null
  eventId: string | null
  eventDate: string | null
  allowance: CardAllowance
  eventUsage: CardEventUsage | null
  versions: CardVersion[]
  timeline: CardTimelineStep[]
  activity: CardActivityEntry[]
  /** The release extra guests would be pinned to, when a top-up is possible. */
  topUpReleaseId: string | null
}

type DesignRow = {
  id: string
  order_id: string
  product_id: string
  product_name: string
  digital_qty: number
  print_qty: number
  status: string
  released_at: string | null
  release_svg_path: string | null
  current_release_id: string | null
  info_received_at: string | null
  updated_at: string | null
}

const DESIGN_COLS =
  'id, order_id, product_id, product_name, digital_qty, print_qty, status, released_at, release_svg_path, current_release_id, info_received_at, updated_at'

type ProductRow = {
  id: string
  image_url: string | null
  category: string | null
  designer: string | null
  palettes: unknown
  swatches: unknown
}

/**
 * The orders this couple owns.
 *
 * Ownership comes from getOrdersForUser, the same user/email/phone matching the
 * orders dashboard uses. Scoping on user_id alone would silently hide a card
 * from anyone who checked out as a guest, which is exactly the case that helper
 * exists for.
 */
async function ownedOrders(): Promise<OrderRow[]> {
  const user = await requireDashboardUser()
  const supabase = createSupabaseServerClient()
  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone')
    .eq('user_id', user.id)
    .maybeSingle<{ whatsapp_phone: string | null }>()
  return getOrdersForUser(user.id, user.email, profile?.whatsapp_phone ?? null)
}

/** Hex colours out of the catalogue's palette/swatch arrays, however shaped. */
function readPalette(product: ProductRow | null): string[] {
  const out: string[] = []
  for (const source of [product?.palettes, product?.swatches]) {
    if (!Array.isArray(source)) continue
    for (const entry of source) {
      const value =
        typeof entry === 'string'
          ? entry
          : entry && typeof entry === 'object'
            ? ((entry as Record<string, unknown>).hex ?? (entry as Record<string, unknown>).color)
            : null
      if (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.trim())) {
        const hex = value.trim()
        if (!out.includes(hex)) out.push(hex)
      }
    }
    if (out.length > 0) break
  }
  return out.slice(0, 6)
}

/**
 * Every card the couple has bought, newest purchase first.
 *
 * Unlike the released-only list this replaces, a card in production is included
 * too. A couple whose card is still being drawn had no surface anywhere that
 * answered "where is my card?", and the status is the answer.
 */
export async function getCardGallery(): Promise<GalleryCard[]> {
  const orders = await ownedOrders()
  if (orders.length === 0) return []
  const supabase = createSupabaseServerClient()

  const orderById = new Map(orders.map((o) => [o.id, o]))

  const { data: designData } = await supabase
    .from('invitation_card_designs')
    .select(DESIGN_COLS)
    .in('order_id', [...orderById.keys()])
    .order('created_at', { ascending: false })

  const designs = (designData ?? []) as DesignRow[]
  if (designs.length === 0) return []

  const { data: products } = await supabase
    .from('website_invitations_products')
    .select('id, image_url, category, designer, palettes, swatches')
    .in('id', [...new Set(designs.map((d) => d.product_id))])
  const productById = new Map(((products ?? []) as ProductRow[]).map((p) => [p.id, p]))

  return designs.map((design) => toGalleryCard(design, orderById.get(design.order_id) ?? null, productById.get(design.product_id) ?? null))
}

function toGalleryCard(
  design: DesignRow,
  order: OrderRow | null,
  product: ProductRow | null,
): GalleryCard {
  return {
    designId: design.id,
    orderId: design.order_id,
    orderRef: order?.ref ?? '',
    cardName: design.product_name || design.product_id,
    category: product?.category ?? null,
    status: asCardStatus(design.status),
    cardImage: product?.image_url ?? null,
    // A card released before the freezing step existed has no file. Reported
    // rather than hidden, so it reads as "we owe you this" instead of the card
    // silently not being there.
    hasArtefact: Boolean(design.release_svg_path),
    digitalQty: design.digital_qty,
    printQty: design.print_qty,
    purchasedAt: order?.paid_at ?? order?.created_at ?? null,
    updatedAt: design.updated_at,
    releasedAt: design.released_at,
  }
}

/**
 * Everything the detail page shows for one card.
 *
 * Ownership is re-checked here rather than trusted from the URL: the designId
 * comes from the browser, and a card carries the couple's names, their venue
 * and their contacts. Returns null for "not yours" and "does not exist" alike.
 */
export async function getCardDetail(designId: string): Promise<CardDetail | null> {
  const supabase = createSupabaseServerClient()

  const { data: designRow } = await supabase
    .from('invitation_card_designs')
    .select(DESIGN_COLS)
    .eq('id', designId)
    .maybeSingle<DesignRow>()
  if (!designRow) return null

  const orders = await ownedOrders()
  const order = orders.find((o) => o.id === designRow.order_id)
  if (!order) return null

  const { data: product } = await supabase
    .from('website_invitations_products')
    .select('id, image_url, category, designer, palettes, swatches')
    .eq('id', designRow.product_id)
    .maybeSingle<ProductRow>()

  const { data: releaseData } = await supabase
    .from('invitation_card_design_releases')
    .select('id, released_at, superseded_at')
    .eq('design_id', designRow.id)
    .order('released_at', { ascending: true })
  const releaseRows = (releaseData ?? []) as {
    id: string
    released_at: string | null
    superseded_at: string | null
  }[]

  // Oldest-first above so the numbering is stable, then handed over newest-first.
  const versions: CardVersion[] = releaseRows
    .map((release, index) => ({
      id: release.id,
      number: index + 1,
      releasedAt: release.released_at,
      supersededAt: release.superseded_at,
      isCurrent: release.id === designRow.current_release_id,
    }))
    .reverse()

  const releaseIds = releaseRows.map((r) => r.id)
  const [allowance, eventUsage, activity] = await Promise.all([
    readAllowance(designRow, orders, releaseIds),
    readEventUsage(order.event_id),
    readActivity(designRow.id),
  ])

  const card = toGalleryCard(designRow, order, product ?? null)
  return {
    ...card,
    designer: product?.designer ?? null,
    palette: readPalette(product ?? null),
    infoReceivedAt: designRow.info_received_at,
    eventId: order.event_id,
    eventDate: order.event_date,
    allowance,
    eventUsage,
    versions,
    activity,
    timeline: buildTimeline(card, designRow, order, allowance, eventUsage),
    topUpReleaseId:
      RELEASED_STATUSES.includes(card.status) && designRow.current_release_id
        ? designRow.current_release_id
        : null,
  }
}

/**
 * What this card can be sent to, and what has already been made from it.
 *
 * Top-ups are read off the couple's own orders rather than queried again: a
 * top-up order pins `topup_release_id` to the exact release it bought capacity
 * for, so capacity lands on the card it was bought for even when a couple owns
 * several. See lib/payments/topup.ts for the purchase side.
 */
async function readAllowance(
  design: DesignRow,
  orders: OrderRow[],
  releaseIds: string[],
): Promise<CardAllowance> {
  const releaseSet = new Set(releaseIds)
  let toppedUp = 0
  for (const order of orders) {
    if (order.order_kind !== 'topup') continue
    if (!order.topup_release_id || !releaseSet.has(order.topup_release_id)) continue
    if (order.status !== 'paid') continue
    for (const item of order.items ?? []) {
      if (typeof item.guests === 'number' && item.guests > 0) toppedUp += Math.floor(item.guests)
    }
  }

  let generated = 0
  let generatedAt: string | null = null
  if (releaseIds.length > 0) {
    // Count and newest timestamp in one read: the row set can run to one per
    // guest, and the page only needs "how many" and "when did that finish".
    const { data, count } = await createSupabaseServerClient()
      .from('invitation_card_delivery_assets')
      .select('created_at', { count: 'exact' })
      .in('design_release_id', releaseIds)
      .eq('status', 'ready')
      .order('created_at', { ascending: false })
      .limit(1)
    generated = count ?? 0
    generatedAt = ((data ?? []) as { created_at: string }[])[0]?.created_at ?? null
  }

  return {
    purchased: design.digital_qty,
    toppedUp,
    total: design.digital_qty + toppedUp,
    generated,
    generatedAt,
  }
}

/** Event-level sending figures, from the same entitlement the send console uses. */
async function readEventUsage(eventId: string | null): Promise<CardEventUsage | null> {
  if (!eventId) return null
  try {
    const entitlement = await getWhatsAppEntitlement(eventId)
    return {
      eventId,
      purchased: entitlement.purchased,
      used: entitlement.used,
      remaining: entitlement.remaining,
    }
  } catch {
    // A missing event or a quota read that fails is not a reason to fail the
    // whole page: the card, its versions and its history still stand alone.
    return null
  }
}

/**
 * The card's history, in the couple's language.
 *
 * kind='system' only, and the wording comes from the status transition rather
 * than the stored body: reviewer rejections are logged as kind='note' with the
 * reviewer's own words, and `author` is a staff email. Neither belongs here.
 */
async function readActivity(designId: string): Promise<CardActivityEntry[]> {
  const { data } = await createSupabaseServerClient()
    .from('invitation_card_design_events')
    .select('id, from_status, to_status, created_at')
    .eq('design_id', designId)
    .eq('kind', 'system')
    .order('created_at', { ascending: false })
    .limit(20)

  const rows = (data ?? []) as {
    id: string
    from_status: string | null
    to_status: string | null
    created_at: string
  }[]

  return rows.map((row) => ({
    id: row.id,
    at: row.created_at,
    label: activityLabel(row.from_status, row.to_status),
  }))
}

function activityLabel(from: string | null, to: string | null): string {
  if (to === 'in_review') return 'Sent to our reviewers'
  if (to === 'ready') return from === 'ready' ? 'Updated version published' : 'Approved and released'
  if (to === 'delivered') return 'Marked delivered'
  if (to === 'in_design') return 'Back with the design team'
  if (to === 'awaiting_info') return 'Waiting for your details'
  return 'Updated'
}

/**
 * Where the card is in its life, start to finish.
 *
 * Every step is a real timestamp or a real count. A step with no timestamp of
 * its own (sending, which is metered per event rather than per card) still only
 * ticks on evidence that it happened.
 */
function buildTimeline(
  card: GalleryCard,
  design: DesignRow,
  order: OrderRow,
  allowance: CardAllowance,
  eventUsage: CardEventUsage | null,
): CardTimelineStep[] {
  const eventPassed = order.event_date ? new Date(order.event_date) < new Date() : false
  const step = (key: string, label: string, at: string | null, done = Boolean(at)) => ({
    key,
    label,
    at,
    done,
  })

  return [
    step('purchased', 'Purchased', card.purchasedAt),
    step('personalised', 'Your details received', design.info_received_at),
    step('approved', 'Checked and approved', card.releasedAt),
    step(
      'generated',
      'Guest cards generated',
      allowance.generatedAt,
      allowance.generated > 0,
    ),
    step('sent', 'Invitations sent', null, (eventUsage?.used ?? 0) > 0),
    step('complete', 'Event complete', eventPassed ? order.event_date : null, eventPassed),
  ]
}

export type ReleasedCardFile = { svg: string; cardName: string; orderRef: string }

/**
 * The frozen card itself, for a design this couple owns.
 *
 * Ownership is re-checked here rather than trusted from the URL, for the same
 * reason getCardDetail re-checks it.
 *
 * `releaseId` asks for one specific version instead of the current one, which
 * is what makes the version list on the detail page viewable rather than
 * decorative. It is verified to belong to this design before anything is
 * served, so a release id from another couple's card resolves to nothing.
 */
export async function getReleasedCardFile(
  designId: string,
  releaseId?: string | null,
): Promise<ReleasedCardFile | null> {
  const client = createSupabaseServerClient()

  const { data: design } = await client
    .from('invitation_card_designs')
    .select('id, order_id, product_name, release_svg_path, status')
    .eq('id', designId)
    .maybeSingle<{
      id: string
      order_id: string
      product_name: string
      release_svg_path: string | null
      status: string
    }>()
  if (!design) return null
  if (!RELEASED_STATUSES.includes(asCardStatus(design.status))) return null

  const orders = await ownedOrders()
  const owned = orders.find((o) => o.id === design.order_id)
  if (!owned) return null

  let path = design.release_svg_path
  if (releaseId) {
    const { data: release } = await client
      .from('invitation_card_design_releases')
      .select('svg_storage_path')
      .eq('id', releaseId)
      .eq('design_id', design.id)
      .maybeSingle<{ svg_storage_path: string | null }>()
    if (!release?.svg_storage_path) return null
    path = release.svg_storage_path
  }
  if (!path) return null

  const { data: blob } = await client.storage.from('card-releases').download(path)
  if (!blob) return null

  return {
    svg: await blob.text(),
    cardName: design.product_name || 'Your card',
    orderRef: owned.ref,
  }
}
