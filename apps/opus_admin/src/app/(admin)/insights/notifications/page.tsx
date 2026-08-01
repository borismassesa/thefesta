import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, MailWarning, XOctagon } from 'lucide-react'
import { requirePermission } from '@/lib/admin-auth'
import { emailDeliveryBacklog } from '@/lib/notifications/queries'
import NotificationHealthHeading from './NotificationHealthHeading'

export const dynamic = 'force-dynamic'

// Notification delivery health.
//
// WHY THIS EXISTS
// The staff-notification subsystem was built so a message is an *obligation*:
// a failed send lands in `failed` with a next_attempt_at, an unconfigured
// provider lands in `pending`, and the retry worker drains the queue. Both
// halves existed. Neither was visible.
//
// emailDeliveryBacklog() has been in the codebase since the subsystem landed
// with no consumer at all — the same shape as claim_notification_emails(),
// which sat unused until the retry worker was written. Instrumentation nobody
// reads is not monitoring, and "notification retry failures" is a named
// operational gate for the Approvals pilot. This is the surface that closes it.
//
// Deliberately counts-and-timestamps only. staff_notifications carries the
// title and body of every approval notification, which is participant-scoped
// data; an ops health view must not become a way to read it. Nobody's subject
// line, address or decision note appears here.

const AGEING_HOURS = 1

function hoursSince(iso: string, now: number): number {
  return (now - new Date(iso).getTime()) / 3_600_000
}

export default async function NotificationHealthPage() {
  await requirePermission('insights.read')
  const backlog = await emailDeliveryBacklog()
  // Stamped by the read, not by render: see EmailBacklog.fetchedAt.
  const now = backlog.fetchedAt

  const stuckHours = backlog.oldestPendingAt ? hoursSince(backlog.oldestPendingAt, now) : 0
  // The retry worker runs every 10 minutes, so anything queued for over an
  // hour means the worker is not running, cannot authenticate, or the provider
  // has been down long enough to need a human.
  const workerLooksDown = stuckHours >= AGEING_HOURS
  const providerUnconfigured = backlog.awaitingProvider > 0
  const healthy =
    !workerLooksDown && backlog.failed === 0 && backlog.abandoned === 0 && !providerUnconfigured

  return (
    <div className="p-6 space-y-6">
      <NotificationHealthHeading />

      {healthy ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-emerald-900">Delivery is healthy</p>
            <p className="mt-0.5 text-sm text-emerald-800">
              Nothing is queued, failed or abandoned.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {providerUnconfigured && (
            <Banner
              tone="amber"
              icon={<MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />}
              title={`${backlog.awaitingProvider} notification${backlog.awaitingProvider === 1 ? '' : 's'} recorded with no email provider`}
              body="RESEND_API_KEY is not configured, so these were never attempted. They stay retryable: set the key and the worker will send them on its next run."
            />
          )}
          {workerLooksDown && (
            <Banner
              tone="rose"
              icon={<AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden />}
              title={`Oldest queued message is ${Math.floor(stuckHours)}h old`}
              body="The retry worker runs every 10 minutes, so this usually means it is not running or cannot authenticate. Check that NOTIFICATION_RETRY_CRON_SECRET matches app.settings.notification_retry_secret — a mismatch returns 401 silently."
            />
          )}
          {backlog.abandoned > 0 && (
            <Banner
              tone="rose"
              icon={<XOctagon className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden />}
              title={`${backlog.abandoned} message${backlog.abandoned === 1 ? '' : 's'} abandoned`}
              body="These exhausted their retry budget or could not be rendered. They will never be retried automatically, and somebody was not told something. Investigate before clearing."
            />
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Queued" value={backlog.pending} hint="Recorded, not yet sent" />
        <Stat
          label="Awaiting provider"
          value={backlog.awaitingProvider}
          hint="No email key configured"
        />
        <Stat label="Failed" value={backlog.failed} hint="Will be retried" />
        <Stat
          label="Abandoned"
          value={backlog.abandoned}
          hint="Terminal — needs a human"
          alarming={backlog.abandoned > 0}
        />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Oldest queued message
        </h2>
        <p className="mt-2 flex items-center gap-2 text-sm text-gray-900">
          <Clock className="h-4 w-4 text-gray-400" aria-hidden />
          {backlog.oldestPendingAt ? (
            <>
              {new Date(backlog.oldestPendingAt).toLocaleString('en-GB', {
                timeZone: 'Africa/Dar_es_Salaam',
              })}
              <span className="text-gray-500">
                ({Math.floor(stuckHours)}h ago)
              </span>
            </>
          ) : (
            <span className="text-gray-500">Nothing queued.</span>
          )}
        </p>
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          Counts only. Recipients, subjects and message bodies are deliberately
          not shown here: approval notifications are visible to their
          participants, and an operations view must not become a way around
          that. See{' '}
          <Link href="/insights/audit" className="underline underline-offset-2">
            the audit log
          </Link>{' '}
          for attributable decision history.
        </p>
      </section>
    </div>
  )
}

function Banner({
  tone,
  icon,
  title,
  body,
}: {
  tone: 'amber' | 'rose'
  icon: React.ReactNode
  title: string
  body: string
}) {
  const palette =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-rose-200 bg-rose-50 text-rose-900'
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 ${palette}`}>
      {icon}
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-sm opacity-90">{body}</p>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  alarming,
}: {
  label: string
  value: number
  hint: string
  alarming?: boolean
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          alarming ? 'text-rose-600' : 'text-gray-900'
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-gray-500">{hint}</p>
    </div>
  )
}
