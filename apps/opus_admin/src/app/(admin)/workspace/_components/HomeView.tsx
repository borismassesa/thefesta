import Link from 'next/link'
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  ClipboardList,
  Clock,
  FileText,
  Inbox,
  Megaphone,
  Plane,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkspaceHome } from '../_lib/home'

// Workspace Home. Presentational only: every value was resolved and authorized
// server-side in page.tsx, and nothing here fetches or accepts an id.

const GREEN_PILL =
  'inline-flex items-center rounded-full bg-[#9FE870] px-2.5 py-0.5 text-[11px] font-semibold text-gray-900'

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
    <section
      className={cn(
        'flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]',
        className,
      )}
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">
          <Icon className="h-4 w-4 text-gray-400" strokeWidth={1.75} />
          {title}
        </h2>
        {action && (
          <Link
            href={action.href}
            className="flex items-center gap-1 text-[12px] font-semibold text-gray-500 hover:text-gray-900"
          >
            {action.label}
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        )}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400">{children}</p>
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

export default function HomeView({
  home,
  onboarding,
}: {
  home: WorkspaceHome
  onboarding: boolean
}) {
  const { profile } = home

  return (
    <div className="space-y-5">
      {/* Identity strip. Name, role, department and manager, so the employee can
          see at a glance whose Workspace they are in. */}
      <section className="rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-900 to-gray-800 p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[12px] font-medium uppercase tracking-wide text-white/50">
              {formatDay(home.today)}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{profile.name}</h1>
            <p className="mt-1 text-sm text-white/70">
              {profile.jobTitle} · {profile.department}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={GREEN_PILL}>{profile.employeeCode}</span>
              <span className={GREEN_PILL}>{profile.location}</span>
              {profile.managerName && (
                <span className={GREEN_PILL}>Reports to {profile.managerName}</span>
              )}
              <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white/80">
                {profile.status}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[12px] font-medium uppercase tracking-wide text-white/50">
              Clock status
            </p>
            {home.clock ? (
              <>
                <p className="mt-1 text-xl font-semibold">
                  {home.clock.isClockedIn ? 'Clocked in' : 'Clocked out'}
                </p>
                <p className="mt-0.5 text-sm text-white/60">
                  {home.clock.isClockedIn && home.clock.sinceIso
                    ? `Since ${formatTime(home.clock.sinceIso)}`
                    : home.clock.lastPunchIso
                      ? `Last punch ${formatTime(home.clock.lastPunchIso)}`
                      : 'No punches yet'}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-white/60">Unavailable</p>
            )}
            <Link
              href="/workspace/timeclock"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#9FE870] px-4 py-2 text-[13px] font-semibold text-gray-900 hover:brightness-95"
            >
              <Clock className="h-4 w-4" strokeWidth={2} />
              Open time clock
            </Link>
          </div>
        </div>
      </section>

      {onboarding && (
        <section className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" strokeWidth={1.75} />
          <div>
            <h2 className="text-sm font-semibold text-emerald-900">
              Welcome to OpusFesta. You are still onboarding.
            </h2>
            <p className="mt-1 text-sm text-emerald-800/90">
              Your onboarding checklist is in My Tasks. Work through it with your manager,
              {profile.managerName ? ` ${profile.managerName}.` : ' once one is assigned.'}
            </p>
          </div>
        </section>
      )}

      {home.attention.length > 0 && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-rose-700">
            <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
            Needs your attention
          </h2>
          <ul className="space-y-2">
            {home.attention.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-start justify-between gap-4 rounded-xl bg-white/70 px-4 py-3 transition-colors hover:bg-white"
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

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Today's shift" icon={Clock}>
          {home.shift ? (
            <div>
              <p className="text-2xl font-semibold tracking-tight text-gray-900">
                {home.shift.type}
              </p>
              {home.shift.startTime && home.shift.endTime && (
                <p className="mt-1 text-sm text-gray-500">
                  {home.shift.startTime.slice(0, 5)} to {home.shift.endTime.slice(0, 5)}
                </p>
              )}
              {home.shift.note && (
                <p className="mt-2 text-[13px] text-gray-500">{home.shift.note}</p>
              )}
            </div>
          ) : (
            <Empty>No shift rostered for today.</Empty>
          )}
        </Card>

        <Card title="Leave balance" icon={Plane} action={{ label: 'Leave', href: '/workspace/leave' }}>
          {home.leaveBalance ? (
            <div>
              <p className="text-2xl font-semibold tracking-tight text-gray-900">
                {home.leaveBalance.remainingDays}
                <span className="ml-1 text-base font-medium text-gray-400">
                  / {home.leaveBalance.entitlementDays} days
                </span>
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {home.leaveBalance.usedDays} used in {home.leaveBalance.year}.
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-[#9FE870]"
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
            <Empty>Leave balance unavailable.</Empty>
          )}
        </Card>

        <Card title="Upcoming leave" icon={CalendarDays}>
          {home.upcomingLeave.length > 0 ? (
            <ul className="space-y-2.5">
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
                  <span className={GREEN_PILL}>
                    {leave.startsInDays <= 0 ? 'Now' : `In ${leave.startsInDays}d`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No leave booked.</Empty>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Tasks due today"
          icon={ClipboardList}
          action={{ label: 'All tasks', href: '/workspace/work' }}
        >
          {home.tasksDueToday.length > 0 ? (
            <ul className="space-y-2.5">
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
                      task.urgency === 'overdue'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-[#9FE870] text-gray-900',
                    )}
                  >
                    {task.urgency === 'overdue' ? 'Overdue' : 'Today'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>
              Nothing due today.{' '}
              {home.openTaskCount > 0 && `${home.openTaskCount} open overall.`}
            </Empty>
          )}
        </Card>

        <Card
          title="Reports due"
          icon={FileText}
          action={{ label: 'My reports', href: '/workspace/reports' }}
        >
          {home.reportsDue.length > 0 ? (
            <ul className="space-y-2.5">
              {home.reportsDue.map((report) => (
                <li key={report.templateId} className="flex items-start justify-between gap-3">
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
                      report.state === 'overdue'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-[#9FE870] text-gray-900',
                    )}
                  >
                    {report.state === 'overdue' ? 'Overdue' : 'Due'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>You are up to date on reports.</Empty>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card
          title="Pending requests"
          icon={Inbox}
          action={{ label: 'Approvals', href: '/approvals' }}
        >
          {home.pendingRequests.length > 0 ? (
            <ul className="space-y-2.5">
              {home.pendingRequests.map((request) => (
                <li key={request.id} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {request.subject}
                    </span>
                    <span className="block text-[13px] text-gray-500">{request.category}</span>
                  </span>
                  <span className={GREEN_PILL}>{request.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No requests waiting on you.</Empty>
          )}
        </Card>

        <Card title="Next 14 days" icon={CalendarDays}>
          {home.agenda.length > 0 ? (
            <ul className="space-y-2.5">
              {home.agenda.map((event, index) => (
                <li key={`${event.kind}-${event.date}-${index}`} className="flex items-start gap-3">
                  <span className="w-20 shrink-0 text-[12px] font-semibold text-gray-400">
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
            <Empty>Nothing scheduled in the next two weeks.</Empty>
          )}
        </Card>

        <Card title="Announcements" icon={Megaphone}>
          {home.announcements.length > 0 ? (
            <ul className="space-y-2.5">
              {home.announcements.map((item) => {
                const body = (
                  <>
                    <span className="block text-sm font-medium text-gray-900">{item.title}</span>
                    {item.body && (
                      <span className="mt-0.5 block text-[13px] text-gray-500">{item.body}</span>
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
          ) : (
            <Empty>No announcements.</Empty>
          )}
        </Card>
      </div>
    </div>
  )
}
