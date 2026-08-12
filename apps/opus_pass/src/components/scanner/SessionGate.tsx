'use client'

import { Loader2, Lock } from 'lucide-react'
import Link from 'next/link'
import { useScannerSession } from '@/hooks/useScannerSession'
import { useScannerT } from '@/hooks/useScannerT'
import type { ScannerSession } from '@/types/scanner-checkin'
import { ScannerLocaleToggle } from '@/components/scanner/ScannerLocaleToggle'

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
  const t = useScannerT()

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-[#8e57b3]" />
      </div>
    )
  }

  if (!session || session.eventId !== eventId) {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center bg-white px-10">
        <div className="absolute top-0 right-0 p-3 pt-[max(env(safe-area-inset-top),0.75rem)] pr-[max(env(safe-area-inset-right),0.75rem)]">
          <ScannerLocaleToggle />
        </div>
        <Lock size={32} className="text-[#1A1A1A]/40" />
        <p className="mt-3 text-center text-sm text-[#1A1A1A]/60">{t('shift_ended')}</p>
        <Link href="/entrance-card-scanner" replace className="mt-5 rounded-full bg-[#1A1A1A] px-6 py-3">
          <span className="text-xs font-bold uppercase tracking-[1px] text-white">{t('enter_code')}</span>
        </Link>
      </div>
    )
  }

  return <>{children(session)}</>
}
