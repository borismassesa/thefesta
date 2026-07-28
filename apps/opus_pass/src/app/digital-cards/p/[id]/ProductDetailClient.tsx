'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  ArrowRight, Award, Check, ChevronDown, ChevronRight, Crown, Diamond, Flame, Gem, Heart,
  PartyPopper, Sparkles, Star, Zap, type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'
import { InvitationVisual } from '@/components/guests/InvitationVisual'
import { useFavorites } from '@/components/providers/FavoritesProvider'
import { DesignCarousel } from '@/components/guests/DesignCarousel'
import type { CatalogProduct } from '@/data/digital-cards-products'
import ProductBadgePill from '@/components/digital-cards/ProductBadge'
import type { PackagesContent, TierBadgeIcon, TierBadgeTone } from '@/lib/cms/packages'
import { packageFromPrice } from '@/lib/cms/packages-pricing'
import type { AddOn, FaqItem, ProductAddonsFaqContent } from '@/lib/cms/product-addons-faq'
import { buildItemSummary, useCart } from '@/components/providers/CartProvider'

// Pricing model:
//   • Digital suite — `tier.price_per_guest × digitalQty` (per-guest package: Essential/Classic/Elegant/Signature)
//   • Add-ons       — an open-ended, admin-editable list (see AddOn in
//                     lib/cms/product-addons-faq.ts). Each one is 'flat' (one
//                     fee per event), 'per_unit' (priced with a quantity
//                     stepper), or 'quote' (priced on a call, never added to
//                     the order total). An add-on can also be bundled free
//                     into specific package tiers (`includedInTierIds`).

// Admin-chosen badge icon → lucide component. 'none' renders a text-only pill.
const TIER_BADGE_ICON: Record<TierBadgeIcon, LucideIcon | null> = {
  none: null,
  sparkles: Sparkles,
  star: Star,
  diamond: Diamond,
  crown: Crown,
  gem: Gem,
  heart: Heart,
  award: Award,
  zap: Zap,
  flame: Flame,
  party: PartyPopper,
}

// Pill colour theme chosen per tier.
const TIER_BADGE_TONE: Record<TierBadgeTone, string> = {
  slate: 'bg-[#475569] text-white',
  accent: 'bg-[var(--accent)] text-[var(--on-accent)]',
  gold: 'bg-gradient-to-b from-[#E6C66E] to-[#C9A84C] text-[#3A2C06]',
}

// Per-tier pastel card palette for the package selector, keyed by stable tier id.
// slate = Essential, lavender = Classic, blush = Elegant, gold = Signature.
// `bg` is the resting card fill, `active` the selected ring/border, `border` the
// idle border + hover. Unknown ids fall back to slate.
const TIER_PILL: Record<string, { bg: string; active: string; border: string }> = {
  lite: { bg: 'bg-[#E1E8F0]', active: 'border-[#475569] ring-[#475569]', border: 'border-[#D3DBE5] hover:border-[#9FB0C2]' },
  classic: { bg: 'bg-[#ECDDF7]', active: 'border-[#B98FD6] ring-[#B98FD6]', border: 'border-[#E3D2F2] hover:border-[#C9A0DC]' },
  elegant: { bg: 'bg-[#F4E3EC]', active: 'border-[#C98BA8] ring-[#C98BA8]', border: 'border-[#ECD3DF] hover:border-[#DCAFC4]' },
  signature: { bg: 'bg-[#F5E7BF]', active: 'border-[#C9A84C] ring-[#C9A84C]', border: 'border-[#EBDCAE] hover:border-[#D6BC72]' },
}
const TIER_PILL_DEFAULT = TIER_PILL.lite

// Product descriptions authored in the admin are rich HTML (TipTap); older ones
// are plain text. Detect HTML so each is rendered appropriately.
const containsHtml = (s: string): boolean => /<\/?[a-z][\s\S]*?>/i.test(s)

// Up-to-two-letter initials from the designer name for the avatar fallback.
// Category eyebrow + product name. Rendered twice with responsive visibility:
// above the preview on mobile, in the right column on desktop — so the title
// always leads on phones.
function TitleBlock({ product, className }: { product: CatalogProduct; className?: string }) {
  const { isFavorite, toggle } = useFavorites()
  const favourited = isFavorite(product.id)
  return (
    <div className={className}>
      <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-gray-500 mb-2">{product.category}</p>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl md:text-3xl lg:text-[34px] font-serif font-medium text-gray-900 leading-tight">
          {product.name}
        </h1>
        <button
          type="button"
          onClick={() => toggle(product.id)}
          aria-label={favourited ? 'Remove from saved designs' : 'Save this design'}
          aria-pressed={favourited}
          className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#1A1A1A]/12 bg-white transition-colors hover:bg-[#1A1A1A]/5"
        >
          <Heart className={cn('h-5 w-5', favourited ? 'fill-red-500 text-red-500' : 'text-[#1A1A1A]')} />
        </button>
      </div>
    </div>
  )
}

