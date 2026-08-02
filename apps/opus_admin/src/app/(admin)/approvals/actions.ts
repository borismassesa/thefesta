'use server'

// Server actions for the Approvals module. Requests are persisted in
// Supabase; every mutation gates on approvals access and resolves actor
// identity from the Clerk session rather than trusting the client.
//
// Notifications are published, not sent inline: a transition records a
// workflow_event and hands it to the notification emitter, which decides
// recipients, channels and preferences. Actions return a small
// NotificationOutcome so the UI can say what was dispatched.

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { hasAnyPermission } from '@/lib/admin-auth'
import { isEmailConfigured, sendEmail } from '@/lib/email'
import { emitWorkflowEvent, type NotificationRecipient } from '@/lib/notifications/emit'
import type { PersistedEmailPayload } from '@/lib/notifications/render'
import type { WorkflowEventType } from '@/lib/notifications/types'
import { findApprover } from './data'
import { resolveApprovalActor } from './actor'
import { isOwnedBy, isRelevantTo, notificationPartiesFor } from './scoping'
import { NOT_VISIBLE, validateTransition } from './transitions'
import { getApprovalRequest, listApprovalCategories } from './queries'
import type {
  ApprovalActor,
  ApprovalApprover,
  ApprovalCategoryKey,
  ApprovalRequest,
  ApprovalStatus,
} from './types'
import { logDbError } from '@/lib/log-safe'

// ----- Public action surface -------------------------------------------------

// NOTE: the notifySubmitted / notifyApproved / notifyRefused /
// notifyInfoRequested actions that used to live here were removed. They were
// called from the browser *after* the transition resolved, so closing the tab
// in between meant the approvers were never told, and nothing recorded that a
// notification was owed. Dispatch now happens inside
// transitionApprovalRequest via the notification emitter.

// ----- Persistence (Supabase) -----------------------------------------------
//
// Requests live in `approval_requests` + `approval_request_activity`. Every
// mutation goes through the service role key, so each action first checks the
// caller has approvals access (finance.read OR workforce.read — same gate as
// the /approvals layout). Owner identity and activity authorship are resolved
// from the Clerk session server-side, never trusted from the client.

export type ApprovalActionResult =
  | { ok: true; request: ApprovalRequest; notification?: NotificationOutcome }
  | { ok: false; error: string }

// What the UI needs to tell the user about the notification that went with
// their action. Deliberately small: the full EmitSummary is a server concern.
export type NotificationOutcome = {
  emailsSent: number
  emailsFailed: number
  bellCreated: number
  configured: boolean
  errors: string[]
}

export type CreateApprovalInput = {
  category: ApprovalCategoryKey
  subject: string
  fields: Record<string, string>
  approvers: ApprovalApprover[]
}

export type SaveApprovalInput = {
  subject: string
  fields: Record<string, string>
  approvers: ApprovalApprover[]
}

// The set of valid types is now data, so it is checked against the database
// rather than a constant. The FK on approval_requests.category is the real
// guarantee; this gives a readable error instead of a raw 23503.
async function isValidCategory(key: string): Promise<boolean> {
  const cats = await listApprovalCategories(true)
  return cats.some((c) => c.key === key)
}
const VALID_STATUSES: ReadonlySet<ApprovalStatus> = new Set<ApprovalStatus>([
  'To Submit', 'Submitted', 'Approved', 'Refused',
])

// DISABLE_ADMIN_AUTH runs the admin without Clerk locally, so
// resolveApprovalActor() yields an empty email and every identity check would fail. Skipping the
// transition rules there keeps local dev usable. Hard-gated to non-production
// exactly like isAdminAuthDisabled() in lib/admin-auth, so a leaked env var
// can never disable the approval controls in prod.
function isTransitionAuthorityBypassed(): boolean {
  const bypassed =
    process.env.DISABLE_ADMIN_AUTH === 'true' && process.env.NODE_ENV !== 'production'
  if (bypassed) {
    console.warn('[approvals] transition authority checks skipped (DISABLE_ADMIN_AUTH)')
  }
  return bypassed
}

async function requireApprovalsAccess(): Promise<void> {
  const allowed = await hasAnyPermission(['finance.read', 'workforce.read'])
  if (!allowed) {
    throw new Error("You don't have permission to manage approvals.")
  }
}

