'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { X, Smartphone, Loader2, AlertCircle, ShieldCheck, Lock } from 'lucide-react'
import { templateCardItemId, type TemplateCardType } from '@/lib/dashboard/pledge-card-templates'
import type { InitiateRequest, InitiateResponse, StatusResponse } from '@/lib/payments/types'
import type { CheckoutFormStrings, CheckoutPaymentStrings } from '@/lib/cms/ui-strings-fallback'
import { cn } from '@/lib/utils'
import { getLastOrder, setLastOrder, type StoredOrder, type StoredOrderPayment } from '@/lib/cart-storage'

// A single-item checkout for buying ONE pledge-card / thank-you-card design —
// the same Selcom/M-Pesa payment machinery the invitation-card checkout uses
// (see apps/opus_pass/src/app/digital-cards/checkout/CheckoutClient.tsx and
// /api/payments/{initiate,status,webhook}), trimmed down to a single
// flat-price line instead of a guest-tier cart. Reuses that flow's CMS copy
// (checkout-payment / checkout-form) so the wording matches exactly.

const SELCOM_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_SELCOM_ENABLED === 'true'
const MPESA_LIPA_NAMBA = '350298654'
const MPESA_LIPA_NAME = 'OPUSFESTA COMPANY LIMITED'
const MPESA_LIPA_POSTER_SRC = '/assets/payment/opusfesta-mpesa-lipa-poster.png'

const PHONE_RE = /^\+?(?:[\d](?:[\s().-]?)){9,}$/
const PAYREF_RE = /^[A-Za-z0-9.\-]{6,25}$/

function fmt(t: string, v: Record<string, string | number>): string {
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m))
}

function formatTzs(n: number): string {
  return `TZS ${n.toLocaleString('en-US')}`
}

type PayPhase = 'idle' | 'awaiting' | 'redirecting'

export interface TemplatePurchaseTarget {
  templateId: string
  templateName: string
  templateImageUrl: string
  templateType: TemplateCardType
}