// Strip tags for a safe, escaped plain-text fallback (used during SSR before the
// client-side sanitizer runs). Rendered as React text, so it's never injected.
const stripTags = (s: string): string => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

// Description clamp applies below lg only — desktop shows the full text with no
// Read More toggle; mobile/tablet keep the collapsed view.
const DETAILS_CLAMP = 'max-h-[5.4em] overflow-hidden lg:max-h-none lg:overflow-visible'

// Allowlist for the rendered description — only the marks/nodes the editor emits.
const DESCRIPTION_SANITIZE = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 's', 'u', 'ul', 'ol', 'li', 'a'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
}

// Renders an FAQ answer, splicing in a real <Link> for items that carry one
// (e.g. Cancellation policy → /cancellation). Splits the body around the
// {link} placeholder so admins can position the link mid-sentence — but if
// link_href is set and the placeholder was edited out of the body, the link
// is appended at the end rather than silently dropped, so a CMS edit can
// never make it disappear.
function renderFaqBody(item: FaqItem): React.ReactNode {
  if (!item.link_href) return item.body
  const link = (
    <Link
      href={item.link_href}
      className="font-semibold text-gray-900 underline underline-offset-2 hover:text-gray-600"
    >
      {item.link_label}
    </Link>
  )
  const parts = item.body.split('{link}')
  if (parts.length === 1) {
    return (
      <>
        {item.body}{' '}
        {link}
      </>
    )
  }
  return parts.map((chunk, i, arr) => (
    <span key={i}>
      {chunk}
      {i < arr.length - 1 && link}
    </span>
  ))
}

