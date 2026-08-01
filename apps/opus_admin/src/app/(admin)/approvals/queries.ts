import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase'
import { findCategory } from './catalog'
import { isRelevantTo } from './scoping'
import type {
  ApprovalActivity,
  ApprovalActivityKind,
  ApprovalApprover,
  ApprovalAttachment,
  ApprovalCategory,
  ApprovalCategoryKey,
  ApprovalField,
  ApprovalGroupKey,
  ApprovalRequest,
  ApprovalStatus,
} from './types'
import { logDbError } from '@/lib/log-safe'

// Data access for the Approvals module. Reads/writes go through the service
// role key; callers gate on approvals access before invoking these. Rows are
// mapped here into the camelCase ApprovalRequest shape the UI already speaks.

type RequestRow = {
  id: string
  category: string
  subject: string
  owner_name: string
  owner_email: string
  owner_initials: string
  owner_clerk_id: string | null
  fields: unknown
  approvers: unknown
  status: string
  submitted_at: string | null
  created_at: string
  updated_at: string
}

type ActivityRow = {
  id: string
  request_id: string
  kind: string
  author: string
  author_initials: string
  author_color: string
  body: string
  created_at: string
}

function asApprovers(value: unknown): ApprovalApprover[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === 'object')
    .map((a) => ({
      id: String(a.id ?? ''),
      name: String(a.name ?? ''),
      role: typeof a.role === 'string' ? a.role : undefined,
      email: String(a.email ?? ''),
    }))
}

function asFields(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = typeof v === 'string' ? v : String(v)
  }
  return out
}

function mapActivity(row: ActivityRow): ApprovalActivity {
  return {
    id: row.id,
    kind: row.kind as ApprovalActivityKind,
    at: row.created_at,
    author: row.author,
    authorInitials: row.author_initials,
    authorColor: row.author_color,
    body: row.body,
  }
}

type AttachmentRow = {
  id: string
  request_id: string
  file_name: string
  mime_type: string
  file_size_bytes: number
  uploaded_by_name: string
  created_at: string
}

// storage_path is NOT selected anywhere in this file. It is an access detail;
// the download action resolves it server-side from the attachment id after
// re-checking participation, so it never needs to reach a page payload.
function mapAttachment(row: AttachmentRow): ApprovalAttachment {
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.file_size_bytes),
    uploadedBy: row.uploaded_by_name,
    uploadedAt: row.created_at,
  }
}

const ATTACHMENT_COLUMNS =
  'id, request_id, file_name, mime_type, file_size_bytes, uploaded_by_name, created_at'

function mapRequest(
  row: RequestRow,
  activity: ApprovalActivity[],
  attachments: ApprovalAttachment[] = [],
): ApprovalRequest {
  // `updatedAt` drives sort order: submission date once submitted, else the
  // last touch. submitted_at is the cleaner signal for "Submitted" rows.
  const updatedAt = row.status === 'Submitted' && row.submitted_at ? row.submitted_at : row.updated_at
  return {
    id: row.id,
    category: row.category as ApprovalCategoryKey,
    subject: row.subject,
    owner: row.owner_name,
    ownerEmail: row.owner_email,
    ownerInitials: row.owner_initials,
    fields: asFields(row.fields),
    approvers: asApprovers(row.approvers),
    status: row.status as ApprovalStatus,
    updatedAt,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    activity,
    attachments,
  }
}

// Every "waiting 4d" / "oldest pending" figure in the UI is relative to
// when the rows were read, so the read hands back its own clock. Doing this
// in the page (or worse, during client render) would be impure and would
// let SSR and hydration disagree on the same age.
export type ApprovalRequestSnapshot = {
  requests: ApprovalRequest[]
  fetchedAt: number
}

export type ApprovalScope = {
  // Whose desk this is. Rows are reduced to the ones this person raised or is
  // named on before anything leaves the server.
  viewerEmail: string
}

