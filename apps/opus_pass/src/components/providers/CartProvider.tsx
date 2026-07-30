'use client'

import type { StoredOrderAddOn } from '@/lib/cart-storage'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Treatment } from '@/components/guests/InvitationVisual'

export type CartItem = {
  /** Product id — one line per design; re-adding the same design replaces it. */
  id: string
  name: string
  designer: string
  treatment: Treatment
  /** Real card artwork (hero image, else first uploaded design) the customer
   *  selected. Cart thumbnails render this; `treatment` is only the fallback
   *  for products with no uploaded image. */
  image?: string
  /** Short config summary, e.g. "Digital cards · 150 guests" (fallback for list views). */
  summary: string
  /** Structured config — used to render a clean breakdown in the cart. */
  tier?: string
  /** Tier id (lite/classic/elegant/signature) — drives the package pill colour. */
  tierId?: string
  guests?: number
  /** Per-guest tier price (TZS) — lets the cart recompute the line when guests change. */
  pricePerGuest?: number
  /** Non-guest-scaling extras already included in `total` (paper prints, door-scan). */
  extrasTotal?: number
  addOns?: string[]
  /** Structured add-ons (code/qty), so fulfilment never parses the labels. */
  addOnItems?: StoredOrderAddOn[]
  /** Line total in TZS. */
  total: number
}

/** Minimum guest count (matches the product page). */
export const MIN_GUESTS = 50

/**
 * Canonical line summary, e.g. "Signature · 120 guests · On-site attendant".
 * Single source for the summary string so it can be rebuilt whenever the
 * structured fields change (the cart lets users edit the guest count).
 */
export function buildItemSummary(parts: { tier?: string; guests?: number; addOns?: string[] }): string {
  return [
    parts.tier,
    parts.guests != null ? `${parts.guests.toLocaleString('en-US')} guests` : null,
    ...(parts.addOns ?? []),
  ]
    .filter(Boolean)
    .join(' · ')
}

type CartContextValue = {
  items: CartItem[]
  count: number
  subtotal: number
  addItem: (item: CartItem) => void
  removeItem: (id: string) => void
  /** Update a line's guest count and recompute its total. */
  setGuests: (id: string, guests: number) => void
  clear: () => void
}

// v2: cart items now carry structured tier/guests/addOns (not just a summary string).
// Bumping the key invalidates v1 carts so stale-shape items don't linger.
const STORAGE_KEY = 'opuspass.cart.v2'

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  // Hydrate from localStorage after mount (avoids SSR/client mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setItems(JSON.parse(raw) as CartItem[])
    } catch {
      // Corrupt or unavailable storage — start with an empty cart.
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Ignore persistence failures (private mode, quota, etc.).
    }
  }, [items])

  const addItem = useCallback((item: CartItem) => {
    setItems((prev) => {
      const without = prev.filter((i) => i.id !== item.id)
      return [...without, item]
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const setGuests = useCallback((id: string, guests: number) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i
        const g = Math.max(MIN_GUESTS, Math.round(guests) || MIN_GUESTS)
        // Prefer the stored breakdown; fall back to deriving it for legacy items.
        const perGuest = i.pricePerGuest ?? (i.guests ? Math.round(i.total / i.guests) : 0)
        const extras = i.extrasTotal ?? 0
        return {
          ...i,
          guests: g,
          total: Math.round(perGuest * g + extras),
          // The summary is a denormalised snapshot — rebuild it so orders
          // placed after a guest-count edit don't show the stale count.
          summary: buildItemSummary({ tier: i.tier, guests: g, addOns: i.addOns }),
        }
      }),
    )
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.length,
      subtotal: items.reduce((sum, i) => sum + i.total, 0),
      addItem,
      removeItem,
      setGuests,
      clear,
    }),
    [items, addItem, removeItem, setGuests, clear],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a CartProvider')
  return ctx
}
