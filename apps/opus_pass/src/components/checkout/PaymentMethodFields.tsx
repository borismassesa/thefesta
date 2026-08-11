'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Smartphone, ShieldCheck, AlertCircle, Copy, Check, Loader2, Lock } from 'lucide-react'
import type { InitiateRequest, InitiateResponse, StatusResponse } from '@/lib/payments/types'
import { useT } from '@/components/providers/UIStringsProvider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// Shared payment section — the method picker, M-Pesa Lipa Namba instructions,
// automated push/card flows, and the waiting overlay — reused by the invitation
// checkout (CheckoutClient) and the registry shop checkout (ShopCheckoutClient).
// It owns everything payment: method state, field validation, the initiate POST,
// status polling and the card redirect. The parent supplies the non-payment
// order data via buildRequest() and reacts to the outcome via onResult().

type Logo = { src: string; w: number; h: number; cls: string }
type PaymentMethod = { id: string; kind: 'mobile' | 'card'; provider: string; descKey: string; logos: Logo[] }

const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'mpesa',
    kind: 'mobile',
    provider: 'M-Pesa',
    descKey: 'method_mpesa_desc',
    logos: [{ src: '/assets/payment-logos/m-pesa-logo.png', w: 600, h: 400, cls: 'h-6 w-auto' }],
  },
  {
    id: 'card',
    kind: 'card',
    provider: 'Card',
    descKey: 'method_card_desc',
    logos: [
      { src: '/assets/payment-logos/visa.svg', w: 1000, h: 325, cls: 'h-4 w-auto' },
      { src: '/assets/payment-logos/mastercard.svg', w: 1000, h: 618, cls: 'h-6 w-auto' },
    ],
  },
]

const SELCOM_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_SELCOM_ENABLED === 'true'
export const MPESA_LIPA_NAMBA = '350298654'
const MPESA_LIPA_NAME = 'OPUSFESTA COMPANY LIMITED'
const MPESA_LIPA_POSTER_SRC = '/assets/payment/opusfesta-mpesa-lipa-poster.png'

type LipaStepKeys = { do: string; detail: string }
type LipaNetwork = { id: string; name?: string; nameKey?: string; dial?: string; dialKey?: string; steps: LipaStepKeys[] }

const LIPA_NETWORKS: LipaNetwork[] = [
  {
    id: 'vodacom',
    name: 'Vodacom M-Pesa',
    dial: '*150*00#',
    steps: [
      { do: 'step_vodacom_1_do', detail: 'step_vodacom_1_detail' },
      { do: 'step_vodacom_2_do', detail: 'step_vodacom_2_detail' },
      { do: 'step_vodacom_3_do', detail: 'step_vodacom_3_detail' },
      { do: 'step_vodacom_4_do', detail: 'step_vodacom_4_detail' },
      { do: 'step_vodacom_5_do', detail: 'step_vodacom_5_detail' },
    ],
  },
  {
    id: 'tigo',
    name: 'Tigo Pesa (Mixx by Yas)',
    dial: '*150*01#',
    steps: [
      { do: 'step_tigo_1_do', detail: 'step_tigo_1_detail' },
      { do: 'step_tigo_2_do', detail: 'step_tigo_2_detail' },
      { do: 'step_tigo_3_do', detail: 'step_tigo_3_detail' },
      { do: 'step_tigo_4_do', detail: 'step_tigo_4_detail' },
      { do: 'step_tigo_5_do', detail: 'step_tigo_5_detail' },
      { do: 'step_tigo_6_do', detail: 'step_tigo_6_detail' },
    ],
  },
  {
    id: 'airtel',
    name: 'Airtel Money',
    dial: '*150*60#',
    steps: [
      { do: 'step_airtel_1_do', detail: 'step_airtel_1_detail' },
      { do: 'step_airtel_2_do', detail: 'step_airtel_2_detail' },
      { do: 'step_airtel_3_do', detail: 'step_airtel_3_detail' },
      { do: 'step_airtel_4_do', detail: 'step_airtel_4_detail' },
      { do: 'step_airtel_5_do', detail: 'step_airtel_5_detail' },
      { do: 'step_airtel_6_do', detail: 'step_airtel_6_detail' },
    ],
  },
  {
    id: 'other',
    nameKey: 'network_other_name',
    dialKey: 'network_other_dial',
    steps: [
      { do: 'step_other_1_do', detail: 'step_other_1_detail' },
      { do: 'step_other_2_do', detail: 'step_other_2_detail' },
      { do: 'step_other_3_do', detail: 'step_other_3_detail' },
      { do: 'step_other_4_do', detail: 'step_other_4_detail' },
      { do: 'step_other_5_do', detail: 'step_other_5_detail' },
      { do: 'step_other_6_do', detail: 'step_other_6_detail' },
    ],
  },
]

