'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'

type FavoritesContextValue = {
  /** Product ids the couple has saved. */
  ids: Set<string>
  count: number
  /** True once the initial load has settled (avoids a flash of empty hearts). */
  ready: boolean
  isFavorite: (productId: string) => boolean
  /** Optimistic save/unsave. Signed-out users are sent to sign-in instead. */
  toggle: (productId: string) => void
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

/**
 * Server-persisted saved designs, shared across the catalog, product pages, the
 * dashboard header heart, and the /digital-cards/favorites page. Backed by
 * /api/favorites (table invitation_product_favorites) so likes sync with the
 * mobile app and survive reloads — replacing the old per-page local state.
 */
export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isSignedIn, isLoaded } = useAuth()
  const [ids, setIds] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)
  // Guards optimistic reverts against a slow in-flight refresh clobbering them.
  const inFlight = useRef(0)

  const refresh = useCallback(async () => {
    const ticket = ++inFlight.current
    try {
      const res = await fetch('/api/favorites', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { ids?: string[] }
      if (ticket === inFlight.current) setIds(new Set(data.ids ?? []))
    } catch {
      /* offline / transient — keep last known state */
    } finally {
      if (ticket === inFlight.current) setReady(true)
    }
  }, [])

  // Load once auth resolves; clear on sign-out.
  useEffect(() => {
    if (!isLoaded) return
    if (isSignedIn) {
      void refresh()
    } else {
      setIds(new Set())
      setReady(true)
    }
  }, [isLoaded, isSignedIn, refresh])

  const isFavorite = useCallback((productId: string) => ids.has(productId), [ids])

  const toggle = useCallback(
    (productId: string) => {
      if (isLoaded && !isSignedIn) {
        router.push('/sign-in?redirect_url=/digital-cards/favorites')
        return
      }
      const next = !ids.has(productId)
      // Optimistic flip.
      setIds((prev) => {
        const copy = new Set(prev)
        if (next) copy.add(productId)
        else copy.delete(productId)
        return copy
      })
      inFlight.current++ // invalidate any refresh that resolves after this
      fetch('/api/favorites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId, favorited: next }),
      })
        .then((res) => {
          if (res.ok) return
          // Revert on failure.
          setIds((prev) => {
            const copy = new Set(prev)
            if (next) copy.delete(productId)
            else copy.add(productId)
            return copy
          })
        })
        .catch(() => {
          setIds((prev) => {
            const copy = new Set(prev)
            if (next) copy.delete(productId)
            else copy.add(productId)
            return copy
          })
        })
    },
    [ids, isLoaded, isSignedIn, router],
  )

  const value = useMemo<FavoritesContextValue>(
    () => ({ ids, count: ids.size, ready, isFavorite, toggle }),
    [ids, ready, isFavorite, toggle],
  )

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites must be used within a FavoritesProvider')
  return ctx
}
