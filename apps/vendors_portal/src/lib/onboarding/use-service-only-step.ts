'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useOnboardingDraft } from './draft'
import { sellsProducts } from './verticals'

/**
 * Guard for wizard steps that only make sense for service vendors — the
 * services checklist, style, personality, packages and booking policies. They
 * all describe booked time, which a gift shop or attire vendor never sells.
 *
 * The wizard already routes product vendors past these steps (see the branch in
 * details/about), so this is the belt-and-braces half: a bookmark, a browser
 * Back, or a vendor who switched vertical mid-application can still land on one
 * directly. `replace` rather than `push` so Back doesn't bounce them straight
 * back into the step they were just moved out of.
 */
export function useServiceOnlyStep(redirectTo: string) {
  const router = useRouter()
  const { draft, hydrated } = useOnboardingDraft()
  const skip = hydrated && sellsProducts(draft.vertical)

  useEffect(() => {
    if (skip) router.replace(redirectTo)
  }, [skip, redirectTo, router])

  return { skip }
}