// Only accept approvers that exist in the canonical roster, and store the
// roster's name/email/role rather than whatever the client sent — this keeps
// the email notification pipeline pointed at real, vetted inboxes.
function resolveApprovers(input: ApprovalApprover[]): ApprovalApprover[] {
  const seen = new Set<string>()
  const out: ApprovalApprover[] = []
  for (const a of input ?? []) {
    const match = findApprover(a?.id)
    if (!match || seen.has(match.id)) continue
    seen.add(match.id)
    out.push(match)
  }
  return out
}

function sanitizeFields(fields: Record<string, string>): Record<string, string> {
  if (!fields || typeof fields !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string' && v.trim().length > 0) out[k] = v
  }
  return out
}

// What changed on a draft edit, named but never valued. An auditor needs to
// know the amount was altered; putting the old and new amount in the feed
// would copy the request's contents into a second place and widen what a leak
// exposes. Compared by key, so a changed justification and a swapped approver
// list are distinguishable.
function describeChanges(
  before: ApprovalRequest,
  subject: string,
  fields: Record<string, string>,
  approvers: ApprovalApprover[],
): string {
  const changed: string[] = []
  if (before.subject !== subject) changed.push('subject')

  const touched = new Set<string>()
  for (const key of new Set([...Object.keys(before.fields), ...Object.keys(fields)])) {
    if (before.fields[key] !== fields[key]) touched.add(key)
  }
  if (touched.size > 0) changed.push(`fields: ${[...touched].sort().join(', ')}`)

  const ids = (list: ApprovalApprover[]) => list.map((a) => a.id).join('|')
  if (ids(before.approvers) !== ids(approvers)) changed.push('approvers')

  return changed.length > 0 ? changed.join('; ') : 'no visible change'
}

// The audit row and the workflow event describe the same action from two
// sides. Correlating them is what lets an auditor prove the pair is complete
// rather than trusting each in isolation.
function newCorrelationId(): string {
  return randomUUID()
}

// Which structured action a transition represents. The prose in `body` is for
// humans; this is what gets queried.
function actionFor(
  next: ApprovalStatus,
  decisionKind?: 'approve' | 'refuse' | 'info',
): string {
  if (next === 'To Submit') return decisionKind === 'info' ? 'info_requested' : 'reopened'
  if (next === 'Submitted') return 'submitted'
  return next === 'Approved' ? 'approved' : 'refused'
}

function transitionMessage(
  next: ApprovalStatus,
  actorName: string,
  decisionKind?: 'approve' | 'refuse' | 'info',
): string {
  if (next === 'To Submit' && decisionKind === 'info') {
    return `${actorName} requested more information.`
  }
  switch (next) {
    case 'Submitted':
      return `${actorName} submitted this for approval.`
    case 'Approved':
      return `${actorName} approved this request.`
    case 'Refused':
      return `${actorName} refused this request.`
    case 'To Submit':
      return `${actorName} reopened this as a draft.`
  }
}

export async function createApprovalRequest(
  input: CreateApprovalInput,
): Promise<ApprovalActionResult> {
  await requireApprovalsAccess()
  if (!(await isValidCategory(input.category))) {
    return { ok: false, error: 'Unknown approval category.' }
  }
  const subject = input.subject?.trim()
  if (!subject) return { ok: false, error: 'Approval subject is required.' }

  const actor = await resolveApprovalActor()
  const supabase = createSupabaseAdminClient()
  // Request row and its creation audit row commit together. Inserting the
  // request first and appending history afterwards meant a failed audit insert
  // left a request whose own history did not record that it was created.
  const { data, error } = await supabase.rpc('approval_request_create', {
    p_category: input.category,
    p_subject: subject,
    p_owner_name: actor.name,
    p_owner_email: actor.email,
    p_owner_initials: actor.initials,
    p_owner_clerk_id: actor.clerkId,
    p_fields: sanitizeFields(input.fields),
    p_approvers: resolveApprovers(input.approvers),
    p_actor_initials: actor.initials,
    p_actor_color: actor.color,
    p_actor_employee_id: actor.employeeId,
    p_correlation_id: newCorrelationId(),
  })
  if (error || !data) {
    logDbError('approval_request.create', error)
    return { ok: false, error: 'Could not create the request.' }
  }

  const request = await getApprovalRequest(String(data))
  if (!request) return { ok: false, error: 'Created, but could not reload the request.' }
  revalidatePath('/approvals')
  return { ok: true, request }
}

