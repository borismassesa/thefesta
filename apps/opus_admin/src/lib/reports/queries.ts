import 'server-only'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import type { WorkspaceEmployee } from '@/lib/workspace/identity'
import { parseFormDefinition, type ReportContent, type ReportFormDefinition } from './fields'
import { parseRecipientRules, type RecipientRule } from './recipients'
import { obligationStatus, type ObligationStatus, type ReportCadence } from './periods'
import type { ReportState } from './state'

// Report reads, all scoped to one employee.
//
// Same rule as the rest of Workspace: every function takes the resolved
// WorkspaceEmployee, never an id, so no route can read another person's reports
// by editing a payload. These tables hold salaries, client names and
// performance notes, and RLS is off (service-role client), so the scoping in
// these signatures IS the access control.
//
// The one function that reads somebody else's report is getSubmissionForReview,
// and it proves the caller is a named recipient before returning anything.

const DEFAULT_TZ = 'Africa/Dar_es_Salaam'

export type ReportTemplateSummary = {
  id: string
  slug: string
  name: string
  description: string | null
  cadence: ReportCadence | 'ad_hoc'
  scope: string
  requiresReview: boolean
  allowEmailCopy: boolean
  dueOffsetDays: number
  graceDays: number
  activeVersionId: string | null
}

export type ReportObligation = {
  id: string
  templateId: string
  templateName: string
  cadence: ReportCadence | 'ad_hoc'
  periodStart: string
  periodEnd: string
  periodLabel: string
  dueDate: string
  state: 'open' | 'submitted' | 'accepted' | 'overdue' | 'waived' | 'cancelled'
  status: ObligationStatus
  graceDays: number
  submissionId: string | null
  submissionState: ReportState | null
}

export type ReportSubmissionSummary = {
  id: string
  templateId: string
  templateName: string
  employeeId: string
  employeeName: string | null
  periodStart: string
  periodEnd: string
  periodLabel: string
  state: ReportState
  currentVersion: number
  submittedAt: string | null
  acceptedAt: string | null
  dueDate: string | null
  returnedCount: number
  draftUpdatedAt: string | null
}

export type ReportVersion = {
  id: string
  version: number
  content: ReportContent
  fieldSnapshot: ReportFormDefinition
  reason: string
  createdAt: string
  authorEmployeeId: string | null
}

export type ReportReviewEntry = {
  id: string
  action: string
  fromState: string
  toState: string
  note: string | null
  createdAt: string
  reviewerName: string | null
}

export type ReportComment = {
  id: string
  body: string
  authorName: string
  fieldKey: string | null
  visibility: 'all' | 'internal'
  createdAt: string
}

export type ReportAttachment = {
  id: string
  fileName: string
  storagePath: string
  mimeType: string | null
  sizeBytes: number | null
  fieldKey: string | null
  createdAt: string
}

export type ReportDetail = {
  submission: ReportSubmissionSummary
  definition: ReportFormDefinition
  recipientRules: RecipientRule[]
  draftContent: ReportContent
  draftRevision: number
  versions: ReportVersion[]
  reviews: ReportReviewEntry[]
  comments: ReportComment[]
  attachments: ReportAttachment[]
  template: ReportTemplateSummary | null
  /** True when the reader is the author. Reviewers see internal comments. */
  isOwner: boolean
}

const TEMPLATE_COLUMNS =
  'id, slug, name, description, cadence, scope, requires_review, allow_email_copy, due_offset_days, grace_days, active_version_id'

type TemplateRow = {
  id: string
  slug: string
  name: string
  description: string | null
  cadence: ReportCadence | 'ad_hoc'
  scope: string
  requires_review: boolean
  allow_email_copy: boolean
  due_offset_days: number
  grace_days: number
  active_version_id: string | null
}

function mapTemplate(row: TemplateRow): ReportTemplateSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    cadence: row.cadence,
    scope: row.scope,
    requiresReview: row.requires_review,
    allowEmailCopy: row.allow_email_copy,
    dueOffsetDays: row.due_offset_days,
    graceDays: row.grace_days,
    activeVersionId: row.active_version_id,
  }
}

function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * The report types this employee is actually assigned.
 *
 * Not the whole catalogue: showing someone every template in the platform makes
 * the list useless and leaks what other departments are asked to report on.
 */
