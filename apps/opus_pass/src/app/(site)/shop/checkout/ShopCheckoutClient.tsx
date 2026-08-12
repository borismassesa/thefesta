'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Clock, ShoppingBag, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fireConfetti } from '@/lib/shop/confetti'
import type { InitiateItem, InitiateRequest, StatusResponse } from '@/lib/payments/types'
import PaymentMethodFields, { type PaymentDraft } from '@/components/checkout/PaymentMethodFields'
import OrderTimeline from '@/components/shop/OrderTimeline'
import InvoiceButton from '@/components/shop/InvoiceButton'
import { Input } from '@/components/ui/input'

// Zola-style guest shop checkout — shipping + the shared payment section
// (PaymentMethodFields, the same component the invitation checkout uses) + an
// order summary. Plain purchase (no couple): the goods ship to the address
// entered here. The payment component owns method state, the Lipa Namba flow,
// the initiate POST, polling and the card redirect.

const PHONE_RE = /^\+?(?:[\d](?:[\s().-]?)){9,}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function formatTzs(n: number): string {
  return `TZS ${n.toLocaleString('en-US')}`
}

export type CheckoutLine = {
  productId: string
  name: string
  image: string
  priceTzs: number
  quantity: number
  shopName: string | null
}

type Done = { ref: string; status: 'paid' | 'processing' } | null