export async function saveApprovalRequest(
  id: string,
  input: SaveApprovalInput,
): Promise<ApprovalActionResult> {
  await requireApprovalsAccess()
  const subject = input.subject?.trim()
  if (!subject) return { ok: false, error: 'Approval subject is required.' }

  // requireApprovalsAccess only proves the caller may open the module. It says
  // nothing about THIS request, so without the checks below anyone holding
  // finance.read could rewrite another person's subject, amounts or approver
  // list by id. Read first, authorize, then write.
  const actor = await resolveApprovalActor()
  const existing = await getApprovalRequest(id)
  // Not-found and not-yours collapse into one answer on purpose.
  if (!existing || !isRelevantTo(existing, actor.email)) {
    return { ok: false, error: NOT_VISIBLE }
  }
  if (!isOwnedBy(existing, actor.email)) {
    return { ok: false, error: 'Only the person who raised a request can edit it.' }
  }
  if (existing.status !== 'To Submit') {
    // Editing after submission would change what approvers are deciding on
    // underneath them. Reopen it first.
    return { ok: false, error: 'A submitted request cannot be edited. Reopen it as a draft first.' }
  }

  const fields = sanitizeFields(input.fields)
  const approvers = resolveApprovers(input.approvers)

  const supabase = createSupabaseAdminClient()
  // A draft edit used to write no audit row at all: subject, amounts and the
  // approver list could all change with nothing recorded. The edit and its
  // audit row now commit together, and the update is guarded on the status we
  // read so a request submitted in between cannot be edited under its
  // approvers.
  const { data, error } = await supabase.rpc('approval_request_save', {
    p_request_id: id,
    p_expected_status: existing.status,
    p_subject: subject,
    p_fields: fields,
    p_approvers: approvers,
    p_changed: describeChanges(existing, subject, fields, approvers),
    p_actor_name: actor.name,
    p_actor_initials: actor.initials,
    p_actor_color: actor.color,
    p_actor_employee_id: actor.employeeId,
    p_actor_auth_id: actor.clerkId,
    p_correlation_id: newCorrelationId(),
  })
  if (error) {
    logDbError('approval_request.save', error, { requestId: id })
    return { ok: false, error: 'Could not save the request.' }
  }
  if (data === 'stale') {
    return {
      ok: false,
      error: 'This request changed while you were editing it. Reload and try again.',
    }
  }

  const request = await getApprovalRequest(id)
  if (!request) return { ok: false, error: 'Request not found.' }
  revalidatePath('/approvals')
  return { ok: true, request }
}

// Maps roster approvers / the submitter onto workforce_employees rows so the
// bell has somewhere to render. Someone on the static roster without an
// employee row still gets email — they just have no in-app inbox.
async function resolveRecipients(
  parties: { name: string; email: string }[],
): Promise<NotificationRecipient[]> {
  const emails = parties.map((p) => p.email.trim().toLowerCase()).filter(Boolean)
  if (emails.length === 0) return []

  const supabase = createSupabaseAdminClient()
  // `.in()` is case-sensitive, so a lowercased needle silently misses an
  // employee stored as `Timothy@Gmail.com`. The miss is invisible: they fall
  // through as employeeId=null and quietly lose their bell notification while
  // still getting email, so nobody notices. Every current row happens to be
  // lowercase; that is luck, not a guarantee. `ilike` matches regardless.
  //
  // Addresses are filtered to a conservative charset first because `or()`
  // takes a comma-separated expression list, and a comma or parenthesis in a
  // value would corrupt the filter rather than fail loudly.
  const safe = emails.filter((e) => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e))
  if (safe.length === 0) return []
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('id, email')
    .or(safe.map((e) => `email.ilike.${e}`).join(','))
    .returns<{ id: string; email: string }[]>()
  if (error) {
    logDbError('workforce_employee.lookup', error)
  }

  const byEmail = new Map((data ?? []).map((e) => [e.email.trim().toLowerCase(), e.id]))
  return parties
    .filter((p) => p.email.trim())
    .map((p) => ({
      employeeId: byEmail.get(p.email.trim().toLowerCase()) ?? null,
      name: p.name,
      email: p.email,
    }))
}

// Absolute link for emails. Server-side, so there is no window to read —
// falls back to the production host rather than emitting a relative link
// that is useless in an inbox.
function approvalsUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_ADMIN_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'https://admin.opusfesta.com'
  return `${base.replace(/\/$/, '')}/approvals`
}

const TRANSITION_EVENT: Partial<Record<ApprovalStatus, WorkflowEventType>> = {
  Submitted: 'approval.submitted',
  Approved: 'approval.approved',
  Refused: 'approval.refused',
}

