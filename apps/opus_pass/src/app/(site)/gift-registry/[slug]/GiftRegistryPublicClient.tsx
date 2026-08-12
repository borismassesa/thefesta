'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import Image from 'next/image'
import { Check, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Gift, MapPin, Search, Star, Wallet, X } from 'lucide-react'
import { claimCatalogGift, claimGiftRegistryItem, type GiftClaimReceipt } from '@/lib/dashboard/actions'
import { formatGiftPrice } from '@/lib/dashboard/share'
import type { GiftRegistryItemWithClaims, PublicGiftRegistryPage } from '@/lib/dashboard/queries'
import { type CatalogGift } from '@/lib/dashboard/gift-catalog'
import { GIFT_REGISTRY_CATEGORIES } from '@/lib/dashboard/types'
import Logo from '@/components/ui/Logo'
import PoweredByLine from '@/components/ui/PoweredByLine'
import RegistryCheckoutSheet, { type BuyTarget } from './RegistryCheckoutSheet'

/** A product-backed gift the guest can buy outright (has a product + numeric price). */
function buyTargetOf(item: GiftRegistryItemWithClaims): BuyTarget | null {
  if (!item.product_id || !item.price_tzs) return null
  return {
    productId: item.product_id,
    name: item.title,
    image: item.image_urls[0] ?? '',
    priceTzs: item.price_tzs,
    registryItemId: item.id,
  }
}

// Restyled to match a dense storefront-style registry (Zola's manage/guest
// registry page): wide banner hero with an overlapping circular photo, a
// filter/sort toolbar, and a compact multi-column product grid — instead of
// the earlier wedding_website-editorial large-portrait card layout. We keep
// our own claim-by-name flow (no cart/checkout — no payment processing or
// product-catalog integration exists here) and add quantity-aware claiming:
// items asking for more than one unit can be claimed by several different
// guests, one unit each.
const INK = '#1A1A1A'
const SECONDARY = '#6b6b6b'
const BORDER = '#e5e5e5'
const SURFACE_CONTAINER = '#f7f7f7'
const ACCENT = '#C9A0DC' // OpusPass brand lavender — used sparingly (badges, active states)

const sans = { fontFamily: 'var(--font-montserrat), system-ui, sans-serif' }

type Lang = 'sw' | 'en'
const LANG_KEY = 'opuspass-gift-registry-lang'

