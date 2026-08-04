'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import { hasPermission } from '@/lib/admin-auth'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import { recordSensitiveWorkspaceAction } from '@/lib/workspace/activity'
import { toSafeMessage } from '@/lib/workspace/errors'
import { reportErrorToken, reportMessage } from '@/lib/reports/errors'
import { cleanContent, parseFormDefinition, validateContent, type ReportContent } from '@/lib/reports/fields'
import { blockingFailures, parseRecipientRules, resolveRecipients } from '@/lib/reports/recipients'
import { buildDirectoryContext } from '@/lib/reports/directory'
import type { FieldError } from '@/lib/reports/fields'

// Report server actions.
//
// THE IDENTITY RULE. None of these takes an employee id. It comes from
// requireWorkspaceCapability, which resolves the Clerk session and enforces the
// access state. Every mutation then either belongs to that employee or is
// refused by the database function, which re-checks ownership under a row lock.
//
// THE VERSION RULE. Content reaches storage through the draft, and a filed
// version is cut from the draft by the database. No action writes a version
// directly, which is why "returned reports preserve previous versions" holds
// without any action having to remember to preserve anything.
//
// THE ERROR RULE. The RPCs raise stable dotted tokens; reportMessage maps a
// whitelisted token to text we wrote and collapses everything else.

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; conflict?: boolean; fieldErrors?: FieldError[] }

/**
 * Open (or resume) the report for an obligation.
 *
 * Idempotent: pressing "start" twice returns the same submission rather than
 * creating a second one. The unique index on obligation_id is the backstop.
 */
export async function startReport(obligationId: string): Promise<ActionResult<{ submissionId: string }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'reports.start' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const supabase = createSupabaseAdminClient()

  // The obligation must be this employee's. Scoping the read by employee_id is
  // what stops someone opening a report against another person's obligation.
  const { data: obligation, error } = await supabase
    .from('report_obligations')
    .select('id, template_id, template_version_id, period_start, period_end, period_label, due_date, state')
    .eq('id', obligationId)
    .eq('employee_id', employee.id)
    .maybeSingle<{
      id: string
      template_id: string
      template_version_id: string | null
      period_start: string
      period_end: string
      period_label: string
      due_date: string
      state: string
    }>()
  if (error) {
    logDbError('reports.start.obligation', error, { employeeId: employee.id })
    return { ok: false, error: reportMessage(error) }
  }
  if (!obligation) return { ok: false, error: 'That report is not on your list.' }
  if (obligation.state === 'waived' || obligation.state === 'cancelled') {
    return { ok: false, error: 'That report is no longer required.' }
  }
  if (!obligation.template_version_id) {
    return { ok: false, error: reportMessage({ message: 'report.no_template_version' }) }
  }

  const { data: existing } = await supabase
    .from('report_submissions')
    .select('id')
    .eq('obligation_id', obligationId)
    .maybeSingle<{ id: string }>()
  if (existing) return { ok: true, submissionId: existing.id }

  const { data: created, error: insertError } = await supabase
    .from('report_submissions')
    .insert({
      obligation_id: obligation.id,
      template_id: obligation.template_id,
      template_version_id: obligation.template_version_id,
      employee_id: employee.id,
      period_start: obligation.period_start,
      period_end: obligation.period_end,
      period_label: obligation.period_label,
      due_date: obligation.due_date,
      prepared_by_name: employee.name,
      prepared_by_role: employee.jobTitle,
    })
    .select('id')
    .single<{ id: string }>()

  if (insertError) {
    // Lost a race with another tab: the unique index held, so fetch the winner.
    if ((insertError as { code?: string }).code === '23505') {
      const { data: winner } = await supabase
        .from('report_submissions')
        .select('id')
        .eq('obligation_id', obligationId)
        .maybeSingle<{ id: string }>()
      if (winner) return { ok: true, submissionId: winner.id }
    }
    logDbError('reports.start.insert', insertError, { employeeId: employee.id })
    return { ok: false, error: reportMessage(insertError) }
  }

  revalidatePath('/workspace/reports')
  return { ok: true, submissionId: created.id }
}

/**
 * Autosave.
 *
 * `expectedRevision` is what the client last saw. The database refuses a save
 * that quotes a stale revision, so a second tab cannot silently overwrite work
 * saved from the first. On conflict the caller is told to reload rather than
 * being told the save merely failed.
 */
export async function saveDraft(
  submissionId: string,
  content: ReportContent,
  expectedRevision: number,
): Promise<ActionResult<{ revision: number }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'reports.autosave' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const supabase = createSupabaseAdminClient()

  // Clean against the template definition before storing, so a client cannot
  // smuggle keys the template does not declare into stored content.
  const definition = await loadDefinition(submissionId)
  if (!definition) return { ok: false, error: reportMessage({ message: 'report.no_template_version' }) }

  const cleaned = cleanContent(definition, content)
  // Drafts may be incomplete, but they may not be malformed: a rating of 99
  // must never reach storage, required or not.
  const validation = validateContent(definition, cleaned, { enforceRequired: false })
  if (!validation.ok) {
    return {
      ok: false,
      error: reportMessage({ message: 'report.validation_failed' }),
      fieldErrors: validation.errors,
    }
  }

  const { data, error } = await supabase.rpc('report_save_draft', {
    p_submission_id: submissionId,
    p_employee_id: employee.id,
    p_content: cleaned,
    p_expected_revision: expectedRevision,
  })

  if (error) {
    const token = reportErrorToken(error)
    if (!token) logDbError('reports.autosave', error, { employeeId: employee.id })
    return {
      ok: false,
      error: reportMessage(error),
      conflict: token === 'report.draft_conflict',
    }
  }

  return { ok: true, revision: typeof data === 'number' ? data : expectedRevision + 1 }
}

