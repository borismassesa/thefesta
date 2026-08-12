import Link from 'next/link'
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  ClipboardList,
  Clock,
  FileText,
  Plane,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkspaceHome } from '../_lib/home'
import { humanizeShiftType } from '../_lib/labels'
import { WS, WsEmpty, WsPill } from './ui'

// Workspace Home. Presentational only: every value was resolved and authorized
// server-side in page.tsx, and nothing here fetches or accepts an id.
//
// Layout principle: one day, one primary action (clock), then work due, then
// time off / upcoming. Empty org chrome (approvals, announcements) stays off
// the page unless there is something to show.

function Card({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string
  icon: typeof Clock
  action?: { label: string; href: string }
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn(WS.cardPad, 'flex flex-col p-4', className)}>
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className={cn(WS.sectionLabel, 'flex items-center gap-2')}>
          <Icon className="h-4 w-4 text-[#7E5896]" strokeWidth={1.75} />
          {title}
        </h2>
        {action && (
          <Link href={action.href} className={cn(WS.link, 'flex items-center gap-1')}>
            {action.label}
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        )}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  )
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
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

function shiftHours(shift: NonNullable<WorkspaceHome['shift']>): string | null {
  if (shift.startTime && shift.endTime) {
    return `${shift.startTime.slice(0, 5)} – ${shift.endTime.slice(0, 5)}`
  }
  return shift.note
}