export default function TemplatePurchaseModal({
  target,
  price,
  eventId,
  contact,
  returnPath,
  formStrings,
  paymentStrings,
  onClose,
  onPurchaseSubmitted,
}: {
  target: TemplatePurchaseTarget
  price: number
  eventId: string | null
  contact: { name: string; email: string; phone: string | null }
  /** Where to bounce back to after a card redirect — the server appends
   *  `purchase_ref` to it. Should be the current dashboard page. */
  returnPath: string
  formStrings: CheckoutFormStrings
  paymentStrings: CheckoutPaymentStrings
  onClose: () => void
  /** Called once the payment resolves (paid, or submitted for manual review). */
  onPurchaseSubmitted: (result: { status: 'paid' | 'processing' | 'failed'; order?: StoredOrder }) => void
}) {
  const [method, setMethod] = useState<'mpesa' | 'card'>('mpesa')
  const [mpesaMode, setMpesaMode] = useState<'push' | 'lipa'>(SELCOM_ENABLED ? 'push' : 'lipa')
  const [mobilePhone, setMobilePhone] = useState(contact.phone ?? '')
  const [payerName, setPayerName] = useState('')
  const [payRef, setPayRef] = useState('')
  const [errors, setErrors] = useState<Partial<Record<'phone' | 'payerName' | 'payRef', string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [payPhase, setPayPhase] = useState<PayPhase>('idle')
  const [payError, setPayError] = useState<string | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current) }, [])

  // Lock background scroll while open — without this, mobile/WebView touch
  // scroll can go to the page behind the dialog instead of this panel's own
  // overflow-y-auto, making the form below the fold unreachable. Mirrors the
  // same lock in ConfirmDialog (components/dashboard/controls.tsx).
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const isCard = method === 'card'
  const usePush = method === 'mpesa' && mpesaMode === 'push'
  const useLipa = method === 'mpesa' && mpesaMode === 'lipa'

  const clearError = (key: keyof typeof errors) =>
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

  const paymentLabel = (): string => {
    if (isCard) return 'Card (Visa / Mastercard)'
    if (useLipa) return `M-Pesa Lipa Namba ${MPESA_LIPA_NAMBA} · ${payerName.trim()} · ${mobilePhone.trim()} · Ref ${payRef.trim().toUpperCase()}`
    return `M-Pesa ${mobilePhone.trim()}`
  }

  const paymentDetails = (): StoredOrderPayment => {
    if (isCard) return { provider: 'Card' }
    if (useLipa) {
      return {
        provider: 'M-Pesa',
        businessNumber: MPESA_LIPA_NAMBA,
        payerPhone: mobilePhone.trim(),
        payerName: payerName.trim(),
        reference: payRef.trim().toUpperCase(),
      }
    }
    return { provider: 'M-Pesa', payerPhone: mobilePhone.trim() }
  }

  // Local snapshot for the dashboard's Orders list, same pattern as the
  // invitation checkout (CheckoutClient.tsx's buildLocalOrder) — the
  // authoritative paid/failed state always comes from the server (fetched by
  // ref); this is a placeholder shown while that resolves.
  const buildLocalOrder = (ref: string, paymentStatus: 'verifying' | 'paid'): StoredOrder => ({
    ref,
    paidAt: new Date().toISOString(),
    eventId,
    paymentLabel: paymentLabel(),
    payment: paymentDetails(),
    paymentRef: useLipa ? payRef.trim().toUpperCase() : undefined,
    paymentStatus,
    contact: { name: contact.name, email: contact.email, phone: (isCard ? contact.phone : mobilePhone) ?? '' },
    items: [
      {
        id: templateCardItemId(target.templateType, target.templateId),
        name: target.templateName,
        summary: target.templateType === 'thank_you_card' ? 'Thank You card design' : 'Pledge card design',
        total: price,
        image: target.templateImageUrl,
      },
    ],
    subtotal: price,
    discount: 0,
    total: price,
  })

  const validate = () => {
    const e: typeof errors = {}
    if (!isCard) {
      if (!PHONE_RE.test(mobilePhone.trim())) e.phone = formStrings.error_phone
      if (useLipa && payerName.trim().length < 3) e.payerName = formStrings.error_payer_name
      if (useLipa && !PAYREF_RE.test(payRef.trim())) e.payRef = formStrings.error_payref
    }
    return e
  }

  const pollUntilResolved = (ref: string) => {
    const startedAt = Date.now()
    const TIMEOUT_MS = 120_000
    const tick = async () => {
      try {
        const res = await fetch(`/api/payments/status?ref=${encodeURIComponent(ref)}`, { cache: 'no-store' })
        if (res.status === 404) {
          setPayPhase('idle')
          setSubmitting(false)
          setPayError('We could not find your order. Please try again.')
          return
        }
        const data = (await res.json()) as StatusResponse
        if (data.status === 'paid') {
          // Promote the local snapshot to paid so the dashboard's Orders list
          // reads 'paid' immediately, before the server re-confirms.
          const stored = getLastOrder()
          const paidOrder: StoredOrder =
            stored && stored.ref === ref ? { ...stored, paymentStatus: 'paid' } : buildLocalOrder(ref, 'paid')
          setLastOrder(paidOrder)
          toast.success(`${target.templateName} unlocked`)
          onPurchaseSubmitted({ status: 'paid', order: paidOrder })
          return
        }
        if (data.status === 'failed' || data.status === 'expired') {
          setPayPhase('idle')
          setSubmitting(false)
          setPayError('The payment was declined or cancelled. Please try again.')
          return
        }
      } catch {
        /* transient network blip — keep polling */
      }
      if (Date.now() - startedAt > TIMEOUT_MS) {
        setPayPhase('idle')
        setSubmitting(false)
        setPayError("We didn't get a confirmation in time. If you approved the prompt, it will unlock shortly — otherwise please try again.")
        return
      }
      pollTimer.current = setTimeout(tick, 3000)
    }
    pollTimer.current = setTimeout(tick, 3000)
  }

  const handlePay = async () => {
    setPayError(null)
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length > 0) return

    // Card mode has no phone field of its own (it reuses the couple's saved
    // contact.phone) — without this guard, a couple with no phone on file
    // would silently send an empty phone to /api/payments/initiate, which
    // rejects the whole request with a generic "required" error they have
    // no way to fix from this screen.
    if (isCard && !contact.phone) {
      setPayError('Add a phone number to your account before paying by card — or pay with M-Pesa instead.')
      return
    }

    const item = {
      id: templateCardItemId(target.templateType, target.templateId),
      name: target.templateName,
      image: target.templateImageUrl,
      total: price,
      kind: 'template_unlock' as const,
    }

    if (useLipa) {
      setSubmitting(true)
      try {
        const payload: InitiateRequest = {
          method: 'lipa_namba',
          phone: mobilePhone.trim(),
          payerName: payerName.trim(),
          paymentReference: payRef.trim().toUpperCase(),
          contact: { name: contact.name, email: contact.email, phone: mobilePhone.trim() },
          items: [item],
          paymentLabel: paymentLabel(),
          eventId: eventId ?? undefined,
        }
        const res = await fetch('/api/payments/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = (await res.json()) as InitiateResponse
        if (!res.ok || !data.ref) {
          setPayError(data.message ?? 'Payment could not be submitted. Please try again.')
          return
        }
        const localOrder = buildLocalOrder(data.ref, 'verifying')
        setLastOrder(localOrder)
        toast.success('Payment submitted for review')
        onPurchaseSubmitted({ status: 'processing', order: localOrder })
      } finally {
        setSubmitting(false)
      }
      return
    }

    setSubmitting(true)
    setPayPhase(isCard ? 'redirecting' : 'awaiting')
    try {
      const payload: InitiateRequest = {
        method: isCard ? 'card' : 'mobile',
        phone: isCard ? undefined : mobilePhone.trim(),
        contact: { name: contact.name, email: contact.email, phone: isCard ? (contact.phone ?? '') : mobilePhone.trim() },
        items: [item],
        paymentLabel: paymentLabel(),
        eventId: eventId ?? undefined,
        redirectPath: returnPath,
        cancelPath: returnPath,
      }
      const res = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as InitiateResponse
      if (!res.ok || data.status === 'failed' || !data.ref) {
        setPayPhase('idle')
        setSubmitting(false)
        setPayError(data.message ?? 'Payment could not be started. Please try again.')
        return
      }

      // Keep a local copy so the dashboard's Orders list can render it
      // immediately, before the card-redirect return trip or push-poll
      // confirms the real paid state.
      setLastOrder(buildLocalOrder(data.ref, 'verifying'))

      if (isCard) {
        if (!data.redirectUrl) {
          setPayPhase('idle')
          setSubmitting(false)
          setPayError('Card payment is unavailable right now. Please try M-Pesa.')
          return
        }
        window.location.href = data.redirectUrl
        return
      }

      pollUntilResolved(data.ref)
    } catch {
      setPayPhase('idle')
      setSubmitting(false)
      setPayError('Something went wrong starting the payment. Please try again.')
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div
        data-lenis-prevent
        className="max-h-[92vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-white shadow-2xl [-webkit-overflow-scrolling:touch] [touch-action:pan-y] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/[0.08] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded-md bg-black/[0.04]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={target.templateImageUrl} alt="" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1A1A1A]">{target.templateName}</p>
              <p className="text-xs text-[#1A1A1A]/55">Purchase — {formatTzs(price)}</p>
            </div>
          </div>
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            disabled={payPhase !== 'idle'}
            className="shrink-0 rounded-full p-1.5 text-[#1A1A1A]/50 transition hover:bg-black/[0.04] hover:text-[#1A1A1A] disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="space-y-2.5">
            <div role="radiogroup" className="grid grid-cols-2 gap-2">
              <label
                className={cn(
                  'flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition',
                  method === 'mpesa' ? 'border-[#1A1A1A] bg-black/[0.02]' : 'border-black/[0.12] text-[#1A1A1A]/60 hover:border-black/20',
                )}
              >
                <input type="radio" name="pay-method" className="sr-only" checked={method === 'mpesa'} onChange={() => setMethod('mpesa')} />
                M-Pesa
              </label>
              {SELCOM_ENABLED ? (
                <label
                  className={cn(
                    'flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition',
                    method === 'card' ? 'border-[#1A1A1A] bg-black/[0.02]' : 'border-black/[0.12] text-[#1A1A1A]/60 hover:border-black/20',
                  )}
                >
                  <input type="radio" name="pay-method" className="sr-only" checked={method === 'card'} onChange={() => setMethod('card')} />
                  Card
                </label>
              ) : null}
            </div>
          </div>

          {isCard ? (
            <div className="flex items-start gap-3 rounded-xl border border-black/[0.1] bg-black/[0.015] p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-[#1A1A1A] ring-1 ring-black/[0.08]">
                <Lock className="h-4 w-4" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#1A1A1A]">{paymentStrings.card_title}</p>
                <p className="text-xs leading-relaxed text-[#1A1A1A]/60">{paymentStrings.card_body}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {SELCOM_ENABLED ? (
                <div className="inline-flex rounded-full border border-black/[0.1] bg-black/[0.02] p-1">
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => { setMpesaMode('push'); setPayError(null) }}
                    className={cn('rounded-full px-3.5 py-1.5 text-xs font-semibold transition', mpesaMode === 'push' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-[#1A1A1A]/55')}
                  >
                    {paymentStrings.toggle_push}
                  </button>
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => { setMpesaMode('lipa'); setPayError(null) }}
                    className={cn('rounded-full px-3.5 py-1.5 text-xs font-semibold transition', mpesaMode === 'lipa' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-[#1A1A1A]/55')}
                  >
                    {paymentStrings.toggle_lipa}
                  </button>
                </div>
              ) : null}

              {usePush ? (
                <div className="flex items-start gap-3 rounded-xl border border-black/[0.1] bg-black/[0.015] p-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-[#1A1A1A] ring-1 ring-black/[0.08]">
                    <Smartphone className="h-4 w-4" />
                  </span>
                  <p className="text-xs leading-relaxed text-[#1A1A1A]/60">
                    {fmt(paymentStrings.push_instructions, { pay: paymentStrings.push_pay_word })}
                  </p>
                </div>
              ) : null}

              {useLipa ? (
                <div className="overflow-hidden rounded-2xl border border-black/[0.1]">
                  <div className="flex justify-center bg-white p-3">
                    <Image
                      src={MPESA_LIPA_POSTER_SRC}
                      alt={`M-Pesa Lipa Namba poster for ${MPESA_LIPA_NAME}`}
                      width={1749}
                      height={2481}
                      quality={100}
                      sizes="360px"
                      className="h-auto max-h-[320px] w-auto max-w-full object-contain"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-black/[0.08] bg-black/[0.02] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1A1A1A]/55">
                      {paymentStrings.lipa_amount_label}
                    </p>
                    <span className="text-lg font-bold tabular-nums text-[#1A1A1A]">{formatTzs(price)}</span>
                  </div>
                </div>
              ) : null}

              {useLipa ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#1A1A1A]">
                    {formStrings.payer_name_label} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={payerName}
                    onChange={(e) => { setPayerName(e.target.value); clearError('payerName') }}
                    placeholder={formStrings.payer_name_placeholder}
                    className="w-full rounded-lg border border-black/[0.14] px-3 py-2 text-sm outline-none focus:border-[#1A1A1A]"
                  />
                  {errors.payerName ? <p className="mt-1 text-xs text-red-600">{errors.payerName}</p> : null}
                </div>
              ) : null}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1A1A1A]">
                  {useLipa ? formStrings.phone_label_lipa : fmt(formStrings.phone_label_push, { provider: 'M-Pesa' })}{' '}
                  <span className="text-red-600">*</span>
                </label>
                <input
                  type="tel"
                  value={mobilePhone}
                  onChange={(e) => { setMobilePhone(e.target.value); clearError('phone') }}
                  placeholder={formStrings.phone_placeholder}
                  className="w-full rounded-lg border border-black/[0.14] px-3 py-2 text-sm outline-none focus:border-[#1A1A1A]"
                />
                {errors.phone ? <p className="mt-1 text-xs text-red-600">{errors.phone}</p> : null}
              </div>

              {useLipa ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#1A1A1A]">
                    {formStrings.payref_label} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => { setPayRef(e.target.value); clearError('payRef') }}
                    placeholder={formStrings.payref_placeholder}
                    className="w-full rounded-lg border border-black/[0.14] px-3 py-2 text-sm uppercase outline-none placeholder:normal-case focus:border-[#1A1A1A]"
                  />
                  {errors.payRef ? <p className="mt-1 text-xs text-red-600">{errors.payRef}</p> : null}
                  <p className="mt-1.5 text-xs text-[#1A1A1A]/45">{formStrings.payref_hint}</p>
                </div>
              ) : null}
            </div>
          )}

          {payError ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{payError}</span>
            </div>
          ) : null}

          <button data-opus-button="primary" data-opus-button-size="large"
            type="button"
            onClick={handlePay}
            disabled={submitting || payPhase !== 'idle'}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#1A1A1A] px-6 py-3 text-sm font-bold text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting
              ? payPhase === 'redirecting' ? paymentStrings.pay_redirecting : payPhase === 'awaiting' ? paymentStrings.pay_awaiting : paymentStrings.pay_processing
              : isCard ? `Pay ${formatTzs(price)}` : useLipa ? `I've paid ${formatTzs(price)}` : `Pay ${formatTzs(price)}`}
          </button>

          <p className="inline-flex items-center gap-1.5 text-xs text-[#1A1A1A]/45">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            {useLipa ? paymentStrings.reassure_lipa : isCard ? paymentStrings.reassure_card : paymentStrings.reassure_push}
          </p>
        </div>
      </div>

      {payPhase === 'awaiting' ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-7 text-center shadow-2xl">
            <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[#9FE870]/25 text-[#1A1A1A]">
              <Smartphone className="h-6 w-6" />
            </span>
            <h2 className="text-lg font-semibold text-[#1A1A1A]">{paymentStrings.overlay_title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[#1A1A1A]/60">
              {fmt(paymentStrings.overlay_body, { phone: mobilePhone.trim(), amount: formatTzs(price) })}
            </p>
            <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[#1A1A1A]/50">
              <Loader2 className="h-4 w-4 animate-spin" />
              {paymentStrings.overlay_waiting}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
