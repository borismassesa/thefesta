'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ShoppingBag, Trash2 } from 'lucide-react'
import { InvitationVisual } from '@/components/guests/InvitationVisual'
import { useCart } from '@/components/providers/CartProvider'

function formatTzs(n: number): string {
  return `TZS ${n.toLocaleString('en-US')}`
}

// Cart trigger in the nav. Clicking opens a mini-cart preview (items, subtotal,
// checkout) so the couple can act without a full page load; the panel still
// links through to the full cart / checkout.
export default function CartMenu() {
  const { items, count, subtotal, removeItem } = useCart()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={count ? `Cart — ${count} item${count > 1 ? 's' : ''}` : 'Cart, empty'}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
      >
        <ShoppingBag size={20} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-(--accent) px-1 text-[11px] font-bold leading-none text-(--on-accent) ring-2 ring-white tabular-nums">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed right-3 top-16 z-50 flex max-h-[70vh] w-[calc(100vw-1.5rem)] max-w-[360px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-[380px] sm:max-w-[380px]">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-bold text-[#1A1A1A]">
              Cart{count > 0 && <span className="ml-1.5 font-medium text-gray-400">{count}</span>}
            </p>
            {count > 0 && (
              <Link
                href="/digital-cards/cart"
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-(--accent) hover:underline"
              >
                View cart
              </Link>
            )}
          </div>

          {count === 0 ? (
            <div className="px-4 py-12 text-center">
              <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#FAFAF8] ring-1 ring-[#1A1A1A]/10">
                <ShoppingBag className="h-6 w-6 text-gray-400" />
              </span>
              <p className="text-sm font-semibold text-[#1A1A1A]">Your cart is empty</p>
              <p className="mx-auto mt-1 max-w-[16rem] text-xs text-gray-500">
                Browse the catalog and add a design to get started.
              </p>
              <Link
                href="/digital-cards/catalog"
                onClick={() => setOpen(false)}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-(--accent) px-5 py-2.5 text-sm font-semibold text-(--on-accent) transition-colors hover:bg-(--accent-hover)"
              >
                Browse digital cards
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ul className="divide-y divide-gray-50">
                    {items.map((item) => (
                      <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                        <span className="relative block h-14 w-10 shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-gray-200">
                          {item.image ? (
                            <Image src={item.image} alt="" fill sizes="40px" className="object-cover" unoptimized />
                          ) : (
                            <InvitationVisual treatment={item.treatment} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[#1A1A1A]">{item.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-gray-500">{item.summary}</span>
                          <span className="mt-1 block text-sm font-semibold tabular-nums text-gray-900">
                            {formatTzs(item.total)}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          aria-label={`Remove ${item.name}`}
                          className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                </ul>
              </div>

              <div className="shrink-0 border-t border-gray-100 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-bold tabular-nums text-[#1A1A1A]">{formatTzs(subtotal)}</span>
                </div>
                <Link
                  href="/digital-cards/checkout"
                  onClick={() => setOpen(false)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-(--accent) px-5 py-3 text-sm font-semibold text-(--on-accent) transition-colors hover:bg-(--accent-hover)"
                >
                  Checkout
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
