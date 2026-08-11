'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, Mail, Printer, Rows3, Search, Table2, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DESIGN_SLA_HOURS } from '@/lib/cms/design-sla'
import {
  DESIGN_STATUSES,
  DESIGN_STATUS_LABELS,
  type DesignJob,
  type DesignQueueSummary,
  type DesignStatus,
  type JobSla,
  type QueueView,
} from './types'
import { claimDesignJob, startDesignJob } from './actions'

const BASE = '/opus-pass/digital-cards/designer'

const STATUS_TONE: Record<DesignStatus, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  awaiting_info: 'bg-amber-100 text-amber-800',
  in_design: 'bg-[#F0DFF6] text-[#7E5896]',
  in_review: 'bg-blue-100 text-blue-800',
  ready: 'bg-emerald-100 text-emerald-800',
  delivered: 'bg-emerald-600 text-white',
}

// Ring colours by state. The track stays neutral so the coloured arc is the
// thing the eye picks up when scanning a column of these.
const SLA_RING = {
  ok: { arc: '#10B981', text: 'text-emerald-700' },
  due_soon: { arc: '#F59E0B', text: 'text-amber-700' },
  overdue: { arc: '#DC2626', text: 'text-red-700' },
  // Empty track, muted dash — visibly "not measured" rather than blank.
  untracked: { arc: 'transparent', text: 'text-gray-400' },
} as const

/**
 * Time left against the 48h promise, as a ring that fills as the window is
 * used up.
 *
 * A ring carries two things at once that a text chip can't: how much time is
 * left, and how much of the window that represents. "12h left" means something
 * very different on a 48-hour promise than on a week, and the arc says which
 * without the reader doing arithmetic.
 *
 * Renders nothing once the work is submitted — a delivered job has met the
 * promise and shouldn't keep ageing.
 */
function SlaRing({ sla }: { sla: JobSla | null }) {
  if (!sla) return null

  const tone = SLA_RING[sla.tone]
  // r=15 in a 36px box leaves room for the 3px stroke without clipping.
  const radius = 15
  const circumference = 2 * Math.PI * radius

  return (
    <span
      className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center"
      // The untracked label is already a full sentence; appending the window
      // to it contradicts what it says.
      title={
        sla.tone === 'untracked'
          ? sla.label
          : `${sla.label} — ${DESIGN_SLA_HOURS}h from payment approval`
      }
    >
      <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={radius} fill="none" stroke="#E5E7EB" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke={tone.arc}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - sla.elapsedFraction)}
        />
      </svg>
      <span className={cn('absolute text-[9px] font-bold tabular-nums', tone.text)}>
        {sla.short}
      </span>
      {/* The ring is decorative; the state has to reach a screen reader too. */}
      <span className="sr-only">{sla.label}</span>
    </span>
  )
}

/**
 * Package tier pill, keyed on the stable tier id rather than the label so a
 * CMS rename can't silently change a colour. Mirrors the storefront's per-tier
 * palette (lite = slate, classic = lavender, elegant = blush, signature = gold).
 */
const TIER_TONE: Record<string, string> = {
  lite: 'bg-[#E1E8F0] text-[#334155]',
  classic: 'bg-[#ECDDF7] text-[#6b4a80]',
  elegant: 'bg-[#F4E3EC] text-[#8a4d67]',
  signature: 'bg-[#F5E7BF] text-[#7a5c15]',
}

function TierPill({ tier, tierId }: { tier: string | null; tierId: string | null }) {
  if (!tier) return null
  return (
    <span
      className={cn(
        STATUS_CHIP,
        TIER_TONE[tierId ?? ''] ?? 'bg-gray-100 text-gray-600',
      )}
      title={`${tier} package`}
    >
      {tier}
    </span>
  )
}

/** Shared chip shape, so a status never renders as bare coloured text. */
const STATUS_CHIP =
  'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold'

/**
 * The couple has asked for a correction to a card that is already out.
 *
 * Deliberately loud, and deliberately not a status: the card stays 'ready' or
 * 'delivered' because guests are still being served the released version, so
 * without a chip the request would be invisible on a job that looks finished
 * and has dropped off everyone's list.
 */
function ChangeRequestedChip({ at }: { at: string | null }) {
  if (!at) return null
  return (
    <span
      className={cn(STATUS_CHIP, 'gap-1 bg-rose-100 text-rose-800')}
      title={`The couple asked for a change on ${new Date(at).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}. Their words are in the job's history.`}
    >
      <AlertTriangle className="h-3 w-3" />
      Change requested
    </span>
  )
}

