'use client'

import { useEffect } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  body: string
  /** Destructive primary (end shift) vs accent (new shift). */
  tone?: 'danger' | 'accent'
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * In-app confirm for shift actions — replaces window.confirm so door staff
 * get the same branded UI as the rest of the scanner, not a browser chrome dialog.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  tone = 'accent',
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onCancel])

  if (!open) return null

  const confirmClass =
    tone === 'danger'
      ? 'bg-[#B3261E] text-white hover:bg-[#9a2019]'
      : 'bg-[#C9A0DC] text-[#1A1A1A] hover:bg-[#b97fd0]'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-5"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="scanner-confirm-title"
      aria-describedby="scanner-confirm-body"
    >
      <div className="absolute inset-0 bg-black/55" onClick={onCancel} />
      <div className="animate-sheet-up relative w-full max-w-sm overflow-hidden rounded-3xl bg-white p-6 shadow-2xl">
        <h2 id="scanner-confirm-title" className="text-xl font-bold tracking-tight text-[#1A1A1A]">
          {title}
        </h2>
        <p id="scanner-confirm-body" className="mt-2 text-sm leading-relaxed text-[#1A1A1A]/60">
          {body}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-12 items-center justify-center rounded-full border border-black/12 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-black/3"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex h-12 items-center justify-center rounded-full text-sm font-bold transition-colors ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
