'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOnboardT } from '@/lib/onboarding/strings'

type Tone = 'danger' | 'primary'

type Props = {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: Tone
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useOnboardT()
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel')
  const cancelBtnRef = useRef<HTMLButtonElement>(null)
  const lastFocusedRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    lastFocusedRef.current = document.activeElement
    cancelBtnRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (lastFocusedRef.current instanceof HTMLElement) {
        lastFocusedRef.current.focus()
      }
    }
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in"
    >
      {/* Backdrop */}
      <button data-opus-button="control"
        type="button"
        aria-label={resolvedCancelLabel}
        onClick={onCancel}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      {/* Dialog card */}
      <div
        className={cn(
          'relative bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full overflow-hidden',
          'transform transition-all',
        )}
      >
        {/* Top accent bar */}
        <div
          className={cn(
            'h-1 w-full',
            tone === 'danger' ? 'bg-red-500' : 'bg-[#1A1A1A]',
          )}
        />

        <div className="px-6 lg:px-7 pt-6 pb-7">
          <div className="flex items-start gap-4">
            {tone === 'danger' ? (
              <span
                aria-hidden
                className="shrink-0 w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center"
              >
                <AlertTriangle className="w-5 h-5" />
              </span>
            ) : null}

            <div className="flex-1 min-w-0">
              <h2
                id="confirm-title"
                className="text-lg font-semibold text-gray-900 tracking-tight"
              >
                {title}
              </h2>
              {description ? (
                <div className="mt-2 text-sm text-gray-700 leading-relaxed">{description}</div>
              ) : null}
            </div>

            <button data-opus-button="control"
              type="button"
              onClick={onCancel}
              aria-label={t('common.close')}
              className="-mr-2 -mt-1 p-2 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button data-opus-button="control"
              ref={cancelBtnRef}
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 rounded-full text-sm font-semibold text-gray-900 hover:bg-gray-100 transition-colors"
            >
              {resolvedCancelLabel}
            </button>
            <button data-opus-button="danger" data-opus-button-size="medium"
              type="button"
              onClick={onConfirm}
              className={cn(
                'px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-colors',
                tone === 'danger'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-[#1A1A1A] hover:bg-black',
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
