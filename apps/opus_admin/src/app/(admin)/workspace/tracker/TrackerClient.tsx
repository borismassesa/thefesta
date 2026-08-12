'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  Inbox,
  Link2,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  SELECTABLE_STATUSES,
  TRACKER_STATUS_LABELS,
  reviewStatusLabel,
  type TrackerStatus,
} from '@/lib/tracker/status'
import { stalledItems, type TrackerItem } from '@/lib/tracker/carryover'
import type { WeeklyAggregate } from '@/lib/tracker/weekly'
import type {
  TrackerEntry,
  TrackingUnit,
  WeeklySummary,
} from '@/lib/tracker/queries'
import type { ActionResult, EntryPatch, ItemInput, WeeklyPatch } from './actions'
import { WS } from '../_components/ui'


const STATUS_TONE: Record<TrackerStatus, string> = {
  not_started: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-50 text-blue-700',
  done: 'bg-emerald-50 text-emerald-700',
  blocked: 'bg-rose-50 text-rose-700',
  carried_over: 'bg-amber-50 text-amber-700',
  missed: 'bg-rose-100 text-rose-800',
  not_working_day: 'bg-gray-50 text-gray-500',
  waived: 'bg-gray-50 text-gray-500',
}

const SUPPRESSION_LABEL: Record<string, string> = {
  approved_leave: 'Approved leave',
  public_holiday: 'Public holiday',
  rest_day: 'Rest day',
  not_employed: 'Not employed',
  waived: 'Waived',
}

type Actions = {
  saveEntry: (id: string, patch: EntryPatch) => Promise<ActionResult>
  addItem: (id: string, input: ItemInput) => Promise<ActionResult<{ id: string }>>
  setItemStatus: (itemId: string, status: TrackerStatus) => Promise<ActionResult>
  removeItem: (itemId: string) => Promise<ActionResult>
  submitEntry: (id: string) => Promise<ActionResult<{ status: string }>>
  reviewEntry: (
    id: string,
    action: 'start_review' | 'return' | 'accept' | 'waive' | 'reopen',
    note?: string,
  ) => Promise<ActionResult>
  saveWeeklySummary: (id: string, patch: WeeklyPatch) => Promise<ActionResult>
  submitWeeklySummary: (id: string) => Promise<ActionResult>
  addTrackerComment: (id: string, body: string, options?: { internal?: boolean }) => Promise<ActionResult>
}

