'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, MapPin, Search, ShieldCheck, Sparkles } from 'lucide-react'
import type { VendorSearchContent } from '@/lib/cms/vendor-search'
import { getVendorIcon } from '@/lib/cms/vendor-search-icons'

const slideUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
}

const transition = { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] }

export default function VendorSearchClient({ content }: { content: VendorSearchContent }) {
  const vendors = content.items
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (vendors.length === 0) return
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % vendors.length)
    }, 5500)
    return () => clearInterval(interval)
  }, [vendors.length])

  if (vendors.length === 0) return null

  const v = vendors[Math.min(index, vendors.length - 1)]
  const Detail1Icon = getVendorIcon(v.detail1_icon)
  const Detail2Icon = getVendorIcon(v.detail2_icon)

  return (
    <section className="px-4 sm:px-6 py-14 sm:py-20 md:py-24 max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-10 sm:gap-14 lg:gap-16">

      {/* Left */}
      <div className="flex-1 flex flex-col text-center lg:text-left">
        <h2 className="text-[1.85rem] min-[400px]:text-[2.15rem] sm:text-5xl md:text-6xl lg:text-[72px] font-black tracking-tighter uppercase leading-[0.9] mb-5 sm:mb-6 text-[#1A1A1A]">
          {content.headline_line_1}<br className="sm:hidden" /> {content.headline_line_2}
        </h2>
        <p className="text-base sm:text-lg md:text-xl text-gray-600 font-medium leading-relaxed">
          {content.subheadline}
        </p>
      </div>

      {/* Card + mobile button */}
      <div className="flex-1 w-full max-w-lg flex flex-col gap-5">
        <div className="bg-white rounded-[var(--opus-radius-xlarge)] shadow-[0_20px_60px_rgba(0,0,0,0.08)] p-7 border border-gray-100">
          <div className="space-y-5">

            {/* Vendor type + city */}
            <div className="border border-gray-200 rounded-2xl px-3 sm:px-5 py-3 sm:py-4 flex justify-between items-center gap-3">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1 sm:mb-2 whitespace-nowrap">{content.looking_label}</p>
                <div className="h-7 sm:h-8 overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={`type-${index}`}
                      {...slideUp}
                      transition={transition}
                      className="text-xl sm:text-2xl font-black"
                    >
                      {v.type}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 bg-[var(--accent)] rounded-full px-3 sm:px-4 py-2 shrink-0">
                <MapPin size={14} className="text-[var(--on-accent)] shrink-0" />
                <div className="overflow-hidden h-5">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={`city-${index}`}
                      {...slideUp}
                      transition={{ ...transition, duration: 0.3 }}
                      className="font-bold text-xs sm:text-sm block text-[var(--on-accent)] whitespace-nowrap"
                    >
                      <span className="sm:hidden">{v.city_short ?? v.city}</span>
                      <span className="hidden sm:inline">{v.city}</span>
                    </motion.span>
                  </AnimatePresence>
                </div>
                <ChevronDown size={14} className="text-[var(--on-accent)] shrink-0" />
              </div>
            </div>

            {/* Details rows */}
            <div className="border border-gray-200 rounded-2xl divide-y divide-gray-100 text-sm font-medium overflow-hidden">

              <div className="flex justify-between items-center px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <Detail1Icon size={15} className="text-gray-400 shrink-0" />
                  <div className="h-5 overflow-hidden">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={`d1-${index}`}
                        {...slideUp}
                        transition={{ ...transition, delay: 0.04 }}
                        className="block text-[#1A1A1A]"
                      >
                        {v.detail1_label}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </div>
                <div className="overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={`d1m-${index}`}
                      {...slideUp}
                      transition={{ ...transition, delay: 0.04 }}
                      className="block text-xs font-bold text-[var(--on-accent)] bg-[var(--accent)] rounded-full px-3 py-1"
                    >
                      {v.detail1_meta}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex justify-between items-center px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <Detail2Icon size={15} className="text-gray-400 shrink-0" />
                  <div className="h-5 overflow-hidden">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={`d2-${index}`}
                        {...slideUp}
                        transition={{ ...transition, delay: 0.08 }}
                        className="block text-[#1A1A1A]"
                      >
                        {v.detail2_label}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </div>
                <div className="overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={`d2m-${index}`}
                      {...slideUp}
                      transition={{ ...transition, delay: 0.08 }}
                      className="block text-xs font-bold text-[var(--on-accent)] bg-[var(--accent)] rounded-full px-3 py-1"
                    >
                      {v.detail2_meta}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex justify-between items-center px-5 py-3.5 overflow-hidden">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <Sparkles size={15} className="text-gray-400 shrink-0" />
                  <div className="h-5 overflow-hidden">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={`perk-${index}`}
                        {...slideUp}
                        transition={{ ...transition, delay: 0.12 }}
                        className="font-semibold text-[#1A1A1A] block"
                      >
                        {v.perk}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </div>
                <span className="text-[var(--on-accent)] shrink-0 text-xs font-bold bg-[var(--accent)] rounded-full px-3 py-1">{content.perk_badge}</span>
              </div>

              <div className="flex justify-between items-center px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck size={15} className="text-gray-400 shrink-0" />
                  <span className="text-[#1A1A1A]">{content.verified_label}</span>
                </div>
                <span className="text-xs bg-[var(--accent)] text-[var(--on-accent)] font-bold rounded-full px-3 py-1">{content.verified_badge}</span>
              </div>

            </div>

            {/* Budget */}
            <div className="border border-gray-200 rounded-2xl px-5 py-4 flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">{content.budget_label}</p>
                <div className="h-7 overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={`budget-${index}`}
                      {...slideUp}
                      transition={{ ...transition, delay: 0.12 }}
                      className="text-xl font-black"
                    >
                      {v.budget}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </div>
              <span className="text-sm font-bold text-[var(--on-accent)] bg-[var(--accent)] rounded-full px-4 py-2">{content.budget_currency}</span>
            </div>

            {/* Count */}
            <div className="h-5 overflow-hidden px-1">
              <AnimatePresence mode="wait">
                <motion.span
                  key={`count-${index}`}
                  {...slideUp}
                  transition={{ ...transition, delay: 0.16 }}
                  className="text-sm text-gray-400 font-medium block"
                >
                  {v.count} {content.count_suffix}
                </motion.span>
              </AnimatePresence>
            </div>

            {/* CTA */}
            <button data-opus-button="primary" data-opus-button-size="medium" className="w-full bg-[#1A1A1A] hover:bg-[#333333] text-white font-bold py-4 rounded-full transition-colors flex justify-center items-center gap-2 overflow-hidden">
              <div className="h-5 overflow-hidden flex items-center gap-2">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={`cta-${index}`}
                    {...slideUp}
                    transition={{ ...transition, delay: 0.2 }}
                    className="flex items-center gap-2"
                  >
                    <Search size={18} />
                    {v.cta}
                  </motion.span>
                </AnimatePresence>
              </div>
            </button>

            {/* Progress dots — centred below CTA */}
            <div className="flex justify-center gap-2 pt-1">
              {vendors.map((vendor, i) => (
                <button data-opus-button="primary" data-opus-button-size="medium"
                  key={vendor.id}
                  onClick={() => setIndex(i)}
                  className={`rounded-full transition-all duration-400 ${
                    i === index ? 'w-5 h-1.5 bg-[#1A1A1A]' : 'w-1.5 h-1.5 bg-gray-200'
                  }`}
                />
              ))}
            </div>

          </div>
        </div>
      </div>
    </section>
  )
}
