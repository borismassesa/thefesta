'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

import VendorsBottomCta from '@/components/vendors/VendorsBottomCta'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  BadgeCheck,
  CakeSlice,
  Camera,
  CarFront,
  Eye,
  Flower2,
  Gem,
  Globe,
  Heart,
  Lightbulb,
  Mail,
  MapPin,
  Mic2,
  Music4,
  ShieldCheck,
  Shirt,
  Sparkles,
  Star,
  Tent,
  Users,
  UtensilsCrossed,
  Video,
} from 'lucide-react'
import {
  VENDORS_BASE_PATH,
  vendorCategories,
  vendors,
  getFeaturedVendors,
  getVendorsByCategory,
} from '@/lib/vendors'
import { getVendorCardImages } from '@/lib/vendor-images'

const BROWSE_PATH = '/vendors/browse'

const TAB_CATEGORY_MAP: Record<string, string> = {
  Venues: 'venues',
  Photographers: 'photographers',
  Catering: 'caterers',
  MCs: 'officiant-mc',
}

const pageClass = 'mx-auto w-full max-w-[72rem] 2xl:max-w-[90rem] 3xl:max-w-[112rem] 4xl:max-w-[140rem]'

const _heroVendor = getFeaturedVendors()[0] ?? vendors[0]
const ROW_SIZE = 6

const guestFavourites = [...vendors]
  .sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating
    return b.reviewCount - a.reviewCount
  })
  .slice(0, ROW_SIZE)

const planningRow = (() => {
  const picks = [
    ...getVendorsByCategory('videographers').slice(0, 2),
    ...getVendorsByCategory('djs-bands').slice(0, 2),
    ...getVendorsByCategory('florists').slice(0, 1),
    ...getVendorsByCategory('transportation').slice(0, 1),
  ]
  if (picks.length >= ROW_SIZE) return picks.slice(0, ROW_SIZE)
  const ids = new Set(picks.map((v) => v.id))
  const fallbacks = vendors.filter((v) => !ids.has(v.id))
  return [...picks, ...fallbacks].slice(0, ROW_SIZE)
})()

const promotionsRow = (() => {
  const badged = vendors.filter((v) => v.badge)
  if (badged.length >= ROW_SIZE) return badged.slice(0, ROW_SIZE)
  const ids = new Set(badged.map((v) => v.id))
  const fallbacks = vendors.filter((v) => !ids.has(v.id))
  return [...badged, ...fallbacks].slice(0, ROW_SIZE)
})()

const newVendorsRow = (() => {
  const newOnes = vendors.filter((v) => v.badge === 'New')
  if (newOnes.length >= ROW_SIZE) return newOnes.slice(0, ROW_SIZE)
  const ids = new Set(newOnes.map((v) => v.id))
  const fallbacks = [...vendors].reverse().filter((v) => !ids.has(v.id))
  return [...newOnes, ...fallbacks].slice(0, ROW_SIZE)
})()

const categoryIcons: Record<string, LucideIcon> = {
  venues: MapPin,
  photographers: Camera,
  videographers: Video,
  'djs-bands': Music4,
  florists: Flower2,
  caterers: UtensilsCrossed,
  'hair-makeup': Sparkles,
  'wedding-cakes': CakeSlice,
  transportation: CarFront,
  'wedding-planners': Users,
  'decor-styling': Sparkles,
  'bridal-wear': Shirt,
  'groom-wear': Shirt,
  'jewellery-rings': Gem,
  'invitations-stationery': Mail,
  'sound-lighting': Lightbulb,
  'tents-marquees': Tent,
  'photo-booths': Camera,
  'officiant-mc': Mic2,
  'honeymoon-travel': Globe,
  'security': ShieldCheck,
  'caricature-entertainment': Users,
}

const HERO_TABS = [
  { label: 'Venues', icon: MapPin },
  { label: 'Photographers', icon: Camera },
  { label: 'Catering', icon: UtensilsCrossed },
  { label: 'MCs', icon: Users },
]

const topVenueNames = vendors
  .filter((v) => v.categoryId === 'venues')
  .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
  .slice(0, 3)
  .map((v) => v.name)

const topPhotographerNames = vendors
  .filter((v) => v.categoryId === 'photographers')
  .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
  .slice(0, 3)
  .map((v) => v.name)

const topCatererNames = vendors
  .filter((v) => v.categoryId === 'caterers')
  .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
  .slice(0, 3)
  .map((v) => v.name)

