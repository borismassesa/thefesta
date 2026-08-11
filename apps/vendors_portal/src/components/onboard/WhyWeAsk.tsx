'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Info, X } from 'lucide-react'
import { useOnboardT } from '@/lib/onboarding/strings'

type Props = {
  title?: string
  children: ReactNode
  label?: string
}

export function WhyWeAsk({ title, children, label }: Props) {
  const { t } = useOnboardT()
  const resolvedTitle = title ?? t('common.why_we_ask')
  const resolvedLabel = label ?? t('common.why_we_ask')
  const [open, setOpen] = useState(false)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    closeBtnRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open) triggerRef.current?.focus()
  }, [open])

  return (
    <>
      <button data-opus-button="control"
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Info className="w-4 h-4" />
        <span className="underline underline-offset-4">{resolvedLabel}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={resolvedTitle}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <button data-opus-button="control"
            type="button"
            aria-label={t('common.close')}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 max-w-md w-full p-6 lg:p-7">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-gray-900 tracking-tight">{resolvedTitle}</h2>
              <button data-opus-button="control"
                ref={closeBtnRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('common.close')}
                className="-mr-2 -mt-2 p-2 text-gray-500 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 text-sm text-gray-700 leading-relaxed space-y-3">{children}</div>
            <div className="mt-6 flex justify-end">
              <button data-opus-button="primary" data-opus-button-size="medium"
                type="button"
                onClick={() => setOpen(false)}
                className="bg-[#1A1A1A] text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-black transition-colors"
              >
                {t('common.got_it')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
