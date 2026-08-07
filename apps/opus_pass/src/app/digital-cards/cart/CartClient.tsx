'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ShoppingBag, Trash2, ShieldCheck, ArrowRight, Clock, Minus, Plus, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import CheckoutStepper from '@/components/digital-cards/CheckoutStepper'
import { InvitationVisual, type Treatment } from '@/components/guests/InvitationVisual'
import { ProductInfo } from '@/components/guests/productInfo'
import type { CatalogProduct } from '@/data/digital-cards-products'
import { useCart, MIN_GUESTS } from '@/components/providers/CartProvider'
import { getContact, getOrCreateQuoteRef, type StoredOrder } from '@/lib/cart-storage'
import { useT } from '@/components/providers/UIStringsProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/** Max designs shown in the "you might also like" cross-sell row. */
const EXPLORE_LIMIT = 8

/**
 * Cart line thumbnail. Renders the card's real artwork when present, but falls
 * back to the treatment visual if the image is missing OR fails to load — a
 * stale/broken stored image URL would otherwise leave an empty box.
 */
function CartThumbnail({
  href,
  image,
  treatment,
}: {
  href: string
  image?: string
  treatment: Treatment
}) {
  const [errored, setErrored] = useState(false)
  return (
    <Link
      href={href}
      className="relative aspect-[5/7] w-20 shrink-0 overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/5"
    >
      {image && !errored ? (
        <Image
          src={image}
          alt=""
          fill
          sizes="80px"
          className="object-cover"
          unoptimized
          onError={() => setErrored(true)}
        />
      ) : (
        <InvitationVisual treatment={treatment} />
      )}
    </Link>
  )
}

function formatTzs(n: number): string {
  return `TZS ${n.toLocaleString('en-US')}`
}

const PAYMENT_METHODS = [
  { id: 'mpesa', label: 'M-Pesa', src: '/assets/payment-logos/m-pesa-logo.png', width: 600, height: 400, className: 'h-[26px] w-auto' },
  { id: 'airtel', label: 'Airtel Money', src: '/assets/payment-logos/airtel-money.png', width: 390, height: 230, className: 'h-[24px] w-auto' },
  { id: 'mixx', label: 'Mixx by Yas (Tigo Pesa)', src: '/assets/payment-logos/mixx-by-yass-tigo-pesa.png', width: 600, height: 400, className: 'h-[28px] w-auto' },
  { id: 'visa', label: 'Visa', src: '/assets/payment-logos/visa.svg', width: 1000, height: 325, className: 'h-[17px] w-auto' },
  { id: 'mastercard', label: 'Mastercard', src: '/assets/payment-logos/mastercard.svg', width: 1000, height: 618, className: 'h-[20px] w-auto' },
] as const

type PaymentMethodLogo = (typeof PAYMENT_METHODS)[number]

function PaymentLogo({ method }: { method: PaymentMethodLogo }) {
  return (
    <span
      className="inline-flex h-8 items-center justify-center rounded-md border border-gray-200 bg-white px-2 shadow-sm"
      aria-label={method.label}
      title={method.label}
      role="img"
    >
      <Image
        src={method.src}
        alt=""
        width={method.width}
        height={method.height}
        className={method.className}
      />
    </span>
  )
}

// Lightweight confirm-on-delete popover (no extra dependency).
function DeleteButton({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  const t = useT('cart')
  const [open, setOpen] = useState(false)
  return (
    <div className="relative shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="text-gray-400 hover:text-red-600"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('remove_aria', { name })}
      >
        <Trash2 className="size-5" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]">
            <div className="flex flex-col items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-red-500/10">
                <Trash2 className="size-6 text-destructive" />
              </div>
              <p className="text-center text-sm font-semibold text-gray-900 text-balance">
                {t('remove_confirm')}
              </p>
              <div className="grid w-full grid-cols-2 gap-2">
                <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
                  {t('remove_cancel')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="bg-destructive! text-white"
                  onClick={() => {
                    onConfirm()
                    setOpen(false)
                  }}
                >
                  {t('remove_confirm_cta')}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Editable guest count — clean shadcn stepper (min 50, step 10). Free typing allowed.
function GuestStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useT('cart')
  const [draft, setDraft] = useState<string | null>(null)
  const displayValue = draft ?? String(value)
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('guests_fewer')}
        onClick={() => {
          setDraft(null)
          onChange(value - 10)
        }}
        disabled={value <= MIN_GUESTS}
        className="size-7 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
      >
        <Minus className="size-3.5" />
      </Button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={t('guests_input_aria')}
        value={displayValue}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = parseInt(displayValue, 10)
          setDraft(null)
          onChange(Number.isNaN(n) ? MIN_GUESTS : n)
        }}
        className="w-12 bg-transparent text-center text-sm font-semibold tabular-nums text-gray-900 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('guests_more')}
        onClick={() => {
          setDraft(null)
          onChange(value + 10)
        }}
        className="size-7 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  )
}

