'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { AlertCircle, Check, Loader2, Lock, Smartphone, X } from 'lucide-react'
import type { InitiateRequest, InitiateResponse, StatusResponse } from '@/lib/payments/types'
import { cn } from '@/lib/utils'

// Guest-facing single-gift checkout for the public registry. Same payment
// machinery as the invitation/template checkouts (/api/payments/{initiate,
// status}) — Lipa Namba live day one, M-Pesa push + Card gated behind the
// Selcom flag — but priced from the product (server re-prices) and carrying
// the registry slug + delivery so the purchase reserves and fulfils the gift.
// Bilingual (EN/SW) to match the public registry page.

const SELCOM_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_SELCOM_ENABLED === 'true'
const MPESA_LIPA_NAMBA = '350298654'
const MPESA_LIPA_NAME = 'OPUSFESTA COMPANY LIMITED'
const MPESA_LIPA_POSTER_SRC = '/assets/payment/opusfesta-mpesa-lipa-poster.png'

const PHONE_RE = /^\+?(?:[\d](?:[\s().-]?)){9,}$/
const PAYREF_RE = /^[A-Za-z0-9.\-]{6,25}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function formatTzs(n: number): string {
  return `TZS ${n.toLocaleString('en-US')}`
}

export type Lang = 'sw' | 'en'

const STR: Record<Lang, Record<string, string>> = {
  en: {
    buy_this: 'Buy this gift',
    your_details: 'Your details',
    name_ph: 'Your name',
    email_ph: 'Email',
    phone_ph: 'Phone (WhatsApp)',
    deliver_to: 'Deliver to the couple',
    address_ph: 'Delivery address',
    city_ph: 'City',
    region_ph: 'Region',
    notes_ph: 'Delivery notes (optional)',
    payment: 'Payment',
    mpesa: 'M-Pesa',
    card: 'Card',
    card_body: "You'll be taken to a secure page to complete your card payment.",
    pay_prompt: 'Pay by prompt',
    lipa: 'Lipa Namba',
    pay_exactly: 'Pay exactly',
    payer_name_ph: 'Name on the account you paid from',
    payref_ph: 'Payment reference (from your SMS)',
    push_body: 'Enter your M-Pesa number — a prompt will pop up on your phone to approve the payment.',
    err_name: 'Enter your name.',
    err_email: 'Enter a valid email.',
    err_phone: 'Enter a valid phone number.',
    err_address: 'Enter a delivery address for the couple.',
    err_payer: 'Enter the name on the account you paid from.',
    err_payref: 'Enter the reference from your payment SMS.',
    err_card: 'Card payment is unavailable right now. Please try M-Pesa.',
    err_start: 'Payment could not be started. Please try again.',
    err_generic: 'Something went wrong starting the payment. Please try again.',
    err_declined: 'The payment was declined or cancelled. Please try again.',
    err_timeout: "We didn't get a confirmation in time. If you approved the prompt, it will confirm shortly.",
    title: 'Buy this gift',
    pay_btn: 'Pay {price}',
    paid_btn: "I've paid {price}",
    reassure: 'The couple sees your gift once payment is confirmed.',
    overlay_title: 'Check your phone',
    overlay_body: 'Approve the {amount} prompt on {phone} to complete your gift.',
    overlay_wait: 'Waiting for confirmation…',
  },
  sw: {
    buy_this: 'Nunua zawadi hii',
    your_details: 'Maelezo yako',
    name_ph: 'Jina lako',
    email_ph: 'Barua pepe',
    phone_ph: 'Simu (WhatsApp)',
    deliver_to: 'Peleka kwa wenye sherehe',
    address_ph: 'Anwani ya kufikisha',
    city_ph: 'Jiji',
    region_ph: 'Mkoa',
    notes_ph: 'Maelezo ya kufikisha (hiari)',
    payment: 'Malipo',
    mpesa: 'M-Pesa',
    card: 'Kadi',
    card_body: 'Utaelekezwa kwenye ukurasa salama kukamilisha malipo ya kadi.',
    pay_prompt: 'Lipa kwa ujumbe',
    lipa: 'Lipa Namba',
    pay_exactly: 'Lipa hasa',
    payer_name_ph: 'Jina la akaunti uliyolipia',
    payref_ph: 'Kumbukumbu ya malipo (kutoka SMS yako)',
    push_body: 'Weka namba yako ya M-Pesa — ujumbe utatokea kwenye simu yako kuthibitisha malipo.',
    err_name: 'Weka jina lako.',
    err_email: 'Weka barua pepe sahihi.',
    err_phone: 'Weka namba sahihi ya simu.',
    err_address: 'Weka anwani ya kufikisha kwa wenye sherehe.',
    err_payer: 'Weka jina la akaunti uliyolipia.',
    err_payref: 'Weka kumbukumbu kutoka SMS ya malipo.',
    err_card: 'Malipo ya kadi hayapatikani sasa. Tafadhali tumia M-Pesa.',
    err_start: 'Malipo hayakuweza kuanzishwa. Tafadhali jaribu tena.',
    err_generic: 'Kuna hitilafu kuanzisha malipo. Tafadhali jaribu tena.',
    err_declined: 'Malipo yamekataliwa au kughairiwa. Tafadhali jaribu tena.',
    err_timeout: 'Hatukupata uthibitisho kwa wakati. Kama uliidhinisha ombi, itathibitishwa hivi karibuni.',
    title: 'Nunua zawadi hii',
    pay_btn: 'Lipa {price}',
    paid_btn: 'Nimelipa {price}',
    reassure: 'Wenye sherehe wataona zawadi yako baada ya malipo kuthibitishwa.',
    overlay_title: 'Angalia simu yako',
    overlay_body: 'Idhinisha ombi la {amount} kwenye {phone} kukamilisha zawadi yako.',
    overlay_wait: 'Inasubiri uthibitisho…',
  },
}

