'use client'

import { useEffect, type ReactNode } from 'react'

interface SheetProps {
  open: boolean
  onClose: () => void
  /** Screen-reader name for the dialog. */
  label: string
  children: ReactNode
}

/**
 * The web stand-in for React Native's pageSheet Modal: full-screen on phones
 * (where door staff actually work), a centered card on desktop. Renders
 * nothing when closed so the camera underneath can pause decoding on exactly
 * the same condition the mobile app uses.
 *
 * Escape closes, matching the Android back button / iOS swipe the native
 * modal gets for free.
 */
export function Sheet({ open, onClose, label, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // A sheet over the scanner owns the whole screen — the page behind it
    // must not scroll under the attendant's fingers.
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="animate-sheet-up relative flex h-dvh w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-3xl">
        {children}
      </div>
    </div>
  )
}
