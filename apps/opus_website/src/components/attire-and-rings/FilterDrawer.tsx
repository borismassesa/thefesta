'use client'

import { useEffect, useState } from 'react'
import { SlidersHorizontal, X, Check } from 'lucide-react'

const PRICE_RANGES = [
  { id: 'any', label: 'Any price' },
  { id: 'under-100k', label: 'Under TZS 100,000' },
  { id: '100k-500k', label: 'TZS 100,000 – 500,000' },
  { id: '500k-1500k', label: 'TZS 500,000 – 1,500,000' },
  { id: '1500k-5m', label: 'TZS 1,500,000 – 5,000,000' },
  { id: 'over-5m', label: 'Over TZS 5,000,000' },
]

const ITEM_TYPES = [
  { id: 'all', label: 'All items' },
  { id: 'new', label: 'New' },
  { id: 'vintage', label: 'Pre-loved / Vintage' },
  { id: 'custom', label: 'Custom / Made-to-order' },
]

const RATINGS = [
  { id: 'any', label: 'Any rating' },
  { id: '4', label: '4 stars & up' },
  { id: '4.5', label: '4.5 stars & up' },
]

const LOCATIONS = ['Dar es Salaam', 'Arusha', 'Zanzibar', 'Mwanza', 'Moshi', 'Dodoma']
const VENDOR_TYPES = ['Verified boutique', 'Local jeweller', 'Master tailor', 'Designer label']
const PAYMENT = ['Mobile money (M-Pesa, Airtel, Tigo)', 'Card or bank transfer', 'Pay deposit only']
const ORDERING = ['Free fitting consultation', 'Express delivery in Tanzania', 'Can be gift-wrapped']
const SPECIAL_OFFERS = ['Free delivery in Dar es Salaam', 'On sale', "OpusFesta's Pick"]

function FilterSection({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="text-[15px] font-bold text-gray-900 mb-1">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 mb-3">{subtitle}</p>}
      <div className="space-y-2.5 pt-2">{children}</div>
    </div>
  )
}

function Check_Box({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-3 cursor-pointer text-sm text-gray-800 hover:text-gray-900">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
      />
      {label}
    </label>
  )
}

function RadioRow({
  name,
  id,
  label,
  checked,
  onChange,
}: {
  name: string
  id: string
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-3 cursor-pointer text-sm text-gray-800 hover:text-gray-900">
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 border-gray-300 text-gray-900 focus:ring-gray-900"
      />
      {label}
    </label>
  )
}

