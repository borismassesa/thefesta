import { getOrderByRef, type OrderRow } from '@/lib/payments/orders'
import type { ShopOrderDetail } from '@/lib/shop/order-types'

// Guest shop orders have no account, so ownership is proven by the email used
// at checkout. Both the tracking page and the invoice download gate on this —
// refs alone (OF-2026-XXXXXX) must never expose a buyer's delivery address or
// contact details. Product orders only; invitation orders track in the couple
// dashboard, not here.
export async function getShopOrderForBuyer(
  ref: string,
  email: string,
): Promise<OrderRow | null> {
  const cleanRef = ref.trim()
  const cleanEmail = email.trim().toLowerCase()
  if (!cleanRef || !cleanEmail) return null

  const order = await getOrderByRef(cleanRef)
  if (!order || order.kind !== 'product') return null
  if (order.contact_email.trim().toLowerCase() !== cleanEmail) return null
  return order
}

export function orderRowToShopDetail(order: OrderRow): ShopOrderDetail {
  const d = (order.delivery ?? {}) as Record<string, unknown>
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined
  return {
    ref: order.ref,
    status: order.status,
    fulfillmentStatus: order.fulfillment_status,
    amountTotal: Number(order.amount_total),
    currency: order.currency,
    placedAt: order.created_at,
    paidAt: order.paid_at,
    items: order.items.map((i) => ({
      id: i.id,
      name: i.name,
      image: i.image ?? null,
      quantity: i.quantity ?? 1,
      total: i.total,
    })),
    delivery: order.delivery
      ? {
          name: str(d.name),
          phone: str(d.phone),
          address: str(d.address),
          city: str(d.city),
          region: str(d.region),
          notes: str(d.notes),
        }
      : null,
  }
}
