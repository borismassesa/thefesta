import 'server-only'
import { formatTzs } from '@opusfesta/lib'
import { createSupabaseServerClient } from '@/lib/supabase'
import { createNotification } from '@/lib/dashboard/notifications'
import { firstNameOf } from '@/lib/dashboard/share'
import { sendGiftClaimReceipts, type ReceiptGift, type ReceiptLang } from '@/lib/dashboard/gift-registry-receipt'
import { getOrderByRef, type OrderRow } from './orders'
import type { PricedItem } from './pricing'

// Product-order side effects that don't belong in the generic order engine:
// resolving the registry a guest is buying from, materialising the gift +
// reservation the purchase holds, and (on paid) confirming everything via the
// finalize RPC and telling the couple + guest. All service-role.

export type RegistryContext = {
  eventId: string
  coupleUserId: string
  coupleName: string
  coupleEmail: string | null
  couplePhone: string | null
}

/**
 * Resolve the couple/event behind a public registry slug — server-authoritative
 * (never trusts a client-supplied event/couple). Uses the event-scoped
 * gift_registry_slug (NOT the legacy account-wide couple_profiles.public_slug),
 * gated on sharing being enabled.
 */
export async function resolveRegistryContext(slug: string): Promise<RegistryContext | null> {
  if (!slug) return null
  const supabase = createSupabaseServerClient()
  const { data: event } = await supabase
    .from('wedding_events')
    .select('id, user_id, gift_registry_sharing_enabled')
    .eq('gift_registry_slug', slug)
    .maybeSingle<{ id: string; user_id: string; gift_registry_sharing_enabled: boolean }>()
  if (!event || !event.gift_registry_sharing_enabled) return null

  const [{ data: profile }, { data: user }] = await Promise.all([
    supabase
      .from('couple_profiles')
      .select('partner1_name, partner2_name, whatsapp_phone')
      .eq('user_id', event.user_id)
      .maybeSingle<{ partner1_name: string | null; partner2_name: string | null; whatsapp_phone: string | null }>(),
    supabase.from('users').select('email').eq('id', event.user_id).maybeSingle<{ email: string | null }>(),
  ])
  const coupleName =
    [profile?.partner1_name, profile?.partner2_name].filter(Boolean).map((n) => firstNameOf(n!)).join(' & ') || 'the couple'

  return {
    eventId: event.id,
    coupleUserId: event.user_id,
    coupleName,
    coupleEmail: user?.email ?? null,
    couplePhone: profile?.whatsapp_phone ?? null,
  }
}

type ProductForOrder = {
  id: string
  name: string
  images: string[] | null
  price_tzs: number
  category_slug: string | null
  vendor_id: string
  vendor: { business_name: string | null; location: { city?: string; region?: string } | null } | null
}

/**
 * Materialise a product order's lines. Two modes:
 *  - ctx set (registry purchase): each line also ensures a gift_registry_item
 *    exists and reserves it with a pending_payment claim tied to this order.
 *  - ctx null (plain shop purchase): lines only — no registry, no reservation;
 *    the goods just ship to the buyer's delivery address.
 * Called at initiate, inside the pending order.
 */
export async function createProductOrderLines(
  order: OrderRow,
  items: PricedItem[],
  ctx: RegistryContext | null,
): Promise<void> {
  const supabase = createSupabaseServerClient()
  const productLines = items.filter((i) => i.kind === 'product' && i.productId)
  if (productLines.length === 0) return

  const ids = productLines.map((i) => i.productId as string)
  const { data: products } = await supabase
    .from('products')
    .select('id, name, images, price_tzs, category_slug, vendor_id, vendor:vendors(business_name, location)')
    .in('id', ids)
    .returns<ProductForOrder[]>()
  const byId = new Map((products ?? []).map((p) => [p.id, p]))

  for (const line of productLines) {
    const product = byId.get(line.productId as string)
    if (!product) continue
    const qty = Math.max(1, Math.floor(Number(line.quantity) || 1))
    const location = product.vendor?.location?.city || product.vendor?.location?.region || 'Tanzania'

    // Registry purchases reserve the couple's gift; plain purchases don't.
    let itemId: string | null = null
    if (ctx) {
      itemId = line.registryItemId ?? null
      if (itemId) {
        const { data: existing } = await supabase
          .from('gift_registry_items')
          .select('id')
          .eq('id', itemId)
          .eq('event_id', ctx.eventId)
          .maybeSingle<{ id: string }>()
        if (!existing) itemId = null
      }
      if (!itemId) {
        const { data: created } = await supabase
          .from('gift_registry_items')
          .insert({
            user_id: ctx.coupleUserId,
            event_id: ctx.eventId,
            title: product.name,
            image_urls: (product.images ?? []).slice(0, 1),
            price_label: formatTzs(product.price_tzs),
            price_tzs: product.price_tzs,
            product_id: product.id,
            shop_name: product.vendor?.business_name ?? null,
            shop_location: location,
            quantity_requested: 1,
          })
          .select('id')
          .maybeSingle<{ id: string }>()
        itemId = created?.id ?? null
      }
      if (itemId) {
        await supabase.from('gift_registry_claims').insert({
          item_id: itemId,
          user_id: ctx.coupleUserId,
          guest_name: order.contact_name ?? 'A guest',
          guest_phone: order.contact_phone,
          guest_email: order.contact_email,
          status: 'pending_payment',
          order_id: order.id,
        })
      }
    }

    await supabase.from('product_order_lines').insert({
      order_id: order.id,
      product_id: product.id,
      vendor_id: product.vendor_id,
      gift_registry_item_id: itemId,
      quantity: qty,
      unit_price_tzs: product.price_tzs,
      line_total_tzs: product.price_tzs * qty,
      product_snapshot: {
        name: product.name,
        image: (product.images ?? [])[0] ?? null,
        vendorName: product.vendor?.business_name ?? null,
      },
    })
  }
}

