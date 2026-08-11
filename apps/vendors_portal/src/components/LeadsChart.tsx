'use client'

import { useMemo, useState } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { InsightPoint, ProfileViewsRange } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const RANGE_OPTIONS: { id: ProfileViewsRange; label: string; sub: string }[] = [
  { id: 'day', label: 'Day', sub: 'last 14 days' },
  { id: 'week', label: 'Week', sub: 'last 12 weeks' },
  { id: 'month', label: 'Month', sub: 'last 12 months' },
]

export function LeadsChart({
  data,
}: {
  data: Record<ProfileViewsRange, InsightPoint[]>
}) {
  const [range, setRange] = useState<ProfileViewsRange>('month')
  const series = data[range]
  const meta = RANGE_OPTIONS.find((r) => r.id === range)!

  const { total, trendPct, isUp } = useMemo(() => {
    // Period-over-period: split the series in half and compare sums.
    const half = Math.floor(series.length / 2)
    const recent = series.slice(half).reduce((s, p) => s + p.value, 0)
    const prior = series.slice(0, half).reduce((s, p) => s + p.value, 0)
    const total = recent + prior
    const trendPct =
      prior === 0 ? 0 : Math.round(((recent - prior) / prior) * 100)
    return { total, trendPct, isUp: trendPct >= 0 }
  }, [series])

  const Icon = isUp ? TrendingUp : TrendingDown

  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] w-full h-full flex flex-col">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500">
            Profile views
          </p>
          <p className="text-3xl lg:text-[32px] font-semibold text-gray-900 tabular-nums tracking-tight leading-none mt-2">
            {total.toLocaleString('en-GB')}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md',
                isUp
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-rose-50 text-rose-700',
              )}
            >
              <Icon className="w-3 h-3" />
              {isUp ? '+' : ''}
              {trendPct}%
            </span>
            <span className="text-[11px] text-gray-500 font-medium">{meta.sub}</span>
          </div>
        </div>

        <div className="inline-flex bg-gray-100 rounded-lg p-0.5 shrink-0">
          {RANGE_OPTIONS.map((o) => (
            <button data-opus-button="control"
              key={o.id}
              type="button"
              onClick={() => setRange(o.id)}
              className={cn(
                'text-xs font-semibold px-3 py-1.5 rounded-md transition-colors',
                range === o.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900',
              )}
              aria-pressed={range === o.id}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#C9A0DC" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#C9A0DC" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 500 }}
              padding={{ left: 10, right: 10 }}
              dy={10}
              interval="preserveStartEnd"
            />
            <Tooltip
              contentStyle={{
                borderRadius: '12px',
                border: 'none',
                boxShadow:
                  '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#C9A0DC"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorLeads)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