function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export default function TrackerClient({
  today,
  weekStart,
  units,
  entries,
  itemsByEntry,
  weekAggregate,
  weeklySummaries,
  reviewQueue,
  isAdmin,
  actions,
}: {
  today: string
  weekStart: string
  units: TrackingUnit[]
  entries: TrackerEntry[]
  itemsByEntry: Record<string, TrackerItem[]>
  weekAggregate: WeeklyAggregate
  weeklySummaries: WeeklySummary[]
  reviewQueue: TrackerEntry[]
  isAdmin: boolean
  actions: Actions
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [tab, setTab] = useState<'today' | 'week' | 'review' | 'queue'>('today')
  const [activeUnit, setActiveUnit] = useState(units[0]?.id ?? '')

  const unitEntries = useMemo(
    () => entries.filter((e) => !activeUnit || e.unitId === activeUnit),
    [entries, activeUnit],
  )
  const todayEntry = unitEntries.find((e) => e.entryDate === today) ?? null
  const weekEntries = unitEntries.filter((e) => e.entryDate >= weekStart)

  if (units.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
        <CalendarDays className="mx-auto h-8 w-8 text-gray-300" strokeWidth={1.5} />
        <p className="mt-3 text-sm font-medium text-gray-900">Managing Directors only</p>
        <p className="mt-1.5 text-sm text-gray-500">
          Daily tracker is for Managing Directors. It follows your brand, your department, and the
          tasks assigned to you and your people. Ask People Ops if you should be listed as an MD on
          a brand engine.
        </p>
      </div>
    )
  }

  const run = (fn: () => Promise<ActionResult>) => {
    setMessage(null)
    startTransition(async () => {
      const result = await fn()
      if (result.ok) router.refresh()
      else setMessage(result.error)
    })
  }

  return (
    <div className="space-y-5">
      {/* ---- Unit picker. Brands, departments and people all read the same. ---- */}
      {units.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {units.map((unit) => (
            <button data-opus-button="primary" data-opus-button-size="medium"
              key={unit.id}
              type="button"
              onClick={() => setActiveUnit(unit.id)}
              className={cn(
                'rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors',
                activeUnit === unit.id
                  ? 'bg-[#7E5896] text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )}
            >
              {unit.name}
              <span className="ml-1.5 text-[11px] opacity-60">{unit.kind}</span>
            </button>
          ))}
        </div>
      )}

      <nav className="flex flex-wrap gap-1 border-b border-gray-100 pb-3">
        {[
          { id: 'today' as const, label: 'Today', icon: Clock },
          { id: 'week' as const, label: 'This week', icon: CalendarDays },
          { id: 'review' as const, label: 'Weekly review', icon: Sparkles },
          { id: 'queue' as const, label: 'To review', icon: Inbox, count: reviewQueue.length },
        ].map((t) => {
          const Icon = t.icon
          if (t.id === 'queue' && reviewQueue.length === 0 && !isAdmin) return null
          return (
            <button data-opus-button="control"
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors',
                tab === t.id
                  ? 'bg-[#7E5896] text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {t.label}
              {'count' in t && t.count ? (
                <span className="rounded-full bg-gray-200 px-1.5 text-[11px] font-semibold text-gray-700">
                  {t.count}
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>

      {message && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{message}</p>}

      {tab === 'today' && (
        <TodayPanel
          entry={todayEntry}
          items={todayEntry ? (itemsByEntry[todayEntry.id] ?? []) : []}
          actions={actions}
          run={run}
          pending={pending}
        />
      )}

      {tab === 'week' && (
        <WeekPanel entries={weekEntries} aggregate={weekAggregate} />
      )}

      {tab === 'review' && (
        <WeeklyPanel
          summaries={weeklySummaries.filter((s) => !activeUnit || s.unitId === activeUnit)}
          actions={actions}
          run={run}
          pending={pending}
        />
      )}

      {tab === 'queue' && (
        <ReviewQueuePanel queue={reviewQueue} actions={actions} run={run} pending={pending} />
      )}
    </div>
  )
}

function TodayPanel({
  entry,
  items,
  actions,
  run,
  pending,
}: {
  entry: TrackerEntry | null
  items: TrackerItem[]
  actions: Actions
  run: (fn: () => Promise<ActionResult>) => void
  pending: boolean
}) {
  const [newItem, setNewItem] = useState('')
  const [kind, setKind] = useState<ItemInput['kind']>('planned')
  const [patch, setPatch] = useState<EntryPatch>({})

  if (!entry) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
        No entry has been generated for today yet. The tracker creates them each morning.
      </div>
    )
  }

  // A suppressed day is shown, with its reason, rather than hidden. A visible
  // "public holiday" is information; a gap is ambiguous between a holiday, a
  // missed day and a bug.
  if (entry.suppressionReason) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
        <CalendarDays className="mx-auto h-8 w-8 text-gray-300" strokeWidth={1.5} />
        <p className="mt-3 text-sm font-semibold text-gray-900">
          {SUPPRESSION_LABEL[entry.suppressionReason] ?? 'Not a working day'}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          No tracker entry is needed. This day will not count against you.
        </p>
      </div>
    )
  }

  const editable = entry.reviewStatus === 'pending' || entry.reviewStatus === 'returned'
  const value = (key: keyof EntryPatch, fallback: string) =>
    (patch[key] as string | undefined) ?? fallback

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded-full px-3 py-1 text-[12px] font-semibold',
                STATUS_TONE[entry.status],
              )}
            >
              {TRACKER_STATUS_LABELS[entry.status]}
            </span>
            <span className={WS.pill}>{reviewStatusLabel(entry.reviewStatus)}</span>
            {entry.isLate && (
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                Late
              </span>
            )}
            {entry.loggedMinutes > 0 && (
              <span className={WS.pill}>{formatMinutes(entry.loggedMinutes)} logged</span>
            )}
          </div>
          {entry.deadlineAt && (
            <span className="text-[13px] text-gray-500">
              Due by{' '}
              {new Date(entry.deadlineAt).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Africa/Dar_es_Salaam',
              })}
            </span>
          )}
        </div>

        {entry.unavailableSources.length > 0 && (
          <p className="mt-3 text-[12px] text-gray-400">
            Prefilled from {entry.prefillSources.join(', ').replace(/_/g, ' ')}. Not available yet:{' '}
            {entry.unavailableSources.join(', ').replace(/_/g, ' ')}.
          </p>
        )}
      </section>

      <ItemsSection
        entry={entry}
        items={items}
        editable={editable}
        newItem={newItem}
        setNewItem={setNewItem}
        kind={kind}
        setKind={setKind}
        actions={actions}
        run={run}
        pending={pending}
      />

      <section className="grid gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] lg:grid-cols-2">
        {(
          [
            ['progressSummary', 'Progress summary', entry.progressSummary],
            ['blockers', 'Blockers', entry.blockers],
            ['decisionsRequired', 'Decisions required', entry.decisionsRequired],
            ['nextSteps', 'Next steps', entry.nextSteps],
          ] as const
        ).map(([key, label, current]) => (
          <label key={key} className="block text-[13px] font-semibold text-gray-700">
            {label}
            <textarea
              rows={3}
              disabled={!editable}
              value={value(key, current)}
              onChange={(e) => setPatch((p) => ({ ...p, [key]: e.target.value }))}
              className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal disabled:bg-gray-50"
            />
          </label>
        ))}

        <label className="block text-[13px] font-semibold text-gray-700">
          Expected resolution date
          <input
            type="date"
            disabled={!editable}
            value={patch.expectedResolutionDate ?? entry.expectedResolutionDate ?? ''}
            onChange={(e) =>
              setPatch((p) => ({ ...p, expectedResolutionDate: e.target.value || null }))
            }
            className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal disabled:bg-gray-50"
          />
        </label>
      </section>

      {editable && (
        <div className="flex flex-wrap justify-end gap-2">
          <button data-opus-button="control"
            type="button"
            disabled={pending}
            onClick={() => run(() => actions.saveEntry(entry.id, patch))}
            className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Save
          </button>
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const saved = await actions.saveEntry(entry.id, patch)
                if (!saved.ok) return saved
                return actions.submitEntry(entry.id)
              })
            }
            className="inline-flex items-center gap-2 rounded-xl bg-[#7E5896] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#6c4884] disabled:opacity-50"
          >
            <Send className="h-4 w-4" strokeWidth={2} />
            Submit
          </button>
        </div>
      )}
    </div>
  )
}

