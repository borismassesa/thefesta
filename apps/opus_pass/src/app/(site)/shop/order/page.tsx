import { Truck } from 'lucide-react'
import OrderTracker from './[ref]/OrderTracker'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Track your order — OpusFesta Shop',
}

// Bare lookup — for a guest who no longer has their direct tracking link. They
// enter the order number + checkout email; OrderTracker gates on the same
// email-verified /api/shop/order-status endpoint.
export default function OrderLookupPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-black/[0.08] bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-[#1A1A1A]/60">
            <Truck className="h-4 w-4" /> Order tracking
          </p>
          <a href="/registry" className="text-sm font-semibold text-[#1A1A1A] underline underline-offset-4">
            Back to shopping
          </a>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-8 lg:py-12">
        <OrderTracker />
      </div>
    </div>
  )
}
