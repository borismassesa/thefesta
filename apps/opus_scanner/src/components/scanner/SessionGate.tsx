'use client'

import { Loader2, Lock } from 'lucide-react'
import Link from 'next/link'
import { useScannerSession } from '@/hooks/useScannerSession'
import type { ScannerSession } from '@/types/checkin'

/**
 * Guard for the three scanner screens (scan / guests / arrivals).
 *
 * Mirrors the mobile app's per-screen check: a running shift for THIS event
 * must exist, or the screen is a lock with the way back to the code form.
 * The shift may also end while a screen is open — the session hook's
 * auto-end watchdog clears it, and this gate closes the screen behind it.
 */
export function SessionGate({ eventId, children }: { eventId: string; children: (session: ScannerSession) => React.ReactNode }) {
  const { session, isLoading } = useScannerSession()

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-[#8e57b3]" />
      </div>
    )
  }

  if (!session || session.eventId !== eventId) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-10">
        <Lock size={32} className="text-[#1A1A1A]/40" />
        <p className="mt-3 text-center text-sm text-[#1A1A1A]/60">
          This shift has ended. Enter your access code again to keep scanning.
        </p>
        <Link href="/" replace className="mt-5 rounded-full bg-[#1A1A1A] px-6 py-3">
          <span className="text-xs font-bold uppercase tracking-[1px] text-white">Enter code</span>
        </Link>
      </div>
    )
  }

  return <>{children(session)}</>
}