const POPULAR_BY_TAB: Record<string, { label: string; items: string[] }> = {
  Venues: { label: 'Popular:', items: topVenueNames },
  Photographers: { label: 'Popular:', items: topPhotographerNames },
  Catering: { label: 'Popular:', items: topCatererNames },
  MCs: { label: 'Popular:', items: ['DJ Mwanga', 'MC Livanga', 'Bongo MC'] },
}

const HERO_VIDEOS = [
  { src: '/assets/vendors_hero_ads/dribble.mp4',   name: 'The Zanzibar Pearl',  avatar: '/assets/images/coupleswithpiano.jpg' },
  { src: '/assets/vendors_hero_ads/dribble_1.mp4', name: 'OpusStudio',          avatar: '/assets/images/beautiful_bride.jpg' },
  { src: '/assets/vendors_hero_ads/dribble_3.mp4', name: 'Serengeti Sounds',    avatar: '/assets/images/mauzo_crew.jpg' },
  { src: '/assets/vendors_hero_ads/dribble_4.mp4', name: 'Bloom & Petals',      avatar: '/assets/images/flowers_pinky.jpg' },
  { src: '/assets/vendors_hero_ads/dribble_6.mp4', name: 'Ivory Table Co.',     avatar: '/assets/images/couples_together.jpg' },
]

function HeroVideoCard() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [current, setCurrent] = useState(0)
  const [visible, setVisible] = useState(true)
  const [displayed, setDisplayed] = useState(0)

  const advance = useCallback(() => {
    setCurrent((prev) => (prev + 1) % HERO_VIDEOS.length)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.src = HERO_VIDEOS[current].src
    video.play().catch(() => {})

    setVisible(false)
    const t = setTimeout(() => {
      setDisplayed(current)
      setVisible(true)
    }, 250)
    return () => clearTimeout(t)
  }, [current])

  const vendor = HERO_VIDEOS[displayed]

  return (
    <div className="overflow-hidden rounded-2xl bg-[#1A1A1A] relative aspect-4/3 shadow-2xl sm:rounded-3xl">
      <video
        ref={videoRef}
        src={HERO_VIDEOS[0].src}
        autoPlay
        muted
        playsInline
        onEnded={advance}
        className="h-full w-full object-cover"
      />

      <div
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(6px)',
          transition: 'opacity 0.3s ease, transform 0.3s ease',
        }}
        className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-white/90 py-1 pl-1 pr-2.5 shadow-sm backdrop-blur-sm"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={vendor.avatar}
          alt={vendor.name}
          className="h-5 w-5 rounded-full object-cover"
        />
        <span className="text-[11px] font-bold text-[#1A1A1A]">{vendor.name}</span>
      </div>
    </div>
  )
}

