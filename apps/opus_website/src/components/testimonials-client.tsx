'use client'

import { useRef, useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { Star, ArrowLeft, ArrowRight } from 'lucide-react'
import Reveal from '@/components/ui/Reveal'
import type { TestimonialsContent } from '@/lib/cms/testimonials'

const GAP = 16

export default function TestimonialsClient({ content }: { content: TestimonialsContent }) {
  const testimonials = content.items
  const [index, setIndex] = useState(0)
  const [lastDir, setLastDir] = useState<'prev' | 'next'>('next')
  const containerRef = useRef<HTMLDivElement>(null)
  const [cardWidth, setCardWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setCardWidth(el.clientWidth * 0.72)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const prev = () => {
    if (index === 0) return
    setLastDir('prev')
    setIndex((i) => i - 1)
  }

  const next = () => {
    if (index === testimonials.length - 1) return
    setLastDir('next')
    setIndex((i) => i + 1)
  }

  if (testimonials.length === 0) return null

  const carouselReady = cardWidth > 0
  const atStart = index === 0
  const atEnd = index === testimonials.length - 1

  return (
    <section className="py-14 sm:py-20 md:py-24 px-4 sm:px-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row gap-10 md:gap-8 items-center">

        {/* Left */}
        <Reveal direction="up" className="md:w-[38%] shrink-0 text-center md:text-left">
          <h2 className="text-[2.4rem] sm:text-5xl md:text-6xl lg:text-[80px] font-black tracking-tighter uppercase leading-[1.05] md:leading-[0.88] mb-6 md:mb-12 text-[#1A1A1A]">
            {content.headline_line_1}
            <br />
            {content.headline_line_2}
          </h2>
          <div className="flex justify-center md:justify-start gap-3">
            <button data-opus-button="control"
              onClick={prev}
              disabled={atStart || !carouselReady}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                !atStart && lastDir === 'prev'
                  ? 'bg-[var(--accent)] border-2 border-[var(--on-accent)] text-[var(--on-accent)]'
                  : !atStart
                  ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed'
              }`}
            >
              <ArrowLeft size={22} strokeWidth={2} />
            </button>
            <button data-opus-button="control"
              onClick={next}
              disabled={atEnd || !carouselReady}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                !atEnd && lastDir === 'next'
                  ? 'bg-[var(--accent)] border-2 border-[var(--on-accent)] text-[var(--on-accent)]'
                  : !atEnd
                  ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed'
              }`}
            >
              <ArrowRight size={22} strokeWidth={2} />
            </button>
          </div>
        </Reveal>

        {/* Carousel */}
        <div ref={containerRef} className="w-full md:w-[62%] overflow-hidden">
          <motion.div
            className="flex"
            style={{ gap: GAP }}
            animate={{ x: cardWidth ? -(index * (cardWidth + GAP)) : 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          >
            {testimonials.map((t) => {
              const isAccent = t.bg === 'accent'
              return (
                <div
                  key={t.id}
                  style={{ minWidth: cardWidth || '72%', maxWidth: cardWidth || '72%' }}
                  className={`rounded-[var(--opus-radius-large)] sm:rounded-[var(--opus-radius-xlarge)] p-5 sm:p-6 md:p-8 flex flex-col shrink-0 ${
                    isAccent ? 'bg-[var(--accent)]' : 'bg-[#1A1A1A]'
                  }`}
                >
                  {/* Stars */}
                  <div className="flex gap-1 mb-6">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star
                        key={s}
                        size={18}
                        fill={s < t.stars ? '#F5A623' : 'transparent'}
                        className={s < t.stars ? 'text-[#F5A623]' : isAccent ? 'text-[var(--on-accent)]/20' : 'text-white/20'}
                      />
                    ))}
                  </div>

                  {/* Quote */}
                  <p className={`text-sm sm:text-base md:text-xl font-semibold leading-snug flex-1 mb-6 ${isAccent ? 'text-[var(--on-accent)]' : 'text-white'}`}>
                    &ldquo;{t.quote}&rdquo;
                  </p>

                  {/* Footer */}
                  <div className={`flex items-center gap-4 pt-6 mt-6 border-t ${isAccent ? 'border-[var(--on-accent)]/15' : 'border-white/10'}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={t.image_url}
                      alt={t.name}
                      className="w-11 h-11 rounded-full object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${isAccent ? 'text-[var(--on-accent)]' : 'text-white'}`}>{t.company}</p>
                      <p className={`text-xs mt-0.5 truncate ${isAccent ? 'text-[var(--on-accent)]/50' : 'text-white/40'}`}>{t.city}</p>
                    </div>
                    <span className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold ${
                      isAccent ? 'bg-[var(--on-accent)] text-[var(--accent)]' : 'bg-[var(--accent)] text-[var(--on-accent)]'
                    }`}>
                      {t.role}
                    </span>
                  </div>
                </div>
              )
            })}
          </motion.div>
        </div>

      </div>
    </section>
  )
}
