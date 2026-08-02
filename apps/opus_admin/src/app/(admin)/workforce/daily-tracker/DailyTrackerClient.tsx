'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Download,
  Loader2,
  Target,
  Undo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSetPageHeading } from '@/components/PageHeading'
import {
  assignActingMd,
  assignEngineMds,
  markEngineReviewed,
  saveEntry,
  saveWeekReview,
  setEngineWorksSaturday,
  unmarkEngineReviewed,
} from './actions'
import { TRACKER_DAY_LABELS, addDays, formatDayDate, formatWeekLabel, getWeekDates } from './_lib/week'

const STATUS_VALUES = ['Planned', 'In Progress', 'Done', 'Carried Over', 'Blocked'] as const
type TrackerStatus = (typeof STATUS_VALUES)[number]

// Brand pill palette (matches the rest of the workforce module — schedule,
// timesheets, recruitment all use these same two hex pairs: #F0DFF6 / #5B2D8E).
const STATUS_TONE: Record<TrackerStatus, string> = {
  Planned: 'bg-gray-100 text-gray-500',
  'In Progress': 'bg-amber-50 text-amber-700',
  Done: 'bg-[#9FE870]/30 text-gray-900',
  'Carried Over': 'bg-[#F0DFF6] text-[#5B2D8E]',
  Blocked: 'bg-rose-100 text-rose-700',
}

// Solid-fill versions for the small matrix dots, where a pastel pill would
// be too faint to scan at a glance.
const STATUS_DOT: Record<TrackerStatus, string> = {
  Planned: 'bg-gray-300',
  'In Progress': 'bg-amber-400',
  Done: 'bg-[#9FE870]',
  'Carried Over': 'bg-[#5B2D8E]',
  Blocked: 'bg-rose-500',
}
const NO_ENTRY_DOT = 'bg-gray-200'
const NOT_APPLICABLE_DOT = 'bg-gray-100'
const MISSED_TONE = 'bg-white ring-2 ring-rose-500'

export type TrackerEngine = {
  id: string
  slug: string
  name: string
  mdIds: string[]
  mdNames: string[]
  actingMdId: string | null
  actingMdName: string | null
  worksSaturday: boolean
  canWrite: boolean
}

export type TrackerEntry = {
  id: string
  engineId: string
  entryDate: string
  topPriority: string
  otherTasks: string
  status: TrackerStatus | null
  blockers: string
  endOfDayNote: string
  updatedByName: string | null
}

export type TrackerReview = {
  engineId: string
  wins: string
  carriedToNextWeek: string
  ceoComment: string
  reviewedByName: string | null
  reviewedAt: string | null
}

export type TrackerTrendPoint = {
  engineId: string
  date: string
  status: TrackerStatus | null
}

export type TrackerEmployeeOption = { id: string; name: string }

type EntryDraft = {
  topPriority: string
  otherTasks: string
  status: TrackerStatus | null
  blockers: string
  endOfDayNote: string
}

type ReviewDraft = {
  wins: string
  carriedToNextWeek: string
  ceoComment: string
}

function entryKey(engineId: string, date: string) {
  return `${engineId}__${date}`
}

function emptyEntry(): EntryDraft {
  return { topPriority: '', otherTasks: '', status: null, blockers: '', endOfDayNote: '' }
}

function emptyReview(): ReviewDraft {
  return { wins: '', carriedToNextWeek: '', ceoComment: '' }
}

// Dot styling for the matrix + collapsed day summaries. `missed` days (in
// the past, still empty) get a hollow rose ring instead of a solid fill so
// they read distinctly from an explicit "Blocked" status, which is also
// rose but solid.
//
// `committed` (has this exact row actually been saved, not just carry-forward
// -seeded into the draft) gates the missed/filled checks — a carry-forward
// seed pre-fills the draft's topPriority for convenience, and checking the
// draft's text alone would then treat an untouched day as "done" even though
// nothing was ever saved, hiding a genuinely missed day.
function dotToneFor(draft: EntryDraft, date: string, today: string, committed: boolean): { tone: string; missed: boolean } {
  if (date < today && !committed) return { tone: MISSED_TONE, missed: true }
  if (draft.status) return { tone: STATUS_DOT[draft.status], missed: false }
  if (committed) return { tone: 'bg-gray-400', missed: false }
  return { tone: NO_ENTRY_DOT, missed: false }
}

