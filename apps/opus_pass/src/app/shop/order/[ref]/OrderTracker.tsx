'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Loader2, PackageSearch } from 'lucide-react'
import OrderTimeline from '@/components/shop/OrderTimeline'
import InvoiceButton from '@/components/shop/InvoiceButton'
import type { ShopOrderDetail } from '@/lib/shop/order-types'

function formatTzs(n: number): string {
  return `TZS ${n.toLocaleString('en-US')}`
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// `orderRef` is fixed when we arrive from a direct link (/shop/order/[ref]);
// on the bare lookup page (/shop/order) it's omitted and the buyer also enters
// their order number.
export default function OrderTracker({ orderRef }: { orderRef?: string }) {
  const [refInput, setRefInput] = useState(orderRef ?? '')
  const [email, setEmail] = useState('')
  const [detail, setDetail] = useState<ShopOrderDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveRef = (orderRef ?? refInput).trim()

  async function lookup(e: React.FormEvent) {
    e.preventDefault()
    if (!effectiveRef) return setError('Enter your order number.')
    if (!EMAIL_RE.test(email.trim())) return setError('Enter the email you used at checkout.')
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/shop/order-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: effectiveRef, email: email.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Something went wrong. Please try again.')
      setDetail(data as ShopOrderDetail)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // ── Lookup gate (order number when unknown + email) ─────────────────────────
  if (!detail) {
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_2px_12px_-8px_rgba(0,0,0,0.12)]">
          <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-black/[0.05] text-[#1A1A1A]">
            <PackageSearch className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-bold text-[#1A1A1A]">Track your order</h1>
          <p className="mt-1 text-sm text-[#1A1A1A]/60">
            {orderRef ? (
              <>
                Order <span className="font-semibold text-[#1A1A1A]">{orderRef}</span>. Enter the email you used at
                checkout to see its status.
              </>
            ) : (
              'Enter your order number and the email you used at checkout.'
            )}
          </p>
          <form onSubmit={lookup} className="mt-5 space-y-3">
            {!orderRef && (
              <input
                type="text"
                value={refInput}
                onChange={(e) => setRefInput(e.target.value)}
                placeholder="Order number (e.g. OF-2026-XXXXXX)"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email at checkout"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#1A1A1A] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-black disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              View order status
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Order detail ────────────────────────────────────────────────────────────
  const d = detail.delivery
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Order {detail.ref}</h1>
          <p className="mt-1 text-sm text-[#1A1A1A]/60">
            Placed {new Date(detail.placedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <InvoiceButton orderRef={detail.ref} email={email.trim()} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* Timeline */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_2px_12px_-8px_rgba(0,0,0,0.12)]">
          <h2 className="mb-5 text-base font-bold text-[#1A1A1A]">Progress</h2>
          <OrderTimeline status={detail.status} fulfillmentStatus={detail.fulfillmentStatus} />
        </div>

        {/* Items + delivery */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_2px_12px_-8px_rgba(0,0,0,0.12)]">
            <h2 className="mb-3 text-sm font-bold text-[#1A1A1A]">Items</h2>
            <div className="space-y-3">
              {detail.items.map((it) => (
                <div key={it.id} className="flex items-start gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-black/[0.05]">
                    {it.image ? <Image src={it.image} alt="" fill sizes="48px" className="object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-[#1A1A1A]">{it.name}</p>
                    <p className="text-xs text-[#1A1A1A]/50">Qty {it.quantity}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-[#1A1A1A]">{formatTzs(it.total)}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between border-t border-black/[0.08] pt-3 text-sm font-bold text-[#1A1A1A]">
              <span>Total</span>
              <span>{formatTzs(detail.amountTotal)}</span>
            </div>
          </div>

          {d && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_2px_12px_-8px_rgba(0,0,0,0.12)]">
              <h2 className="mb-2 text-sm font-bold text-[#1A1A1A]">Delivery</h2>
              <div className="space-y-0.5 text-sm text-[#1A1A1A]/70">
                {d.name && <p className="font-medium text-[#1A1A1A]">{d.name}</p>}
                {d.address && <p>{d.address}</p>}
                {(d.city || d.region) && <p>{[d.city, d.region].filter(Boolean).join(', ')}</p>}
                {d.phone && <p>{d.phone}</p>}
                {d.notes && <p className="mt-1 text-xs italic text-[#1A1A1A]/50">{d.notes}</p>}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
