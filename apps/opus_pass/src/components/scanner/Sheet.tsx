'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface SheetProps {
  open: boolean
  onClose: () => void
  /** Screen-reader name for the dialog. */
  label: string
  /**
   * `screen` — full-height phone sheet (forms / long lists).
   * `content` — hug the children; use for short instructional modals.
   */
  fit?: 'screen' | 'content'
  children: ReactNode
}

/**
 * The web stand-in for React Native's pageSheet Modal: full-screen on phones
 * (where door staff actually work), a centered card on desktop. Renders
 * nothing when closed so the camera underneath can pause decoding on exactly
 * the same condition the mobile app uses.
 *
 * Portaled to document.body so a parent with overflow:hidden / transform
 * (the camera scan page) can never trap the dialog — a stuck party-size
 * sheet is an attendant who has to refresh mid-queue.
 *
 * Escape closes, matching the Android back button / iOS swipe the native
 * modal gets for free.
 */
export function Sheet({ open, onClose, label, fit = 'screen', children }: SheetProps) {
  // Portal only after mount so SSR and the first client paint both render
  // null — otherwise Next flags a hydration mismatch on Sheet.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // A sheet over the scanner owns the whole screen — the page behind it
    // must not scroll under the attendant's fingers.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open || !mounted) return null

  const panelClass =
    fit === 'content'
      ? 'animate-sheet-up relative flex max-h-[min(92dvh,100%)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl'
      : 'animate-sheet-up relative flex h-[100dvh] max-h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-3xl'

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className={panelClass}>{children}</div>
    </div>,
    document.body,
  )
}