const DOT_LEGEND: Array<{ label: string; tone: string }> = [
  { label: 'Not started', tone: NO_ENTRY_DOT },
  { label: 'In progress', tone: STATUS_DOT['In Progress'] },
  { label: 'Done', tone: STATUS_DOT.Done },
  { label: 'Carried over', tone: STATUS_DOT['Carried Over'] },
  { label: 'Blocked', tone: STATUS_DOT.Blocked },
  { label: 'Missed (past, empty)', tone: MISSED_TONE },
]

// Matches the Bar `fill` colors below. Recharts' default Tooltip colors each
// item's TEXT using the series' fill — fine for a solid green/purple, but
// "Missed" is a deliberately pale rose-200 fill (meant as a small dot/segment
// backdrop, not body text) so its label rendered almost invisible on white.
// A custom tooltip keeps text a consistent readable gray and uses the color
// only for a small swatch dot instead.
const TREND_SERIES_COLOR: Record<string, string> = {
  Done: '#9FE870',
  'In Progress': '#fbbf24',
  'Carried Over': '#5B2D8E',
  Planned: '#d1d5db',
  Blocked: '#f43f5e',
  Missed: '#fecdd3',
}

function TrendTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean
  label?: string
  payload?: Array<{ dataKey?: string | number; value?: string | number }>
}) {
  if (!active || !payload) return null
  // Zero-value series (e.g. "Blocked: 0") just add noise — and padded the
  // box tall enough to visually overflow its own rounded border. Only show
  // what actually happened.
  const nonZero = payload.filter((p) => Number(p.value) > 0)
  if (nonZero.length === 0) return null
  return (
    <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 shadow-lg">
      <div className="mb-1 text-[12px] font-semibold text-gray-900">{label}</div>
      <div className="space-y-1">
        {nonZero.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: TREND_SERIES_COLOR[String(p.dataKey)] ?? '#d1d5db' }}
            />
            {p.dataKey}: <span className="font-medium text-gray-900">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function timeAgo(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default function DailyTrackerClient({
  weekStart,
  weekId,
  today,
  engines,
  entries,
  reviews,
  canReview,
  employees,
  currentEmployeeName,
  priorWeekLastEntries,
  trend,
  trendDays,
}: {
  weekStart: string
  weekId: string
  today: string
  engines: TrackerEngine[]
  entries: TrackerEntry[]
  reviews: TrackerReview[]
  canReview: boolean
  employees: TrackerEmployeeOption[]
  currentEmployeeName: string | null
  priorWeekLastEntries: Record<string, { topPriority: string; status: TrackerStatus | null }>
  trend: TrackerTrendPoint[]
  trendDays: number
}) {
  useSetPageHeading({
    title: 'MD Daily Tracker',
    subtitle: 'Plan the week Monday morning · update status daily · CEO reviews end of day',
  })
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Rows genuinely saved (loaded from the server, or successfully committed
  // this session) — distinct from `drafts`, which also holds carry-forward
  // seeds that were never saved. See dotToneFor's comment for why this
  // matters: the draft's text alone can't tell a real save from a seed.
  const [committedKeys, setCommittedKeys] = useState<Set<string>>(
    () => new Set(entries.map((e) => entryKey(e.engineId, e.entryDate))),
  )
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set())
  const [savedAt, setSavedAt] = useState<Record<string, number>>({})
  const [updatedByOverride, setUpdatedByOverride] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [assigningEngineId, setAssigningEngineId] = useState<string | null>(null)
  const [assignDraft, setAssignDraft] = useState<string[]>([])
  const [assigningActingId, setAssigningActingId] = useState<string | null>(null)

  function openAssignPanel(engine: TrackerEngine) {
    setAssigningEngineId(engine.id)
    setAssignDraft(engine.mdIds)
  }

  const dates = useMemo(() => getWeekDates(weekStart), [weekStart])
  const saturday = dates[5]

  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => (dates.includes(today) ? new Set([today]) : new Set()))

  function toggleDay(date: string, forceOpen?: boolean) {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (forceOpen) next.add(date)
      else if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
    if (forceOpen) {
      requestAnimationFrame(() => {
        document.getElementById(`day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  const initialEntries = useMemo(() => {
    const map = new Map<string, EntryDraft>()
    for (const e of entries) {
      map.set(entryKey(e.engineId, e.entryDate), {
        topPriority: e.topPriority,
        otherTasks: e.otherTasks,
        status: e.status,
        blockers: e.blockers,
        endOfDayNote: e.endOfDayNote,
      })
    }
    return map
  }, [entries])

  // A priority marked "Carried Over" gets re-offered as the seed for the
  // very next working day (within the week from the prior day; on Monday,
  // from last week's Saturday) — so the accountability loop this tool is
  // for doesn't depend on the MD manually retyping it.
  const carriedFrom = useMemo(() => {
    const map = new Map<string, string>()
    for (const engine of engines) {
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i]
        const key = entryKey(engine.id, date)
        if (initialEntries.has(key)) continue
        let prevPriority = ''
        let prevStatus: TrackerStatus | null = null
        let sourceLabel = ''
        if (i === 0) {
          const prior = priorWeekLastEntries[engine.id]
          if (prior) {
            prevPriority = prior.topPriority
            prevStatus = prior.status
            sourceLabel = 'last Saturday'
          }
        } else {
          const prevEntry = initialEntries.get(entryKey(engine.id, dates[i - 1]))
          if (prevEntry) {
            prevPriority = prevEntry.topPriority
            prevStatus = prevEntry.status
            sourceLabel = TRACKER_DAY_LABELS[i - 1]
          }
        }
        if (prevStatus === 'Carried Over' && prevPriority.trim()) {
          map.set(key, sourceLabel)
        }
      }
    }
    return map
  }, [engines, dates, initialEntries, priorWeekLastEntries])

  const [drafts, setDrafts] = useState<Map<string, EntryDraft>>(() => {
    const map = new Map(initialEntries)
    for (const [key] of carriedFrom) {
      if (map.has(key)) continue
      const [engineId, date] = key.split('__')
      const idx = dates.indexOf(date)
      const priority =
        idx === 0
          ? priorWeekLastEntries[engineId]?.topPriority
          : initialEntries.get(entryKey(engineId, dates[idx - 1]))?.topPriority
      map.set(key, { ...emptyEntry(), topPriority: priority ?? '' })
    }
    return map
  })

  const initialReviews = useMemo(() => {
    const map = new Map<string, ReviewDraft>()
    for (const r of reviews) {
      map.set(r.engineId, { wins: r.wins, carriedToNextWeek: r.carriedToNextWeek, ceoComment: r.ceoComment })
    }
    return map
  }, [reviews])

  const [reviewDrafts, setReviewDrafts] = useState<Map<string, ReviewDraft>>(initialReviews)

  function getDraft(engineId: string, date: string): EntryDraft {
    return drafts.get(entryKey(engineId, date)) ?? emptyEntry()
  }

  function isCommitted(engineId: string, date: string): boolean {
    return committedKeys.has(entryKey(engineId, date))
  }

  function getReviewDraft(engineId: string): ReviewDraft {
    return reviewDrafts.get(engineId) ?? emptyReview()
  }

  function getUpdatedByLabel(engineId: string, date: string): string | null {
    const key = entryKey(engineId, date)
    if (updatedByOverride[key]) return updatedByOverride[key]
    return entries.find((e) => e.engineId === engineId && e.entryDate === date)?.updatedByName ?? null
  }

  function updateDraft(engineId: string, date: string, patch: Partial<EntryDraft>) {
    const key = entryKey(engineId, date)
    setDrafts((prev) => {
      const next = new Map(prev)
      next.set(key, { ...(next.get(key) ?? emptyEntry()), ...patch })
      return next
    })
    // Editing again means the on-screen "Saved" checkmark is stale until the
    // next blur/change commits it — clear it so the row honestly shows
    // "unsaved" rather than a lingering, now-incorrect confirmation.
    setSavedAt((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function updateReviewDraft(engineId: string, patch: Partial<ReviewDraft>) {
    setReviewDrafts((prev) => {
      const next = new Map(prev)
      next.set(engineId, { ...(next.get(engineId) ?? emptyReview()), ...patch })
      return next
    })
  }

  function goToWeek(newWeekStart: string) {
    router.push(`/workforce/daily-tracker?week=${newWeekStart}`)
  }

  function commitEntry(engineId: string, date: string) {
    const draft = getDraft(engineId, date)
    const key = entryKey(engineId, date)
    setSavingKeys((prev) => new Set(prev).add(key))
    startTransition(async () => {
      try {
        const res = await saveEntry({
          weekId,
          engineId,
          entryDate: date,
          topPriority: draft.topPriority,
          otherTasks: draft.otherTasks,
          status: draft.status,
          blockers: draft.blockers,
          endOfDayNote: draft.endOfDayNote,
        })
        if (res.ok) {
          setSavedAt((prev) => ({ ...prev, [key]: Date.now() }))
          setUpdatedByOverride((prev) => ({ ...prev, [key]: currentEmployeeName ?? 'You' }))
          setCommittedKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)))
          setErrors((prev) => {
            const next = { ...prev }
            delete next[key]
            return next
          })
        } else {
          setErrors((prev) => ({ ...prev, [key]: res.error }))
        }
      } finally {
        setSavingKeys((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    })
  }

  function commitReview(engineId: string) {
    const draft = getReviewDraft(engineId)
    startTransition(async () => {
      const res = await saveWeekReview({
        weekId,
        engineId,
        wins: draft.wins,
        carriedToNextWeek: draft.carriedToNextWeek,
        ceoComment: canReview ? draft.ceoComment : undefined,
      })
      if (res.ok) {
        setSavedAt((prev) => ({ ...prev, [`review-${engineId}`]: Date.now() }))
      } else {
        setErrors((prev) => ({ ...prev, [`review-${engineId}`]: res.error }))
      }
    })
  }

  function toggleEngineReviewed(engineId: string, reviewed: boolean) {
    startTransition(async () => {
      const res = reviewed ? await unmarkEngineReviewed(weekId, engineId) : await markEngineReviewed(weekId, engineId)
      if (res.ok) router.refresh()
      else setErrors((prev) => ({ ...prev, [`reviewmark-${engineId}`]: res.error }))
    })
  }

  function saveMdAssignment(engineId: string) {
    const ids = assignDraft
    startTransition(async () => {
      const res = await assignEngineMds(engineId, ids)
      if (res.ok) {
        setAssigningEngineId(null)
        router.refresh()
      } else {
        setErrors((prev) => ({ ...prev, [`assign-${engineId}`]: res.error }))
      }
    })
  }

  function toggleAssignDraft(employeeId: string) {
    setAssignDraft((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId],
    )
  }

  function saveActingMd(engineId: string, employeeId: string) {
    startTransition(async () => {
      const res = await assignActingMd(engineId, employeeId || null)
      if (res.ok) {
        setAssigningActingId(null)
        router.refresh()
      } else {
        setErrors((prev) => ({ ...prev, [`acting-${engineId}`]: res.error }))
      }
    })
  }

  function toggleWorksSaturday(engineId: string, value: boolean) {
    startTransition(async () => {
      const res = await setEngineWorksSaturday(engineId, value)
      if (res.ok) router.refresh()
    })
  }

  function engineAppliesToDate(engine: TrackerEngine, date: string): boolean {
    return date !== saturday || engine.worksSaturday
  }

  const totalSlots = dates.reduce(
    (sum, date) => sum + engines.filter((e) => engineAppliesToDate(e, date)).length,
    0,
  )
  const filledSlots = dates.reduce(
    (sum, date) =>
      sum + engines.filter((e) => engineAppliesToDate(e, date) && isCommitted(e.id, date)).length,
    0,
  )
  const progressPct = totalSlots === 0 ? 0 : Math.round((filledSlots / totalSlots) * 100)

  const trendDates = useMemo(
    () => Array.from({ length: trendDays }, (_, i) => addDays(today, -(trendDays - 1 - i))).filter((d) => {
      const weekday = new Date(`${d}T00:00:00Z`).getUTCDay()
      return weekday !== 0 // never show Sundays — the tracker doesn't cover them
    }),
    [today, trendDays],
  )
  const trendByKey = useMemo(() => {
    const map = new Map<string, TrackerStatus | null>()
    for (const t of trend) map.set(entryKey(t.engineId, t.date), t.status)
    return map
  }, [trend])

  // Per-engine status composition over the trend window, for the stacked
  // bar chart below — counts each applicable day exactly once (Saturdays
  // excluded per-engine via worksSaturday; future/today-and-later days
  // aren't counted as "Missed").
  const trendChartData = useMemo(
    () =>
      engines.map((engine) => {
        const counts: Record<string, number> = {
          Done: 0,
          'In Progress': 0,
          'Carried Over': 0,
          Planned: 0,
          Blocked: 0,
          Missed: 0,
        }
        for (const date of trendDates) {
          const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
          if (weekday === 6 && !engine.worksSaturday) continue
          const status = trendByKey.get(entryKey(engine.id, date)) ?? null
          if (status) counts[status] += 1
          else if (date < today) counts.Missed += 1
        }
        return { name: engine.name, ...counts }
      }),
    [engines, trendDates, trendByKey, today],
  )

  // Recharts' ResponsiveContainer logs a "width(-1) height(-1)" warning if it
  // renders before its parent has a measured size — gate on a real,
  // non-zero measured size (mirrors _dashboard/Charts.tsx's ChartFrame).
  const chartFrameRef = useRef<HTMLDivElement>(null)
  const [chartReady, setChartReady] = useState(false)
  useEffect(() => {
    const el = chartFrameRef.current
    if (!el) return
    const check = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) setChartReady(true)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="space-y-6 pb-16">
      {/* Week nav + progress */}
      <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToWeek(addDays(weekStart, -7))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-[220px] text-center">
              <div className="text-[13px] font-semibold text-gray-900">{formatWeekLabel(weekStart)}</div>
              <div className="text-[11px] text-gray-400">Week of {weekStart}</div>
            </div>
            <button
              type="button"
              onClick={() => goToWeek(addDays(weekStart, 7))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => goToWeek(getWeekDates(weekStart)[0])}
              className="ml-2 text-[12px] font-medium text-gray-500 hover:text-gray-800"
            >
              Jump to current week
            </button>
          </div>
          <a
            href={`/api/md-tracker/pdf?week=${weekStart}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-[12px] font-medium text-gray-600 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" /> Download week PDF
          </a>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-[#6B4E8C] transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="shrink-0 text-[11px] font-medium text-gray-400">
            {filledSlots}/{totalSlots} entries updated this week
          </span>
        </div>
      </div>

      {/* Engine cards — MD/acting-MD assignment, Saturday coverage, per-engine review */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {engines.map((engine) => {
          const assigning = assigningEngineId === engine.id
          const assigningActing = assigningActingId === engine.id
          const unassigned = engine.mdNames.length === 0
          const review = reviews.find((r) => r.engineId === engine.id)
          return (
            <div
              key={engine.id}
              className={cn(
                'rounded-2xl border p-4',
                unassigned ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {unassigned && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
                  <div className="text-[13px] font-semibold text-gray-900">{engine.name}</div>
                </div>
                {canReview && !assigning && !unassigned && (
                  <button
                    type="button"
                    onClick={() => openAssignPanel(engine)}
                    className="text-[11px] font-medium text-gray-400 hover:text-gray-700"
                  >
                    Reassign
                  </button>
                )}
              </div>

              {assigning ? (
                <div className="mt-2 space-y-2">
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2">
                    {employees.map((e) => (
                      <label key={e.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-[12px] text-gray-700 hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={assignDraft.includes(e.id)}
                          onChange={() => toggleAssignDraft(e.id)}
                          className="h-3.5 w-3.5 rounded border-gray-300"
                        />
                        {e.name}
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => saveMdAssignment(engine.id)}
                      className="rounded-lg bg-[#9FE870] px-2.5 py-1 text-[11px] font-semibold text-gray-900 hover:bg-[#8fd862] disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssigningEngineId(null)}
                      className="text-[11px] font-medium text-gray-500 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : unassigned ? (
                <>
                  <div className="mt-1 text-[12px] font-medium text-amber-800">No MD assigned</div>
                  {canReview && (
                    <button
                      type="button"
                      onClick={() => openAssignPanel(engine)}
                      className="mt-2 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      Assign MD
                    </button>
                  )}
                </>
              ) : (
                <div className="mt-1 text-[12px] text-gray-500">MD: {engine.mdNames.join(', ')}</div>
              )}

              {errors[`assign-${engine.id}`] && (
                <div className="mt-1 text-[11px] text-rose-600">{errors[`assign-${engine.id}`]}</div>
              )}

              {/* Acting MD — a single temporary stand-in, separate from the list above */}
              <div className="mt-2 border-t border-gray-100 pt-2">
                {assigningActing ? (
                  <div className="flex items-center gap-1.5">
                    <select
                      autoFocus
                      defaultValue={engine.actingMdId ?? ''}
                      onChange={(e) => saveActingMd(engine.id, e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] text-gray-900"
                    >
                      <option value="">None</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setAssigningActingId(null)}
                      className="text-[11px] font-medium text-gray-400 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>Acting MD: {engine.actingMdName ?? 'none'}</span>
                    {canReview && (
                      <button
                        type="button"
                        onClick={() => setAssigningActingId(engine.id)}
                        className="font-medium text-gray-400 hover:text-gray-700"
                      >
                        Set
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Saturday coverage toggle */}
              {canReview && (
                <label className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2 text-[11px] text-gray-600">
                  <input
                    type="checkbox"
                    checked={engine.worksSaturday}
                    onChange={(e) => toggleWorksSaturday(engine.id, e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  Works Saturdays
                </label>
              )}

              {/* Per-engine review */}
              <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
                {review?.reviewedByName ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#9FE870]/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-900">
                    <ClipboardCheck className="h-3 w-3" /> Reviewed by {review.reviewedByName}
                  </span>
                ) : (
                  <span className="text-[11px] text-gray-400">Not yet reviewed</span>
                )}
                {canReview &&
                  (review?.reviewedByName ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => toggleEngineReviewed(engine.id, true)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-gray-700 disabled:opacity-50"
                    >
                      <Undo2 className="h-3 w-3" /> Undo
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => toggleEngineReviewed(engine.id, false)}
                      className="text-[11px] font-medium text-[#5B2D8E] hover:text-[#3f1e63] disabled:opacity-50"
                    >
                      Mark reviewed
                    </button>
                  ))}
              </div>

              {!engine.canWrite && !assigning && (
                <div className="mt-1 text-[11px] font-medium text-gray-400">Read only</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Recent trend — status composition per engine, independent of week paging */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <Calendar className="h-3.5 w-3.5" /> Last {trendDays} days
        </div>
        <div ref={chartFrameRef} className="h-[170px] w-full">
          {chartReady && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendChartData} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={80}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip cursor={{ fill: '#f9fafb' }} content={<TrendTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                <Bar dataKey="Done" stackId="a" fill="#9FE870" />
                <Bar dataKey="In Progress" stackId="a" fill="#fbbf24" />
                <Bar dataKey="Carried Over" stackId="a" fill="#5B2D8E" />
                <Bar dataKey="Planned" stackId="a" fill="#d1d5db" />
                <Bar dataKey="Blocked" stackId="a" fill="#f43f5e" />
                <Bar dataKey="Missed" stackId="a" fill="#fecdd3" stroke="#f43f5e" strokeWidth={1} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Week-at-a-glance matrix — click a day to jump + expand it */}
      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-28 bg-white pb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Engine
              </th>
              {dates.map((date, i) => {
                const missedCount = engines.filter(
                  (e) => engineAppliesToDate(e, date) && date < today && !isCommitted(e.id, date),
                ).length
                return (
                  <th key={date} className="pb-2 text-center">
                    <button
                      type="button"
                      onClick={() => toggleDay(date, true)}
                      className={cn(
                        'w-full rounded-lg px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
                        date === today
                          ? 'bg-[#F0DFF6] text-[#5B2D8E]'
                          : missedCount > 0
                            ? 'bg-rose-50 text-rose-700'
                            : 'text-gray-500 hover:bg-gray-50',
                      )}
                    >
                      {TRACKER_DAY_LABELS[i].slice(0, 3)}
                      <span className="block font-normal normal-case text-gray-400">{formatDayDate(date)}</span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {engines.map((engine) => (
              <tr key={engine.id}>
                <td className="sticky left-0 z-10 bg-white py-1.5 text-[12px] font-medium text-gray-700">{engine.name}</td>
                {dates.map((date) => {
                  if (!engineAppliesToDate(engine, date)) {
                    return (
                      <td key={date} className="py-1.5 text-center">
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full"
                          title="Not a working day for this engine"
                        >
                          <span className={cn('h-2.5 w-2.5 rounded-full', NOT_APPLICABLE_DOT)} />
                        </span>
                      </td>
                    )
                  }
                  const draft = getDraft(engine.id, date)
                  const { tone, missed } = dotToneFor(draft, date, today, isCommitted(engine.id, date))
                  return (
                    <td key={date} className="py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => toggleDay(date, true)}
                        aria-label={`${engine.name} · ${date} · ${missed ? 'Missed' : draft.status || 'Not started'}`}
                        title={missed ? 'Missed — no entry logged' : (draft.status ?? 'Not started')}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-gray-50"
                      >
                        <span className={cn('h-2.5 w-2.5 rounded-full', tone)} />
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-gray-100 pt-3">
          {DOT_LEGEND.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className={cn('h-2.5 w-2.5 rounded-full', item.tone)} />
              {item.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className={cn('h-2.5 w-2.5 rounded-full', NOT_APPLICABLE_DOT)} />
            Not a working day
          </span>
        </div>
      </div>

      {/* Daily entries — today expanded by default, other days collapse to a summary row */}
      {dates.map((date, dayIdx) => {
        const expanded = expandedDays.has(date)
        const isToday = date === today
        const dayEngines = engines.filter((e) => engineAppliesToDate(e, date))
        const missedEngines = dayEngines.filter((e) => date < today && !isCommitted(e.id, date))
        return (
          <div
            key={date}
            id={`day-${date}`}
            className={cn(
              'rounded-2xl border bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]',
              isToday ? 'border-[#C9A0DC]' : missedEngines.length > 0 ? 'border-rose-200' : 'border-gray-100',
            )}
          >
            <button
              type="button"
              onClick={() => toggleDay(date)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-[12px] font-semibold tracking-wide',
                    isToday ? 'text-[#6B4E8C]' : 'text-gray-900',
                  )}
                >
                  {TRACKER_DAY_LABELS[dayIdx]} <span className="font-normal text-gray-400">· {formatDayDate(date)}</span>
                </span>
                {isToday && (
                  <span className="rounded-full bg-[#9FE870]/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-900">
                    Today
                  </span>
                )}
                {missedEngines.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                    <AlertTriangle className="h-3 w-3" />
                    {missedEngines.length === dayEngines.length ? 'Missed' : `${missedEngines.length} missed`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {!expanded && (
                  <div className="flex items-center gap-2">
                    {dayEngines.map((engine) => {
                      const draft = getDraft(engine.id, date)
                      const { tone } = dotToneFor(draft, date, today, isCommitted(engine.id, date))
                      return (
                        <span key={engine.id} className="hidden items-center gap-1 sm:flex">
                          <span className={cn('h-2 w-2 rounded-full', tone)} />
                          <span className="text-[11px] text-gray-500">{engine.name}</span>
                        </span>
                      )
                    })}
                  </div>
                )}
                <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', expanded && 'rotate-180')} />
              </div>
            </button>
            {expanded && (
              <div className="divide-y divide-gray-100 border-t border-gray-100">
                {dayEngines.map((engine) => {
                  const draft = getDraft(engine.id, date)
                  const key = entryKey(engine.id, date)
                  const readOnly = !engine.canWrite
                  const updatedBy = getUpdatedByLabel(engine.id, date)
                  const seededFrom = carriedFrom.get(key)
                  return (
                    <div key={engine.id} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[110px_1fr_1fr_140px_1fr]">
                      <div className="md:pt-2">
                        <div className="text-[12px] font-semibold text-gray-700">{engine.name}</div>
                        {!readOnly && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] font-medium">
                            {savingKeys.has(key) ? (
                              <span className="flex items-center gap-1 text-gray-400">
                                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                              </span>
                            ) : savedAt[key] ? (
                              <span className="flex items-center gap-1 text-emerald-600">
                                <Check className="h-3 w-3" /> Saved {timeAgo(new Date(savedAt[key]).toISOString(), Date.now())}
                              </span>
                            ) : null}
                          </div>
                        )}
                        {updatedBy && (
                          <div className="mt-0.5 text-[10px] text-gray-400">Last by {updatedBy}</div>
                        )}
                      </div>
                      <div>
                        <label className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                          <Target className="h-3 w-3" /> Top priority
                        </label>
                        {seededFrom && (
                          <div className="mb-1 inline-flex items-center rounded-full bg-[#F0DFF6] px-2 py-0.5 text-[10px] font-medium text-[#5B2D8E]">
                            Carried over from {seededFrom}
                          </div>
                        )}
                        <textarea
                          className="min-h-[60px] w-full rounded-lg border border-gray-200 p-2 text-[13px] font-medium text-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
                          placeholder="Today's top priority"
                          value={draft.topPriority}
                          disabled={readOnly}
                          onChange={(e) => updateDraft(engine.id, date, { topPriority: e.target.value })}
                          onBlur={() => commitEntry(engine.id, date)}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">
                          Other tasks
                        </label>
                        <textarea
                          className="min-h-[60px] w-full rounded-lg border border-gray-200 p-2 text-[13px] text-gray-600 disabled:bg-gray-50 disabled:text-gray-400"
                          placeholder="Other key tasks"
                          value={draft.otherTasks}
                          disabled={readOnly}
                          onChange={(e) => updateDraft(engine.id, date, { otherTasks: e.target.value })}
                          onBlur={() => commitEntry(engine.id, date)}
                        />
                      </div>
                      <div className="md:pt-1">
                        <select
                          className={cn(
                            'w-full rounded-full px-2 py-1 text-[12px] font-medium disabled:cursor-not-allowed',
                            draft.status ? STATUS_TONE[draft.status] : 'bg-gray-50 text-gray-400',
                          )}
                          value={draft.status ?? ''}
                          disabled={readOnly}
                          onChange={(e) => {
                            const value = (e.target.value || null) as TrackerStatus | null
                            updateDraft(engine.id, date, { status: value })
                            commitEntry(engine.id, date)
                          }}
                        >
                          <option value="">Set status</option>
                          {STATUS_VALUES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <textarea
                          className="min-h-[28px] w-full rounded-lg border border-gray-200 p-2 text-[13px] text-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
                          placeholder="Blockers / needs from CEO"
                          value={draft.blockers}
                          disabled={readOnly}
                          onChange={(e) => updateDraft(engine.id, date, { blockers: e.target.value })}
                          onBlur={() => commitEntry(engine.id, date)}
                        />
                        <textarea
                          className="min-h-[28px] w-full rounded-lg border border-gray-200 p-2 text-[13px] text-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
                          placeholder="End-of-day note"
                          value={draft.endOfDayNote}
                          disabled={readOnly}
                          onChange={(e) => updateDraft(engine.id, date, { endOfDayNote: e.target.value })}
                          onBlur={() => commitEntry(engine.id, date)}
                        />
                      </div>
                      {errors[key] && <div className="text-[11px] text-rose-600 md:col-span-5">{errors[key]}</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Week Review — visually distinct end-of-week artifact */}
      <div className="overflow-hidden rounded-2xl border border-[#ECE3F5] bg-[#FAF7FD] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <div className="h-1 bg-[#6B4E8C]" />
        <div className="border-b border-[#ECE3F5] px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#6B4E8C]">
            <ClipboardList className="h-3.5 w-3.5" /> End of week summary
          </div>
        </div>
        <div className="divide-y divide-[#ECE3F5]">
          {engines.map((engine) => {
            const draft = getReviewDraft(engine.id)
            const readOnly = !engine.canWrite && !canReview
            return (
              <div key={engine.id} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[110px_1fr_1fr_1fr]">
                <div className="text-[12px] font-semibold text-gray-700 md:pt-2">{engine.name}</div>
                <textarea
                  className="min-h-[60px] rounded-lg border border-gray-200 bg-white p-2 text-[13px] text-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
                  placeholder="Wins this week"
                  value={draft.wins}
                  disabled={!engine.canWrite}
                  onChange={(e) => updateReviewDraft(engine.id, { wins: e.target.value })}
                  onBlur={() => commitReview(engine.id)}
                />
                <textarea
                  className="min-h-[60px] rounded-lg border border-gray-200 bg-white p-2 text-[13px] text-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
                  placeholder="Carried to next week"
                  value={draft.carriedToNextWeek}
                  disabled={!engine.canWrite}
                  onChange={(e) => updateReviewDraft(engine.id, { carriedToNextWeek: e.target.value })}
                  onBlur={() => commitReview(engine.id)}
                />
                <textarea
                  className="min-h-[60px] rounded-lg border border-gray-200 bg-white p-2 text-[13px] text-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
                  placeholder="CEO comment"
                  value={draft.ceoComment}
                  disabled={!canReview}
                  onChange={(e) => updateReviewDraft(engine.id, { ceoComment: e.target.value })}
                  onBlur={() => commitReview(engine.id)}
                />
                {readOnly && <div className="md:col-span-4 text-[11px] text-gray-400">Read only</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