export type BuyTarget = {
  productId: string
  name: string
  image: string
  priceTzs: number
  /** When fulfilling a gift already on the registry, its item id. */
  registryItemId?: string
}

type Phase = 'idle' | 'awaiting' | 'redirecting'

export default function RegistryCheckoutSheet({
  target,
  slug,
  lang,
  onClose,
  onDone,
}: {
  target: BuyTarget
  slug: string
  lang: Lang
  onClose: () => void
  onDone: (result: { status: 'paid' | 'processing' }) => void
}) {
  const s = STR[lang]
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [region, setRegion] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')

  const [method, setMethod] = useState<'mpesa' | 'card'>('mpesa')
  const [mpesaMode, setMpesaMode] = useState<'push' | 'lipa'>(SELCOM_ENABLED ? 'push' : 'lipa')
  const [payerName, setPayerName] = useState('')
  const [payRef, setPayRef] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
  }, [])

  const isCard = method === 'card'
  const useLipa = method === 'mpesa' && mpesaMode === 'lipa'
  const price = target.priceTzs
  const priceLabel = formatTzs(price)

  function validate(): string | null {
    if (name.trim().length < 2) return s.err_name
    if (!EMAIL_RE.test(email.trim())) return s.err_email
    if (!PHONE_RE.test(phone.trim())) return s.err_phone
    if (!address.trim()) return s.err_address
    if (useLipa) {
      if (payerName.trim().length < 3) return s.err_payer
      if (!PAYREF_RE.test(payRef.trim())) return s.err_payref
    }
    return null
  }

  function paymentLabel(): string {
    if (isCard) return 'Card (Visa / Mastercard)'
    if (useLipa) return `M-Pesa Lipa Namba ${MPESA_LIPA_NAMBA} · ${payerName.trim()} · ${phone.trim()} · Ref ${payRef.trim().toUpperCase()}`
    return `M-Pesa ${phone.trim()}`
  }

  function buildPayload(payMethod: 'lipa_namba' | 'mobile' | 'card'): InitiateRequest {
    return {
      method: payMethod,
      phone: payMethod === 'card' ? undefined : phone.trim(),
      payerName: payMethod === 'lipa_namba' ? payerName.trim() : undefined,
      paymentReference: payMethod === 'lipa_namba' ? payRef.trim().toUpperCase() : undefined,
      contact: { name: name.trim(), email: email.trim(), phone: phone.trim() },
      items: [
        {
          id: target.productId,
          name: target.name,
          image: target.image,
          total: price,
          kind: 'product',
          productId: target.productId,
          quantity: 1,
          registryItemId: target.registryItemId,
        },
      ],
      registrySlug: slug,
      delivery: {
        name: name.trim(),
        phone: phone.trim(),
        region: region.trim() || undefined,
        city: city.trim() || undefined,
        address: address.trim(),
        notes: notes.trim() || undefined,
      },
      paymentLabel: paymentLabel(),
      redirectPath: `/gift-registry/${slug}`,
      cancelPath: `/gift-registry/${slug}`,
    }
  }

  function pollUntilResolved(ref: string) {
    const startedAt = Date.now()
    const TIMEOUT_MS = 120_000
    const tick = async () => {
      try {
        const res = await fetch(`/api/payments/status?ref=${encodeURIComponent(ref)}`, { cache: 'no-store' })
        if (res.ok) {
          const data = (await res.json()) as StatusResponse
          if (data.status === 'paid') {
            onDone({ status: 'paid' })
            return
          }
          if (data.status === 'failed' || data.status === 'expired') {
            setPhase('idle')
            setSubmitting(false)
            setError(s.err_declined)
            return
          }
        }
      } catch {
        /* transient — keep polling */
      }
      if (Date.now() - startedAt > TIMEOUT_MS) {
        setPhase('idle')
        setSubmitting(false)
        setError(s.err_timeout)
        return
      }
      pollTimer.current = setTimeout(tick, 3000)
    }
    pollTimer.current = setTimeout(tick, 3000)
  }

  async function handlePay() {
    const v = validate()
    setError(v)
    if (v) return

    const payMethod: 'lipa_namba' | 'mobile' | 'card' = isCard ? 'card' : useLipa ? 'lipa_namba' : 'mobile'
    setSubmitting(true)
    setPhase(isCard ? 'redirecting' : useLipa ? 'idle' : 'awaiting')
    try {
      const res = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(payMethod)),
      })
      const data = (await res.json()) as InitiateResponse
      if (!res.ok || data.status === 'failed' || !data.ref) {
        setPhase('idle')
        setSubmitting(false)
        setError(data.message ?? s.err_start)
        return
      }
      if (payMethod === 'lipa_namba') {
        onDone({ status: 'processing' })
        return
      }
      if (isCard) {
        if (!data.redirectUrl) {
          setPhase('idle')
          setSubmitting(false)
          setError(s.err_card)
          return
        }
        window.location.href = data.redirectUrl
        return
      }
      pollUntilResolved(data.ref)
    } catch {
      setPhase('idle')
      setSubmitting(false)
      setError(s.err_generic)
    }
  }

  const inputCls = 'w-full rounded-lg border border-black/[0.14] px-3 py-2 text-sm outline-none focus:border-[#1A1A1A]'

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div
        data-lenis-prevent
        className="max-h-[92vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/[0.08] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-black/[0.04]">
              {target.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={target.image} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1A1A1A]">{target.name}</p>
              <p className="text-xs text-[#1A1A1A]/55">{s.buy_this} — {priceLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={phase !== 'idle'}
            className="shrink-0 rounded-full p-1.5 text-[#1A1A1A]/50 transition hover:bg-black/[0.04] disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Your details */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#1A1A1A]/45">{s.your_details}</p>
            <input className={inputCls} placeholder={s.name_ph} value={name} onChange={(e) => setName(e.target.value)} />
            <input className={inputCls} type="email" placeholder={s.email_ph} value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className={inputCls} type="tel" placeholder={s.phone_ph} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          {/* Delivery */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#1A1A1A]/45">{s.deliver_to}</p>
            <textarea className={inputCls} rows={2} placeholder={s.address_ph} value={address} onChange={(e) => setAddress(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} placeholder={s.city_ph} value={city} onChange={(e) => setCity(e.target.value)} />
              <input className={inputCls} placeholder={s.region_ph} value={region} onChange={(e) => setRegion(e.target.value)} />
            </div>
            <input className={inputCls} placeholder={s.notes_ph} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {/* Payment method */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#1A1A1A]/45">{s.payment}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className={cn('flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2.5 text-sm font-semibold transition', method === 'mpesa' ? 'border-[#1A1A1A] bg-black/[0.02]' : 'border-black/[0.12] text-[#1A1A1A]/60')}>
                <input type="radio" className="sr-only" checked={method === 'mpesa'} onChange={() => setMethod('mpesa')} />
                {s.mpesa}
              </label>
              {SELCOM_ENABLED ? (
                <label className={cn('flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2.5 text-sm font-semibold transition', method === 'card' ? 'border-[#1A1A1A] bg-black/[0.02]' : 'border-black/[0.12] text-[#1A1A1A]/60')}>
                  <input type="radio" className="sr-only" checked={method === 'card'} onChange={() => setMethod('card')} />
                  {s.card}
                </label>
              ) : null}
            </div>

            {isCard ? (
              <div className="flex items-start gap-3 rounded-xl border border-black/[0.1] bg-black/[0.015] p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.08]">
                  <Lock className="h-4 w-4" />
                </span>
                <p className="text-xs leading-relaxed text-[#1A1A1A]/60">{s.card_body}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {SELCOM_ENABLED ? (
                  <div className="inline-flex rounded-full border border-black/[0.1] bg-black/[0.02] p-1">
                    <button type="button" onClick={() => { setMpesaMode('push'); setError(null) }} className={cn('rounded-full px-3.5 py-1.5 text-xs font-semibold transition', mpesaMode === 'push' ? 'bg-white shadow-sm' : 'text-[#1A1A1A]/55')}>
                      {s.pay_prompt}
                    </button>
                    <button type="button" onClick={() => { setMpesaMode('lipa'); setError(null) }} className={cn('rounded-full px-3.5 py-1.5 text-xs font-semibold transition', mpesaMode === 'lipa' ? 'bg-white shadow-sm' : 'text-[#1A1A1A]/55')}>
                      {s.lipa}
                    </button>
                  </div>
                ) : null}

                {useLipa ? (
                  <>
                    <div className="overflow-hidden rounded-2xl border border-black/[0.1]">
                      <div className="flex justify-center bg-white p-3">
                        <Image src={MPESA_LIPA_POSTER_SRC} alt={`M-Pesa Lipa Namba poster for ${MPESA_LIPA_NAME}`} width={1749} height={2481} quality={100} sizes="360px" className="h-auto max-h-[300px] w-auto max-w-full object-contain" />
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-black/[0.08] bg-black/[0.02] px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1A1A1A]/55">{s.pay_exactly}</p>
                        <span className="text-lg font-bold tabular-nums text-[#1A1A1A]">{priceLabel}</span>
                      </div>
                    </div>
                    <input className={inputCls} placeholder={s.payer_name_ph} value={payerName} onChange={(e) => setPayerName(e.target.value)} />
                    <input className={cn(inputCls, 'uppercase placeholder:normal-case')} placeholder={s.payref_ph} value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                  </>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl border border-black/[0.1] bg-black/[0.015] p-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.08]">
                      <Smartphone className="h-4 w-4" />
                    </span>
                    <p className="text-xs leading-relaxed text-[#1A1A1A]/60">{s.push_body}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <button
            type="button"
            onClick={handlePay}
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#1A1A1A] px-6 py-3 text-sm font-bold text-white transition hover:bg-black/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {(useLipa ? s.paid_btn : s.pay_btn).replace('{price}', priceLabel)}
          </button>

          <p className="inline-flex items-center gap-1.5 text-xs text-[#1A1A1A]/45">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            {s.reassure}
          </p>
        </div>
      </div>

      {phase === 'awaiting' ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-7 text-center shadow-2xl">
            <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-[#9FE870]/25">
              <Smartphone className="h-6 w-6" />
            </span>
            <h2 className="text-lg font-semibold text-[#1A1A1A]">{s.overlay_title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[#1A1A1A]/60">
              {s.overlay_body.replace('{amount}', priceLabel).replace('{phone}', phone.trim())}
            </p>
            <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[#1A1A1A]/50">
              <Loader2 className="h-4 w-4 animate-spin" /> {s.overlay_wait}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
