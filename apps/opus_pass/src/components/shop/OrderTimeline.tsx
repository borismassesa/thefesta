import { Check, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FulfillmentStatus, OrderStatus } from '@/lib/payments/types'

// Buyer-facing progress for a product order. Two independent signals drive it:
// payment `status` (pending/processing → paid) and, once paid, the admin/vendor
// `fulfillmentStatus` (not_started → in_progress → ready → delivered).
const STAGES = [
  { key: 'placed', label: 'Order placed', desc: 'We received your order.' },
  { key: 'payment', label: 'Payment confirmed', desc: 'Your payment cleared.' },
  { key: 'preparing', label: 'Preparing your order', desc: 'The shop is getting it ready.' },
  { key: 'ready', label: 'Ready to ship', desc: 'Packed and awaiting dispatch.' },
  { key: 'delivered', label: 'Delivered', desc: 'On its way / handed over.' },
] as const

function currentIndex(status: OrderStatus, fulfillment: FulfillmentStatus): number {
  // The index of the stage currently in progress; everything before it is done.
  if (status !== 'paid') return 1 // payment stage in progress (under review)
  switch (fulfillment) {
    case 'delivered':
      return 5 // all stages complete
    case 'ready':
      return 3
    case 'in_progress':
      return 2
    default:
      return 2 // paid, not_started → preparing is up next
  }
}

export default function OrderTimeline({
  status,
  fulfillmentStatus,
}: {
  status: OrderStatus
  fulfillmentStatus: FulfillmentStatus
}) {
  const failed = status === 'failed' || status === 'expired'
  const current = currentIndex(status, fulfillmentStatus)

  return (
    <ol className="space-y-0">
      {STAGES.map((stage, i) => {
        const done = i < current
        const active = i === current
        // The payment stage turns red when the payment itself failed/expired.
        const isFailedPayment = failed && stage.key === 'payment'
        const dimmed = failed && i >= 1 && !isFailedPayment

        return (
          <li key={stage.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors',
                  isFailedPayment && 'border-red-500 bg-red-500 text-white',
                  !isFailedPayment && done && 'border-[#1A1A1A] bg-[#1A1A1A] text-white',
                  !isFailedPayment && active && !failed && 'border-[#1A1A1A] bg-white text-[#1A1A1A]',
                  (dimmed || (i > current && !active)) && 'border-black/10 bg-white text-[#1A1A1A]/30',
                )}
              >
                {isFailedPayment ? (
                  <X className="h-4 w-4" />
                ) : done ? (
                  <Check className="h-4 w-4" />
                ) : active && !failed ? (
                  <Clock className="h-4 w-4" />
                ) : (
                  <span className="text-xs font-bold">{i + 1}</span>
                )}
              </span>
              {i < STAGES.length - 1 && (
                <span className={cn('my-1 w-px flex-1', done ? 'bg-[#1A1A1A]' : 'bg-black/10')} />
              )}
            </div>
            <div className={cn('pb-6', i === STAGES.length - 1 && 'pb-0')}>
              <p
                className={cn(
                  'text-sm font-semibold',
                  isFailedPayment ? 'text-red-600' : done || active ? 'text-[#1A1A1A]' : 'text-[#1A1A1A]/40',
                )}
              >
                {isFailedPayment ? 'Payment not confirmed' : stage.label}
              </p>
              <p className="mt-0.5 text-xs text-[#1A1A1A]/50">
                {isFailedPayment
                  ? 'We could not confirm your payment. Please contact support.'
                  : active && !failed && stage.key === 'payment'
                    ? 'Under review — we will confirm shortly.'
                    : stage.desc}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