async function loadDefinition(submissionId: string) {
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('report_submissions')
      .select('template_version_id, report_template_versions(fields)')
      .eq('id', submissionId)
      .maybeSingle<{
        template_version_id: string | null
        report_template_versions: { fields: unknown } | null
      }>()
    if (error || !data?.report_template_versions) {
      if (error) logDbError('reports.definition', error)
      return null
    }
    return parseFormDefinition(data.report_template_versions.fields)
  } catch (error) {
    logDbError('reports.definition', error)
    return null
  }
}

/**
 * File the report.
 *
 * Validation runs with required fields enforced, recipients are resolved from
 * the template version's rules, and then the database mints the version. The
 * content filed is the DRAFT, not anything passed in here, so what is stored is
 * exactly what the author last saw saved.
 */
export async function submitReport(
  submissionId: string,
  options: { emailCopy?: boolean } = {},
): Promise<ActionResult<{ version: number }>> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('tools.use', { action: 'reports.submit' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const supabase = createSupabaseAdminClient()

  const { data: submission, error: loadError } = await supabase
    .from('report_submissions')
    .select('id, employee_id, template_id, template_version_id, draft_content, state')
    .eq('id', submissionId)
    .maybeSingle<{
      id: string
      employee_id: string
      template_id: string
      template_version_id: string | null
      draft_content: ReportContent
      state: string
    }>()
  if (loadError) {
    logDbError('reports.submit.load', loadError, { employeeId: employee.id })
    return { ok: false, error: reportMessage(loadError) }
  }
  if (!submission) return { ok: false, error: reportMessage({ message: 'report.not_found' }) }
  if (submission.employee_id !== employee.id) {
    return { ok: false, error: reportMessage({ message: 'report.not_owner' }) }
  }

  const { data: versionRow } = await supabase
    .from('report_template_versions')
    .select('fields, recipient_rules')
    .eq('id', submission.template_version_id ?? '')
    .maybeSingle<{ fields: unknown; recipient_rules: unknown }>()
  if (!versionRow) return { ok: false, error: reportMessage({ message: 'report.no_template_version' }) }

  const definition = parseFormDefinition(versionRow.fields)
  const validation = validateContent(definition, submission.draft_content ?? {})
  if (!validation.ok) {
    return {
      ok: false,
      error: reportMessage({ message: 'report.validation_failed' }),
      fieldErrors: validation.errors,
    }
  }

  const rules = parseRecipientRules(versionRow.recipient_rules)
  const context = await buildDirectoryContext(employee, rules)
  const resolution = context
    ? resolveRecipients(rules, context)
    : { recipients: [], unresolved: [] }

  // A rule marked required that resolved to nobody blocks the filing. Sending a
  // performance report to an empty list is worse than refusing to send it.
  const blocking = blockingFailures(resolution)
  if (blocking.length > 0) {
    return {
      ok: false,
      error: `${reportMessage({ message: 'report.recipients_unresolved' })} (${blocking[0].reason})`,
    }
  }

  const canEmail = await templateAllowsEmailCopy(submission.template_id)
  const { data, error } = await supabase.rpc('report_file', {
    p_submission_id: submissionId,
    p_employee_id: employee.id,
    p_actor_role: 'owner',
    p_field_snapshot: definition,
    p_recipients: resolution.recipients,
    // An email copy leaves the platform, so it happens only when the template
    // allows it AND the author asked. A client flag alone is not enough.
    p_email_copy: Boolean(options.emailCopy) && canEmail,
    p_prepared_by_name: employee.name,
    p_prepared_by_role: employee.jobTitle,
  })

  if (error) {
    if (!reportErrorToken(error)) logDbError('reports.submit', error, { employeeId: employee.id })
    return { ok: false, error: reportMessage(error) }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: employee.id,
    eventType: 'workspace.report.filed',
    summary: `Filed a report (version ${typeof data === 'number' ? data : 1})`,
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `report_submissions:${submissionId}`,
    metadata: {
      submissionId,
      version: data,
      recipientCount: resolution.recipients.length,
      unresolvedRules: resolution.unresolved.length,
    },
  })

  revalidatePath('/workspace/reports')
  revalidatePath(`/workspace/reports/${submissionId}`)
  return { ok: true, version: typeof data === 'number' ? data : 1 }
}

async function templateAllowsEmailCopy(templateId: string): Promise<boolean> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('report_templates')
      .select('allow_email_copy')
      .eq('id', templateId)
      .maybeSingle<{ allow_email_copy: boolean }>()
    return Boolean(data?.allow_email_copy)
  } catch {
    return false
  }
}

