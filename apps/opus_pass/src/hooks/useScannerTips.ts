'use client'

import { useCallback, useEffect, useState } from 'react'

const SEEN_KEY = 'opuspass.scanner.tipsSeen'
const BANNER_KEY = 'opuspass.scanner.tipsBannerDismissed'

/**
 * First-run coaching for the scan screen.
 *
 * Door attendants are usually casual staff working a single shift, handed a
 * phone minutes before guests arrive and never trained on it. The tips fire
 * once, unprompted, and then stay reachable from a banner they can dismiss —
 * so the person who already knows the job isn't taxed for the person who
 * doesn't.
 *
 * Plain localStorage: this is a UI preference, not a credential, and losing
 * it costs one extra dismissal.
 */
export function useScannerTips() {
  const [ready, setReady] = useState(false)
  const [showTips, setShowTips] = useState(false)
  const [bannerVisible, setBannerVisible] = useState(false)

  useEffect(() => {
    try {
      setShowTips(window.localStorage.getItem(SEEN_KEY) !== 'true')
      setBannerVisible(window.localStorage.getItem(BANNER_KEY) !== 'true')
    } catch {
      // Unreadable store — show the tips. Coaching someone twice is a much
      // smaller failure than never coaching them at all.
      setShowTips(true)
      setBannerVisible(true)
    } finally {
      setReady(true)
    }
  }, [])

  const openTips = useCallback(() => setShowTips(true), [])

  const closeTips = useCallback(() => {
    setShowTips(false)
    try {
      window.localStorage.setItem(SEEN_KEY, 'true')
    } catch {
      // Non-fatal: they'll see the tips again next visit.
    }
  }, [])

  const dismissBanner = useCallback(() => {
    setBannerVisible(false)
    try {
      window.localStorage.setItem(BANNER_KEY, 'true')
    } catch {
      // Non-fatal, as above.
    }
  }, [])

  return { ready, showTips, openTips, closeTips, bannerVisible, dismissBanner }
}
