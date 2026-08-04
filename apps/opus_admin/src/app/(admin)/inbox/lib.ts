import type {
  AttachmentKind,
  CaseCategory,
  CaseChannel,
  CasePriority,
  CaseRecord,
  CaseStatus,
  CaseTeam,
  LinkedKind,
  ResolutionReason,
} from './types'

export const ME = 'Neema K.'

// Statuses that still represent work. Every count in the rail is measured
// against this set, so a queue badge means "cases needing something" rather
// than "rows that exist".
const ACTIVE: CaseStatus[] = [
  'new',
  'open',
  'in_progress',
  'waiting_on_customer',
  'waiting_internal',
  'snoozed',
]

export function isActive(c: CaseRecord): boolean {
  return ACTIVE.includes(c.status)
}

export const STATUS_LABEL: Record<CaseStatus, string> = {
  new: 'New',
  open: 'Open',
  in_progress: 'In progress',
  waiting_on_customer: 'Waiting on customer',
  waiting_internal: 'Waiting internally',
  snoozed: 'Snoozed',
  resolved: 'Resolved',
  closed: 'Closed',
  spam: 'Spam',
}

export const PRIORITY_LABEL: Record<CasePriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
  critical: 'Critical',
}

const PRIORITY_ORDER: Record<CasePriority, number> = {
  critical: 5,
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
}

export const TEAM_LABEL: Record<CaseTeam, string> = {
  sales_booking: 'Sales & Booking',
  customer_support: 'Customer Support',
  vendor_success: 'Vendor Success',
  finance: 'Finance',
  trust_safety: 'Trust & Safety',
  technology: 'Technology',
  operations: 'Operations',
}

export const CHANNEL_LABEL: Record<CaseChannel, string> = {
  email: 'Email',
  contact_form: 'Contact form',
  booking_form: 'Booking form',
  whatsapp: 'WhatsApp',
  system_event: 'System event',
  vendor_portal: 'Vendor portal',
  customer_portal: 'Customer portal',
  internal: 'Internal',
}

export const RESOLUTION_LABEL: Record<ResolutionReason, string> = {
  inquiry_answered: 'Inquiry answered',
  booking_converted: 'Booking converted',
  refund_issued: 'Refund issued',
  duplicate: 'Duplicate',
  vendor_approved: 'Vendor approved',
  vendor_rejected: 'Vendor rejected',
  issue_fixed: 'Technical issue fixed',
  no_response: 'No response',
  spam: 'Spam',
  other: 'Other',
}

export const LINKED_LABEL: Record<LinkedKind, string> = {
  booking: 'Booking',
  client: 'Client',
  vendor: 'Vendor',
  application: 'Application',
  payment: 'Payment',
  refund: 'Refund',
  payout: 'Payout',
  review: 'Review',
  task: 'Task',
  approval: 'Approval',
  incident: 'Incident',
}

/* ---------------------------------------------------------------- SLA ---- */

export type SlaState = 'met' | 'on_track' | 'at_risk' | 'breached' | 'paused' | 'done'

export type SlaView = {
  state: SlaState
  // Short form for the list row, e.g. "1h 42m left" or "Breached 2h".
  label: string
  // What the clock is measuring right now.
  target: 'first_response' | 'resolution' | 'none'
  msRemaining: number
}

// A case is "at risk" inside the last quarter of its window, floored at an
// hour so a short window does not flip to amber the moment it opens.
const AT_RISK_FLOOR_MS = 60 * 60_000

export function slaView(c: CaseRecord, now: number = Date.now()): SlaView {
  if (c.status === 'resolved' || c.status === 'closed' || c.status === 'spam') {
    return { state: 'done', label: 'Clock stopped', target: 'none', msRemaining: 0 }
  }
  if (c.sla.pausedReason) {
    const label = c.sla.pausedReason === 'snoozed' ? 'Snoozed, clock paused' : 'Paused, waiting on customer'
    return { state: 'paused', label, target: 'none', msRemaining: 0 }
  }

  const firstResponseDone = Boolean(c.sla.firstRespondedAt)
  const target = firstResponseDone ? 'resolution' : 'first_response'
  const dueAt = new Date(
    firstResponseDone ? c.sla.resolutionDueAt : c.sla.firstResponseDueAt,
  ).getTime()
  const openedAt = new Date(c.openedAt).getTime()
  const msRemaining = dueAt - now

  if (msRemaining <= 0) {
    return {
      state: 'breached',
      label: `Breached ${formatDuration(-msRemaining)}`,
      target,
      msRemaining,
    }
  }

  const window = Math.max(1, dueAt - openedAt)
  const atRisk = msRemaining < Math.max(AT_RISK_FLOOR_MS, window * 0.25)
  return {
    state: atRisk ? 'at_risk' : 'on_track',
    label: `${formatDuration(msRemaining)} left`,
    target,
    msRemaining,
  }
}

export function slaTargetLabel(view: SlaView): string {
  if (view.target === 'first_response') return 'First response'
  if (view.target === 'resolution') return 'Resolution'
  return 'SLA'
}

/* --------------------------------------------------------- formatting ---- */

