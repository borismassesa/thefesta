import type { FulfillmentStatus, OrderStatus } from '@/lib/payments/types'

// Buyer-facing shape of a shop order — safe to import into client components
// (no server-only dependencies). Populated by orderRowToShopDetail server-side.
export type ShopOrderDetail = {
  ref: string
  status: OrderStatus
  fulfillmentStatus: FulfillmentStatus
  amountTotal: number
  currency: string
  placedAt: string
  paidAt: string | null
  items: { id: string; name: string; image: string | null; quantity: number; total: number }[]
  delivery: {
    name?: string
    phone?: string
    address?: string
    city?: string
    region?: string
    notes?: string
  } | null
}
