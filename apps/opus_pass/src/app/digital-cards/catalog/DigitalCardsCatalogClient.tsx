'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Heart, ListFilter, Search, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InvitationVisual } from '@/components/guests/InvitationVisual'
import { useFavorites } from '@/components/providers/FavoritesProvider'
import { PROMO_CODE, ProductInfo } from '@/components/guests/productInfo'
import ProductBadgePill from '@/components/digital-cards/ProductBadge'
import type { CatalogProduct } from '@/data/digital-cards-products'
import { useScrollCarousel } from '@/hooks/useScrollCarousel'
import type { DigitalCardsPromoBannerContent } from '@/lib/cms/digital-cards-promo-banner'
import type { DigitalCardsStyleStripContent } from '@/lib/cms/digital-cards-style-strip'

export type { CatalogProduct }
type Product = CatalogProduct

// Catalog toolbar state.
type SortMode = 'popular' | 'recent'
type TimeRange = 'all' | 'week' | 'month' | 'year'

const RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
]

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: 'popular', label: 'Popular' },
  { key: 'recent', label: 'Recent' },
]

const RANGE_MS: Record<Exclude<TimeRange, 'all'>, number> = {
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
}

// Badged designs surface first under "Popular"; lower rank = higher up.
const BADGE_RANK: Record<string, number> = { most_popular: 0, trending: 1, premium: 2 }