// SCOPING IS SERVER-SIDE ON PURPOSE. This reads with the service-role key,
// which bypasses RLS, so an unfiltered result would put every approval in the
// company — subjects, payees, amounts, justifications — into the page payload
// of anyone who passes the module's broad `finance.read OR workforce.read`
// gate. Filtering in the component would still have shipped the data to the
// browser. The predicate is `isRelevantTo` from scoping.ts, shared with the
// queue and notification-recipient rules so the three cannot drift.
//
// THERE IS NO OVERRIDE. Not for finance.write, not for platform.admin, not for
// the owner. Approvals is a personal authorization desk: a request you neither
// raised nor decide on is not yours to read. Oversight is served by
// approvalAnalytics() below, which returns counts and never row detail.
export async function listApprovalRequests(scope: ApprovalScope): Promise<ApprovalRequestSnapshot> {
  const fetchedAt = Date.now()
  const supabase = createSupabaseAdminClient()
  const { data: requests, error } = await supabase
    .from('approval_requests')
    .select('*')
    .order('updated_at', { ascending: false })
    .returns<RequestRow[]>()
  if (error) {
    logDbError('approval_request.list', error)
    return { requests: [], fetchedAt }
  }
  if (!requests || requests.length === 0) return { requests: [], fetchedAt }

  const { data: activity, error: activityError } = await supabase
    .from('approval_request_activity')
    .select('*')
    .in('request_id', requests.map((r) => r.id))
    .order('created_at', { ascending: true })
    .returns<ActivityRow[]>()
  if (activityError) {
    logDbError('approval_activity.list', activityError)
  }

  const byRequest = new Map<string, ApprovalActivity[]>()
  for (const row of activity ?? []) {
    const list = byRequest.get(row.request_id) ?? []
    list.push(mapActivity(row))
    byRequest.set(row.request_id, list)
  }

  const { data: attachments, error: attachmentError } = await supabase
    .from('approval_request_attachments')
    .select(ATTACHMENT_COLUMNS)
    .in('request_id', requests.map((r) => r.id))
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .returns<AttachmentRow[]>()
  if (attachmentError) {
    // A failed attachment read must not blank the queue. The request still
    // renders; it just shows no supporting documents.
    logDbError('approval_attachment.list', attachmentError)
  }

  const filesByRequest = new Map<string, ApprovalAttachment[]>()
  for (const row of attachments ?? []) {
    const list = filesByRequest.get(row.request_id) ?? []
    list.push(mapAttachment(row))
    filesByRequest.set(row.request_id, list)
  }

  const mapped = requests.map((r) =>
    mapRequest(r, byRequest.get(r.id) ?? [], filesByRequest.get(r.id) ?? []),
  )
  return {
    requests: mapped.filter((r) => isRelevantTo(r, scope.viewerEmail)),
    fetchedAt,
  }
}

// ---------------------------------------------------------------------------
// Org-wide analytics — numbers only
// ---------------------------------------------------------------------------
// Computed here, on the server, over every row. What crosses to the browser is
// counts, averages and timestamps. No subject, no requester, no amount, no
// justification. That is what lets a leadership view coexist with a rule that
// nobody reads a request they are not part of.
//
// Approver names DO cross, in `bottlenecks`. That is the point of a bottleneck
// list — it names who work is queued behind — and it discloses no request.

export type ApprovalAnalytics = {
  pending: number
  drafts: number
  approved: number
  refused: number
  decided: number
  avgDecisionDays: number | null
  // Timestamp only. The caller renders an age from it.
  oldestPendingAt: string | null
  ageingCount: number
  byGroup: { group: ApprovalGroupKey; total: number; pending: number; approved: number; refused: number }[]
  bottlenecks: { name: string; pending: number; oldestAt: string }[]
  // Category and age only — deliberately no subject or owner.
  longestWaiting: { category: ApprovalCategoryKey; submittedAt: string }[]
  fetchedAt: number
}

const AGEING_FROM_DAYS = 2

export async function approvalAnalytics(
  categories: ApprovalCategory[],
): Promise<ApprovalAnalytics> {
  const fetchedAt = Date.now()
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('approval_requests')
    .select('category, status, submitted_at, updated_at, approvers')
    .returns<Pick<RequestRow, 'category' | 'status' | 'submitted_at' | 'updated_at' | 'approvers'>[]>()

  const empty: ApprovalAnalytics = {
    pending: 0, drafts: 0, approved: 0, refused: 0, decided: 0,
    avgDecisionDays: null, oldestPendingAt: null, ageingCount: 0,
    byGroup: [], bottlenecks: [], longestWaiting: [], fetchedAt,
  }
  if (error) {
    logDbError('approval_request.analytics', error)
    return empty
  }
  if (!data || data.length === 0) return empty

  const durations: number[] = []
  const groups = new Map<ApprovalGroupKey, { total: number; pending: number; approved: number; refused: number }>()
  const holders = new Map<string, { name: string; pending: number; oldestAt: string }>()
  const waiting: { category: ApprovalCategoryKey; submittedAt: string }[] = []
  let pending = 0, drafts = 0, approved = 0, refused = 0, ageingCount = 0
  let oldestPendingAt: string | null = null

  for (const row of data) {
    const category = row.category as ApprovalCategoryKey
    let groupKey: ApprovalGroupKey | null = null
    try {
      groupKey = findCategory(categories, category)?.group ?? null
    } catch {
      // A category retired from the catalog but still present in old rows.
      groupKey = null
    }
    if (groupKey) {
      const g = groups.get(groupKey) ?? { total: 0, pending: 0, approved: 0, refused: 0 }
      g.total += 1
      if (row.status === 'Submitted') g.pending += 1
      else if (row.status === 'Approved') g.approved += 1
      else if (row.status === 'Refused') g.refused += 1
      groups.set(groupKey, g)
    }

    if (row.status === 'To Submit') drafts += 1
    if (row.status === 'Approved') approved += 1
    if (row.status === 'Refused') refused += 1

    if ((row.status === 'Approved' || row.status === 'Refused') && row.submitted_at) {
      const days = (new Date(row.updated_at).getTime() - new Date(row.submitted_at).getTime()) / 86_400_000
      if (Number.isFinite(days) && days >= 0) durations.push(days)
    }

    if (row.status === 'Submitted') {
      pending += 1
      const at = row.submitted_at ?? row.updated_at
      waiting.push({ category, submittedAt: at })
      if (!oldestPendingAt || at < oldestPendingAt) oldestPendingAt = at
      if ((fetchedAt - new Date(at).getTime()) / 86_400_000 >= AGEING_FROM_DAYS) ageingCount += 1
      for (const a of asApprovers(row.approvers)) {
        const key = a.email.trim().toLowerCase()
        const existing = holders.get(key)
        if (!existing) holders.set(key, { name: a.name, pending: 1, oldestAt: at })
        else {
          existing.pending += 1
          if (at < existing.oldestAt) existing.oldestAt = at
        }
      }
    }
  }

  return {
    pending, drafts, approved, refused,
    decided: approved + refused,
    avgDecisionDays: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    oldestPendingAt,
    ageingCount,
    byGroup: [...groups.entries()].map(([group, v]) => ({ group, ...v })),
    bottlenecks: [...holders.values()].sort((a, b) => b.pending - a.pending),
    longestWaiting: waiting
      .sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1))
      .slice(0, 8),
    fetchedAt,
  }
}

