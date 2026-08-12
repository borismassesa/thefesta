'use client'

import { useMemo, useState, useTransition } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { computePercent, formatUnit } from '../_lib/status'
import type { KpiActual, KpiTarget } from '../_lib/queries'
import { saveKpiActual, updateKpiTarget } from '../actions'
import { GtCard, GtSectionHeader, GT } from './ui'

const MONTHS = [
  { key: 1, label: 'Jan' },
  { key: 2, label: 'Feb' },
  { key: 3, label: 'Mar' },
  { key: 4, label: 'Apr' },
  { key: 5, label: 'May' },
  { key: 6, label: 'Jun' },
  { key: 7, label: 'Jul' },
  { key: 8, label: 'Aug' },
  { key: 9, label: 'Sep' },
  { key: 10, label: 'Oct' },
  { key: 11, label: 'Nov' },
  { key: 12, label: 'Dec' },
] as const

const INPUT =
  'w-20 rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-[13px] tabular-nums text-gray-900 outline-none transition focus:border-[#C9A0DC] focus:ring-2 focus:ring-[#F0DFF6] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400'

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export default function KpiMonthlyGrid({
  targets,
  actuals,
  initialYear,
  canEdit,
  canEditTargets = false,
  title = 'Monthly Target vs Actual',
}: {
  targets: KpiTarget[]
  actuals: KpiActual[]
  initialYear: number
  canEdit: boolean
  canEditTargets?: boolean
  title?: string
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
    <GtCard>
      <GtSectionHeader
        title={title}
        action={
          <div className="flex items-center gap-2">
            <button
              data-opus-button="control"
              type="button"
              onClick={() => setYear((y) => y - 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-white"
              aria-label="Previous year"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-12 text-center text-[13px] font-semibold text-gray-900">{year}</span>
            <button
              data-opus-button="control"
              type="button"
              onClick={() => setYear((y) => y + 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-white"
              aria-label="Next year"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        }
      />
      <div className={GT.tableShell}>
        <table className={`${GT.table} min-w-225`}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white">KPI</th>
              <th data-numeric="true" className="sticky left-48 z-10 bg-white shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                Target
              </th>
              {MONTHS.map((m) => (
                <th key={m.key} data-numeric="true">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.id}>
                <th scope="row" className="opus-table-cell--leading sticky left-0 z-10 bg-white">{t.label}</th>
                <td
                  data-numeric="true"
                  className="sticky left-48 z-10 bg-white shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
                >
                  {canEditTargets ? (
                    <>
                      <input
                        className={INPUT}
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
                      {targetErrors[t.id] && (
                        <div className="mt-0.5 text-[10px] text-red-600">{targetErrors[t.id]}</div>
                      )}
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
                    <td key={m.key} data-numeric="true">
                      <input
                        className={INPUT}
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
            ))}
          </tbody>
        </table>
      </div>
    </GtCard>
  )
}