const ITEM_GROUPS: { kind: ItemInput['kind']; label: string }[] = [
  { kind: 'planned', label: 'Planned priorities' },
  { kind: 'completed', label: 'Work completed' },
  { kind: 'blocker', label: 'Blockers' },
  { kind: 'decision', label: 'Decisions required' },
  { kind: 'next_step', label: 'Next steps' },
]

function ItemsSection({
  entry,
  items,
  editable,
  newItem,
  setNewItem,
  kind,
  setKind,
  actions,
  run,
  pending,
}: {
  entry: TrackerEntry
  items: TrackerItem[]
  editable: boolean
  newItem: string
  setNewItem: (v: string) => void
  kind: ItemInput['kind']
  setKind: (k: ItemInput['kind']) => void
  actions: Actions
  run: (fn: () => Promise<ActionResult>) => void
  pending: boolean
}) {
  const stalled = stalledItems(items)

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">
        Priorities and work
      </h2>
      <p className="mt-1 text-[13px] text-gray-500">
        Unfinished items carry to the next working day and keep a link back to the day they were
        raised.
      </p>

      {stalled.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          {stalled.length === 1
            ? `"${stalled[0].title}" has carried ${stalled[0].carryCount} times. It probably needs help rather than another day.`
            : `${stalled.length} items have carried three or more times.`}
        </p>
      )}

      <div className="mt-4 space-y-5">
        {ITEM_GROUPS.map((group) => {
          const groupItems = items.filter((i) => i.kind === group.kind)
          if (groupItems.length === 0) return null
          return (
            <div key={group.kind}>
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">
                {group.label}
              </h3>
              <ul className="mt-2 space-y-1.5">
                {groupItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 px-4 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-900">{item.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-gray-500">
                        {item.detail && <span>{item.detail}</span>}
                        {item.carryCount > 0 && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                            Carried {item.carryCount}
                            {item.carryCount === 1 ? ' time' : ' times'}
                          </span>
                        )}
                        {item.source !== 'manual' && item.source !== 'carry_over' && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600">
                            Prefilled
                          </span>
                        )}
                        {(item.linkedTaskId || item.linkedProjectId || item.linkedGoalId) && (
                          <span className="inline-flex items-center gap-1 text-gray-400">
                            <Link2 className="h-3 w-3" strokeWidth={2} />
                            linked
                          </span>
                        )}
                      </span>
                    </span>

                    <span className="flex items-center gap-1.5">
                      {editable && SELECTABLE_STATUSES.includes(item.status) ? (
                        <select
                          value={item.status}
                          disabled={pending}
                          onChange={(e) =>
                            run(() =>
                              actions.setItemStatus(item.id, e.target.value as TrackerStatus),
                            )
                          }
                          className="rounded-full border border-gray-200 px-2.5 py-1 text-[12px] font-semibold"
                        >
                          {SELECTABLE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {TRACKER_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                            STATUS_TONE[item.status],
                          )}
                        >
                          {TRACKER_STATUS_LABELS[item.status]}
                        </span>
                      )}
                      {editable && !item.carriedFromItemId && (
                        <button data-opus-button="control"
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => actions.removeItem(item.id))}
                          className="text-gray-400 hover:text-rose-600 disabled:opacity-50"
                          aria-label={`Remove ${item.title}`}
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}

        {items.length === 0 && (
          <p className="text-sm text-gray-400">Nothing recorded yet for today.</p>
        )}
      </div>

      {editable && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ItemInput['kind'])}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            {ITEM_GROUPS.map((g) => (
              <option key={g.kind} value={g.kind}>
                {g.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="What is it?"
            className="min-w-55 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="button"
            disabled={pending || newItem.trim().length === 0}
            onClick={() =>
              run(async () => {
                const result = await actions.addItem(entry.id, { kind, title: newItem })
                if (result.ok) setNewItem('')
                return result
              })
            }
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#7E5896] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#6c4884] disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add
          </button>
        </div>
      )}
    </section>
  )
}

function WeekPanel({
  entries,
  aggregate,
}: {
  entries: TrackerEntry[]
  aggregate: WeeklyAggregate
}) {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Days owed', String(aggregate.workingDays)],
          ['Submitted', `${aggregate.entriesSubmitted} (${aggregate.completionPercent}%)`],
          ['Missed', String(aggregate.entriesMissed)],
          ['Carried over', String(aggregate.entriesCarriedOver)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
          >
            <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">
              {label}
            </p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight text-gray-900">{value}</p>
          </div>
        ))}
      </section>
      <p className="text-[13px] text-gray-500">
        Days owed excludes public holidays, approved leave and rest days, so a week with a holiday
        does not read as a week you skipped.
      </p>

      <section className="overflow-x-auto rounded-2xl border border-gray-100 bg-white p-5">
        <table className="opus-table w-full min-w-140 text-left text-sm">
          <thead className="text-[12px] uppercase tracking-wide text-gray-400">
            <tr>
              <th className="pb-2 font-semibold">Day</th>
              <th className="pb-2 font-semibold">Status</th>
              <th className="pb-2 font-semibold">Review</th>
              <th className="pb-2 font-semibold">Logged</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="py-2.5 font-medium text-gray-900">{formatDay(e.entryDate)}</td>
                <td className="py-2.5">
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                      STATUS_TONE[e.status],
                    )}
                  >
                    {e.suppressionReason
                      ? (SUPPRESSION_LABEL[e.suppressionReason] ?? TRACKER_STATUS_LABELS[e.status])
                      : TRACKER_STATUS_LABELS[e.status]}
                  </span>
                </td>
                <td className="py-2.5 text-gray-600">
                  {e.suppressionReason ? 'Not required' : reviewStatusLabel(e.reviewStatus)}
                </td>
                <td className="py-2.5 text-gray-600">
                  {e.loggedMinutes > 0 ? formatMinutes(e.loggedMinutes) : 'None'}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-gray-400">
                  No entries this week yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function WeeklyPanel({
  summaries,
  actions,
  run,
  pending,
}: {
  summaries: WeeklySummary[]
  actions: Actions
  run: (fn: () => Promise<ActionResult>) => void
  pending: boolean
}) {
  const [patch, setPatch] = useState<WeeklyPatch>({})
  const current = summaries[0]

  if (!current) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
        No weekly review yet. One is created for each week that has entries.
      </div>
    )
  }

  const editable = current.status === 'draft' || current.status === 'returned'
  const value = (key: keyof WeeklyPatch, fallback: string) =>
    (patch[key] as string | undefined) ?? fallback

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {formatDay(current.weekStart)} to {formatDay(current.weekEnd)}
            </h2>
            <p className="mt-0.5 text-[13px] text-gray-500">{current.unitName}</p>
          </div>
          <span className={WS.pill}>{current.status}</span>
        </div>

        {current.aggregate && (
          <dl className="mt-4 grid gap-3 sm:grid-cols-4">
            {[
              ['Days owed', current.aggregate.workingDays],
              ['Submitted', current.aggregate.entriesSubmitted],
              ['Missed', current.aggregate.entriesMissed],
              ['Blockers open', current.aggregate.blockersOpen],
            ].map(([label, v]) => (
              <div key={String(label)}>
                <dt className="text-[12px] uppercase tracking-wide text-gray-400">{label}</dt>
                <dd className="text-lg font-semibold text-gray-900">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="grid gap-4 rounded-2xl border border-gray-100 bg-white p-5 lg:grid-cols-2">
        {(
          [
            ['wins', 'Wins', current.wins],
            ['missedCommitments', 'Missed commitments', current.missedCommitments],
            ['carriedForward', 'Carried forward', current.carriedForward],
            ['keyBlockers', 'Key blockers', current.keyBlockers],
            ['risks', 'Risks', current.risks],
            ['decisionsRequired', 'Decisions required', current.decisionsRequired],
            ['nextWeekPriorities', 'Next week priorities', current.nextWeekPriorities],
          ] as const
        ).map(([key, label, fallback]) => (
          <label key={key} className="block text-[13px] font-semibold text-gray-700">
            {label}
            <textarea
              rows={3}
              disabled={!editable}
              value={value(key, fallback)}
              onChange={(e) => setPatch((p) => ({ ...p, [key]: e.target.value }))}
              className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal disabled:bg-gray-50"
            />
          </label>
        ))}
      </section>

      {current.kpiMovement.length > 0 && (
        <section className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">
            KPI movement
          </h3>
          <ul className="mt-3 space-y-2">
            {current.kpiMovement.map((kpi) => (
              <li key={kpi.name} className="flex items-center justify-between text-sm">
                <span className="text-gray-900">{kpi.name}</span>
                <span className="flex items-center gap-2 text-gray-600">
                  {kpi.previous ?? '—'}
                  <ArrowRight className="h-3.5 w-3.5 text-gray-400" strokeWidth={2} />
                  <span className="font-semibold text-gray-900">{kpi.current ?? '—'}</span>
                  {kpi.target !== null && (
                    <span className="text-[12px] text-gray-400">target {kpi.target}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(current.managerComment || current.executiveComment) && (
        <section className="space-y-3 rounded-2xl border border-gray-100 bg-white p-5">
          {current.managerComment && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">
                Manager
              </p>
              <p className="mt-1 text-sm text-gray-700">{current.managerComment}</p>
            </div>
          )}
          {current.executiveComment && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">
                Executive
              </p>
              <p className="mt-1 text-sm text-gray-700">{current.executiveComment}</p>
            </div>
          )}
        </section>
      )}

      {editable && (
        <div className="flex flex-wrap justify-end gap-2">
          <button data-opus-button="control"
            type="button"
            disabled={pending}
            onClick={() => run(() => actions.saveWeeklySummary(current.id, patch))}
            className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Save
          </button>
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const saved = await actions.saveWeeklySummary(current.id, patch)
                if (!saved.ok) return saved
                return actions.submitWeeklySummary(current.id)
              })
            }
            className="inline-flex items-center gap-2 rounded-xl bg-[#7E5896] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#6c4884] disabled:opacity-50"
          >
            <Send className="h-4 w-4" strokeWidth={2} />
            Submit review
          </button>
        </div>
      )}
    </div>
  )
}

function ReviewQueuePanel({
  queue,
  actions,
  run,
  pending,
}: {
  queue: TrackerEntry[]
  actions: Actions
  run: (fn: () => Promise<ActionResult>) => void
  pending: boolean
}) {
  const [notes, setNotes] = useState<Record<string, string>>({})

  if (queue.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
        Nothing is waiting on you.
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {queue.map((entry) => (
        <li
          key={entry.id}
          className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">{entry.unitName}</p>
              <p className="mt-0.5 text-[13px] text-gray-500">
                {formatDay(entry.entryDate)} · {reviewStatusLabel(entry.reviewStatus)}
                {entry.isLate && ' · late'}
              </p>
            </div>
            <span
              className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', STATUS_TONE[entry.status])}
            >
              {TRACKER_STATUS_LABELS[entry.status]}
            </span>
          </div>

          {entry.progressSummary && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{entry.progressSummary}</p>
          )}
          {entry.blockers && (
            <p className="mt-2 flex items-start gap-2 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
              {entry.blockers}
            </p>
          )}

          <input
            type="text"
            value={notes[entry.id] ?? ''}
            onChange={(e) => setNotes((n) => ({ ...n, [entry.id]: e.target.value }))}
            placeholder="Why are you returning it? The author sees this."
            className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button data-opus-button="warning" data-opus-button-size="medium"
              type="button"
              disabled={pending}
              onClick={() => run(() => actions.reviewEntry(entry.id, 'return', notes[entry.id]))}
              className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              Return
            </button>
            <button data-opus-button="control"
              type="button"
              disabled={pending}
              onClick={() => run(() => actions.reviewEntry(entry.id, 'accept', notes[entry.id]))}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#7E5896] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#6c4884] disabled:opacity-50"
            >
              <Check className="h-4 w-4" strokeWidth={2} />
              Accept
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
