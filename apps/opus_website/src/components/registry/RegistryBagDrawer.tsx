'use client'

import { X, ShoppingBag, Trash2, Truck } from 'lucide-react'
import { removeFromRegistryBag, type RegistryBagItem } from '@/lib/registry-storage'

// opusfesta.com/opuspass/* 308-redirects to the OpusPass subdomain, so this
// resolves to opuspass.opusfesta.com/shop/checkout — where the payment engine
// lives. The cart is handed over in the URL (?items=<productId>:<qty>,…); the
// checkout re-fetches every product server-side, so no cross-origin state.
const CHECKOUT_BASE = '/opuspass/shop/checkout'

function priceToNumber(label: string): number {
  const digits = label.replace(/[^\d]/g, '')
  return digits ? parseInt(digits, 10) : 0
}

function formatTzs(n: number): string {
  return `TZS ${n.toLocaleString('en-US')}`
}

export default function RegistryBagDrawer({
  open,
  items,
  onClose,
}: {
  open: boolean
  items: RegistryBagItem[]
  onClose: () => void
}) {
  if (!open) return null

  const subtotal = items.reduce((sum, i) => sum + priceToNumber(i.price) * i.quantity, 0)
  const checkoutHref = `${CHECKOUT_BASE}?items=${items.map((i) => `${i.id}:${i.quantity}`).join(',')}`

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <ShoppingBag size={18} /> Your cart {items.length > 0 ? `(${items.length})` : ''}
          </h2>
          <button data-opus-button="control" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <p className="mt-10 text-center text-sm text-gray-500">
              Nothing here yet — browse the shop and tap “Add to cart” on any gift.
            </p>
          ) : (
            <ul className="space-y-4">
              {items.map((item) => (
                <li key={`${item.category}-${item.id}`} className="flex items-center gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.img} alt={item.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500">
                      {item.price} · Qty {item.quantity}
                    </p>
                  </div>
                  <button data-opus-button="control"
                    onClick={() => removeFromRegistryBag(item.category, item.id)}
                    aria-label="Remove"
                    className="p-1.5 text-gray-400 hover:text-rose-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-medium text-gray-500">Estimated total</span>
              <span className="text-base font-bold text-gray-900">{formatTzs(subtotal)}</span>
            </div>
            <a
              href={checkoutHref}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800"
            >
              Check out now
            </a>
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-500">
              <Truck className="h-3.5 w-3.5" /> Secure checkout · delivery across Tanzania
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
