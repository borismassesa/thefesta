import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WORKSPACE_ROUTES } from '../_lib/routes'
import { WS } from './ui'

export function TileGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  )
}

/**
 * One Workspace Home tile.
 *
 * `comingSoon` marks a surface that is not built yet (Leave in Phase 3,
 * Calendar in Phase 5, Documents in Phase 6). Those render as a flat card
 * rather than a link, so nobody clicks through to a 404. The figure shown is
 * still real where we have it: a resigned employee's leave balance is a fact
 * even before the Leave screen exists.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  detail,
  href,
  tone = 'neutral',
  comingSoon = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
  href: string
  tone?: 'neutral' | 'active'
  comingSoon?: boolean
}) {
  const body = (
    <>
      <div className="flex items-start justify-between">
        <span
          className={cn(
            WS.iconWell,
            tone === 'active' && 'ring-1 ring-[#C9A0DC]',
          )}
        >
          <Icon className="h-5 w-5 stroke-[1.5]" />
        </span>
        {comingSoon ? (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-500">
            Coming soon
          </span>
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5" />
        )}
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
      <p className="mt-0.5 text-sm text-gray-500">{detail}</p>
    </>
  )

  const shell = cn(WS.cardPad, 'transition-colors')

  if (comingSoon) {
    return <div className={cn(shell, 'opacity-75')}>{body}</div>
  }

  return (
    <Link href={href} className={cn(shell, 'group block hover:border-[#C9A0DC]')}>
      {body}
    </Link>
  )
}

/**
 * The row of one-click actions. Every entry is a link to the surface that
 * owns the action rather than an inline mutation: the punch logic already
 * lives on the Time Clock page, and duplicating it here is the recurring bug
 * this codebase has hit before with newly added screens.
 */
export function QuickActions({
  isClockedIn,
  showTracker,
}: {
  isClockedIn: boolean
  showTracker: boolean
}) {
  const actions: Array<{ label: string; href: string; primary?: boolean }> = [
    {
      label: isClockedIn ? 'Clock out' : 'Clock in',
      href: WORKSPACE_ROUTES['time-clock'],
      primary: true,
    },
    { label: 'Submit a report', href: WORKSPACE_ROUTES.reports },
    { label: 'View my tasks', href: WORKSPACE_ROUTES.tasks },
  ]
  if (showTracker) {
    actions.push({ label: 'Open tracker', href: WORKSPACE_ROUTES.tracker })
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Quick actions
      </h2>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Link
            key={a.label}
            href={a.href}
            className={cn(a.primary ? WS.btnPrimary : WS.btnSecondary)}
          >
            {a.label}
          </Link>
        ))}
      </div>
    </section>
  )
}
