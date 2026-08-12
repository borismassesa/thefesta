import type { ScannerSession } from '@/types/checkin'

const SESSION_KEY = 'opuspass.scanner.session'

/** True once the shift's window has closed. Sessions without an expiry (saved
 *  before auto-end shipped) never count as over here — the server still turns
 *  away any late scan. */
export function isShiftOver(session: Pick<ScannerSession, 'expiresAt'>): boolean {
  if (!session.expiresAt) return false
  const endsAt = new Date(session.expiresAt).getTime()
  return !Number.isNaN(endsAt) && Date.now() >= endsAt
}

/**
 * The one running door shift, persisted so a mid-shift restart doesn't force
 * re-login.
 *
 * Single global slot — not per event — mirroring the mobile app
 * (opuspass.scanner.session in SecureStore): a device runs ONE shift at a
 * time, and starting a shift for another event replaces it. localStorage
 * rather than anything fancier because the token is not trusted on its own:
 * every scan re-verifies it server-side, so a revoked or expired code fails
 * at the door even though it's still cached here.
 */
export function readSession(): ScannerSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ScannerSession
    // The event may have ended while the tab was closed — a forgotten shift
    // must not resume days later. Drop it instead of restoring.
    if (isShiftOver(parsed)) {
      window.localStorage.removeItem(SESSION_KEY)
      return null
    }
    return parsed
  } catch {
    // Corrupt or unreadable entry — treat as signed out rather than crashing.
    return null
  }
}

export function writeSession(session: ScannerSession): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Non-fatal: the shift continues in memory, it just won't survive a restart.
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(SESSION_KEY)
  } catch {
    // Already gone.
  }
}
