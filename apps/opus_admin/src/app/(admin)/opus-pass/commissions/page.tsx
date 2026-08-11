import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  Clock,
  Layers,
  PauseCircle,
  UserCheck,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAdminAccessRole, hasPermission, isAdminDashboardRole } from '@/lib/admin-auth'
import { Kpi, Detail } from '../../finance/_components/primitives'
import { formatDate } from '../../finance/_components/format'
import DigitalCardsNavTabs from '../digital-cards/DigitalCardsNavTabs'
import SetDigitalCardsHeading from '../digital-cards/SetDigitalCardsHeading'
import CustomCardStudioTabs from './CustomCardStudioTabs'
import { assignCommission } from './actions'
import {
  ACCEPT_SLA_HOURS,
  QUEUE_STATUS_LABEL,
  getCapacity,
  getCommissionQueue,
  getDesignerLoad,
  summariseQueue,
  type QueueTask,
} from './queries'

export const dynamic = 'force-dynamic'

/**
 * The Ops work queue for the Custom Card Studio.
 * Specs: OP-CCS-PRD-001 §7.4 (solves P2).
 *
 * Navigated as the bespoke fulfilment path INSIDE Digital Cards, so it carries
 * that section's heading and tabs. The route is unchanged; only the navigation
 * moved. The database, the status enum and the money ledger stay entirely
 * separate from the catalogue path — consolidating the IA does not merge them.
 *
 * P2 was "how do we know this work is assigned to a given designer" — the
 * answer is this page rather than an email thread. It reads top-down as "what
 * needs a human right now": unassigned first, then whatever is closest to
 * breaching its promise.
 *
 * The capacity banner is not decoration. There is no freelance pool, so demand
 * above headcount has only three answers (longer quoted SLA, waitlist, or
 * higher peak pricing) and all three have to be decided BEFORE checkout keeps
 * taking orders — a missed SLA is a full refund on work already paid for in
 * salary.
 */
