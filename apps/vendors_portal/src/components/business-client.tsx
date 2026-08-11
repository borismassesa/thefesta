'use client'

import { useState, useEffect } from 'react'
import { Star, TrendingUp, MessageCircle, Eye } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import type { BusinessContent } from '@/lib/cms/business'

export default function BusinessClient({ content }: { content: BusinessContent }) {
  const VENDORS = content.vendors
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (VENDORS.length === 0) return
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % VENDORS.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [VENDORS.length])

  if (VENDORS.length === 0) return null

  const v = VENDORS[Math.min(index, VENDORS.length - 1)]

  return (
    <section className="px-4 sm:px-6 md:px-10 max-w-6xl mx-auto mb-14 sm:mb-20 md:mb-24">
      <div className="bg-[#1A1A1A] rounded-[var(--opus-radius-large)] sm:rounded-[var(--opus-radius-xlarge)] md:rounded-[var(--opus-radius-xlarge)] overflow-hidden">
        <div className="flex flex-col md:flex-row">

          {/* Left — text */}
          <div className="flex-1 py-10 px-6 md:py-20 md:px-14 flex flex-col justify-between text-center md:text-left">
            <div>
              <span className="text-[var(--accent)] text-xs font-bold uppercase tracking-widest">{content.eyebrow}</span>
              <h2 className="text-[2.4rem] sm:text-5xl lg:text-[64px] font-black tracking-tighter uppercase leading-[1.05] md:leading-[0.88] mt-4 mb-5 sm:mb-6 text-white">
                {content.headline_line_1}
                <br />
                {content.headline_line_2}
                <br />
                <span className="text-[var(--accent)]">{content.headline_line_3}</span>
              </h2>
              <p className="text-sm sm:text-base text-gray-400 font-medium leading-relaxed max-w-sm mx-auto md:mx-0 mb-7 sm:mb-10">
                {content.subheadline}
              </p>

              {/* Feature pills */}
              <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-7 sm:mb-10">
                {content.feature_pills.map((p) => (
                  <span key={p.id} className="bg-white/8 text-white/70 text-xs font-semibold px-3 py-1.5 rounded-full border border-white/10">{p.label}</span>
                ))}
              </div>
            </div>

            <div className="flex flex-row justify-center md:justify-start gap-3">
              <a href={content.primary_cta_href} className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] px-4 sm:px-7 py-2.5 sm:py-3.5 rounded-full font-bold transition-colors text-xs sm:text-base whitespace-nowrap">
                {content.primary_cta_label}
              </a>
              <a href={content.secondary_cta_href} className="text-white border border-white/20 hover:bg-white/8 px-4 sm:px-7 py-2.5 sm:py-3.5 rounded-full font-bold transition-colors text-xs sm:text-base whitespace-nowrap">
                {content.secondary_cta_label}
              </a>
            </div>
          </div>

          {/* Right — rotating vendor card */}
          <div className="md:w-[480px] bg-[#111] flex items-center justify-center px-6 sm:px-10 md:px-14 py-10">
            <div className="w-full max-w-[300px] flex flex-col gap-3">

              <AnimatePresence mode="wait">
                <motion.div
                  key={v.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.35, ease: 'easeInOut' }}
                  className="flex flex-col gap-3"
                >
                  {/* Profile card */}
                  <div className="bg-[#1E1E1E] rounded-3xl border border-white/8 relative" style={{ overflow: 'visible' }}>
                    {/* Cover */}
                    <div className="relative h-32 rounded-t-3xl overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={v.cover_url} alt="cover" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1E1E1E] via-transparent to-transparent" />
                      <div className="absolute top-3 right-3">
                        <span className="bg-[var(--accent)] text-[var(--on-accent)] text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide">{content.verified_badge}</span>
                      </div>
                    </div>
                    {/* Avatar — outside cover to avoid clipping */}
                    <div className="absolute top-[100px] left-5 z-10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={v.avatar_url} alt={v.name} className="w-14 h-14 rounded-2xl object-cover border-2 border-[#1E1E1E]" />
                    </div>

                    {/* Info */}
                    <div className="px-5 pt-9 pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-black text-white leading-tight">{v.name}</p>
                          <p className="text-[10px] text-white/40 mt-0.5">{v.location}</p>
                        </div>
                        <span className="shrink-0 text-[9px] font-bold text-white/40 bg-white/8 border border-white/10 px-2 py-1 rounded-full">{v.category}</span>
                      </div>
                    </div>

                    {/* Stars + response rate */}
                    <div className="px-5 pb-4 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={10} fill="#F5A623" className="text-[#F5A623]" />
                        ))}
                        <span className="text-[10px] text-white/40 ml-1">{v.stars} · {v.reviews} {content.reviews_suffix}</span>
                      </div>
                      <span className="text-[9px] text-white/40 font-medium">{v.response} {content.response_suffix}</span>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { icon: <TrendingUp size={12} />, value: v.bookings, label: content.bookings_stat_label },
                      { icon: <MessageCircle size={12} />, value: v.enquiries, label: content.enquiries_stat_label },
                      { icon: <Eye size={12} />, value: v.views, label: content.views_stat_label },
                    ].map((s) => (
                      <div key={s.label} className="bg-[#1E1E1E] rounded-2xl px-3 py-3 text-center border border-white/8">
                        <div className="text-white/60 flex justify-center mb-1.5">{s.icon}</div>
                        <p className="text-sm font-black text-white">{s.value}</p>
                        <p className="text-[8px] text-white/30 uppercase tracking-wide mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Upcoming bookings */}
                  {v.upcoming.length > 0 && (
                    <div className="bg-[#1E1E1E] rounded-2xl overflow-hidden border border-white/8">
                      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                        <p className="text-[10px] font-black text-white uppercase tracking-widest">{content.upcoming_label}</p>
                        <span className="text-[9px] text-white font-bold">{v.bookings} {content.bookings_suffix}</span>
                      </div>
                      {v.upcoming.map((b) => (
                        <div key={b.id} className="px-4 py-2.5 flex items-center gap-3 border-b border-white/5 last:border-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={b.image_url} alt={b.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-white truncate">{b.name}</p>
                            <p className="text-[9px] text-white/30">{b.date}</p>
                          </div>
                          <span className="text-[8px] font-bold bg-[var(--accent)] text-[var(--on-accent)] px-2 py-0.5 rounded-full shrink-0">{content.booked_badge}</span>
                        </div>
                      ))}
                    </div>
                  )}

                </motion.div>
              </AnimatePresence>

              {/* Dot indicators */}
              <div className="flex justify-center gap-1.5 mt-1">
                {VENDORS.map((vendor, i) => (
                  <button data-opus-button="control"
                    key={vendor.id}
                    onClick={() => setIndex(i)}
                    className={`rounded-full transition-all ${i === index ? 'w-4 h-1.5 bg-[var(--accent)]' : 'w-1.5 h-1.5 bg-white/20'}`}
                  />
                ))}
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
