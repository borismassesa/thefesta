'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { Star, MessageSquare, Calendar, ShieldCheck } from 'lucide-react'
import type {
  DoMoreContent,
  LeadDemo,
  LeadStatus,
  StorefrontDemo,
} from '@/lib/cms/do-more'
import { THEME_COLORS } from '@/lib/cms/do-more'

const POSITIONS = [
  { top: 40, x: 0, scale: 1, opacity: 1, zIndex: 30, shadow: '0 20px 60px rgba(0,0,0,0.15)' },
  { top: 20, x: 0, scale: 0.97, opacity: 0.75, zIndex: 20, shadow: '0 8px 24px rgba(0,0,0,0.08)' },
  { top: 0,  x: 0, scale: 0.94, opacity: 0.45, zIndex: 10, shadow: '0 4px 12px rgba(0,0,0,0.05)' },
]

function StorefrontCardContent({ card, isFront }: { card: StorefrontDemo; isFront: boolean }) {
  const colors = THEME_COLORS[card.theme]
  return (
    <>
      {/* Browser chrome */}
      <div className="bg-[#E8E8E8] border-b border-gray-300 px-3 py-2 flex items-center gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-2 h-2 rounded-full bg-[#FF5F57]" />
          <div className="w-2 h-2 rounded-full bg-[#FFBD2E]" />
          <div className="w-2 h-2 rounded-full bg-[#28C840]" />
        </div>
        <div className={`${isFront ? 'flex-1' : 'flex-1'} bg-white rounded-md px-2.5 py-1 flex items-center justify-between gap-1.5 border border-gray-300`}>
          <p className="text-[7px] text-gray-400 truncate">{card.url}</p>
          <span className="text-[7px] text-gray-300 shrink-0">✕</span>
        </div>
      </div>

      {/* Site nav */}
      <div
        className="px-3 py-2 flex items-center justify-between border-b"
        style={{ background: colors.navBg, borderColor: colors.navBorder }}
      >
        <p className="text-[8px] font-black tracking-widest" style={{ color: colors.navText }}>
          {card.business_name.toUpperCase().slice(0, 14)}
        </p>
        <div className="flex items-center gap-2">
          {['Portfolio', 'Services', 'Reviews'].map((item) => (
            <p key={item} className="text-[6px] font-semibold uppercase" style={{ color: colors.navText + '99' }}>
              {item}
            </p>
          ))}
          <span
            className="text-[6px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: colors.ctaBg, color: colors.ctaText }}
          >
            Book
          </span>
        </div>
      </div>

      {/* Cover */}
      <div className="relative h-24 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card.cover_url} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute top-2 right-2">
          <span className="bg-[var(--accent)] text-[var(--on-accent)] text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-1">
            <ShieldCheck size={7} /> Verified
          </span>
        </div>
        <div className="absolute bottom-2 left-3 right-3 flex items-end gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.avatar_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-white/40" />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black text-white leading-tight truncate">{card.business_name}</p>
            <p className="text-[6.5px] text-white/70">{card.category} · {card.location}</p>
          </div>
        </div>
      </div>

      {isFront && (
        <>
          {/* Stats row */}
          <div className="bg-white px-3 py-2 grid grid-cols-3 gap-2 border-b border-gray-100">
            <div className="text-center">
              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                <Star size={7} fill="#F5A623" className="text-[#F5A623]" />
                <p className="text-[8px] font-black text-[#1A1A1A]">{card.rating}</p>
              </div>
              <p className="text-[6px] text-gray-400 uppercase tracking-wide">{card.reviews} reviews</p>
            </div>
            <div className="text-center border-l border-gray-100">
              <p className="text-[8px] font-black text-[#1A1A1A]">{card.response}</p>
              <p className="text-[6px] text-gray-400 uppercase tracking-wide">Response</p>
            </div>
            <div className="text-center border-l border-gray-100">
              <p className="text-[8px] font-black text-[#1A1A1A]">{card.bookings}</p>
              <p className="text-[6px] text-gray-400 uppercase tracking-wide">Bookings</p>
            </div>
          </div>

          {/* CTA */}
          <div className="bg-white px-3 py-2.5 flex items-center gap-2">
            <button data-opus-button="control"
              className="flex-1 text-[7px] font-bold py-1.5 rounded-full uppercase tracking-wide"
              style={{ background: colors.ctaBg, color: colors.ctaText }}
            >
              Book a discovery call
            </button>
            <button data-opus-button="control" className="text-[7px] font-bold py-1.5 px-3 rounded-full uppercase tracking-wide border border-gray-200 text-gray-600">
              Message
            </button>
          </div>
        </>
      )}
    </>
  )
}

