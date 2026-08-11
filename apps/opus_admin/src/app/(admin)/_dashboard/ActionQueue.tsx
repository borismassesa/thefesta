import Link from 'next/link'
import {
  ArrowUpRight,
  CalendarClock,
  Inbox,
  MailCheck,
  Newspaper,
  Plane,
  Star,
  Store,
  type LucideIcon,
} from 'lucide-react'
import type { ActionQueueCounts } from './queries'

// "Things that need an admin" — only renders cards the caller has
// permission to act on, so a finance-only viewer doesn't see "0 vendors
// waiting" cluttering their dashboard. Each card is a real link to the
// page where the work happens.
//
// `granted` is the caller's permission set, passed down from page.tsx
// (which resolved it via getCallerPermissions()).

type CardSpec = {
  permission: string
  count: number
  icon: LucideIcon
  label: string
  empty: string
  href: string
}

export default function ActionQueue({
  counts,
  granted,
  variant = 'grid',
}: {
  counts: ActionQueueCounts
  granted: Set<string>
  variant?: 'grid' | 'list'
}) {
  const allCards: CardSpec[] = [
    {
      permission: 'vendor.moderate',
      count: counts.vendorsPendingReview,
      icon: Store,
      label: 'vendors awaiting review',
      empty: 'No vendor applications waiting',
      href: '/operations/vendors',
    },
    {
      permission: 'cms.publish',
      count: counts.articleSubmissionsInPipeline,
      icon: Newspaper,
      label: 'article submissions in review',
      empty: 'No articles in the editorial pipeline',
      href: '/operations/articles/submissions',
    },
    {
      permission: 'vendor.moderate',
      count: counts.reviewsPendingModeration,
      icon: Star,
      label: 'reviews to moderate',
      empty: 'No reviews waiting',
      href: '/operations/reviews',
    },
    {
      permission: 'bookings.write',
      count: counts.inquiriesUnanswered,
      icon: Inbox,
      label: 'inquiries awaiting response',
      empty: 'No outstanding inquiries',
      href: '/operations/bookings',
    },
    {
      permission: 'platform.admin',
      count: counts.workforceInvitesPending,
      icon: MailCheck,
      label: 'team invites pending acceptance',
      empty: 'No outstanding invitations',
      href: '/workforce/roles',
    },
    {
      permission: 'workforce.write',
      count: counts.leaveRequestsPending,
      icon: Plane,
      label: 'leave requests to approve',
      empty: 'No leave requests waiting',
      href: '/workspace/leave',
    },
  ]

  // Filter by permission first. If the caller can't see anything in this
  // section, drop the whole heading — better than rendering an empty band.
  const cards = allCards.filter((c) => granted.has(c.permission))
  if (cards.length === 0) return null

  // Hide cards with 0 count from the priority section unless the caller
  // has nothing pending at all — in which case show one reassuring card.
  const withWork = cards.filter((c) => c.count > 0)
  const visible = withWork.length > 0 ? withWork : [cards[0]]
  const headingLabel = withWork.length === 0 ? 'All caught up' : 'Needs your attention'

  if (variant === 'list') {
    return (
      <section
        aria-labelledby="action-queue-heading"
        className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
      >
        <header className="mb-4 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-gray-400" />
          <h2
            id="action-queue-heading"
            className="text-sm font-semibold text-gray-900"
          >
            {headingLabel}
          </h2>
        </header>
        <ul className="divide-y divide-gray-100">
          {visible.map((card) => (
            <li key={card.label}>
              <ActionRow card={card} />
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <section aria-labelledby="action-queue-heading" className="space-y-3">
      <header className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-gray-400" />
        <h2
          id="action-queue-heading"
          className="text-[11px] font-bold uppercase tracking-wider text-gray-500"
        >
          {headingLabel}
        </h2>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((card) => (
          <ActionCard key={card.label} card={card} />
        ))}
      </div>
    </section>
  )
}

function ActionCard({ card }: { card: CardSpec }) {
  const Icon = card.icon
  const empty = card.count === 0
  return (
    <Link
      href={card.href}
      className="group relative flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-md"
    >
      <span
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
          empty ? 'bg-gray-100 text-gray-400' : 'bg-emerald-50 text-emerald-700'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p
          className={`text-2xl font-semibold tracking-tight tabular-nums ${
            empty ? 'text-gray-400' : 'text-gray-900'
          }`}
        >
          {card.count}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          {empty ? card.empty : card.label}
        </p>
      </div>
    </Link>
  )
}

function ActionRow({ card }: { card: CardSpec }) {
  const Icon = card.icon
  const empty = card.count === 0
  return (
    <Link
      href={card.href}
      className="group flex items-center gap-3 py-3 transition-colors hover:bg-gray-50/60 -mx-2 px-2 rounded-lg"
    >
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          empty ? 'bg-gray-100 text-gray-400' : 'bg-emerald-50 text-emerald-700'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-tight text-gray-500">
          {empty ? card.empty : card.label}
        </p>
      </div>
      <span
        className={`shrink-0 text-lg font-semibold tabular-nums ${
          empty ? 'text-gray-400' : 'text-gray-900'
        }`}
      >
        {card.count}
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
    </Link>
  )
}
