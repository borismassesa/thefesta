'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronDown, Loader2, Undo2, X } from 'lucide-react'
import type { UnlinkedOrder } from './queries'
import {
  dismissUnattributedOrder,
  getDismissedUnattributedOrders,
  restoreUnattributedOrder,
} from './account-actions'

/**
 * Sits below the stat cards, not among them: this is an exception to act on,
 * not a metric to track, and it disappears entirely once every order is dealt
 * with. Collapsed by default so it stays a one-line nudge.
 *
 * Two exits, because attaching is not always possible. An order bought by
 * someone who never signed up, a duplicate, or one left behind by a deleted
 * couple will never have an account to attach to, and with no way to say so the
 * banner became a permanent warning that nobody reads. Dismissing hides the row
 * and NOTHING ELSE: the payment keeps its status, stays in Finance, and still
 * reconciles against Selcom. That is why this is a dismiss and not a delete.
 */
export default function UnattributedBanner({ orders }: { orders: UnlinkedOrder[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  /** Which row is showing its reason input. One at a time: dismissing is a
   *  judgement per order, not a bulk sweep. */
  const [dismissing, setDismissing] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [dismissed, setDismissed] = useState<UnlinkedOrder[] | null>(null)

  const total = orders.reduce((sum, o) => sum + o.amountTotal, 0)
  const matched = orders.filter((o) => o.matchedUserId).length

  function submitDismiss(orderId: string) {
    setError(null)
    startTransition(async () => {
      const result = await dismissUnattributedOrder(orderId, reason)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDismissing(null)
      setReason('')
      setDismissed(null)
      router.refresh()
    })
  }

  function restore(orderId: string) {
    setError(null)
    startTransition(async () => {
      const result = await restoreUnattributedOrder(orderId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDismissed(null)
      router.refresh()
    })
  }

  function toggleDismissedList() {
    if (dismissed) {
      setDismissed(null)
      return
    }
    startTransition(async () => {
      const result = await getDismissedUnattributedOrders()
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDismissed(result.orders)
    })
  }

  return (
    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        <p className="min-w-0 flex-1 text-sm text-amber-900">
          <span className="font-semibold">
            {orders.length} order{orders.length === 1 ? '' : 's'} worth TZS {total.toLocaleString('en-US')} not attached
            to an account
          </span>
          <span className="text-amber-800">
            {' '}
            · bought without signing in
            {matched > 0 ? `, ${matched} matched by email` : ''}
          </span>
        </p>
        <ChevronDown className={`h-4 w-4 shrink-0 text-amber-600 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="border-t border-amber-200 px-5 py-4">
          <p className="text-sm text-amber-800">
            These do not count towards the couple&apos;s credits or pledge eligibility. Open the couple and link the
            order from their Orders tab. If an order will never belong to an account, dismiss it: that clears it from
            this list and changes nothing about the payment, which stays in Finance and in every revenue total.
          </p>

          {error ? (
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
              {error}
            </p>
          ) : null}

          <ul className="mt-3 space-y-2">
            {orders.map((order) => (
              <li key={order.orderId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold text-amber-900">{order.ref}</span>
                <span className="tabular-nums text-amber-900">
                  {order.currency} {order.amountTotal.toLocaleString('en-US')}
                </span>
                <span className="text-amber-700">{order.contactEmail || 'no email on order'}</span>
                {order.matchedUserId ? (
                  <Link
                    href={`/opus-pass/couples/${order.matchedUserId}`}
                    className="font-semibold text-[#7E5896] underline-offset-2 hover:underline"
                  >
                    {order.matchedCoupleName}
                  </Link>
                ) : (
                  <span className="text-amber-600">no matching account</span>
                )}

                {dismissing === order.orderId ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why will this never be attached?"
                      autoFocus
                      className="w-64 rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs text-amber-900 placeholder:text-amber-400 focus:border-[#7E5896] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => submitDismiss(order.orderId)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#7E5896] px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-[#5d3a78] disabled:opacity-60"
                    >
                      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Confirm
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setDismissing(null)
                        setReason('')
                      }}
                      className="text-xs font-semibold text-amber-700 hover:underline"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setDismissing(order.orderId)
                      setReason('')
                      setError(null)
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-2 py-0.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
                  >
                    <X className="h-3 w-3" />
                    Dismiss
                  </button>
                )}
              </li>
            ))}
          </ul>

          <button
            type="button"
            disabled={pending}
            onClick={toggleDismissedList}
            className="mt-4 text-xs font-semibold text-amber-800 underline-offset-2 hover:underline disabled:opacity-60"
          >
            {dismissed ? 'Hide dismissed orders' : 'Show dismissed orders'}
          </button>

          {dismissed ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-white/60 px-3 py-3">
              {dismissed.length === 0 ? (
                <p className="text-xs text-amber-700">Nothing has been dismissed yet.</p>
              ) : (
                <ul className="space-y-2">
                  {dismissed.map((order) => (
                    <li key={order.orderId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="font-semibold text-amber-900">{order.ref}</span>
                      <span className="tabular-nums text-amber-900">
                        {order.currency} {order.amountTotal.toLocaleString('en-US')}
                      </span>
                      <span className="text-amber-700">{order.contactEmail || 'no email on order'}</span>
                      <span className="text-amber-600">
                        {order.dismissedReason}
                        {order.dismissedBy ? ` · ${order.dismissedBy}` : ''}
                      </span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => restore(order.orderId)}
                        className="inline-flex items-center gap-1 font-semibold text-[#7E5896] underline-offset-2 hover:underline disabled:opacity-60"
                      >
                        <Undo2 className="h-3 w-3" />
                        Put back
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