export async function getReportCatalogue(
  employee: WorkspaceEmployee,
): Promise<ReportTemplateSummary[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data: assignments, error: assignError } = await supabase
      .from('report_template_assignments')
      .select('template_id, assignee_type, employee_id, department')
      .eq('is_active', true)
      .or(
        `assignee_type.eq.everyone,and(assignee_type.eq.employee,employee_id.eq.${employee.id}),and(assignee_type.eq.department,department.eq.${employee.department})`,
      )
      .returns<{ template_id: string }[]>()
    if (assignError) {
      logDbError('reports.catalogue.assignments', assignError, { employeeId: employee.id })
      return []
    }
    const ids = [...new Set((assignments ?? []).map((a) => a.template_id))]
    if (ids.length === 0) return []

    const { data, error } = await supabase
      .from('report_templates')
      .select(TEMPLATE_COLUMNS)
      .in('id', ids)
      .eq('is_active', true)
      .is('archived_at', null)
      .order('name')
      .returns<TemplateRow[]>()
    if (error) {
      logDbError('reports.catalogue', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map(mapTemplate)
  } catch (error) {
    logDbError('reports.catalogue', error, { employeeId: employee.id })
    return []
  }
}

/**
 * What this employee owes, with the submission that answers each one.
 *
 * Filtered on employee_id, which is the whole of "employees see only their own
 * obligations".
 */
export async function getMyObligations(
  employee: WorkspaceEmployee,
  limit = 60,
): Promise<ReportObligation[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('report_obligations')
      .select(
        'id, template_id, period_start, period_end, period_label, due_date, state, report_templates(name, cadence, grace_days)',
      )
      .eq('employee_id', employee.id)
      .not('state', 'in', '("cancelled")')
      .order('due_date', { ascending: false })
      .limit(limit)
      .returns<
        {
          id: string
          template_id: string
          period_start: string
          period_end: string
          period_label: string
          due_date: string
          state: ReportObligation['state']
          report_templates: { name: string; cadence: ReportCadence | 'ad_hoc'; grace_days: number } | null
        }[]
      >()
    if (error) {
      logDbError('reports.obligations', error, { employeeId: employee.id })
      return []
    }

    const rows = data ?? []
    const submissions = await submissionsForObligations(rows.map((r) => r.id))
    const now = today()

    return rows.map((row) => {
      const submission = submissions.get(row.id) ?? null
      return {
        id: row.id,
        templateId: row.template_id,
        templateName: row.report_templates?.name ?? 'Report',
        cadence: row.report_templates?.cadence ?? 'ad_hoc',
        periodStart: row.period_start,
        periodEnd: row.period_end,
        periodLabel: row.period_label,
        dueDate: row.due_date,
        state: row.state,
        graceDays: row.report_templates?.grace_days ?? 0,
        status: obligationStatus({
          period: { start: row.period_start, end: row.period_end, label: row.period_label },
          dueDate: row.due_date,
          graceDays: row.report_templates?.grace_days ?? 0,
          today: now,
        }),
        submissionId: submission?.id ?? null,
        submissionState: submission?.state ?? null,
      }
    })
  } catch (error) {
    logDbError('reports.obligations', error, { employeeId: employee.id })
    return []
  }
}

async function submissionsForObligations(
  obligationIds: string[],
): Promise<Map<string, { id: string; state: ReportState }>> {
  const map = new Map<string, { id: string; state: ReportState }>()
  if (obligationIds.length === 0) return map
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('report_submissions')
      .select('id, state, obligation_id')
      .in('obligation_id', obligationIds)
      .returns<{ id: string; state: ReportState; obligation_id: string }[]>()
    if (error) {
      logDbError('reports.obligation_submissions', error)
      return map
    }
    for (const row of data ?? []) map.set(row.obligation_id, { id: row.id, state: row.state })
    return map
  } catch (error) {
    logDbError('reports.obligation_submissions', error)
    return map
  }
}

const SUBMISSION_COLUMNS =
  'id, template_id, employee_id, period_start, period_end, period_label, state, current_version, submitted_at, accepted_at, due_date, returned_count, draft_updated_at, report_templates(name)'

type SubmissionRow = {
  id: string
  template_id: string
  employee_id: string
  period_start: string
  period_end: string
  period_label: string
  state: ReportState
  current_version: number
  submitted_at: string | null
  accepted_at: string | null
  due_date: string | null
  returned_count: number
  draft_updated_at: string | null
  report_templates: { name: string } | null
}