// Compact cross-sell card — mirrors the catalog ProductCard look (5:7, hover lift).
function RecommendCard({
  product,
  fromGuestPrice,
  perGuestLabel,
  perDesignLabel,
  fromLabel,
}: {
  product: CatalogProduct
  fromGuestPrice?: number
  perGuestLabel?: string
  perDesignLabel?: string
  fromLabel?: string
}) {
  return (
    <div className="group/rec flex flex-col">
      <Link
        href={`/digital-cards/p/${product.id}`}
        className="relative block aspect-[5/7] overflow-hidden rounded-md bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_16px_-8px_rgba(0,0,0,0.12)] transition-[transform,box-shadow] duration-300 ease-out group-hover/rec:-translate-y-1 group-hover/rec:shadow-[0_4px_8px_rgba(0,0,0,0.06),0_18px_32px_-12px_rgba(0,0,0,0.18)]"
      >
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <InvitationVisual treatment={product.treatment} palette={product.palettes?.[0]} />
        )}
      </Link>
      <ProductInfo product={product} fromGuestPrice={fromGuestPrice} perGuestLabel={perGuestLabel} perDesignLabel={perDesignLabel} fromLabel={fromLabel} />
    </div>
  )
}

// "You might also like" — leads with designs in the same categories as the cart,
// then pads with other designs; falls back to a general selection when empty.
function ExploreMore({
  products,
  fromGuestPrice,
  perGuestLabel,
  perDesignLabel,
  fromLabel,
}: {
  products: CatalogProduct[]
  fromGuestPrice?: number
  perGuestLabel?: string
  perDesignLabel?: string
  fromLabel?: string
}) {
  const t = useT('cart')
  const { items } = useCart()

  const recommended = useMemo(() => {
    const cartIds = new Set(items.map((i) => i.id))
    const cartCategories = new Set(
      products.filter((p) => cartIds.has(p.id)).map((p) => p.category),
    )
    const available = products.filter((p) => !cartIds.has(p.id))
    const related = available.filter((p) => cartCategories.has(p.category))
    const others = available.filter((p) => !cartCategories.has(p.category))
    return [...related, ...others].slice(0, EXPLORE_LIMIT)
  }, [items, products])

  if (recommended.length === 0) return null

  const hasItems = items.length > 0

  return (
    <section className="mt-12 border-t border-gray-200 pt-10">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {hasItems ? t('explore_title_has') : t('explore_title_empty')}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {hasItems ? t('explore_subtitle_has') : t('explore_subtitle_empty')}
          </p>
        </div>
        <Link
          href="/digital-cards/catalog"
          className="hidden shrink-0 items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900 sm:inline-flex"
        >
          {t('explore_view_all')} <ArrowRight size={14} />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
        {recommended.map((product) => (
          <RecommendCard key={product.id} product={product} fromGuestPrice={fromGuestPrice} perGuestLabel={perGuestLabel} perDesignLabel={perDesignLabel} fromLabel={fromLabel} />
        ))}
      </div>
    </section>
  )
}