/**
 * Once-only side effects of a PAID product order. The finalize RPC does the
 * money-and-stock-critical work idempotently (stock, claim confirmation,
 * earnings); this adds the couple notification + guest/couple receipts, guarded
 * by the order's own receipt_emailed_at so it fires once.
 */
export async function finalizeProductOrder(ref: string): Promise<void> {
  try {
    const order = await getOrderByRef(ref)
    if (!order || order.kind !== 'product') return
    const supabase = createSupabaseServerClient()

    // Idempotent, atomic, service-role-only: stock, claims, earnings.
    const { error: rpcErr } = await supabase.rpc('finalize_product_order', { p_order_id: order.id })
    if (rpcErr) console.error('[payments] finalize_product_order RPC failed', rpcErr)

    if (order.purchase_notified_at) return // side effects already fired

    // Load the confirmed lines to notify + receipt against.
    const { data: lines } = await supabase
      .from('product_order_lines')
      .select('gift_registry_item_id, product_snapshot, line_total_tzs')
      .eq('order_id', order.id)
      .returns<{ gift_registry_item_id: string | null; product_snapshot: { name?: string }; line_total_tzs: number }[]>()

    const ctx = order.event_id ? await resolveRegistryContextByEvent(order.event_id) : null
    const guestName = order.contact_name ?? 'A guest'
    const giftTitles = (lines ?? []).map((l) => l.product_snapshot?.name).filter(Boolean) as string[]

    if (ctx) {
      await createNotification({
        userId: ctx.coupleUserId,
        type: 'gift_claimed',
        title: `${guestName} bought you ${giftTitles.length > 1 ? `${giftTitles.length} gifts` : 'a gift'}`,
        body: giftTitles[0] ?? 'A registry gift',
        actorName: guestName,
        href: '/my/dashboard/gift-registry',
      })

      // 4-channel receipt (guest + couple, email + WhatsApp) per gift, reusing
      // the proven gift-claim sender. Best-effort — never blocks the order.
      const lang: ReceiptLang = 'en'
      for (const l of lines ?? []) {
        const gift: ReceiptGift = {
          title: l.product_snapshot?.name ?? 'A gift',
          priceLabel: formatTzs(l.line_total_tzs),
          shopName: null,
          shopLocation: null,
          shopContact: null,
          productLink: null,
        }
        await sendGiftClaimReceipts({
          gift,
          coupleName: ctx.coupleName,
          guestName,
          guestPhone: order.contact_phone,
          guestEmail: order.contact_email,
          coupleEmail: ctx.coupleEmail,
          couplePhone: ctx.couplePhone,
          lang,
        }).catch((e) => console.error('[payments] product receipt failed', e))
      }
    }

    await supabase
      .from('invitation_orders')
      .update({ purchase_notified_at: new Date().toISOString() })
      .eq('id', order.id)
  } catch (err) {
    console.error('[payments] finalizeProductOrder failed', err)
  }
}

/** Free the registry units a dead product order was holding. */
export async function releaseProductOrder(ref: string): Promise<void> {
  try {
    const order = await getOrderByRef(ref)
    if (!order || order.kind !== 'product') return
    const supabase = createSupabaseServerClient()
    const { error } = await supabase.rpc('release_product_order', { p_order_id: order.id })
    if (error) console.error('[payments] release_product_order RPC failed', error)
  } catch (err) {
    console.error('[payments] releaseProductOrder failed', err)
  }
}

/** Couple/event resolution keyed by event id (used by the paid-order notify). */
async function resolveRegistryContextByEvent(eventId: string): Promise<RegistryContext | null> {
  const supabase = createSupabaseServerClient()
  const { data: event } = await supabase
    .from('wedding_events')
    .select('id, user_id')
    .eq('id', eventId)
    .maybeSingle<{ id: string; user_id: string }>()
  if (!event) return null
  const [{ data: profile }, { data: user }] = await Promise.all([
    supabase
      .from('couple_profiles')
      .select('partner1_name, partner2_name, whatsapp_phone')
      .eq('user_id', event.user_id)
      .maybeSingle<{ partner1_name: string | null; partner2_name: string | null; whatsapp_phone: string | null }>(),
    supabase.from('users').select('email').eq('id', event.user_id).maybeSingle<{ email: string | null }>(),
  ])
  const coupleName =
    [profile?.partner1_name, profile?.partner2_name].filter(Boolean).map((n) => firstNameOf(n!)).join(' & ') || 'the couple'
  return {
    eventId: event.id,
    coupleUserId: event.user_id,
    coupleName,
    coupleEmail: user?.email ?? null,
    couplePhone: profile?.whatsapp_phone ?? null,
  }
}
