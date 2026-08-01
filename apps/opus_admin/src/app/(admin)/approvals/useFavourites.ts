'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { ApprovalCategoryKey } from './types'

// Starred request types, pinned to the top of the catalog. This is a
// per-person UI preference, not business data, so it lives in
// localStorage rather than costing a table and a migration.
//
// LIMITATION: device-local preference. Not synchronised between browsers,
// devices or incognito sessions, and cleared with site data. It is keyed
// by account so a shared machine doesn't leak one person's pins to the
// next. If favourites ever need to follow a user across devices, this is
// the one function to swap for a server round-trip.
const PREFIX = 'opusfesta.approvals.favourites'

function storageKey(actorEmail: string): string {
  return `${PREFIX}:${actorEmail.trim().toLowerCase() || 'anonymous'}`
}

// useSyncExternalStore needs a stable subscribe/snapshot pair. The
// listener set lets two components on the same page stay in step, which
// the native `storage` event alone would not do (it only fires in *other*
// tabs).
const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

function emit() {
  for (const l of listeners) l()
}

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? ''
  } catch {
    // Private mode / disabled storage — favourites degrade to "none".
    return ''
  }
}

export function useFavourites(actorEmail: string) {
  const key = useMemo(() => storageKey(actorEmail), [actorEmail])

  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    // Server render has no localStorage; start empty and let the first
    // client snapshot fill it in.
    () => '',
  )

  const favourites = useMemo<ApprovalCategoryKey[]>(
    () => (raw ? (raw.split(',').filter(Boolean) as ApprovalCategoryKey[]) : []),
    [raw],
  )

  const toggle = useCallback(
    (category: ApprovalCategoryKey) => {
      const current = read(key)
      const list = current ? current.split(',').filter(Boolean) : []
      const next = list.includes(category)
        ? list.filter((c) => c !== category)
        : [...list, category]
      try {
        window.localStorage.setItem(key, next.join(','))
      } catch {
        // Nothing to do — the toggle just won't persist.
      }
      emit()
    },
    [key],
  )

  return { favourites, toggle }
}
