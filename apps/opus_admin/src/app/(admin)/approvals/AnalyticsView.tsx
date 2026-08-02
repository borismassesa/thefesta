'use client'

// "Analytics" — leadership view, and the ONLY place org-wide approval
// information surfaces.
//
// It receives a server-computed aggregate, not request rows. Nobody reads a
// request they neither raised nor decide on, so counts, averages and
// timestamps are all that cross to the browser. There is no subject, requester,
// amount or justification in this component's props, which is what lets this
// view coexist with that rule. See approvalAnalytics() in queries.ts.
//
// Durations are measured from submission, never creation: a request that sat
// in someone's drafts for a week didn't take the approver a week.

import { Building2 } from 'lucide-react'
import { findGroup } from './data'
import { categoryLabel } from './catalog'
import type { ApprovalAnalytics } from './queries'
import type { ApprovalCategory } from './types'
import { AGEING_FROM_DAYS } from './ageing'
import { EmptyState, formatAge } from './ui'

export default function AnalyticsView({
  analytics,
  now,
  categories,
}: {
  analytics: ApprovalAnalytics
  now: number
  categories: ApprovalCategory[]
}) {
  const a = analytics
  const refusalRate = a.decided > 0 ? Math.round((a.refused / a.decided) * 100) : null

  if (a.pending + a.drafts + a.decided === 0) {
    return (
      <EmptyState
        title="No approval data yet"
        hint="Metrics appear once requests start moving through the workflow."
      />
    )
  }

  return (
    <div className="space-y-5">
      {/* Every figure below is ORGANIZATION-WIDE. The other three tabs are
          strictly personal, so an unlabelled "Pending 1" here reads as "one of
          mine" when it is in fact someone else's request entirely. Overview's
          tiles were relabelled to "My requests approved" for the same reason;
          this is the mirror of that fix. */}
      <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-2.5">
        <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
        <p className="text-xs text-gray-600">
          <span className="font-semibold text-gray-800">Organization-wide.</span>{' '}
          These figures cover every request in the company, including ones you cannot open.
          Your own requests are on{' '}
          <span className="font-medium text-gray-700">My Requests</span>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Pending" value={String(a.pending)} accent="#8A5A09" tint="#FEF3DB" />
        <Kpi label="Drafts" value={String(a.drafts)} accent="#4B5563" tint="#F3F4F6" />
        <Kpi label="Approved" value={String(a.approved)} accent="#166534" tint="#E6F1E6" />
        <Kpi
          label="Refusal rate"
          value={refusalRate === null ? 'No data' : `${refusalRate}%`}
          empty={refusalRate === null}
          hint={`${a.refused} of ${a.decided} decided`}
          accent="#9B1D4C"
          tint="#FCE4EC"
        />
        <Kpi
          label="Avg time to decision"
          value={a.avgDecisionDays === null ? 'No data' : formatDays(a.avgDecisionDays)}
          empty={a.avgDecisionDays === null}
          hint={a.avgDecisionDays === null ? 'No decided requests yet' : 'From submission'}
          accent="#5B2D8E"
          tint="#EFE3F8"
        />
        <Kpi
          label="Oldest pending"
          value={a.oldestPendingAt ? formatAge(a.oldestPendingAt, now) : 'Nothing pending'}
          empty={!a.oldestPendingAt}
          accent="#1F5D8C"
          tint="#E5F2FB"
        />
      </div>

      {a.ageingCount > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-semibold text-amber-900">
            {a.ageingCount} request{a.ageingCount === 1 ? '' : 's'} pending longer than{' '}
            {AGEING_FROM_DAYS} days
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Open the queue below to see which departments they sit in.
          </p>
        </div>
      )}

      <Panel title="By department" subtitle="Where approval volume actually sits.">
        <div className="divide-y divide-gray-100">
          {a.byGroup.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-500">Nothing recorded yet.</p>
          ) : (
            a.byGroup.map((row) => (
              <div key={row.group} className="flex items-center gap-4 px-5 py-3">
                <div className="w-32 shrink-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {findGroup(row.group).label}
                  </p>
                  <p className="text-[11px] text-gray-500">{row.total} total</p>
                </div>
                <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <Segment value={row.pending} total={row.total} color="#E4A11B" />
                  <Segment value={row.approved} total={row.total} color="#4B9E5F" />
                  <Segment value={row.refused} total={row.total} color="#D1436F" />
                </div>
                {/* Every number is labelled. This read "1 pending  0  0", which
                    left the reader guessing what the bare zeroes counted. */}
                <div className="flex w-56 shrink-0 justify-end gap-3 text-[11px] font-semibold">
                  <span className="text-amber-700">{row.pending} pending</span>
                  <span className="text-emerald-700">{row.approved} approved</span>
                  <span className="text-rose-600">{row.refused} refused</span>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel
        title="Approval bottlenecks"
        subtitle="Who is holding work, and how long the oldest item has waited."
      >
        {a.bottlenecks.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">Nothing is currently pending.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {a.bottlenecks.map((b) => (
              <div key={b.name} className="flex items-center gap-4 px-5 py-3">
                <p className="flex-1 truncate text-sm font-medium text-gray-900">{b.name}</p>
                <span className="rounded-full bg-[#9FE870] px-2 py-0.5 text-[11px] font-bold text-[#14361F]">
                  {b.pending} pending
                </span>
                <span className="w-24 text-right text-xs text-gray-500">
                  oldest {formatAge(b.oldestAt, now)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Category and age only. The subject and requester are deliberately
          absent — this view is visible to people who cannot open these
          requests, and a subject line leaks most of what a request is. */}
      <Panel title="Longest waiting" subtitle="The queue by request type, oldest first.">
        {a.longestWaiting.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">Nothing is currently pending.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {a.longestWaiting.map((r, i) => (
              <div key={`${r.category}-${r.submittedAt}-${i}`} className="flex items-center gap-4 px-5 py-3">
                <p className="min-w-0 flex-1 truncate text-sm text-gray-700">
                  {categoryLabel(categories, r.category)}
                </p>
                <span className="w-16 text-right text-xs font-semibold text-gray-600">
                  {formatAge(r.submittedAt, now)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  accent,
  tint,
  empty,
}: {
  label: string
  value: string
  hint?: string
  accent: string
  tint: string
  // "No data" set in the same 2xl weight as a real figure reads as a value.
  // Render the absence quietly instead.
  empty?: boolean
}) {
  return (
    <div
      className="rounded-2xl border border-gray-100 px-4 py-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
      style={{ background: `linear-gradient(150deg, ${tint} 0%, #FFFFFF 70%)` }}
    >
      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: accent }}>
        {label}
      </p>
      <p
        className={
          empty
            ? 'mt-2 text-sm font-medium text-gray-400'
            : 'mt-1 text-2xl font-semibold text-gray-900'
        }
      >
        {value}
      </p>
      {/* Wraps rather than truncates: at six columns these tiles are narrow
          enough that "No decided requests yet" was cut to "No decided reques…". */}
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{hint}</p>}
    </div>
  )
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="border-b border-gray-100 px-5 py-3">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function Segment({ value, total, color }: { value: number; total: number; color: string }) {
  if (value === 0 || total === 0) return null
  return <span style={{ width: `${(value / total) * 100}%`, backgroundColor: color }} />
}

function formatDays(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`
  return `${days.toFixed(1)}d`
}