export default function ProductDetailClient({ product, allProducts, packages, addonsFaq }: { product: CatalogProduct; allProducts: CatalogProduct[]; packages: PackagesContent; addonsFaq: ProductAddonsFaqContent }) {
  const router = useRouter()
  const { addItem, items } = useCart()

  // Detail carousel = the portrait hero card (image_url) followed by the
  // landscape 800×600 "mockup" design views (designs[]). Each renders at its
  // own ratio inside DesignCarousel.
  const heroImage = product.imageUrl
  const designViews = product.designs ?? []

  // Number of cards (= guests). Minimum 50; pricing is per-guest × this count.
  const MIN_CARDS = 50
  const [digitalQty, setDigitalQty] = useState<number>(MIN_CARDS)

  // Package tier (Essential / Classic / Elegant / Signature) — price is per guest × guest count,
  // independent of the chosen design. Default to the featured tier.
  const [selectedTier, setSelectedTier] = useState<string>(
    () => packages.tiers.find((t) => t.featured)?.id ?? packages.tiers[0]?.id ?? '',
  )
  const tier = packages.tiers.find((t) => t.id === selectedTier) ?? packages.tiers[0]
  const pricePerGuest = tier?.price_per_guest ?? 0
  // Lowest per-guest package price — the "From TZS X per guest" anchor on the
  // similar-designs footer (replaces the retired per-card price).
  const fromGuestPrice = packageFromPrice(packages)

  // Hide the sticky breadcrumb once scrolling reaches the "Explore similar designs" section.
  const similarRef = useRef<HTMLElement>(null)
  const [hideCrumb, setHideCrumb] = useState(false)
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const el = similarRef.current
        if (el) setHideCrumb(el.getBoundingClientRect().top <= 56)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // Add-ons — one selection slot per admin-configured add-on (flat/per_unit
  // only; 'quote' add-ons have no checkbox/state, they just link out).
  const [addOnSelections, setAddOnSelections] = useState<Record<string, { selected: boolean; qty: number }>>(
    () => Object.fromEntries(addonsFaq.addons.map((a) => [a.id, { selected: false, qty: a.defaultQty }])),
  )
  const isAddOnIncluded = (a: AddOn) => a.includedInTierIds.includes(tier?.id ?? '')
  const toggleAddOn = (id: string) =>
    setAddOnSelections((prev) => ({ ...prev, [id]: { ...prev[id], selected: !prev[id]?.selected } }))
  const setAddOnQty = (id: string, qty: number) =>
    setAddOnSelections((prev) => ({ ...prev, [id]: { ...prev[id], qty } }))

  // Switching to a tier that now bundles an add-on for free clears any paid
  // selection for it, so the included coverage is never offered or double-charged.
  useEffect(() => {
    setAddOnSelections((prev) => {
      let changed = false
      const next = { ...prev }
      for (const a of addonsFaq.addons) {
        if (isAddOnIncluded(a) && next[a.id]?.selected) {
          next[a.id] = { ...next[a.id], selected: false }
          changed = true
        }
      }
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier?.id])

  const [favourited, setFavourited] = useState(false)

  // Details "Read more" — the toggle only appears when the text actually overflows
  // its clamped height, so short descriptions show no button.
  const detailsRef = useRef<HTMLDivElement>(null)
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [detailsOverflows, setDetailsOverflows] = useState(false)

  // Rich-text description rendering. DOMPurify needs a DOM, so we only sanitize
  // after mount (client-side); during SSR / first paint we show an escaped
  // plain-text version, then swap to the sanitized HTML — no hydration mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const description = product.description?.trim() ?? ''
  const descriptionIsHtml = containsHtml(description)
  const sanitizedDescription = useMemo(
    () => (mounted && descriptionIsHtml ? DOMPurify.sanitize(description, DESCRIPTION_SANITIZE) : null),
    [mounted, descriptionIsHtml, description],
  )
  useEffect(() => {
    if (detailsExpanded) return // keep the toggle visible once expanded
    const el = detailsRef.current
    if (!el) return
    const check = () => setDetailsOverflows(el.scrollHeight > el.clientHeight + 1)
    // Run after layout settles, and again once web fonts load — both change line
    // wrapping/height, so an early check can miss (or over-report) the overflow.
    const raf = requestAnimationFrame(check)
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(check).catch(() => {})
    }
    window.addEventListener('resize', check)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', check)
    }
  }, [detailsExpanded, product.name, product.designer, product.description, mounted, sanitizedDescription])

  const digitalSubtotal = pricePerGuest * digitalQty

  // One line per selected, priced (non-included, non-quote) add-on — the
  // basis for both the order summary rows and the cart line labels.
  const addOnLines = addonsFaq.addons
    .map((a) => {
      if (isAddOnIncluded(a) || a.pricingMode === 'quote') return null
      const sel = addOnSelections[a.id]
      if (!sel?.selected) return null
      const amount = a.pricingMode === 'flat' ? a.flatFee : a.unitPrice * sel.qty
      return {
        id: a.id,
        summaryLabel: a.pricingMode === 'per_unit' ? `${a.title} (${sel.qty})` : a.title,
        cartLabel: a.pricingMode === 'per_unit' ? `${sel.qty.toLocaleString('en-US')} ${a.title.toLowerCase()}` : a.title,
        amount,
      }
    })
    .filter((l): l is { id: string; summaryLabel: string; cartLabel: string; amount: number } => l !== null)

  const addOnsSubtotal = addOnLines.reduce((sum, l) => sum + l.amount, 0)
  const total = digitalSubtotal + addOnsSubtotal

  const sameCategory = allProducts.filter((p) => p.id !== product.id && p.category === product.category)
  const others = allProducts.filter((p) => p.id !== product.id && p.category !== product.category)
  const recommendations = [...sameCategory, ...others].slice(0, 4)

  const cartAddOns = addOnLines.map((l) => l.cartLabel)

  const cartSummary = buildItemSummary({ tier: tier?.name, guests: digitalQty, addOns: cartAddOns })

  const buildCartItem = () => ({
    id: product.id,
    name: product.name,
    designer: product.designer,
    treatment: product.treatment,
    // The actual artwork the customer is viewing/selecting — hero image, else
    // the first uploaded design. Falls back to the CSS treatment only when the
    // product has no image at all.
    image: product.imageUrl || product.designs?.[0],
    summary: cartSummary,
    tier: tier?.name,
    tierId: tier?.id,
    guests: digitalQty,
    pricePerGuest,
    extrasTotal: total - digitalSubtotal,
    addOns: cartAddOns,
    total,
  })

  // Buy now — add to cart and go straight to checkout
  const handleBuyNow = () => {
    addItem(buildCartItem())
    router.push('/digital-cards/checkout')
  }

  const handleAddToCart = () => {
    // One line per design: re-adding a design already in the cart updates that
    // line (new guest count / options) rather than stacking a duplicate, so the
    // toast must say "Updated" — otherwise the unchanged cart badge looks broken.
    const alreadyInCart = items.some((i) => i.id === product.id)
    addItem(buildCartItem())
    toast.success(alreadyInCart ? 'Updated in your cart' : 'Added to cart', {
      description: `${product.name} — TZS ${total.toLocaleString('en-US')}`,
      action: {
        label: 'Start guest list',
        onClick: () => {
          window.location.href = '/sign-up?redirect_url=%2Fmy%2Fdashboard%3Fseed%3D1'
        },
      },
    })
  }

  return (
    <div className="bg-[#FAFAF8] text-[#1A1A1A]">
      {/* Breadcrumb — pinned to the top while scrolling; hides once the similar-designs section is reached */}
      <nav
        className={cn(
          'sticky top-0 z-30 bg-[#FAFAF8] px-4 sm:px-6 py-4 transition-all duration-300',
          hideCrumb && 'pointer-events-none -translate-y-full opacity-0',
        )}
        aria-label="Breadcrumb"
      >
        <div className="mx-auto max-w-7xl flex min-w-0 flex-nowrap items-center gap-1.5 text-[11px] tracking-wide text-gray-400">
          <Link href="/digital-cards" className="shrink-0 whitespace-nowrap transition-colors hover:text-gray-700">Digital Cards</Link>
          <ChevronRight size={11} className="shrink-0 text-gray-300" />
          <Link href="/digital-cards/catalog" className="shrink-0 whitespace-nowrap transition-colors hover:text-gray-700">{product.category}</Link>
          <ChevronRight size={11} className="shrink-0 text-gray-300" />
          <span className="min-w-0 truncate font-medium text-[#1A1A1A]">{product.name}</span>
        </div>
      </nav>

      {/* Main 2-column layout */}
      <div className="px-4 sm:px-6 pt-6 sm:pt-8 pb-12 sm:pb-16">
        {/* Mobile: title leads, above the preview. Desktop renders it in the right column instead. */}
        <TitleBlock product={product} className="lg:hidden mx-auto max-w-7xl mb-6" />
        <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* ─── LEFT: card + description — pinned to the top of the column. No
              height clamp/internal scroll, so a tall portrait card never clips
              the description below it (the page scrolls naturally instead). ─── */}
          <div className="space-y-8 lg:sticky lg:top-[4rem]">
            {/* On phones the preview gets 24px side padding (~87% width) on top of
                the layout's 16px gutter so it no longer spans edge-to-edge; from
                sm+ it fills its column. */}
            <div className="px-2 sm:px-0">
              {product.badge && (
                <div className="mb-3 flex">
                  <ProductBadgePill badge={product.badge} />
                </div>
              )}
              <DesignCarousel
                hero={heroImage}
                designs={designViews}
                treatment={product.treatment}
                favourited={favourited}
                onFavourite={() => setFavourited((v) => !v)}
              />
            </div>

            {/* Description — below the card */}
            <div className="border-t border-gray-200 pt-5">
              <p className="text-[15px] font-medium text-gray-900 mb-2">{addonsFaq.descriptionLabel}</p>
              <div className="max-w-[720px] text-[14px] leading-[1.8] text-[#4B5563]">
                {!description ? (
                  // Auto-generated fallback when no description is set.
                  <div ref={detailsRef} className={cn('whitespace-pre-line', !detailsExpanded && DETAILS_CLAMP)}>
                    {`${product.name} is a signature design, sent digitally to every guest by WhatsApp or SMS.`}
                  </div>
                ) : sanitizedDescription !== null ? (
                  // Rich text from the admin TipTap editor — sanitized client-side,
                  // so bullet lists, bold, and links render properly (not literal "*").
                  <div
                    ref={detailsRef}
                    className={cn(
                      'space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline [&_a]:text-emerald-700 [&_strong]:font-semibold',
                      !detailsExpanded && DETAILS_CLAMP,
                    )}
                    dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
                  />
                ) : (
                  // SSR / pre-sanitize fallback (HTML) and legacy plain-text both
                  // render as escaped text — never injected as markup.
                  <div ref={detailsRef} className={cn('whitespace-pre-line', !detailsExpanded && DETAILS_CLAMP)}>
                    {descriptionIsHtml ? stripTags(description) : description}
                  </div>
                )}
                {detailsOverflows && (
                  <div className="mt-3 lg:hidden">
                    <button
                      type="button"
                      onClick={() => setDetailsExpanded((v) => !v)}
                      aria-expanded={detailsExpanded}
                      className="group inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-[#7A4F8E] transition-colors hover:text-[#5E3D6E]"
                    >
                      {detailsExpanded ? addonsFaq.readLessLabel : addonsFaq.readMoreLabel}
                      <ArrowRight
                        size={15}
                        className={cn(
                          'transition-transform group-hover:translate-x-0.5',
                          detailsExpanded && '-rotate-90',
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ─── RIGHT: scrollable configurator ─── */}
          <div className="space-y-7">
            {/* Title block — desktop only; on mobile it renders above the preview */}
            <TitleBlock product={product} className="hidden lg:block" />

            {/* Package selector — price is per guest, design-independent */}
            <div className="space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-gray-700">{packages.heading}</p>
                <p className="mt-1 text-[12px] text-gray-500">{packages.subheading}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5" role="radiogroup" aria-label="Package tier">
                {packages.tiers.map((t) => {
                  const active = t.id === selectedTier
                  const pill = TIER_PILL[t.id] ?? TIER_PILL_DEFAULT
                  const tierBg = pill.bg
                  const tierActive = pill.active
                  const tierBorder = pill.border
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSelectedTier(t.id)}
                      className={cn(
                        'relative rounded-lg border p-2 text-left shadow-sm transition sm:p-3',
                        tierBg,
                        active
                          ? cn('ring-1', tierActive)
                          : tierBorder,
                      )}
                    >
                      {t.badge_label && (() => {
                        const BadgeIcon = TIER_BADGE_ICON[t.badge_icon] ?? null
                        return (
                          <span
                            className={cn(
                              'absolute -top-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide shadow-sm',
                              TIER_BADGE_TONE[t.badge_tone] ?? TIER_BADGE_TONE.slate,
                            )}
                          >
                            {BadgeIcon && <BadgeIcon size={14} strokeWidth={3} className="shrink-0" aria-hidden="true" />}
                            {t.badge_label}
                          </span>
                        )
                      })()}
                      <p className="text-[12px] font-bold text-gray-900 sm:text-[13px]">{t.name}</p>
                      {/* Price + "per guest" stay on one line as a unit — the
                          whole <p> is nowrap so the phrase never splits across
                          lines. The 2-up-on-phones grid keeps the card wide
                          enough for it to fit at every breakpoint. */}
                      <p className="mt-0.5 whitespace-nowrap tabular-nums">
                        <span className="text-[12px] font-extrabold text-gray-900 sm:text-[14px]">TZS {t.price_per_guest.toLocaleString('en-US')}</span>
                        <span className="ml-1 text-[9px] font-medium text-gray-500 sm:text-[10px]">{packages.perGuestLabel}</span>
                      </p>
                      <p className="mt-1.5 text-[9px] leading-tight text-gray-500 sm:text-[10px]">{t.best_for}</p>
                    </button>
                  )
                })}
              </div>

              {/* Number of cards (= guests); minimum 50. The label column is
                  flex-1 min-w-0 so its text wraps on phones while the stepper
                  stays beside it on the same row, never clipped off-screen. */}
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <label htmlFor="card-count" className="text-[12px] font-bold text-gray-900 sm:text-[13px]">
                    {packages.cardsCountLabel}
                  </label>
                  <p className="text-[11px] text-gray-500">{packages.minGuestsTemplate.replace('{count}', String(MIN_CARDS))}</p>
                </div>
                <div className="ml-auto inline-flex shrink-0 items-stretch overflow-hidden rounded-full border border-gray-300 bg-white">
                  <button
                    type="button"
                    aria-label="Fewer cards"
                    onClick={() => setDigitalQty((q) => Math.max(MIN_CARDS, (Number.isNaN(q) ? MIN_CARDS : q) - 10))}
                    disabled={digitalQty <= MIN_CARDS}
                    className="px-3 text-lg font-semibold text-gray-600 transition bg-gray-100 hover:bg-gray-200 disabled:opacity-40 sm:px-4"
                  >
                    −
                  </button>
                  <input
                    id="card-count"
                    type="number"
                    min={MIN_CARDS}
                    step={10}
                    inputMode="numeric"
                    value={digitalQty}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      if (!Number.isNaN(n)) setDigitalQty(n)
                    }}
                    onBlur={() => {
                      if (Number.isNaN(digitalQty) || digitalQty < MIN_CARDS) setDigitalQty(MIN_CARDS)
                    }}
                    className="w-14 border-x border-gray-200 bg-white py-2 text-center text-[14px] font-bold text-gray-900 tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none sm:w-16 sm:py-2.5 sm:text-[15px]"
                  />
                  <button
                    type="button"
                    aria-label="More cards"
                    onClick={() => setDigitalQty((q) => (Number.isNaN(q) ? MIN_CARDS : q) + 10)}
                    className="px-3 text-lg font-semibold text-gray-600 transition bg-gray-100 hover:bg-gray-200 sm:px-4"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* What this tier includes — the tier's own bullet list */}
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-gray-700 mb-2.5">
                  {tier?.name} {packages.includesSuffixLabel}
                </p>
                <ul className="columns-1 gap-x-6 text-[13px] text-gray-700 sm:columns-2">
                  {(tier?.includes ?? []).map((b) => (
                    <li key={b.id} className="mb-1.5 flex items-start gap-2 break-inside-avoid">
                      <Check size={14} strokeWidth={3.25} className="shrink-0 mt-0.5 text-emerald-600" />
                      <span>
                        {b.label}
                        {b.note && <span className="text-gray-500"> — {b.note}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ─── Optional add-ons ─── */}
            <div className="border-t border-gray-200 pt-6">
              <p className="text-[13px] font-bold text-gray-900 mb-3">{addonsFaq.addonsHeading}</p>

              {addonsFaq.addons.map((a) => {
                // Bundled into the current tier for free — show the
                // non-interactive "Included" variant instead of a priced card.
                if (isAddOnIncluded(a)) {
                  return (
                    <IncludedAddOnCard
                      key={a.id}
                      title={a.includedTitle || a.title}
                      description={a.includedDescription || a.description}
                      includedLabel={addonsFaq.includedPillLabel}
                    />
                  )
                }

                const sel = addOnSelections[a.id] ?? { selected: false, qty: a.defaultQty }
                const priceLabel =
                  a.pricingMode === 'flat'
                    ? `TZS ${a.flatFee.toLocaleString('en-US')} ${a.flatFeeLabel}`
                    : a.pricingMode === 'per_unit'
                    ? `${addonsFaq.priceFromLabel} TZS ${a.unitPrice.toLocaleString('en-US')} ${a.unitLabel}`
                    : '' // 'quote' add-ons show no price line — quoteLabel appears only in the reveal once checked

                return (
                  <Fragment key={a.id}>
                    <AddOnCard
                      checked={sel.selected}
                      onToggle={() => toggleAddOn(a.id)}
                      title={a.title}
                      description={a.description}
                      priceLabel={priceLabel}
                    >
                      {a.pricingMode === 'per_unit' && sel.selected && (
                        <AddOnQuantityStepper
                          label={addonsFaq.howManyLabel}
                          unitPrice={a.unitPrice}
                          unitLabel={a.unitLabel}
                          value={sel.qty}
                          min={a.minQty}
                          step={a.qtyStep}
                          onChange={(qty) => setAddOnQty(a.id, qty)}
                        />
                      )}
                      {a.pricingMode === 'quote' && sel.selected && (
                        <QuoteCallCta addOn={a} phoneNumber={addonsFaq.quotePhoneNumber} />
                      )}
                    </AddOnCard>
                    {a.pricingMode === 'flat' && a.showGuestTicketPreview && sel.selected && (
                      // Boarding-pass ticket — both ends (OpusPass stub + QR) are taken
                      // verbatim from src/assets/lite_ticket_pass.svg; only the middle copy differs.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/assets/guest-ticket-card-${tier?.id ?? 'classic'}.svg`}
                        alt="Every guest gets a personalised OpusPass ticket with their name, event details, and a unique QR code that your attendant scans at the door for seamless entry."
                        className="-mt-1 mb-3 h-auto w-full [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.10))_drop-shadow(0_12px_26px_rgba(30,20,40,0.12))]"
                      />
                    )}
                  </Fragment>
                )
              })}
            </div>

            {/* Order summary */}
            <div className="border-t border-gray-200 pt-6">
              <p className="text-[13px] font-bold text-gray-900 mb-3">Order summary</p>
              <dl className="space-y-2 text-[14px]">
                <SummaryRow label={`${tier?.name ?? 'Package'} (${digitalQty} guests)`} value={digitalSubtotal} />
                {addOnLines.map((l) => (
                  <SummaryRow key={l.id} label={l.summaryLabel} value={l.amount} />
                ))}
                <div className="border-t border-gray-200 pt-3 flex items-baseline justify-between">
                  <dt className="text-[15px] font-bold text-gray-900">Total</dt>
                  <dd className="text-[26px] font-bold text-gray-900 leading-none">
                    TZS {total.toLocaleString('en-US')}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Action buttons — Add to cart (secondary) then Buy now (commit) */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleAddToCart}
                className="inline-flex items-center justify-center rounded-full border border-[#1A1A1A] bg-transparent text-[#1A1A1A] px-5 py-3.5 text-[13px] font-extrabold uppercase tracking-[0.1em] hover:bg-gray-50 transition"
              >
                Add to cart
              </button>
              <button
                type="button"
                onClick={handleBuyNow}
                className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] px-5 py-3.5 text-[13px] font-extrabold uppercase tracking-[0.1em]"
              >
                Buy now
              </button>
            </div>


            {/* Collapsible sections */}
            <div className="border-t border-gray-200">
              {addonsFaq.faq.map((item) => (
                <Accordion key={item.id} id={item.id} title={item.title}>
                  <p>{renderFaqBody(item)}</p>
                </Accordion>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Similar designs */}
      {recommendations.length > 0 && (
        <section ref={similarRef} className="px-4 sm:px-6 pb-16 sm:pb-24 border-t border-gray-200">
          <div className="mx-auto max-w-7xl pt-12 sm:pt-16">
            <h2 className="text-xl md:text-2xl font-serif font-medium text-gray-900 mb-6 sm:mb-8">
              {addonsFaq.similarDesignsHeading}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
              {recommendations.map((p) => {
                // Prefer the real card artwork (hero image, then first uploaded
                // design); fall back to the CSS treatment only when a product has
                // no image at all — same rule as the catalog grid.
                const cardImage = p.imageUrl || p.designs?.[0]
                return (
                <Link key={p.id} href={`/digital-cards/p/${p.id}`} className="group flex flex-col">
                  <div className="relative aspect-[5/7] overflow-hidden rounded-sm bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_16px_-8px_rgba(0,0,0,0.12)] transition-[transform,box-shadow] duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_4px_8px_rgba(0,0,0,0.06),0_18px_32px_-12px_rgba(0,0,0,0.18)]">
                    <span className="absolute inset-0">
                      {cardImage ? (
                        <Image src={cardImage} alt="" fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover" unoptimized />
                      ) : (
                        <InvitationVisual treatment={p.treatment} />
                      )}
                    </span>
                  </div>
                  <p className="mt-2.5 text-[14px] font-bold text-gray-900 leading-snug line-clamp-2">{p.name}</p>
                  <p className="mt-1 text-[13px] text-gray-700">
                    {packages.fromLabel} TZS {fromGuestPrice.toLocaleString('en-US')} {packages.perGuestLabel}
                  </p>
                </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}

    </div>
  )
}

function AddOnCard({
  checked,
  onToggle,
  title,
  description,
  priceLabel,
  children,
}: {
  checked: boolean
  onToggle: () => void
  title: string
  description: string
  priceLabel: string
  children?: React.ReactNode
}) {
  return (
    <div className={cn(
      'mb-3 rounded-md border transition',
      checked ? 'border-[#1A1A1A] bg-white' : 'border-gray-200 bg-white hover:border-gray-300',
    )}>
      <label className="flex items-start gap-3 cursor-pointer p-4">
        <input type="checkbox" checked={checked} onChange={onToggle} className="peer sr-only" />
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
          <p className="text-[14px] font-bold text-gray-900">{title}</p>
          <p className="mt-1 text-[12px] text-gray-600 leading-relaxed">{description}</p>
          {priceLabel && <p className="mt-1.5 text-[12px] font-bold text-[#1A1A1A]">{priceLabel}</p>}
        </div>
      </label>
      {children && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

// Quantity stepper for a 'per_unit' add-on — shown inside its AddOnCard once
// checked. Generic over any add-on's unit price/label/min/step.
function AddOnQuantityStepper({
  label,
  unitPrice,
  unitLabel,
  value,
  min,
  step,
  onChange,
}: {
  label: string
  unitPrice: number
  unitLabel: string
  value: number
  min: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold text-gray-900 sm:text-[13px]">{label}</p>
        <p className="text-[11px] text-gray-500">TZS {unitPrice.toLocaleString('en-US')} {unitLabel}</p>
      </div>
      <div className="ml-auto inline-flex shrink-0 items-stretch overflow-hidden rounded-full border border-gray-300 bg-white">
        <button
          type="button"
          aria-label="Fewer"
          onClick={() => onChange(Math.max(min, (Number.isNaN(value) ? min : value) - step))}
          disabled={value <= min}
          className="px-3 text-lg font-semibold text-gray-600 transition bg-gray-100 hover:bg-gray-200 disabled:opacity-40 sm:px-4"
        >
          −
        </button>
        <input
          type="number"
          min={min}
          step={step}
          inputMode="numeric"
          aria-label={label}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isNaN(n)) onChange(n)
          }}
          onBlur={() => {
            if (Number.isNaN(value) || value < min) onChange(min)
          }}
          className="w-14 border-x border-gray-200 bg-white py-2 text-center text-[14px] font-bold text-gray-900 tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none sm:w-16 sm:py-2.5 sm:text-[15px]"
        />
        <button
          type="button"
          aria-label="More"
          onClick={() => onChange((Number.isNaN(value) ? min : value) + step)}
          className="px-3 text-lg font-semibold text-gray-600 transition bg-gray-100 hover:bg-gray-200 sm:px-4"
        >
          +
        </button>
      </div>
    </div>
  )
}

// 'quote' add-on — priced on a call. AddOnCard shows no price line while
// unchecked; once the buyer checks the box to select it, this reveals both
// `quoteLabel` ("Price upon consultation call") and the "Call us" button
// that dials the admin-configured phone number directly. Never affects the
// order total (see addOnLines, which excludes 'quote' add-ons).
function QuoteCallCta({ addOn, phoneNumber }: { addOn: AddOn; phoneNumber: string }) {
  // tel: accepts spaces/formatting fine, but strip everything except a
  // leading + and digits so dialers on every platform parse it consistently.
  const dialablePhone = phoneNumber.replace(/(?!^\+)[^\d]/g, '')
  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
      <p className="text-[12px] font-bold text-[#1A1A1A]">{addOn.quoteLabel}</p>
      <a
        href={`tel:${dialablePhone}`}
        className="inline-flex shrink-0 items-center rounded-full border border-[#1A1A1A] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#1A1A1A] transition hover:bg-gray-50"
      >
        {addOn.quoteCtaLabel}
      </a>
    </div>
  )
}

// Non-interactive variant of AddOnCard for coverage that's bundled into the
// chosen tier — shows an "Included" pill instead of a checkbox + price.
function IncludedAddOnCard({ title, description, includedLabel }: { title: string; description: string; includedLabel: string }) {
  return (
    <div className="mb-3 rounded-md border border-[#CDEBA6] bg-[#F4FBE9]">
      <div className="flex items-start gap-3 p-4">
        <span
          aria-hidden
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#5C6B4D] text-white"
        >
          <Check size={13} strokeWidth={3} />
        </span>
        <div className="grow">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-bold text-gray-900">{title}</p>
            <span className="rounded-full bg-[#9FE870] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1A1A1A]">
              {includedLabel}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-gray-600 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-baseline">
      <dt className="text-gray-700">{label}</dt>
      <dd className="font-medium text-gray-900 tabular-nums">TZS {value.toLocaleString('en-US')}</dd>
    </div>
  )
}

function Accordion({
  id,
  title,
  defaultOpen = false,
  children,
}: {
  id?: string
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  // Deterministic id — NOT useId. useId is derived from the component's
  // position in the tree, and Next 16's dev-only segment-explorer wrappers
  // shift that position between SSR and hydration, spamming the console with
  // hydration-mismatch errors in dev (prod is unaffected). Prefer the caller's
  // stable `id` (e.g. a CMS item's own id) since two admin-edited titles can
  // collide (both left as "New question"); fall back to a title slug only
  // when no stable id is available.
  const panelId = `accordion-${(id ?? title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
  return (
    <div className="border-b border-gray-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-4 py-4 text-left text-[15px] font-medium text-gray-900"
      >
        {title}
        <ChevronDown
          className={cn('h-5 w-5 text-gray-500 shrink-0 transition-transform duration-200', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      <div
        id={panelId}
        role="region"
        className={cn('grid transition-[grid-template-rows] duration-200', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
      >
        <div className="overflow-hidden">
          <div className="pb-5 text-[14px] text-gray-700 space-y-2 leading-relaxed">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
