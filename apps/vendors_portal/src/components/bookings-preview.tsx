'use client'

import Link from 'next/link'
import { Sparkles, Clock, Timer, ArrowRight, Plus, MessageCircle, Bell, HelpCircle, ListChecks, CalendarDays } from 'lucide-react'
import Reveal from '@/components/ui/Reveal'

type AttentionTone = 'prep' | 'followup' | 'urgent'
type BookingStage = 'COMPLETED' | 'CONFIRMED' | 'RESERVED' | 'QUOTED' | 'CANCELLED'
type DepositStatus = 'PAID' | 'PENDING' | 'NONE'

const attention: Array<{
  tone: AttentionTone
  badge: string
  title: string
  meta: string
  cta: string
  Icon: typeof Sparkles
}> = [
  {
    tone: 'prep',
    badge: 'PREP',
    title: 'Doreen & Mark — in 3 days',
    meta: 'Mlimani Park, Dar es Salaam · 14:00',
    cta: 'Open brief',
    Icon: Sparkles,
  },
  {
    tone: 'followup',
    badge: 'FOLLOW UP',
    title: 'Joseph & Neema — deposit pending',
    meta: 'Contract signed 5d ago · TZS 1.4M due',
    cta: 'Send reminder',
    Icon: Clock,
  },
  {
    tone: 'urgent',
    badge: 'URGENT',
    title: 'Kwame & Amina — slot expires in 14h 26m',
    meta: 'Full Day · TZS 7.2M',
    cta: 'Send reminder',
    Icon: Timer,
  },
]