/**
 * A reviewer decision.
 *
 * The actor role is derived here, never taken from the client: being a
 * recipient of THIS submission is what makes someone its reviewer, and holding
 * workforce.write is what makes someone an admin.
 */
export async function reviewReport(
  submissionId: string,
  action: 'start_review' | 'return_for_correction' | 'accept' | 'reopen' | 'waive' | 'cancel',
  note?: string,
): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('workspace.read', { action: `reports.${action}` }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const supabase = createSupabaseAdminClient()
  const { data: submission, error } = await supabase
    .from('report_submissions')
    .select('id, employee_id, recipients')
    .eq('id', submissionId)
    .maybeSingle<{ id: string; employee_id: string; recipients: { employeeId: string }[] | null }>()
  if (error) {
    logDbError('reports.review.load', error, { employeeId: employee.id })
    return { ok: false, error: reportMessage(error) }
  }
  if (!submission) return { ok: false, error: reportMessage({ message: 'report.not_found' }) }

  const isAdmin = await hasPermission('workforce.write')
  const isRecipient = (submission.recipients ?? []).some((r) => r.employeeId === employee.id)
  const isOwner = submission.employee_id === employee.id

  // Not a participant at all: say "not found" rather than confirming the report
  // exists to someone with no business knowing it does.
  if (!isAdmin && !isRecipient && !isOwner) {
    return { ok: false, error: reportMessage({ message: 'report.not_found' }) }
  }

  // Admin outranks reviewer outranks owner. An owner who is also a recipient of
  // their own report (it happens with department rules) must not thereby gain
  // the power to accept it, which is why owner is checked last and the state
  // machine refuses owner-accept anyway.
  const actorRole = isAdmin ? 'admin' : isRecipient ? 'reviewer' : 'owner'

  const { data, error: rpcError } = await supabase.rpc('report_review_action', {
    p_submission_id: submissionId,
    p_action: action,
    p_actor_employee_id: employee.id,
    p_actor_role: actorRole,
    p_actor_clerk_id: employee.clerkUserId,
    p_note: note ?? null,
  })

  if (rpcError) {
    if (!reportErrorToken(rpcError)) {
      logDbError('reports.review', rpcError, { employeeId: employee.id })
    }
    return { ok: false, error: reportMessage(rpcError) }
  }

  void recordSensitiveWorkspaceAction({
    employeeId: submission.employee_id,
    eventType: `workspace.report.${action}`,
    summary: `Report moved to ${typeof data === 'string' ? data : action}`,
    actorEmployeeId: employee.id,
    actorClerkId: employee.clerkUserId,
    targetResource: `report_submissions:${submissionId}`,
    metadata: { action, actorRole, newState: data },
    severity: action === 'waive' || action === 'reopen' ? 'warn' : 'info',
    auditMessage: `${employee.employeeCode} performed ${action} on a report`,
  })

  revalidatePath('/workspace/reports')
  revalidatePath(`/workspace/reports/${submissionId}`)
  return { ok: true }
}

/** Leave a comment, optionally against one field. */
export async function addComment(
  submissionId: string,
  body: string,
  options: { fieldKey?: string | null; internal?: boolean } = {},
): Promise<ActionResult> {
  let employee
  try {
    ;({ employee } = await requireWorkspaceCapability('workspace.read', { action: 'reports.comment' }))
  } catch (error) {
    return { ok: false, error: toSafeMessage(error) }
  }

  const text = body.trim()
  if (text.length === 0) return { ok: false, error: 'Write something first.' }
  if (text.length > 5000) return { ok: false, error: 'Keep comments under 5000 characters.' }

  const supabase = createSupabaseAdminClient()
  const { data: submission } = await supabase
    .from('report_submissions')
    .select('id, employee_id, recipients')
    .eq('id', submissionId)
    .maybeSingle<{ id: string; employee_id: string; recipients: { employeeId: string }[] | null }>()
  if (!submission) return { ok: false, error: reportMessage({ message: 'report.not_found' }) }

  const isAdmin = await hasPermission('workforce.write')
  const isRecipient = (submission.recipients ?? []).some((r) => r.employeeId === employee.id)
  const isOwner = submission.employee_id === employee.id
  if (!isAdmin && !isRecipient && !isOwner) {
    return { ok: false, error: reportMessage({ message: 'report.not_found' }) }
  }

  // Only a reviewer can write a reviewer-only note. An author marking their own
  // comment internal would hide it from the people it is addressed to.
  const internal = Boolean(options.internal) && (isAdmin || isRecipient) && !isOwner

  const { error } = await supabase.from('report_comments').insert({
    submission_id: submissionId,
    field_key: options.fieldKey ?? null,
    author_employee_id: employee.id,
    author_name: employee.name,
    body: text,
    visibility: internal ? 'internal' : 'all',
  })
  if (error) {
    logDbError('reports.comment', error, { employeeId: employee.id })
    return { ok: false, error: reportMessage(error) }
  }

  revalidatePath(`/workspace/reports/${submissionId}`)
  return { ok: true }
}
