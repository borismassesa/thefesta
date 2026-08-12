import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  MapPin,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { getCallerPermissions } from '@/lib/admin-auth'
import { canViewCommandCenter, commandCenterAccess } from '@/lib/operations/command-center'
import { getOperationsCommandCenter } from '@/lib/operations/queries'
import OperationsHeading from './OperationsHeading'

export const dynamic = 'force-dynamic'

const METRIC_TONE = {
  neutral: 'border-gray-200 bg-white text-gray-900',
  warning: 'border-amber-200 bg-amber-50/60 text-amber-950',
  danger: 'border-rose-200 bg-rose-50/60 text-rose-950',
} as const

const ITEM_TONE = {
  neutral: 'bg-sky-50 text-sky-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
} as const

function eventTime(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Dar_es_Salaam',
  }).format(new Date(iso))
}

function generatedTime(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Dar_es_Salaam',
    timeZoneName: 'short',
  }).format(new Date(iso))
}

export default async function OperationsPage() {
  const permissions = await getCallerPermissions()
  const access = commandCenterAccess(permissions)
  if (!canViewCommandCenter(access)) redirect('/')

  const snapshot = await getOperationsCommandCenter(permissions)

  return (
    <div className="pb-12">
      <OperationsHeading />

      <div className="space-y-7">
        <section
          aria-label="Operations status"
          className="overflow-hidden rounded-3xl border border-gray-200 bg-[linear-gradient(135deg,#17131c_0%,#2f2438_58%,#5f466e_100%)] text-white shadow-[0_22px_60px_-35px_rgba(38,27,43,0.75)]"
        >
          <div className="grid gap-8 px-6 py-7 lg:grid-cols-[minmax(0,1.4fr)_auto] lg:items-end lg:px-8 lg:py-9">
            <div className="max-w-3xl">
              <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.12)]" />
                Live operational picture
              </div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Start with what can disrupt delivery.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                This view references the systems that already own events, tasks,
                bookings, and approvals. Updates happen in those workflows so the
                operating picture cannot drift from the source of truth.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs text-white/65 backdrop-blur-sm">
              <Clock3 className="h-3.5 w-3.5" />
              Generated {generatedTime(snapshot.generatedAt)}
            </div>
          </div>
        </section>

        {snapshot.errorCount > 0 && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {snapshot.errorCount} operational data source
              {snapshot.errorCount === 1 ? '' : 's'} could not be refreshed. Available
              lanes are shown; counts may be incomplete.
            </p>
          </div>
        )}

        <section aria-labelledby="pulse-heading">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                Operational pulse
              </p>
              <h2 id="pulse-heading" className="mt-1 text-lg font-semibold text-gray-950">
                What needs a decision or intervention
              </h2>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {snapshot.metrics.map((metric) => (
              <Link
                key={metric.id}
                href={metric.href}
                className={`group rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${METRIC_TONE[metric.tone]}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold text-current/70">{metric.label}</p>
                  <ArrowRight className="h-3.5 w-3.5 opacity-35 transition group-hover:translate-x-0.5 group-hover:opacity-70" />
                </div>
                <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">
                  {metric.value}
                </p>
                <p className="mt-1 text-[11px] text-current/55">{metric.detail}</p>
              </Link>
            ))}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.8fr)]">
          <section
            aria-labelledby="attention-heading"
            className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_12px_40px_-30px_rgba(15,23,42,0.35)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-5 sm:px-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-500">
                  Attention queue
                </p>
                <h2 id="attention-heading" className="mt-1 text-lg font-semibold text-gray-950">
                  Work at risk
                </h2>
              </div>
              <ShieldAlert className="h-5 w-5 text-gray-300" />
            </div>

            {snapshot.attention.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
                <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <h3 className="font-semibold text-gray-900">No action items in your authorized lanes</h3>
                <p className="mt-1 max-w-sm text-sm leading-6 text-gray-500">
                  New blockers, overdue work, pending decisions, and unanswered booking
                  inquiries will appear here.
                </p>
              </div>
            ) : (
              <ol className="divide-y divide-gray-100">
                {snapshot.attention.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="group grid gap-3 px-5 py-4 transition hover:bg-gray-50/80 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-6"
                    >
                      <span
                        className={`inline-flex w-fit rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${ITEM_TONE[item.tone]}`}
                      >
                        {item.label}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-gray-900">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-gray-500">
                          {item.detail}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 text-xs font-medium text-gray-400">
                        {item.timing}
                        <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5 group-hover:text-gray-700" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}

            {snapshot.access.bookings && snapshot.pendingBookingCount > snapshot.attention.filter((item) => item.kind === 'booking').length && (
              <div className="border-t border-gray-100 bg-gray-50/60 px-6 py-3 text-xs text-gray-500">
                {snapshot.pendingBookingCount} booking inquiries await response.{' '}
                <Link href="/operations/bookings?status=pending" className="font-semibold text-gray-900 hover:underline">
                  Open the full queue
                </Link>
              </div>
            )}
          </section>

          <section
            aria-labelledby="delivery-heading"
            className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_12px_40px_-30px_rgba(15,23,42,0.35)]"
          >
            <div className="border-b border-gray-100 px-5 py-5 sm:px-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-500">
                Delivery horizon
              </p>
              <div className="mt-1 flex items-center justify-between gap-4">
                <h2 id="delivery-heading" className="text-lg font-semibold text-gray-950">
                  Next 7 days
                </h2>
                <CalendarDays className="h-5 w-5 text-gray-300" />
              </div>
            </div>

            {!snapshot.access.events ? (
              <div className="px-6 py-10 text-sm leading-6 text-gray-500">
                Event delivery is hidden because this account does not have OpusPass
                check-in access.
              </div>
            ) : snapshot.upcomingEvents.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
                <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <h3 className="font-semibold text-gray-900">No OpusPass events this week</h3>
                <p className="mt-1 text-sm text-gray-500">The next delivery date will appear here.</p>
              </div>
            ) : (
              <ol className="divide-y divide-gray-100">
                {snapshot.upcomingEvents.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={`/operations/checkin/${event.id}`}
                      className="group block px-5 py-4 transition hover:bg-gray-50/80 sm:px-6"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{event.name}</p>
                          <p className="mt-1 text-xs font-medium text-violet-600">{eventTime(event.startsAt)}</p>
                        </div>
                        <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-700" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          {event.ownerName}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <ClipboardCheck className="h-3.5 w-3.5" />
                          {event.activeAttendants} active attendant{event.activeAttendants === 1 ? '' : 's'}
                        </span>
                        {event.venue && (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            {event.venue}
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