function mapSubmission(row: SubmissionRow, employeeName: string | null = null): ReportSubmissionSummary {
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.report_templates?.name ?? 'Report',
    employeeId: row.employee_id,
    employeeName,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    periodLabel: row.period_label,
    state: row.state,
    currentVersion: row.current_version,
    submittedAt: row.submitted_at,
    acceptedAt: row.accepted_at,
    dueDate: row.due_date,
    returnedCount: row.returned_count,
    draftUpdatedAt: row.draft_updated_at,
  }
}

/** The employee's own submissions, optionally filtered by state. */
export async function getMySubmissions(
  employee: WorkspaceEmployee,
  states?: ReportState[],
  limit = 100,
): Promise<ReportSubmissionSummary[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    let query = supabase
      .from('report_submissions')
      .select(SUBMISSION_COLUMNS)
      .eq('employee_id', employee.id)
      .order('period_start', { ascending: false })
      .limit(limit)
    if (states && states.length > 0) query = query.in('state', states)

    const { data, error } = await query.returns<SubmissionRow[]>()
    if (error) {
      logDbError('reports.submissions', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map((row) => mapSubmission(row, employee.name))
  } catch (error) {
    logDbError('reports.submissions', error, { employeeId: employee.id })
    return []
  }
}

/**
 * One report, with everything needed to render or review it.
 *
 * Authorization is the first thing that happens and it is not negotiable: the
 * caller is either the author or a named recipient on the submission. Anyone
 * else gets null, and the caller renders "not found" rather than confirming the
 * report exists.
 */
export async function getReportDetail(
  employee: WorkspaceEmployee,
  submissionId: string,
  options: { asAdmin?: boolean } = {},
): Promise<ReportDetail | null> {
  if (!hasSupabaseAdminConfig()) return null
  try {
    const supabase = createSupabaseAdminClient()
    const { data: row, error } = await supabase
      .from('report_submissions')
      .select(
        `${SUBMISSION_COLUMNS}, draft_content, draft_revision, template_version_id, recipients`,
      )
      .eq('id', submissionId)
      .maybeSingle<
        SubmissionRow & {
          draft_content: ReportContent
          draft_revision: number
          template_version_id: string | null
          recipients: { employeeId: string }[] | null
        }
      >()
    if (error) {
      logDbError('reports.detail', error, { employeeId: employee.id })
      return null
    }
    if (!row) return null

    const isOwner = row.employee_id === employee.id
    const isRecipient = (row.recipients ?? []).some((r) => r.employeeId === employee.id)
    if (!isOwner && !isRecipient && !options.asAdmin) return null

    const [versionRows, definitionRow, reviewRows, commentRows, attachmentRows, templateRow] =
      await Promise.all([
        supabase
          .from('report_submission_versions')
          .select('id, version, content, field_snapshot, reason, created_at, author_employee_id')
          .eq('submission_id', submissionId)
          .order('version', { ascending: false })
          .returns<
            {
              id: string
              version: number
              content: ReportContent
              field_snapshot: unknown
              reason: string
              created_at: string
              author_employee_id: string | null
            }[]
          >(),
        row.template_version_id
          ? supabase
              .from('report_template_versions')
              .select('fields, recipient_rules')
              .eq('id', row.template_version_id)
              .maybeSingle<{ fields: unknown; recipient_rules: unknown }>()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from('report_reviews')
          .select('id, action, from_state, to_state, note, created_at, workforce_employees!reviewer_employee_id(full_name)')
          .eq('submission_id', submissionId)
          .order('created_at', { ascending: false })
          .returns<
            {
              id: string
              action: string
              from_state: string
              to_state: string
              note: string | null
              created_at: string
              workforce_employees: { full_name: string } | null
            }[]
          >(),
        supabase
          .from('report_comments')
          .select('id, body, author_name, field_key, visibility, created_at')
          .eq('submission_id', submissionId)
          .order('created_at', { ascending: true })
          .returns<
            {
              id: string
              body: string
              author_name: string
              field_key: string | null
              visibility: 'all' | 'internal'
              created_at: string
            }[]
          >(),
        supabase
          .from('report_attachments')
          .select('id, file_name, storage_path, mime_type, size_bytes, field_key, created_at')
          .eq('submission_id', submissionId)
          .returns<
            {
              id: string
              file_name: string
              storage_path: string
              mime_type: string | null
              size_bytes: number | null
              field_key: string | null
              created_at: string
            }[]
          >(),
        supabase
          .from('report_templates')
          .select(TEMPLATE_COLUMNS)
          .eq('id', row.template_id)
          .maybeSingle<TemplateRow>(),
      ])

    const versions: ReportVersion[] = (versionRows.data ?? []).map((v) => ({
      id: v.id,
      version: v.version,
      content: v.content,
      fieldSnapshot: parseFormDefinition(v.field_snapshot),
      reason: v.reason,
      createdAt: v.created_at,
      authorEmployeeId: v.author_employee_id,
    }))

    // The live template version drives the FORM; a stored version's own
    // snapshot drives how that version is displayed. They are different
    // questions and conflating them is how a report renders against fields it
    // was never written against.
    const definition = parseFormDefinition(definitionRow.data?.fields ?? null)

    return {
      submission: mapSubmission(row, isOwner ? employee.name : null),
      definition:
        definition.sections.length > 0
          ? definition
          : (versions[0]?.fieldSnapshot ?? { sections: [] }),
      recipientRules: parseRecipientRules(definitionRow.data?.recipient_rules ?? null),
      draftContent: row.draft_content ?? {},
      draftRevision: row.draft_revision,
      versions,
      reviews: (reviewRows.data ?? []).map((r) => ({
        id: r.id,
        action: r.action,
        fromState: r.from_state,
        toState: r.to_state,
        note: r.note,
        createdAt: r.created_at,
        reviewerName: r.workforce_employees?.full_name ?? null,
      })),
      // Internal comments are reviewer-only. Filtering here rather than in the
      // component means a future page cannot accidentally render them.
      comments: (commentRows.data ?? [])
        .filter((c) => c.visibility === 'all' || !isOwner)
        .map((c) => ({
          id: c.id,
          body: c.body,
          authorName: c.author_name,
          fieldKey: c.field_key,
          visibility: c.visibility,
          createdAt: c.created_at,
        })),
      attachments: (attachmentRows.data ?? []).map((a) => ({
        id: a.id,
        fileName: a.file_name,
        storagePath: a.storage_path,
        mimeType: a.mime_type,
        sizeBytes: a.size_bytes,
        fieldKey: a.field_key,
        createdAt: a.created_at,
      })),
      template: templateRow.data ? mapTemplate(templateRow.data) : null,
      isOwner,
    }
  } catch (error) {
    logDbError('reports.detail', error, { employeeId: employee.id })
    return null
  }
}

/** Reports waiting on this employee as a named recipient. */
export async function getReviewQueue(
  employee: WorkspaceEmployee,
  limit = 50,
): Promise<ReportSubmissionSummary[]> {
  if (!hasSupabaseAdminConfig()) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('report_submissions')
      .select(`${SUBMISSION_COLUMNS}, workforce_employees!employee_id(full_name)`)
      .in('state', ['submitted', 'under_review', 'resubmitted'])
      // Recipients are stored as a jsonb array of objects; `cs` is a containment
      // match on that array, which is what keeps this a single indexed query
      // rather than fetching every open report and filtering in Node.
      .contains('recipients', JSON.stringify([{ employeeId: employee.id }]))
      .order('submitted_at', { ascending: true })
      .limit(limit)
      .returns<(SubmissionRow & { workforce_employees: { full_name: string } | null })[]>()
    if (error) {
      logDbError('reports.review_queue', error, { employeeId: employee.id })
      return []
    }
    return (data ?? []).map((row) => mapSubmission(row, row.workforce_employees?.full_name ?? null))
  } catch (error) {
    logDbError('reports.review_queue', error, { employeeId: employee.id })
    return []
  }
}

/** One stored version, for the PDF. Authorization is the caller's job. */
export async function getSubmissionVersion(
  submissionId: string,
  version: number,
): Promise<ReportVersion | null> {
  if (!hasSupabaseAdminConfig()) return null
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('report_submission_versions')
      .select('id, version, content, field_snapshot, reason, created_at, author_employee_id')
      .eq('submission_id', submissionId)
      .eq('version', version)
      .maybeSingle<{
        id: string
        version: number
        content: ReportContent
        field_snapshot: unknown
        reason: string
        created_at: string
        author_employee_id: string | null
      }>()
    if (error || !data) {
      if (error) logDbError('reports.version', error)
      return null
    }
    return {
      id: data.id,
      version: data.version,
      content: data.content,
      fieldSnapshot: parseFormDefinition(data.field_snapshot),
      reason: data.reason,
      createdAt: data.created_at,
      authorEmployeeId: data.author_employee_id,
    }
  } catch (error) {
    logDbError('reports.version', error)
    return null
  }
}