export default function CartClient({
  products = [],
  fromGuestPrice,
  perGuestLabel,
  perDesignLabel,
  fromLabel,
}: {
  products?: CatalogProduct[]
  fromGuestPrice?: number
  perGuestLabel?: string
  perDesignLabel?: string
  fromLabel?: string
}) {
  const t = useT('cart')
  const { items, subtotal, removeItem, setGuests } = useCart()
  // Digital product — prices are final (VAT-inclusive) and delivery is free.
  const discount = 0
  const total = subtotal - discount
  const [quoteBusy, setQuoteBusy] = useState(false)

  const handleApplyCoupon = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    toast(t('coupon_none_active'), {
      description: t('coupon_none_active_desc'),
    })
  }

  /**
   * The cart, priced, as a document someone else can pay from.
   *
   * Shaped as a StoredOrder because /api/invoice renders that and nothing else;
   * `documentKind: 'quotation'` is what stops it claiming to be a paid invoice.
   * The reference is derived from the cart's contents, so re-downloading an
   * unchanged cart hands back the same quotation number.
   */
  function buildQuotation(): StoredOrder {
    const signature = JSON.stringify(
      items.map((i) => [i.id, i.guests ?? 0, i.total, i.addOns ?? []]),
    )
    const contact = getContact()
    return {
      ref: getOrCreateQuoteRef(signature),
      documentKind: 'quotation',
      // The issue date. The document derives "valid until" from it, so the
      // validity window can never disagree with when it was raised.
      paidAt: new Date().toISOString(),
      contact: {
        name: contact?.fullName || undefined,
        email: contact?.email ?? '',
        phone: contact?.phone ?? '',
      },
      // No `payment` block: nothing has been paid, and the document's "How to
      // pay" section imports OpusFesta's own numbers rather than being handed
      // them. Setting it here would imply a transaction that does not exist.
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        summary: i.summary,
        total: i.total,
        image: i.image,
        tier: i.tier,
        tierId: i.tierId,
        guests: i.guests,
        pricePerGuest: i.pricePerGuest,
        addOns: i.addOns,
        addOnItems: i.addOnItems,
      })),
      subtotal,
      discount,
      total,
    }
  }

  async function downloadQuotation() {
    setQuoteBusy(true)
    try {
      const quote = buildQuotation()
      const res = await fetch('/api/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quote),
      })
      if (!res.ok) throw new Error('Quotation request failed')
      const blob = await res.blob()
      const filename = `OpusFesta-Quotation-${quote.ref}.pdf`
      const file = new File([blob], filename, { type: 'application/pdf' })
      // Sharing beats downloading here: the point of a quotation is to get it
      // to whoever is paying, and on a phone that is the WhatsApp share sheet.
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: filename })
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // share sheet dismissed
      toast.error(t('quote_failed'))
    } finally {
      setQuoteBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 pt-8 pb-28 lg:pb-8">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <Link
          href="/digital-cards/catalog"
          className="mb-4 inline-flex items-center text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          {t('back_to_designs')}
        </Link>
        <CheckoutStepper current="cart" />

        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* LEFT — Cart items */}
          <div className="lg:col-span-2">
            <Card className="w-full border-0 shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)]">
              <div className="mx-6 flex items-center justify-between gap-4 border-b border-gray-100 pb-5">
                <CardTitle className="text-2xl font-semibold text-gray-900">{t('cart_title')}</CardTitle>
                <span className="text-muted-foreground shrink-0 text-sm">
                  {items.length === 1
                    ? t('count_one', { n: items.length })
                    : t('count_other', { n: items.length })}
                </span>
              </div>

              {items.length === 0 ? (
                <CardContent>
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-14 text-center">
                    <div className="mb-3 inline-flex size-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                      <ShoppingBag size={22} />
                    </div>
                    <p className="text-sm font-semibold text-gray-700">{t('empty_title')}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t('empty_body')}
                    </p>
                    <Link
                      href="/digital-cards/catalog"
                      className="mt-4 inline-block rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
                    >
                      {t('empty_cta')}
                    </Link>
                  </div>
                </CardContent>
              ) : (
                <CardContent className="space-y-4">
                  {items.map((item) => {
                    const key = (item.tierId ?? item.tier ?? '').toLowerCase()
                    const pill =
                      key === 'classic'
                        ? 'bg-[#EFE3FA] text-[#6B4E8C]'
                        : key === 'elegant' || key === 'signature'
                          ? 'bg-[#F5EACF] text-[#8A6B1E]'
                          : 'bg-gray-100 text-gray-700'
                    return (
                      <div
                        key={item.id}
                        className="flex gap-6 rounded-xl border border-gray-200 p-4 sm:p-5 max-sm:flex-col sm:items-center"
                      >
                        <div className="flex grow items-center gap-4">
                        <CartThumbnail
                          href={`/digital-cards/p/${item.id}`}
                          image={item.image}
                          treatment={item.treatment}
                        />

                        <div className="flex flex-col justify-between gap-3">
                          <div className="flex flex-col gap-1.5">
                            <Link
                              href={`/digital-cards/p/${item.id}`}
                              className="font-medium text-gray-900 hover:underline"
                            >
                              {item.name}
                            </Link>
                            {item.tier && (
                              <span
                                className={`w-fit rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${pill}`}
                              >
                                {t('item_package_suffix', { tier: item.tier })}
                              </span>
                            )}
                            {item.addOns && item.addOns.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {item.addOns.map((a) => (
                                  <span
                                    key={a}
                                    className="rounded-full bg-gray-50 px-2 py-0.5 text-[10px] text-gray-600 ring-1 ring-gray-200"
                                  >
                                    + {a}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="size-4 text-gray-500" />
                            <p className="text-muted-foreground text-sm">{t('item_delivered')}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 sm:justify-start sm:gap-8">
                        {item.guests != null && (
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
                              {t('guests_label')}
                            </span>
                            <GuestStepper value={item.guests} onChange={(n) => setGuests(item.id, n)} />
                          </div>
                        )}
                        {/* Price + delete grouped so the amount sits at the right end on mobile */}
                        <div className="flex items-center gap-3 sm:gap-8">
                          <p className="shrink-0 whitespace-nowrap text-lg font-semibold text-gray-900 tabular-nums">{formatTzs(item.total)}</p>
                          <DeleteButton name={item.name} onConfirm={() => removeItem(item.id)} />
                        </div>
                      </div>
                    </div>
                    )
                  })}
                </CardContent>
              )}
            </Card>
          </div>

          {/* RIGHT — Coupon + Price details */}
          <div className="space-y-6">
            <Card className="w-full border-0 shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)]">
              <CardHeader className="gap-2">
                <CardTitle className="text-xl font-semibold">{t('coupon_title')}</CardTitle>
                <CardDescription className="text-base">{t('coupon_subtitle')}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleApplyCoupon} className="flex gap-2.5">
                  <Input type="text" placeholder={t('coupon_placeholder')} className="w-full" />
                  <Button type="submit" size="lg">
                    {t('coupon_apply')}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="w-full border-0 text-base shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)]">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">{t('price_title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('price_label')}</span>
                  <span className="font-medium tabular-nums">{formatTzs(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('discount_label')}</span>
                    <span className="font-medium tabular-nums">-{formatTzs(discount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t('delivery_label')}</span>
                  <span className="font-medium">{t('delivery_free')}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-lg font-semibold">
                  <span>{t('total_label')}</span>
                  <span className="tabular-nums">{formatTzs(total)}</span>
                </div>
              </CardContent>
              <CardContent className="flex flex-col items-start gap-3.5">
                <Link
                  href={items.length === 0 ? '#' : '/digital-cards/address'}
                  aria-disabled={items.length === 0}
                  className={`inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 py-3.5 text-[13px] font-extrabold uppercase tracking-[0.06em] transition ${
                    items.length === 0
                      ? 'pointer-events-none cursor-not-allowed bg-gray-200 text-gray-400'
                      : 'bg-(--accent) text-(--on-accent) hover:bg-(--accent-hover)'
                  }`}
                >
                  {t('checkout_cta')}
                  {items.length > 0 && <ArrowRight size={15} className="shrink-0" />}
                </Link>
                {/* For the couple who isn't the one paying: a priced document
                    they can send to a parent, a sponsor or a company. */}
                <button
                  type="button"
                  onClick={downloadQuotation}
                  disabled={items.length === 0 || quoteBusy}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-6 py-3 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-50 disabled:pointer-events-none disabled:text-gray-400"
                >
                  {quoteBusy ? (
                    <Loader2 size={15} className="shrink-0 animate-spin" />
                  ) : (
                    <FileText size={15} className="shrink-0" />
                  )}
                  {t('quote_cta')}
                </button>
                <p className="-mt-1 text-xs text-muted-foreground">{t('quote_hint')}</p>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <p className="text-muted-foreground">{t('we_accept')}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {PAYMENT_METHODS.map((method) => (
                      <PaymentLogo key={method.id} method={method} />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {items.length > 0 && (
              <p className="flex items-center justify-center gap-1.5 text-xs text-gray-600">
                <ShieldCheck size={13} className="text-emerald-600" />
                {t('secure_note')}
              </p>
            )}
          </div>
        </div>

        <ExploreMore products={products} fromGuestPrice={fromGuestPrice} perGuestLabel={perGuestLabel} perDesignLabel={perDesignLabel} fromLabel={fromLabel} />
      </div>

      {/* Mobile sticky checkout bar — shows item count + total and keeps the
          checkout action reachable without scrolling past every item. */}
      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
            <div className="leading-tight">
              <p className="text-[11px] text-muted-foreground">
                {items.length === 1
                  ? t('mobile_count_one', { n: items.length })
                  : t('mobile_count_other', { n: items.length })}
              </p>
              <p className="text-lg font-semibold tabular-nums text-gray-900">{formatTzs(total)}</p>
            </div>
            <Link
              href="/digital-cards/address"
              className="inline-flex flex-1 max-w-[58%] items-center justify-center gap-2 whitespace-nowrap rounded-full bg-(--accent) px-6 py-3 text-[13px] font-extrabold uppercase tracking-[0.06em] text-(--on-accent) transition hover:bg-(--accent-hover)"
            >
              {t('mobile_checkout')}
              <ArrowRight size={15} className="shrink-0" />
            </Link>
          </div>
        </div>
      )}
    </main>
  )
}