const STR: Record<Lang, Record<string, string>> = {
  sw: {
    subtitle: 'Uwepo wako ni zawadi ya kutosha, lakini kama ungependa kutupa zawadi, hizi ni baadhi ya vitu tungependa.',
    day: 'siku',
    days: 'siku',
    left: 'zimebaki',
    gifts_count_one: 'zawadi 1',
    gifts_count_other: '{n} zawadi',
    view_item: 'Angalia bidhaa',
    claim: 'Nichukue Hii',
    claimed: 'Imechukuliwa',
    reserved: 'Imehifadhiwa',
    fully_claimed: 'Zimechukuliwa Zote',
    claim_title: 'Chukua zawadi hii',
    claim_body: 'Jina lako litaonekana kwa wenzi ili wajue nani wa kushukuru.',
    claim_body_multi: 'Unachukua kitengo kimoja kati ya {n} vinavyoombwa.',
    your_name: 'Jina lako',
    your_name_ph: 'Asha Juma',
    your_phone: 'Namba ya simu',
    your_phone_ph: '0712 345 678',
    your_phone_hint: 'Tutakutumia risiti ya wapi pa kununua zawadi hii.',
    your_email: 'Barua pepe (hiari)',
    your_email_ph: 'asha@mfano.com',
    confirm: 'Thibitisha',
    confirming: 'Inatuma…',
    cancel: 'Ghairi',
    error_name: 'Tafadhali jaza jina lako',
    error_phone: 'Tafadhali jaza namba sahihi ya simu',
    error_generic: 'Kuna hitilafu, tafadhali jaribu tena.',
    empty_title: 'Bado hakuna zawadi',
    empty_body: 'Wenye sherehe bado hawajaongeza zawadi kwenye orodha hii.',
    receipt_title: 'Umeichukua! 🎉',
    receipt_body: 'Tumetuma maelezo haya kwako pia.',
    receipt_where: 'Mahali pa kununua',
    receipt_shop: 'Duka',
    receipt_location: 'Eneo',
    receipt_contact: 'Mawasiliano',
    receipt_online: 'Nunua mtandaoni',
    receipt_no_info: 'Wenye sherehe hawajaweka maelezo ya mahali pa kununua bado — wasiliana nao moja kwa moja.',
    receipt_sent_email: 'Risiti imetumwa kwenye barua pepe yako.',
    receipt_sent_whatsapp: 'Risiti imetumwa WhatsApp.',
    receipt_close: 'Funga',
    done_title: 'Asante, {name}!',
    done_body: 'Wenye sherehe watajua umechukua zawadi hii.',
    powered: 'Inaendeshwa kwa {icon} na OpusPass',
    most_wanted: 'Inayotakiwa Zaidi',
    cash_fund: 'Mchango wa Fedha',
    asking_label: 'Wanaomba',
    purchased_label: 'Wamenunua',
    group_gift_hint: 'Wageni kadhaa wanaweza kuchangia pamoja kwa zawadi hii.',
    search_ph: 'Tafuta zawadi…',
    filter_all_categories: 'Kategoria zote',
    filter_all: 'Zawadi zote',
    filter_available: 'Bado zinapatikana',
    filter_reserved: 'Zimehifadhiwa',
    sort_newest: 'Mpya kwanza',
    sort_most_wanted: 'Zinazotakiwa zaidi kwanza',
    sort_price_low: 'Bei: chini kwenda juu',
    sort_price_high: 'Bei: juu kwenda chini',
    no_results: 'Hakuna zawadi zinazolingana',
    no_results_body: 'Jaribu kubadilisha utafutaji au vichujio.',
    shop_badge: 'Duka',
    shop_hint_line: 'Zawadi ya mshangao kutoka dukani',
    shop_claim_body: 'Zawadi hii itaongezwa kwenye orodha ya wenye sherehe ikiwa imechukuliwa na wewe.',
    buy: 'Nunua',
    bought_paid: 'Asante! Zawadi yako inakuja. 💚',
    bought_processing: 'Asante! Malipo yako yanahakikiwa — wenye sherehe wataona zawadi baada ya kuthibitishwa.',
  },
  en: {
    subtitle: "Your presence is present enough, but if you wish to give a gift, here are some things we'd love.",
    day: 'day',
    days: 'days',
    left: 'left',
    gifts_count_one: '1 gift',
    gifts_count_other: '{n} gifts',
    view_item: 'View item',
    claim: 'Claim',
    claimed: 'Claimed',
    reserved: 'Reserved',
    fully_claimed: 'Fully claimed',
    claim_title: 'Claim this gift',
    claim_body: 'Your name will be shown to the couple so they know who to thank.',
    claim_body_multi: "You're claiming 1 of {n} units the couple is asking for.",
    your_name: 'Your name',
    your_name_ph: 'Asha Juma',
    your_phone: 'Phone number',
    your_phone_ph: '0712 345 678',
    your_phone_hint: "We'll send you a receipt with where to buy this gift.",
    your_email: 'Email (optional)',
    your_email_ph: 'asha@example.com',
    confirm: 'Confirm',
    confirming: 'Sending…',
    cancel: 'Cancel',
    error_name: 'Please enter your name',
    error_phone: 'Please enter a valid phone number',
    error_generic: 'Something went wrong, please try again.',
    empty_title: 'No gifts yet',
    empty_body: "The couple hasn't added anything to their registry yet.",
    receipt_title: "You've claimed it! 🎉",
    receipt_body: "We've also sent these details to you.",
    receipt_where: 'Where to buy it',
    receipt_shop: 'Shop',
    receipt_location: 'Location',
    receipt_contact: 'Contact',
    receipt_online: 'Buy online',
    receipt_no_info: "The couple hasn't added purchase details yet — reach out to them directly.",
    receipt_sent_email: 'Receipt sent to your email.',
    receipt_sent_whatsapp: 'Receipt sent on WhatsApp.',
    receipt_close: 'Close',
    done_title: 'Thank you, {name}!',
    done_body: "The couple will know you've claimed this gift.",
    powered: 'Powered with {icon} by OpusPass',
    most_wanted: 'Most wanted',
    cash_fund: 'Cash fund',
    asking_label: 'Asking for',
    purchased_label: 'Purchased',
    group_gift_hint: 'A few guests can go in on this together.',
    search_ph: 'Search gifts…',
    filter_all_categories: 'Categories',
    filter_all: 'All gifts',
    filter_available: 'Still available',
    filter_reserved: 'Reserved',
    sort_newest: 'Featured',
    sort_most_wanted: 'Most wanted first',
    sort_price_low: 'Price: low to high',
    sort_price_high: 'Price: high to low',
    no_results: 'No gifts match',
    no_results_body: 'Try a different search or filter.',
    shop_badge: 'Shop',
    shop_hint_line: 'A surprise gift from the shop',
    shop_claim_body: "This gift will be added to the couple's registry, claimed by you.",
    buy: 'Buy',
    bought_paid: 'Thank you! Your gift is on its way. 💚',
    bought_processing: "Thank you! Your payment is under review — the couple will see your gift once it's confirmed.",
  },
}

