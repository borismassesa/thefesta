import { notFound, redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { CARD_ORDER_STATUS_LABELS, type CardOrderStatus } from '@opusfesta/lib'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getAdminAccessRole, hasPermission, isAdminDashboardRole } from '@/lib/admin-auth'
import { formatDate } from '../../../finance/_components/format'
import {
  acceptCommission,
  askCommissionClarification,
  reviewCommissionVersion,
  uploadCommissionVersion,
} from '../actions'
import { getDesignerBrief, getMyDesignerProfile } from '../queries'

export const dynamic = 'force-dynamic'

/**
 * One commission task, as the designer and the QA reviewer see it.
 * Specs: OP-CCS-PRD-001 §7.4, §7.6; loophole L5.
 *
 * What is deliberately NOT on this page: the buyer's phone number, their email,
 * and the guest list. A designer gets the brief, the category and the event's
 * display name. Designers being employees rather than external vendors changes
 * the remedy if that boundary is crossed, not the boundary itself.
 */

type VersionRow = {
  id: string
  version_no: number
  submitted_at: string
  qa_passed_at: string | null
  qa_note: string | null
  preview_path: string
  validator_report: { findings?: { severity: string; code: string; message: string }[] } | null
}

export default async function CommissionTaskPage(props: {
  params: Promise<{ orderId: string }>
  searchParams: Promise<{ done?: string; error?: string }>
}) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/sign-in')
  if (!(await hasPermission('commissions.read'))) redirect('/')

  const { orderId } = await props.params
  const searchParams = await props.searchParams
  const [canManage, canDesign] = await Promise.all([
    hasPermission('commissions.manage'),
    hasPermission('commissions.design'),
  ])

  const supabase = createSupabaseAdminClient()
  const { data: order } = await supabase
    .from('card_orders')
    .select('id, order_no, status, assigned_designer_id, sla_due_at, sla_paused_at, revisions_remaining, package_id, category_id')
    .eq('id', orderId)
    .maybeSingle<{
      id: string
      order_no: string
      status: CardOrderStatus
      assigned_designer_id: string | null
      sla_due_at: string | null
      sla_paused_at: string | null
      revisions_remaining: number | null
      package_id: string
      category_id: string
    }>()
  if (!order) notFound()

  const { userId: clerkId } = await auth()
  const me = clerkId ? await getMyDesignerProfile(clerkId) : null
  const isMine = me?.employeeId === order.assigned_designer_id

  // A designer with no management permission may only open their OWN task.
  if (!canManage && !isMine) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center">
        <p className="text-sm font-semibold text-gray-900">This task is not assigned to you</p>
        <p className="mt-1 text-sm text-gray-600">Designers can only open their own work.</p>
      </div>
    )
  }

  const [brief, { data: versions }, { data: clarifications }] = await Promise.all([
    getDesignerBrief(order.id),
    supabase
      .from('design_versions')
      .select('id, version_no, submitted_at, qa_passed_at, qa_note, preview_path, validator_report')
      .eq('order_id', order.id)
      .order('version_no', { ascending: false })
      .returns<VersionRow[]>(),
    supabase
      .from('brief_clarifications')
      .select('id, question, answer, asked_at, answered_at')
      .eq('order_id', order.id)
      .order('asked_at', { ascending: false })
      .returns<{ id: string; question: string; answer: string | null; asked_at: string; answered_at: string | null }[]>(),
  ])

  const latest = versions?.[0]
  const awaitingQa = order.status === 'internal_qa' && latest && !latest.qa_passed_at

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-xs uppercase tracking-widest text-[#C9A961]">{order.order_no}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
          {brief?.eventName ?? 'Custom card'}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {CARD_ORDER_STATUS_LABELS[order.status].en} · {order.package_id} · {order.category_id}
          {order.sla_paused_at && ' · clock paused'}
          {order.sla_due_at && !order.sla_paused_at && ` · due ${formatDate(order.sla_due_at)}`}
        </p>
      </header>

      {searchParams.done && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{searchParams.done}</p>
      )}
      {searchParams.error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{searchParams.error}</p>
      )}

      <section className="rounded-2xl border border-gray-100 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">The brief</h2>
        <p className="mt-1 text-xs text-gray-500">
          What the customer told us. Contact details and the guest list are deliberately not shown.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {Object.entries(brief?.answers ?? {}).map(([key, value]) => (
            <div key={key} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
              <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {key.replace(/_/g, ' ')}
              </dt>
              <dd className="mt-1 break-words text-sm text-gray-900">{String(value)}</dd>
            </div>
          ))}
          {Object.keys(brief?.answers ?? {}).length === 0 && (
            <p className="text-sm text-gray-500">The customer has not filled in the brief yet.</p>
          )}
        </dl>
        {(brief?.attachments.length ?? 0) > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            {brief?.attachments.length} reference file(s) attached.
          </p>
        )}
      </section>

      {canDesign && isMine && order.status === 'assigned' && (
        <form action={accept} className="rounded-2xl border border-gray-100 bg-white p-5">
          <input type="hidden" name="orderId" value={order.id} />
          <h2 className="text-sm font-semibold text-gray-900">Accept this task</h2>
          <p className="mt-1 text-xs text-gray-500">
            Accepting starts your first-draft clock. If nobody accepts within two hours the task
            returns to the queue.
          </p>
          <button data-opus-button="primary" data-opus-button-size="medium" type="submit" className="mt-3 rounded-lg bg-[#4A2D5C] px-4 py-2 text-sm font-semibold text-white">
            Accept
          </button>
        </form>
      )}

      {canDesign && isMine && ['in_design', 'revision_requested'].includes(order.status) && (
        <>
          <form action={upload} encType="multipart/form-data" className="rounded-2xl border border-gray-100 bg-white p-5">
            <input type="hidden" name="orderId" value={order.id} />
            <h2 className="text-sm font-semibold text-gray-900">Submit a version</h2>
            <p className="mt-1 text-xs text-gray-500">
              The validator runs before anything is stored. A file that fails is not saved and the
              order does not move — your clock keeps running, so fix and resubmit.
            </p>
            <input
              type="file"
              name="svg"
              accept="image/svg+xml,.svg"
              required
              className="mt-3 block w-full text-sm"
            />
            <button data-opus-button="primary" data-opus-button-size="medium" type="submit" className="mt-3 rounded-lg bg-[#4A2D5C] px-4 py-2 text-sm font-semibold text-white">
              Run validator and submit
            </button>
          </form>

          <form action={clarify} className="rounded-2xl border border-gray-100 bg-white p-5">
            <input type="hidden" name="orderId" value={order.id} />
            <h2 className="text-sm font-semibold text-gray-900">Ask the customer something</h2>
            <p className="mt-1 text-xs text-gray-500">
              This pauses your SLA clock until they answer, so you are never measured against time
              you spent waiting.
            </p>
            <input
              name="question"
              required
              minLength={5}
              placeholder="e.g. Which spelling of the surname should we use?"
              className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <button data-opus-button="neutral" data-opus-button-size="medium" type="submit" className="mt-3 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700">
              Send question
            </button>
          </form>
        </>
      )}

      {(clarifications?.length ?? 0) > 0 && (
        <section className="rounded-2xl border border-gray-100 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">Questions</h2>
          <ul className="mt-3 space-y-3">
            {clarifications?.map((c) => (
              <li key={c.id} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <p className="text-sm text-gray-900">{c.question}</p>
                <p className="mt-1 text-xs text-gray-500">{formatDate(c.asked_at)}</p>
                {c.answer ? (
                  <p className="mt-2 border-l-2 border-[#C9A0DC] pl-3 text-sm text-gray-700">{c.answer}</p>
                ) : (
                  <p className="mt-2 text-xs font-semibold text-amber-700">Awaiting an answer — clock paused</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-gray-100 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Versions</h2>
        {(versions?.length ?? 0) === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Nothing submitted yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {versions?.map((v) => {
              const warnings = (v.validator_report?.findings ?? []).filter((f) => f.severity === 'warning')
              return (
                <li key={v.id} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-gray-900">v{v.version_no}</span>
                    <span className="text-xs text-gray-500">{formatDate(v.submitted_at)}</span>
                    {v.qa_passed_at ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        Passed QA
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                        Awaiting QA
                      </span>
                    )}
                  </div>
                  {warnings.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {warnings.map((w, i) => (
                        <li key={i} className="text-xs text-amber-700">{w.message}</li>
                      ))}
                    </ul>
                  )}
                  {v.qa_note && <p className="mt-2 text-xs text-gray-600">QA note: {v.qa_note}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {canManage && awaitingQa && latest && (
        <section className="rounded-2xl border border-gray-100 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">Internal QA</h2>
          <p className="mt-1 text-xs text-gray-500">
            A real gate: passing releases a watermarked preview to the customer. Nothing full
            resolution leaves until the balance is settled.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <form action={qa} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="versionId" value={latest.id} />
              <input type="hidden" name="decision" value="pass" />
              <label className="block text-xs font-medium text-gray-700">
                Note (optional)
                <input name="note" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </label>
              <button data-opus-button="primary" data-opus-button-size="medium" type="submit" className="mt-3 w-full rounded-lg bg-[#4A2D5C] px-4 py-2 text-sm font-semibold text-white">
                Pass QA
              </button>
            </form>
            <form action={qa} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="versionId" value={latest.id} />
              <input type="hidden" name="decision" value="fail" />
              <label className="block text-xs font-medium text-gray-700">
                What needs changing (required)
                <input name="note" required minLength={3} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </label>
              <button data-opus-button="danger" data-opus-button-size="medium" type="submit" className="mt-3 w-full rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700">
                Send back to the designer
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  )
}

async function accept(formData: FormData): Promise<void> {
  'use server'
  const r = await acceptCommission(formData)
  redirect(`/opus-pass/commissions/${formData.get('orderId')}?${r.ok ? 'done' : 'error'}=${encodeURIComponent(r.message)}`)
}
async function upload(formData: FormData): Promise<void> {
  'use server'
  const r = await uploadCommissionVersion(formData)
  redirect(`/opus-pass/commissions/${formData.get('orderId')}?${r.ok ? 'done' : 'error'}=${encodeURIComponent(r.message)}`)
}
async function qa(formData: FormData): Promise<void> {
  'use server'
  const r = await reviewCommissionVersion(formData)
  redirect(`/opus-pass/commissions/${formData.get('orderId')}?${r.ok ? 'done' : 'error'}=${encodeURIComponent(r.message)}`)
}
async function clarify(formData: FormData): Promise<void> {
  'use server'
  const r = await askCommissionClarification(formData)
  redirect(`/opus-pass/commissions/${formData.get('orderId')}?${r.ok ? 'done' : 'error'}=${encodeURIComponent(r.message)}`)
}
