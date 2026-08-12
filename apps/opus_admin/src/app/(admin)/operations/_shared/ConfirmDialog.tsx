// OF-ADM-EDITORIAL-001 — designed confirmation dialog. Replaces the native
// window.confirm() popup so destructive actions stay on-brand and don't
// look like a broken page.
//
// Behavior:
//   - Backdrop dims to bg-gray-900/40 + light backdrop-blur, matching
//     InviteAuthorDialog so the two modals feel like the same surface.
//   - Click outside the card or press Escape → cancel. Confirm requires
//     an explicit click on the confirm button — never auto-confirms.
//   - First focus lands on the safer button (Cancel) so the user can't
//     destroy something by hitting Enter while the dialog mounts. Spec'd
//     this way by every well-designed delete-confirmation dialog (Linear,
//     Notion, Stripe Dashboard).
//   - Variant `danger` swaps the confirm button to red-600 and uses an
//     amber warning icon. `default` uses the lavender brand primary.
//   - The confirm button shows a `pending` state with a tiny spinner so
//     long server actions don't appear hung.

'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { AlertTriangle, Info, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'danger'

type Props = {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: Variant
  pending?: boolean
  // Inline error shown above the action buttons. Use this when the confirm
  // action can fail and you want the dialog to stay open on failure.
  error?: string | null
  // Override the default icon if you want something more specific. Pass
  // `null` to suppress the icon entirely.
  icon?: ReactNode | null
}

const ICON_TONE: Record<Variant, string> = {
  default: 'bg-[#F0DFF6] text-[#7E5896]',
  danger: 'bg-red-50 text-red-600',
}

const CONFIRM_TONE: Record<Variant, string> = {
  default:
    'bg-[#C9A0DC] text-white shadow-sm hover:bg-[#b97fd0] focus-visible:ring-[#7E5896]',
  danger:
    'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-700',
}

export default function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  pending = false,
  error,
  icon,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel()
    }
    window.addEventListener('keydown', onKey)
    // Lock background scroll while the dialog is open — same trick most
    // modals use to keep wheel events from leaking through.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, pending, onCancel])

  if (!open) return null

  const resolvedIcon =
    icon === null
      ? null
      : icon ?? (variant === 'danger' ? (
          <AlertTriangle className="h-5 w-5" />
        ) : (
          <Info className="h-5 w-5" />
        ))

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby={body ? 'confirm-dialog-body' : undefined}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 px-4 backdrop-blur-[2px]"
      onClick={(e) => {
        if (pending) return
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
        <div className="mb-4 flex items-start gap-3">
          {resolvedIcon && (
            <span
              className={cn(
                'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                ICON_TONE[variant]
              )}
              aria-hidden="true"
            >
              {resolvedIcon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-dialog-title"
              className="text-base font-semibold text-gray-900"
            >
              {title}
            </h2>
            {body && (
              <div
                id="confirm-dialog-body"
                className="mt-1 text-sm leading-relaxed text-gray-600"
              >
                {body}
              </div>
            )}
          </div>
          <button data-opus-button="control"
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A0DC] disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
          >
            {error}
          </p>
        )}

        <div className="mt-2 flex items-center justify-end gap-2">
          <button data-opus-button="neutral" data-opus-button-size="medium"
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A0DC] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button data-opus-button="neutral" data-opus-button-size="medium"
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
              'disabled:cursor-not-allowed disabled:opacity-60',
              CONFIRM_TONE[variant]
            )}
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