function HeroSection() {
  const [activeTab, setActiveTab] = useState('Venues')
  const [searchValue, setSearchValue] = useState('')
  const router = useRouter()

  const handleSearch = () => {
    const params = new URLSearchParams()
    if (searchValue.trim()) params.set('q', searchValue.trim())
    const categoryId = TAB_CATEGORY_MAP[activeTab]
    if (categoryId) params.set('category', categoryId)
    router.push(`${BROWSE_PATH}?${params.toString()}`)
  }

  return (
    <div className="flex w-full flex-col items-start gap-10 lg:flex-row lg:gap-16 2xl:gap-24 3xl:gap-32">
      <div className="w-full min-w-0 flex-1 pt-2 lg:pt-6">
        <h1 className="text-[1.7rem] font-extrabold tracking-tight leading-[1.05] mb-5 text-[#1A1A1A] min-[400px]:text-[2rem] sm:text-[2.6rem] md:text-5xl lg:text-[3.2vw] xl:text-[56px] 2xl:text-[68px] 3xl:text-[80px]">
          Discover the<br /><span className="whitespace-nowrap">Best Wedding Vendors</span>
        </h1>
        <p className="mb-8 text-base font-medium leading-relaxed text-gray-500 sm:text-lg">
          Verified wedding professionals across Tanzania, all in one place.
        </p>

        <div className="mb-7 -mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {HERO_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.label
            return (
              <button data-opus-button="control"
                key={tab.label}
                onClick={() => setActiveTab(tab.label)}
                className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${
                  isActive ? 'bg-[#C9A0DC] text-[#1A1A1A]' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="mb-6 flex items-center gap-2">
          <div className="relative min-w-0 flex-1 group/search">
            <div className="absolute -inset-[2px] rounded-full bg-size-[200%_100%] animate-[shimmer_3s_ease-in-out_infinite] bg-linear-to-r from-[#C9A0DC]/20 via-[#C9A0DC] to-[#C9A0DC]/20 opacity-50 group-focus-within/search:opacity-80 transition-opacity" />
            <input
              type="search"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={
                activeTab === 'Venues' ? 'Search venues — beachfront, ballroom, garden…' :
                activeTab === 'Photographers' ? 'Search photographers — editorial, documentary…' :
                activeTab === 'Catering' ? 'Search caterers — buffet, plated, fusion…' :
                'Search MCs — bilingual, high-energy, formal…'
              }
              className="relative w-full"
            />
          </div>
          <button data-opus-button="control"
            onClick={handleSearch}
            className="opus-button opus-button--primary opus-button--medium"
          >
            Search
          </button>
        </div>

        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 whitespace-nowrap text-sm font-bold text-[#1A1A1A]">{POPULAR_BY_TAB[activeTab]?.label ?? 'Popular:'}</span>
          {(POPULAR_BY_TAB[activeTab]?.items ?? []).map((tag) => (
            <button data-opus-button="control"
              key={tag}
              onClick={() => {
                const params = new URLSearchParams({ q: tag })
                const categoryId = TAB_CATEGORY_MAP[activeTab]
                if (categoryId) params.set('category', categoryId)
                router.push(`${BROWSE_PATH}?${params.toString()}`)
              }}
              className="shrink-0 whitespace-nowrap rounded-full border border-gray-200 px-3.5 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 w-full min-w-0 lg:pt-6">
        <HeroVideoCard />
      </div>
    </div>
  )
}

function CardImageCarousel({ vendor }: { vendor: (typeof vendors)[number] }) {
  const images = getVendorCardImages(vendor)
  const [idx, setIdx] = useState(0)
  const dragStart = useRef<number | null>(null)

  const prev = (e: React.MouseEvent) => {
    e.preventDefault()
    setIdx((i) => (i - 1 + images.length) % images.length)
  }
  const next = (e: React.MouseEvent) => {
    e.preventDefault()
    setIdx((i) => (i + 1) % images.length)
  }

  const onTouchStart = (e: React.TouchEvent) => { dragStart.current = e.touches[0].clientX }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (dragStart.current === null) return
    const diff = dragStart.current - e.changedTouches[0].clientX
    if (diff > 40) setIdx((i) => (i + 1) % images.length)
    else if (diff < -40) setIdx((i) => (i - 1 + images.length) % images.length)
    dragStart.current = null
  }

  return (
    <div
      className="group/img relative aspect-square overflow-hidden rounded-2xl bg-gray-100"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[idx]}
        alt={vendor.heroMedia.alt}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      />

      {images.length > 1 && (
        <>
          <button data-opus-button="control"
            onClick={prev}
            aria-label="Previous image"
            className="absolute left-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm opacity-0 transition-opacity group-hover/img:opacity-100 hover:bg-white"
          >
            <ArrowRight size={13} className="rotate-180 text-black" />
          </button>
          <button data-opus-button="control"
            onClick={next}
            aria-label="Next image"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm opacity-0 transition-opacity group-hover/img:opacity-100 hover:bg-white"
          >
            <ArrowRight size={13} className="text-black" />
          </button>

          <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1">
            {images.map((_, i) => (
              <button data-opus-button="control"
                key={i}
                onClick={(e) => { e.preventDefault(); setIdx(i) }}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? 'w-3.5 bg-white' : 'w-1.5 bg-white/60'}`}
              />
            ))}
          </div>
        </>
      )}

      <div className="absolute left-3 top-3 flex flex-wrap gap-1">
        {vendor.featured && (
          <span className="rounded-full border border-[#C9A0DC] bg-[rgba(201,160,220,0.85)] px-2.5 py-0.5 text-[10px] font-semibold text-black backdrop-blur-sm">
            Featured
          </span>
        )}
        {vendor.badge && (
          <span className="rounded-full border border-white/40 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold text-black backdrop-blur-sm">
            {vendor.badge}
          </span>
        )}
      </div>

      <button data-opus-button="control"
        onClick={(e) => e.preventDefault()}
        aria-label="Save to favourites"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
      >
        <Heart size={13} className="text-gray-500" />
      </button>
    </div>
  )
}

function ListingCard({ vendor }: { vendor: (typeof vendors)[number] }) {
  const isNew = vendor.badge === 'New'
  const startingPrice = vendor.priceRange.split('–')[0].trim()

  return (
    <Link
      href={`${VENDORS_BASE_PATH}/${vendor.slug}`}
      className="font-sans-dm group flex flex-col bg-white transition-all duration-300 hover:-translate-y-1"
    >
      <CardImageCarousel vendor={vendor} />

      <div className="pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <h3 className="font-display truncate text-[16px] leading-snug text-black">{vendor.name}</h3>
            {vendor.badge === 'Verified' && (
              <BadgeCheck size={15} className="shrink-0 text-[#C9A0DC]" fill="currentColor" color="white" aria-label="Verified vendor" />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 text-[11px] text-gray-400">
            {vendor.reviewCount > 0 ? (
              <>
                <Star size={9} className="text-[#F5A623]" fill="currentColor" />
                <span className="font-semibold text-black">{vendor.rating.toFixed(1)}</span>
                <span className="text-gray-300">·</span>
              </>
            ) : (
              <>
                <Star size={9} className="text-[#9FE870]" fill="currentColor" />
                <span className="font-semibold text-[#9FE870]">New</span>
                <span className="text-gray-300">·</span>
              </>
            )}
            <Eye size={9} />
            <span>
              {vendor.reviewCount * 18 >= 1000
                ? `${(vendor.reviewCount * 18 / 1000).toFixed(1).replace(/\.0$/, '')}k`
                : vendor.reviewCount * 18}
            </span>
          </div>
        </div>

        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
          <MapPin size={9} className="shrink-0" />
          <span className="truncate">{vendor.city}</span>
        </div>

        {vendor.excerpt && (
          <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-gray-500">{vendor.excerpt}</p>
        )}

        {(vendor.badge === 'Top Rated' || vendor.featured || vendor.reviewCount >= 30) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-gray-400">
            {(vendor.badge === 'Top Rated' || vendor.featured) && (
              <>
                <span>🏆 Award winner (1x)</span>
                {vendor.reviewCount >= 30 && <span className="text-gray-300">·</span>}
              </>
            )}
            {vendor.reviewCount >= 30 && <span>⚡ Responds quickly</span>}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] text-gray-400">starting at</p>
            <p className="font-display text-[16px] leading-none text-black">{startingPrice}</p>
          </div>
          {isNew ? (
            <span className="rounded-full border border-[#C9A0DC] px-4 py-1.5 text-[12px] font-semibold text-black transition-colors group-hover:bg-[rgba(201,160,220,0.15)]">
              Get a quote
            </span>
          ) : (
            <span className="rounded-full bg-[#C9A0DC] px-4 py-1.5 text-[12px] font-semibold text-black transition-colors group-hover:bg-[#b98dcc]">
              Get a quote
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

// Maps card index to Tailwind classes that hide it below the breakpoint where a new column appears
const cardVisibility = [
  '',                 // index 0 - always visible
  'hidden sm:block',  // index 1 - sm+
  'hidden lg:block',  // index 2 - lg+
  'hidden xl:block',  // index 3 - xl+
  'hidden 2xl:block', // index 4 - 2xl+
  'hidden 3xl:block', // index 5 - 3xl+
]

function VendorRow({ vendors: rows }: { vendors: (typeof vendors) }) {
  return (
    <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {rows.map((vendor, i) => (
        <div key={vendor.id} className={cardVisibility[i] ?? 'hidden'}>
          <ListingCard vendor={vendor} />
        </div>
      ))}
    </div>
  )
}

function SectionHeader({
  title,
  description,
  href,
  ctaLabel,
}: {
  title: string
  description?: string
  href?: string
  ctaLabel?: string
}) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <div>
        <h2 className="text-[1.25rem] font-semibold text-[#1A1A1A] sm:text-[1.4rem] 2xl:text-[1.65rem] 3xl:text-[1.9rem]">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-[13px] text-gray-400">{description}</p>
        )}
      </div>
      {href ? (
        <Link
          href={href}
          className="group shrink-0 self-center flex items-center gap-1.5 text-[13px] font-bold text-[#1A1A1A] underline underline-offset-4 decoration-[#C9A0DC]"
        >
          {ctaLabel ?? 'View all'}
          <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  )
}

function CategoryBrowseStrip() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const syncArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }, [])

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'right' ? 500 : -500, behavior: 'smooth' })
    setTimeout(syncArrows, 400)
  }

  return (
    <section className="px-4 py-10 sm:px-6 sm:py-14 2xl:px-10 2xl:py-18 3xl:px-16 bg-[#F7F5F2]">
      <div className={`${pageClass} mb-6 flex items-end justify-between`}>
        <div>
          <h2 className="font-display text-[1.5rem] sm:text-[1.8rem] 2xl:text-[2.1rem] leading-tight text-[#1A1A1A]">
            Browse by category
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 sm:flex">
            <button data-opus-button="control"
              onClick={() => scroll('left')}
              aria-label="Scroll left"
              disabled={!canScrollLeft}
              style={{ background: canScrollLeft ? '#C9A0DC' : '#ffffff' }}
              className="flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-all"
            >
              <ArrowRight size={14} className="rotate-180 text-[#1A1A1A]" />
            </button>
            <button data-opus-button="control"
              onClick={() => scroll('right')}
              aria-label="Scroll right"
              disabled={!canScrollRight}
              style={{ background: canScrollRight ? '#C9A0DC' : '#ffffff' }}
              className="flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-all"
            >
              <ArrowRight size={14} className="text-[#1A1A1A]" />
            </button>
          </div>
        </div>
      </div>

      <div className={pageClass}>
      <div
        ref={scrollRef}
        onScroll={syncArrows}
        className="flex gap-3 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory"
      >
        {vendorCategories.map((category) => {
          const Icon = categoryIcons[category.id]
          const coverVendor = vendors.find((v) => v.categoryId === category.id)
          const coverSrc = coverVendor?.heroMedia.src ?? '/assets/images/coupleswithpiano.jpg'

          return (
            <Link
              key={category.id}
              href={`${BROWSE_PATH}?category=${category.id}`}
              className="group snap-start shrink-0 w-[138px] sm:w-[158px] lg:w-[178px] xl:w-[198px] 2xl:w-[215px]"
            >
              <div className="relative w-full overflow-hidden rounded-2xl aspect-3/4 bg-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverSrc}
                  alt={category.label}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/15 to-transparent" />
                {Icon && (
                  <div className="absolute left-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm">
                    <Icon size={13} className="text-[#1A1A1A]" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-[12px] font-bold leading-tight text-white">{category.label}</p>
                  <p className="mt-0.5 text-[10px] text-white/60">{category.count} vendors</p>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
      </div>
    </section>
  )
}

export default function VendorsIndexPage() {
  return (
    <main className="bg-white text-[#1A1A1A]">
      <section className="px-4 pb-10 pt-10 sm:px-6 sm:pb-12 sm:pt-14 2xl:px-10 2xl:pt-20 3xl:px-16 3xl:pt-24">
        <div className={pageClass}>
          <HeroSection />
        </div>
      </section>

      <CategoryBrowseStrip />

      <section className="px-4 py-6 sm:px-6 sm:py-8 2xl:px-10 2xl:py-12 3xl:px-16 3xl:py-16" id="guest-favourites">
        <div className={pageClass}>
          <SectionHeader
            title="Loved by couples"
            description="Vendors couples have been booking for their special day."
            href={BROWSE_PATH}
            ctaLabel="Browse all"
          />
          <VendorRow vendors={guestFavourites} />
        </div>
      </section>

      <section className="px-4 py-6 sm:px-6 sm:py-8 2xl:px-10 2xl:py-12 3xl:px-16 3xl:py-16">
        <div className={pageClass}>
          <SectionHeader
            title="Beyond the venue"
            description="Music, florals, transport, and everything in between."
            href={BROWSE_PATH}
            ctaLabel="Explore all"
          />
          <VendorRow vendors={planningRow} />
        </div>
      </section>

      <section className="px-4 py-6 sm:px-6 sm:py-8 2xl:px-10 2xl:py-12 3xl:px-16 3xl:py-16">
        <div className={pageClass}>
          <SectionHeader
            title="Guests keep coming back"
            description="Vendors with a history of happy couples and memorable weddings."
            href={BROWSE_PATH}
            ctaLabel="See more"
          />
          <VendorRow vendors={promotionsRow} />
        </div>
      </section>

      <section className="px-4 py-6 sm:px-6 sm:py-8 2xl:px-10 2xl:py-12 3xl:px-16 3xl:py-16">
        <div className={pageClass}>
          <SectionHeader
            title="Discover more vendors"
            description="More talented vendors ready to make your day special."
            href={BROWSE_PATH}
            ctaLabel="Explore all"
          />
          <VendorRow vendors={newVendorsRow} />
        </div>
      </section>

      <VendorsBottomCta />
    </main>
  )
}