export default function ShopCheckoutClient({ lines }: { lines: CheckoutLine[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [region, setRegion] = useState('')
  const [notes, setNotes] = useState('')
  const [done, setDone] = useState<Done>(null)
  const [shippingOpen, setShippingOpen] = useState(true)
  const [paymentOpen, setPaymentOpen] = useState(true)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const celebrated = useRef(false)

  // Celebrate the moment the order goes through (paid or submitted-for-review).
  useEffect(() => {
    if (done && !celebrated.current) {
      celebrated.current = true
      fireConfetti()
    }
  }, [done])

  const subtotal = lines.reduce((s, l) => s + l.priceTzs * l.quantity, 0)
  const shippingSummary = name.trim()
    ? [name.trim(), city.trim() || address.trim().split('\n')[0]].filter(Boolean).join(' · ')
    : 'Where should we deliver?'

  // A card payment redirects away and returns with ?purchase_ref=… — surface
  // the confirmation and confirm the paid state by polling.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('purchase_ref')
    if (ref) {
      setDone({ ref, status: 'processing' })
      pollUntilPaid(ref)
    }
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pollUntilPaid(ref: string) {
    const startedAt = Date.now()
    const tick = async () => {
      try {
        const res = await fetch(`/api/payments/status?ref=${encodeURIComponent(ref)}`, { cache: 'no-store' })
        if (res.ok) {
          const data = (await res.json()) as StatusResponse
          if (data.status === 'paid') return setDone({ ref, status: 'paid' })
          if (data.status === 'failed' || data.status === 'expired') return
        }
      } catch {
        /* keep polling */
      }
      if (Date.now() - startedAt > 120_000) return
      pollTimer.current = setTimeout(tick, 3000)
    }
    pollTimer.current = setTimeout(tick, 3000)
  }

  function buildItems(): InitiateItem[] {
    return lines.map((l) => ({
      id: l.productId,
      name: l.name,
      image: l.image,
      total: l.priceTzs * l.quantity,
      kind: 'product',
      productId: l.productId,
      quantity: l.quantity,
    }))
  }

  function buildRequest(draft: PaymentDraft): InitiateRequest | { error: string } {
    if (name.trim().length < 2) return { error: 'Enter your name.' }
    if (!EMAIL_RE.test(email.trim())) return { error: 'Enter a valid email.' }
    if (!PHONE_RE.test(phone.trim())) return { error: 'Enter a valid contact phone.' }
    if (!address.trim()) return { error: 'Enter a delivery address.' }
    return {
      ...draft,
      contact: { name: name.trim(), email: email.trim(), phone: phone.trim() },
      items: buildItems(),
      delivery: {
        name: name.trim(),
        phone: phone.trim(),
        region: region.trim() || undefined,
        city: city.trim() || undefined,
        address: address.trim(),
        notes: notes.trim() || undefined,
      },
      redirectPath: '/shop/checkout',
      cancelPath: '/shop/checkout',
    }
  }

  const inputCls = 'w-full'

  // ── Confirmation ────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-2xl px-4 py-10 lg:py-14">
          {/* Top nav: back (left) + continue shopping (right) */}
          <div className="mb-8 flex items-center justify-between">
            <button data-opus-button="control"
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1A1A1A]/70 transition-colors hover:text-[#1A1A1A]"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <a
              href="/registry"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#5d3a78] transition-colors hover:text-[#4a2e60]"
            >
              Continue shopping <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <div className="text-center">
            <span className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[#9FE870]/25 text-[#1A1A1A]">
              {done.status === 'paid' ? <CheckCircle2 className="h-8 w-8" /> : <Clock className="h-8 w-8" />}
            </span>
            <h1 className="text-2xl font-bold text-[#1A1A1A]">{done.status === 'paid' ? 'Order confirmed 🎉' : 'Payment under review'}</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#1A1A1A]/60">
              {done.status === 'paid'
                ? 'Thank you! Your order is confirmed and on its way to the delivery address you gave.'
                : "Thanks! We've received your payment and finance is confirming it. We'll email you the moment it's approved."}
            </p>
            <p className="mt-4 inline-block rounded-full bg-black/[0.04] px-4 py-1.5 text-sm font-semibold text-[#1A1A1A]">Order {done.ref}</p>
          </div>

          {/* Progress */}
          <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_2px_12px_-8px_rgba(0,0,0,0.12)]">
            <h2 className="mb-5 text-base font-bold text-[#1A1A1A]">Order progress</h2>
            <OrderTimeline status={done.status} fulfillmentStatus="not_started" />
          </div>

          {/* Summary */}
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_2px_12px_-8px_rgba(0,0,0,0.12)]">
            <h2 className="mb-4 text-base font-bold text-[#1A1A1A]">Order summary</h2>
            <div className="space-y-3">
              {lines.map((l) => (
                <div key={l.productId} className="flex items-start gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-black/[0.05]">
                    {l.image ? <Image src={l.image} alt="" fill sizes="48px" className="object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-[#1A1A1A]">{l.name}</p>
                    <p className="text-xs text-[#1A1A1A]/50">Qty {l.quantity}{l.shopName ? ` · ${l.shopName}` : ''}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-[#1A1A1A]">{formatTzs(l.priceTzs * l.quantity)}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between border-t border-black/[0.08] pt-3 text-base font-bold text-[#1A1A1A]">
              <span>Total</span>
              <span>{formatTzs(subtotal)}</span>
            </div>
            {address.trim() && (
              <div className="mt-4 border-t border-black/[0.08] pt-3 text-sm text-[#1A1A1A]/70">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#1A1A1A]/40">Delivering to</p>
                {name.trim() && <p className="font-medium text-[#1A1A1A]">{name.trim()}</p>}
                <p>{address.trim()}</p>
                {(city.trim() || region.trim()) && <p>{[city.trim(), region.trim()].filter(Boolean).join(', ')}</p>}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <InvoiceButton orderRef={done.ref} email={email.trim()} />
            <a
              href={`/shop/order/${encodeURIComponent(done.ref)}`}
              className="inline-flex items-center justify-center rounded-full bg-[#1A1A1A] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
            >
              Track your order
            </a>
          </div>
          <p className="mt-4 text-center text-xs text-[#1A1A1A]/45">
            Keep your order number {done.ref} — the tracking link is in your email receipt too.
          </p>
        </div>
      </div>
    )
  }

  // ── Empty cart ──────────────────────────────────────────────────────────────
  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <span className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-black/[0.05] text-[#1A1A1A]/40"><ShoppingBag className="h-8 w-8" /></span>
        <h1 className="text-2xl font-bold text-[#1A1A1A]">Your cart is empty</h1>
        <p className="mt-2 text-sm text-[#1A1A1A]/60">Browse the registry shop and add a gift to get started.</p>
        <a href="/registry" className="mt-6 inline-block rounded-full bg-[#1A1A1A] px-6 py-3 text-sm font-bold text-white">Go to the shop</a>
      </div>
    )
  }

  // ── Checkout ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-black/[0.08] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-[#1A1A1A]/60"><Truck className="h-4 w-4" /> Delivery across Tanzania</p>
          <a href="/registry" className="text-sm font-semibold text-[#1A1A1A] underline underline-offset-4">Back to shopping</a>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-[1fr_360px] lg:gap-8 lg:py-12">
        {/* Left — shipping + payment (accordion cards) */}
        <div className="space-y-4">
          <AccordionSection step={1} title="Shipping" summary={shippingSummary} open={shippingOpen} onToggle={() => setShippingOpen((o) => !o)}>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input className={inputCls} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
                <Input className={inputCls} type="tel" placeholder="Contact phone (WhatsApp)" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <Input className={inputCls} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input className={inputCls} placeholder="Delivery address" value={address} onChange={(e) => setAddress(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Input className={inputCls} placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
                <Input className={inputCls} placeholder="Region" value={region} onChange={(e) => setRegion(e.target.value)} />
              </div>
              <textarea className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]" rows={2} placeholder="Delivery notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </AccordionSection>

          <AccordionSection step={2} title="Payment" summary="Mobile money or card" open={paymentOpen} onToggle={() => setPaymentOpen((o) => !o)}>
            <PaymentMethodFields amount={subtotal} buildRequest={buildRequest} onResult={(r) => setDone({ ref: r.ref, status: r.status })} />
          </AccordionSection>
        </div>

        {/* Right — order summary */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)]">
            <h2 className="mb-4 text-base font-bold text-[#1A1A1A]">Order summary</h2>
            <div className="space-y-3">
              {lines.map((l) => (
                <div key={l.productId} className="flex items-start gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-black/[0.05]">
                    {l.image ? <Image src={l.image} alt="" fill sizes="56px" className="object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-[#1A1A1A]">{l.name}</p>
                    <p className="text-xs text-[#1A1A1A]/50">Qty {l.quantity}{l.shopName ? ` · ${l.shopName}` : ''}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-[#1A1A1A]">{formatTzs(l.priceTzs * l.quantity)}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-1.5 border-t border-black/[0.08] pt-4 text-sm">
              <div className="flex justify-between text-[#1A1A1A]/70"><span>Subtotal</span><span>{formatTzs(subtotal)}</span></div>
              <div className="flex justify-between text-[#1A1A1A]/70"><span>Delivery</span><span>Arranged with shop</span></div>
              <div className="mt-2 flex justify-between border-t border-black/[0.08] pt-2 text-base font-bold text-[#1A1A1A]"><span>Total</span><span>{formatTzs(subtotal)}</span></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

// A single collapsible step card — numbered badge, title, a summary line while
// collapsed, and a chevron that rotates open. Clean focus-visible ring instead
// of the browser's default blue outline.
function AccordionSection({
  step,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  step: number
  title: string
  summary: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_2px_12px_-8px_rgba(0,0,0,0.12)]">
      <button data-opus-button="control"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-black/[0.015] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1A1A1A]/15"
      >
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors',
            open ? 'bg-[#1A1A1A] text-white' : 'bg-black/[0.06] text-[#1A1A1A]/60',
          )}
        >
          {step}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold leading-tight text-[#1A1A1A]">{title}</span>
          {!open && <span className="mt-0.5 block truncate text-xs text-[#1A1A1A]/45">{summary}</span>}
        </span>
        <ChevronDown className={cn('h-5 w-5 shrink-0 text-[#1A1A1A]/40 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-gray-100 px-5 pb-5 pt-4">{children}</div>}
    </section>
  )
}