function Navbar({ lang, onPickLang }: { lang: Lang; onPickLang: (l: Lang) => void }) {
  return (
    <nav className="w-full shrink-0 border-b bg-white" style={{ borderColor: BORDER }}>
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-6 sm:px-8">
        <Logo />
        <div className="inline-flex overflow-hidden rounded-full text-[11px] font-bold" style={{ border: `1px solid ${BORDER}` }}>
          {(['en', 'sw'] as Lang[]).map((l) => (
            <button data-opus-button="control"
              key={l}
              onClick={() => onPickLang(l)}
              className="px-3 py-1.5 uppercase tracking-wide transition-colors"
              style={lang === l ? { ...sans, backgroundColor: INK, color: '#fff' } : { ...sans, color: SECONDARY }}
              aria-pressed={lang === l}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}

/** Days remaining until an ISO date (DATE column), or null if unset/past. Mirrors the dashboard hero's daysUntil. */
function daysUntil(value: string | null): number | null {
  if (!value) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(value)
  due.setHours(0, 0, 0, 0)
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  return days >= 0 ? days : null
}

/** "February 24, 2027" — matches the dashboard hero's exact date format. */
function formatHeroDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// Mirrors the dashboard hero (GiftRegistryManager.tsx) pixel-for-pixel —
// same container radius, banner height, gradient, avatar-straddling-the-edge
// positioning, and message spacing — minus the couple-only "Customize"
// affordance, which doesn't apply to a guest viewing this page.
function Hero({ data, t }: { data: PublicGiftRegistryPage; t: Record<string, string> }) {
  const header = data.registryHeader || data.coupleName
  const heroDate = formatHeroDate(data.weddingDate)
  const daysLeft = daysUntil(data.weddingDate)
  return (
    <div className="mx-auto mt-6 w-full max-w-[1440px] px-6 sm:px-8">
      <div className="relative overflow-hidden rounded-3xl bg-black/[0.04]">
        <div className="relative flex h-56 w-full flex-col items-center justify-center px-6 text-center sm:h-64">
          {data.registryBannerImageUrl ? (
            <div className="absolute inset-0 overflow-hidden rounded-t-3xl">
              <Image
                src={data.registryBannerImageUrl}
                alt=""
                fill
                sizes="(min-width: 1024px) 1200px, 100vw"
                className="object-cover"
                priority
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(rgba(0,0,0,0.15), rgba(0,0,0,0.35))' }} />
            </div>
          ) : null}

          <h1
            className="relative text-3xl font-bold tracking-tight sm:text-4xl"
            style={{ ...sans, color: data.registryBannerImageUrl ? '#fff' : INK }}
          >
            {header}
          </h1>
          {heroDate ? (
            <p
              className="relative mt-2 text-sm font-semibold"
              style={{ ...sans, color: data.registryBannerImageUrl ? 'rgba(255,255,255,0.85)' : SECONDARY }}
            >
              {heroDate}
              {daysLeft !== null ? ` (${daysLeft} ${daysLeft === 1 ? t.day : t.days} ${t.left})` : ''}
            </p>
          ) : null}

          {data.registryCoverImageUrl ? (
            <div className="absolute -bottom-10 left-1/2 z-10 h-20 w-20 -translate-x-1/2 overflow-hidden rounded-full border-4 border-white bg-white shadow-md">
              <Image src={data.registryCoverImageUrl} alt="" fill sizes="80px" className="object-cover" />
            </div>
          ) : null}
        </div>

        <div className="rounded-b-3xl bg-white px-6 pb-8 pt-16 text-center">
          <p className="mx-auto max-w-xl text-sm leading-relaxed" style={{ ...sans, color: SECONDARY }}>
            {data.registryWelcomeMessage || t.subtitle}
          </p>
        </div>
      </div>
    </div>
  )
}

/** What the guest sees once a claim succeeds — where to buy the gift, and
 *  confirmation of which channels the same info was sent through. Shown
 *  inline in the modal instead of just a toast, since this is the one place
 *  a guest reliably sees the shop details before they go and buy the gift. */
function ClaimReceiptView({
  item,
  receipt,
  t,
  onClose,
}: {
  item: GiftRegistryItemWithClaims
  receipt: GiftClaimReceipt
  t: Record<string, string>
  onClose: () => void
}) {
  const hasShop = Boolean(item.shop_name || item.shop_location || item.shop_contact)
  return (
    <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-white p-8 shadow-2xl sm:rounded-2xl">
      <button data-opus-button="control"
        type="button"
        onClick={onClose}
        aria-label={t.receipt_close}
        className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-[#1A1A1A]/45 hover:bg-black/[0.05]"
      >
        <X className="h-4 w-4" />
      </button>
      <h3 className="pr-8 text-xl font-bold" style={{ ...sans, color: INK }}>
        {t.receipt_title}
      </h3>
      <p className="mt-1 text-sm font-medium" style={{ ...sans, color: SECONDARY }}>
        {item.title}
      </p>

      <div className="mt-5 rounded-2xl p-4" style={{ backgroundColor: SURFACE_CONTAINER }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ ...sans, color: SECONDARY }}>
          {t.receipt_where}
        </p>
        {hasShop ? (
          <div className="mt-2 space-y-1 text-sm" style={{ ...sans, color: INK }}>
            {item.shop_name ? (
              <p>
                <span className="font-semibold">{t.receipt_shop}:</span> {item.shop_name}
              </p>
            ) : null}
            {item.shop_location ? (
              <p>
                <span className="font-semibold">{t.receipt_location}:</span> {item.shop_location}
              </p>
            ) : null}
            {item.shop_contact ? (
              <p>
                <span className="font-semibold">{t.receipt_contact}:</span> {item.shop_contact}
              </p>
            ) : null}
          </div>
        ) : item.product_link ? (
          <a
            href={item.product_link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm font-semibold underline-offset-2 hover:underline"
            style={{ ...sans, color: ACCENT }}
          >
            {t.receipt_online} <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <p className="mt-2 text-sm" style={{ ...sans, color: SECONDARY }}>
            {t.receipt_no_info}
          </p>
        )}
      </div>

      {receipt.guestEmailSent || receipt.guestWhatsAppSent ? (
        <p className="mt-4 text-xs" style={{ ...sans, color: SECONDARY }}>
          {[receipt.guestEmailSent ? t.receipt_sent_email : null, receipt.guestWhatsAppSent ? t.receipt_sent_whatsapp : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : (
        <p className="mt-4 text-xs" style={{ ...sans, color: SECONDARY }}>
          {t.receipt_body}
        </p>
      )}

      <button data-opus-button="control"
        type="button"
        onClick={onClose}
        className="mt-6 w-full rounded-full py-3 text-xs font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-90"
        style={{ ...sans, backgroundColor: ACCENT, color: INK }}
      >
        {t.receipt_close}
      </button>
    </div>
  )
}

function ClaimModal({
  item,
  catalogId,
  slug,
  lang,
  t,
  onClose,
  onClaimed,
}: {
  item: GiftRegistryItemWithClaims
  /** Set when the guest is buying a shop-catalog gift the couple never added —
   *  the claim then creates the registry item (already claimed) via claimCatalogGift. */
  catalogId?: string
  slug: string
  lang: Lang
  t: Record<string, string>
  onClose: () => void
  onClaimed: (name: string, createdItemId?: string) => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<GiftClaimReceipt | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return setError(t.error_name)
    if (!phone.trim()) return setError(t.error_phone)
    setError(null)
    startTransition(async () => {
      let createdItemId: string | undefined
      let res: { ok: boolean; error?: string; receipt?: GiftClaimReceipt }
      if (catalogId) {
        const catalogRes = await claimCatalogGift(slug, catalogId, trimmed, phone.trim(), email.trim() || null, lang)
        createdItemId = catalogRes.itemId
        res = catalogRes
      } else {
        res = await claimGiftRegistryItem(slug, item.id, trimmed, phone.trim(), email.trim() || null, lang)
      }
      if (res.ok) {
        onClaimed(trimmed, createdItemId)
        if (res.receipt) setReceipt(res.receipt)
        else onClose()
      } else {
        setError(res.error ?? t.error_generic)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {receipt ? (
        <ClaimReceiptView item={item} receipt={receipt} t={t} onClose={onClose} />
      ) : (
        <form onSubmit={onSubmit} className="relative z-10 w-full max-w-md rounded-t-3xl bg-white p-8 shadow-2xl sm:rounded-2xl">
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            aria-label={t.cancel}
            className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-[#1A1A1A]/45 hover:bg-black/[0.05]"
          >
            <X className="h-4 w-4" />
          </button>
          <h3 className="pr-8 text-xl font-bold" style={{ ...sans, color: INK }}>
            {t.claim_title}
          </h3>
          <p className="mt-2 text-sm font-medium" style={{ ...sans, color: SECONDARY }}>
            {item.title}
          </p>
          <p className="mt-3 text-sm leading-relaxed" style={{ ...sans, color: SECONDARY }}>
            {catalogId
              ? t.shop_claim_body
              : item.quantity_requested > 1
                ? t.claim_body_multi.replace('{n}', String(item.quantity_requested))
                : t.claim_body}
          </p>
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em]" style={{ ...sans, color: SECONDARY }}>
                {t.your_name}
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder={t.your_name_ph}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ ...sans, color: INK, border: `1.5px solid ${BORDER}` }}
              />
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em]" style={{ ...sans, color: SECONDARY }}>
                {t.your_phone}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={20}
                placeholder={t.your_phone_ph}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ ...sans, color: INK, border: `1.5px solid ${BORDER}` }}
              />
              <p className="mt-1.5 text-xs" style={{ ...sans, color: SECONDARY }}>
                {t.your_phone_hint}
              </p>
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em]" style={{ ...sans, color: SECONDARY }}>
                {t.your_email}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
                placeholder={t.your_email_ph}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ ...sans, color: INK, border: `1.5px solid ${BORDER}` }}
              />
            </div>
          </div>
          {error ? (
            <p className="mt-3 text-[13px]" style={{ ...sans, color: '#B3261E' }}>
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex gap-3">
            <button data-opus-button="control"
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full py-3 text-xs font-bold uppercase tracking-widest"
              style={{ ...sans, border: `1.5px solid ${BORDER}`, color: SECONDARY }}
            >
              {t.cancel}
            </button>
            <button data-opus-button="primary" data-opus-button-size="large"
              type="submit"
              disabled={pending}
              className="flex-1 rounded-full py-3 text-xs font-bold uppercase tracking-widest transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ ...sans, backgroundColor: ACCENT, color: INK }}
            >
              {pending ? t.confirming : t.confirm}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

type Availability = 'all' | 'available' | 'reserved'
type SortKey = 'newest' | 'most_wanted' | 'price_low' | 'price_high'

/** Best-effort numeric read of a free-text price label (e.g. "TZS 250,000" → 250000), for sorting only. */
function parsePriceNumber(label: string | null): number | null {
  if (!label) return null
  const digits = label.replace(/[^\d]/g, '')
  return digits ? parseInt(digits, 10) : null
}

function FilterSelect({
  value,
  onChange,
  children,
  active,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
  /** Highlights the pill (accent border + tint) once the filter is off its default value. */
  active?: boolean
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-full py-2 pl-3.5 pr-8 text-xs font-semibold outline-none transition-colors"
        style={
          active
            ? { ...sans, border: `1.5px solid ${ACCENT}`, color: INK, backgroundColor: `${ACCENT}26` }
            : { ...sans, border: `1.5px solid ${BORDER}`, color: INK, backgroundColor: '#fff' }
        }
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: SECONDARY }} />
    </div>
  )
}

type MediaSlide = { kind: 'photo'; url: string } | { kind: 'video'; url: string }

function mediaSlides(item: Pick<GiftRegistryItemWithClaims, 'image_urls' | 'video_url'>): MediaSlide[] {
  const slides: MediaSlide[] = item.image_urls.map((url) => ({ kind: 'photo' as const, url }))
  if (item.video_url) slides.push({ kind: 'video', url: item.video_url })
  return slides
}

// Same self-contained carousel pattern as opus_website's vendor listing-card
// carousel — hover arrows, dot indicators, touch swipe, no external library.
function GiftCardMedia({ item, claimed, title }: { item: GiftRegistryItemWithClaims; claimed: boolean; title: string }) {
  const slides = mediaSlides(item)
  const [idx, setIdx] = useState(0)
  const dragStart = useRef<number | null>(null)

  const prev = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIdx((i) => (i - 1 + slides.length) % slides.length)
  }
  const next = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIdx((i) => (i + 1) % slides.length)
  }
  const onTouchStart = (e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientX
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (dragStart.current === null) return
    const diff = dragStart.current - e.changedTouches[0].clientX
    if (diff > 40) setIdx((i) => (i + 1) % slides.length)
    else if (diff < -40) setIdx((i) => (i - 1 + slides.length) % slides.length)
    dragStart.current = null
  }

  if (slides.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: SURFACE_CONTAINER, color: `${SECONDARY}80` }}>
        <Gift className="h-8 w-8" />
      </div>
    )
  }

  const slide = slides[idx]

  return (
    <div className="group/media relative h-full w-full" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {slide.kind === 'video' ? (
        <video
          src={slide.url}
          className={`h-full w-full object-cover bg-black ${claimed ? 'grayscale' : ''}`}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
        />
      ) : (
        <Image
          src={slide.url}
          alt={title}
          fill
          sizes="(min-width: 1280px) 260px, (min-width: 768px) 30vw, 45vw"
          className={`object-cover transition-transform duration-500 ${claimed ? 'grayscale' : 'group-hover:scale-105'}`}
        />
      )}

      {slides.length > 1 ? (
        <>
          <button data-opus-button="control"
            onClick={prev}
            aria-label="Previous media"
            className="absolute left-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-sm transition-opacity hover:bg-white group-hover/media:opacity-100"
          >
            <ChevronLeft className="h-3 w-3" style={{ color: INK }} />
          </button>
          <button data-opus-button="control"
            onClick={next}
            aria-label="Next media"
            className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-sm transition-opacity hover:bg-white group-hover/media:opacity-100"
          >
            <ChevronRight className="h-3 w-3" style={{ color: INK }} />
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {slides.map((_, i) => (
              <button data-opus-button="control"
                key={i}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIdx(i)
                }}
                aria-label={`Go to media ${i + 1}`}
                className={`h-1 rounded-full transition-all ${i === idx ? 'w-3 bg-white' : 'w-1 bg-white/60'}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

function GiftCard({
  item,
  t,
  onOpenClaim,
  onOpenBuy,
}: {
  item: GiftRegistryItemWithClaims
  t: Record<string, string>
  onOpenClaim: () => void
  onOpenBuy: () => void
}) {
  const fullyClaimed = item.claimedCount >= item.quantity_requested
  const remaining = Math.max(item.quantity_requested - item.claimedCount, 0)
  // Product-backed gifts are bought outright (real price + fulfillment);
  // custom / cash gifts keep the claim-by-name flow.
  const buyable = Boolean(item.product_id && item.price_tzs)
  return (
    <div className="group flex flex-col">
      <div className="relative aspect-square overflow-hidden rounded-lg" style={{ border: `1px solid ${BORDER}` }}>
        <GiftCardMedia item={item} claimed={fullyClaimed} title={item.title} />
        {(item.most_wanted || item.is_cash_fund) ? (
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {item.most_wanted ? (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                style={{ ...sans, backgroundColor: '#9FE870', color: '#3f6b1f' }}
              >
                <Star className="h-2.5 w-2.5 fill-current" /> {t.most_wanted}
              </span>
            ) : null}
            {item.is_cash_fund ? (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                style={{ ...sans, backgroundColor: ACCENT, color: INK }}
              >
                <Wallet className="h-2.5 w-2.5" /> {t.cash_fund}
              </span>
            ) : null}
          </div>
        ) : null}
        {fullyClaimed ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-[1px]">
            <span
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide shadow-sm"
              style={{ ...sans, color: INK }}
            >
              <CheckCircle className="h-3 w-3" /> {t.reserved}
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        {item.category ? (
          <p className="text-[13px]" style={{ ...sans, color: SECONDARY }}>
            {item.category}
          </p>
        ) : null}
        <h3 className="mt-0.5 line-clamp-2 text-[15px] font-bold leading-snug" style={{ ...sans, color: INK }}>
          {item.title}
        </h3>
        {item.price_label ? (
          <p className="mt-1 text-[15px] font-semibold" style={{ ...sans, color: INK }}>
            {formatGiftPrice(item.price_label)}
          </p>
        ) : null}
        {item.shop_name ? (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium" style={{ ...sans, color: SECONDARY }}>
            <MapPin className="h-2.5 w-2.5 shrink-0" /> {item.shop_name}
          </p>
        ) : item.product_link ? (
          <a
            href={item.product_link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold underline-offset-2 hover:underline"
            style={{ ...sans, color: SECONDARY }}
          >
            {t.view_item} <ExternalLink className="h-2.5 w-2.5" />
          </a>
        ) : null}
        {item.group_gift ? (
          <p className="mt-1 text-[11px] leading-snug" style={{ ...sans, color: SECONDARY }}>
            {t.group_gift_hint}
          </p>
        ) : null}

        <div className="mt-2.5 flex-1" />

        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-medium"
            style={{ ...sans, border: `1.5px solid ${BORDER}`, color: INK }}
          >
            {remaining}
          </div>
          <button data-opus-button="control"
            onClick={buyable ? onOpenBuy : onOpenClaim}
            disabled={fullyClaimed}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition-colors"
            style={
              fullyClaimed
                ? { ...sans, backgroundColor: '#9FE870', color: '#3f6b1f', cursor: 'not-allowed' }
                : { ...sans, backgroundColor: ACCENT, color: INK, cursor: 'pointer' }
            }
          >
            {fullyClaimed ? (
              <>
                <CheckCircle className="h-3.5 w-3.5" /> {t.reserved}
              </>
            ) : buyable ? (
              t.buy
            ) : (
              t.claim
            )}
          </button>
        </div>
        <p className="mt-2 text-[12px]" style={{ ...sans, color: SECONDARY }}>
          {t.asking_label} {item.quantity_requested}&nbsp;&nbsp;{t.purchased_label} {item.claimedCount}
        </p>
      </div>
    </div>
  )
}

/** A shop-catalog gift viewed as a registry item — feeds the shared ClaimModal
 *  (title/price/shop rows and the post-claim receipt view all read item fields). */
function catalogToItem(g: CatalogGift): GiftRegistryItemWithClaims {
  return {
    id: `catalog-${g.id}`,
    title: g.title,
    description: g.description,
    image_urls: [g.image],
    video_url: null,
    price_label: g.priceLabel,
    product_link: null,
    shop_name: g.shopName,
    shop_location: g.shopLocation,
    shop_contact: null,
    category: g.category,
    quantity_requested: 1,
    most_wanted: false,
    group_gift: false,
    is_cash_fund: g.priceLabel.trim().toLowerCase() === 'any amount',
    event_id: null,
    product_id: g.productId ?? null,
    price_tzs: g.priceTzs ?? null,
    claimed_by_name: null,
    claimed_by_phone: null,
    claimed_by_email: null,
    claimed_at: null,
    claimedCount: 0,
    claimants: [],
    sort_order: 0,
    created_at: '',
    updated_at: '',
  }
}

/** Same card design as GiftCard, for a shop gift the couple hasn't added —
 *  guests can buy it as a surprise; claiming adds it to the couple's registry. */
function ShopGiftCard({ gift, t, onOpenBuy }: { gift: CatalogGift; t: Record<string, string>; onOpenBuy: () => void }) {
  return (
    <div className="group flex flex-col">
      <div className="relative aspect-square overflow-hidden rounded-lg" style={{ border: `1px solid ${BORDER}` }}>
        <Image
          src={gift.image}
          alt={gift.title}
          fill
          sizes="(min-width: 1280px) 260px, (min-width: 768px) 30vw, 45vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span
          className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide shadow-sm"
          style={{ ...sans, color: SECONDARY }}
        >
          {t.shop_badge}
        </span>
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        <p className="text-[13px]" style={{ ...sans, color: SECONDARY }}>
          {gift.category}
        </p>
        <h3 className="mt-0.5 line-clamp-2 text-[15px] font-bold leading-snug" style={{ ...sans, color: INK }}>
          {gift.title}
        </h3>
        <p className="mt-1 text-[15px] font-semibold" style={{ ...sans, color: INK }}>
          {formatGiftPrice(gift.priceLabel)}
        </p>
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium" style={{ ...sans, color: SECONDARY }}>
          <MapPin className="h-2.5 w-2.5 shrink-0" /> {gift.shopName}
        </p>

        <div className="mt-2.5 flex-1" />

        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-medium"
            style={{ ...sans, border: `1.5px solid ${BORDER}`, color: INK }}
          >
            1
          </div>
          <button data-opus-button="control"
            onClick={onOpenBuy}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition-colors"
            style={{ ...sans, backgroundColor: ACCENT, color: INK, cursor: 'pointer' }}
          >
            {t.buy}
          </button>
        </div>
        <p className="mt-2 text-[12px]" style={{ ...sans, color: SECONDARY }}>
          {t.shop_hint_line}
        </p>
      </div>
    </div>
  )
}

export default function GiftRegistryPublicClient({
  data,
  catalog,
  hideNav,
}: {
  data: PublicGiftRegistryPage
  /** Live vendor products (fetchCatalogProducts) that guests can buy as
   *  surprise gifts even when the couple never added them. Omitted by the
   *  Zambarau website-builder embed, which shows only the couple's own list. */
  catalog?: CatalogGift[]
  /** Zambarau embeds this page directly under its own nav (logo + EN/SW
   *  toggle already there) and above its own footer — skip this page's own
   *  Navbar and footer to avoid duplicates stacked around it. */
  hideNav?: boolean
}) {
  const shopCatalog = catalog ?? []
  const [lang, setLang] = useState<Lang>('sw')
  const [items, setItems] = useState(data.items)
  const [claimTarget, setClaimTarget] = useState<{ item: GiftRegistryItemWithClaims; catalogId?: string } | null>(null)
  const [buyTarget, setBuyTarget] = useState<BuyTarget | null>(null)
  const [boughtMsg, setBoughtMsg] = useState<string | null>(null)
  const [justClaimedName, setJustClaimedName] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterAvailability, setFilterAvailability] = useState<Availability>('all')
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const t = STR[lang]

  useEffect(() => {
    const saved = window.localStorage.getItem(LANG_KEY)
    if (saved === 'en' || saved === 'sw') setLang(saved)
  }, [])
  function pickLang(next: Lang) {
    setLang(next)
    window.localStorage.setItem(LANG_KEY, next)
  }

  const visibleItems = items
    .filter((i) => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return i.title.toLowerCase().includes(q) || (i.description ?? '').toLowerCase().includes(q)
    })
    .filter((i) => filterCategory === 'all' || i.category === filterCategory)
    .filter((i) => {
      const fullyClaimed = i.claimedCount >= i.quantity_requested
      if (filterAvailability === 'available') return !fullyClaimed
      if (filterAvailability === 'reserved') return fullyClaimed
      return true
    })
    .slice()
    .sort((a, b) => {
      if (sortKey === 'most_wanted') return Number(b.most_wanted) - Number(a.most_wanted)
      if (sortKey === 'price_low' || sortKey === 'price_high') {
        const pa = parsePriceNumber(a.price_label)
        const pb = parsePriceNumber(b.price_label)
        if (pa === null && pb === null) return 0
        if (pa === null) return 1
        if (pb === null) return -1
        return sortKey === 'price_low' ? pa - pb : pb - pa
      }
      // 'newest' still leads with most-wanted picks, same as before this filter bar existed.
      return Number(b.most_wanted) - Number(a.most_wanted)
    })

  // Shop-catalog gifts guests can buy even though the couple never added them —
  // same search/category filters as the registry list, deduped by title against
  // it (once bought, the gift lives in `items` and drops out of the shop), and
  // hidden under the "reserved" availability filter (shop gifts are never reserved).
  // Dedupe the shop against gifts already on the registry by product id (the
  // couple added this product) — falling back to title for any legacy items.
  const ownedProductIds = new Set(items.map((i) => i.product_id).filter(Boolean) as string[])
  const ownedTitles = new Set(items.map((i) => i.title.trim().toLowerCase()))
  const visibleShop =
    filterAvailability === 'reserved'
      ? []
      : shopCatalog.filter((g) => {
          if (g.productId && ownedProductIds.has(g.productId)) return false
          if (ownedTitles.has(g.title.trim().toLowerCase())) return false
          if (filterCategory !== 'all' && g.category !== filterCategory) return false
          const q = search.trim().toLowerCase()
          if (!q) return true
          return g.title.toLowerCase().includes(q) || g.description.toLowerCase().includes(q)
        })

  function onBought(result: { status: 'paid' | 'processing' }) {
    // Optimistically reserve a listed gift that was just bought so it flips to
    // "reserved" without waiting for the revalidation round-trip.
    const boughtItemId = buyTarget?.registryItemId
    if (result.status === 'paid' && boughtItemId) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === boughtItemId ? { ...i, claimedCount: Math.max(i.claimedCount, 1), claimed_at: new Date().toISOString() } : i,
        ),
      )
    }
    setBuyTarget(null)
    setBoughtMsg(result.status === 'paid' ? t.bought_paid : t.bought_processing)
    setTimeout(() => setBoughtMsg(null), 6000)
  }

  function onClaimed(name: string, createdItemId?: string) {
    if (!claimTarget) return
    if (claimTarget.catalogId && createdItemId) {
      // Shop purchase — the action just created the (already-claimed) registry
      // row; surface it in the couple's list so the shop card dedupes away.
      const now = new Date().toISOString()
      setItems((prev) => [
        ...prev,
        { ...claimTarget.item, id: createdItemId, claimed_by_name: name, claimed_at: now, claimedCount: 1, created_at: now, updated_at: now },
      ])
    } else {
      const id = claimTarget.item.id
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? i.quantity_requested > 1
              ? { ...i, claimedCount: i.claimedCount + 1 }
              : { ...i, claimed_by_name: name, claimed_at: new Date().toISOString(), claimedCount: 1 }
            : i,
        ),
      )
    }
    setJustClaimedName(name)
    // Deliberately NOT clearing claimTarget here — the modal switches to its
    // own receipt view (shop info + what was sent) and stays open until the
    // guest dismisses it themselves via ClaimReceiptView's onClose.
    setTimeout(() => setJustClaimedName(null), 4000)
  }

  const totalListed = items.length + visibleShop.length
  const giftsCountLabel = totalListed === 1 ? t.gifts_count_one : t.gifts_count_other.replace('{n}', String(totalListed))

  return (
    <main className="flex min-h-screen flex-col bg-white" style={{ ...sans, color: INK }}>
      {!hideNav && <Navbar lang={lang} onPickLang={pickLang} />}
      <Hero data={data} t={t} />

      <div className="mx-auto w-full max-w-[1440px] flex-1 px-6 pb-16 pt-8 sm:px-8">
        {items.length === 0 && visibleShop.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl py-20 text-center" style={{ backgroundColor: SURFACE_CONTAINER }}>
            <p className="text-xl font-bold" style={{ ...sans, color: INK }}>
              {t.empty_title}
            </p>
            <p className="text-sm" style={{ ...sans, color: SECONDARY }}>
              {t.empty_body}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <FilterSelect value={filterCategory} onChange={setFilterCategory} active={filterCategory !== 'all'}>
                  <option value="all">{t.filter_all_categories}</option>
                  {GIFT_REGISTRY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </FilterSelect>
                <FilterSelect
                  value={filterAvailability}
                  onChange={(v) => setFilterAvailability(v as Availability)}
                  active={filterAvailability !== 'all'}
                >
                  <option value="all">{t.filter_all}</option>
                  <option value="available">{t.filter_available}</option>
                  <option value="reserved">{t.filter_reserved}</option>
                </FilterSelect>
              </div>

              <span className="text-xs font-medium" style={{ ...sans, color: SECONDARY }}>
                {giftsCountLabel}
              </span>

              <div className="ml-auto flex items-center gap-2">
                <div className="relative w-40 sm:w-52">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: SECONDARY }} />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t.search_ph}
                    className="w-full rounded-full py-2 pl-8 pr-3 text-xs outline-none"
                  />
                </div>
                <FilterSelect value={sortKey} onChange={(v) => setSortKey(v as SortKey)}>
                  <option value="newest">{t.sort_newest}</option>
                  <option value="most_wanted">{t.sort_most_wanted}</option>
                  <option value="price_low">{t.sort_price_low}</option>
                  <option value="price_high">{t.sort_price_high}</option>
                </FilterSelect>
              </div>
            </div>

            {visibleItems.length === 0 && visibleShop.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl py-20 text-center" style={{ backgroundColor: SURFACE_CONTAINER }}>
                <p className="text-xl font-bold" style={{ ...sans, color: INK }}>
                  {t.no_results}
                </p>
                <p className="text-sm" style={{ ...sans, color: SECONDARY }}>
                  {t.no_results_body}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {visibleItems.map((item) => (
                  <GiftCard
                    key={item.id}
                    item={item}
                    t={t}
                    onOpenClaim={() => setClaimTarget({ item })}
                    onOpenBuy={() => {
                      const target = buyTargetOf(item)
                      if (target) setBuyTarget(target)
                    }}
                  />
                ))}
                {visibleShop.map((gift) => (
                  <ShopGiftCard
                    key={gift.id}
                    gift={gift}
                    t={t}
                    onOpenBuy={() =>
                      gift.productId && gift.priceTzs
                        ? setBuyTarget({ productId: gift.productId, name: gift.title, image: gift.image, priceTzs: gift.priceTzs })
                        : setClaimTarget({ item: catalogToItem(gift), catalogId: gift.id })
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {!hideNav && (
        <footer
          className="flex w-full shrink-0 flex-col items-center gap-2 border-t px-6 py-8 text-center"
          style={{ borderColor: BORDER, color: INK }}
        >
          <p className="text-[15px]" style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}>
            {data.coupleName}
          </p>
          <PoweredByLine text={t.powered} className="text-[11px] uppercase tracking-[0.2em] opacity-60" />
        </footer>
      )}

      {claimTarget ? (
        <ClaimModal
          item={claimTarget.item}
          catalogId={claimTarget.catalogId}
          slug={data.slug}
          lang={lang}
          t={t}
          onClose={() => setClaimTarget(null)}
          onClaimed={onClaimed}
        />
      ) : null}

      {buyTarget ? (
        <RegistryCheckoutSheet
          target={buyTarget}
          slug={data.slug}
          lang={lang}
          onClose={() => setBuyTarget(null)}
          onDone={onBought}
        />
      ) : null}

      {boughtMsg ? (
        <div
          className="fixed bottom-6 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded-2xl px-6 py-3 text-center text-sm font-semibold shadow-lg"
          style={{ ...sans, backgroundColor: INK, color: '#fff' }}
        >
          {boughtMsg}
        </div>
      ) : null}

      {justClaimedName ? (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-6 py-3 text-sm font-semibold shadow-lg"
          style={{ ...sans, backgroundColor: INK, color: '#fff' }}
        >
          <span className="inline-flex items-center gap-2">
            <Check className="h-4 w-4" style={{ color: '#9FE870' }} />
            {t.done_title.replace('{name}', justClaimedName)}
          </span>
        </div>
      ) : null}
    </main>
  )
}