export default function HomeView({
  home,
  onboarding,
}: {
  home: WorkspaceHome
  onboarding: boolean
}) {
  const { profile } = home
  const shiftLabel = home.shift ? humanizeShiftType(home.shift.type) : null
  const isOff = home.shift?.type.toLowerCase() === 'off'
  const clockedIn = Boolean(home.clock?.isClockedIn)
  const onBreak = Boolean(home.clock?.onBreak)
  const clockPrimaryHref = '/workspace/timeclock'
  const dueReportCount = home.reportsDue.length
  const overdueReportCount = home.reportsDue.filter((r) => r.state === 'overdue').length

  const dueSummary = [
    home.tasksDueToday.length > 0 &&
      `${home.tasksDueToday.length} task${home.tasksDueToday.length === 1 ? '' : 's'}`,
    dueReportCount > 0 && `${dueReportCount} report${dueReportCount === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ')

  const clockStatus = !home.clock
    ? 'Unavailable'
    : clockedIn
      ? onBreak
        ? 'On break'
        : 'Clocked in'
      : 'Clocked out'

  const clockDetail = !home.clock
    ? null
    : clockedIn && home.clock.sinceIso
      ? `Since ${formatTime(home.clock.sinceIso)}`
      : home.clock.lastPunchIso
        ? `Last punch ${formatTime(home.clock.lastPunchIso)}`
        : 'No punches yet'

  return (
    <div className="space-y-4">
      {/* One flat day band — identity + shift/due/clock share the width evenly */}
      <section className={cn(WS.card, 'overflow-hidden')}>
        <div className="flex flex-col lg:flex-row lg:items-stretch">
          <div className="min-w-0 flex-1 px-5 py-5 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7E5896]">
              {formatDay(home.today)}
            </p>
            <div className="mt-2 flex items-start gap-3">
              <span
                aria-hidden
                className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#F0DFF6] text-sm font-bold text-[#7E5896]"
              >
                {profile.name
                  .split(/\s+/)
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || '—'}
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
                  {profile.name}
                </h1>
                <p className="mt-0.5 text-sm text-gray-500">
                  {profile.jobTitle} · {profile.department}
                </p>
                <p className="mt-1.5 text-[12px] text-gray-400">
                  {[profile.employeeCode, profile.location, profile.status]
                    .filter(Boolean)
                    .join(' · ')}
                  {profile.managerName ? ` · Reports to ${profile.managerName}` : ''}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 border-t border-gray-100 sm:grid-cols-3 lg:w-[min(100%,32rem)] lg:shrink-0 lg:border-l lg:border-t-0">
            <div className="px-5 py-4 sm:border-r sm:border-gray-100">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                Shift
              </p>
              {home.shift ? (
                <>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {isOff ? 'Day off' : shiftLabel}
                  </p>
                  <p className="mt-0.5 text-[12px] text-gray-500">
                    {!isOff && shiftHours(home.shift) ? shiftHours(home.shift) : 'Rostered today'}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-sm font-semibold text-gray-900">Unscheduled</p>
                  <p className="mt-0.5 text-[12px] text-gray-500">No roster for today</p>
                </>
              )}
            </div>

            <div className="border-t border-gray-100 px-5 py-4 sm:border-t-0 sm:border-r sm:border-gray-100">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                Due now
              </p>
              {dueSummary ? (
                <>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{dueSummary}</p>
                  <p
                    className={cn(
                      'mt-0.5 text-[12px]',
                      overdueReportCount > 0 ? 'text-rose-600' : 'text-gray-500',
                    )}
                  >
                    {overdueReportCount > 0
                      ? `${overdueReportCount} overdue`
                      : 'Nothing overdue'}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-sm font-semibold text-gray-900">Clear</p>
                  <p className="mt-0.5 text-[12px] text-gray-500">No tasks or reports due</p>
                </>
              )}
            </div>

            <div
              className={cn(
                'border-t border-gray-100 px-5 py-4 sm:border-t-0',
                clockedIn ? 'bg-emerald-50/70' : 'bg-[#FBF5FD]',
              )}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                Clock
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{clockStatus}</p>
              {clockDetail && (
                <p className="mt-0.5 text-[12px] text-gray-500">{clockDetail}</p>
              )}
              {home.clock && (
                <Link
                  href={clockPrimaryHref}
                  className={cn(WS.btnPrimarySm, 'mt-3 w-full sm:w-auto')}
                >
                  <Clock className="h-4 w-4" strokeWidth={2} />
                  {clockedIn ? (onBreak ? 'Open clock' : 'Clock out') : 'Clock in'}
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {onboarding && (
        <section className="flex items-start gap-3 rounded-2xl border border-[#C9A0DC] bg-[#F0DFF6]/50 p-4">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#7E5896]" strokeWidth={1.75} />
          <div>
            <h2 className="text-sm font-semibold text-[#5B2D8E]">
              Welcome — finish your onboarding checklist
            </h2>
            <p className="mt-1 text-sm text-[#5d3a78]/90">
              Open My Work for the tasks your manager set up
              {profile.managerName ? ` with ${profile.managerName}` : ''}.
            </p>
            <Link href="/workspace/work" className={cn(WS.link, 'mt-2 inline-flex items-center gap-1')}>
              Go to My Work
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          </div>
        </section>
      )}

      {home.attention.length > 0 && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-rose-700">
            <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
            Needs your attention
          </h2>
          <ul className="space-y-2">
            {home.attention.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-start justify-between gap-4 rounded-xl bg-white/80 px-4 py-2.5 transition-colors hover:bg-white"
                >
                  <span className="min-w-0">
                    <span
                      className={cn(
                        'block text-sm font-semibold',
                        item.severity === 'critical' ? 'text-rose-900' : 'text-amber-900',
                      )}
                    >
                      {item.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-gray-600">
                      {item.detail}
                    </span>
                  </span>
                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" strokeWidth={2} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Work due — the employee action surface */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Tasks due today"
          icon={ClipboardList}
          action={{ label: 'All tasks', href: '/workspace/work' }}
        >
          {home.tasksDueToday.length > 0 ? (
            <ul className="space-y-2">
              {home.tasksDueToday.map((task) => (
                <li key={`${task.source}-${task.id}`} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {task.title}
                    </span>
                    <span className="block text-[13px] text-gray-500">
                      {task.category} · {task.status}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                      task.urgency === 'overdue' ? 'bg-rose-100 text-rose-700' : WS.pill,
                    )}
                  >
                    {task.urgency === 'overdue' ? 'Overdue' : 'Today'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div>
              <WsEmpty>Nothing due today.</WsEmpty>
              {home.openTaskCount > 0 && (
                <Link
                  href="/workspace/work"
                  className={cn(WS.link, 'mt-2 inline-flex items-center gap-1')}
                >
                  {home.openTaskCount} open task{home.openTaskCount === 1 ? '' : 's'}
                  <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
                </Link>
              )}
            </div>
          )}
        </Card>

        <Card
          title="Reports to file"
          icon={FileText}
          action={{ label: 'My reports', href: '/workspace/reports' }}
        >
          {home.reportsDue.length > 0 ? (
            <ul className="space-y-2">
              {home.reportsDue.map((report) => (
                <li key={report.templateId}>
                  <Link
                    href="/workspace/reports"
                    className="flex items-start justify-between gap-3 rounded-xl px-1 py-0.5 transition-colors hover:bg-[#FBF5FD]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {report.name}
                      </span>
                      <span className="block text-[13px] text-gray-500">
                        {report.cadence}
                        {report.lastSubmitted
                          ? ` · last filed ${formatDay(report.lastSubmitted)}`
                          : ' · never filed'}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                        report.state === 'overdue' ? 'bg-rose-100 text-rose-700' : WS.pill,
                      )}
                    >
                      {report.state === 'overdue' ? 'Overdue' : 'Due'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <WsEmpty>You&apos;re up to date — no reports waiting.</WsEmpty>
          )}
        </Card>
      </div>

      {/* Time off + upcoming */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Leave" icon={Plane} action={{ label: 'Manage leave', href: '/workspace/leave' }}>
          {home.leaveBalance ? (
            <div>
              <p className="text-2xl font-semibold tracking-tight text-gray-900">
                {home.leaveBalance.remainingDays}
                <span className="ml-1 text-base font-medium text-gray-400">
                  / {home.leaveBalance.entitlementDays} days left
                </span>
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {home.leaveBalance.usedDays} used in {home.leaveBalance.year}
              </p>
              <div className={cn(WS.progressTrack, 'mt-3')}>
                <div
                  className={WS.progressFill}
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (home.leaveBalance.remainingDays /
                          Math.max(1, home.leaveBalance.entitlementDays)) *
                          100,
                      ),
                    )}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div>
              <WsEmpty>Your leave balance isn&apos;t set up yet.</WsEmpty>
              <p className="mt-1 text-[13px] text-gray-400">
                Ask People Ops if you expected a balance here.
              </p>
            </div>
          )}

          <div className="mt-4 border-t border-gray-100 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Upcoming
            </p>
            {home.upcomingLeave.length > 0 ? (
              <ul className="space-y-2">
                {home.upcomingLeave.map((leave) => (
                  <li key={leave.id} className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900">
                        {leave.type} leave
                      </span>
                      <span className="block text-[13px] text-gray-500">
                        {formatDay(leave.startDate)} to {formatDay(leave.endDate)}
                      </span>
                    </span>
                    <WsPill>
                      {leave.startsInDays <= 0 ? 'Now' : `In ${leave.startsInDays}d`}
                    </WsPill>
                  </li>
                ))}
              </ul>
            ) : (
              <WsEmpty>No leave booked.</WsEmpty>
            )}
          </div>
        </Card>

        <Card title="Coming up" icon={CalendarDays}>
          {home.agenda.length > 0 ? (
            <ul className="space-y-2.5">
              {home.agenda.map((event, index) => (
                <li key={`${event.kind}-${event.date}-${index}`} className="flex items-start gap-3">
                  <span className="w-18 shrink-0 text-[12px] font-semibold text-[#7E5896]/80">
                    {formatDay(event.date)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {event.label}
                    </span>
                    {event.detail && (
                      <span className="block text-[13px] text-gray-500">{event.detail}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <WsEmpty>No leave or deadlines in the next two weeks.</WsEmpty>
          )}

          {home.announcements.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                From the team
              </p>
              <ul className="space-y-2">
                {home.announcements.slice(0, 3).map((item) => {
                  const body = (
                    <>
                      <span className="block text-sm font-medium text-gray-900">{item.title}</span>
                      {item.body && (
                        <span className="mt-0.5 block text-[13px] text-gray-500 line-clamp-2">
                          {item.body}
                        </span>
                      )}
                    </>
                  )
                  return (
                    <li key={item.id}>
                      {item.href ? (
                        <Link href={item.href} className="block hover:opacity-80">
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
