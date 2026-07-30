import { CheckCircle2 } from 'lucide-react'
import type { TokenCardDetailRequest } from '@/lib/dashboard/card-details'
import { cardFieldCopy, cardFieldOrder } from '@/lib/dashboard/card-details-labels'

/**
 * What the couple sees once they've answered everything.
 *
 * Deliberately not a bare "thanks" page: they reach this every time they
 * re-open the WhatsApp link, and it is the last point at which a misspelt name
 * or a wrong venue can still be caught before it is printed on every card.
 */
export default function CardDetailsReceipt({ request }: { request: TokenCardDetailRequest }) {
  const provided = Object.entries(request.values)
    .filter(([, value]) => String(value).trim())
    // Object key order is arbitrary; read it back in card order instead.
    .sort(([a], [b]) => cardFieldOrder(a) - cardFieldOrder(b))

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <header className="text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <h1 className="mt-3 text-xl font-semibold text-gray-900">Thank you</h1>
        <p className="mt-1.5 text-sm text-gray-500">
          We have everything we need for your {request.cardName}. Our designers are working on it
          now.
        </p>
      </header>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-gray-100 ring-1 ring-gray-200">
            {request.cardImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={request.cardImage} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{request.cardName}</p>
            <p className="text-xs text-gray-500">Order {request.orderRef}</p>
          </div>
        </div>

        {provided.length > 0 && (
          <dl className="divide-y divide-gray-50">
            {provided.map(([role, value]) => (
              <div key={role} className="grid grid-cols-[minmax(0,150px)_1fr] gap-3 px-5 py-2.5">
                <dt className="text-xs text-gray-500">{cardFieldCopy(role).label}</dt>
                <dd className="min-w-0 break-words text-sm text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <p className="text-center text-xs text-gray-500">
        Spotted a mistake? Reply on WhatsApp and our team will correct it before printing.
      </p>
    </div>
  )
}
