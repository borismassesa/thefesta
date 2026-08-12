'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import type {
  DoMoreContent,
  GuestDemo,
  GuestStatus,
  WebsiteDemo,
} from '@/lib/cms/do-more'
import { THEME_COLORS } from '@/lib/cms/do-more'

const POSITIONS = [
  { top: 40, x: 0, scale: 1, opacity: 1, zIndex: 30, shadow: '0 20px 60px rgba(0,0,0,0.15)' },
  { top: 20, x: 0, scale: 0.97, opacity: 0.75, zIndex: 20, shadow: '0 8px 24px rgba(0,0,0,0.08)' },
  { top: 0,  x: 0, scale: 0.94, opacity: 0.45, zIndex: 10, shadow: '0 4px 12px rgba(0,0,0,0.05)' },
]

function CardContent({ card, isFront }: { card: WebsiteDemo; isFront: boolean }) {
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
        <div className={`${isFront ? 'w-36' : 'flex-1'} bg-white rounded-md px-2.5 py-1 flex items-center justify-between gap-1.5 border border-gray-300`}>
          <p className="text-[7px] text-gray-400 truncate">{card.url}</p>
          <span className="text-[7px] text-gray-300 shrink-0">✕</span>
        </div>
        {isFront && (
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <span className="text-[9px] text-gray-400">⤴</span>
            <span className="text-[9px] text-gray-400">☆</span>
            <div className="w-4 h-4 rounded-full bg-[#1A1A1A] flex items-center justify-center">
              <span className="text-[6px] font-bold text-white">{card.name[0]}</span>
            </div>
          </div>
        )}
      </div>

      {/* Site navbar */}
      <div
        className="px-3 py-2 flex items-center justify-between border-b"
        style={{ background: colors.navBg, borderColor: colors.navBorder }}
      >
        <p className="text-[8px] font-black tracking-widest" style={{ color: colors.navText }}>{card.initials}</p>
        <div className="flex items-center gap-2">
          {['Story', 'Details', 'Gallery'].map((item) => (
            <p key={item} className="text-[6px] font-semibold uppercase" style={{ color: colors.navText + '66' }}>{item}</p>
          ))}
          <span
            className="text-[6px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: colors.rsvpBg, color: colors.rsvpText ?? '#ffffff' }}
          >
            RSVP
          </span>
        </div>
      </div>

      {/* Hero */}
      <div
        className="relative flex flex-col items-center justify-center py-10 gap-2.5 overflow-hidden"
        style={{ background: colors.heroBg ?? colors.heroGradient }}
      >
        {colors.botanical && (
          <>
            <div className="absolute -top-3 -left-3 w-16 h-16 opacity-20" style={{ background: 'radial-gradient(ellipse at 30% 30%, #7BA05B, transparent)', borderRadius: '60% 40% 70% 30% / 50% 60% 40% 50%' }} />
            <div className="absolute -bottom-2 -right-2 w-14 h-14 opacity-15" style={{ background: 'radial-gradient(ellipse at 70% 70%, #7BA05B, transparent)', borderRadius: '40% 60% 30% 70% / 60% 40% 50% 50%' }} />
          </>
        )}
        <p className="text-[6px] uppercase tracking-[0.25em] z-10" style={{ color: colors.heroSub }}>We&apos;re getting married</p>
        <p className="text-[16px] font-semibold z-10 leading-tight" style={{ fontFamily: 'Georgia, serif', color: colors.heroText }}>{card.name}</p>
        <div className="flex items-center gap-2 z-10">
          <div className="w-6 h-px" style={{ background: colors.heroSub }} />
          <span className="text-[5px]" style={{ color: colors.heroSub }}>✦</span>
          <div className="w-6 h-px" style={{ background: colors.heroSub }} />
        </div>
        <p className="text-[6px] uppercase tracking-widest z-10" style={{ color: colors.heroSub }}>{card.date}</p>
        <p className="text-[5.5px] z-10" style={{ color: colors.heroSub }}>{card.location}</p>
        <button data-opus-button="control"
          className="mt-1 text-[6px] font-semibold px-4 py-1.5 rounded-full tracking-widest uppercase z-10 border"
          style={{ borderColor: colors.heroText + '30', color: colors.heroText }}
        >
          RSVP
        </button>
      </div>

      {isFront && (
        <>
          {/* Countdown strip */}
          <div className="bg-[#FAF7F4] border-b border-[#EDE8E2] px-4 py-2 flex items-center justify-between">
            <p className="text-[7px] text-[#3D3530]/40 uppercase tracking-widest">{card.countdown_label ?? 'Days to go'}</p>
            <div className="flex gap-3">
              {[{ v: '142', l: 'Days' }, { v: '06', l: 'Hrs' }, { v: '24', l: 'Min' }].map((t) => (
                <div key={t.l} className="text-center">
                  <p className="text-[10px] font-black text-[#3D3530]">{t.v}</p>
                  <p className="text-[6px] text-[#3D3530]/40 uppercase tracking-wide">{t.l}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Venue + gallery row */}
          <div className="bg-white px-4 py-3 flex items-center gap-2">
            <div className="flex-1">
              <p className="text-[7px] font-black text-[#1A1A1A] uppercase tracking-widest mb-1">Venue</p>
              <p className="text-[8px] font-bold text-[#1A1A1A]">{card.venue}</p>
              <p className="text-[7px] text-gray-400">{card.venue_city}</p>
            </div>
            <div className="flex gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=80&q=80" alt="gallery" className="w-9 h-9 rounded-lg object-cover" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=80&q=80" alt="gallery" className="w-9 h-9 rounded-lg object-cover" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=80&q=80" alt="gallery" className="w-9 h-9 rounded-lg object-cover" />
            </div>
          </div>
        </>
      )}
    </>
  )
}

function WebsiteCardStack({ websites }: { websites: WebsiteDemo[] }) {
  const [active, setActive] = useState(0)
  const cycle = () => setActive((a) => (a + 1) % websites.length)

  if (websites.length === 0) return null

  return (
    <div className="relative mb-8 w-full max-w-[min(288px,100%)] h-[380px]">
      {websites.map((card, i) => {
        const pos = (i - active + websites.length) % websites.length
        const fallback = POSITIONS[Math.min(pos, POSITIONS.length - 1)]
        const { top, scale, opacity, zIndex, shadow } = fallback
        const isFront = pos === 0

        return (
          <motion.div
            key={card.id}
            className="absolute left-0 right-0 rounded-3xl overflow-hidden cursor-pointer select-none"
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
            <CardContent card={card} isFront={isFront} />
          </motion.div>
        )
      })}

      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
        {websites.map((_, i) => (
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

function GuestListCard({ content }: { content: DoMoreContent }) {
  const [guests, setGuests] = useState<GuestDemo[]>(content.guests)
  const [filter, setFilter] = useState<GuestStatus | 'All'>('All')

  const localConfirmed = guests.filter((g) => g.status === 'Confirmed').length
  const localPending = guests.filter((g) => g.status === 'Pending').length
  const localDeclined = guests.filter((g) => g.status === 'Declined').length
  const initialConfirmed = content.guests.filter((g) => g.status === 'Confirmed').length
  const initialPending = content.guests.filter((g) => g.status === 'Pending').length
  const initialDeclined = content.guests.filter((g) => g.status === 'Declined').length

  const TOTAL = content.guests_total
  const CONFIRMED_TOTAL = content.guests_confirmed + (localConfirmed - initialConfirmed)
  const PENDING_TOTAL = content.guests_pending + (localPending - initialPending)
  const DECLINED_TOTAL = content.guests_declined + (localDeclined - initialDeclined)

  const cycleStatus = (id: string) => {
    setGuests((prev) =>
      prev.map((g) => {
        if (g.id !== id) return g
        const next: GuestStatus =
          g.status === 'Confirmed' ? 'Pending' : g.status === 'Pending' ? 'Declined' : 'Confirmed'
        return { ...g, status: next }
      })
    )
  }

  const filtered = filter === 'All' ? guests : guests.filter((g) => g.status === filter)
  const visible = filtered.slice(0, 5)

  const statCards = [
    { label: content.guests_label_invited, value: TOTAL, filter: 'All' as const },
    { label: content.guests_label_confirmed, value: CONFIRMED_TOTAL, filter: 'Confirmed' as const },
    { label: content.guests_label_pending, value: PENDING_TOTAL, filter: 'Pending' as const },
    { label: content.guests_label_declined, value: DECLINED_TOTAL, filter: 'Declined' as const },
  ]

  return (
    <div className="bg-[#F2F2F0] rounded-[var(--opus-radius-large)] sm:rounded-[var(--opus-radius-xlarge)] p-5 sm:p-8 md:p-10 flex flex-col text-left shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-xl sm:text-2xl font-black text-[#1A1A1A]">{content.guests_title}</h3>
        <span className="shrink-0 bg-[var(--accent)] text-[var(--on-accent)] text-[10px] font-bold px-3 py-1.5 rounded-full ml-4 mt-1">
          {CONFIRMED_TOTAL} / {TOTAL} RSVPs
        </span>
      </div>
      <p className="text-gray-500 font-medium mb-6">{content.guests_description}</p>

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
              <p className="text-[9px] text-gray-400">Click to update status</p>
            </div>
            <span className={`text-[9px] font-bold px-2.5 py-1 rounded-full shrink-0 transition-colors ${
              g.status === 'Confirmed' ? 'bg-[var(--accent)] text-[var(--on-accent)]' :
              g.status === 'Declined'  ? 'bg-red-100 text-red-500' :
              'bg-orange-100 text-orange-500'
            }`}>
              {g.status}
            </span>
          </motion.div>
        ))}
        {visible.length === 0 && (
          <div className="flex items-center justify-center h-16 text-gray-400 text-sm font-medium">
            No {filter.toLowerCase()} guests
          </div>
        )}
        {(() => {
          const totalForFilter =
            filter === 'All' ? TOTAL :
            filter === 'Confirmed' ? CONFIRMED_TOTAL :
            filter === 'Pending' ? PENDING_TOTAL : DECLINED_TOTAL
          const more = totalForFilter - 5
          return more > 0 ? (
            <div className="bg-white rounded-2xl px-4 py-3 flex items-center justify-center shadow-sm">
              <p className="text-xs font-bold text-gray-400">+ {more} more guests</p>
            </div>
          ) : null
        })()}
      </div>

      <a
        href={content.guests_cta_href}
        className="bg-[#1A1A1A] hover:bg-[#333] text-white px-6 py-3 rounded-full font-bold transition-colors mt-auto w-max self-center"
      >
        {content.guests_cta}
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
          <h3 className="text-xl sm:text-2xl font-black mb-3 sm:mb-4">{content.websites_title}</h3>
          <p className="text-sm sm:text-base text-gray-600 mb-6 sm:mb-8 font-medium">
            {content.websites_description}
          </p>
          <WebsiteCardStack websites={content.websites} />
          <a
            href={content.websites_cta_href}
            className="border-2 border-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white px-6 py-3 rounded-full font-bold text-sm transition-colors mt-8 sm:mt-10"
          >
            {content.websites_cta}
          </a>
        </div>

        <GuestListCard content={content} />
      </div>
    </section>
  )
}
