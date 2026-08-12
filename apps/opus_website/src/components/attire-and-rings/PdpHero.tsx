'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Heart, Share2, Star, MapPin, Store, Truck, ChevronDown, Check, ShieldCheck, Calendar } from 'lucide-react'
import type { Product } from '@/lib/bridal-products'
import { addToCart } from '@/lib/cart-storage'
import ExpandableText from './ExpandableText'

function formatTzs(n: number): string {
  return `TZS ${n.toLocaleString('en-US')}`
}

type DeliveryOption = { id: 'standard' | 'express' | 'pickup'; label: string; fee: number; eta: string }

export default function PdpHero({ product }: { product: Product }) {
  const router = useRouter()
  const baseDelivery = product.freeDelivery ? 0 : 12_000
  const deliveryOptions: DeliveryOption[] = [
    { id: 'standard', label: 'Standard', fee: baseDelivery, eta: '7–14 days' },
    { id: 'express', label: 'Express', fee: baseDelivery + 18_000, eta: '3–5 days' },
    { id: 'pickup', label: 'Boutique pickup', fee: 0, eta: 'Ready in 48h' },
  ]

  const [activeImg, setActiveImg] = useState(0)
  const [qty, setQty] = useState(1)
  const [color, setColor] = useState(product.options.colors[0]?.name ?? '')
  const defaultSize =
    product.options.sizes[Math.min(2, Math.max(0, Math.floor(product.options.sizes.length / 2)))]
  const [size, setSize] = useState(defaultSize)
  const [delivery, setDelivery] = useState<DeliveryOption>(deliveryOptions[0])

  const lineTotal = product.priceTzs * qty + delivery.fee

  const handleAddToCart = (destination: '/attire-and-rings/cart' | '/attire-and-rings/address') => {
    addToCart({
      category: product.category.slug,
      id: product.id,
      size,
      color,
      quantity: qty,
    })
    router.push(destination)
  }

  const vendorSearchHref = `/vendors?search=${encodeURIComponent(product.vendor.name)}`

  return (
    <section className="max-w-7xl mx-auto px-2 lg:px-2 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
      {/* LEFT — gallery + vendor card */}
      <div className="lg:col-span-5">
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-gray-100">
          <img
            src={product.gallery[activeImg] ?? product.img}
            alt={product.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-4 right-4 flex flex-col gap-2">
            <button data-opus-button="control"
              type="button"
              aria-label="Save to wishlist"
              className="w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center text-gray-700 hover:text-red-500 transition-colors"
            >
              <Heart size={18} />
            </button>
            <button data-opus-button="control"
              type="button"
              aria-label="Share"
              className="w-10 h-10 bg-white rounded-full shadow-md flex items-center justify-center text-gray-700 hover:text-gray-900 transition-colors"
            >
              <Share2 size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mt-4">
          {product.gallery.map((g, i) => (
            <button data-opus-button="control"
              key={i}
              type="button"
              onClick={() => setActiveImg(i)}
              aria-label={`View image ${i + 1}`}
              className={`aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                i === activeImg ? 'border-gray-900' : 'border-transparent bg-[#f1f5f4] hover:border-gray-300'
              }`}
            >
              <img src={g} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-md bg-gray-100 text-gray-700 flex items-center justify-center shrink-0">
            <Store size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{product.vendor.name}</p>
            <p className="text-xs text-gray-600 inline-flex items-center gap-1.5">
              <Star size={11} className="fill-amber-500 text-amber-500" />
              <span className="font-medium text-gray-800">{product.vendor.rating}</span>
              <span className="text-emerald-700 font-medium">· {product.vendor.reviews.toLocaleString()} reviews</span>
            </p>
            <p className="text-xs text-gray-600 inline-flex items-center gap-1 mt-0.5">
              <MapPin size={11} />
              {product.vendor.location}, Tanzania
            </p>
          </div>
          <Link
            href={vendorSearchHref}
            className="shrink-0 h-9 px-4 inline-flex items-center rounded-full border border-gray-300 bg-white text-sm font-semibold text-gray-900 hover:bg-gray-50 transition"
          >
            Visit Store
          </Link>
        </div>
      </div>

      {/* MIDDLE — product details */}
      <div className="lg:col-span-4">
        <Link
          href={vendorSearchHref}
          className="inline-block text-xs uppercase tracking-[0.18em] text-gray-500 font-semibold mb-2 hover:text-gray-900 transition-colors"
        >
          {product.vendor.name}
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight mb-3">
          {product.name}
        </h1>

        <div className="flex items-center gap-2 text-sm mb-2 flex-wrap">
          <span className="inline-flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={14}
                className={i < Math.round(Number(product.rating)) ? 'fill-amber-500 text-amber-500' : 'text-gray-300'}
              />
            ))}
          </span>
          <span className="text-gray-700">({product.rating})</span>
          <Link href="#reviews" className="text-emerald-700 font-medium hover:underline">
            {product.reviews.toLocaleString()} Reviews
          </Link>
          <span className="text-gray-500">{product.sold.toLocaleString()} sold</span>
        </div>
        <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 mb-5">
          <ShieldCheck size={13} />
          Verified vendor &middot; {product.vendor.yearsActive} years on OpusFesta
        </p>

        <div className="flex items-baseline gap-3 flex-wrap mb-6">
          <span className="text-3xl font-bold text-gray-900">{product.price}</span>
          {product.oldPrice && (
            <>
              <span className="text-base text-gray-500 line-through">{product.oldPrice}</span>
              {product.discountPct !== undefined && (
                <span className="text-sm font-semibold text-red-600">( {product.discountPct}% OFF )</span>
              )}
            </>
          )}
        </div>

        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-900 mb-2">Select Color :</p>
          <div className="flex flex-wrap gap-2">
            {product.options.colors.map((c) => {
              const selected = c.name === color
              return (
                <button data-opus-button="control"
                  key={c.name}
                  type="button"
                  onClick={() => setColor(c.name)}
                  aria-label={c.name}
                  aria-pressed={selected}
                  title={c.name}
                  className={`w-12 h-12 rounded-md flex items-center justify-center transition-shadow ${
                    selected
                      ? 'ring-2 ring-gray-900 ring-offset-2'
                      : 'ring-1 ring-gray-200 hover:ring-gray-400'
                  }`}
                  style={{ backgroundColor: c.swatch }}
                />
              )
            })}
          </div>
        </div>

        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-900 mb-2">Select Size</p>
          <div className="flex flex-wrap gap-2">
            {product.options.sizes.map((s) => {
              const selected = s === size
              return (
                <button data-opus-button="control"
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  aria-pressed={selected}
                  className={`min-w-[44px] h-11 px-3 rounded-md border text-sm font-semibold transition-colors ${
                    selected
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-900 border-gray-300 hover:border-gray-500'
                  }`}
                >
                  {s}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Description</h3>
          <ExpandableText
            text={product.description}
            limit={180}
            className="text-sm text-gray-700 leading-relaxed"
          />
        </div>

        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-3">Details</h3>
          <ul className="space-y-2.5 text-sm text-gray-800">
            <li className="flex items-start gap-2.5">
              <MapPin size={16} className="mt-0.5 text-gray-700 shrink-0" />
              <span>
                Sent from <strong className="font-semibold">{product.vendor.location}, Tanzania</strong>
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <Truck size={16} className="mt-0.5 text-gray-700 shrink-0" />
              <span>
                Shipping <strong className="font-semibold">{baseDelivery === 0 ? 'free in Dar es Salaam' : formatTzs(baseDelivery)}</strong>
                <button data-opus-button="control" type="button" className="ml-2 inline-flex items-center gap-1 text-gray-700 hover:text-gray-900">
                  Shipping Details <ChevronDown size={14} />
                </button>
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <Calendar size={16} className="mt-0.5 text-gray-700 shrink-0" />
              <span>
                Estimated arrival <strong className="font-semibold">7&ndash;14 days</strong> after fitting confirmation
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* RIGHT — Buy box */}
      <aside className="lg:col-span-3 lg:sticky lg:top-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          {/* Price */}
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-3xl font-bold text-gray-900">{formatTzs(product.priceTzs).replace('TZS ', 'TZS ')}</span>
          </div>
          {product.oldPrice && (
            <p className="text-sm mb-3">
              <span className="text-gray-500 line-through">{product.oldPrice}</span>
              {product.discountPct !== undefined && (
                <span className="ml-2 font-semibold text-emerald-700">{product.discountPct}% off</span>
              )}
            </p>
          )}

          {/* Delivery */}
          <p className="text-sm mb-1 inline-flex items-center gap-1.5">
            <Check size={14} className="text-emerald-600" />
            <span className="font-semibold text-gray-900">
              {product.freeDelivery ? 'FREE delivery in Dar es Salaam' : `Delivery from ${formatTzs(12_000)}`}
            </span>
          </p>
          <p className="text-xs text-gray-700 mb-3">
            Book a fitting within <span className="font-semibold text-gray-900">6 hrs 42 mins</span> for next-day pickup
          </p>

          <p className="text-sm mb-3 inline-flex items-center gap-1.5">
            <MapPin size={14} className="text-gray-700" />
            <Link href="/attire-and-rings/address" className="text-[#1c4dac] hover:underline font-medium">
              Deliver to {product.vendor.location}
            </Link>
          </p>

          {/* Stock */}
          <p className="text-lg font-semibold text-emerald-700 mb-3">In Stock</p>

          {/* Quantity dropdown */}
          <div className="relative mb-3">
            <select
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              aria-label="Quantity"
              className="w-full h-10 appearance-none rounded-md border border-gray-300 bg-white px-3 pr-8 text-sm font-medium text-gray-900 focus:outline-none focus:border-gray-500"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  Quantity: {n}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>

          {/* CTAs */}
          <button data-opus-button="control"
            type="button"
            onClick={() => handleAddToCart('/attire-and-rings/cart')}
            className="w-full h-10 inline-flex items-center justify-center bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] font-semibold rounded-full mb-2 transition-colors"
          >
            Add to cart
          </button>
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="button"
            onClick={() => handleAddToCart('/attire-and-rings/address')}
            className="w-full h-10 inline-flex items-center justify-center bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-full mb-5 transition-colors"
          >
            Buy Now
          </button>

          {/* Info rows */}
          <dl className="text-[13px] space-y-1.5 mb-3">
            <div className="grid grid-cols-[88px_1fr] gap-2">
              <dt className="text-gray-600">Ships from</dt>
              <dd>
                <Link href={vendorSearchHref} className="text-[#1c4dac] hover:underline">
                  {product.vendor.location}
                </Link>
              </dd>
            </div>
            <div className="grid grid-cols-[88px_1fr] gap-2">
              <dt className="text-gray-600">Sold by</dt>
              <dd>
                <Link href={vendorSearchHref} className="text-[#1c4dac] hover:underline">
                  {product.vendor.name}
                </Link>
              </dd>
            </div>
            <div className="grid grid-cols-[88px_1fr] gap-2">
              <dt className="text-gray-600">Returns</dt>
              <dd>
                <Link href="#" className="text-[#1c4dac] hover:underline">
                  30-day exchange policy
                </Link>
              </dd>
            </div>
            <div className="grid grid-cols-[88px_1fr] gap-2">
              <dt className="text-gray-600">Payment</dt>
              <dd>
                <Link href="#" className="text-[#1c4dac] hover:underline">
                  M-Pesa, Airtel, Tigo, card
                </Link>
              </dd>
            </div>
          </dl>

          <button data-opus-button="control"
            type="button"
            className="text-[13px] font-medium text-[#1c4dac] hover:underline inline-flex items-center gap-1 mb-5"
          >
            <ChevronDown size={12} /> See more
          </button>

          {/* Wishlist */}
          <button data-opus-button="neutral" data-opus-button-size="medium"
            type="button"
            className="w-full h-10 rounded-full border border-gray-300 bg-white text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors"
          >
            Add to Wish List
          </button>
        </div>
      </aside>
    </section>
  )
}
