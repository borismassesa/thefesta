'use client'

import Link from 'next/link'
import { ArrowRight, ArrowUpRight, ArrowDownRight, Bell, HelpCircle } from 'lucide-react'
import Reveal from '@/components/ui/Reveal'

const stats = [
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

const inquiries = [
  { name: 'Amani & Zuri',    date: 'Sat, 12 Dec 2026',   budget: 'TSh 8M – 10M', city: 'Zanzibar, Nungwi',   status: 'New',     image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80' },
  { name: 'Kwame & Amina',   date: 'Sun, 08 Mar 2027',   budget: 'TSh 5M – 7M',  city: 'Arusha',             status: 'Replied', image: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=200&q=80' },
  { name: 'Lucia & Marco',   date: 'Sat, 25 Jan 2026',   budget: 'TSh 12M – 15M',city: 'Dar es Salaam',      status: 'Quoted',  image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&q=80' },
]

function Donut({ items }: { items: { label: string; value: number; color: string }[] }) {
  const radius = 56
  const stroke = 18
  const circ = 2 * Math.PI * radius
  let offset = 0
  return (
    <svg viewBox="0 0 160 160" className="w-40 h-40">
      <g transform="rotate(-90 80 80)">
        {items.map((s) => {
          const len = (circ * s.value) / 100
          const dasharray = `${len} ${circ - len}`
          const dashoffset = -offset
          offset += len
          return (
            <circle
              key={s.label}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={dasharray}
              strokeDashoffset={dashoffset}
            />
          )
        })}
      </g>
      <text x="80" y="78" textAnchor="middle" className="fill-[#1A1A1A] font-black text-2xl">
        {items[0].value}%
      </text>
      <text x="80" y="96" textAnchor="middle" className="fill-gray-400 text-[9px] uppercase tracking-widest font-bold">
        {items[0].label}
      </text>
    </svg>
  )
}

const STATUS_PILL: Record<string, string> = {
  New: 'bg-[var(--accent)] text-[var(--on-accent)]',
  Replied: 'bg-orange-100 text-orange-500',
  Quoted: 'bg-blue-100 text-blue-500',
}

export default function DashboardPreview() {
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
            Every metric, every lead, every booking — in one dashboard. No spreadsheets. No
            switching apps.
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

      {/* Mockup */}
      <Reveal direction="up" margin="-80px">
        <div className="rounded-[var(--opus-radius-large)] sm:rounded-[var(--opus-radius-xlarge)] md:rounded-[var(--opus-radius-xlarge)] bg-[#FDFDFD] border border-gray-200 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.18)] overflow-hidden">
          {/* Top bar */}
          <div className="px-5 sm:px-8 py-5 sm:py-6 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg sm:text-2xl font-black text-[#1A1A1A] leading-tight">
                Welcome back, OpusFesta Photography.
              </h3>
              <p className="text-sm text-gray-500 font-medium mt-1 hidden sm:block">
                Here&apos;s what&apos;s happening with your storefront today.
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

          {/* Section heading */}
          <div className="px-5 sm:px-8 pt-6 pb-4">
            <div className="flex items-baseline gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">
                Leads
              </span>
              <span className="text-xs text-gray-400">Inquiries, conversion, sources</span>
            </div>
          </div>

          {/* Stat cards */}
          <div className="px-5 sm:px-8 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-3">
                  {s.label}
                </p>
                <p className="text-3xl sm:text-4xl font-black text-[#1A1A1A] tracking-tight">
                  {s.value}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-600">
                    {s.positive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                    {s.trend}
                  </span>
                  <span className="text-[10px] text-gray-400">{s.sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Funnel + sources */}
          <div className="px-5 sm:px-8 grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
            <div className="lg:col-span-2 rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm sm:text-base font-bold text-[#1A1A1A]">Conversion funnel</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    How leads move from inquiry to booked — last 90 days
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 shrink-0">
                  11% end-to-end
                </span>
              </div>
              <div className="space-y-3">
                {funnel.map((f) => (
                  <div key={f.label} className="flex items-center gap-3 text-xs">
                    <span className="w-16 text-gray-400 shrink-0">{f.label}</span>
                    <div className="flex-1 h-7 rounded-full bg-gray-50 overflow-hidden relative">
                      <div
                        className={`absolute inset-y-0 left-0 ${f.color} flex items-center pl-3`}
                        style={{ width: `${f.percent}%` }}
                      >
                        <span className="text-white font-black text-xs">{f.count}</span>
                      </div>
                    </div>
                    <span className="w-8 text-right font-bold text-[#1A1A1A] shrink-0">
                      {f.percent}%
                    </span>
                    <span className={`w-20 text-right text-[10px] font-bold shrink-0 ${f.baseline ? 'text-gray-400' : 'text-red-500'}`}>
                      {f.baseline ? 'baseline' : f.delta}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
              <p className="text-sm sm:text-base font-bold text-[#1A1A1A]">Where leads come from</p>
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

          {/* Recent inquiries */}
          <div className="px-5 sm:px-8 pb-6 sm:pb-8">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm sm:text-base font-bold text-[#1A1A1A]">Recent inquiries</p>
                  <p className="text-xs text-gray-400 mt-0.5">Couples who reached out recently.</p>
                </div>
                <a href="#" className="text-xs font-bold text-[var(--accent)] hover:opacity-80 inline-flex items-center gap-1 shrink-0">
                  View all <ArrowUpRight size={12} />
                </a>
              </div>
              <ul className="divide-y divide-gray-100">
                {inquiries.map((row) => (
                  <li key={row.name} className="py-3 flex items-center gap-3 sm:gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={row.image} alt={row.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-[#1A1A1A] truncate">{row.name}</p>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_PILL[row.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {row.status}
                        </span>
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
        </div>
      </Reveal>
    </section>
  )
}
