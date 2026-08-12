'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ScannerSession } from '@/types/scanner-checkin'
import { clearSession as clearStoredSession, readSession, writeSession } from '@/lib/scanner/session'

/** setTimeout stores its delay in a signed 32-bit int; a longer delay silently
 *  fires immediately. A shift is at most days away, but clamp so a far-future
 *  expiry still schedules a real timer rather than firing at once. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1

/**
 * The validated door session, kept in React state and localStorage.
 *
 * Ported from apps/opus_pass_mobile's useScannerSession (SecureStore +
 * AppState). On the web the storage is localStorage and the foreground signal
 * is `visibilitychange`: a JS timer doesn't fire while a tab is backgrounded,
 * which is exactly when a shift is left running overnight, so the expiry
 * re-check runs every time the tab comes back. This is why the attendant
 * never has to remember to end a shift: the door code's own expiry ends it
 * for them.
 */
export function useScannerSession() {
  const [session, setSession] = useState<ScannerSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const clearSession = useCallback(() => {
    setSession(null)
    clearStoredSession()
  }, [])

  useEffect(() => {
    setSession(readSession())
    setIsLoading(false)
  }, [])

  // Auto-end watchdog: close the shift the instant its window passes, and
  // re-check every time the tab returns to the foreground.
  useEffect(() => {
    if (!session?.expiresAt) return
    const endsAt = new Date(session.expiresAt).getTime()
    if (Number.isNaN(endsAt)) return

    const endIfOver = () => {
      if (Date.now() >= endsAt) clearSession()
    }
    endIfOver()
    const timer = setTimeout(endIfOver, Math.min(Math.max(endsAt - Date.now(), 0), MAX_TIMEOUT_MS))
    const onVisible = () => {
      if (document.visibilityState === 'visible') endIfOver()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [session?.expiresAt, clearSession])

  const saveSession = useCallback((next: ScannerSession) => {
    setSession(next)
    writeSession(next)
  }, [])

  return { session, isLoading, saveSession, clearSession }
}
