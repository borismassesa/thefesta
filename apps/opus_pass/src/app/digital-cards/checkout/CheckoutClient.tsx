'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Smartphone, ShieldCheck, AlertCircle, Mail, Clock, Sparkles, MapPin, Pencil, Copy, Check, Loader2, Lock } from 'lucide-react'
import CheckoutStepper from '@/components/digital-cards/CheckoutStepper'
import { useCart } from '@/components/providers/CartProvider'
import {
  getContact,
  getLastOrder,
  setLastOrder,
  type StoredContact,
  type StoredOrder,
  type StoredOrderPayment,
} from '@/lib/cart-storage'
import type { InitiateRequest, InitiateResponse, StatusResponse } from '@/lib/payments/types'
import { useT } from '@/components/providers/UIStringsProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

type Logo = { src: string; w: number; h: number; cls: string }
type PaymentMethod = {
  id: string
  kind: 'mobile' | 'card'
  provider: string
  descKey: string
  logos: Logo[]
}

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

// OpusFesta's M-Pesa Lipa Namba (TIPS / Tan QR merchant number) — from the
// official Vodacom "Pesa ni M-Pesa" merchant poster.
// Automated Selcom payments (M-Pesa STK push + card) are gated behind this flag.
// Until OpusFesta has a Selcom merchant account, it stays OFF and checkout uses
// only the manual Lipa Namba flow: the customer pays externally and enters their
// name, phone, and transaction reference; the OpusFesta team confirms it.
// Flip NEXT_PUBLIC_PAYMENTS_SELCOM_ENABLED=true (with SELCOM_* server creds) to
// turn the automated push + card options on.
const SELCOM_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_SELCOM_ENABLED === 'true'

const MPESA_LIPA_NAMBA = '350298654'
const MPESA_LIPA_NAME = 'OPUSFESTA COMPANY LIMITED'
const MPESA_LIPA_POSTER_SRC = '/assets/payment/opusfesta-mpesa-lipa-poster.png'

// Payment networks per Tan QR merchant poster. The dial codes + structure stay
// hardcoded; the step instructions (do/detail) are CMS-driven via stepKeys so
// admins can edit the bilingual copy. The USSD menus are in Swahili on every
// Tanzanian handset, so the published Swahili text matches what's on the poster.
type LipaStepKeys = { do: string; detail: string }
type LipaNetwork = {
  id: string
  // proper-noun network names stay hardcoded; the catch-all uses CMS copy
  name?: string
  nameKey?: string
  dial?: string
  dialKey?: string
  steps: LipaStepKeys[]
}

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

function formatTzs(n: number): string {
  return `TZS ${n.toLocaleString('en-US')}`
}

const PHONE_RE = /^\+?(?:[\d](?:[\s().-]?)){9,}$/
// Transaction confirmation codes vary per network (M-Pesa: 10 alphanumeric,
// Tigo/Airtel: digits, banks may include dots/dashes) — keep it lenient.
const PAYREF_RE = /^[A-Za-z0-9.\-]{6,25}$/

type Errors = Partial<
  Record<'mobilePhone' | 'payerName' | 'payRef' | 'cart' | 'contact' | 'event', string>
>

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-xs text-red-600 inline-flex items-center gap-1">
      <AlertCircle size={12} />
      {children}
    </p>
  )
}

// Small copy-to-clipboard control with a brief "copied" confirmation.
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
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

type CheckoutEvent = { id: string; name: string; eventTypeLabel: string }

