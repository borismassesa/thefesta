import type { FulfillmentStatus } from './queries'

/**
 * The five-step pipeline an order walks, mirroring what the couple sees on
 * their dashboard (apps/opus_pass/src/lib/order-status.ts). There is no shared
 * package between the two apps, so this is a deliberate copy — keep the stage
 * order in sync if that file changes. Labels here are written in an internal
 * register ("the customer's payment"), not the couple's ("your invitation").
 */
export const ORDER_STAGES = [
  { id: 'payment_review', label: 'Payment under review' },
  { id: 'confirmed', label: 'Order confirmed' },
  { id: 'in_design', label: 'In design' },
  { id: 'ready', label: 'Design ready' },
  { id: 'delivered', label: 'Delivered' },
] as const

export type OrderStageId = (typeof ORDER_STAGES)[number]['id']

/** Returned when a payment died, so a dead order never renders as stage 0. */
export const STAGE_FAILED = -1

/**
 * Where an order sits in ORDER_STAGES, or STAGE_FAILED.
 *
 * The couple-side original treats anything that is not 'paid' as stage 0, which
 * is only safe because its caller pre-filters to live statuses. This queue is
 * scoped to processing+paid today, but the explicit failed branch means a
 * widened scope can never silently render a refunded order as "under review".
 */
export function orderStageIndex(status: string, fulfillmentStatus: FulfillmentStatus): number {
  if (status === 'failed' || status === 'expired' || status === 'refunded') return STAGE_FAILED
  if (status !== 'paid') return 0 // payment_review
  switch (fulfillmentStatus) {
    case 'in_progress':
      return 2
    case 'ready':
      return 3
    case 'delivered':
      return 4
    default:
      return 1 // confirmed
  }
}
