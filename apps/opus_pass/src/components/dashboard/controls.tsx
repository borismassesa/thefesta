'use client'

import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { opusButtonClass, type OpusButtonSize, type OpusButtonVariant } from '@opusfesta/lib'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, OpusButtonVariant> = {
  primary: 'primary',
  secondary: 'neutral',
  ghost: 'tertiary',
  danger: 'danger',
}

export function Button({
  variant = 'primary',
  size = 'medium',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: OpusButtonSize }) {
  return (
    <button
      className={cn(
        opusButtonClass({ variant: VARIANTS[variant], size }),
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  width?: 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  const widthClass = width === 'xl' ? 'max-w-6xl' : width === 'lg' ? 'max-w-2xl' : 'max-w-lg'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={cn('relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl', widthClass)}>
        <div className="flex items-center justify-between border-b border-black/[0.06] px-6 py-4">
          <h3 className="text-base font-semibold text-[#1A1A1A]">{title}</h3>
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/[0.05]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* data-lenis-prevent: the root SmoothScrollProvider (Lenis) hijacks
            wheel events app-wide and preventDefaults them unless the target
            opts out — without this, mouse-wheel scrolling in this panel does
            nothing and only dragging the native scrollbar works. */}
        <div data-lenis-prevent className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-black/[0.06] px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
  pending = false,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
  pending?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && !pending) onConfirm()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose, onConfirm, pending])

  if (!open) return null

  const isDanger = variant === 'danger'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="px-6 pt-6">
          <div className="flex items-start gap-4">
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                isDanger ? 'bg-rose-50 text-rose-600' : 'bg-black/[0.05] text-[#1A1A1A]/70',
              )}
              aria-hidden="true"
            >
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 id="confirm-title" className="text-base font-semibold text-[#1A1A1A]">
                {title}
              </h3>
              {description ? (
                <div className="mt-1 text-sm text-[#1A1A1A]/65">{description}</div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-2 border-t border-black/[0.06] bg-[#FBFAF8] px-6 py-4">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={isDanger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={pending}
            autoFocus
          >
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function Slideover({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  width?: 'md' | 'lg'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  const widthClass = width === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md'

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={cn(
          'absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl',
          widthClass,
        )}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-black/[0.06] px-6 py-4">
          <h3 className="text-base font-semibold text-[#1A1A1A]">{title}</h3>
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/[0.05]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* data-lenis-prevent: the root SmoothScrollProvider (Lenis) hijacks
            wheel events app-wide and preventDefaults them unless the target
            opts out — without this, mouse-wheel scrolling in this panel does
            nothing and only dragging the native scrollbar works. */}
        <div data-lenis-prevent className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-black/[0.06] px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  trailing,
}: {
  value: T
  onChange: (v: T) => void
  tabs: { id: T; label: string }[]
  /** Optional content (e.g. a scoped-event switcher) rendered at the end of
   *  the same bordered row, so it shares the tabs' baseline and underline. */
  trailing?: ReactNode
}) {
  return (
    // The tabs stay on ONE row and scroll sideways when they outgrow the
    // width; only the trailing action group drops below them on phones (it
    // holds buttons, which should not be hidden inside a scroller). The
    // scrolling strip carries -mb-px itself, so its children need no negative
    // margin and nothing overflows it vertically to be clipped.
    <div className="-mx-6 mb-5 flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-black/[0.06] px-6">
      <div
        role="tablist"
        className="no-scrollbar -mb-px flex min-w-0 flex-1 items-center gap-x-6 overflow-x-auto overflow-y-hidden [&>*]:shrink-0"
      >
        {tabs.map((t) => {
          const active = t.id === value
          return (
            <button data-opus-button="control"
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.id)}
              className={cn(
                'whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors',
                active
                  ? 'border-[#1A1A1A] text-[#1A1A1A]'
                  : 'border-transparent text-[#1A1A1A]/55 hover:text-[#1A1A1A]',
              )}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      {trailing ? (
        <div className="-mb-px flex basis-full items-center pb-3 sm:ml-auto sm:basis-auto">
          {trailing}
        </div>
      ) : null}
    </div>
  )
}

export function Field({
  label,
  children,
  hint,
  required,
  hintInline,
}: {
  label: string
  children: ReactNode
  hint?: string
  required?: boolean
  /** Right-aligned slot on the label row — for actions like "Reset address →". */
  hintInline?: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[#1A1A1A]/80">
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </span>
        {hintInline ? <span className="text-xs">{hintInline}</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[#1A1A1A]/45">{hint}</span> : null}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-black/[0.12] bg-white px-3.5 py-2.5 text-sm text-[#1A1A1A] outline-none transition-colors placeholder:text-[#1A1A1A]/35 focus:border-[#C9A0DC] focus:ring-2 focus:ring-[#C9A0DC]/30'

/** A brand-accent on/off switch (the "Collect RSVPs" style toggle). */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button data-opus-button="control"
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-[#C9A0DC]' : 'bg-black/[0.15]',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