export default function CheckoutClient({ events }: { events: CheckoutEvent[] }) {
  const router = useRouter()
  const { items, subtotal, clear } = useCart()
  const tf = useT('checkout-form')
  const tp = useT('checkout-payment')
  const ts = useT('checkout-summary')

  // Single-event couples (the common case) never see a picker — their one
  // event is assigned automatically. Multi-event couples must choose.
  const [eventId, setEventId] = useState<string>(events.length === 1 ? events[0].id : '')

  const [selected, setSelected] = useState<string>('mpesa')
  // M-Pesa offers two paths: an automated STK push (PIN prompt on the phone)
  // and the manual Lipa Namba flow (pay externally, enter the confirmation code).
  // With Selcom off, only the manual flow is available, so default to it.
  const [mpesaMode, setMpesaMode] = useState<'push' | 'lipa'>(SELCOM_ENABLED ? 'push' : 'lipa')
  const [lipaNetwork, setLipaNetwork] = useState<string>('vodacom')

  // Automated-payment phase: while we wait for the customer to enter their PIN
  // we show a blocking modal and poll the order status until it resolves.
  const [payPhase, setPayPhase] = useState<'idle' | 'awaiting' | 'redirecting'>('idle')
  const [payError, setPayError] = useState<string | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current) }, [])

  const [mobilePhone, setMobilePhone] = useState('')
  const [payerName, setPayerName] = useState('')
  const [payRef, setPayRef] = useState('')

  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const [contact, setContactState] = useState<StoredContact | null>(null)

  useEffect(() => {
    queueMicrotask(() => setContactState(getContact()))
  }, [])

  // Card requires the Selcom hosted page — hide it until Selcom is enabled
  // (otherwise there's no way to actually charge a card).
  const visibleMethods = SELCOM_ENABLED
    ? PAYMENT_METHODS
    : PAYMENT_METHODS.filter((m) => m.id !== 'card')

  const method = PAYMENT_METHODS.find((m) => m.id === selected) ?? PAYMENT_METHODS[0]
  const isCard = method.kind === 'card'
  const isMpesa = method.id === 'mpesa'
  // Automated M-Pesa push (default) vs. the manual Lipa Namba fallback.
  const usePush = isMpesa && mpesaMode === 'push'
  const useLipa = isMpesa && mpesaMode === 'lipa'

  // Digital product — prices are final (VAT-inclusive) and delivery is free.
  const discount = 0
  const total = subtotal - discount

  const clearError = (key: keyof Errors) =>
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

  const paymentLabel = (): string => {
    if (isCard) return 'Card (Visa / Mastercard)'
    if (useLipa)
      return `M-Pesa Lipa Namba ${MPESA_LIPA_NAMBA} · ${payerName.trim()} · ${mobilePhone.trim()} · Ref ${payRef.trim().toUpperCase()}`
    return `${method.provider} ${mobilePhone.trim()}`
  }

  const paymentDetails = (): StoredOrderPayment => {
    if (isCard) return { provider: 'Card' }
    if (useLipa)
      return {
        provider: 'M-Pesa',
        businessNumber: MPESA_LIPA_NAMBA,
        payerPhone: mobilePhone.trim(),
        payerName: payerName.trim(),
        reference: payRef.trim().toUpperCase(),
      }
    return { provider: method.provider, payerPhone: mobilePhone.trim() }
  }

  const validate = (): Errors => {
    const e: Errors = {}
    if (items.length === 0) e.cart = tf('error_cart_empty')
    if (!contact) e.contact = tf('error_contact_missing')
    if (events.length > 1 && !eventId) e.event = tf('error_event_required')
    if (isCard) {
      // Card details are collected on Selcom's secure hosted page — nothing to
      // validate here (we never touch the raw card number).
    } else {
      if (!PHONE_RE.test(mobilePhone.trim())) {
        e.mobilePhone = tf('error_phone')
      }
      if (useLipa && payerName.trim().length < 3) {
        e.payerName = tf('error_payer_name')
      }
      if (useLipa && !PAYREF_RE.test(payRef.trim())) {
        e.payRef = tf('error_payref')
      }
    }
    return e
  }

  // Cart lines in the shape /api/payments/initiate expects (the server
  // re-prices these against the CMS — the totals here are not trusted).
  const itemsPayload = (): InitiateRequest['items'] =>
    items.map((i) => ({
      id: i.id,
      name: i.name,
      image: i.image,
      treatment: i.treatment,
      summary: i.summary,
      tier: i.tier,
      tierId: i.tierId,
      guests: i.guests,
      pricePerGuest: i.pricePerGuest,
      extrasTotal: i.extrasTotal,
      addOns: i.addOns,
      addOnItems: i.addOnItems,
      total: i.total,
    }))

  // Local snapshot for the confirmation page's display. The authoritative
  // paid/failed state always comes from the server (fetched by ref); this is a
  // placeholder shown while that loads.
  const buildLocalOrder = (
    ref: string,
    paymentStatus: 'verifying' | 'paid',
  ): StoredOrder => ({
    ref,
    paidAt: new Date().toISOString(),
    eventId: eventId || null,
    paymentLabel: paymentLabel(),
    payment: paymentDetails(),
    paymentRef: useLipa ? payRef.trim().toUpperCase() : undefined,
    paymentStatus,
    contact: { name: contact!.fullName, email: contact!.email, phone: contact!.phone },
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      summary: i.summary,
      total: i.total,
      image: i.image,
      treatment: i.treatment,
      tier: i.tier,
      tierId: i.tierId,
      guests: i.guests,
      addOns: i.addOns,
      addOnItems: i.addOnItems,
    })),
    subtotal,
    discount,
    total,
  })

  // Poll the order status while the customer enters their PIN, until the
  // payment resolves or we hit the timeout.
  const pollUntilResolved = (ref: string) => {
    const startedAt = Date.now()
    const TIMEOUT_MS = 120_000
    const tick = async () => {
      try {
        const res = await fetch(`/api/payments/status?ref=${encodeURIComponent(ref)}`, {
          cache: 'no-store',
        })
        if (res.status === 404) {
          // Order vanished — surface immediately rather than waiting out the timeout.
          setPayPhase('idle')
          setSubmitting(false)
          setPayError('We could not find your order. Please try again.')
          return
        }
        const data = (await res.json()) as StatusResponse
        if (data.status === 'paid') {
          // Promote the local snapshot to paid so the confirmation page and
          // invoice read 'paid' immediately, before the server re-confirms.
          const stored = getLastOrder()
          if (stored && stored.ref === ref) setLastOrder({ ...stored, paymentStatus: 'paid' })
          clear()
          router.push(`/digital-cards/confirmation?ref=${ref}`)
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
        setPayError(
          "We didn't get a confirmation in time. If you approved the prompt, your order will appear shortly — otherwise please try again.",
        )
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
    if (!contact) return

    // ── Manual Lipa Namba: the customer paid externally and entered their
    // confirmation code. Recorded as 'verifying' for the team to reconcile.
    if (useLipa) {
      setSubmitting(true)
      try {
        const payload: InitiateRequest = {
          method: 'lipa_namba',
          phone: mobilePhone.trim(),
          payerName: payerName.trim(),
          paymentReference: payRef.trim().toUpperCase(),
          contact: { name: contact.fullName, email: contact.email, phone: contact.phone },
          items: itemsPayload(),
          paymentLabel: paymentLabel(),
          eventId: eventId || undefined,
        }
        const res = await fetch('/api/payments/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = (await res.json()) as InitiateResponse
        if (!res.ok || !data.ref) {
          setSubmitting(false)
          setPayError(data.message ?? 'Payment could not be submitted. Please try again.')
          return
        }
        setLastOrder(buildLocalOrder(data.ref, 'verifying'))
        clear()
        router.push(`/digital-cards/confirmation?ref=${encodeURIComponent(data.ref)}`)
      } finally {
        setSubmitting(false)
      }
      return
    }

    // ── Automated Selcom flows: M-Pesa push or card redirect.
    setSubmitting(true)
    setPayPhase(isCard ? 'redirecting' : 'awaiting')
    try {
      const payload: InitiateRequest = {
        method: isCard ? 'card' : 'mobile',
        phone: isCard ? undefined : mobilePhone.trim(),
        contact: { name: contact.fullName, email: contact.email, phone: contact.phone },
        items: itemsPayload(),
        paymentLabel: paymentLabel(),
        eventId: eventId || undefined,
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

      // Keep a local copy so the confirmation page can render immediately; the
      // real paid state is fetched there by ref.
      setLastOrder(buildLocalOrder(data.ref, 'verifying'))

      if (isCard) {
        if (!data.redirectUrl) {
          setPayPhase('idle')
          setSubmitting(false)
          setPayError('Card payment is unavailable right now. Please try M-Pesa.')
          return
        }
        // Hand off to Selcom's secure hosted card page.
        window.location.href = data.redirectUrl
        return
      }

      // Mobile push sent — wait for the PIN approval.
      pollUntilResolved(data.ref)
    } catch {
      setPayPhase('idle')
      setSubmitting(false)
      setPayError('Something went wrong starting the payment. Please try again.')
    }
  }

  return (
    <main className="bg-gray-50 min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        <Link
          href="/digital-cards/address"
          className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-gray-900 mb-4"
        >
          {tf('back_to_contact')}
        </Link>
        <CheckoutStepper current="payment" />

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-8">
          {/* LEFT — Payment */}
          <Card className="border-0 shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)]">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold">{tf('page_title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {(errors.cart || errors.contact) && (
                <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
                  <p className="font-semibold mb-1 inline-flex items-center gap-1.5">
                    <AlertCircle size={14} /> {tf('block_title')}
                  </p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {errors.cart && <li>{errors.cart}</li>}
                    {errors.contact && (
                      <li>
                        {errors.contact}{' '}
                        <Link href="/digital-cards/address" className="underline font-medium">
                          {tf('block_add_contact_cta')}
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {contact && (
                <div className="flex items-start gap-3.5 rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-900">
                    <MapPin size={17} />
                  </span>
                  <div className="min-w-0 grow">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {tf('recap_delivering_to')}
                    </p>
                    <p className="mt-0.5 font-semibold text-gray-900">{contact.fullName}</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1.5"><Mail size={12} className="shrink-0" />{contact.email}</span>
                      <span className="inline-flex items-center gap-1.5"><Smartphone size={12} className="shrink-0" />{contact.phone}</span>
                    </div>
                  </div>
                  <Link
                    href="/digital-cards/address"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
                  >
                    <Pencil size={12} />
                    {tf('recap_edit')}
                  </Link>
                </div>
              )}

              {/* Which event this design/quota is for — only shown when the
                  couple has 2+ events; single-event couples are auto-assigned. */}
              {events.length > 1 && (
                <div>
                  <Label htmlFor="checkout-event" className="mb-1.5 text-gray-900">
                    {tf('event_label')} <span className="text-red-600">*</span>
                  </Label>
                  <select
                    id="checkout-event"
                    value={eventId}
                    onChange={(e) => { setEventId(e.target.value); clearError('event') }}
                    aria-invalid={Boolean(errors.event)}
                    className={cn(
                      'border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none md:text-sm',
                      'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                      errors.event && 'border-destructive',
                    )}
                  >
                    <option value="" disabled>
                      {tf('event_placeholder')}
                    </option>
                    {events.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} · {e.eventTypeLabel}
                      </option>
                    ))}
                  </select>
                  {errors.event && <FieldError>{errors.event}</FieldError>}
                </div>
              )}

              {/* Payment method picker — selection style matches the product
                  page's optional add-ons (square check, dark when selected). */}
              <div className="space-y-3">
                <h2 className="text-base font-semibold text-gray-900">{tp('choose_title')}</h2>
                <div role="radiogroup" aria-label={tp('method_aria')} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {visibleMethods.map((m) => {
                    const checked = selected === m.id
                    return (
                      <label
                        key={m.id}
                        className={cn(
                          'flex cursor-pointer flex-col gap-3 rounded-md border p-4 transition',
                          checked ? 'border-[#1A1A1A] bg-white' : 'border-gray-200 bg-white hover:border-gray-300',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="payment-method"
                            value={m.id}
                            checked={checked}
                            onChange={() => setSelected(m.id)}
                            aria-describedby={`pm-${m.id}-desc`}
                            className="peer sr-only"
                          />
                          <span
                            aria-hidden
                            className={cn(
                              'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition peer-focus-visible:ring-2 peer-focus-visible:ring-[#1A1A1A]/25',
                              checked ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white' : 'border-gray-300 bg-white text-transparent',
                            )}
                          >
                            <Check size={13} strokeWidth={3} />
                          </span>
                          <div className="grow">
                            <p className="text-[14px] font-bold text-gray-900">{m.provider}</p>
                            <p id={`pm-${m.id}-desc`} className="mt-1 text-[12px] leading-relaxed text-gray-600">
                              {tp(m.descKey)}
                            </p>
                          </div>
                        </div>
                        <div className="ml-8 flex items-center gap-2">
                          {m.logos.map((logo) => (
                            <span
                              key={logo.src}
                              className="inline-flex h-7 items-center justify-center rounded-md border border-gray-200 bg-white px-1.5"
                            >
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
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-gray-900 ring-1 ring-gray-200">
                      <Lock size={16} />
                    </span>
                    <div className="space-y-1.5">
                      <p className="text-sm font-semibold text-gray-900">
                        {tp('card_title')}
                      </p>
                      <p className="text-xs leading-relaxed text-gray-600">
                        {tp('card_body')}
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <Image src="/assets/payment-logos/visa.svg" alt="Visa" width={1000} height={325} className="h-4 w-auto" />
                        <Image src="/assets/payment-logos/mastercard.svg" alt="Mastercard" width={1000} height={618} className="h-6 w-auto" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* M-Pesa path toggle: automated phone prompt vs. manual Lipa
                      Namba. Only shown when Selcom is enabled — otherwise the
                      manual flow is the only option. */}
                  {SELCOM_ENABLED && (
                    <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-1">
                      <button
                        type="button"
                        onClick={() => { setMpesaMode('push'); setPayError(null) }}
                        aria-pressed={mpesaMode === 'push'}
                        className={cn(
                          'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                          mpesaMode === 'push' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900',
                        )}
                      >
                        {tp('toggle_push')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setMpesaMode('lipa'); setPayError(null) }}
                        aria-pressed={mpesaMode === 'lipa'}
                        className={cn(
                          'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                          mpesaMode === 'lipa' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900',
                        )}
                      >
                        {tp('toggle_lipa')}
                      </button>
                    </div>
                  )}

                  {usePush && (
                    <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-gray-900 ring-1 ring-gray-200">
                        <Smartphone size={16} />
                      </span>
                      <p className="text-xs leading-relaxed text-gray-600">
                        {tp('push_instructions', { pay: tp('push_pay_word') })}
                      </p>
                    </div>
                  )}

                  {useLipa && (
                    <div className="overflow-hidden rounded-2xl border border-gray-200">
                      <div className="flex justify-center bg-white p-3 sm:p-4">
                        <Image
                          src={MPESA_LIPA_POSTER_SRC}
                          alt={`M-Pesa Lipa Namba poster for ${MPESA_LIPA_NAME}`}
                          width={1749}
                          height={2481}
                          quality={100}
                          sizes="(min-width: 1024px) 360px, (min-width: 640px) 420px, 82vw"
                          className="h-auto max-h-[420px] w-auto max-w-full object-contain sm:max-h-[500px] lg:max-h-[560px]"
                        />
                      </div>

                      {/* Amount to send */}
                      <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                          {tp('lipa_amount_label')}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-bold text-gray-900 tabular-nums">
                            {formatTzs(total)}
                          </span>
                          <CopyButton value={String(total)} label="amount" />
                        </div>
                      </div>

                      {/* Jinsi ya kufanya malipo — per-network instructions */}
                      <div className="p-4">
                        <p className="text-sm font-semibold text-gray-900">{tp('lipa_how_title')}</p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {tp('lipa_how_subtitle')}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label={tp('lipa_network_aria')}>
                          {LIPA_NETWORKS.map((n) => {
                            const active = lipaNetwork === n.id
                            return (
                              <button
                                key={n.id}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => setLipaNetwork(n.id)}
                                className={cn(
                                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                                  active
                                    ? 'border-[#E60000] bg-[#E60000] text-white'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900',
                                )}
                              >
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
                                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#E60000] text-[11px] font-bold text-white tabular-nums">
                                      {i + 1}
                                    </span>
                                    <p className="text-xs leading-relaxed text-gray-700">
                                      <span className="font-bold text-gray-900">{tp(step.do)}</span>
                                      {' — '}
                                      {tp(step.detail)}
                                    </p>
                                  </li>
                                ))}
                              </ol>
                              {n.id === 'vodacom' && (
                                <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
                                  {tp('lipa_qr_note')}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {useLipa && (
                    <div>
                      <Label htmlFor="payer-name" className="mb-1.5 text-gray-900">
                        {tf('payer_name_label')} <span className="text-red-600">*</span>
                      </Label>
                      <Input
                        id="payer-name"
                        type="text"
                        value={payerName}
                        onChange={(e) => { setPayerName(e.target.value); clearError('payerName') }}
                        placeholder={tf('payer_name_placeholder')}
                        autoComplete="name"
                        aria-invalid={Boolean(errors.payerName)}
                      />
                      {errors.payerName && <FieldError>{errors.payerName}</FieldError>}
                      <p className="mt-1.5 text-xs text-gray-500">
                        {tf('payer_name_hint')}
                      </p>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="mobile-phone" className="mb-1.5 text-gray-900">
                      {useLipa ? tf('phone_label_lipa') : tf('phone_label_push', { provider: method.provider })}{' '}
                      <span className="text-red-600">*</span>
                    </Label>
                    <Input
                      id="mobile-phone"
                      type="tel"
                      value={mobilePhone}
                      onChange={(e) => { setMobilePhone(e.target.value); clearError('mobilePhone') }}
                      placeholder={tf('phone_placeholder')}
                      inputMode="tel"
                      aria-invalid={Boolean(errors.mobilePhone)}
                    />
                    {errors.mobilePhone && <FieldError>{errors.mobilePhone}</FieldError>}
                    {!useLipa && (
                      <p className="mt-1.5 text-xs text-gray-500">
                        {tf('phone_hint_push')}
                      </p>
                    )}
                  </div>

                  {useLipa && (
                    <div>
                      <Label htmlFor="pay-ref" className="mb-1.5 text-gray-900">
                        {tf('payref_label')} <span className="text-red-600">*</span>
                      </Label>
                      <Input
                        id="pay-ref"
                        type="text"
                        value={payRef}
                        onChange={(e) => { setPayRef(e.target.value); clearError('payRef') }}
                        placeholder={tf('payref_placeholder')}
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        className="uppercase placeholder:normal-case"
                        aria-invalid={Boolean(errors.payRef)}
                      />
                      {errors.payRef && <FieldError>{errors.payRef}</FieldError>}
                      <p className="mt-1.5 text-xs text-gray-500">
                        {tf('payref_hint')}
                      </p>
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

              <button
                type="button"
                onClick={handlePay}
                disabled={submitting || payPhase !== 'idle' || items.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-(--accent) px-6 py-3.5 text-[13px] font-extrabold uppercase tracking-[0.06em] text-(--on-accent) transition hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
              >
                {submitting && <Loader2 size={15} className="animate-spin" />}
                {submitting
                  ? payPhase === 'redirecting'
                    ? tp('pay_redirecting')
                    : payPhase === 'awaiting'
                      ? tp('pay_awaiting')
                      : tp('pay_processing')
                  : isCard
                    ? tp('pay_card_cta')
                    : useLipa
                      ? tp('pay_lipa_cta', { amount: formatTzs(total) })
                      : tp('pay_push_cta', { amount: formatTzs(total) })}
              </button>

              <p className="text-xs text-gray-500 inline-flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-emerald-600" />
                {useLipa
                  ? tp('reassure_lipa')
                  : isCard
                    ? tp('reassure_card')
                    : tp('reassure_push')}
              </p>
            </CardContent>
          </Card>

          {/* RIGHT — Order summary & info */}
          <aside className="flex flex-col gap-5">
            <Card className="border-0 shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)]">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">{ts('summary_title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{ts('price_label')}</span>
                  <span className="font-medium text-gray-900 tabular-nums">{formatTzs(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{ts('discount_label')}</span>
                    <span className="font-medium text-green-600 tabular-nums">-{formatTzs(discount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{ts('delivery_label')}</span>
                  <span className="font-semibold text-gray-900">{ts('delivery_free')}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-gray-900">{ts('total_label')}</span>
                  <span className="text-xl font-semibold text-gray-900 tabular-nums">{formatTzs(total)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2.5 rounded-lg bg-white border border-gray-200 px-3 py-3">
              <Clock className="mt-0.5 size-5 shrink-0 text-gray-700" />
              <div className="space-y-0.5">
                <h5 className="text-sm font-semibold text-gray-900">{ts('ready_title')}</h5>
                <p className="text-xs text-gray-600">
                  {ts('ready_body')}
                </p>
              </div>
            </div>

            <div className="flex gap-2.5 rounded-lg bg-white border border-gray-200 px-3 py-3">
              <Sparkles className="mt-0.5 size-5 shrink-0 text-gray-700" />
              <div className="space-y-0.5">
                <h5 className="text-sm font-semibold text-gray-900">{ts('revision_title')}</h5>
                <p className="text-xs text-gray-600">
                  {ts('revision_body')}
                </p>
              </div>
            </div>

            <p className="text-center text-xs text-gray-500">
              {ts('secure_note')}
            </p>
          </aside>
        </div>
      </div>

      {/* Waiting overlay — shown while the M-Pesa PIN prompt is on the phone. */}
      {payPhase === 'awaiting' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={tp('overlay_aria')}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-7 text-center shadow-2xl">
            <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-(--accent)/15 text-gray-900">
              <Smartphone size={26} />
            </span>
            <h2 className="text-lg font-semibold text-gray-900">{tp('overlay_title')}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
              {tp('overlay_body', { phone: mobilePhone.trim(), amount: formatTzs(total) })}
            </p>
            <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-gray-500">
              <Loader2 size={16} className="animate-spin" />
              {tp('overlay_waiting')}
            </div>
            <p className="mt-4 text-xs text-gray-400">
              {tp('overlay_keep_open')}
            </p>
          </div>
        </div>
      )}
    </main>
  )
}