export function formatDuration(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000))
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  if (hrs < 24) return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`
  const days = Math.floor(hrs / 24)
  const remHrs = hrs % 24
  return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.max(1, Math.round(diff / 60_000))
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatFull(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function formatTzs(amount: number): string {
  return `TZS ${amount.toLocaleString('en-US')}`
}

export function kindFromFile(file: File): AttachmentKind {
  const mime = file.type || ''
  const name = file.name.toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (name.match(/\.(xlsx|xls|csv|numbers|tsv)$/)) return 'sheet'
  if (name.match(/\.(pptx|ppt|key)$/)) return 'slide'
  if (name.match(/\.(docx|doc|rtf|pages|txt|md)$/)) return 'doc'
  if (name.match(/\.(zip|rar|7z|tar|gz)$/)) return 'archive'
  return 'other'
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB per file
export const ACCEPT_ATTR =
  'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.key,.pages,.numbers,.rtf,.txt,.md,.zip,.rar,.7z,.tar,.gz'

/* ------------------------------------------------------------ queries ---- */

export type ViewGroup = 'queue' | 'status' | 'team' | 'saved'

export type ViewKey =
  | 'queue:mine'
  | 'queue:unassigned'
  | 'queue:others'
  | 'queue:mentioned'
  | 'queue:following'
  | 'status:open'
  | 'status:waiting_customer'
  | 'status:waiting_internal'
  | 'status:snoozed'
  | 'status:resolved'
  | 'status:closed'
  | `team:${CaseTeam}`
  | 'saved:urgent'
  | 'saved:sla'
  | 'saved:high_value'
  | 'saved:big_refunds'
  | 'saved:failed_payments'
  | 'saved:unread'

export const HIGH_VALUE_TZS = 20_000_000
export const REFUND_THRESHOLD_TZS = 1_000_000

// One predicate per rail entry. Everything downstream (counts, the list, the
// empty state) reads from this, so a queue can never show a badge that
// disagrees with what opening it shows.
export function matchesView(c: CaseRecord, view: ViewKey): boolean {
  switch (view) {
    case 'queue:mine':
      return isActive(c) && c.assignee === ME
    case 'queue:unassigned':
      return isActive(c) && c.assignee === null
    case 'queue:others':
      return isActive(c) && c.assignee !== null && c.assignee !== ME
    case 'queue:mentioned':
      return isActive(c) && Boolean(c.mentionsMe)
    case 'queue:following':
      return isActive(c) && c.followers.includes(ME)
    case 'status:open':
      return c.status === 'new' || c.status === 'open' || c.status === 'in_progress'
    case 'status:waiting_customer':
      return c.status === 'waiting_on_customer'
    case 'status:waiting_internal':
      return c.status === 'waiting_internal'
    case 'status:snoozed':
      return c.status === 'snoozed'
    case 'status:resolved':
      return c.status === 'resolved'
    case 'status:closed':
      return c.status === 'closed' || c.status === 'spam'
    case 'saved:urgent':
      return isActive(c) && (c.priority === 'urgent' || c.priority === 'critical')
    case 'saved:sla': {
      const s = slaView(c)
      return isActive(c) && (s.state === 'breached' || s.state === 'at_risk')
    }
    case 'saved:high_value':
      return isActive(c) && c.category === 'booking_inquiry' && (c.value ?? 0) >= HIGH_VALUE_TZS
    case 'saved:big_refunds':
      return (
        isActive(c) && c.category === 'refund_request' && (c.value ?? 0) >= REFUND_THRESHOLD_TZS
      )
    case 'saved:failed_payments':
      return isActive(c) && c.tags.some((t) => t === 'webhook' || t === 'payment-failure')
    case 'saved:unread':
      return isActive(c) && c.unread
    default:
      if (view.startsWith('team:')) return isActive(c) && c.team === view.slice(5)
      return true
  }
}

export type SortKey = 'sla' | 'newest' | 'oldest_waiting' | 'priority' | 'unassigned_first'

export const SORT_LABEL: Record<SortKey, string> = {
  sla: 'SLA urgency',
  newest: 'Newest activity',
  oldest_waiting: 'Oldest waiting',
  priority: 'Priority',
  unassigned_first: 'Unassigned first',
}

export function sortCases(cases: CaseRecord[], sort: SortKey): CaseRecord[] {
  const byNewest = (a: CaseRecord, b: CaseRecord) =>
    +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt)

  return [...cases].sort((a, b) => {
    switch (sort) {
      case 'sla': {
        // Least time left first, with stopped clocks pushed to the bottom
        // rather than sorted as if they were wildly overdue.
        const sa = slaView(a)
        const sb = slaView(b)
        const rank = (s: SlaView) => (s.target === 'none' ? 1 : 0)
        if (rank(sa) !== rank(sb)) return rank(sa) - rank(sb)
        if (rank(sa) === 1) return byNewest(a, b)
        return sa.msRemaining - sb.msRemaining
      }
      case 'oldest_waiting':
        return +new Date(a.lastActivityAt) - +new Date(b.lastActivityAt)
      case 'priority': {
        const diff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]
        return diff !== 0 ? diff : byNewest(a, b)
      }
      case 'unassigned_first': {
        const ua = a.assignee === null ? 0 : 1
        const ub = b.assignee === null ? 0 : 1
        return ua !== ub ? ua - ub : byNewest(a, b)
      }
      default:
        return byNewest(a, b)
    }
  })
}

export function matchesQuery(c: CaseRecord, q: string): boolean {
  if (!q) return true
  const hay = [
    c.reference,
    c.subject,
    c.preview,
    c.requester.name,
    c.requester.handle ?? '',
    c.assignee ?? '',
    c.tags.join(' '),
  ]
    .join(' ')
    .toLowerCase()
  return hay.includes(q.toLowerCase())
}

// Categories a given team owns, used to keep the category filter honest when
// the rail is scoped to one team.
export function teamOf(category: CaseCategory): CaseTeam {
  switch (category) {
    case 'booking_inquiry':
      return 'sales_booking'
    case 'client_support':
      return 'customer_support'
    case 'vendor_application':
    case 'vendor_support':
      return 'vendor_success'
    case 'refund_request':
    case 'payout_dispute':
      return 'finance'
    case 'review_moderation':
      return 'trust_safety'
    case 'technical_incident':
      return 'technology'
  }
}