export default function DesignQueueClient({
  jobs,
  summary,
  activeStatus,
  view,
  canWrite,
  myEmployeeId,
  initialQuery = '',
}: {
  jobs: DesignJob[]
  summary: DesignQueueSummary
  activeStatus: string
  view: QueueView
  canWrite: boolean
  /** Null when the caller has no employee record, so nothing can be theirs. */
  myEmployeeId: string | null
  /**
   * Seeds the search box from `?q=`, so a link from another surface can land
   * on one order's jobs. Only a seed: typing owns the box afterwards, and the
   * URL is deliberately not rewritten as it changes.
   */
  initialQuery?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const [query, setQuery] = useState(initialQuery)

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const job of jobs) counts.set(job.status, (counts.get(job.status) ?? 0) + 1)
    return counts
  }, [jobs])

  const visible = useMemo(() => {
    const byStatus = activeStatus ? jobs.filter((j) => j.status === activeStatus) : jobs
    const needle = query.trim().toLowerCase()
    if (!needle) return byStatus
    return byStatus.filter((job) =>
      [job.productName, job.coupleName ?? '', job.orderRef]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [jobs, activeStatus, query])

  function run(key: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null)
    setBusyKey(key)
    startTransition(async () => {
      try {
        const result = await fn()
        if (!result.ok) setError(result.error)
        else router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      } finally {
        setBusyKey(null)
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* What the workshop is holding right now. */}
      <div className="grid grid-cols-3 gap-4">
        <Kpi
          label="Cards to design"
          value={String(summary.total)}
          icon={<Mail className="h-4 w-4" />}
          // Only captioned when there is something to act on. "All within the
          // window" is a line that says nothing is wrong, which is noise.
          caption={
            // A change request leads. It is on a card the couple already has,
            // so it is the only one of these where somebody is holding a card
            // they have told us is wrong.
            summary.changeRequestedCount > 0
              ? `${summary.changeRequestedCount} correction${summary.changeRequestedCount === 1 ? '' : 's'} requested`
              : summary.overdueCount > 0
                ? `${summary.overdueCount} past the ${DESIGN_SLA_HOURS}h deadline`
                : summary.dueSoonCount > 0
                  ? `${summary.dueSoonCount} due soon`
                  : undefined
          }
          tone={summary.overdueCount > 0 || summary.changeRequestedCount > 0 ? 'alert' : undefined}
        />
        <Kpi
          label="Digital cards"
          value={summary.digitalCards.toLocaleString('en-US')}
          icon={<Users className="h-4 w-4" />}
          caption="OpusPass tickets to generate"
        />
        <Kpi
          label="Cards to print"
          value={summary.printedCards.toLocaleString('en-US')}
          icon={<Printer className="h-4 w-4" />}
          caption="Physical keepsakes ordered"
        />
      </div>

      {summary.inferredCount > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            {summary.inferredCount} card{summary.inferredCount === 1 ? '' : 's'} predate structured
            add-ons, so their print counts were read from the order&apos;s display text. The raw
            label is shown on those rows — check it before committing a print run.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search card, couple or order ref…"
            aria-label="Search the design queue"
            className="w-full rounded-lg border border-gray-100 bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#C9A0DC]"
          />
        </div>

        <select
          aria-label="Filter by design status"
          value={activeStatus}
          onChange={(e) => router.push(queueHref(e.target.value, view))}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC]"
        >
          <option value="">All statuses ({jobs.length})</option>
          {DESIGN_STATUSES.map((status) => (
            <option key={status} value={status}>
              {DESIGN_STATUS_LABELS[status]} ({statusCounts.get(status) ?? 0})
            </option>
          ))}
        </select>

        {(query || activeStatus) && (
          <button data-opus-button="danger" data-opus-button-size="small"
            type="button"
            onClick={() => {
              setQuery('')
              router.push(queueHref('', view))
            }}
            className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:border-red-400 hover:bg-red-50"
          >
            Clear
          </button>
        )}

        <div className="ml-auto">
          <ViewToggle activeStatus={activeStatus} view={view} />
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-gray-100 bg-white p-12 text-center text-sm text-gray-400">
          {jobs.length === 0
            ? 'No approved orders waiting for design.'
            : 'No cards match this search or filter.'}
        </p>
      ) : view === 'table' ? (
        <JobTable jobs={visible} canWrite={canWrite} busyKey={busyKey} pending={pending} run={run} myEmployeeId={myEmployeeId} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <ul className="divide-y divide-gray-100">
            {visible.map((job) => {
              const key = `${job.orderId}:${job.lineIndex}`
              const busy = pending && busyKey === key
              return (
                <li key={key} className="flex items-start gap-4 px-4 py-3.5">
                  <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-gray-100 ring-1 ring-gray-200">
                    {job.cardImage && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={job.cardImage} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate font-semibold text-gray-900">{job.productName}</p>
                      <TierPill tier={job.tier} tierId={job.tierId} />
                      <span className={cn(STATUS_CHIP, STATUS_TONE[job.status])}>
                        {DESIGN_STATUS_LABELS[job.status]}
                      </span>
                      <ChangeRequestedChip at={job.changeRequestedAt} />
                      <SlaRing sla={job.sla} />
                      {/* Only worth saying before the job is opened. Once a
                          designer is in it they can see the values themselves,
                          and this is the one thing that changes how they'd
                          pick: a card whose content is already in can be
                          started and finished in one sitting. */}
                      {job.startedAt === null && job.fieldValueCount > 0 && (
                        <span
                          className="inline-flex items-center rounded-full bg-[#9FE870] px-2 py-0.5 text-[11px] font-semibold text-[#1a3d0a]"
                          title="The couple filled these in from their dashboard"
                        >
                          {job.fieldValueCount} details in
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {job.coupleName ?? 'Unnamed couple'} · {job.orderRef}
                      {job.eventDate ? ` · ${job.eventDate}` : ''}
                    </p>
                    <AssigneeLine
                      job={job}
                      myEmployeeId={myEmployeeId}
                      canWrite={canWrite}
                      busy={busy}
                      onClaim={() => run(key, () => claimDesignJob(job.designId as string))}
                    />

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Pill>{job.digitalQty.toLocaleString('en-US')} digital</Pill>
                      {job.printQty > 0 && (
                        <Pill>{job.printQty.toLocaleString('en-US')} printed</Pill>
                      )}
                      {job.addOns
                        .filter((a) => a.code !== 'paper-prints')
                        .map((a) => (
                          <Pill key={`${a.code}-${a.label}`}>{a.label}</Pill>
                        ))}
                      {job.inferred && job.printQty > 0 && (
                        <span
                          className="text-[11px] font-medium text-amber-700"
                          title="Read from the order's display text, not structured data"
                        >
                          from &ldquo;{job.addOns.find((a) => a.code === 'paper-prints')?.label}&rdquo;
                        </span>
                      )}
                      {job.unparsed.map((label) => (
                        <span key={label} className="text-[11px] font-medium text-red-600">
                          unreadable add-on: {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {canWrite && (
                    <div className="shrink-0">
                      <RowAction
                        job={job}
                        busy={busy}
                        onStart={() => run(key, () => startDesignJob(job.orderId, job.lineIndex))}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Builds a queue URL that keeps whichever of status/view isn't changing. */
function queueHref(status: string, view: QueueView): string {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (view === 'table') params.set('view', 'table')
  const query = params.toString()
  return query ? `${BASE}?${query}` : BASE
}

function ViewToggle({ activeStatus, view }: { activeStatus: string; view: QueueView }) {
  const options: { key: QueueView; label: string; icon: React.ReactNode }[] = [
    { key: 'list', label: 'List', icon: <Rows3 className="h-3.5 w-3.5" /> },
    { key: 'table', label: 'Table', icon: <Table2 className="h-3.5 w-3.5" /> },
  ]
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-gray-200" role="group" aria-label="View">
      {options.map((option) => (
        <a
          key={option.key}
          href={queueHref(activeStatus, option.key)}
          aria-current={view === option.key ? 'true' : undefined}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors',
            view === option.key
              ? 'bg-[#F0DFF6] text-[#7E5896]'
              : 'bg-white text-gray-600 hover:bg-gray-50',
          )}
        >
          {option.icon}
          {option.label}
        </a>
      ))}
    </div>
  )
}

/**
 * Exactly one action per row, at one fixed width.
 *
 * Previously started jobs rendered "Open" plus a status dropdown while
 * unstarted ones rendered a narrow "Start", so the actions column had no
 * consistent edge and the eye had nothing to track down the table. Status is
 * changed on the job itself now, which is also where the context for that
 * decision lives.
 */
/**
 * Who is holding this card, and a one-click way to take it.
 *
 * Promoted out of the meta line, where the assignee used to be the last of four
 * dot-separated fragments and truncated away first. Ownership is what the queue
 * is FOR — it is the difference between a list of work and a board — and it
 * also decides who may approve, since a card cannot be signed off by the person
 * assigned to it.
 *
 * Nothing renders for a job that has not been started: there is no row to
 * assign to yet, and Start assigns it to whoever presses it.
 */
function AssigneeLine({
  job,
  myEmployeeId,
  canWrite,
  busy,
  onClaim,
}: {
  job: DesignJob
  myEmployeeId: string | null
  canWrite: boolean
  busy: boolean
  onClaim: () => void
}) {
  // Nobody can hold a job that hasn't been started, even if a row exists
  // because the couple sent their content ahead of a designer opening it.
  if (job.startedAt === null) return null

  const mine = myEmployeeId !== null && job.assignedTo === myEmployeeId
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
      <Users className="h-3 w-3 shrink-0 text-gray-400" />
      {job.assignedTo === null ? (
        <span className="font-semibold text-amber-700">Unassigned</span>
      ) : (
        <span className={mine ? 'font-semibold text-[#7E5896]' : 'text-gray-600'}>
          {mine ? 'Yours' : (job.assigneeName ?? 'Unknown')}
        </span>
      )}
      {/* Offered only while nobody holds it. Taking a card off a colleague is a
          deliberate act that belongs on the job itself, next to the history
          that records it — not behind a button in a list. */}
      {canWrite && job.assignedTo === null && (
        <button data-opus-button="control"
          type="button"
          disabled={busy}
          onClick={onClaim}
          className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-2 py-0.5 text-[11px] font-semibold text-gray-700 transition-colors hover:border-[#7E5896] hover:text-[#7E5896] disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          Take
        </button>
      )}
    </p>
  )
}

function RowAction({
  job,
  busy,
  onStart,
}: {
  job: DesignJob
  busy: boolean
  onStart: () => void
}) {
  const shared =
    'inline-flex w-[104px] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors'
  // Gated on startedAt, not on the row: a couple who filled in their card
  // details before anyone opened the job has created the row already, and that
  // must still read as work waiting to be picked up.
  if (job.startedAt === null) {
    return (
      <button data-opus-button="control"
        type="button"
        disabled={busy}
        onClick={onStart}
        className={cn(shared, 'bg-[#7E5896] text-white shadow-sm hover:bg-[#6b4a80] disabled:opacity-50')}
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Start
      </button>
    )
  }
  return (
    <Link
      href={`${BASE}/${job.designId}`}
      // Green outline: a started job is the healthy state, and it reads
      // distinctly against the solid purple "Start" without competing with it.
      className={cn(shared, 'border border-emerald-500 text-emerald-700 hover:bg-emerald-50')}
    >
      Open
    </Link>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold',
        'bg-[#9FE870] text-[#1a3d0a]',
      )}
    >
      {children}
    </span>
  )
}

Pill.Link = function PillLink({
  href,
  active,
  label,
  count,
}: {
  href: string
  active: boolean
  label: string
  count: number
}) {
  return (
    <a
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'border-[#7E5896] bg-[#F0DFF6] text-[#7E5896]'
          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900',
      )}
    >
      {label}
      <span className={cn('tabular-nums', active ? 'text-[#7E5896]' : 'text-gray-400')}>{count}</span>
    </a>
  )
}

function Kpi({
  label,
  value,
  icon,
  caption,
  tone,
}: {
  label: string
  value: string
  icon: React.ReactNode
  caption?: string
  tone?: 'alert'
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
        <span className="text-[#7E5896]">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">{value}</p>
      {caption && (
        <p className={cn('mt-1 text-sm', tone === 'alert' ? 'font-semibold text-red-700' : 'text-gray-500')}>
          {caption}
        </p>
      )}
    </div>
  )
}

/**
 * Denser alternative to the list. Same data and the same actions — the list is
 * easier to scan one job at a time, the table easier to compare many, so this
 * is a display choice rather than a different feature.
 */
/** Compact assignee for the table. No Take button — the row is already dense. */
function AssigneeCell({
  job,
  myEmployeeId,
}: {
  job: DesignJob
  myEmployeeId: string | null
}) {
  if (job.startedAt === null) return <span className="text-gray-300">—</span>
  if (job.assignedTo === null) {
    return <span className="text-xs font-semibold text-amber-700">Unassigned</span>
  }
  const mine = myEmployeeId !== null && job.assignedTo === myEmployeeId
  return (
    <span className={cn('text-xs', mine ? 'font-semibold text-[#7E5896]' : 'text-gray-600')}>
      {mine ? 'Yours' : (job.assigneeName ?? 'Unknown')}
    </span>
  )
}

function JobTable({
  jobs,
  canWrite,
  busyKey,
  pending,
  run,
  myEmployeeId,
}: {
  jobs: DesignJob[]
  canWrite: boolean
  busyKey: string | null
  pending: boolean
  run: (key: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => void
  myEmployeeId: string | null
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      {/* min-w keeps the columns readable on a narrow viewport; the wrapper
          scrolls rather than letting every cell wrap to four lines. */}
      <table className="opus-table w-full min-w-[1080px] text-sm">
        <thead className="border-b border-gray-100 bg-gray-50/50 text-[10px] font-bold uppercase tracking-wider text-gray-400">
          <tr>
            <th className="px-4 py-2.5 text-left">Card</th>
            <th className="px-4 py-2.5 text-left">Couple</th>
            <th className="px-4 py-2.5 text-right whitespace-nowrap">Digital</th>
            <th className="px-4 py-2.5 text-right whitespace-nowrap">Printed</th>
            <th className="px-4 py-2.5 text-left min-w-[170px]">Add-ons</th>
            <th className="px-4 py-2.5 text-left whitespace-nowrap">Due</th>
            <th className="px-4 py-2.5 text-left">Status</th>
            {/* The table view exists to compare many jobs at once, which is
                exactly the question "who is holding what" needs. */}
            <th className="px-4 py-2.5 text-left whitespace-nowrap">Assignee</th>
            <th className="w-[140px] px-4 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {jobs.map((job) => {
            const key = `${job.orderId}:${job.lineIndex}`
            const busy = pending && busyKey === key
            const extras = job.addOns.filter((a) => a.code !== 'paper-prints')
            return (
              <tr key={key} className="hover:bg-gray-50/40">
                <td className="px-4 py-2.5 min-w-[240px]">
                  <div className="flex items-center gap-2.5">
                    <div className="h-10 w-7 shrink-0 overflow-hidden rounded bg-gray-100 ring-1 ring-gray-200">
                      {job.cardImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={job.cardImage} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-gray-900">
                        {job.productName}
                      </span>
                      {job.tier && (
                        <span className="mt-0.5 block">
                          <TierPill tier={job.tier} tierId={job.tierId} />
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span className="block text-gray-800">{job.coupleName ?? '—'}</span>
                  <span className="block text-[11px] text-gray-400">
                    {job.orderRef}
                    {job.eventDate ? ` · ${job.eventDate}` : ''}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                  {job.digitalQty.toLocaleString('en-US')}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                  {job.printQty > 0 ? job.printQty.toLocaleString('en-US') : '—'}
                  {job.inferred && job.printQty > 0 && (
                    <span
                      className="block text-[10px] font-medium text-amber-700"
                      title="Read from the order's display text, not structured data"
                    >
                      inferred
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 min-w-[170px]">
                  {extras.length === 0 ? (
                    <span className="text-gray-300">—</span>
                  ) : (
                    <div className="flex flex-col items-start gap-1">
                      {extras.map((a) => (
                        <Pill key={`${a.code}-${a.label}`}>{a.label}</Pill>
                      ))}
                    </div>
                  )}
                  {job.unparsed.map((label) => (
                    <span key={label} className="block text-[11px] font-medium text-red-600">
                      unreadable: {label}
                    </span>
                  ))}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <SlaRing sla={job.sla} />
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span className={cn(STATUS_CHIP, STATUS_TONE[job.status])}>
                    {DESIGN_STATUS_LABELS[job.status]}
                  </span>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <AssigneeCell job={job} myEmployeeId={myEmployeeId} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  {canWrite && <RowAction job={job} busy={busy} onStart={() => run(key, () => startDesignJob(job.orderId, job.lineIndex))} />}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
