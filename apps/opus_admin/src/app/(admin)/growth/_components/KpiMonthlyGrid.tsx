'use client'

import { useMemo, useState, useTransition } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { computePercent, formatUnit } from '../_lib/status'
import type { KpiActual, KpiTarget } from '../_lib/queries'
import { saveKpiActual, updateKpiTarget } from '../actions'

const MONTHS = [
  { key: 1, label: 'Jan' }, { key: 2, label: 'Feb' }, { key: 3, label: 'Mar' },
  { key: 4, label: 'Apr' }, { key: 5, label: 'May' }, { key: 6, label: 'Jun' },
  { key: 7, label: 'Jul' }, { key: 8, label: 'Aug' }, { key: 9, label: 'Sep' },
  { key: 10, label: 'Oct' }, { key: 11, label: 'Nov' }, { key: 12, label: 'Dec' },
] as const

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export default function KpiMonthlyGrid({
  targets,
  actuals,
  initialYear,
  canEdit,
  canEditTargets = false,
}: {
  targets: KpiTarget[]
  actuals: KpiActual[]
  initialYear: number
  canEdit: boolean
  canEditTargets?: boolean
}) {
  const [year, setYear] = useState(initialYear)
  const [isPending, startTransition] = useTransition()
  const [drafts, setDrafts] = useState<Map<string, string>>(new Map())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [targetDrafts, setTargetDrafts] = useState<Map<string, string>>(new Map())
  const [targetErrors, setTargetErrors] = useState<Record<string, string>>({})

  function getTargetValue(target: KpiTarget): string {
    return targetDrafts.has(target.id) ? (targetDrafts.get(target.id) ?? '') : String(target.monthlyTarget)
  }

  function commitTarget(target: KpiTarget) {
    const raw = targetDrafts.get(target.id)
    if (raw === undefined) return
    const value = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(value) || value < 0) {
      setTargetErrors((prev) => ({ ...prev, [target.id]: 'Not a valid number' }))
      return
    }
    startTransition(async () => {
      const res = await updateKpiTarget({ kpiTargetId: target.id, monthlyTarget: value })
      if (!res.ok) {
        setTargetErrors((prev) => ({ ...prev, [target.id]: res.error }))
      } else {
        setTargetErrors((prev) => {
          const next = { ...prev }
          delete next[target.id]
          return next
        })
      }
    })
  }

  const actualByKey = useMemo(() => {
    const map = new Map<string, number | null>()
    for (const a of actuals) map.set(`${a.kpiTargetId}__${a.month}`, a.actual)
    return map
  }, [actuals])

  function cellKey(targetId: string, month: number) {
    return `${targetId}__${monthKey(year, month)}`
  }

  function getValue(targetId: string, month: number): string {
    const key = cellKey(targetId, month)
    if (drafts.has(key)) return drafts.get(key) ?? ''
    const actual = actualByKey.get(key)
    return actual === null || actual === undefined ? '' : String(actual)
  }

  function commit(targetId: string, month: number) {
    const key = cellKey(targetId, month)
    const raw = drafts.get(key)
    if (raw === undefined) return
    const actual = raw.trim() === '' ? null : Number(raw)
    if (raw.trim() !== '' && !Number.isFinite(actual)) {
      setErrors((prev) => ({ ...prev, [key]: 'Not a number' }))
      return
    }
    startTransition(async () => {
      const res = await saveKpiActual({ kpiTargetId: targetId, month: monthKey(year, month), actual })
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [key]: res.error }))
      } else {
        setErrors((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      }
    })
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="text-[12px] font-semibold tracking-wide text-gray-900">MONTHLY TARGET VS ACTUAL</div>
        <div className="flex items-center gap-2">
          <button data-opus-button="control"
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            aria-label="Previous year"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[48px] text-center text-[12px] font-semibold text-gray-900">{year}</span>
          <button data-opus-button="control"
            type="button"
            onClick={() => setYear((y) => y + 1)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            aria-label="Next year"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="opus-table w-full min-w-[900px] text-[12px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="sticky left-0 z-10 w-48 whitespace-nowrap bg-white px-4 py-2 font-medium">KPI</th>
              <th className="sticky left-48 z-10 w-24 bg-white px-3 py-2 font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                Target
              </th>
              {MONTHS.map((m) => (
                <th key={m.key} className="px-2 py-2 font-medium">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => {
              return (
                <tr key={t.id} className="border-b border-gray-50">
                  <td className="sticky left-0 z-10 w-48 whitespace-nowrap bg-white px-4 py-2 font-medium text-gray-800">
                    {t.label}
                  </td>
                  <td className="sticky left-48 z-10 w-24 bg-white px-3 py-2 text-gray-500 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                    {canEditTargets ? (
                      <>
                        <input
                          className="w-20 rounded-md border border-gray-200 px-1.5 py-1 text-[12px] tabular-nums disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                          value={getTargetValue(t)}
                          disabled={isPending}
                          onChange={(e) =>
                            setTargetDrafts((prev) => {
                              const next = new Map(prev)
                              next.set(t.id, e.target.value)
                              return next
                            })
                          }
                          onBlur={() => commitTarget(t)}
                          title={`Unit: ${t.unit}`}
                        />
                        {targetErrors[t.id] && <div className="mt-0.5 text-[10px] text-red-600">{targetErrors[t.id]}</div>}
                      </>
                    ) : (
                      formatUnit(t.monthlyTarget, t.unit)
                    )}
                  </td>
                  {MONTHS.map((m) => {
                    const key = cellKey(t.id, m.key)
                    const value = getValue(t.id, m.key)
                    const pct = computePercent(value === '' ? null : Number(value), t.monthlyTarget)
                    return (
                      <td key={m.key} className="px-1.5 py-1.5">
                        <input
                          className="w-20 rounded-md border border-gray-200 px-1.5 py-1 text-[12px] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                          value={value}
                          disabled={!canEdit || isPending}
                          onChange={(e) =>
                            setDrafts((prev) => {
                              const next = new Map(prev)
                              next.set(key, e.target.value)
                              return next
                            })
                          }
                          onBlur={() => commit(t.id, m.key)}
                          title={pct !== null ? `${(pct * 100).toFixed(0)}% to target` : undefined}
                        />
                        {errors[key] && <div className="mt-0.5 text-[10px] text-red-600">{errors[key]}</div>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