const PAGE_SIZE = 12
// How many extra batches auto-load on scroll before the "Load more" button
// takes over (keeps the footer reachable on large result sets).
const AUTO_LOAD_BATCHES = 2
const PROMO_BANNER_DISMISSED_PREFIX = 'opuspass.digitalCardsPromo.dismissed'

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function DigitalCardsCatalogClient({
  products = [],
  fromGuestPrice,
  perGuestLabel,
  perDesignLabel,
  fromLabel,
  title = 'Wedding Digital Cards',
  subtitle = 'A handpicked edit of digital card designs, browse by style.',
  promoBanner,
  styleStrip,
}: {
  products?: Product[]
  /** Lowest per-guest package price — the "From TZS X per guest" card anchor. */
  fromGuestPrice?: number
  perGuestLabel?: string
  perDesignLabel?: string
  fromLabel?: string
  title?: string
  subtitle?: string
  promoBanner: DigitalCardsPromoBannerContent
  styleStrip: DigitalCardsStyleStripContent
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('popular')
  const [range, setRange] = useState<TimeRange>('all')
  const [promoDismissed, setPromoDismissed] = useState(false)
  const promoDismissKey = `${PROMO_BANNER_DISMISSED_PREFIX}:${promoBanner.promo_code || PROMO_CODE}`

  useEffect(() => {
    try {
      setPromoDismissed(window.localStorage.getItem(promoDismissKey) === '1')
    } catch {
      setPromoDismissed(false)
    }
  }, [promoDismissKey])

  const dismissPromo = () => {
    setPromoDismissed(true)
    try {
      window.localStorage.setItem(promoDismissKey, '1')
    } catch {
      // Ignore storage failures; the close button should still work for this session.
    }
  }

  // Filter (time range → search) then sort (Popular / Recent).
  const filteredProducts = useMemo(() => {
    let list = products
    if (range !== 'all') {
      const cutoff = Date.now() - RANGE_MS[range]
      list = list.filter((p) => p.createdAt && new Date(p.createdAt).getTime() >= cutoff)
    }
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((p) =>
        `${p.name} ${p.category} ${p.designer ?? ''}`.toLowerCase().includes(q),
      )
    }
    const arr = [...list]
    if (sort === 'recent') {
      arr.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    } else {
      // Popular: badged designs first, otherwise the curated (sort_order) order.
      arr.sort(
        (a, b) =>
          (a.badge ? BADGE_RANK[a.badge] ?? 90 : 99) -
          (b.badge ? BADGE_RANK[b.badge] ?? 90 : 99),
      )
    }
    return arr
  }, [products, range, query, sort])

  const clearFilters = () => {
    setQuery('')
    setRange('all')
    setSort('popular')
  }

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  // Number of batches auto-loaded on scroll so far. After AUTO_LOAD_BATCHES we
  // switch to a manual "Load more" button so the page footer stays reachable.
  const [autoLoads, setAutoLoads] = useState(0)

  // Reset the visible window whenever the result set changes (filters/sort/search)
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
    setAutoLoads(0)
  }, [filteredProducts])

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount],
  )
  const hasMore = visibleCount < filteredProducts.length
  const autoLoading = hasMore && autoLoads < AUTO_LOAD_BATCHES

  const loadMore = () =>
    setVisibleCount((c) => Math.min(c + PAGE_SIZE, filteredProducts.length))

  // Infinite scroll for the first AUTO_LOAD_BATCHES — grow the window when the
  // sentinel near the grid's end scrolls into view. rootMargin pre-loads the
  // next batch before it's reached. Past that, the "Load more" button takes over.
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!autoLoading) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setAutoLoads((n) => n + 1)
          loadMore()
        }
      },
      { rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoading, products.length])

  return (
    <div className="bg-[#FAFAF8] text-[#1A1A1A]">
      {!promoDismissed && (
        <div
          className="border-b border-[#E8D9A7]/50 py-2.5"
          style={{ backgroundColor: promoBanner.background_color }}
        >
          <div className="relative flex items-center justify-center px-14 text-center sm:px-16">
            <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-center">
              <span className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#1A1A1A] sm:text-[13px]">
                {promoBanner.eyebrow}
              </span>
              <span className="text-[12px] text-[#1A1A1A]/85 sm:text-[13px]">
                {promoBanner.body}{' '}
                <strong className="font-bold text-[#1A1A1A]">{promoBanner.promo_code || PROMO_CODE}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={dismissPromo}
              aria-label="Dismiss promotion"
              className="absolute right-4 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-[#1A1A1A] text-white transition hover:bg-black focus:outline-none focus:ring-2 focus:ring-[#1A1A1A]/25 sm:right-6"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Title — matches the serif heading pattern used on /digital-cards */}
      <header className="px-4 sm:px-6">
        <div className="mx-auto max-w-7xl pt-10 sm:pt-14 text-center">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-serif font-medium text-gray-900 mb-4">
            {title}
          </h1>
          <p className="max-w-2xl mx-auto text-sm md:text-base text-gray-700 leading-relaxed">
            {subtitle}
          </p>
        </div>
      </header>

      {/* Style strip */}
      <CategoryStrip items={styleStrip.items} />

      {/* Product grid (full-width) */}
      <div className="px-4 sm:px-6">
        <div className="mx-auto max-w-7xl pt-14 sm:pt-20 pb-20 sm:pb-28">
          {/* Search + filter toolbar — search and all filters share one row */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-nowrap items-center gap-2.5 sm:gap-3">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/40"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${products.length} designs…`}
                  aria-label="Search designs"
                  className="w-full rounded-full border border-[#1A1A1A]/12 bg-white py-3 pl-11 pr-4 text-[14px] text-[#1A1A1A] placeholder:text-[#1A1A1A]/40 focus:border-[#1A1A1A]/40 focus:outline-none focus:ring-4 focus:ring-[#1A1A1A]/5"
                />
              </div>
              {/* Sort: Popular / Recent */}
              <div className="sm:hidden">
                <FilterMenu
                  icon={ListFilter}
                  value={sort}
                  options={SORT_OPTIONS}
                  onChange={(k) => setSort(k as SortMode)}
                />
              </div>
              <div className="hidden shrink-0 rounded-full border border-[#1A1A1A]/12 bg-white p-0.5 sm:inline-flex">
                <SortToggle active={sort === 'popular'} onClick={() => setSort('popular')} icon={ListFilter} label="Popular" />
                <SortToggle active={sort === 'recent'} onClick={() => setSort('recent')} icon={Clock} label="Recent" />
              </div>
              {/* Time range */}
              <div className="hidden sm:block">
                <FilterMenu
                  icon={CalendarDays}
                  value={range}
                  options={RANGE_OPTIONS}
                  onChange={(k) => setRange(k as TimeRange)}
                />
              </div>
            </div>
          </div>
          {visibleProducts.length === 0 ? (
            <div className="py-16 text-center sm:py-24">
              <p className="text-[15px] font-semibold text-[#1A1A1A]">
                No designs match your filters
              </p>
              <p className="mt-1 text-[13px] text-[#1A1A1A]/55">
                Try a different search or clear the filters.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 inline-flex items-center rounded-full bg-[var(--accent)] px-6 py-2.5 text-[13px] font-bold text-[var(--on-accent)] hover:bg-[var(--accent-hover)]"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <ProductGrid
              products={visibleProducts}
              fromGuestPrice={fromGuestPrice}
              perGuestLabel={perGuestLabel}
              perDesignLabel={perDesignLabel}
              fromLabel={fromLabel}
            />
          )}
          {autoLoading && (
            <div ref={sentinelRef} aria-hidden className="mt-10 flex justify-center">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#1A1A1A]/15 border-t-[#1A1A1A]/60" />
            </div>
          )}
          {hasMore && !autoLoading && (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                className="inline-flex items-center rounded-full border border-[#1A1A1A]/20 bg-white px-7 py-3 text-[13px] font-bold text-[#1A1A1A] transition-colors hover:border-[#1A1A1A]"
              >
                Load more
              </button>
            </div>
          )}
          {visibleProducts.length > 0 && (
            <p className="mt-6 text-center text-[12px] text-[#1A1A1A]/45">
              Showing {visibleProducts.length} of {filteredProducts.length}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  TOOLBAR CONTROLS — sort toggle + dropdown menu
// ─────────────────────────────────────────────────────────────────────────────

function SortToggle({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: LucideIcon
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
        active ? 'bg-[#1A1A1A] text-white' : 'text-[#1A1A1A]/70 hover:text-[#1A1A1A]',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  )
}

function FilterMenu<T extends string>({
  value,
  options,
  onChange,
  icon: Icon,
}: {
  value: T
  options: { key: T; label: string }[]
  onChange: (key: T) => void
  icon?: LucideIcon
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = options.find((o) => o.key === value) ?? options[0]

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-[#1A1A1A]/12 bg-white px-4 py-2 text-[13px] font-semibold text-[#1A1A1A] transition-colors hover:border-[#1A1A1A]/40"
      >
        {Icon && <Icon className="h-4 w-4 text-[#1A1A1A]/55" aria-hidden="true" />}
        {current?.label}
        <ChevronDown
          className={cn('h-4 w-4 text-[#1A1A1A]/55 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-20 mt-2 max-h-72 w-52 overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              role="option"
              aria-selected={o.key === value}
              onClick={() => {
                onChange(o.key)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-gray-50',
                o.key === value ? 'font-bold text-[#1A1A1A]' : 'text-[#1A1A1A]/80',
              )}
            >
              {o.label}
              {o.key === value && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  CATEGORY STRIP — circular-photo carousel matching /digital-cards Shop-by-Category
// ─────────────────────────────────────────────────────────────────────────────

type StyleStripItem = DigitalCardsStyleStripContent['items'][number]

// Exported so the Favorites empty state offers the same "browse by style" row.
export function CategoryStrip({ items }: { items: StyleStripItem[] }) {
  const { scrollRef, progress, scrolling, scrollNext, scrollPrev } = useScrollCarousel()
  // Arrows stay hidden until the user hovers the row or scrolls it.
  const arrowReveal = scrolling
    ? 'opacity-100'
    : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'

  return (
    <div className="px-4 sm:px-6">
      <div className="mx-auto max-w-7xl pt-8 sm:pt-10">
        {/* Arrows flank the row (outside the circles), not overlapping them, and
            only appear on hover or while scrolling. */}
        <div className="group flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={scrollPrev}
            disabled={progress <= 1}
            aria-label="Scroll left"
            className={cn(
              'hidden md:grid shrink-0 h-10 w-10 place-items-center rounded-full bg-[#1A1A1A]/80 shadow-lg transition hover:bg-[#1A1A1A] disabled:pointer-events-none disabled:bg-[#1A1A1A]/40',
              arrowReveal,
            )}
          >
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>

          <div
            ref={scrollRef}
            className="flex min-w-0 flex-1 gap-5 sm:gap-6 md:gap-8 overflow-x-auto pb-2 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
          >
            {items.map((cat) => (
              <Link
                key={cat.id}
                href={cat.href ?? '/digital-cards/catalog'}
                className="group/tile flex flex-col items-center text-center shrink-0 snap-start w-[110px] sm:w-[130px] md:w-[calc((100%-128px)/5)]"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-full bg-white ring-1 ring-gray-200 mb-3 transition-shadow group-hover/tile:shadow-md">
                  <Image
                    src={cat.img}
                    alt={cat.alt}
                    fill
                    sizes="(min-width: 768px) 20vw, 130px"
                    className="object-cover group-hover/tile:scale-105 transition-transform duration-500"
                  />
                </div>
                <span className="inline-flex items-center gap-1 text-xs md:text-sm font-medium text-gray-800 group-hover/tile:underline leading-tight">
                  {cat.label}
                  <ArrowRight size={14} className="shrink-0 transition-transform group-hover/tile:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>

          <button
            type="button"
            onClick={scrollNext}
            disabled={progress >= 99}
            aria-label="Scroll right"
            className={cn(
              'hidden md:grid shrink-0 h-10 w-10 place-items-center rounded-full bg-[#1A1A1A]/80 shadow-lg transition hover:bg-[#1A1A1A] disabled:pointer-events-none disabled:bg-[#1A1A1A]/40',
              arrowReveal,
            )}
          >
            <ChevronRight className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  PRODUCT GRID
// ─────────────────────────────────────────────────────────────────────────────

function ProductGrid({
  products,
  fromGuestPrice,
  perGuestLabel,
  perDesignLabel,
  fromLabel,
}: {
  products: Product[]
  fromGuestPrice?: number
  perGuestLabel?: string
  perDesignLabel?: string
  fromLabel?: string
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          fromGuestPrice={fromGuestPrice}
          perGuestLabel={perGuestLabel}
          perDesignLabel={perDesignLabel}
          fromLabel={fromLabel}
        />
      ))}
    </div>
  )
}

// Exported so the Favorites page renders identical cards (single source of truth
// for the catalog tile). Favorite state is read straight from FavoritesProvider.
export function ProductCard({
  product,
  fromGuestPrice,
  perGuestLabel,
  perDesignLabel,
  fromLabel,
}: {
  product: Product
  fromGuestPrice?: number
  perGuestLabel?: string
  perDesignLabel?: string
  fromLabel?: string
}) {
  const { isFavorite, toggle } = useFavorites()
  const favourited = isFavorite(product.id)
  // Card image: prefer the attached hero artwork, then fall back to the first
  // designer-uploaded design, then the built-in CSS treatment. Products created
  // via designer upload often have no `imageUrl` (only `designs`), so without
  // this fallback their catalog card would show a blank placeholder.
  const cardImage = product.imageUrl || product.designs?.[0]

  return (
    <div className="group flex flex-col">
      <Link
        href={`/digital-cards/p/${product.id}`}
        className="relative block aspect-[5/7] overflow-hidden rounded-sm bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_16px_-8px_rgba(0,0,0,0.12)] transition-[transform,box-shadow] duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_4px_8px_rgba(0,0,0,0.06),0_18px_32px_-12px_rgba(0,0,0,0.18)]"
      >
        <span className="absolute inset-0">
          {/* The Image below is deliberately NOT `unoptimized`: next.config already
              disables the optimizer in dev (where it intermittently 504s), so that
              prop only ever took effect in production — shipping the raw upload with
              no srcset. Hero files run from ~1000px to 4267px wide into a tile that
              is ~170 CSS px, and the browser's own downscale visibly softens fine
              linework and small type. quality 90 (allowlisted in next.config)
              because this is the product artwork itself. */}
          {cardImage ? (
            <Image src={cardImage} alt="" fill sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw" className="object-cover" quality={90} />
          ) : (
            <InvitationVisual treatment={product.treatment} />
          )}
        </span>

        {/* Status badge — admin-set promotional pill, top-left above the artwork */}
        {product.badge && (
          <ProductBadgePill badge={product.badge} className="absolute left-2 top-2 z-10" />
        )}

        {/* Heart button — stays put (above zoom layer) */}
        <button
          type="button"
          aria-label={favourited ? 'Remove from favourites' : 'Add to favourites'}
          aria-pressed={favourited}
          onClick={(e) => {
            e.preventDefault()
            toggle(product.id)
          }}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 shadow-sm hover:bg-white z-10"
        >
          <Heart className={cn('h-3.5 w-3.5', favourited ? 'fill-red-500 text-red-500' : 'text-[#1A1A1A]')} />
        </button>

      </Link>
      <ProductInfo product={product} fromGuestPrice={fromGuestPrice} perGuestLabel={perGuestLabel} perDesignLabel={perDesignLabel} fromLabel={fromLabel} />
    </div>
  )
}
