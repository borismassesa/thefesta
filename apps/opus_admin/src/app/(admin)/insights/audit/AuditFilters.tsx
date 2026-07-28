'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

// Filter row for the audit log table. State lives in URL search params
// so deep links work, the back button restores state, and the server
// component re-renders with the filtered query — no client-side data
// fetching needed.

const SEVERITIES = ['all', 'info', 'warn', 'error', 'critical'] as const
const RANGES = [
  { value: '72h', label: 'Last 72h' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
] as const

const SEVERITY_TONE: Record<(typeof SEVERITIES)[number], string> = {
  all: 'border-gray-200 text-gray-700',
  info: 'border-gray-200 text-gray-700',
  warn: 'border-amber-200 text-amber-700',
  error: 'border-rose-200 text-rose-700',
  critical: 'border-rose-300 text-rose-800',
}

export default function AuditFilters() {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, start] = useTransition()

  const severity = (params.get('severity') ?? 'all') as (typeof SEVERITIES)[number]
  const range = (params.get('range') ?? '7d') as (typeof RANGES)[number]['value']

  function update(patch: { severity?: string; range?: string }) {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === 'all') next.delete(k)
      else next.set(k, v)
    }
    const query = next.toString()
    start(() => {
      router.push(query ? `/insights/audit?${query}` : '/insights/audit')
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-2 pb-3">
      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
        Severity:
      </span>
      <div className="flex flex-wrap gap-1">
        {SEVERITIES.map((s) => {
          const active = severity === s
          return (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => update({ severity: s })}
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors disabled:opacity-50 ${active ? 'bg-gray-900 text-white border-gray-900' : `bg-white hover:bg-gray-50 ${SEVERITY_TONE[s]}`}`}
            >
              {s}
            </button>
          )
        })}
      </div>

      <span className="ml-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">
        Range:
      </span>
      <select
        value={range}
        disabled={pending}
        onChange={(e) => update({ range: e.target.value })}
        className="rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-xs focus:border-gray-400 focus:outline-none disabled:opacity-50"
      >
        {RANGES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  )
}
