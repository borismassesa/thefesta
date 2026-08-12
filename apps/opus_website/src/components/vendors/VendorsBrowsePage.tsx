'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { LucideIcon } from 'lucide-react'
import {
  Star,
  Eye,
  MapPin,
  BadgeCheck,
  Heart,
  ArrowRight,
  X,
  Check,
  ChevronDown,
  Camera,
  Music4,
  Flower2,
  UtensilsCrossed,
  Sparkles,
  CakeSlice,
  CarFront,
  Users,
  Shirt,
  Gem,
  Mail,
  Lightbulb,
  Tent,
  Mic2,
  Globe,
  ShieldCheck,
  Video,
  LayoutList,
  LayoutGrid,
  Map,
  SlidersHorizontal,
} from 'lucide-react'
import {
  vendors as seedVendors,
  vendorCategories,
  vendorCities,
  VENDORS_BASE_PATH,
} from '@/lib/vendors'
import type { Vendor, VendorCategoryId } from '@/lib/vendors'
import { vendorCardAvatar, vendorStartingPrice } from '@/lib/vendors'
import { getFallbackHeroImage, getVendorCardImages } from '@/lib/vendor-images'
import { BROWSE_FOOTER_VISIBILITY_EVENT } from './VendorsFooterGate'

const VendorsMap = dynamic(() => import('./VendorsMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-400">Loading map…</p>
    </div>
  ),
})

const pageClass = 'mx-auto w-full max-w-[72rem] 2xl:max-w-[90rem] 3xl:max-w-[112rem] 4xl:max-w-[140rem]'
const pageInsetClass = 'px-3 sm:px-4 2xl:px-8 3xl:px-12'

type ViewMode = 'list' | 'grid' | 'map'


const RATING_FILTERS = [
  { value: 4.5, label: '★★★★★  4.5 & above' },
  { value: 4.0, label: '★★★★☆  4.0 & above' },
  { value: 3.5, label: '★★★½☆  3.5 & above' },
]

const categoryIcons: Partial<Record<VendorCategoryId, LucideIcon>> = {
  venues: MapPin, photographers: Camera, videographers: Video,
  'djs-bands': Music4, florists: Flower2, caterers: UtensilsCrossed,
  'hair-makeup': Sparkles, 'wedding-cakes': CakeSlice, transportation: CarFront,
  'wedding-planners': Users, 'decor-styling': Sparkles, 'bridal-wear': Shirt,
  'groom-wear': Shirt, 'jewellery-rings': Gem, 'invitations-stationery': Mail,
  'sound-lighting': Lightbulb, 'tents-marquees': Tent, 'photo-booths': Camera,
  'officiant-mc': Mic2, 'honeymoon-travel': Globe, security: ShieldCheck,
  'caricature-entertainment': Users,
}

function parsePriceLow(r: string) {
  const m = r.match(/TZS\s+([\d.]+)M/)
  return m ? parseFloat(m[1]) : 0
}


function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} size={11} fill="currentColor"
          className={s <= Math.round(rating) ? 'text-[#F5A623]' : 'text-gray-200'} />
      ))}
    </div>
  )
}

// ── Checkbox row inside a dropdown ────────────────────────────────────────────
function DropdownCheckbox({
  checked, label, sublabel, icon: Icon, onClick,
}: {
  checked: boolean; label: string; sublabel?: string; icon?: LucideIcon; onClick: () => void
}) {
  return (
    <button data-opus-button="control"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] transition-colors ${
        checked ? 'bg-[rgba(201,160,220,0.12)] font-semibold text-[#1A1A1A]' : 'text-gray-600 hover:bg-[rgba(201,160,220,0.06)]'
      }`}
    >
      <div className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors ${
        checked ? 'border-[#C9A0DC] bg-[#C9A0DC]' : 'border-gray-300'
      }`}>
        {checked && <Check size={10} strokeWidth={3} className="text-[#1A1A1A]" />}
      </div>
      {Icon && <Icon size={12} className="shrink-0 text-gray-400" />}
      <span className="flex-1 truncate">{label}</span>
      {sublabel && <span className="text-[11px] text-gray-500">{sublabel}</span>}
    </button>
  )
}

// ── Accordion section inside the filter panel ────────────────────────────────
function AccordionFilter({
  label, activeCount = 0, defaultOpen = false, children,
}: {
  label: string
  activeCount?: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button data-opus-button="control"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-2 py-3.5 -mx-2 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold text-[#1A1A1A]">
          {label}
          {activeCount > 0 && (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#C9A0DC] px-1 text-[10px] font-black text-[#1A1A1A]">
              {activeCount}
            </span>
          )}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="pb-4 space-y-0.5">{children}</div>}
    </div>
  )
}