export default function FilterDrawer() {
  const [open, setOpen] = useState(false)
  const [specialOffers, setSpecialOffers] = useState<Set<string>>(new Set())
  const [itemType, setItemType] = useState('all')
  const [priceRange, setPriceRange] = useState('any')
  const [customLow, setCustomLow] = useState('')
  const [customHigh, setCustomHigh] = useState('')
  const [vendorTypes, setVendorTypes] = useState<Set<string>>(new Set())
  const [locations, setLocations] = useState<Set<string>>(new Set())
  const [payment, setPayment] = useState<Set<string>>(new Set())
  const [ordering, setOrdering] = useState<Set<string>>(new Set())
  const [rating, setRating] = useState('any')

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (set: Set<string>, val: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(val)) next.delete(val)
    else next.add(val)
    setter(next)
  }

  const clearAll = () => {
    setSpecialOffers(new Set())
    setItemType('all')
    setPriceRange('any')
    setCustomLow('')
    setCustomHigh('')
    setVendorTypes(new Set())
    setLocations(new Set())
    setPayment(new Set())
    setOrdering(new Set())
    setRating('any')
  }

  return (
    <>
      <button data-opus-button="control"
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-gray-300 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50 hover:border-gray-400 transition whitespace-nowrap shrink-0"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <SlidersHorizontal size={14} />
        All filters
      </button>

      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setOpen(false)}
        onWheel={(e) => e.preventDefault()}
        onTouchMove={(e) => e.preventDefault()}
        aria-hidden="true"
        data-lenis-prevent
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="All filters"
        data-lenis-prevent
        className={`fixed inset-y-0 left-0 w-full max-w-md bg-white z-50 shadow-xl overflow-y-auto overscroll-contain transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900">All filters</h2>
          <button data-opus-button="control"
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close filters"
            className="w-10 h-10 rounded-full ring-2 ring-[var(--accent-hover,#b97fd0)] flex items-center justify-center bg-white text-gray-700 hover:bg-gray-50 transition"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-6 space-y-8 pb-28">
          <FilterSection title="Special offers">
            {SPECIAL_OFFERS.map((s) => (
              <Check_Box
                key={s}
                id={`offer-${s}`}
                label={s}
                checked={specialOffers.has(s)}
                onChange={() => toggle(specialOffers, s, setSpecialOffers)}
              />
            ))}
          </FilterSection>

          <FilterSection title="Item type">
            {ITEM_TYPES.map((t) => (
              <RadioRow
                key={t.id}
                name="item-type"
                id={`type-${t.id}`}
                label={t.label}
                checked={itemType === t.id}
                onChange={() => setItemType(t.id)}
              />
            ))}
          </FilterSection>

          <FilterSection title="Price (TZS)" subtitle="Before delivery and any vendor fees">
            {PRICE_RANGES.map((r) => (
              <RadioRow
                key={r.id}
                name="price"
                id={`price-${r.id}`}
                label={r.label}
                checked={priceRange === r.id}
                onChange={() => setPriceRange(r.id)}
              />
            ))}
            <div className="flex items-center gap-2 pt-2">
              <RadioRow
                name="price"
                id="price-custom"
                label=""
                checked={priceRange === 'custom'}
                onChange={() => setPriceRange('custom')}
              />
              <span className="-ml-2 text-sm text-gray-800">Custom</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Low"
                value={customLow}
                onChange={(e) => setCustomLow(e.target.value)}
                onFocus={() => setPriceRange('custom')}
                className="h-9 w-24 rounded border border-gray-300 px-2 text-sm focus:outline-none focus:border-gray-500"
              />
              <span className="text-sm text-gray-500">to</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="High"
                value={customHigh}
                onChange={(e) => setCustomHigh(e.target.value)}
                onFocus={() => setPriceRange('custom')}
                className="h-9 w-24 rounded border border-gray-300 px-2 text-sm focus:outline-none focus:border-gray-500"
              />
              <button data-opus-button="control"
                type="button"
                aria-label="Apply price range"
                onClick={() => setPriceRange('custom')}
                className="w-9 h-9 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center hover:bg-gray-200 transition"
              >
                <Check size={16} />
              </button>
            </div>
          </FilterSection>

          <FilterSection title="Vendor type">
            {VENDOR_TYPES.map((v) => (
              <Check_Box
                key={v}
                id={`vendor-${v}`}
                label={v}
                checked={vendorTypes.has(v)}
                onChange={() => toggle(vendorTypes, v, setVendorTypes)}
              />
            ))}
          </FilterSection>

          <FilterSection title="Location">
            {LOCATIONS.map((l) => (
              <Check_Box
                key={l}
                id={`loc-${l}`}
                label={l}
                checked={locations.has(l)}
                onChange={() => toggle(locations, l, setLocations)}
              />
            ))}
          </FilterSection>

          <FilterSection title="Payment">
            {PAYMENT.map((p) => (
              <Check_Box
                key={p}
                id={`pay-${p}`}
                label={p}
                checked={payment.has(p)}
                onChange={() => toggle(payment, p, setPayment)}
              />
            ))}
          </FilterSection>

          <FilterSection title="Ordering options">
            {ORDERING.map((o) => (
              <Check_Box
                key={o}
                id={`order-${o}`}
                label={o}
                checked={ordering.has(o)}
                onChange={() => toggle(ordering, o, setOrdering)}
              />
            ))}
          </FilterSection>

          <FilterSection title="Rating">
            {RATINGS.map((r) => (
              <RadioRow
                key={r.id}
                name="rating"
                id={`rating-${r.id}`}
                label={r.label}
                checked={rating === r.id}
                onChange={() => setRating(r.id)}
              />
            ))}
          </FilterSection>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <button data-opus-button="control"
            type="button"
            onClick={clearAll}
            className="text-sm font-medium text-gray-700 underline underline-offset-4 hover:text-gray-900"
          >
            Clear all
          </button>
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="button"
            onClick={() => setOpen(false)}
            className="bg-gray-900 text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-gray-800 transition"
          >
            Apply
          </button>
        </div>
      </aside>
    </>
  )
}
