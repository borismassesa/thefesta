import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { requireDashboardUser } from '@/lib/dashboard/auth'
import { getOrderByRef } from '@/lib/payments/orders'

export const dynamic = 'force-dynamic'

function formatTzs(n: number): string {
  return `TZS ${n.toLocaleString('en-US')}`
}

/**
 * What happened to a top-up the couple just submitted.
 *
 * Reads the order rather than trusting the redirect's query string, and only
 * ever shows an order this user owns — the ref is in a URL the couple could
 * edit, and a top-up receipt names an event and an amount.
 */
export default async function TopUpConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}) {
  const [{ ref }, user] = await Promise.all([
    searchParams,
    requireDashboardUser('/my/dashboard/invitations'),
  ])
  if (!ref) redirect('/my/dashboard/invitations')

  const order = await getOrderByRef(ref)
  if (!order || order.user_id !== user.id || order.order_kind !== 'topup') {
    redirect('/my/dashboard/invitations')
  }

  const guests = order.items.reduce((sum, item) => sum + (item.guests ?? 0), 0)
  const paid = order.status === 'paid'
  const dead = order.status === 'failed' || order.status === 'expired' || order.status === 'refunded'

  return (
    <div className="mx-auto max-w-lg py-6 text-center">
      <div
        className={`mx-auto grid h-12 w-12 place-items-center rounded-full ${
          paid ? 'bg-emerald-50 text-emerald-600' : dead ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
        }`}
      >
        {paid ? <CheckCircle2 size={24} /> : dead ? <XCircle size={24} /> : <Clock size={24} />}
      </div>

      <h1 className="mt-4 text-xl font-bold text-gray-900">
        {paid
          ? 'Your digital cards are ready'
          : dead
            ? 'This request did not go through'
            : 'Request submitted'}
      </h1>

      <p className="mt-2 text-sm leading-relaxed text-gray-500">
        {paid ? (
          <>
            {guests} more digital cards, each with an entrance pass, have been added to this event.
            They use the design you already approved.
          </>
        ) : dead ? (
          <>Nothing was charged. You can request more cards whenever you are ready.</>
        ) : (
          <>
            We are confirming your payment of {formatTzs(order.amount_total)}. Your {guests} extra
            digital cards appear as soon as it clears, usually within a few hours.
          </>
        )}
      </p>

      <dl className="mt-6 space-y-2 rounded-2xl border border-gray-200 p-4 text-left text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Reference</dt>
          <dd className="font-semibold text-gray-900">{order.ref}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Extra digital cards</dt>
          <dd className="font-semibold text-gray-900">{guests}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500">Amount</dt>
          <dd className="font-semibold text-gray-900">{formatTzs(order.amount_total)}</dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href={`/my/dashboard/invitations${order.event_id ? `?event=${order.event_id}` : ''}`}
          className="rounded-full bg-[#5B3FA8] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Back to Send invitations
        </Link>
        <Link
          href="/my/dashboard/orders"
          className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700"
        >
          View orders
        </Link>
      </div>
    </div>
  )
}
