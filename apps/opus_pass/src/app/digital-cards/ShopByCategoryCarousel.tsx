'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useScrollCarousel } from '@/hooks/useScrollCarousel'
import type { DigitalCardCategoryCms } from '@/lib/cms/digital-cards-categories'

export function ShopByCategoryCarousel({ categories }: { categories: DigitalCardCategoryCms[] }) {
  const { scrollRef, progress, scrolling, scrollNext, scrollPrev } = useScrollCarousel()
  // Arrows stay hidden until the user hovers the row or scrolls it.
  const arrowReveal = scrolling
    ? 'opacity-100'
    : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'

  return (
    <div>
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
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/digital-cards/${cat.slug}`}
              className="group flex flex-col items-center text-center shrink-0 snap-start w-[110px] sm:w-[130px] md:w-[calc((100%-128px)/5)]"
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-full bg-white ring-1 ring-gray-200 mb-3 transition-shadow group-hover:shadow-md">
                <Image
                  src={cat.img}
                  alt={cat.alt}
                  fill
                  sizes="(min-width: 768px) 20vw, 130px"
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <span className="inline-flex items-center gap-1 text-xs md:text-sm font-medium text-gray-800 group-hover:underline leading-tight">
                {cat.label}
                <ArrowRight size={14} className="shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
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
  )
}
