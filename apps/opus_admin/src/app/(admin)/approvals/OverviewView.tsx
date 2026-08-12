'use client'

// "Overview" — the landing tab, and the answer to the question people
// actually arrive with: what needs me right now?
//
// The catalog of request types moved to its own tab. Creating a request
// is a deliberate act you go looking for; being blocked on someone else's
// is something you need told. Ordering the page the other way round made
// the module a form directory.

import { ArrowRight, Clock, Plus, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BAND_DOT, BAND_TEXT, ageBand } from './ageing'
import { categoryLabel, findCategory } from './catalog'
import { quickCreateOrder, recentActivity, thisMonth } from './stats'
import type { ApprovalCategory, ApprovalCategoryKey, ApprovalRequest } from './types'
import { ICONS, StatusPill, formatAge, formatDate } from './ui'

export default function OverviewView({
  waitingOnMe,
  mine,
  relevantRequests,
  favourites,
  categories,
  actorEmail,
  now,
  onOpen,
  onNew,
  onGoTo,
}: {
  waitingOnMe: ApprovalRequest[]
  mine: ApprovalRequest[]
  // Requests this caller raised or is named on. Deliberately not every
  // request in the org — the landing page is a personal inbox, and an
  // ambient feed of everyone's payments and contracts is a disclosure, not
  // a feature. Org-wide numbers live on the permission-gated Analytics tab.
  relevantRequests: ApprovalRequest[]
  favourites: ApprovalCategoryKey[]
  categories: ApprovalCategory[]
  actorEmail: string
  now: number
  onOpen: (id: string) => void
  onNew: (category: ApprovalCategoryKey) => void
  onGoTo: (
    tab: 'create' | 'my-requests' | 'pending' | 'analytics',
    filters?: Record<string, string>,
  ) => void
}) {
  const myPending = mine.filter((r) => r.status === 'Submitted')
  const myDrafts = mine.filter((r) => r.status === 'To Submit')
  // Scoped to *my* requests, so the tile labels below can say so plainly.
  const month = thisMonth(mine, now)
  const feed = recentActivity(relevantRequests, 6)
  const quickCreate = quickCreateOrder(mine, favourites, actorEmail, 5)

  const attention = [...waitingOnMe].sort(
    (a, b) =>
      new Date(a.submittedAt ?? a.createdAt).getTime() -
      new Date(b.submittedAt ?? b.createdAt).getTime(),
  )

  return (
    <div className="space-y-5">
      {/* Counts first. Each one is a filter, so each one is clickable —
          a number you can't act on is decoration. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Needs my approval"
          value={waitingOnMe.length}
          accent="#8A5A09"
          tint="#FEF3DB"
          emphasis={waitingOnMe.length > 0}
          onClick={() => onGoTo('pending')}
        />
        <StatTile
          label="My open requests"
          value={myPending.length}
          hint={myDrafts.length > 0 ? `${myDrafts.length} draft${myDrafts.length === 1 ? '' : 's'}` : undefined}
          accent="#1F5D8C"
          tint="#E5F2FB"
          onClick={() => onGoTo('my-requests', { status: 'Submitted' })}
        />
        {/* "Approved this month" on its own is ambiguous — approved by me,
            or mine that were approved? Both tiles are scoped to the
            caller's own requests and labelled to say so. */}
        <StatTile
          label="My requests approved"
          value={month.approved}
          hint="This month"
          accent="#166534"
          tint="#E6F1E6"
          onClick={() => onGoTo('my-requests', { status: 'Approved', period: 'this-month' })}
        />
        <StatTile
          label="My requests refused"
          value={month.refused}
          hint={
            month.avgDecisionDays !== null
              ? `This month · ${month.avgDecisionDays.toFixed(1)}d average decision`
              : 'This month'
          }
          accent="#9B1D4C"
          tint="#FCE4EC"
          onClick={() => onGoTo('my-requests', { status: 'Refused', period: 'this-month' })}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <div className="space-y-4">
          {/* ---- Needs your attention ---- */}
          <Panel
            title="Needs your attention"
            action={
              waitingOnMe.length > 0
                ? { label: 'Open inbox', onClick: () => onGoTo('pending') }
                : undefined
            }
          >
            {attention.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-semibold text-gray-700">
                  Nothing needs your approval
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  New requests routed to you will appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {attention.slice(0, 5).map((r) => {
                  const band = ageBand(r.submittedAt ?? r.createdAt, now)
                  return (
                    <li key={r.id}>
                      <button data-opus-button="control"
                        type="button"
                        onClick={() => onOpen(r.id)}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-gray-50"
                      >
                        <span
                          className={cn('h-2 w-2 shrink-0 rounded-full', BAND_DOT[band])}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {r.subject}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {categoryLabel(categories, r.category)} · from {r.owner}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1 text-xs font-semibold',
                            BAND_TEXT[band],
                          )}
                        >
                          <Clock className="h-3.5 w-3.5" />
                          Waiting {formatAge(r.submittedAt ?? r.createdAt, now)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          {/* ---- My open requests ---- */}
          <Panel
            title="My open requests"
            action={
              mine.length > 0
                ? { label: 'See all', onClick: () => onGoTo('my-requests') }
                : undefined
            }
          >
            {mine.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm font-semibold text-gray-700">You have no open requests</p>
                <p className="mt-1 text-xs text-gray-500">
                  Create a request when you need approval for travel, payment, procurement or
                  another service.
                </p>
                <button data-opus-button="control"
                  type="button"
                  onClick={() => onGoTo('create')}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-emerald-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New request
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {[...myPending, ...myDrafts].slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => onOpen(r.id)}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-gray-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{r.subject}</p>
                        <p className="truncate text-xs text-gray-500">
                          {r.status === 'Submitted'
                            ? `Submitted ${formatDate(r.submittedAt)} · with ${
                                r.approvers.map((a) => a.name).join(', ') || 'nobody'
                              }`
                            : 'Not submitted yet'}
                        </p>
                      </div>
                      <StatusPill status={r.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* ---- Right rail: quick create + org activity ---- */}
        <div className="space-y-4">
          <Panel title="Quick create">
            {quickCreate.length === 0 ? (
              <div className="px-5 py-6 text-center">
                <p className="text-xs text-gray-500">
                  Star a request type in the catalog and it pins here.
                </p>
                <button data-opus-button="control"
                  type="button"
                  onClick={() => onGoTo('create')}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#5B2D8E] hover:underline"
                >
                  Browse request types
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {quickCreate.map((key) => {
                  const c = findCategory(categories, key)
                  // A favourite can point at a type that was since retired.
                  if (!c) return null
                  const Icon = ICONS[c.iconKey]
                  const starred = favourites.includes(key)
                  return (
                    <li key={key}>
                      <button data-opus-button="control"
                        type="button"
                        onClick={() => onNew(key)}
                        className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-gray-50"
                      >
                        <span
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                          style={{ backgroundColor: c.tint, color: c.accent }}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                          {c.label}
                        </span>
                        {starred && (
                          <Star
                            className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400"
                            aria-label="Favourite"
                          />
                        )}
                        <Plus className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Recent activity">
            {feed.length === 0 ? (
              <div className="px-5 py-6 text-center">
                <p className="text-sm font-semibold text-gray-700">No recent activity</p>
                <p className="mt-1 text-xs text-gray-500">
                  Updates across the requests you raised or approve will appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {feed.map((e) => (
                  <li key={e.id}>
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => onOpen(e.requestId)}
                      className="flex w-full items-start gap-2.5 px-5 py-3 text-left hover:bg-gray-50"
                    >
                      <span
                        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
                        style={{ backgroundColor: e.authorColor }}
                      >
                        {e.authorInitials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-500">
                          <span className="font-semibold text-gray-900">{e.author}</span>
                          <span className="ml-1.5">{formatAge(e.at, now)} ago</span>
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-gray-700">{e.body}</p>
                        <p className="mt-1 truncate text-[11px] text-gray-400">{e.subject}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  hint,
  accent,
  tint,
  emphasis,
  onClick,
}: {
  label: string
  value: number
  hint?: string
  accent: string
  tint: string
  // Draws a coloured border when there's work behind the number, so a
  // non-zero "needs my approval" reads differently from a calm zero.
  emphasis?: boolean
  onClick: () => void
}) {
  return (
    <button data-opus-button="control"
      type="button"
      onClick={onClick}
      className={cn(
        'group rounded-2xl border px-4 py-3 text-left transition hover:shadow-[0_6px_20px_-8px_rgba(0,0,0,0.15)]',
        emphasis ? 'border-transparent ring-2' : 'border-gray-100',
      )}
      style={{
        background: `linear-gradient(150deg, ${tint} 0%, #FFFFFF 70%)`,
        ...(emphasis ? { boxShadow: `inset 0 0 0 2px ${accent}33` } : {}),
      }}
    >
      <span
        className="text-[11px] font-bold uppercase tracking-wider"
        style={{ color: accent }}
      >
        {label}
      </span>
      <span className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-gray-900">{value}</span>
        <ArrowRight className="h-3.5 w-3.5 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-500" />
      </span>
      {hint && <span className="mt-0.5 block truncate text-[11px] text-gray-500">{hint}</span>}
    </button>
  )
}

function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: { label: string; onClick: () => void }
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">{title}</h2>
        {action && (
          <button data-opus-button="control"
            type="button"
            onClick={action.onClick}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#5B2D8E] hover:bg-[#F8EDFF]"
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {children}
    </section>
  )
}
