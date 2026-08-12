import Link from 'next/link'
import { MapPin, Star } from 'lucide-react'
import type { Vendor } from '@/lib/vendors'
import { VENDORS_BASE_PATH } from '@/lib/vendors'

type VendorCardProps = {
  vendor: Vendor
  tone?: 'light' | 'dark'
  compact?: boolean
  mediaClassName?: string
  className?: string
}

export default function VendorCard({
  vendor,
  tone = 'light',
  compact = false,
  mediaClassName = 'aspect-[16/10]',
  className = '',
}: VendorCardProps) {
  const dark = tone === 'dark'

  return (
    <Link
      href={`${VENDORS_BASE_PATH}/${vendor.slug}`}
      className={`group flex w-full flex-col overflow-hidden rounded-[var(--opus-radius-large)] border transition-all duration-300 hover:-translate-y-1 ${
        dark
          ? 'border-black bg-[#111111] text-white hover:bg-[#1A1A1A]'
          : 'border-gray-200 bg-white text-[#1A1A1A] hover:border-gray-300'
      } ${className}`}
    >
      <div className={`relative overflow-hidden ${mediaClassName}`}>
        {vendor.heroMedia.type === 'video' ? (
          <video
            src={vendor.heroMedia.src}
            poster={vendor.heroMedia.poster}
            autoPlay
            muted
            loop
            playsInline
            aria-hidden="true"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vendor.heroMedia.src}
            alt={vendor.heroMedia.alt}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
        {vendor.badge && (
          <span className="absolute top-3 left-3 rounded-full bg-(--accent) px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-(--on-accent)">
            {vendor.badge}
          </span>
        )}
      </div>

      <div className={`flex flex-1 flex-col ${compact ? 'gap-2.5 p-4 sm:p-[18px]' : 'gap-3 p-4 sm:p-5'}`}>
        <div
          className={`flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] ${
            dark ? 'text-white/65' : 'text-gray-400'
          }`}
        >
          <span>{vendor.category}</span>
          <span className={dark ? 'text-white/35' : 'text-gray-300'}>/</span>
          <span>{vendor.priceRange}</span>
        </div>

        <div className="space-y-2">
          <h3
            className={`${compact ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'} font-black uppercase tracking-tighter leading-[1.02]`}
          >
            {vendor.name}
          </h3>
          <p
            className={`${compact ? 'text-[13px] sm:text-sm' : 'text-sm sm:text-[15px]'} leading-relaxed ${
              dark ? 'text-white/72' : 'text-gray-600'
            }`}
          >
            {vendor.excerpt}
          </p>
        </div>

        <div
          className={`mt-auto flex items-center justify-between gap-3 pt-1 text-sm font-semibold ${
            dark ? 'text-white/72' : 'text-gray-500'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex items-center gap-1 shrink-0">
              <Star size={12} className={dark ? 'text-(--accent)' : 'text-(--accent)'} fill="currentColor" />
              <span className={dark ? 'text-white font-bold' : 'text-[#1A1A1A] font-bold'}>
                {vendor.rating.toFixed(1)}
              </span>
              <span className="text-xs">({vendor.reviewCount})</span>
            </span>
            <span className="flex items-center gap-1 truncate">
              <MapPin size={11} className="shrink-0" />
              {vendor.city}
            </span>
          </div>
          <span className={`shrink-0 ${dark ? 'text-white' : 'text-[#1A1A1A]'}`}>View profile</span>
        </div>
      </div>
    </Link>
  )
}
