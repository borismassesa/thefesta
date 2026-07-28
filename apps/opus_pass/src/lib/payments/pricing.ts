import 'server-only'
import { loadPackagesContent } from '@/lib/cms/packages'
import { TEMPLATE_CARD_PRICE } from '@/lib/dashboard/pledge-card-templates'
import { createSupabaseServerClient } from '@/lib/supabase'
import type { InitiateItem } from './types'

// Authoritative amount calculation. The browser sends each line's `total`, but
// a malicious client can edit localStorage to pay less — so we NEVER charge the
// client's number. Where a line carries the package structure (tierId + guests),
// we recompute the core charge from the CMS-controlled per-guest price and use
// THAT as the amount. Non-guest extras (prints/swag) are accepted as sent but
// floored at 0. Lines with no package structure fall back to the client total
// (these are flagged so we can monitor/tighten later).
//
// Mirrors CartProvider.MIN_GUESTS — the product page won't let guests go below
// this, so the server enforces the same floor.
const MIN_GUESTS = 50

export type PricedItem = InitiateItem & { total: number }

export type PricingResult = {
  items: PricedItem[]
  subtotal: number
  discount: number
  amountTotal: number
  currency: string
  /** False if any line couldn't be authoritatively recomputed from the CMS. */
  fullyTrusted: boolean
  /** Lines whose client total disagreed with the recomputed amount. */
  adjustments: Array<{ id: string; clientTotal: number; serverTotal: number }>
}

export async function priceOrder(items: InitiateItem[]): Promise<PricingResult> {
  const packages = await loadPackagesContent()
  const tierPrice = new Map(packages.tiers.map((t) => [t.id, t.price_per_guest]))

  // Authoritative product prices — one lookup for every product line in the
  // cart. Only live products (approved, published, active vendor) are priced;
  // anything else drops out (priced at 0 → order rejected by the caller).
  const productIds = items
    .filter((i) => i.kind === 'product' && i.productId)
    .map((i) => i.productId as string)
  const productPrice = new Map<string, number>()
  if (productIds.length > 0) {
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('products')
      .select('id, price_tzs, status, published, vendor:vendors!inner(onboarding_status)')
      .in('id', productIds)
      .eq('status', 'approved')
      .eq('published', true)
      .eq('vendor.onboarding_status', 'active')
      .returns<{ id: string; price_tzs: number }[]>()
    for (const row of data ?? []) productPrice.set(row.id, row.price_tzs)
  }

  const adjustments: PricingResult['adjustments'] = []
  let fullyTrusted = true

  const priced: PricedItem[] = items.map((item) => {
    const authPerGuest = item.tierId ? tierPrice.get(item.tierId) : undefined
    const clientTotal = Math.max(0, Math.round(Number(item.total) || 0))

    // Real vendor product — price is products.price_tzs × quantity, straight
    // from the DB. A missing/unlive product prices to 0 so the order is
    // rejected rather than sold at the client's number.
    if (item.kind === 'product') {
      const unit = item.productId ? productPrice.get(item.productId) : undefined
      const qty = Math.max(1, Math.floor(Number(item.quantity) || 1))
      const serverTotal = unit != null ? unit * qty : 0
      if (serverTotal !== clientTotal) {
        adjustments.push({ id: item.id, clientTotal, serverTotal })
      }
      if (unit == null) fullyTrusted = false
      return { ...item, quantity: qty, pricePerGuest: unit, total: serverTotal }
    }

    // Flat-price line (a single card-template unlock, not a guest-tier
    // invitation) — the price is a fixed constant, never the client's number.
    if (item.kind === 'template_unlock') {
      if (clientTotal !== TEMPLATE_CARD_PRICE) {
        adjustments.push({ id: item.id, clientTotal, serverTotal: TEMPLATE_CARD_PRICE })
      }
      return { ...item, total: TEMPLATE_CARD_PRICE }
    }

    // Recompute only when we have a known tier AND a guest count.
    if (authPerGuest != null && item.guests != null) {
      const guests = Math.max(MIN_GUESTS, Math.floor(item.guests))
      const extras = Math.max(0, Math.round(Number(item.extrasTotal) || 0))
      const serverTotal = authPerGuest * guests + extras
      if (serverTotal !== clientTotal) {
        adjustments.push({ id: item.id, clientTotal, serverTotal })
      }
      return { ...item, guests, pricePerGuest: authPerGuest, total: serverTotal }
    }

    // No package structure — can't independently verify; trust the line total
    // but mark the order as not fully trusted for monitoring.
    fullyTrusted = false
    return { ...item, total: clientTotal }
  })

  const subtotal = priced.reduce((sum, i) => sum + i.total, 0)
  // Digital product — no discount path today (kept for parity with the cart).
  const discount = 0
  return {
    items: priced,
    subtotal,
    discount,
    amountTotal: subtotal - discount,
    currency: 'TZS',
    fullyTrusted,
    adjustments,
  }
}