function StorefrontCardStack({ storefronts }: { storefronts: StorefrontDemo[] }) {
  const [active, setActive] = useState(0)
  const cycle = () => setActive((a) => (a + 1) % storefronts.length)

  if (storefronts.length === 0) return null

  return (
    <div className="relative mb-8 w-full max-w-[288px] h-[300px]">
      {storefronts.map((card, i) => {
        const pos = (i - active + storefronts.length) % storefronts.length
        const fallback = POSITIONS[Math.min(pos, POSITIONS.length - 1)]
        const { top, scale, opacity, zIndex, shadow } = fallback
        const isFront = pos === 0

        return (
          <motion.div
            key={card.id}
            className="absolute left-0 right-0 rounded-3xl overflow-hidden cursor-pointer select-none bg-white"
            style={{ boxShadow: shadow }}
            animate={{ top, scale, opacity, zIndex }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            drag={isFront ? 'x' : false}
            dragConstraints={{ left: -60, right: 60 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (Math.abs(info.offset.x) > 50) cycle()
            }}
            onClick={!isFront ? cycle : undefined}
          >
            <StorefrontCardContent card={card} isFront={isFront} />
          </motion.div>
        )
      })}

      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
        {storefronts.map((_, i) => (
          <button data-opus-button="primary" data-opus-button-size="medium"
            key={i}
            onClick={() => setActive(i)}
            className={`rounded-full transition-all ${i === active ? 'w-4 h-1.5 bg-[#1A1A1A]' : 'w-1.5 h-1.5 bg-gray-300'}`}
          />
        ))}
      </div>
    </div>
  )
}

const STATUS_STYLES: Record<LeadStatus, string> = {
  Hot: 'bg-[var(--accent)] text-[var(--on-accent)]',
  Warm: 'bg-orange-100 text-orange-500',
  Cold: 'bg-gray-200 text-gray-500',
}

function LeadsInboxCard({ content }: { content: DoMoreContent }) {
  const [leads, setLeads] = useState<LeadDemo[]>(content.leads)
  const [filter, setFilter] = useState<LeadStatus | 'All'>('All')

  const localHot = leads.filter((g) => g.status === 'Hot').length
  const localWarm = leads.filter((g) => g.status === 'Warm').length
  const localCold = leads.filter((g) => g.status === 'Cold').length
  const initialHot = content.leads.filter((g) => g.status === 'Hot').length
  const initialWarm = content.leads.filter((g) => g.status === 'Warm').length
  const initialCold = content.leads.filter((g) => g.status === 'Cold').length

  const TOTAL = content.leads_total
  const HOT_TOTAL = content.leads_hot + (localHot - initialHot)
  const WARM_TOTAL = content.leads_warm + (localWarm - initialWarm)
  const COLD_TOTAL = content.leads_cold + (localCold - initialCold)

  const cycleStatus = (id: string) => {
    setLeads((prev) =>
      prev.map((g) => {
        if (g.id !== id) return g
        const next: LeadStatus =
          g.status === 'Hot' ? 'Warm' : g.status === 'Warm' ? 'Cold' : 'Hot'
        return { ...g, status: next }
      })
    )
  }

  const filtered = filter === 'All' ? leads : leads.filter((g) => g.status === filter)
  const visible = filtered.slice(0, 5)

  const statCards = [
    { label: content.leads_label_all, value: TOTAL, filter: 'All' as const },
    { label: content.leads_label_hot, value: HOT_TOTAL, filter: 'Hot' as const },
    { label: content.leads_label_warm, value: WARM_TOTAL, filter: 'Warm' as const },
    { label: content.leads_label_cold, value: COLD_TOTAL, filter: 'Cold' as const },
  ]

  return (
    <div className="bg-[#F2F2F0] rounded-[var(--opus-radius-large)] sm:rounded-[var(--opus-radius-xlarge)] p-5 sm:p-8 md:p-10 flex flex-col text-left shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-xl sm:text-2xl font-black text-[#1A1A1A]">{content.leads_title}</h3>
        <span className="shrink-0 bg-[var(--accent)] text-[var(--on-accent)] text-[10px] font-bold px-3 py-1.5 rounded-full ml-4 mt-1 flex items-center gap-1">
          <MessageSquare size={11} /> {HOT_TOTAL} hot
        </span>
      </div>
      <p className="text-gray-500 font-medium mb-6">{content.leads_description}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
        {statCards.map((s) => {
          const isActive = filter === s.filter
          return (
            <button data-opus-button="primary" data-opus-button-size="medium"
              key={s.label}
              onClick={() => setFilter(s.filter)}
              className={`rounded-2xl p-3 text-center shadow-sm transition-all ${isActive ? 'bg-[#1A1A1A]' : 'bg-white hover:bg-gray-50'}`}
            >
              <p className={`text-xl font-black ${isActive ? 'text-white' : 'text-[#1A1A1A]'}`}>{s.value}</p>
              <p className={`text-[9px] mt-1 uppercase tracking-widest ${isActive ? 'text-white/60' : 'text-gray-400'}`}>{s.label}</p>
            </button>
          )
        })}
      </div>

      <div className="space-y-2 mb-6">
        {visible.map((g) => (
          <motion.div
            key={g.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => cycleStatus(g.id)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.image_url} alt={g.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#1A1A1A] truncate">{g.name}</p>
              <p className="text-[10px] text-gray-400 truncate flex items-center gap-1">
                <Calendar size={9} /> {g.event_label}
              </p>
            </div>
            <span className={`text-[9px] font-bold px-2.5 py-1 rounded-full shrink-0 transition-colors ${STATUS_STYLES[g.status]}`}>
              {g.status}
            </span>
          </motion.div>
        ))}
        {visible.length === 0 && (
          <div className="flex items-center justify-center h-16 text-gray-400 text-sm font-medium">
            No {filter.toLowerCase()} leads
          </div>
        )}
        {(() => {
          const totalForFilter =
            filter === 'All' ? TOTAL :
            filter === 'Hot' ? HOT_TOTAL :
            filter === 'Warm' ? WARM_TOTAL : COLD_TOTAL
          const more = totalForFilter - 5
          return more > 0 ? (
            <div className="bg-white rounded-2xl px-4 py-3 flex items-center justify-center shadow-sm">
              <p className="text-xs font-bold text-gray-400">+ {more} more leads</p>
            </div>
          ) : null
        })()}
      </div>

      <a
        href={content.leads_cta_href}
        className="bg-[#1A1A1A] hover:bg-[#333] text-white px-6 py-3 rounded-full font-bold transition-colors mt-auto w-max self-center"
      >
        {content.leads_cta}
      </a>
    </div>
  )
}

export default function DoMoreClient({ content }: { content: DoMoreContent }) {
  return (
    <section className="py-14 sm:py-20 md:py-24 px-4 sm:px-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 sm:gap-8 mb-10 sm:mb-14 md:mb-16">
        <div className="text-center md:text-left">
          <h2 className="text-[2.4rem] sm:text-5xl md:text-6xl lg:text-[72px] font-black tracking-tighter uppercase leading-[1.05] md:leading-[0.88] text-[#1A1A1A]">
            {content.headline_line_1}
            <br />
            {content.headline_line_2}
            <br />
            {content.headline_line_3}
          </h2>
        </div>
        <div className="shrink-0 flex flex-col items-center md:items-end gap-4">
          <p className="text-base sm:text-lg text-gray-500 font-medium max-w-xs text-center md:text-right leading-relaxed">
            {content.side_description}
          </p>
          <a
            href={content.cta_href}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] px-6 py-4 rounded-full font-bold text-sm transition-colors"
          >
            {content.cta_label}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 text-left">
        <div className="bg-[#FFFFFF] border border-gray-100 rounded-[var(--opus-radius-large)] sm:rounded-[var(--opus-radius-xlarge)] p-5 sm:p-8 md:p-10 flex flex-col items-center text-center shadow-sm">
          <h3 className="text-xl sm:text-2xl font-black mb-3 sm:mb-4">{content.storefront_title}</h3>
          <p className="text-sm sm:text-base text-gray-600 mb-6 sm:mb-8 font-medium">
            {content.storefront_description}
          </p>
          <StorefrontCardStack storefronts={content.storefronts} />
          <a
            href={content.storefront_cta_href}
            className="border-2 border-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white px-6 py-3 rounded-full font-bold text-sm transition-colors mt-8 sm:mt-10"
          >
            {content.storefront_cta}
          </a>
        </div>

        <LeadsInboxCard content={content} />
      </div>
    </section>
  )
}
