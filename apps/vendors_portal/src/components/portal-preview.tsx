'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import {
  LayoutDashboard,
  Inbox,
  Store,
  CalendarCheck,
  Star,
  SlidersHorizontal,
  Sparkles,
  Rocket,
  BarChart3,
  HelpCircle,
  MessageSquare,
  Settings,
  Search,
  Bell,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Sparkles as SparklesIcon,
  Clock,
  Timer,
  ListChecks,
  CalendarDays,
  Eye,
  Check,
  Filter,
  Pin,
  Phone,
  Mail,
  MapPin,
  Wallet,
  Camera,
  type LucideIcon,
} from 'lucide-react'
import Reveal from '@/components/ui/Reveal'
import Logo from '@/components/ui/Logo'

type ViewKey =
  | 'dashboard'
  | 'leads'
  | 'storefront'
  | 'bookings'
  | 'reviews'
  | 'lead-preferences'
  | 'plans'
  | 'boost'
  | 'insights'

type NavItem = { icon: LucideIcon; label: string; key: ViewKey; badge?: string }

const topItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', key: 'dashboard' },
  { icon: Inbox, label: 'Leads', key: 'leads', badge: '12' },
]

const mainItems: NavItem[] = [
  { icon: Store, label: 'Storefront', key: 'storefront' },
  { icon: CalendarCheck, label: 'Bookings', key: 'bookings' },
  { icon: Star, label: 'Reviews', key: 'reviews' },
]

const growthItems: NavItem[] = [
  { icon: SlidersHorizontal, label: 'Lead preferences', key: 'lead-preferences' },
  { icon: Sparkles, label: 'Plans', key: 'plans' },
  { icon: Rocket, label: 'Boost storefront', key: 'boost', badge: 'NEW' },
  { icon: BarChart3, label: 'Insights', key: 'insights' },
]

/* ─── Sidebar ────────────────────────────────────────────── */

