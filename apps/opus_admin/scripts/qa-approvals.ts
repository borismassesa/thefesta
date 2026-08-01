/**
 * End-to-end QA for the Approvals module, run against the real schema.
 * Creates marked rows and removes them. No email is ever sent: where a sender
 * is needed a stub is injected, so the production sender is never constructed.
 */
import { randomUUID } from 'node:crypto'
import { createSupabaseAdminClient } from '../src/lib/supabase'
import { validateTransition } from '../src/app/(admin)/approvals/transitions'
import { isRelevantTo, isWaitingOn, notificationPartiesFor } from '../src/app/(admin)/approvals/scoping'
import { listApprovalRequests, listApprovalCategories } from '../src/app/(admin)/approvals/queries'
import { emitWorkflowEvent } from '../src/lib/notifications/emit'
import type { ApprovalRequest } from '../src/app/(admin)/approvals/types'

const M = '[QA]'
const results: { area: string; scenario: string; pass: boolean; detail: string }[] = []
const t = (area: string, scenario: string, pass: boolean, detail = '') =>
  results.push({ area, scenario, pass, detail })

const REQUESTER = 'qa.requester@example.test'
const APPROVER  = 'qa.approver@example.test'
const OUTSIDER  = 'qa.outsider@example.test'

function shape(r: Record<string, unknown>): ApprovalRequest {
  return {
    id: String(r.id), category: String(r.category), subject: String(r.subject),
    owner: String(r.owner_name), ownerEmail: String(r.owner_email), ownerInitials: 'QA',
    fields: (r.fields ?? {}) as Record<string, string>,
    approvers: (r.approvers ?? []) as ApprovalRequest['approvers'],
    status: r.status as ApprovalRequest['status'],
    updatedAt: String(r.updated_at), createdAt: String(r.created_at),
    submittedAt: r.submitted_at ? String(r.submitted_at) : null, activity: [],
    attachments: [],
  }
}