export default async function CommissionQueuePage(props: {
  searchParams: Promise<{ done?: string; error?: string }>
}) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/sign-in')
  if (!(await hasPermission('commissions.read'))) redirect('/')
  const canManage = await hasPermission('commissions.manage')

  const searchParams = await props.searchParams
  const [tasks, capacity, designers] = await Promise.all([
    getCommissionQueue(),
    getCapacity(),
    getDesignerLoad(),
  ])
  const summary = summariseQueue(tasks)

  const pressureTone =
    capacity.pressure >= 1 ? 'alert' : capacity.pressure >= 0.7 ? 'warn' : 'ok'

  return (
    <>
      <SetDigitalCardsHeading />
      <DigitalCardsNavTabs />
      <CustomCardStudioTabs />
      <div className="space-y-6 px-8 pt-6 pb-6">
      {/* No <h1> here any more: "Digital Cards" is the page heading in the
          shared header, and the tab bars above say which part of it this is.
          The sentence stays, because "what am I looking at" still needs
          answering once the title stops doing it. */}
      <p className="max-w-2xl text-sm text-gray-600">
        Every bespoke card in production, with who is holding it and how long is left. Unassigned
        work sorts first, then whatever is closest to missing its first-draft promise.
      </p>

      {searchParams.done && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {searchParams.done}
        </p>
      )}
      {searchParams.error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {searchParams.error}
        </p>
      )}

      {pressureTone !== 'ok' && (
        <div
          className={cn(
            'rounded-xl border px-4 py-3 text-sm',
            pressureTone === 'alert'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-amber-200 bg-amber-50 text-amber-800',
          )}
        >
          <strong className="font-semibold">
            {pressureTone === 'alert' ? 'The studio is over capacity. ' : 'The studio is filling up. '}
          </strong>
          {capacity.queuedCount} queued against {capacity.freeCapacity} free slots. There is no
          freelance overflow — either extend the SLA quoted at checkout, open a waitlist, or close
          the package. Accepting orders the studio cannot deliver turns into full refunds under the
          fault policy.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="In production" value={String(summary.total)} icon={<Layers size={16} />} />
        <Kpi label="Unassigned" value={String(summary.unassigned)} icon={<Users size={16} />} />
        <Kpi label="Awaiting accept" value={String(summary.awaitingAccept)} icon={<UserCheck size={16} />} />
        <Kpi label="Overdue" value={String(summary.overdue)} icon={<AlertTriangle size={16} />} />
        <Kpi label="Free capacity" value={String(capacity.freeCapacity)} icon={<Clock size={16} />} />
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Designer load</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {designers.length === 0 && (
            <p className="text-sm text-gray-500">
              No designer profiles yet. Add them before opening the packages for sale — an order
              with nobody to assign it to sits queued and burns its SLA.
            </p>
          )}
          {designers.map((d) => {
            const full = d.openTasks >= d.capacity
            const unavailable = !d.active || (d.onLeaveUntil && new Date(d.onLeaveUntil) >= new Date())
            return (
              <div
                key={d.employeeId}
                className={cn(
                  'rounded-xl border p-3',
                  unavailable ? 'border-gray-200 bg-gray-50 opacity-60' : full ? 'border-amber-200 bg-amber-50' : 'border-gray-100',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">{d.displayName}</p>
                  <span className="text-xs text-gray-500">{d.grade.replace(/_/g, ' ')}</span>
                </div>
                <p className="mt-1 text-xs text-gray-600">
                  {d.openTasks} of {d.capacity} slots used
                  {unavailable ? ' · unavailable' : full ? ' · at capacity' : ''}
                </p>
                <p className="mt-1 text-[11px] text-gray-500">
                  {d.categories.length ? d.categories.join(', ') : 'no categories set'}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-gray-900">Nothing in production</p>
          <p className="mt-1 text-sm text-gray-600">
            Orders appear here once the deposit is verified and the brief is complete.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskRow key={task.orderId} task={task} canManage={canManage} designers={designers} />
          ))}
        </div>
      )}
      </div>
    </>
  )
}

function slaLabel(task: QueueTask): { text: string; tone: 'ok' | 'warn' | 'bad' | 'muted' } {
  if (task.slaPaused) return { text: 'Clock paused — waiting on the customer', tone: 'muted' }
  if (task.hoursToDeadline === null) return { text: 'Not on the clock', tone: 'muted' }
  const h = task.hoursToDeadline
  if (h < 0) return { text: `${Math.abs(Math.round(h))}h overdue`, tone: 'bad' }
  if (h <= 6) return { text: `${Math.round(h)}h left`, tone: 'warn' }
  return { text: `${Math.round(h)}h left`, tone: 'ok' }
}

function TaskRow({
  task,
  canManage,
  designers,
}: {
  task: QueueTask
  canManage: boolean
  designers: { employeeId: string; displayName: string; openTasks: number; capacity: number; active: boolean }[]
}) {
  const sla = slaLabel(task)
  const acceptOverdue = task.hoursToAccept !== null && task.hoursToAccept < 0

  return (
    <details className="group rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4">
        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-700">
          {QUEUE_STATUS_LABEL[task.status]}
        </span>
        <span className="font-mono text-sm font-semibold text-gray-900">{task.orderNo}</span>
        <span className="text-sm text-gray-700">{task.eventName ?? task.buyerName}</span>
        <span className="text-xs text-gray-500">{task.packageId} · {task.categoryId}</span>
        <span className="text-sm text-gray-700">
          {task.designerName ?? <span className="font-semibold text-amber-700">Unassigned</span>}
        </span>
        <span
          className={cn(
            'text-xs font-semibold',
            sla.tone === 'bad' ? 'text-rose-600'
              : sla.tone === 'warn' ? 'text-amber-700'
                : sla.tone === 'muted' ? 'text-gray-400' : 'text-gray-500',
          )}
        >
          {sla.text}
        </span>
        {acceptOverdue && (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
            <AlertTriangle size={12} />
            Not accepted in {ACCEPT_SLA_HOURS}h
          </span>
        )}
        {task.openClarifications > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
            <PauseCircle size={12} />
            {task.openClarifications} open question{task.openClarifications === 1 ? '' : 's'}
          </span>
        )}
      </summary>

      <div className="space-y-4 border-t border-gray-100 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Detail icon={<Users size={14} />} label="Designer" value={task.designerName ?? 'Unassigned'}
            meta={task.assignBounces > 0 ? `${task.assignBounces} bounce${task.assignBounces === 1 ? '' : 's'}` : undefined} />
          <Detail icon={<Clock size={14} />} label="First draft due"
            value={task.slaDueAt ? formatDate(task.slaDueAt) : 'Not started'}
            meta={task.slaPaused ? 'paused' : undefined} />
          <Detail icon={<Layers size={14} />} label="Versions" value={String(task.versionCount)}
            meta={task.revisionsRemaining === null ? 'unlimited revisions' : `${task.revisionsRemaining} revisions left`} />
          <Detail icon={<UserCheck size={14} />} label="Event"
            value={task.eventName ?? '—'}
            meta={task.eventDate ?? 'no date given'} />
        </div>

        {canManage && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
            <form action={assign} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="orderId" value={task.orderId} />
              <label className="text-xs font-medium text-gray-700">
                Assign to
                <select
                  name="designerId"
                  defaultValue=""
                  className="mt-1 block rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="">Best available (auto)</option>
                  {designers.map((d) => (
                    <option key={d.employeeId} value={d.employeeId} disabled={!d.active}>
                      {d.displayName} ({d.openTasks}/{d.capacity})
                    </option>
                  ))}
                </select>
              </label>
              <button data-opus-button="primary" data-opus-button-size="medium"
                type="submit"
                className="rounded-lg bg-[#4A2D5C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3b2449]"
              >
                {task.designerName ? 'Reassign' : 'Assign'}
              </button>
            </form>
            <p className="text-xs text-gray-500">
              Reassignment preserves every version, note and timeline entry — the new designer sees
              the whole history.
            </p>
          </div>
        )}

        <Link
          href={`/opus-pass/commissions/${task.orderId}`}
          className="inline-block text-sm font-semibold text-[#4A2D5C] underline"
        >
          Open the full task
        </Link>
      </div>
    </details>
  )
}

async function assign(formData: FormData): Promise<void> {
  'use server'
  const result = await assignCommission(formData)
  redirect(
    `/opus-pass/commissions?${result.ok ? 'done' : 'error'}=${encodeURIComponent(result.message)}`,
  )
}
