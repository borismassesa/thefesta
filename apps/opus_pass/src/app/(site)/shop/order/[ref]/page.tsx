import { Truck } from 'lucide-react'
import OrderTracker from './OrderTracker'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Track your order — OpusFesta Shop',
}

// Guest order tracking. No PII is loaded server-side (the ref alone proves
// nothing) — OrderTracker asks for the checkout email and fetches the order
// through the email-gated /api/shop/order-status endpoint.
export default async function OrderTrackingPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params

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
        <OrderTracker orderRef={decodeURIComponent(ref)} />
      </div>
    </div>
  )
}