// Publish the event and fan it out. Runs server-side inside the transition,
// not from the browser: the previous flow fired the email from the client
// after the action resolved, so navigating away mid-request meant the
// approvers were simply never told.
async function notifyTransition(
  request: ApprovalRequest,
  next: ApprovalStatus,
  decision: { kind: 'approve' | 'refuse' | 'info'; note?: string } | undefined,
  actor: ApprovalActor & { clerkId: string | null },
  correlationId: string,
): Promise<NotificationOutcome | undefined> {
  const eventType: WorkflowEventType | undefined =
    decision?.kind === 'info' ? 'approval.info_requested' : TRANSITION_EVENT[next]
  // Reopening to draft notifies nobody — the request is back with its owner,
  // who performed the action.
  if (!eventType) return undefined

  // Read from approval_categories so an admin-created type gets a real label
  // in its notification title rather than its raw key.
  const allCategories = await listApprovalCategories(true)
  const category = allCategories.find((c) => c.key === request.category)
  const categoryLabel = category?.label ?? request.category
  const note = decision?.note?.trim() || null

  // Recipient selection (including dropping the actor, which is what stops a
  // self-approver notifying themselves) lives in scoping.ts alongside the
  // queue predicates, so the two cannot drift apart. See scoping.test.ts.
  const parties = notificationPartiesFor(request, eventType, actor.email)
  const recipients = await resolveRecipients(parties)
  // NO EARLY RETURN ON AN EMPTY RECIPIENT LIST. It used to sit here, which
  // made the workflow_events audit record conditional on there being someone
  // to email: a decision on a request whose owner had no resolvable address
  // was never recorded as an event at all. Whether anyone needs telling is a
  // routing question; whether the decision happened is a fact. emitWorkflowEvent
  // writes the event first and no-ops the fan-out when the list is empty.

  // Resolved through the same lookup so casing is handled identically.
  const [actorRow] = await resolveRecipients([{ name: actor.name, email: actor.email }])
  const actorEmployeeId = actorRow?.employeeId ?? null

  const href = '/approvals?tab=pending'
  const title =
    eventType === 'approval.submitted'
      ? `${categoryLabel} awaiting your approval`
      : eventType === 'approval.approved'
        ? `${categoryLabel} approved`
        : eventType === 'approval.refused'
          ? `${categoryLabel} refused`
          : `More information needed on your ${categoryLabel.toLowerCase()}`

  // One payload, persisted with the event and reused by the retry worker.
  // For a submission the template's "actor" slot is the recipient, which
  // render.ts substitutes per approver.
  const emailPayload: PersistedEmailPayload = {
    approvalSubject: request.subject,
    approvalCategory: categoryLabel,
    approvalLink: approvalsUrl(),
    submitter: { name: request.owner, email: request.ownerEmail },
    actor: { name: actor.name, email: actor.email, role: actor.role ?? null },
    note,
  }

  const configured = isEmailConfigured()
  const summary = await emitWorkflowEvent({
    entityType: 'approval_request',
    entityId: request.id,
    eventType,
    // Was hardcoded null, which left workflow_events.actor_employee_id empty on
    // every event and broke the audit trail's link to a person. The column is
    // nullable for genuinely system-generated events, not for this one.
    actor: { employeeId: actorEmployeeId, name: actor.name },
    recipients,
    title,
    body: request.subject,
    href,
    // correlation_id ties this event to the approval_request_activity row
    // written in the same transaction as the status change, so the two audit
    // surfaces can be reconciled instead of trusted separately.
    metadata: { status: next, category: request.category, note, correlation_id: correlationId },
    // ALWAYS passed, even with no provider configured. The payload is what
    // makes an obligation retryable later — it is persisted with the event so
    // a worker can render byte-identical email in an hour. Gating it on
    // `configured` was what made the whole obligation disappear when Resend
    // was unset, which is precisely when a record is most needed.
    emailPayload,
    sendEmail: configured
      ? async (to, email) => {
          const result = await sendEmail({
            to,
            subject: email.subject,
            text: email.text,
            html: email.html,
          })
          return result.sent
            ? ({ sent: true } as const)
            : ({ sent: false, error: result.error ?? result.reason ?? 'send failed' } as const)
        }
      : undefined,
  })

  return {
    emailsSent: summary.emailsSent,
    emailsFailed: summary.emailsFailed,
    bellCreated: summary.bellCreated,
    configured,
    errors: summary.errors,
  }
}

