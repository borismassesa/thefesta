import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase'
import { getOrdersForUser } from '@/lib/payments/orders'
import { requireDashboardUser } from './auth'

// The finished cards a couple can actually use.
//
// Until now a couple never saw their own card. They filled in a form, our team
// drew it, and the only rendered copy lived in whichever designer's browser had
// the job open. "Your design is ready" was an email with an order reference in
// it and nothing else.
//
// What this reads is the FROZEN file written when a reviewer approved the card,
// never a fresh render. That distinction is the whole point: a card the couple
// may already have sent to two hundred guests must not change underneath them
// because the artwork was later re-exported or a font licence lapsed.

/** A card that has been approved and published to its couple. */
export type ReleasedCard = {
  designId: string
  orderRef: string
  cardName: string
  /** Catalogue thumbnail, for the list. The real card is served by its route. */
  cardImage: string | null
  releasedAt: string | null
  digitalQty: number
  printQty: number
  /** False when the row says released but the artefact is missing. */
  hasArtefact: boolean
}

type DesignRow = {
  id: string
  order_id: string
  product_id: string
  product_name: string
  digital_qty: number
  print_qty: number
  released_at: string | null
  release_svg_path: string | null
  status: string
}

/** Statuses a couple is allowed to see. Anything earlier is still internal. */
const VISIBLE_STATUSES = ['ready', 'delivered']

/**
 * Every released card belonging to the signed-in couple, newest first.
 *
 * Ownership comes from getOrdersForUser, the same user/email/phone matching the
 * orders dashboard uses. Scoping on user_id alone would silently hide the card
 * from anyone who checked out as a guest, which is exactly the case that helper
 * exists for.
 */
export async function getReleasedCards(): Promise<ReleasedCard[]> {
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
    .select(
      'id, order_id, product_id, product_name, digital_qty, print_qty, released_at, release_svg_path, status',
    )
    .in('order_id', [...orderRefs.keys()])
    .in('status', VISIBLE_STATUSES)
    .order('released_at', { ascending: false })

  const designs = (designData ?? []) as DesignRow[]
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
    releasedAt: design.released_at,
    digitalQty: design.digital_qty,
    printQty: design.print_qty,
    // A card released before the freezing step existed has no file. Reported
    // rather than hidden, so it reads as "we owe you this" instead of the card
    // silently not being there.
    hasArtefact: Boolean(design.release_svg_path),
  }))
}

export type ReleasedCardFile = { svg: string; cardName: string; orderRef: string }

/**
 * The frozen card itself, for a design this couple owns.
 *
 * Ownership is re-checked here rather than trusted from the URL: the designId
 * comes from the browser, and a released card carries the couple's names, their
 * venue and their contacts.
 */
export async function getReleasedCardFile(designId: string): Promise<ReleasedCardFile | null> {
  const user = await requireDashboardUser()
  const supabase = createSupabaseServerClient()

  const { data: design } = await supabase
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
  if (!design || !design.release_svg_path) return null
  if (!VISIBLE_STATUSES.includes(design.status)) return null

  const { data: profile } = await supabase
    .from('couple_profiles')
    .select('whatsapp_phone')
    .eq('user_id', user.id)
    .maybeSingle<{ whatsapp_phone: string | null }>()

  const orders = await getOrdersForUser(user.id, user.email, profile?.whatsapp_phone ?? null)
  const owned = orders.find((o) => o.id === design.order_id)
  if (!owned) return null

  const { data: blob } = await supabase.storage
    .from('card-releases')
    .download(design.release_svg_path)
  if (!blob) return null

  return {
    svg: await blob.text(),
    cardName: design.product_name || 'Your card',
    orderRef: owned.ref,
  }
}