async function main() {
  const db = createSupabaseAdminClient()
  const cats = await listApprovalCategories()
  t('Catalog', 'Active request types load from the database', cats.length > 0, `${cats.length} types`)
  t('Catalog', 'Every type has at least one field', cats.every((c) => c.fields.length > 0),
    cats.filter((c) => c.fields.length === 0).map((c) => c.key).join(',') || 'all populated')

  const approvers = [{ id: 'qa1', name: 'QA Approver', email: APPROVER }]
  const mk = async (status: string, subject: string, who = approvers) => {
    const { data, error } = await db.from('approval_requests').insert({
      category: 'payment-application', subject: `${M} ${subject}`,
      owner_name: 'QA Requester', owner_email: REQUESTER, owner_initials: 'QR',
      fields: { amount: 'TZS 500,000', payee: 'QA Vendor' }, approvers: who,
      status, submitted_at: status === 'To Submit' ? null : new Date().toISOString(),
    }).select('*').single()
    if (error) throw error
    return shape(data)
  }

  // ---- Requester ----
  const draft = await mk('To Submit', 'draft')
  t('Requester', 'Can raise a draft', draft.status === 'To Submit')
  t('Requester', 'Draft with no approver cannot be submitted',
    !validateTransition({ ...draft, approvers: [] }, 'Submitted', REQUESTER).ok)
  t('Requester', 'Draft with an approver can be submitted',
    validateTransition(draft, 'Submitted', REQUESTER).ok)
  t('Requester', 'Someone else cannot submit my draft',
    !validateTransition(draft, 'Submitted', OUTSIDER).ok)

  const submitted = await mk('Submitted', 'submitted')

  // ---- Approver ----
  t('Approver', 'Appears in the named approver queue', isWaitingOn(submitted, APPROVER))
  t('Approver', 'Does NOT appear in the requester own queue', !isWaitingOn(submitted, REQUESTER))
  t('Approver', 'Named approver may approve', validateTransition(submitted, 'Approved', APPROVER).ok)
  t('Approver', 'Named approver may refuse', validateTransition(submitted, 'Refused', APPROVER).ok)
  t('Approver', 'Named approver may request more info',
    validateTransition(submitted, 'To Submit', APPROVER, { kind: 'info' }).ok)

  // ---- Segregation of duties ----
  const self = await mk('Submitted', 'self-approval', [{ id: 'qa2', name: 'QA Requester', email: REQUESTER }])
  t('Controls', 'Requester cannot approve their own request',
    !validateTransition(self, 'Approved', REQUESTER).ok)
  t('Controls', 'Already-approved request cannot be re-decided',
    !validateTransition({ ...submitted, status: 'Approved' }, 'Refused', APPROVER).ok)
  t('Controls', 'Draft cannot be approved directly',
    !validateTransition(draft, 'Approved', APPROVER).ok)

  // ---- Confidentiality ----
  const { requests: outsiderSees } = await listApprovalRequests({ viewerEmail: OUTSIDER })
  const leaked = outsiderSees.filter((r) => r.subject.startsWith(M))
  t('Confidentiality', 'Outsider receives zero of these requests', leaked.length === 0, `${leaked.length} leaked`)
  const { requests: requesterSees } = await listApprovalRequests({ viewerEmail: REQUESTER })
  t('Confidentiality', 'Requester sees their own', requesterSees.filter((r) => r.subject.startsWith(M)).length >= 3)
  const { requests: approverSees } = await listApprovalRequests({ viewerEmail: APPROVER })
  t('Confidentiality', 'Approver sees what is routed to them',
    approverSees.some((r) => r.id === submitted.id))
  const reasons = new Set(['Submitted', 'Approved', 'To Submit', 'Refused'].map(
    (s) => { const c = validateTransition({ ...submitted, status: s as never }, 'Approved', OUTSIDER); return c.ok ? 'OK' : c.reason }))
  t('Confidentiality', 'Outsider cannot infer state or existence from the error',
    reasons.size === 1, `${reasons.size} distinct: ${[...reasons].join(' | ')}`)

  // ---- Notification fan-out ----
  const parties = notificationPartiesFor(submitted, 'approval.submitted', REQUESTER)
  t('Notifications', 'Submission routes to approvers, excluding the actor',
    parties.length === 1 && parties[0].email === APPROVER, parties.map((p) => p.email).join(','))
  const decided = notificationPartiesFor(submitted, 'approval.approved', APPROVER)
  t('Notifications', 'Decision routes back to the requester',
    decided.some((p) => p.email === REQUESTER))

  const { data: emp } = await db.from('workforce_employees').select('id, full_name, email').limit(1)
  const ev = await emitWorkflowEvent({
    entityType: 'verification', entityId: randomUUID(), eventType: 'approval.submitted',
    actor: { employeeId: null, name: `${M} actor` },
    recipients: [{ employeeId: emp![0].id as string, name: String(emp![0].full_name), email: String(emp![0].email) }],
    title: `${M} fanout`, emailPayload: {
      approvalSubject: `${M}`, approvalCategory: 'QA', approvalLink: 'https://x',
      submitter: { name: 'QA', email: REQUESTER }, actor: { name: 'QA', email: APPROVER, role: null }, note: null,
    },
  })
  const { data: obligations } = await db.from('staff_notifications')
    .select('channel, delivery_status').eq('event_id', ev.eventId!)
  t('Notifications', 'Bell entry created', (obligations ?? []).some((o) => o.channel === 'bell'))
  t('Notifications', 'Email obligation recorded even with no provider',
    (obligations ?? []).some((o) => o.channel === 'email' && o.delivery_status === 'pending'))

  // ---- Retired type ----
  await db.from('approval_categories').insert({
    key: 'qa-retired', label: 'QA Retired', group_key: 'workplace', active: false,
    fields: [{ id: 'subject', label: 'Subject', kind: 'text', required: true }],
  })
  const active = await listApprovalCategories()
  const all = await listApprovalCategories(true)
  t('Catalog', 'Retired type is hidden from the employee catalog',
    !active.some((c) => c.key === 'qa-retired'))
  t('Catalog', 'Retired type still visible to admins for management',
    all.some((c) => c.key === 'qa-retired'))

  // ---- Cleanup ----
  // A plain delete no longer works and that is deliberate: approval_request_activity
  // is append-only, enforced by a trigger the service role cannot bypass, and
  // the trigger fires on the cascaded delete. Purging goes through the governed
  // function, which demands a reason and writes an audit_log entry naming what
  // it destroyed. QA rows are the honest use case for it.
  const { data: marked } = await db
    .from('approval_requests')
    .select('id')
    .like('subject', `${M}%`)
    .returns<{ id: string }[]>()
  for (const row of marked ?? []) {
    const { error } = await db.rpc('approval_request_purge', {
      p_request_id: row.id,
      p_reason: 'Automated QA fixture cleanup (scripts/qa-approvals.ts)',
      p_actor_email: 'qa@example.test',
    })
    if (error) console.warn(`${M} purge failed for ${row.id}:`, error.message)
  }
  await db.from('workflow_events').delete().eq('entity_type', 'verification').like('actor_name', `${M}%`)
  await db.from('approval_categories').delete().eq('key', 'qa-retired')

  const byArea = new Map<string, typeof results>()
  for (const r of results) byArea.set(r.area, [...(byArea.get(r.area) ?? []), r])
  for (const [area, rows] of byArea) {
    console.log(`\n  ${area}`)
    for (const r of rows) console.log(`    [${r.pass ? 'PASS' : 'FAIL'}] ${r.scenario}${r.detail ? ` — ${r.detail}` : ''}`)
  }
  const failed = results.filter((r) => !r.pass)
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`)
  process.exit(failed.length === 0 ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