export async function getApprovalRequest(id: string): Promise<ApprovalRequest | null> {
  const supabase = createSupabaseAdminClient()
  const { data: row, error } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle<RequestRow>()
  if (error) {
    logDbError('approval_request.get', error, { requestId: id })
    return null
  }
  if (!row) return null

  const { data: activity } = await supabase
    .from('approval_request_activity')
    .select('*')
    .eq('request_id', id)
    .order('created_at', { ascending: true })
    .returns<ActivityRow[]>()

  const { data: attachments } = await supabase
    .from('approval_request_attachments')
    .select(ATTACHMENT_COLUMNS)
    .eq('request_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .returns<AttachmentRow[]>()

  return mapRequest(
    row,
    (activity ?? []).map(mapActivity),
    (attachments ?? []).map(mapAttachment),
  )
}

// ---------------------------------------------------------------------------
// Request-type catalog
// ---------------------------------------------------------------------------
// The catalog used to be a hardcoded array here plus a CHECK constraint listing
// the same keys, so adding a type meant a code change and a migration. It now
// lives in approval_categories and owner/admin manage it from the UI.
//
// Returned as props rather than read from a module-level cache: module state is
// shared across requests in Next.js, so a cached catalog would leak one
// request's view of the world into another's.

type CategoryRow = {
  key: string
  label: string
  blurb: string
  group_key: string
  accent: string
  tint: string
  icon_key: string
  fields: unknown
  active: boolean
  sort_order: number
}

function asFieldSchema(value: unknown): ApprovalField[] {
  if (!Array.isArray(value)) return []
  const KINDS = new Set(['text', 'textarea', 'date', 'date-range', 'number', 'amount', 'list'])
  return value
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === 'object')
    .map((f) => ({
      id: String(f.id ?? ''),
      label: String(f.label ?? ''),
      kind: (KINDS.has(String(f.kind)) ? String(f.kind) : 'text') as ApprovalField['kind'],
      required: f.required === true,
      placeholder: typeof f.placeholder === 'string' ? f.placeholder : undefined,
      hint: typeof f.hint === 'string' ? f.hint : undefined,
    }))
    // A field with no id cannot be stored or read back, so it is dropped rather
    // than rendered as an input that silently discards what you type.
    .filter((f) => f.id && f.label)
}

function mapCategory(row: CategoryRow): ApprovalCategory {
  return {
    key: row.key as ApprovalCategoryKey,
    label: row.label,
    blurb: row.blurb,
    group: row.group_key as ApprovalGroupKey,
    accent: row.accent,
    tint: row.tint,
    iconKey: row.icon_key as ApprovalCategory['iconKey'],
    fields: asFieldSchema(row.fields),
    active: row.active,
    sortOrder: row.sort_order,
  }
}

/**
 * @param includeInactive true for the management screen, which must still show
 *   retired types. The Create catalog passes false so retired types stop being
 *   offered while existing requests keep resolving their label.
 */
export async function listApprovalCategories(includeInactive = false): Promise<ApprovalCategory[]> {
  const supabase = createSupabaseAdminClient()
  let query = supabase.from('approval_categories').select('*')
  if (!includeInactive) query = query.eq('active', true)
  const { data, error } = await query
    .order('group_key')
    .order('sort_order')
    .order('label')
    .returns<CategoryRow[]>()
  if (error) {
    logDbError('approval_category.list', error)
    return []
  }
  return (data ?? []).map(mapCategory)
}