export async function transitionApprovalRequest(
  id: string,
  next: ApprovalStatus,
  decision?: { kind: 'approve' | 'refuse' | 'info'; note?: string },
): Promise<ApprovalActionResult> {
  await requireApprovalsAccess()
  if (!VALID_STATUSES.has(next)) return { ok: false, error: 'Invalid status.' }

  const actor = await resolveApprovalActor()

  // Read the CURRENT state before deciding anything. requireApprovalsAccess
  // only proves the caller may use the module at all; it says nothing about
  // this request. Without the check below, anyone with finance.read could
  // approve their own request, approve one they were never named on, or
  // re-decide something already settled — the UI hiding the button was the
  // only thing stopping them.
  const before = await getApprovalRequest(id)
  // Same collapse as the other actions: a non-participant probing ids learns
  // nothing, because a real request they cannot see and an invented id return
  // the identical string. validateTransition's specific reasons are only ever
  // shown to someone already established as a participant.
  if (!before || !isRelevantTo(before, actor.email)) {
    return { ok: false, error: NOT_VISIBLE }
  }

  if (!isTransitionAuthorityBypassed()) {
    const check = validateTransition(before, next, actor.email, decision)
    if (!check.ok) return { ok: false, error: check.reason }
  }

  const supabase = createSupabaseAdminClient()
  const correlationId = newCorrelationId()

  // One call, one transaction: the compare-and-swap on the status we
  // validated against, and the audit row, commit or fail together.
  //
  // Previously these were two PostgREST round trips with no transaction
  // between them. The status update committed, insertActivity() logged its own
  // failure and returned void, and the action went on to return ok:true — so
  // an approved request with no history of who approved it was reachable
  // through an ordinary error path. A decision that cannot be attributed is
  // not a decision this module is allowed to record.
  const { data: outcome, error } = await supabase.rpc('approval_request_transition', {
    p_request_id: id,
    p_expected_status: before.status,
    p_next_status: next,
    p_action: actionFor(next, decision?.kind),
    p_body: transitionMessage(next, actor.name, decision?.kind),
    p_note: decision?.note?.trim() || null,
    p_actor_name: actor.name,
    p_actor_initials: actor.initials,
    p_actor_color: actor.color,
    p_actor_employee_id: actor.employeeId,
    p_actor_auth_id: actor.clerkId,
    p_correlation_id: correlationId,
  })
  if (error) {
    // Nothing committed: the function is atomic, so this is a clean failure
    // and the request is still in `before.status`. Safe to retry.
    logDbError('approval_request.transition', error, { requestId: id })
    return { ok: false, error: 'Could not update the request.' }
  }
  if (outcome === 'stale') {
    return {
      ok: false,
      error: 'This request changed while you were viewing it. Reload and try again.',
    }
  }

  const request = await getApprovalRequest(id)
  if (!request) return { ok: false, error: 'Request not found.' }

  // Fan-out happens after the state change has committed. A notification
  // failure is reported, never rolled back — the decision stands.
  const notification = await notifyTransition(request, next, decision, actor, correlationId)

  revalidatePath('/approvals')
  return { ok: true, request, notification }
}

export async function addApprovalNote(
  id: string,
  body: string,
): Promise<ApprovalActionResult> {
  await requireApprovalsAccess()
  const trimmed = body?.trim()
  if (!trimmed) return { ok: false, error: 'Note is empty.' }

  // A note is visible to everyone on the request, so writing one is a
  // participant action, not a "has module access" action.
  const actor = await resolveApprovalActor()
  const existing = await getApprovalRequest(id)
  if (!existing || !isRelevantTo(existing, actor.email)) {
    return { ok: false, error: NOT_VISIBLE }
  }

  // The note and the updated_at touch go together. Previously the note insert
  // could fail silently while the touch succeeded, resurfacing a request at
  // the top of the feed with nothing new on it to read.
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.rpc('approval_request_note', {
    p_request_id: id,
    p_body: trimmed,
    p_actor_name: actor.name,
    p_actor_initials: actor.initials,
    p_actor_color: actor.color,
    p_actor_employee_id: actor.employeeId,
    p_actor_auth_id: actor.clerkId,
    p_correlation_id: newCorrelationId(),
  })
  if (error) {
    logDbError('approval_request.note', error, { requestId: id })
    return { ok: false, error: 'Could not add the note.' }
  }

  const request = await getApprovalRequest(id)
  if (!request) return { ok: false, error: 'Request not found.' }
  revalidatePath('/approvals')
  return { ok: true, request }
}