const TONE_STYLES: Record<AttentionTone, { card: string; icon: string; badge: string }> = {
  prep:     { card: 'bg-emerald-50/40 border-emerald-100',  icon: 'bg-emerald-100 text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  followup: { card: 'bg-amber-50/40 border-amber-100',      icon: 'bg-amber-100 text-amber-600',     badge: 'bg-amber-100 text-amber-700' },
  urgent:   { card: 'bg-red-50/40 border-red-100',          icon: 'bg-red-100 text-red-500',         badge: 'bg-red-100 text-red-600' },
}

const filters = [
  { label: 'All', count: 8, active: true },
  { label: 'Quoted', count: 1 },
  { label: 'Reserved', count: 2 },
  { label: 'Confirmed', count: 3 },
  { label: 'Completed', count: 1 },
  { label: 'Cancelled', count: 1 },
]

const STAGE_PILL: Record<BookingStage, string> = {
  COMPLETED: 'bg-gray-100 text-gray-600',
  CONFIRMED: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
  RESERVED: 'bg-amber-50 text-amber-600 border border-amber-200',
  QUOTED: 'bg-blue-50 text-blue-500 border border-blue-200',
  CANCELLED: 'bg-red-50 text-red-500 border border-red-200',
}

const DEPOSIT_PILL: Record<DepositStatus, string> = {
  PAID: 'bg-emerald-50 text-emerald-600',
  PENDING: 'bg-amber-50 text-amber-700',
  NONE: 'bg-gray-100 text-gray-500',
}

const bookings: Array<{
  id: string
  couple: string
  package: string
  city: string
  date: string
  relative: string
  stage: BookingStage
  expired?: string
  value: string
  deposit: DepositStatus
  activity: string
  ago: string
  image: string
}> = [
  { id: 'b1', couple: 'Mariam & Tito',  package: 'Full Day', city: 'Dar es Salaam', date: '15 Apr', relative: '15d ago', stage: 'COMPLETED', value: 'TZS 5.4M', deposit: 'PAID',    activity: 'Asante sana for an unforgettable day.', ago: '13d ago', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80' },
  { id: 'b2', couple: 'Doreen & Mark',  package: 'Signature · Mlimani Park, Dar es Salaam', city: '', date: '3 May',  relative: 'In 3 days', stage: 'CONFIRMED', value: 'TZS 4.2M', deposit: 'PAID', activity: 'Just confirming the venue lighting setup', ago: '2d ago', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80' },
  { id: 'b3', couple: 'Halima & Said',  package: 'Full Day', city: 'Dar es Salaam', date: '10 May', relative: 'In 1 wk', stage: 'CONFIRMED', value: 'TZS 6.8M', deposit: 'PAID',    activity: 'Sent over the venue map and parking note', ago: '4d ago', image: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=200&q=80' },
  { id: 'b4', couple: 'Joseph & Neema', package: 'Essential', city: 'Dar es Salaam', date: '10 May', relative: 'In 1 wk', stage: 'RESERVED', expired: 'expires soon', value: 'TZS 2.9M', deposit: 'PENDING', activity: 'Bank transfer should land tomorrow morn…', ago: '3d ago', image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&q=80' },
  { id: 'b5', couple: 'Amani & Zuri',   package: 'Signature', city: 'Zanzibar · Nungwi', date: '17 May', relative: 'In 2 wk', stage: 'CONFIRMED', value: 'TZS 5.5M', deposit: 'PAID',    activity: 'Should we book the boat transfer for the…', ago: '1d ago', image: 'https://images.unsplash.com/photo-1542103749-8ef59b94f47e?auto=format&fit=crop&w=200&q=80' },
]

export default function BookingsPreview() {
  return (
    <section className="py-14 sm:py-20 md:py-24 px-4 sm:px-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 sm:gap-8 mb-10 sm:mb-14 md:mb-16">
        <Reveal direction="up" className="text-center md:text-left">
          <h2 className="text-[2.4rem] sm:text-5xl md:text-6xl lg:text-[72px] font-black tracking-tighter uppercase leading-[1.05] md:leading-[0.88] text-[#1A1A1A]">
            From quote
            <br />
            to wedding day
          </h2>
        </Reveal>
        <Reveal direction="up" delay={0.05} className="shrink-0 flex flex-col items-center md:items-end gap-4">
          <p className="text-base sm:text-lg text-gray-500 font-medium max-w-xs text-center md:text-right leading-relaxed">
            Track every couple through your pipeline. Quotes, deposits, contracts, calendar — all in
            one view, with reminders that nudge for you.
          </p>
          <Link
            href="/sign-up"
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] px-6 py-4 rounded-full font-bold text-sm transition-colors inline-flex items-center gap-2"
          >
            Start tracking
            <ArrowRight size={16} />
          </Link>
        </Reveal>
      </div>

      {/* Mockup */}
      <Reveal direction="up" margin="-80px">
        <div className="rounded-[var(--opus-radius-large)] sm:rounded-[var(--opus-radius-xlarge)] md:rounded-[var(--opus-radius-xlarge)] bg-[#FDFDFD] border border-gray-200 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.18)] overflow-hidden">
          {/* Top bar */}
          <div className="px-5 sm:px-8 py-5 sm:py-6 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg sm:text-2xl font-black text-[#1A1A1A] leading-tight">
                Bookings
              </h3>
              <p className="text-sm text-gray-500 font-medium mt-1 hidden sm:block">
                Track every couple from quote to wedding day.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button data-opus-button="control" className="hidden sm:flex w-9 h-9 rounded-full bg-gray-50 border border-gray-100 items-center justify-center text-gray-400">
                <HelpCircle size={16} />
              </button>
              <button data-opus-button="control" className="hidden sm:flex w-9 h-9 rounded-full bg-gray-50 border border-gray-100 items-center justify-center text-gray-400 relative">
                <Bell size={16} />
                <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-red-500" />
              </button>
              <div className="w-9 h-9 rounded-full bg-[var(--accent)] flex items-center justify-center text-[var(--on-accent)] text-xs font-black">
                OP
              </div>
            </div>
          </div>

          {/* Tabs + new booking */}
          <div className="px-5 sm:px-8 pt-5 pb-4 flex items-center justify-between gap-4">
            <div className="flex gap-5 sm:gap-7 text-sm font-bold">
              <button data-opus-button="control" className="flex items-center gap-2 pb-2 border-b-2 border-[#1A1A1A] text-[#1A1A1A]">
                <ListChecks size={15} /> Pipeline
              </button>
              <button data-opus-button="control" className="flex items-center gap-2 pb-2 text-gray-400">
                <CalendarDays size={15} /> Calendar
              </button>
            </div>
            <button data-opus-button="primary" data-opus-button-size="small" className="shrink-0 inline-flex items-center gap-1.5 bg-[#1A1A1A] hover:bg-[#333] text-white text-xs sm:text-sm font-bold px-3 sm:px-5 py-2 sm:py-2.5 rounded-full">
              <Plus size={14} /> New booking
            </button>
          </div>

          {/* Needs attention */}
          <div className="px-5 sm:px-8 mb-6">
            <div className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">
                  Needs attention
                </p>
                <span className="text-xs text-gray-400">3 items</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {attention.map((a) => {
                  const styles = TONE_STYLES[a.tone]
                  return (
                    <div key={a.title} className={`rounded-xl border ${styles.card} p-4 flex flex-col gap-3`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${styles.icon}`}>
                          <a.Icon size={14} />
                        </span>
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${styles.badge}`}>
                          {a.badge}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#1A1A1A] leading-snug">{a.title}</p>
                        <p className="text-[11px] text-gray-500 mt-1">{a.meta}</p>
                      </div>
                      <button data-opus-button="control" className="text-xs font-bold text-[#1A1A1A] inline-flex items-center gap-1 hover:gap-1.5 transition-all">
                        {a.cta} <ArrowRight size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="px-5 sm:px-8 mb-4 flex items-center justify-between gap-3 overflow-x-auto hide-scrollbar">
            <div className="flex gap-2 shrink-0">
              {filters.map((f) => (
                <button data-opus-button="neutral" data-opus-button-size="small"
                  key={f.label}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                    f.active ? 'bg-[#1A1A1A] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {f.label}
                  <span className={`text-[10px] px-1.5 rounded ${f.active ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {f.count}
                  </span>
                </button>
              ))}
            </div>
            <div className="hidden lg:flex items-center gap-2 shrink-0">
              <span className="bg-gray-50 border border-gray-100 rounded-full px-3 py-1.5 text-xs text-gray-400">
                Search couple, venue…
              </span>
              <span className="bg-gray-50 border border-gray-100 rounded-full px-3 py-1.5 text-xs text-gray-500 font-bold">
                Soonest event
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="px-5 sm:px-8 pb-6 sm:pb-8">
            <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
              <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-3 border-b border-gray-100 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
                <span className="col-span-3">Couple</span>
                <span className="col-span-2">Event date</span>
                <span className="col-span-2">Stage</span>
                <span className="col-span-1">Value</span>
                <span className="col-span-1">Deposit</span>
                <span className="col-span-3">Last activity</span>
              </div>
              <ul className="divide-y divide-gray-100">
                {bookings.map((row) => (
                  <li key={row.id} className="px-4 py-3 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 items-center">
                    <div className="md:col-span-3 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={row.image} alt={row.couple} className="w-8 h-8 rounded-full object-cover shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#1A1A1A] truncate">{row.couple}</p>
                        <p className="text-[11px] text-gray-400 truncate">{row.package}{row.city ? ` · ${row.city}` : ''}</p>
                      </div>
                    </div>
                    <div className="md:col-span-2 text-xs">
                      <p className="font-bold text-[#1A1A1A]">{row.date}</p>
                      <p className="text-gray-400">{row.relative}</p>
                    </div>
                    <div className="md:col-span-2">
                      <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded ${STAGE_PILL[row.stage]}`}>
                        {row.stage}
                      </span>
                      {row.expired && (
                        <p className="text-[10px] text-red-500 font-bold mt-1 inline-flex items-center gap-1">
                          <Timer size={10} /> {row.expired}
                        </p>
                      )}
                    </div>
                    <div className="md:col-span-1 text-xs font-bold text-[#1A1A1A]">{row.value}</div>
                    <div className="md:col-span-1">
                      <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded ${DEPOSIT_PILL[row.deposit]}`}>
                        {row.deposit}
                      </span>
                    </div>
                    <div className="md:col-span-3 text-[11px] text-gray-500 min-w-0">
                      <p className="truncate inline-flex items-center gap-1.5">
                        <MessageCircle size={11} className="shrink-0 text-gray-400" />
                        {row.activity}
                      </p>
                      <p className="text-gray-400">{row.ago}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}