// ── Sticky horizontal filter bar ──────────────────────────────────────────────
function FilterBar({
  selectedCategories, onCategoryToggle,
  selectedCities, onCityToggle,
  minRating, onMinRatingChange,
  onClearAll, totalActive,
  viewMode, onViewChange,
  children,
}: {
  selectedCategories: VendorCategoryId[]
  onCategoryToggle: (id: VendorCategoryId) => void
  selectedCities: string[]
  onCityToggle: (id: string) => void
  minRating: number | null
  onMinRatingChange: (v: number | null) => void
  onClearAll: () => void
  totalActive: number
  viewMode: ViewMode
  onViewChange: (v: ViewMode) => void
  children?: React.ReactNode
}) {
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    if (panelOpen) {
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
    }
  }, [panelOpen])

  return (
    <>
      {/* ── Left side filter panel ── */}
      {panelOpen && (
        <div className="fixed inset-0 z-1001 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setPanelOpen(false)} />

          {/* Panel */}
          <div className="relative z-10 flex h-full w-full max-w-[440px] flex-col bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <span className="text-[15px] font-bold text-[#1A1A1A]">Filters</span>
              <button data-opus-button="control" onClick={() => setPanelOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1A1A1A] hover:bg-black transition-colors">
                <X size={16} className="text-white" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5">

              <AccordionFilter label="Category" activeCount={selectedCategories.length} defaultOpen>
                {vendorCategories.map((cat) => {
                  const Icon = categoryIcons[cat.id]
                  return (
                    <DropdownCheckbox
                      key={cat.id}
                      checked={selectedCategories.includes(cat.id)}
                      label={cat.label}
                      sublabel={String(cat.count)}
                      icon={Icon}
                      onClick={() => onCategoryToggle(cat.id)}
                    />
                  )
                })}
              </AccordionFilter>

              <AccordionFilter label="Location" activeCount={selectedCities.length}>
                {vendorCities.map((city) => (
                  <DropdownCheckbox
                    key={city.id}
                    checked={selectedCities.includes(city.id)}
                    label={city.label}
                    sublabel={String(city.vendorCount)}
                    icon={MapPin}
                    onClick={() => onCityToggle(city.id)}
                  />
                ))}
              </AccordionFilter>

              <AccordionFilter label="Price">
                {['Under TZS 1M', 'TZS 1M – 5M', 'TZS 5M – 15M', 'TZS 15M – 30M', 'TZS 30M+'].map((opt) => (
                  <DropdownCheckbox key={opt} checked={false} label={opt} onClick={() => {}} />
                ))}
              </AccordionFilter>

              <AccordionFilter label="Availability">
                {['Available weekends', 'Available weekdays', 'Available public holidays', 'Short notice bookings'].map((opt) => (
                  <DropdownCheckbox key={opt} checked={false} label={opt} onClick={() => {}} />
                ))}
              </AccordionFilter>

              <AccordionFilter label="Capacity">
                {['Under 50 guests', '50 – 100 guests', '100 – 200 guests', '200 – 500 guests', '500+ guests'].map((opt) => (
                  <DropdownCheckbox key={opt} checked={false} label={opt} onClick={() => {}} />
                ))}
              </AccordionFilter>

              <AccordionFilter label="Indoor / Outdoor">
                {['Indoor', 'Outdoor', 'Both'].map((opt) => (
                  <DropdownCheckbox key={opt} checked={false} label={opt} onClick={() => {}} />
                ))}
              </AccordionFilter>

              <AccordionFilter label="Venue Type">
                {['Garden', 'Ballroom', 'Beach', 'Rooftop', 'Historic building', 'Hotel', 'Farm / Ranch', 'Private estate'].map((opt) => (
                  <DropdownCheckbox key={opt} checked={false} label={opt} onClick={() => {}} />
                ))}
              </AccordionFilter>

              <AccordionFilter label="Included">
                {['In-house catering', 'Sound system', 'Lighting', 'Furniture & decor', 'Parking', 'Accommodation', 'Bridal suite'].map((opt) => (
                  <DropdownCheckbox key={opt} checked={false} label={opt} onClick={() => {}} />
                ))}
              </AccordionFilter>

              <AccordionFilter label="Award Winners">
                {['OpusFesta Award Winner', 'Top Rated', 'Couples\' Choice', 'Best Value'].map((opt) => (
                  <DropdownCheckbox key={opt} checked={false} label={opt} onClick={() => {}} />
                ))}
              </AccordionFilter>

              <AccordionFilter label="Amenities">
                {['Free parking', 'WiFi', 'Wheelchair accessible', 'Air conditioning', 'Bar / alcohol permitted', 'On-site kitchen', 'Swimming pool'].map((opt) => (
                  <DropdownCheckbox key={opt} checked={false} label={opt} onClick={() => {}} />
                ))}
              </AccordionFilter>

              <AccordionFilter label="Event Types">
                {['Wedding ceremony', 'Wedding reception', 'Engagement party', 'Bridal shower', 'Rehearsal dinner', 'Honeymoon'].map((opt) => (
                  <DropdownCheckbox key={opt} checked={false} label={opt} onClick={() => {}} />
                ))}
              </AccordionFilter>

              <AccordionFilter label="Rating" activeCount={minRating !== null ? 1 : 0}>
                {RATING_FILTERS.map((opt) => (
                  <DropdownCheckbox
                    key={opt.value}
                    checked={minRating === opt.value}
                    label={opt.label}
                    onClick={() => onMinRatingChange(minRating === opt.value ? null : opt.value)}
                  />
                ))}
              </AccordionFilter>

            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-5 py-4 flex items-center justify-between">
              <button data-opus-button="control"
                onClick={() => { onClearAll(); setPanelOpen(false) }}
                disabled={totalActive === 0}
                className="text-[13px] font-semibold text-gray-400 hover:text-[#1A1A1A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear all
              </button>
              <button data-opus-button="primary" data-opus-button-size="medium"
                onClick={() => setPanelOpen(false)}
                className="rounded-full bg-[#1A1A1A] px-5 py-2 text-[13px] font-bold text-white hover:bg-[#333] transition-colors"
              >
                Show results
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button data-opus-button="neutral" data-opus-button-size="large"
            onClick={() => setPanelOpen(true)}
            className={`flex shrink-0 items-center gap-2 rounded-full border bg-white px-4 py-3 text-[13px] font-semibold transition-all sm:px-5 sm:py-4 ${
              totalActive > 0
                ? 'border-[#C9A0DC] bg-[rgba(201,160,220,0.12)] text-[#1A1A1A]'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal size={14} />
            <span className="hidden sm:inline">Filters</span>
            {totalActive > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#C9A0DC] text-[9px] font-black text-[#1A1A1A]">
                {totalActive}
              </span>
            )}
          </button>

          {children && <div className="min-w-0 flex-1">{children}</div>}

          <div className="flex shrink-0 items-center rounded-full border border-gray-200 bg-white p-1">
            {(
              [
                { value: 'list' as ViewMode, icon: <LayoutList size={14} />, label: 'List', mobile: true  },
                { value: 'grid' as ViewMode, icon: <LayoutGrid size={14} />, label: 'Grid', mobile: true  },
                { value: 'map'  as ViewMode, icon: <Map size={14} />,         label: 'Map',  mobile: false },
              ] as const
            ).map((opt) => (
              <button data-opus-button="primary" data-opus-button-size="large"
                key={opt.value}
                onClick={() => onViewChange(opt.value)}
                title={opt.label}
                className={`items-center gap-1 rounded-full px-3 py-3 text-[13px] font-semibold transition-colors sm:px-4 ${opt.mobile ? 'flex' : 'hidden lg:flex'} ${
                  viewMode === opt.value ? 'bg-[#1A1A1A] text-white' : 'text-gray-400 hover:text-[#1A1A1A]'
                }`}
              >
                {opt.icon}
                <span className="hidden md:inline">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {totalActive > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedCategories.map((id) => {
              const cat = vendorCategories.find((c) => c.id === id)
              return (
                <button data-opus-button="control" key={id} onClick={() => onCategoryToggle(id)}
                  className="flex items-center gap-1 rounded-full bg-[rgba(201,160,220,0.15)] px-2.5 py-1 text-[11px] font-semibold text-[#1A1A1A] transition-colors hover:bg-[rgba(201,160,220,0.28)]">
                  {cat?.label} <X size={9} />
                </button>
              )
            })}
            {selectedCities.map((id) => {
              const city = vendorCities.find((c) => c.id === id)
              return (
                <button data-opus-button="control" key={id} onClick={() => onCityToggle(id)}
                  className="flex items-center gap-1 rounded-full bg-[rgba(201,160,220,0.15)] px-2.5 py-1 text-[11px] font-semibold text-[#1A1A1A] transition-colors hover:bg-[rgba(201,160,220,0.28)]">
                  {city?.label} <X size={9} />
                </button>
              )
            })}
            {minRating !== null && (
              <button data-opus-button="control" onClick={() => onMinRatingChange(null)}
                className="flex items-center gap-1 rounded-full bg-[rgba(201,160,220,0.15)] px-2.5 py-1 text-[11px] font-semibold text-[#1A1A1A] transition-colors hover:bg-[rgba(201,160,220,0.28)]">
                ★ {minRating}+ <X size={9} />
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ── List card (horizontal) ─────────────────────────────────────────────────────
function BrowseCard({ vendor, hovered, onHover }: {
  vendor: Vendor
  hovered?: boolean
  onHover?: (id: string | null) => void
}) {
  const router = useRouter()
  const startPrice = vendor.priceRange.split('–')[0].trim()
  const images = getVendorCardImages(vendor)
  const [idx, setIdx] = useState(0)
  const dragStart = useRef<number | null>(null)
  const prev = (e: React.MouseEvent) => { e.preventDefault(); setIdx((i) => (i - 1 + images.length) % images.length) }
  const next = (e: React.MouseEvent) => { e.preventDefault(); setIdx((i) => (i + 1) % images.length) }
  const goToContact = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    router.push(`${VENDORS_BASE_PATH}/${vendor.slug}#vendor-contact`)
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
    <Link
      href={`${VENDORS_BASE_PATH}/${vendor.slug}`}
      onMouseEnter={() => onHover?.(vendor.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`group flex flex-col gap-4 rounded-2xl border bg-white p-4 transition-all sm:flex-row sm:gap-5 ${
        hovered ? 'border-[#C9A0DC] shadow-md' : 'border-gray-100 hover:border-gray-200 hover:shadow-md'
      }`}
    >
      <div className="group/img relative h-[210px] w-full shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:h-[240px] sm:w-[300px]"
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[idx]} alt={vendor.heroMedia.alt}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />

        {images.length > 1 && (
          <>
            <button data-opus-button="control" onClick={prev} aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm opacity-0 transition-opacity group-hover/img:opacity-100 hover:bg-white">
              <ArrowRight size={13} className="rotate-180 text-black" />
            </button>
            <button data-opus-button="control" onClick={next} aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm opacity-0 transition-opacity group-hover/img:opacity-100 hover:bg-white">
              <ArrowRight size={13} className="text-black" />
            </button>
            <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1">
              {images.map((_, i) => (
                <button data-opus-button="control" key={i} onClick={(e) => { e.preventDefault(); setIdx(i) }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? 'w-3.5 bg-white' : 'w-1.5 bg-white/60'}`} />
              ))}
            </div>
          </>
        )}

        {vendor.badge && (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-[#1A1A1A] backdrop-blur-sm">
            {vendor.badge}
          </span>
        )}
        <button data-opus-button="control" onClick={(e) => e.preventDefault()} aria-label="Save"
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm hover:bg-white">
          <Heart size={11} className="text-gray-400" />
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col py-1">

        {/* 1. Name + verified — identity first */}
        <h3 className="flex items-center gap-2 text-[17px] font-bold leading-snug text-[#1A1A1A] sm:text-[18px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={vendorCardAvatar(vendor).src || getFallbackHeroImage(vendor.id)} alt="" className={`h-8 w-8 shrink-0 rounded-full ${vendorCardAvatar(vendor).isLogo ? 'bg-white object-contain' : 'object-cover'}`} />
          <span className="truncate">{vendor.name}</span>
          {vendor.badge === 'Verified' && (
            <BadgeCheck size={15} className="shrink-0 text-[#C9A0DC]" fill="currentColor" color="white" aria-label="Verified" />
          )}
        </h3>

        {/* 2. Category · Location — context */}
        <p className="mt-1 flex items-center gap-1 text-[12px] text-gray-400">
          <span>{vendor.category}</span>
          <span className="text-gray-300">·</span>
          <MapPin size={10} className="shrink-0" />
          <span>{vendor.city}</span>
        </p>

        {/* 3. Rating + accolades — trust signals */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-[12px]">
            <StarRating rating={vendor.rating} />
            <span className="font-bold text-[#1A1A1A]">{vendor.rating.toFixed(1)}</span>
            <span className="text-gray-400">({vendor.reviewCount})</span>
          </div>
          {vendor.badge === 'Top Rated' && (
            <span className="rounded-full bg-[rgba(201,160,220,0.15)] px-2.5 py-0.5 text-[10px] font-bold text-[#7a4b8a]">Top Rated</span>
          )}
          {vendor.featured && (
            <span className="rounded-full bg-[rgba(245,166,35,0.12)] px-2.5 py-0.5 text-[10px] font-bold text-[#8a5a00]">Featured</span>
          )}
          {vendor.reviewCount >= 30 && (
            <span className="text-[11px] text-gray-400">⚡ Quick responder</span>
          )}
        </div>

        {/* 4. Description */}
        <p className="mt-3 text-[13px] leading-relaxed text-gray-500">{vendor.excerpt}</p>

        {/* 5. Price + CTA */}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div>
            <p className="text-[10px] text-gray-400">Starting at</p>
            <p className="text-[15px] font-bold text-[#1A1A1A]">{startPrice}</p>
          </div>
          <button data-opus-button="primary" data-opus-button-size="small"
            type="button"
            onClick={goToContact}
            className="shrink-0 rounded-full bg-[#C9A0DC] px-4 py-1.5 text-[12px] font-bold text-[#1A1A1A] transition-colors hover:bg-[#b98dcc]"
          >
            Get a quote
          </button>
        </div>
      </div>
    </Link>
  )
}

// ── Grid card ──────────────────────────────────────────────────────────────────
function GridCardImageCarousel({ vendor }: { vendor: Vendor }) {
  const images = getVendorCardImages(vendor)
  const [idx, setIdx] = useState(0)
  const dragStart = useRef<number | null>(null)

  const prev = (e: React.MouseEvent) => { e.preventDefault(); setIdx((i) => (i - 1 + images.length) % images.length) }
  const next = (e: React.MouseEvent) => { e.preventDefault(); setIdx((i) => (i + 1) % images.length) }
  const onTouchStart = (e: React.TouchEvent) => { dragStart.current = e.touches[0].clientX }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (dragStart.current === null) return
    const diff = dragStart.current - e.changedTouches[0].clientX
    if (diff > 40) setIdx((i) => (i + 1) % images.length)
    else if (diff < -40) setIdx((i) => (i - 1 + images.length) % images.length)
    dragStart.current = null
  }

  return (
    <div className="group/img relative aspect-square overflow-hidden rounded-2xl bg-gray-100" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={images[idx]} alt={vendor.heroMedia.alt} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />

      {images.length > 1 && (
        <>
          <button data-opus-button="control" onClick={prev} aria-label="Previous image" className="absolute left-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm opacity-0 transition-opacity group-hover/img:opacity-100 hover:bg-white">
            <ArrowRight size={13} className="rotate-180 text-black" />
          </button>
          <button data-opus-button="control" onClick={next} aria-label="Next image" className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm opacity-0 transition-opacity group-hover/img:opacity-100 hover:bg-white">
            <ArrowRight size={13} className="text-black" />
          </button>
          <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1">
            {images.map((_, i) => (
              <button data-opus-button="control" key={i} onClick={(e) => { e.preventDefault(); setIdx(i) }}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? 'w-3.5 bg-white' : 'w-1.5 bg-white/60'}`} />
            ))}
          </div>
        </>
      )}

      <div className="absolute left-3 top-3 flex flex-wrap gap-1">
        {vendor.featured && (
          <span className="rounded-full border border-[#C9A0DC] bg-[rgba(201,160,220,0.85)] px-2.5 py-0.5 text-[10px] font-semibold text-black backdrop-blur-sm">Featured</span>
        )}
        {vendor.badge && (
          <span className="rounded-full border border-white/40 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold text-black backdrop-blur-sm">{vendor.badge}</span>
        )}
      </div>

      <button data-opus-button="control" onClick={(e) => e.preventDefault()} aria-label="Save to favourites"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-white">
        <Heart size={13} className="text-gray-500" />
      </button>
    </div>
  )
}

function GridCard({ vendor }: { vendor: Vendor }) {
  const router = useRouter()
  const isNew = vendor.badge === 'New'
  const startingPrice = vendorStartingPrice(vendor)
  const goToContact = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    router.push(`${VENDORS_BASE_PATH}/${vendor.slug}#vendor-contact`)
  }

  return (
    <Link href={`${VENDORS_BASE_PATH}/${vendor.slug}`}
      className="font-sans-dm group flex flex-col bg-white transition-all duration-300 hover:-translate-y-1">
      <GridCardImageCarousel vendor={vendor} />

      <div className="pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={vendorCardAvatar(vendor).src || getFallbackHeroImage(vendor.id)} alt="" className={`h-6 w-6 shrink-0 rounded-full ${vendorCardAvatar(vendor).isLogo ? 'bg-white object-contain' : 'object-cover'}`} />
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
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[#9FE870] px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-[#1A1A1A]">
                  <Star size={8} fill="currentColor" />
                  New
                </span>
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

        {vendor.excerpt && (
          <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-gray-500">{vendor.excerpt}</p>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] text-gray-400">starting at</p>
            <p className="font-display text-[16px] leading-none text-black">{startingPrice}</p>
          </div>
          {isNew ? (
            <button data-opus-button="neutral" data-opus-button-size="small" type="button" onClick={goToContact} className="rounded-full border border-[#C9A0DC] px-4 py-1.5 text-[12px] font-semibold text-black transition-colors hover:bg-[rgba(201,160,220,0.15)]">Get a quote</button>
          ) : (
            <button data-opus-button="primary" data-opus-button-size="small" type="button" onClick={goToContact} className="rounded-full bg-[#C9A0DC] px-4 py-1.5 text-[12px] font-semibold text-black transition-colors hover:bg-[#b98dcc]">Get a quote</button>
          )}
        </div>
      </div>
    </Link>
  )
}

// ── Map list card ─────────────────────────────────────────────────────────────
function MapListCard({ vendor, onHover, onClick }: {
  vendor: Vendor
  onHover: (id: string | null) => void; onClick: (id: string) => void
}) {
  const router = useRouter()
  const isNew = vendor.badge === 'New'
  const startingPrice = vendorStartingPrice(vendor)
  const images = getVendorCardImages(vendor)
  const [idx, setIdx] = useState(0)
  const dragStart = useRef<number | null>(null)

  const prev = (e: React.MouseEvent) => { e.preventDefault(); setIdx((i) => (i - 1 + images.length) % images.length) }
  const next = (e: React.MouseEvent) => { e.preventDefault(); setIdx((i) => (i + 1) % images.length) }
  const goToContact = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    router.push(`${VENDORS_BASE_PATH}/${vendor.slug}#vendor-contact`)
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
    <Link
      href={`${VENDORS_BASE_PATH}/${vendor.slug}`}
      onMouseEnter={() => onHover(vendor.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(vendor.id)}
      className="font-sans-dm group flex flex-col bg-white transition-all duration-300 hover:-translate-y-1"
    >
      <div className="group/img relative aspect-square overflow-hidden rounded-2xl bg-gray-100" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[idx]} alt={vendor.heroMedia.alt} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />

        {images.length > 1 && (
          <>
            <button data-opus-button="control" onClick={prev} aria-label="Previous image" className="absolute left-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm opacity-0 transition-opacity group-hover/img:opacity-100 hover:bg-white">
              <ArrowRight size={13} className="rotate-180 text-black" />
            </button>
            <button data-opus-button="control" onClick={next} aria-label="Next image" className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm opacity-0 transition-opacity group-hover/img:opacity-100 hover:bg-white">
              <ArrowRight size={13} className="text-black" />
            </button>
            <div className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1">
              {images.map((_, i) => (
                <button data-opus-button="control" key={i} onClick={(e) => { e.preventDefault(); setIdx(i) }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? 'w-3.5 bg-white' : 'w-1.5 bg-white/60'}`} />
              ))}
            </div>
          </>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-1">
          {vendor.featured && (
            <span className="rounded-full border border-[#C9A0DC] bg-[rgba(201,160,220,0.85)] px-2.5 py-0.5 text-[10px] font-semibold text-black backdrop-blur-sm">Featured</span>
          )}
          {vendor.badge && (
            <span className="rounded-full border border-white/40 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold text-black backdrop-blur-sm">{vendor.badge}</span>
          )}
        </div>

        <button data-opus-button="control" onClick={(e) => e.preventDefault()} aria-label="Save to favourites"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-white">
          <Heart size={13} className="text-gray-500" />
        </button>
      </div>

      <div className="pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={vendorCardAvatar(vendor).src || getFallbackHeroImage(vendor.id)} alt="" className={`h-6 w-6 shrink-0 rounded-full ${vendorCardAvatar(vendor).isLogo ? 'bg-white object-contain' : 'object-cover'}`} />
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
                <span className="inline-flex items-center gap-0.5 rounded-full bg-[#9FE870] px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-[#1A1A1A]">
                  <Star size={8} fill="currentColor" />
                  New
                </span>
                <span className="text-gray-300">·</span>
              </>
            )}
            <Eye size={9} />
            <span>{vendor.reviewCount * 18 >= 1000 ? `${(vendor.reviewCount * 18 / 1000).toFixed(1).replace(/\.0$/, '')}k` : vendor.reviewCount * 18}</span>
          </div>
        </div>

        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
          <MapPin size={9} className="shrink-0" />
          <span className="truncate">{vendor.city}</span>
        </div>

        {(vendor.badge === 'Top Rated' || vendor.featured || vendor.reviewCount >= 30) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-gray-400">
            {(vendor.badge === 'Top Rated' || vendor.featured) && (
              <><span>🏆 Award winner (1x)</span>{vendor.reviewCount >= 30 && <span className="text-gray-300">·</span>}</>
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
            <button data-opus-button="neutral" data-opus-button-size="small" type="button" onClick={goToContact} className="rounded-full border border-[#C9A0DC] px-4 py-1.5 text-[12px] font-semibold text-black transition-colors hover:bg-[rgba(201,160,220,0.15)]">Get a quote</button>
          ) : (
            <button data-opus-button="primary" data-opus-button-size="small" type="button" onClick={goToContact} className="rounded-full bg-[#C9A0DC] px-4 py-1.5 text-[12px] font-semibold text-black transition-colors hover:bg-[#b98dcc]">Get a quote</button>
          )}
        </div>
      </div>
    </Link>
  )
}

// ── SEO banner ─────────────────────────────────────────────────────────────────

// ── Main page ──────────────────────────────────────────────────────────────────
export default function VendorsBrowsePage({
  initialVendors,
}: {
  // Server pages pass the live vendor list (Supabase + marketplace + seed
  // merge from `loadVendorsFromSupabase`). Falls back to the static seed
  // module when rendered without props (e.g. from an old caller).
  initialVendors?: Vendor[]
} = {}) {
  const allVendors: Vendor[] = initialVendors ?? seedVendors
  const searchParams = useSearchParams()
  const initialCategory = searchParams.get('category') as VendorCategoryId | null
  const initialQuery    = searchParams.get('q') ?? ''

  const [query,              setQuery]              = useState(initialQuery)
  const [selectedCategories, setSelectedCategories] = useState<VendorCategoryId[]>(initialCategory ? [initialCategory] : [])
  const [selectedCities,     setSelectedCities]     = useState<string[]>([])
  const [minRating,          setMinRating]          = useState<number | null>(null)
  const [sortBy]                                    = useState('featured')
  const [page,               setPage]               = useState(1)
  const [viewMode,           setViewMode]           = useState<ViewMode>('grid')
  const [activeVendorId,     setActiveVendorId]     = useState<string | null>(null)
  const [hoveredVendorId,    setHoveredVendorId]    = useState<string | null>(null)
  const [isMapListAtEnd,     setIsMapListAtEnd]     = useState(false)
  const mapListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const mapListTargetScrollRef = useRef(0)
  const mapListAnimationFrameRef = useRef<number | null>(null)

  const handleCategoryToggle = useCallback((id: VendorCategoryId) => {
    setSelectedCategories((p) => p.includes(id) ? p.filter((c) => c !== id) : [...p, id])
    setPage(1)
  }, [])

  const handleCityToggle = useCallback((id: string) => {
    setSelectedCities((p) => p.includes(id) ? p.filter((c) => c !== id) : [...p, id])
    setPage(1)
  }, [])

  const handleClearAll = useCallback(() => {
    setSelectedCategories([]); setSelectedCities([]); setMinRating(null); setQuery(''); setPage(1)
  }, [])

  useEffect(() => {
    if (!activeVendorId || !mapListRef.current) return
    mapListRef.current.querySelector(`[data-id="${activeVendorId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeVendorId])

  // Map view only renders the actual map at lg+; the Map toggle is hidden below
  // lg. If the viewport drops under lg while in map view (desktop → resize, or
  // tablet rotated to portrait), fall back to grid so the user never lands on a
  // mapless "map" view with no way to tell what happened.
  useEffect(() => {
    if (viewMode !== 'map') return
    const mq = window.matchMedia('(max-width: 1023px)')
    const apply = () => { if (mq.matches) setViewMode('grid') }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [viewMode])

  const syncMapListEndState = useCallback(() => {
    const container = mapListRef.current
    if (!container) {
      setIsMapListAtEnd(false)
      return false
    }

    const hasScrollableOverflow = container.scrollHeight > container.clientHeight + 1
    const reachedEnd = !hasScrollableOverflow || container.scrollTop + container.clientHeight >= container.scrollHeight - 4

    setIsMapListAtEnd(reachedEnd)
    return reachedEnd
  }, [])

  const stopMapListScrollAnimation = useCallback(() => {
    if (mapListAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(mapListAnimationFrameRef.current)
      mapListAnimationFrameRef.current = null
    }
  }, [])

  const animateMapListScroll = useCallback(() => {
    const container = mapListRef.current
    if (!container) {
      stopMapListScrollAnimation()
      return
    }

    const distance = mapListTargetScrollRef.current - container.scrollTop

    if (Math.abs(distance) < 0.5) {
      container.scrollTop = mapListTargetScrollRef.current
      syncMapListEndState()
      stopMapListScrollAnimation()
      return
    }

    container.scrollTop += distance * 0.16
    syncMapListEndState()
    mapListAnimationFrameRef.current = window.requestAnimationFrame(animateMapListScroll)
  }, [stopMapListScrollAnimation, syncMapListEndState])

  const startMapListScrollAnimation = useCallback(() => {
    if (mapListAnimationFrameRef.current !== null) return
    mapListAnimationFrameRef.current = window.requestAnimationFrame(animateMapListScroll)
  }, [animateMapListScroll])

  const handleMapListWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const container = mapListRef.current
    if (!container || container.scrollHeight <= container.clientHeight) return

    const atTop = container.scrollTop <= 0
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 4

    if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
      return
    }

    e.preventDefault()
    const maxScrollTop = container.scrollHeight - container.clientHeight
    const currentTarget = mapListAnimationFrameRef.current !== null ? mapListTargetScrollRef.current : container.scrollTop
    mapListTargetScrollRef.current = Math.max(0, Math.min(maxScrollTop, currentTarget + e.deltaY))
    startMapListScrollAnimation()
  }, [startMapListScrollAnimation])

  useEffect(() => {
    const showFooter = viewMode !== 'map' || isMapListAtEnd
    window.dispatchEvent(new CustomEvent(BROWSE_FOOTER_VISIBILITY_EVENT, { detail: { showFooter } }))

    return () => {
      window.dispatchEvent(new CustomEvent(BROWSE_FOOTER_VISIBILITY_EVENT, { detail: { showFooter: true } }))
    }
  }, [isMapListAtEnd, viewMode])

  const totalActive = selectedCategories.length + selectedCities.length + (minRating !== null ? 1 : 0) + (query.trim() ? 1 : 0)

  const filteredVendors = useMemo(() => {
    let r = [...allVendors]
    if (query.trim()) {
      const q = query.toLowerCase()
      r = r.filter((v) => v.name.toLowerCase().includes(q) || v.category.toLowerCase().includes(q) ||
                          v.excerpt.toLowerCase().includes(q) || v.city.toLowerCase().includes(q))
    }
    if (selectedCategories.length) r = r.filter((v) => selectedCategories.includes(v.categoryId))
    if (selectedCities.length) {
      r = r.filter((v) => selectedCities.some((cid) => vendorCities.find((vc) => vc.id === cid)?.label === v.city))
    }
    if (minRating !== null) r = r.filter((v) => v.rating >= minRating)
    switch (sortBy) {
      case 'rating':     r.sort((a, b) => b.rating - a.rating); break
      case 'reviews':    r.sort((a, b) => b.reviewCount - a.reviewCount); break
      case 'price-low':  r.sort((a, b) => parsePriceLow(a.priceRange) - parsePriceLow(b.priceRange)); break
      case 'price-high': r.sort((a, b) => parsePriceLow(b.priceRange) - parsePriceLow(a.priceRange)); break
      default:           r.sort((a, b) => { if (a.featured !== b.featured) return a.featured ? -1 : 1; return b.rating - a.rating })
    }
    return r
  }, [allVendors, query, selectedCategories, selectedCities, minRating, sortBy])

  useEffect(() => {
    syncMapListEndState()
  }, [filteredVendors.length, viewMode, syncMapListEndState])

  useEffect(() => {
    return () => {
      stopMapListScrollAnimation()
    }
  }, [stopMapListScrollAnimation])

  const PAGE_SIZE = 12
  const totalPages = Math.max(1, Math.ceil(filteredVendors.length / PAGE_SIZE))
  const visibleVendors = filteredVendors.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const activeCategory = selectedCategories.length === 1
    ? vendorCategories.find((c) => c.id === selectedCategories[0]) : null
const pageTitle = activeCategory ? `${activeCategory.label} in Tanzania` : 'Wedding Vendors in Tanzania'

  return (
    <main className="bg-white text-[#1A1A1A]">

      {/* ── Header ── */}
      <section className={`bg-[#F7F5F2] ${pageInsetClass} ${viewMode === 'map' ? 'py-3' : 'py-9'}`}>
        <div className={viewMode === 'map' ? pageClass : pageClass}>
          {viewMode !== 'map' && (
            <>
              <nav className="mb-4 flex items-center gap-1.5 text-[12px] text-gray-400">
                <Link href="/" className="hover:text-[#1A1A1A]">Home</Link>
                <ArrowRight size={10} className="text-gray-300" />
                <Link href="/vendors" className="hover:text-[#1A1A1A]">Vendors</Link>
                <ArrowRight size={10} className="text-gray-300" />
                {activeCategory ? (
                  <>
                    <Link href="/vendors/browse" className="hover:text-[#1A1A1A]">Browse All</Link>
                    <ArrowRight size={10} className="text-gray-300" />
                    <span className="rounded-full bg-[rgba(201,160,220,0.2)] border border-[#C9A0DC]/40 px-2.5 py-0.5 text-[11px] font-semibold text-[#1A1A1A]">{activeCategory.label}</span>
                  </>
                ) : (
                  <span className="rounded-full bg-[rgba(201,160,220,0.2)] border border-[#C9A0DC]/40 px-2.5 py-0.5 text-[11px] font-semibold text-[#1A1A1A]">Browse All</span>
                )}
              </nav>
              <h1 className="text-[clamp(1.1rem,5.1vw,2rem)] font-extrabold text-[#1A1A1A]">{pageTitle}</h1>
            </>
          )}
          <div className={viewMode !== 'map' ? 'mt-4' : undefined}>
            <FilterBar
              selectedCategories={selectedCategories} onCategoryToggle={handleCategoryToggle}
              selectedCities={selectedCities}         onCityToggle={handleCityToggle}
              minRating={minRating}                   onMinRatingChange={setMinRating}
              onClearAll={handleClearAll}             totalActive={totalActive}
viewMode={viewMode}                     onViewChange={setViewMode}
            >
              <div className="relative group/search">
                <div className="absolute -inset-[2px] rounded-full bg-size-[200%_100%] animate-[shimmer_3s_ease-in-out_infinite] bg-linear-to-r from-[#C9A0DC]/20 via-[#C9A0DC] to-[#C9A0DC]/20 opacity-50 group-focus-within/search:opacity-80 transition-opacity" />
                <input
                  ref={searchInputRef}
                  type="search" value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') searchInputRef.current?.blur() }}
                  placeholder="Search by name, category, or city…"
                  className="relative w-full rounded-full border-0 bg-white py-4 pl-5 pr-14 text-sm text-[#1A1A1A] placeholder:text-gray-400 focus:outline-none"
                />
              </div>
            </FilterBar>
          </div>
        </div>
      </section>

      {/* ── MAP VIEW ── */}
      {viewMode === 'map' && (
        <div className="flex min-h-0 overflow-hidden" style={{ height: 'calc(100dvh - 120px)', minHeight: 600 }}>
              {/* Left: 2-col grid */}
              <div
                ref={mapListRef}
                onScroll={() => {
                  const container = mapListRef.current
                  if (container && mapListAnimationFrameRef.current === null) {
                    mapListTargetScrollRef.current = container.scrollTop
                  }
                  syncMapListEndState()
                }}
                onWheel={handleMapListWheel}
                className="flex h-full min-h-0 w-full touch-pan-y flex-col overflow-y-scroll overscroll-y-contain pl-4 sm:pl-6 lg:pl-20 lg:w-[560px] xl:w-[620px] shrink-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                {filteredVendors.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                    <div className="mb-3 text-4xl">🔍</div>
                    <p className="text-sm font-bold">No vendors found</p>
                    <button data-opus-button="primary" data-opus-button-size="medium" onClick={handleClearAll}
                      className="mt-4 rounded-full bg-[#C9A0DC] px-5 py-2 text-sm font-bold text-[#1A1A1A]">
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-8 py-8 pr-4">
                    {filteredVendors.map((v) => (
                      <div key={v.id} data-id={v.id}>
                        <MapListCard vendor={v}
                          onHover={setHoveredVendorId} onClick={setActiveVendorId} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="hidden w-5 shrink-0 lg:block" />

              {/* Right: map */}
              <div
                className="hidden min-h-0 flex-1 lg:block pr-16 sm:pr-20 py-8"
                style={{ height: 'calc(100dvh - 120px)' }}
              >
                <div className="h-full overflow-hidden rounded-2xl" style={{ isolation: 'isolate' }}>
                  <VendorsMap
                    vendors={filteredVendors}
                    activeId={activeVendorId} hoveredId={hoveredVendorId}
                    onMarkerClick={setActiveVendorId} onMarkerHover={setHoveredVendorId}
                  />
                </div>
              </div>
        </div>
      )}

      {/* ── LIST / GRID VIEW ── */}
      {viewMode !== 'map' && (
        <section className={`py-8 ${pageInsetClass}`}>
          <div className={pageClass}>


            {filteredVendors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 text-5xl">🔍</div>
                <h3 className="text-lg font-bold">No vendors found</h3>
                <p className="mt-2 text-[13px] text-gray-500">Try adjusting your filters or search term.</p>
                <button data-opus-button="primary" data-opus-button-size="medium" onClick={handleClearAll}
                  className="mt-5 rounded-full bg-[#C9A0DC] px-6 py-2.5 text-sm font-bold text-[#1A1A1A] hover:bg-[#b98dcc]">
                  Clear all filters
                </button>
              </div>
            ) : viewMode === 'list' ? (
              <div className="space-y-3">
                {visibleVendors.map((v) => (
                  <BrowseCard key={v.id} vendor={v}
                    hovered={hoveredVendorId === v.id} onHover={setHoveredVendorId} />
                ))}
              </div>
            ) : (
              <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {visibleVendors.map((v) => <GridCard key={v.id} vendor={v} />)}
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-10 flex items-center justify-center gap-1">
                <button data-opus-button="control"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                >
                  <ArrowRight size={14} className="rotate-180" />
                </button>

                {(() => {
                  const pages: (number | '…')[] = []
                  if (totalPages <= 7) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i)
                  } else {
                    pages.push(1, 2, 3, 4)
                    if (page > 5) pages.push('…')
                    if (page > 4 && page < totalPages - 1) pages.push(page)
                    pages.push('…', totalPages)
                  }
                  return pages.map((p, i) =>
                    p === '…' ? (
                      <span key={`ellipsis-${i}`} className="flex h-9 w-9 items-center justify-center text-sm text-gray-400">…</span>
                    ) : (
                      <button data-opus-button="primary" data-opus-button-size="medium"
                        key={p}
                        onClick={() => setPage(p as number)}
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                          page === p ? 'bg-[#1A1A1A] text-white' : 'text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )
                })()}

                <button data-opus-button="control"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                >
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        </section>
      )}

    </main>
  )
}
