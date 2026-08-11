'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Heart, Share2, Star, MapPin, Store, Truck, ChevronDown, Check, ShieldCheck, Gift } from 'lucide-react'
import type { Product } from '@/lib/registry-products'
import ExpandableText from '@/components/attire-and-rings/ExpandableText'
import AddToRegistryButton from './AddToRegistryButton'

export default function RegistryPdpHero({ product }: { product: Product }) {
  const [activeImg, setActiveImg] = useState(0)
  const [color, setColor] = useState(product.colors?.[0]?.name ?? '')

  // The seller's own shop page. Previously this pointed at the product's
  // browse category, which sent "shop this store" to a grid of every seller's
  // stock. Falls back to the category only when the product has no shop page
  // (seeded demo products, which have no vendor row behind them).
  const storeHref = product.brand.href ?? `/registry/${product.category.slug}`

  return (
    <section className="max-w-7xl mx-auto px-4 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
      {/* LEFT — gallery + store card */}
      <div className="lg:col-span-5">
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.gallery[activeImg] ?? product.img}
            alt={product.name}
            className="w-full h-full object-cover"
          />
          {product.badge && (
            <span className="absolute top-4 left-4 rounded-full bg-white/95 px-3 py-1 text-[11px] font-semibold text-gray-900 shadow-sm backdrop-blur-sm">
              {product.badge}
            </span>
          )}
          <div className="absolute top-4 right-4 flex flex-col gap-2">
            <button data-opus-button="control"
              type="button"
              aria-label="Save to favourites"
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

        {product.gallery.length > 1 && (
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-md bg-gray-100 text-gray-700 flex items-center justify-center shrink-0">
            <Store size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{product.brand.name}</p>
            {/* Hidden until the store has real reviews, for the same reason the
                product rating above is: a starred 5.0 next to "0 reviews" is a
                score nobody gave. */}
            {product.brand.reviews > 0 && (
              <p className="text-xs text-gray-600 inline-flex items-center gap-1.5">
                <Star size={11} className="fill-amber-500 text-amber-500" />
                <span className="font-medium text-gray-800">{product.brand.rating}</span>
                <span className="text-emerald-700 font-medium">· {product.brand.reviews.toLocaleString()} reviews</span>
              </p>
            )}
            <p className="text-xs text-gray-600 inline-flex items-center gap-1 mt-0.5">
              <MapPin size={11} />
              {product.brand.location}, Tanzania
            </p>
          </div>
          <Link
            href={storeHref}
            className="shrink-0 h-9 px-4 inline-flex items-center rounded-full border border-gray-300 bg-white text-sm font-semibold text-gray-900 hover:bg-gray-50 transition"
          >
            Visit store
          </Link>
        </div>
      </div>

      {/* MIDDLE — gift details */}
      <div className="lg:col-span-4">
        <Link
          href={storeHref}
          className="inline-block text-xs uppercase tracking-[0.18em] text-gray-500 font-semibold mb-2 hover:text-gray-900 transition-colors"
        >
          {product.brand.name}
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight mb-3">{product.name}</h1>

        {/* Only shown once the product actually has reviews. A five-star row
            above "0 Reviews" is a fabricated rating, and every DB-backed
            product starts at zero until product reviews exist. */}
        {product.reviews > 0 && (
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
            {product.sold > 0 && (
              <span className="text-gray-500">{product.sold.toLocaleString()} sold</span>
            )}
          </div>
        )}
        <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 mb-5">
          <ShieldCheck size={13} />
          Verified store · {product.brand.yearsActive} {product.brand.yearsActive === 1 ? 'year' : 'years'} on OpusFesta
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

        {product.colors && product.colors.length > 0 && (
          <div className="mb-6">
            <p className="text-sm font-semibold text-gray-900 mb-2">Colour : {color}</p>
            <div className="flex flex-wrap gap-2">
              {product.colors.map((c) => {
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
                      selected ? 'ring-2 ring-gray-900 ring-offset-2' : 'ring-1 ring-gray-200 hover:ring-gray-400'
                    }`}
                    style={{ backgroundColor: c.swatch }}
                  />
                )
              })}
            </div>
          </div>
        )}

        <div className="mb-6">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Description</h3>
          <ExpandableText text={product.description} limit={180} className="text-sm text-gray-700 leading-relaxed" />
        </div>

        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-3">Details</h3>
          <ul className="space-y-2.5 text-sm text-gray-800">
            <li className="flex items-start gap-2.5">
              <MapPin size={16} className="mt-0.5 text-gray-700 shrink-0" />
              <span>
                Ships from <strong className="font-semibold">{product.brand.location}, Tanzania</strong>
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <Truck size={16} className="mt-0.5 text-gray-700 shrink-0" />
              <span>
                Delivery{' '}
                <strong className="font-semibold">
                  {product.freeDelivery ? 'free in Dar es Salaam' : 'from TZS 12,000'}
                </strong>
                <button data-opus-button="control" type="button" className="ml-2 inline-flex items-center gap-1 text-gray-700 hover:text-gray-900">
                  Delivery details <ChevronDown size={14} />
                </button>
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <Gift size={16} className="mt-0.5 text-gray-700 shrink-0" />
              <span>
                Guests can gift this item or contribute toward it — <strong className="font-semibold">any amount</strong>
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* RIGHT — registry box */}
      <aside className="lg:col-span-3 lg:sticky lg:top-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-3xl font-bold text-gray-900">{product.price}</span>
          </div>
          {product.oldPrice && (
            <p className="text-sm mb-3">
              <span className="text-gray-500 line-through">{product.oldPrice}</span>
              {product.discountPct !== undefined && (
                <span className="ml-2 font-semibold text-emerald-700">{product.discountPct}% off</span>
              )}
            </p>
          )}

          <p className="text-sm mb-1 inline-flex items-center gap-1.5">
            <Check size={14} className="text-emerald-600" />
            <span className="font-semibold text-gray-900">
              {product.freeDelivery ? 'FREE delivery in Dar es Salaam' : 'Delivery from TZS 12,000'}
            </span>
          </p>
          <p className="text-xs text-gray-700 mb-4">Guests can gift the full item or contribute toward it — zero fees.</p>

          <div className="mb-4">
            <AddToRegistryButton
              product={{ id: product.id, name: product.name, img: product.img, price: product.price, category: product.category.slug }}
              variant="pdp"
            />
          </div>

          <dl className="text-[13px] space-y-1.5 mb-4 border-t border-gray-100 pt-4">
            <div className="grid grid-cols-[88px_1fr] gap-2">
              <dt className="text-gray-600">Ships from</dt>
              <dd className="text-gray-900">{product.brand.location}</dd>
            </div>
            <div className="grid grid-cols-[88px_1fr] gap-2">
              <dt className="text-gray-600">Sold by</dt>
              <dd>
                <Link href={storeHref} className="text-[#1c4dac] hover:underline">
                  {product.brand.name}
                </Link>
              </dd>
            </div>
            <div className="grid grid-cols-[88px_1fr] gap-2">
              <dt className="text-gray-600">Returns</dt>
              <dd className="text-gray-900">30-day exchange policy</dd>
            </div>
            <div className="grid grid-cols-[88px_1fr] gap-2">
              <dt className="text-gray-600">Payment</dt>
              <dd className="text-gray-900">M-Pesa, Airtel, Tigo, card</dd>
            </div>
          </dl>

          <button data-opus-button="neutral" data-opus-button-size="medium"
            type="button"
            className="w-full h-10 rounded-full border border-gray-300 bg-white text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors inline-flex items-center justify-center gap-2"
          >
            <Heart size={15} /> Add to favourites
          </button>
        </div>
      </aside>
    </section>
  )
}
