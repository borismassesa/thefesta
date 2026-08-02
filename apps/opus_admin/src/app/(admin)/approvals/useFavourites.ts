'use client'

import { useCallback, useMemo } from 'react'
import type { ApprovalCategoryKey } from './types'
import { prefKey, readPref, useLocalPref, writePref } from './localPref'

// Starred request types, pinned to the top of the catalog. Storage and its
// limitations live in localPref.ts; this hook only owns the encoding, which
// is a comma-separated list of category keys.

export function useFavourites(actorEmail: string) {
  const key = useMemo(() => prefKey('favourites', actorEmail), [actorEmail])
  const [raw] = useLocalPref(key)

  const favourites = useMemo<ApprovalCategoryKey[]>(
    () => (raw ? (raw.split(',').filter(Boolean) as ApprovalCategoryKey[]) : []),
    [raw],
  )

  const toggle = useCallback(
    (category: ApprovalCategoryKey) => {
      // Re-read rather than closing over `favourites`: two rows toggled in
      // the same tick would otherwise both write from the same stale list.
      const current = readPref(key)
      const list = current ? current.split(',').filter(Boolean) : []
      const next = list.includes(category)
        ? list.filter((c) => c !== category)
        : [...list, category]
      writePref(key, next.join(','))
    },
    [key],
  )

  return { favourites, toggle }
}