function PortalSidebar({
  active,
  onSelect,
}: {
  active: ViewKey
  onSelect: (k: ViewKey) => void
}) {
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-gray-100 bg-white">
      <div className="px-5 py-5 border-b border-gray-100">
        <Logo className="h-7 w-auto" />
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs text-gray-400">
          <Search size={12} />
          <span className="flex-1">Search…</span>
          <span className="text-[10px] text-gray-300 font-bold">⌘K</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        <NavGroup items={topItems} active={active} onSelect={onSelect} />

        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 mt-5 mb-2 px-3">
          Your business
        </p>
        <NavGroup items={mainItems} active={active} onSelect={onSelect} />

        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 mt-5 mb-2 px-3">
          Grow
        </p>
        <NavGroup items={growthItems} active={active} onSelect={onSelect} />
      </div>

      <div className="px-2 py-3 border-t border-gray-100 space-y-1">
        {[
          { icon: HelpCircle, label: 'Help center' },
          { icon: MessageSquare, label: 'Feedback' },
          { icon: Settings, label: 'Settings' },
        ].map((it) => {
          const Icon = it.icon
          return (
            <button data-opus-button="control"
              key={it.label}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
            >
              <Icon size={16} className="stroke-[1.5]" />
              <span>{it.label}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function NavGroup({
  items,
  active,
  onSelect,
}: {
  items: NavItem[]
  active: ViewKey
  onSelect: (k: ViewKey) => void
}) {
  return (
    <>
      {items.map((it) => {
        const Icon = it.icon
        const isActive = it.key === active
        return (
          <button data-opus-button="secondary" data-opus-button-size="medium"
            key={it.key}
            onClick={() => onSelect(it.key)}
            className={`w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
              isActive ? 'bg-[#F0DFF6] text-[#7E5896]' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <span className="flex items-center gap-3">
              <Icon size={16} className="stroke-[1.5]" />
              {it.label}
            </span>
            {it.badge && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                it.badge === 'NEW'
                  ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                  : 'bg-[#F0DFF6] text-[#7E5896]'
              }`}>
                {it.badge}
              </span>
            )}
          </button>
        )
      })}
    </>
  )
}

/* ─── Mobile tab strip (for small viewports without sidebar) ─── */

const ALL_NAV: NavItem[] = [...topItems, ...mainItems, ...growthItems]

function MobileTabs({
  active,
  onSelect,
}: {
  active: ViewKey
  onSelect: (k: ViewKey) => void
}) {
  return (
    <div className="md:hidden flex gap-2 overflow-x-auto px-4 py-3 border-b border-gray-100 hide-scrollbar">
      {ALL_NAV.map((it) => {
        const Icon = it.icon
        const isActive = it.key === active
        return (
          <button data-opus-button="primary" data-opus-button-size="small"
            key={it.key}
            onClick={() => onSelect(it.key)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
              isActive ? 'bg-[#1A1A1A] text-white' : 'bg-gray-50 border border-gray-100 text-gray-500'
            }`}
          >
            <Icon size={12} className="stroke-[1.5]" />
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

/* ─── Top bar (greeting / icons) ────────────────────────── */

function PortalTopBar({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="px-5 sm:px-7 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
      <div>
        <h3 className="text-lg sm:text-2xl font-black text-[#1A1A1A] leading-tight">{title}</h3>
        <p className="text-sm text-gray-500 font-medium mt-1 hidden sm:block">{subtitle}</p>
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
          OS
        </div>
      </div>
    </div>
  )
}

/* ─── Dashboard view ────────────────────────────────────── */

const dashStats = [
  { label: 'New inquiries', value: '12', trend: '+18%', sub: 'This week', positive: true },
  { label: 'Conversion rate', value: '11.3%', trend: '+1.2pp', sub: 'vs last month', positive: true },
  { label: 'Avg response time', value: '2h 14m', trend: '−22m', sub: 'vs last month', positive: true },
  { label: 'Booked leads', value: '2', trend: '+1', sub: 'This month', positive: true },
]

const funnel = [
  { label: 'Inquiries', count: 142, percent: 100, baseline: true,  color: 'bg-[#7C3AED]' },
  { label: 'Replied',   count: 111, percent: 78,  delta: '−31 (22%)',  color: 'bg-[#C9A0DC]' },
  { label: 'Quoted',    count: 48,  percent: 34,  delta: '−63 (57%)',  color: 'bg-[#F5A623]' },
  { label: 'Booked',    count: 16,  percent: 11,  delta: '−32 (67%)',  color: 'bg-[#9FE870]' },
]

const sources = [
  { label: 'Search',   value: 58, color: '#5B21B6' },
  { label: 'Featured', value: 22, color: '#9FE870' },
  { label: 'Direct',   value: 14, color: '#F5A623' },
  { label: 'Referral', value: 6,  color: '#3DB7E0' },
]

const recentInquiries = [
  { name: 'Amani & Zuri',  date: 'Sat, 12 Dec 2026', budget: 'TSh 8M – 10M',  city: 'Zanzibar, Nungwi', status: 'New',     image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80' },
  { name: 'Kwame & Amina', date: 'Sun, 08 Mar 2027', budget: 'TSh 5M – 7M',   city: 'Arusha',           status: 'Replied', image: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=200&q=80' },
  { name: 'Lucia & Marco', date: 'Sat, 25 Jan 2026', budget: 'TSh 12M – 15M', city: 'Dar es Salaam',    status: 'Quoted',  image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&q=80' },
]

const STATUS_PILL: Record<string, string> = {
  New: 'bg-[var(--accent)] text-[var(--on-accent)]',
  Replied: 'bg-orange-100 text-orange-500',
  Quoted: 'bg-blue-100 text-blue-500',
}

function Donut({ items }: { items: { label: string; value: number; color: string }[] }) {
  const radius = 56
  const stroke = 18
  const circ = 2 * Math.PI * radius
  let offset = 0
  return (
    <svg viewBox="0 0 160 160" className="w-36 h-36">
      <g transform="rotate(-90 80 80)">
        {items.map((s) => {
          const len = (circ * s.value) / 100
          const dasharray = `${len} ${circ - len}`
          const dashoffset = -offset
          offset += len
          return (
            <circle key={s.label} cx="80" cy="80" r={radius} fill="none" stroke={s.color} strokeWidth={stroke} strokeDasharray={dasharray} strokeDashoffset={dashoffset} />
          )
        })}
      </g>
      <text x="80" y="78" textAnchor="middle" className="fill-[#1A1A1A] font-black text-2xl">{items[0].value}%</text>
      <text x="80" y="96" textAnchor="middle" className="fill-gray-400 text-[9px] uppercase tracking-widest font-bold">{items[0].label}</text>
    </svg>
  )
}

function DashboardView() {
  return (
    <>
      <PortalTopBar
        title="Welcome back, OpusStudio."
        subtitle="Here's what's happening with your storefront today."
      />
      <div className="px-5 sm:px-7 pt-5 pb-4">
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">Leads</span>
          <span className="text-xs text-gray-400">Inquiries, conversion, sources</span>
        </div>
      </div>

      <div className="px-5 sm:px-7 grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {dashStats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-gray-100 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-3">{s.label}</p>
            <p className="text-2xl sm:text-3xl font-black text-[#1A1A1A] tracking-tight">{s.value}</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-600">
                <ArrowUpRight size={10} />
                {s.trend}
              </span>
              <span className="text-[10px] text-gray-400">{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 sm:px-7 grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
        <div className="lg:col-span-2 rounded-2xl border border-gray-100 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-[#1A1A1A]">Conversion funnel</p>
              <p className="text-xs text-gray-400 mt-0.5">How leads move from inquiry to booked — last 90 days</p>
            </div>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 shrink-0">11% end-to-end</span>
          </div>
          <div className="space-y-3">
            {funnel.map((f) => (
              <div key={f.label} className="flex items-center gap-3 text-xs">
                <span className="w-16 text-gray-400 shrink-0">{f.label}</span>
                <div className="flex-1 h-7 rounded-full bg-gray-50 overflow-hidden relative">
                  <div className={`absolute inset-y-0 left-0 ${f.color} flex items-center pl-3`} style={{ width: `${f.percent}%` }}>
                    <span className="text-white font-black text-xs">{f.count}</span>
                  </div>
                </div>
                <span className="w-8 text-right font-bold text-[#1A1A1A] shrink-0">{f.percent}%</span>
                <span className={`w-20 text-right text-[10px] font-bold shrink-0 ${f.baseline ? 'text-gray-400' : 'text-red-500'}`}>{f.baseline ? 'baseline' : f.delta}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <p className="text-sm font-bold text-[#1A1A1A]">Where leads come from</p>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">Share by source — last 90 days</p>
          <div className="flex items-center gap-4">
            <Donut items={sources} />
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              {sources.map((s) => (
                <div key={s.label} className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="text-gray-500 flex-1 min-w-0 truncate">{s.label}</span>
                  <span className="font-bold text-[#1A1A1A]">{s.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 sm:px-7 pb-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-[#1A1A1A]">Recent inquiries</p>
              <p className="text-xs text-gray-400 mt-0.5">Couples who reached out recently.</p>
            </div>
            <span className="text-xs font-bold text-[var(--accent)] inline-flex items-center gap-1 shrink-0">
              View all <ArrowUpRight size={12} />
            </span>
          </div>
          <ul className="divide-y divide-gray-100">
            {recentInquiries.map((row) => (
              <li key={row.name} className="py-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={row.image} alt={row.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-[#1A1A1A] truncate">{row.name}</p>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_PILL[row.status] ?? 'bg-gray-100 text-gray-500'}`}>{row.status}</span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{row.date}</p>
                </div>
                <div className="hidden sm:flex flex-col items-end shrink-0 text-right">
                  <p className="text-xs font-bold text-[#1A1A1A]">{row.budget}</p>
                  <p className="text-[10px] text-gray-400">{row.city}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}

/* ─── Bookings view ──────────────────────────────────────── */

type BookingStage = 'COMPLETED' | 'CONFIRMED' | 'RESERVED' | 'QUOTED' | 'CANCELLED'
type DepositStatus = 'PAID' | 'PENDING' | 'NONE'

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

const attention: Array<{ tone: 'prep' | 'followup' | 'urgent'; badge: string; title: string; meta: string; cta: string; Icon: LucideIcon }> = [
  { tone: 'prep',     badge: 'PREP',      title: 'Doreen & Mark — in 3 days',         meta: 'Mlimani Park, Dar es Salaam · 14:00',     cta: 'Open brief',     Icon: SparklesIcon },
  { tone: 'followup', badge: 'FOLLOW UP', title: 'Joseph & Neema — deposit pending',  meta: 'Contract signed 5d ago · TZS 1.4M due',   cta: 'Send reminder',  Icon: Clock },
  { tone: 'urgent',   badge: 'URGENT',    title: 'Kwame & Amina — slot expires in 14h 26m', meta: 'Full Day · TZS 7.2M',              cta: 'Send reminder',  Icon: Timer },
]
const TONE_STYLES = {
  prep:     { card: 'bg-emerald-50/40 border-emerald-100', icon: 'bg-emerald-100 text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  followup: { card: 'bg-amber-50/40 border-amber-100',     icon: 'bg-amber-100 text-amber-600',     badge: 'bg-amber-100 text-amber-700' },
  urgent:   { card: 'bg-red-50/40 border-red-100',         icon: 'bg-red-100 text-red-500',         badge: 'bg-red-100 text-red-600' },
} as const

const filters = [
  { label: 'All', count: 8, active: true },
  { label: 'Quoted', count: 1 },
  { label: 'Reserved', count: 2 },
  { label: 'Confirmed', count: 3 },
  { label: 'Completed', count: 1 },
  { label: 'Cancelled', count: 1 },
]

const bookings: Array<{ id: string; couple: string; package: string; city: string; date: string; relative: string; stage: BookingStage; expired?: string; value: string; deposit: DepositStatus; activity: string; ago: string; image: string }> = [
  { id: 'b1', couple: 'Mariam & Tito',  package: 'Full Day',  city: 'Dar es Salaam',   date: '15 Apr', relative: '15d ago',   stage: 'COMPLETED', value: 'TZS 5.4M', deposit: 'PAID',    activity: 'Asante sana for an unforgettable day.',     ago: '13d ago', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80' },
  { id: 'b2', couple: 'Doreen & Mark',  package: 'Signature · Mlimani Park, Dar es Salaam', city: '', date: '3 May', relative: 'In 3 days', stage: 'CONFIRMED', value: 'TZS 4.2M', deposit: 'PAID', activity: 'Just confirming the venue lighting setup',  ago: '2d ago',  image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80' },
  { id: 'b3', couple: 'Halima & Said',  package: 'Full Day',  city: 'Dar es Salaam',   date: '10 May', relative: 'In 1 wk',   stage: 'CONFIRMED', value: 'TZS 6.8M', deposit: 'PAID',    activity: 'Sent over the venue map and parking note',  ago: '4d ago',  image: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=200&q=80' },
  { id: 'b4', couple: 'Joseph & Neema', package: 'Essential', city: 'Dar es Salaam',   date: '10 May', relative: 'In 1 wk',   stage: 'RESERVED', expired: 'expires soon', value: 'TZS 2.9M', deposit: 'PENDING', activity: 'Bank transfer should land tomorrow morn…',  ago: '3d ago',  image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&q=80' },
  { id: 'b5', couple: 'Amani & Zuri',   package: 'Signature', city: 'Zanzibar · Nungwi', date: '17 May', relative: 'In 2 wk', stage: 'CONFIRMED', value: 'TZS 5.5M', deposit: 'PAID',    activity: 'Should we book the boat transfer for the…', ago: '1d ago',  image: 'https://images.unsplash.com/photo-1542103749-8ef59b94f47e?auto=format&fit=crop&w=200&q=80' },
]

function BookingsView() {
  return (
    <>
      <PortalTopBar title="Bookings" subtitle="Track every couple from quote to wedding day." />
      <div className="px-5 sm:px-7 pt-5 pb-3 flex items-center justify-between gap-4">
        <div className="flex gap-5 text-sm font-bold">
          <button data-opus-button="control" className="flex items-center gap-2 pb-2 border-b-2 border-[#1A1A1A] text-[#1A1A1A]">
            <ListChecks size={15} /> Pipeline
          </button>
          <button data-opus-button="control" className="flex items-center gap-2 pb-2 text-gray-400">
            <CalendarDays size={15} /> Calendar
          </button>
        </div>
        <button data-opus-button="primary" data-opus-button-size="small" className="shrink-0 inline-flex items-center gap-1.5 bg-[#1A1A1A] hover:bg-[#333] text-white text-xs sm:text-sm font-bold px-3 sm:px-4 py-2 rounded-full">
          <Plus size={14} /> New booking
        </button>
      </div>

      <div className="px-5 sm:px-7 mb-5">
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">Needs attention</p>
            <span className="text-xs text-gray-400">3 items</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {attention.map((a) => {
              const styles = TONE_STYLES[a.tone]
              return (
                <div key={a.title} className={`rounded-xl border ${styles.card} p-3.5 flex flex-col gap-2`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${styles.icon}`}>
                      <a.Icon size={13} />
                    </span>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${styles.badge}`}>{a.badge}</span>
                  </div>
                  <p className="text-xs font-bold text-[#1A1A1A] leading-snug">{a.title}</p>
                  <p className="text-[10px] text-gray-500">{a.meta}</p>
                  <button data-opus-button="control" className="text-[10px] font-bold text-[#1A1A1A] inline-flex items-center gap-1 mt-1">{a.cta} <ArrowRight size={10} /></button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="px-5 sm:px-7 mb-3 flex items-center gap-2 overflow-x-auto hide-scrollbar">
        {filters.map((f) => (
          <button data-opus-button="neutral" data-opus-button-size="small" key={f.label} className={`shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
            f.active ? 'bg-[#1A1A1A] text-white' : 'bg-white border border-gray-200 text-gray-600'
          }`}>
            {f.label}
            <span className={`text-[10px] px-1.5 rounded ${f.active ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-500'}`}>{f.count}</span>
          </button>
        ))}
      </div>

      <div className="px-5 sm:px-7 pb-6">
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
                <div className="md:col-span-2 text-xs"><p className="font-bold text-[#1A1A1A]">{row.date}</p><p className="text-gray-400">{row.relative}</p></div>
                <div className="md:col-span-2">
                  <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded ${STAGE_PILL[row.stage]}`}>{row.stage}</span>
                </div>
                <div className="md:col-span-1 text-xs font-bold text-[#1A1A1A]">{row.value}</div>
                <div className="md:col-span-1">
                  <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded ${DEPOSIT_PILL[row.deposit]}`}>{row.deposit}</span>
                </div>
                <div className="md:col-span-3 text-[11px] text-gray-500 min-w-0">
                  <p className="truncate inline-flex items-center gap-1.5">
                    <MessageSquare size={11} className="shrink-0 text-gray-400" /> {row.activity}
                  </p>
                  <p className="text-gray-400">{row.ago}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}

/* ─── Lightweight views (Leads / Storefront / Portfolio / Reviews / Plans / Insights / etc.) ─── */

function ViewShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <>
      <PortalTopBar title={title} subtitle={subtitle} />
      <div className="px-5 sm:px-7 py-6">{children}</div>
    </>
  )
}

function LeadsView() {
  const tabs = ['Prospects', 'Inquiries', 'Conversations'] as const
  const [activeTab, setActiveTab] = useState<typeof tabs[number]>('Inquiries')
  const inboxLeads = [
    { id: 'l1', name: 'Amani & Zuri',  date: 'Sat, 12 Dec 2026', location: 'Zanzibar, Nungwi', budget: 'TSh 8M – 10M',  image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80' },
    { id: 'l2', name: 'Kwame & Amina', date: 'Sun, 08 Mar 2027', location: 'Arusha',           budget: 'TSh 5M – 7M',   image: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=200&q=80' },
    { id: 'l3', name: 'Neema & Joseph',date: 'Fri, 22 May 2027', location: 'Dar es Salaam',    budget: 'TSh 12M – 15M', image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&q=80' },
    { id: 'l4', name: 'Sara & Daniel', date: 'Sat, 14 Mar 2026', location: 'Bagamoyo',         budget: 'TSh 4M – 6M',   image: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=200&q=80' },
  ]
  const [selectedId, setSelectedId] = useState(inboxLeads[0].id)
  const selected = inboxLeads.find((l) => l.id === selectedId) ?? inboxLeads[0]

  return (
    <>
      <PortalTopBar title="Leads" subtitle="Every couple who's reached out — sorted by what needs your attention." />
      <div className="px-5 sm:px-7 py-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_220px] min-h-[480px]">
            {/* Left — list */}
            <aside className="border-r border-gray-100 flex flex-col">
              <div className="p-4 border-b border-gray-100">
                <div className="flex gap-1 -mx-4 px-4 border-b border-gray-100">
                  {tabs.map((t) => (
                    <button data-opus-button="neutral" data-opus-button-size="small"
                      key={t}
                      onClick={() => setActiveTab(t)}
                      className={`pb-3 px-2 text-xs font-semibold transition-colors border-b-2 -mb-[1px] ${
                        activeTab === t ? 'border-[#C9A0DC] text-[#7E5896]' : 'border-transparent text-gray-400'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      placeholder="Search couples…"
                      className="pl-8 pr-2 py-1.5 bg-gray-50 border border-gray-100 rounded-lg w-full text-xs"
                    />
                  </div>
                </div>
              </div>
              <ul className="flex-1 overflow-y-auto">
                {inboxLeads.map((l) => (
                  <li key={l.id}>
                    <button data-opus-button="control"
                      onClick={() => setSelectedId(l.id)}
                      className={`w-full flex items-start gap-2.5 px-4 py-3 border-b border-gray-50 text-left transition-colors ${
                        selectedId === l.id ? 'bg-[#FCF7FF]' : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={l.image} alt={l.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate">{l.name}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">{l.date}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate">{l.location}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            {/* Middle — detail */}
            <section className="border-r border-gray-100 p-5 flex flex-col">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.image} alt={selected.name} className="w-12 h-12 rounded-full object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <h4 className="text-base font-semibold text-gray-900">{selected.name}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Wedding date · {selected.date}</p>
                </div>
                <button data-opus-button="primary" data-opus-button-size="small" className="text-xs font-semibold px-3 py-2 rounded-xl bg-gray-900 text-white">Reply</button>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <Wallet className="w-3 h-3" /> Budget
                  </p>
                  <p className="text-xs font-semibold text-gray-900 mt-1">{selected.budget}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" /> Location
                  </p>
                  <p className="text-xs font-semibold text-gray-900 mt-1">{selected.location}</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-gray-100 p-4 bg-white">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Message</p>
                <p className="text-xs text-gray-700 leading-relaxed">
                  Hi! We&apos;re planning a weekend wedding and love your portfolio. We&apos;d love to hear about your packages and availability on our date. Looking forward to your reply!
                </p>
              </div>
            </section>

            {/* Right — contact info */}
            <aside className="p-4 hidden lg:block">
              <h5 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Contact information</h5>
              <ul className="mt-3 space-y-2 text-xs">
                <li className="flex items-center gap-2 text-gray-700">
                  <Phone className="w-3.5 h-3.5 text-gray-400" /> +255 712 000 000
                </li>
                <li className="flex items-center gap-2 text-gray-700">
                  <Mail className="w-3.5 h-3.5 text-gray-400" /> couple@example.com
                </li>
              </ul>
              <div className="mt-5 pt-4 border-t border-gray-100">
                <h5 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Lead source</h5>
                <span className="bg-[#F0DFF6] text-[#7E5896] text-[10px] font-bold px-2 py-1 rounded-md">OpusFesta search</span>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  )
}

function StorefrontCircularProgress({ percent }: { percent: number }) {
  const size = 56
  const stroke = 5
  const radius = (size - stroke) / 2
  const circ = 2 * Math.PI * radius
  const offset = circ - (Math.max(0, Math.min(100, percent)) / 100) * circ
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={stroke} fill="none" className="text-gray-100" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={circ} strokeDashoffset={offset} className="text-emerald-500" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-gray-900">{percent}%</span>
    </div>
  )
}

type SectionStatus = 'complete' | 'partial' | 'auto' | 'none'
const STATUS_ICON: Record<SectionStatus, { wrap: string; render: ReactNode; required?: boolean }> = {
  complete: { wrap: 'bg-emerald-500 text-white', render: <Check className="w-3 h-3" strokeWidth={3} /> },
  partial:  { wrap: 'bg-gray-200 text-gray-600', render: <span className="text-xs font-bold leading-none">−</span> },
  auto:     { wrap: 'bg-gray-100 text-gray-500', render: <span className="text-[10px]">🔒</span> },
  none:     { wrap: 'bg-gray-50 text-gray-400 border border-gray-200', render: <span className="text-[8px]">○</span> },
}

const STOREFRONT_SECTIONS: Array<{ id: string; label: string; hint: string; status: SectionStatus; required?: boolean }> = [
  { id: 'about',       label: 'About',                hint: 'Business overview, story, location', status: 'complete', required: true },
  { id: 'photos',      label: 'Photos',               hint: '12 of 20 photos uploaded',           status: 'complete', required: true },
  { id: 'packages',    label: 'Packages & pricing',   hint: '3 packages active',                  status: 'complete', required: true },
  { id: 'services',    label: 'Services',             hint: 'What you offer in detail',           status: 'partial',  required: true },
  { id: 'team',        label: 'Team',                 hint: 'Add up to 8 team members',           status: 'none' },
  { id: 'faq',         label: 'FAQ',                  hint: 'Answer common questions',            status: 'none' },
  { id: 'reviews',     label: 'Reviews',              hint: 'Auto-collected after events',        status: 'auto' },
  { id: 'recognition', label: 'Recognition',          hint: 'Press, awards, badges',              status: 'none' },
]

function StorefrontView() {
  const complete = STOREFRONT_SECTIONS.filter((s) => s.status === 'complete').length
  const total = STOREFRONT_SECTIONS.length
  const percent = Math.round((complete / total) * 100)

  return (
    <>
      <PortalTopBar title="Storefront" subtitle="Manage your public profile — what couples see when they find you." />
      <div className="px-5 sm:px-7 py-6 grid lg:grid-cols-[1fr_280px] gap-4">
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">Storefront</p>
            <h4 className="text-sm font-bold text-[#1A1A1A] mt-0.5">Manage your storefront</h4>
          </div>
          <ul className="p-2">
            {STOREFRONT_SECTIONS.map((s) => {
              const ic = STATUS_ICON[s.status]
              return (
                <li key={s.id}>
                  <button data-opus-button="control" className="group w-full flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <span className={`mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${ic.wrap}`}>
                      {ic.render}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-[#1A1A1A]">{s.label}</span>
                        {s.required && s.status !== 'complete' && s.status !== 'auto' && (
                          <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700">Required</span>
                        )}
                      </span>
                      <span className="block text-xs text-gray-500 mt-0.5 truncate">{s.hint}</span>
                    </span>
                    <ArrowRight className="w-4 h-4 mt-1 shrink-0 text-gray-300 group-hover:text-gray-600 transition-colors" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-5">
            <div className="flex items-center gap-4">
              <StorefrontCircularProgress percent={percent} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#1A1A1A] leading-tight">Profile completeness</p>
                <p className="text-xs text-gray-500 mt-0.5">{complete} of {total} sections complete</p>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5">
              <span className="w-3.5 h-3.5 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">!</span>
              <p className="text-xs text-amber-900 leading-snug">
                <span className="font-semibold">1 required section</span> still needs attention before couples can book you.
              </p>
            </div>
            <button data-opus-button="control" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900">
              <Eye className="w-3.5 h-3.5" /> Preview public storefront
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function ReviewStars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          fill={i < Math.round(value) ? '#F5A623' : 'transparent'}
          className={i < Math.round(value) ? 'text-[#F5A623]' : 'text-gray-200'}
        />
      ))}
    </div>
  )
}

function ReviewsView() {
  const reviews = [
    { id: 'r1', name: 'Doreen & Mark',  pkg: 'Signature', date: '2 weeks ago',  stars: 5, body: 'Absolutely flawless. They captured the dance floor energy perfectly and the same-day teaser had our families crying.', hasPhotos: true,  pinned: true,  reply: 'Thank you Doreen! Mlimani Park was magical — wishing you a lifetime of joy.', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80' },
    { id: 'r2', name: 'Halima & Said',  pkg: 'Full Day',  date: '1 month ago',  stars: 5, body: 'Worth every shilling. The team arrived early, blended in with our guests, and delivered the full gallery in just over a week.', hasPhotos: true,  pinned: false, reply: null, image: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=200&q=80' },
    { id: 'r3', name: 'Joseph & Neema', pkg: 'Essential', date: '2 months ago', stars: 4, body: 'Beautiful photos and we got our gallery within the promised window. The ceremony coverage was perfect.', hasPhotos: false, pinned: false, reply: null, image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&q=80' },
  ]
  const distribution = [
    { star: 5, count: 18 },
    { star: 4, count: 4 },
    { star: 3, count: 1 },
    { star: 2, count: 0 },
    { star: 1, count: 0 },
  ]
  const total = distribution.reduce((s, d) => s + d.count, 0)
  const avg = distribution.reduce((s, d) => s + d.star * d.count, 0) / total
  const awaitingReply = reviews.filter((r) => !r.reply).length

  return (
    <>
      <PortalTopBar title="Reviews" subtitle="What couples say about working with you — auto-collected after every event." />
      <div className="px-5 sm:px-7 py-6 space-y-5">
        {/* Stats + invite */}
        <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex flex-wrap items-start gap-6">
              <div className="shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Average rating</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-gray-900 tabular-nums">{avg.toFixed(1)}</span>
                  <span className="text-xs text-gray-500">/ 5</span>
                </div>
                <div className="mt-2"><ReviewStars value={avg} size={16} /></div>
                <p className="text-[11px] text-gray-500 mt-2">from <span className="font-semibold text-gray-900">{total}</span> reviews</p>
              </div>
              <div className="flex-1 min-w-[200px]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">Rating distribution</p>
                <ul className="space-y-1.5">
                  {distribution.map(({ star, count }) => {
                    const pct = total === 0 ? 0 : Math.round((count / total) * 100)
                    return (
                      <li key={star} className="flex items-center gap-3">
                        <span className="w-6 text-[11px] font-semibold text-gray-700 tabular-nums shrink-0">{star}★</span>
                        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-right text-[11px] text-gray-500 tabular-nums shrink-0">{count}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
            <p className="mt-4 text-[11px] text-gray-500 leading-relaxed">OpusFesta auto-collects reviews from couples after each event — you can&apos;t write or delete them, but you can reply, pin, or report.</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">Invite a couple</p>
            <p className="text-xs text-gray-700 leading-relaxed mb-4">Send a polite nudge to a recent couple to share their experience.</p>
            <div className="space-y-2">
              {[
                { name: 'Mariam & Tito', pkg: 'Full Day · 4 Apr' },
                { name: 'Lulu & Ben',    pkg: 'Signature · 29 Mar' },
              ].map((c) => (
                <div key={c.name} className="flex items-center gap-2.5 p-2 rounded-lg border border-gray-100">
                  <div className="w-7 h-7 rounded-full bg-gray-100" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{c.name}</p>
                    <p className="text-[10px] text-gray-500 truncate">{c.pkg}</p>
                  </div>
                  <button data-opus-button="primary" data-opus-button-size="small" className="text-[10px] font-bold px-2 py-1 rounded bg-[#1A1A1A] text-white">Invite</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Filter / sort */}
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Sort</span>
            <div className="flex gap-1">
              {['Most recent', 'Highest', 'Lowest', `Awaiting (${awaitingReply})`].map((l, i) => (
                <button data-opus-button="primary" data-opus-button-size="small" key={l} className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${i === 0 ? 'bg-[#1A1A1A] text-white' : 'text-gray-500'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-3 h-3 text-gray-400" />
            <div className="flex gap-1">
              {[`All ${total}`, 'With photos', `Awaiting (${awaitingReply})`].map((l, i) => (
                <button data-opus-button="primary" data-opus-button-size="small" key={l} className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${i === 0 ? 'bg-[#1A1A1A] text-white' : 'text-gray-500'}`}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Review cards */}
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.image} alt={r.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                    {r.pinned && <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded"><Pin size={9} /> Pinned</span>}
                    {r.hasPhotos && <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded"><Camera size={9} /> Photos</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <ReviewStars value={r.stars} />
                    <span className="text-[11px] text-gray-400">· {r.pkg} · {r.date}</span>
                  </div>
                </div>
                <button data-opus-button="control" className="text-[10px] font-bold text-gray-400">Report</button>
              </div>
              <p className="mt-3 text-sm text-gray-700 leading-relaxed">{r.body}</p>
              {r.reply && (
                <div className="mt-3 ml-13 border-l-2 border-[var(--accent)] pl-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#7E5896] mb-1">Your reply</p>
                  <p className="text-xs text-gray-700 leading-relaxed">{r.reply}</p>
                </div>
              )}
              {!r.reply && (
                <div className="mt-3 flex gap-2">
                  <button data-opus-button="primary" data-opus-button-size="small" className="text-xs font-bold px-3 py-1.5 rounded-full bg-[#1A1A1A] text-white">Reply</button>
                  <button data-opus-button="control" className="text-xs font-bold px-3 py-1.5 rounded-full text-gray-500 border border-gray-200">Pin</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function PlansView() {
  const plans = [
    { name: 'Starter', price: 'Free', sub: 'Forever', features: ['Storefront', 'Up to 10 leads/month', 'Mobile-money deposits', 'Service-fee on bookings'], cta: 'Current plan', current: true },
    { name: 'Pro',     price: 'TSh 49,000', sub: '/month', features: ['Unlimited leads', 'Quote templates', '0% commission', 'Calendar sync', 'Priority listing'], cta: 'Upgrade', current: false },
  ]
  return (
    <ViewShell title="Plans" subtitle="Pick the plan that fits where your business is today.">
      <div className="grid md:grid-cols-2 gap-4">
        {plans.map((p) => (
          <div key={p.name} className={`rounded-2xl p-6 border ${p.current ? 'border-gray-100 bg-white' : 'border-[var(--accent)] bg-[var(--accent)]/10'}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-3">{p.name}</p>
            <p className="text-3xl font-black text-[#1A1A1A]">{p.price} <span className="text-sm font-bold text-gray-400">{p.sub}</span></p>
            <ul className="mt-5 space-y-2 text-sm text-gray-700">
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-500" />
                  {f}
                </li>
              ))}
            </ul>
            <button data-opus-button="primary" data-opus-button-size="large" className={`mt-6 w-full rounded-full font-bold text-sm py-3 ${p.current ? 'bg-gray-100 text-gray-500' : 'bg-[#1A1A1A] text-white hover:bg-[#333]'}`}>
              {p.cta}
            </button>
          </div>
        ))}
      </div>
    </ViewShell>
  )
}

function InsightsView() {
  return (
    <ViewShell title="Insights" subtitle="Trends, top-performing photos, busiest seasons — at a glance.">
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <p className="text-sm font-bold text-[#1A1A1A]">Profile views (12 weeks)</p>
          <svg viewBox="0 0 300 100" className="w-full h-32 mt-3">
            <polyline fill="none" stroke="#C9A0DC" strokeWidth="3" points="0,80 25,72 50,68 75,55 100,60 125,40 150,45 175,30 200,35 225,22 250,18 275,12 300,10" />
            <polyline fill="rgba(201,160,220,0.2)" stroke="none" points="0,80 25,72 50,68 75,55 100,60 125,40 150,45 175,30 200,35 225,22 250,18 275,12 300,10 300,100 0,100" />
          </svg>
          <p className="text-xs text-emerald-600 font-bold mt-2">+ 38% vs last quarter</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <p className="text-sm font-bold text-[#1A1A1A]">Top searched terms</p>
          <ul className="mt-3 space-y-2 text-sm">
            {[{ term: 'Zanzibar photographer', n: 4321 }, { term: 'Beach wedding', n: 2891 }, { term: 'Same-day edit', n: 1442 }, { term: 'Drone wedding', n: 988 }].map((t) => (
              <li key={t.term} className="flex items-center justify-between">
                <span className="text-gray-700">{t.term}</span>
                <span className="font-bold text-[#1A1A1A]">{t.n.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ViewShell>
  )
}

function ComingSoon({ title, subtitle, body }: { title: string; subtitle: string; body: string }) {
  return (
    <ViewShell title={title} subtitle={subtitle}>
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
        <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mb-2">Preview</p>
        <p className="text-base text-gray-600 max-w-md mx-auto leading-relaxed">{body}</p>
      </div>
    </ViewShell>
  )
}

/* ─── View dispatcher ────────────────────────────────────── */

function PortalView({ view }: { view: ViewKey }) {
  switch (view) {
    case 'dashboard': return <DashboardView />
    case 'leads':     return <LeadsView />
    case 'storefront':return <StorefrontView />
    case 'bookings':  return <BookingsView />
    case 'reviews':   return <ReviewsView />
    case 'plans':     return <PlansView />
    case 'insights':  return <InsightsView />
    case 'lead-preferences':
      return <ComingSoon title="Lead preferences" subtitle="Tune which leads reach you." body="Filter inbound leads by date range, budget, location, package size and event type. Only get notified about couples that fit." />
    case 'boost':
      return <ComingSoon title="Boost storefront" subtitle="Promote your profile to more couples." body="Pay-per-week placement that puts your storefront at the top of category and city search results — with a real-time impressions counter." />
  }
}

/* ─── Top-level section ──────────────────────────────────── */

export default function PortalPreview() {
  const [view, setView] = useState<ViewKey>('dashboard')

  return (
    <section className="py-14 sm:py-20 md:py-24 px-4 sm:px-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 sm:gap-8 mb-10 sm:mb-14 md:mb-16">
        <Reveal direction="up" className="text-center md:text-left">
          <h2 className="text-[2.4rem] sm:text-5xl md:text-6xl lg:text-[72px] font-black tracking-tighter uppercase leading-[1.05] md:leading-[0.88] text-[#1A1A1A]">
            See your business
            <br />
            at a glance
          </h2>
        </Reveal>
        <Reveal direction="up" delay={0.05} className="shrink-0 flex flex-col items-center md:items-end gap-4">
          <p className="text-base sm:text-lg text-gray-500 font-medium max-w-xs text-center md:text-right leading-relaxed">
            Click around the live demo — every part of the vendor portal, no sign-up needed.
          </p>
          <Link
            href="/sign-up"
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--on-accent)] px-6 py-4 rounded-full font-bold text-sm transition-colors inline-flex items-center gap-2"
          >
            Try the dashboard
            <ArrowRight size={16} />
          </Link>
        </Reveal>
      </div>

      {/* Mockup window with sidebar + content */}
      <Reveal direction="up" margin="-80px">
        <div className="rounded-[var(--opus-radius-large)] sm:rounded-[var(--opus-radius-xlarge)] md:rounded-[var(--opus-radius-xlarge)] bg-[#FDFDFD] border border-gray-200 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.18)] overflow-hidden flex">
          <PortalSidebar active={view} onSelect={setView} />
          <div className="flex-1 min-w-0">
            <MobileTabs active={view} onSelect={setView} />
            <PortalView view={view} />
          </div>
        </div>
      </Reveal>
    </section>
  )
}