const PHONE_RE = /^\+?(?:[\d](?:[\s().-]?)){9,}$/
const PAYREF_RE = /^[A-Za-z0-9.\-]{6,25}$/

function formatTzs(n: number): string {
  return `TZS ${n.toLocaleString('en-US')}`
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-xs text-red-600 inline-flex items-center gap-1">
      <AlertCircle size={12} />
      {children}
    </p>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button data-opus-button="neutral" data-opus-button-size="medium"
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition hover:border-gray-300 hover:text-gray-900"
    >
      {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
    </button>
  )
}

/** The payment portion of an order — everything except contact/items/delivery,
 *  which the parent supplies in buildRequest(). */
export type PaymentDraft = {
  method: 'lipa_namba' | 'mobile' | 'card'
  phone?: string
  payerName?: string
  paymentReference?: string
  paymentLabel: string
}

type FieldErrors = Partial<Record<'mobilePhone' | 'payerName' | 'payRef', string>>

export default function PaymentMethodFields({
  amount,
  buildRequest,
  onResult,
}: {
  amount: number
  /** Merge the payment draft with the parent's contact/items/delivery/etc. into
   *  a full InitiateRequest — or return { error } to block the pay (e.g. cart
   *  empty, address missing). */
  buildRequest: (draft: PaymentDraft) => InitiateRequest | { error: string }
  /** Fired after a successful submit: 'processing' (Lipa Namba / awaiting) or
   *  'paid' (push confirmed). Card redirects away and never calls this. */
  onResult: (result: { status: 'processing' | 'paid'; ref: string; draft: PaymentDraft }) => void
}) {
  const tf = useT('checkout-form')
  const tp = useT('checkout-payment')

  const [selected, setSelected] = useState<string>('mpesa')
  const [mpesaMode, setMpesaMode] = useState<'push' | 'lipa'>(SELCOM_ENABLED ? 'push' : 'lipa')
  const [lipaNetwork, setLipaNetwork] = useState<string>('vodacom')
  const [payPhase, setPayPhase] = useState<'idle' | 'awaiting' | 'redirecting'>('idle')
  const [payError, setPayError] = useState<string | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current) }, [])

  const [mobilePhone, setMobilePhone] = useState('')
  const [payerName, setPayerName] = useState('')
  const [payRef, setPayRef] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)

  const visibleMethods = SELCOM_ENABLED ? PAYMENT_METHODS : PAYMENT_METHODS.filter((m) => m.id !== 'card')
  const method = PAYMENT_METHODS.find((m) => m.id === selected) ?? PAYMENT_METHODS[0]
  const isCard = method.kind === 'card'
  const isMpesa = method.id === 'mpesa'
  const usePush = isMpesa && mpesaMode === 'push'
  const useLipa = isMpesa && mpesaMode === 'lipa'
  const total = amount

  const clearError = (key: keyof FieldErrors) =>
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

  function paymentLabel(): string {
    if (isCard) return 'Card (Visa / Mastercard)'
    if (useLipa) return `M-Pesa Lipa Namba ${MPESA_LIPA_NAMBA} · ${payerName.trim()} · ${mobilePhone.trim()} · Ref ${payRef.trim().toUpperCase()}`
    return `${method.provider} ${mobilePhone.trim()}`
  }

  function buildDraft(): PaymentDraft {
    return {
      method: isCard ? 'card' : useLipa ? 'lipa_namba' : 'mobile',
      phone: isCard ? undefined : mobilePhone.trim(),
      payerName: useLipa ? payerName.trim() : undefined,
      paymentReference: useLipa ? payRef.trim().toUpperCase() : undefined,
      paymentLabel: paymentLabel(),
    }
  }

  function validateFields(): FieldErrors {
    const e: FieldErrors = {}
    if (!isCard) {
      if (!PHONE_RE.test(mobilePhone.trim())) e.mobilePhone = tf('error_phone')
      if (useLipa && payerName.trim().length < 3) e.payerName = tf('error_payer_name')
      if (useLipa && !PAYREF_RE.test(payRef.trim())) e.payRef = tf('error_payref')
    }
    return e
  }

  function pollUntilResolved(ref: string, draft: PaymentDraft) {
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
          onResult({ status: 'paid', ref, draft })
          return
        }
        if (data.status === 'failed' || data.status === 'expired') {
          setPayPhase('idle')
          setSubmitting(false)
          setPayError('The payment was declined or cancelled. Please try again.')
          return
        }
      } catch {
        /* transient — keep polling */
      }
      if (Date.now() - startedAt > TIMEOUT_MS) {
        setPayPhase('idle')
        setSubmitting(false)
        setPayError("We didn't get a confirmation in time. If you approved the prompt, your order will appear shortly — otherwise please try again.")
        return
      }
      pollTimer.current = setTimeout(tick, 3000)
    }
    pollTimer.current = setTimeout(tick, 3000)
  }

  async function handlePay() {
    setPayError(null)
    const fe = validateFields()
    setErrors(fe)
    if (Object.keys(fe).length > 0) return

    const draft = buildDraft()
    const req = buildRequest(draft)
    if ('error' in req) {
      setPayError(req.error)
      return
    }

    if (useLipa) {
      setSubmitting(true)
      try {
        const res = await fetch('/api/payments/initiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) })
        const data = (await res.json()) as InitiateResponse
        if (!res.ok || !data.ref) {
          setPayError(data.message ?? 'Payment could not be submitted. Please try again.')
          return
        }
        onResult({ status: 'processing', ref: data.ref, draft })
      } finally {
        setSubmitting(false)
      }
      return
    }

    setSubmitting(true)
    setPayPhase(isCard ? 'redirecting' : 'awaiting')
    try {
      const res = await fetch('/api/payments/initiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) })
      const data = (await res.json()) as InitiateResponse
      if (!res.ok || data.status === 'failed' || !data.ref) {
        setPayPhase('idle')
        setSubmitting(false)
        setPayError(data.message ?? 'Payment could not be started. Please try again.')
        return
      }
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
      pollUntilResolved(data.ref, draft)
    } catch {
      setPayPhase('idle')
      setSubmitting(false)
      setPayError('Something went wrong starting the payment. Please try again.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Payment method picker */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">{tp('choose_title')}</h2>
        <div role="radiogroup" aria-label={tp('method_aria')} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleMethods.map((m) => {
            const checked = selected === m.id
            return (
              <label
                key={m.id}
                className={cn('flex cursor-pointer flex-col gap-3 rounded-md border p-4 transition', checked ? 'border-[#1A1A1A] bg-white' : 'border-gray-200 bg-white hover:border-gray-300')}
              >
                <div className="flex items-start gap-3">
                  <input type="radio" name="payment-method" value={m.id} checked={checked} onChange={() => setSelected(m.id)} aria-describedby={`pm-${m.id}-desc`} className="peer sr-only" />
                  <span aria-hidden className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition peer-focus-visible:ring-2 peer-focus-visible:ring-[#1A1A1A]/25', checked ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white' : 'border-gray-300 bg-white text-transparent')}>
                    <Check size={13} strokeWidth={3} />
                  </span>
                  <div className="grow">
                    <p className="text-[14px] font-bold text-gray-900">{m.provider}</p>
                    <p id={`pm-${m.id}-desc`} className="mt-1 text-[12px] leading-relaxed text-gray-600">{tp(m.descKey)}</p>
                  </div>
                </div>
                <div className="ml-8 flex items-center gap-2">
                  {m.logos.map((logo) => (
                    <span key={logo.src} className="inline-flex h-7 items-center justify-center rounded-md border border-gray-200 bg-white px-1.5">
                      <Image src={logo.src} alt="" width={logo.w} height={logo.h} className={logo.cls} />
                    </span>
                  ))}
                </div>
              </label>
            )
          })}
        </div>
      </div>

      {/* Method-specific details */}
      {isCard ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-gray-900 ring-1 ring-gray-200"><Lock size={16} /></span>
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-gray-900">{tp('card_title')}</p>
              <p className="text-xs leading-relaxed text-gray-600">{tp('card_body')}</p>
              <div className="flex items-center gap-2 pt-1">
                <Image src="/assets/payment-logos/visa.svg" alt="Visa" width={1000} height={325} className="h-4 w-auto" />
                <Image src="/assets/payment-logos/mastercard.svg" alt="Mastercard" width={1000} height={618} className="h-6 w-auto" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {SELCOM_ENABLED && (
            <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1">
              <button data-opus-button="control" type="button" onClick={() => { setMpesaMode('push'); setPayError(null) }} aria-pressed={mpesaMode === 'push'} className={cn('rounded-full px-4 py-1.5 text-sm font-semibold transition-colors', mpesaMode === 'push' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900')}>
                {tp('toggle_push')}
              </button>
              <button data-opus-button="control" type="button" onClick={() => { setMpesaMode('lipa'); setPayError(null) }} aria-pressed={mpesaMode === 'lipa'} className={cn('rounded-full px-4 py-1.5 text-sm font-semibold transition-colors', mpesaMode === 'lipa' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900')}>
                {tp('toggle_lipa')}
              </button>
            </div>
          )}

          {usePush && (
            <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-gray-900 ring-1 ring-gray-200"><Smartphone size={16} /></span>
              <p className="text-xs leading-relaxed text-gray-600">{tp('push_instructions', { pay: tp('push_pay_word') })}</p>
            </div>
          )}

          {useLipa && (
            <div className="overflow-hidden rounded-2xl border border-gray-200">
              <div className="flex justify-center bg-white p-3 sm:p-4">
                <Image src={MPESA_LIPA_POSTER_SRC} alt={`M-Pesa Lipa Namba poster for ${MPESA_LIPA_NAME}`} width={1749} height={2481} quality={100} sizes="(min-width: 1024px) 360px, (min-width: 640px) 420px, 82vw" className="h-auto max-h-[420px] w-auto max-w-full object-contain sm:max-h-[500px] lg:max-h-[560px]" />
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">{tp('lipa_amount_label')}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-gray-900 tabular-nums">{formatTzs(total)}</span>
                  <CopyButton value={String(total)} label="amount" />
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm font-semibold text-gray-900">{tp('lipa_how_title')}</p>
                <p className="mt-0.5 text-xs text-gray-500">{tp('lipa_how_subtitle')}</p>
                <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label={tp('lipa_network_aria')}>
                  {LIPA_NETWORKS.map((n) => {
                    const active = lipaNetwork === n.id
                    return (
                      <button data-opus-button="control" key={n.id} type="button" role="tab" aria-selected={active} onClick={() => setLipaNetwork(n.id)} className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', active ? 'border-[#E60000] bg-[#E60000] text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900')}>
                        {n.name ?? tp(n.nameKey!)}
                      </button>
                    )
                  })}
                </div>
                {LIPA_NETWORKS.filter((n) => n.id === lipaNetwork).map((n) => {
                  const dial = n.dial ?? tp(n.dialKey!)
                  return (
                    <div key={n.id} className="mt-4">
                      <p className="text-xs font-semibold text-gray-700">
                        {n.id === 'other' ? (
                          <>{tp('lipa_dial_prefix_other')} <span className="font-bold">{dial}</span></>
                        ) : (
                          <>{tp('lipa_dial_prefix_dial')} <span className="rounded-md bg-gray-900 px-2 py-0.5 font-mono text-[13px] font-bold text-white">{dial}</span></>
                        )}
                      </p>
                      <ol className="mt-3 space-y-2.5">
                        {n.steps.map((step, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#E60000] text-[11px] font-bold text-white tabular-nums">{i + 1}</span>
                            <p className="text-xs leading-relaxed text-gray-700">
                              <span className="font-bold text-gray-900">{tp(step.do)}</span>
                              {' — '}
                              {tp(step.detail)}
                            </p>
                          </li>
                        ))}
                      </ol>
                      {n.id === 'vodacom' && (
                        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">{tp('lipa_qr_note')}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {useLipa && (
            <div>
              <Label htmlFor="payer-name" className="mb-1.5 text-gray-900">{tf('payer_name_label')} <span className="text-red-600">*</span></Label>
              <Input id="payer-name" type="text" value={payerName} onChange={(e) => { setPayerName(e.target.value); clearError('payerName') }} placeholder={tf('payer_name_placeholder')} autoComplete="name" aria-invalid={Boolean(errors.payerName)} />
              {errors.payerName && <FieldError>{errors.payerName}</FieldError>}
              <p className="mt-1.5 text-xs text-gray-500">{tf('payer_name_hint')}</p>
            </div>
          )}

          <div>
            <Label htmlFor="mobile-phone" className="mb-1.5 text-gray-900">{useLipa ? tf('phone_label_lipa') : tf('phone_label_push', { provider: method.provider })} <span className="text-red-600">*</span></Label>
            <Input id="mobile-phone" type="tel" value={mobilePhone} onChange={(e) => { setMobilePhone(e.target.value); clearError('mobilePhone') }} placeholder={tf('phone_placeholder')} inputMode="tel" aria-invalid={Boolean(errors.mobilePhone)} />
            {errors.mobilePhone && <FieldError>{errors.mobilePhone}</FieldError>}
            {!useLipa && <p className="mt-1.5 text-xs text-gray-500">{tf('phone_hint_push')}</p>}
          </div>

          {useLipa && (
            <div>
              <Label htmlFor="pay-ref" className="mb-1.5 text-gray-900">{tf('payref_label')} <span className="text-red-600">*</span></Label>
              <Input id="pay-ref" type="text" value={payRef} onChange={(e) => { setPayRef(e.target.value); clearError('payRef') }} placeholder={tf('payref_placeholder')} autoCapitalize="characters" autoComplete="off" spellCheck={false} className="uppercase placeholder:normal-case" aria-invalid={Boolean(errors.payRef)} />
              {errors.payRef && <FieldError>{errors.payRef}</FieldError>}
              <p className="mt-1.5 text-xs text-gray-500">{tf('payref_hint')}</p>
            </div>
          )}
        </div>
      )}

      {payError && (
        <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{payError}</span>
        </div>
      )}

      <button data-opus-button="primary" data-opus-button-size="large"
        type="button"
        onClick={handlePay}
        disabled={submitting || payPhase !== 'idle'}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-(--accent) px-6 py-3.5 text-[13px] font-extrabold uppercase tracking-[0.06em] text-(--on-accent) transition hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
      >
        {submitting && <Loader2 size={15} className="animate-spin" />}
        {submitting
          ? payPhase === 'redirecting' ? tp('pay_redirecting') : payPhase === 'awaiting' ? tp('pay_awaiting') : tp('pay_processing')
          : isCard ? tp('pay_card_cta') : useLipa ? tp('pay_lipa_cta', { amount: formatTzs(total) }) : tp('pay_push_cta', { amount: formatTzs(total) })}
      </button>

      <p className="text-xs text-gray-500 inline-flex items-center gap-1.5">
        <ShieldCheck size={13} className="text-emerald-600" />
        {useLipa ? tp('reassure_lipa') : isCard ? tp('reassure_card') : tp('reassure_push')}
      </p>

      {payPhase === 'awaiting' && (
        <div role="dialog" aria-modal="true" aria-label={tp('overlay_aria')} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-7 text-center shadow-2xl">
            <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-(--accent)/15 text-gray-900"><Smartphone size={26} /></span>
            <h2 className="text-lg font-semibold text-gray-900">{tp('overlay_title')}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{tp('overlay_body', { phone: mobilePhone.trim(), amount: formatTzs(total) })}</p>
            <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-gray-500"><Loader2 size={16} className="animate-spin" />{tp('overlay_waiting')}</div>
            <p className="mt-4 text-xs text-gray-400">{tp('overlay_keep_open')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
