// Server-only data layer for the admin dashboard. Returns one denormalised
// snapshot the page can render in a single round trip — counts for the
// "needs your attention" cards, headline metrics, and a unified recent-
// activity feed sourced from a handful of tables.
//
// Every query here either:
//   - aggregates with COUNT (cheap), or
//   - LIMITs the activity union to 8 rows
// so the dashboard stays fast even as the underlying tables grow.

import 'server-only'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerEmail } from '@/lib/admin-auth'
import { ENDED_EMPLOYEE_STATUSES_SQL, type Department } from '../workforce/_lib/types'

export type ActionQueueCounts = {
  vendorsPendingReview: number       // vendor.moderate
  workforceInvitesPending: number    // platform.admin
  reviewsPendingModeration: number   // vendor.moderate
  leaveRequestsPending: number       // workforce.write
  articleSubmissionsInPipeline: number // cms.publish
  inquiriesUnanswered: number        // bookings.write
}

export type HeadlineMetrics = {
  activeVendors: number
  totalVendors: number
  activeEmployees: number
  dashboardUsers: number
  inquiriesThisWeek: number
  totalInquiries: number
}

export type ActivityKind =
  | 'vendor_signup'
  | 'inquiry'
  | 'workforce_invite'
  | 'workforce_invite_accepted'
  | 'employee_added'

export type ActivityItem = {
  id: string
  kind: ActivityKind
  title: string
  subtitle: string | null
  href: string | null
  occurredAt: string
}

// Identifies the caller within the org so the dashboard can flavour
// itself by department. Null fields are non-fatal — callers without a
// matching workforce_employees row (legacy admin_whitelist-only admins,
// e.g. before they're onboarded as employees) get the generic dashboard.
export type DashboardCaller = {
  employeeId: string | null
  department: Department | null
  jobTitle: string | null
  fullName: string | null
}

// Charts: each series is a small array of { label, value } points so
// the client components stay dumb (just render whatever they get). All
// series are zero-padded so a quiet week doesn't gap the chart axis.
export type ChartPoint = { label: string; value: number }
export type SegmentPoint = { label: string; value: number; color?: string }

export type DashboardCharts = {
  inquiriesByWeek: ChartPoint[]   // last 8 weeks
  signupsByWeek: ChartPoint[]     // vendors created, last 8 weeks
  vendorPipeline: SegmentPoint[]  // vendors grouped by onboarding_status
  teamByDepartment: SegmentPoint[] // active employees grouped by department
}

// Founders-only view: the slowest things on the platform that need
// founder visibility but aren't anyone else's day-job. Each field is
// the count of rows in the "stuck" / "long pending" bucket — small enough
// numbers to spotlight individually rather than chart.
export type PlatformPulse = {
  vendorsStuckInOnboarding: number  // onboarding > 14 days, not yet active
  vendorsNeedingCorrections: number // status = needs_corrections
  vendorsSuspended: number          // status = suspended
  inquiriesStaleOver7Days: number   // pending and created > 7 days ago
  invitationsExpiringSoon: number   // pending invites that expire in < 3 days
}

// Department lane — the "decisions for today" band that sits between the
// cross-cutting ActionQueue and the trim ChartGrid. Each lane is a small
// set of count-or-status cards tuned to the caller's department.
//
// Tone semantics:
//   red    — overdue / blocked / risk
//   amber  — needs attention soon
//   blue   — informational, not urgent
//   green  — positive signal (e.g. healthy revenue)
//   gray   — neutral
export type LaneTone = 'red' | 'amber' | 'blue' | 'green' | 'gray'

export type LaneCard = {
  tone: LaneTone
  label: string
  count: number | string  // string allows "TZS 12,500,000" etc.
  hint?: string           // "Older than 5 days" / "+2 since yesterday"
  href: string | null
  blocked?: boolean       // renders a "Blocked" pill on the row
}

export type LaneListItem = {
  primary: string
  secondary?: string
  meta?: string           // right-aligned trailing string (count, pill, time)
  href?: string
}

export type DepartmentLane = {
  department: Department
  title: string            // "Operations — decisions for today"
  cards: LaneCard[]
  list?: {
    title: string
    items: LaneListItem[]
    emptyMessage?: string
  }
}

export type DashboardSnapshot = {
  caller: DashboardCaller
  actionQueue: ActionQueueCounts
  headline: HeadlineMetrics
  activity: ActivityItem[]
  platformPulse: PlatformPulse | null  // populated only when caller is in Founders
  charts: DashboardCharts
  departmentLane: DepartmentLane | null // gated by caller.department
  // Number of underlying count/list queries that failed during this
  // snapshot build. Renders a "values may be inaccurate" banner so a
  // broken connection doesn't look identical to a healthy quiet day —
  // see safeCount() below for how this is accumulated.
  errorCount: number
}

// Helper — awaits a Supabase head:true count query and returns 0 on
// error rather than throwing. The dashboard prefers a missing card to
// a 500 page, BUT silently rendering 0 for every counter when the DB
// is unreachable would look identical to a healthy quiet day — the
// worst kind of green dashboard. We track failures via the shared
// SafeCountTracker so getDashboardSnapshot() can surface a banner.
type CountResult = { count: number | null; error: { message?: string } | null }

class SafeCountTracker {
  count = 0
}

async function safeCount(
  promise: PromiseLike<CountResult>,
  tracker?: SafeCountTracker,
): Promise<number> {
  const { count, error } = await promise
  if (error) {
    // Real query failures are operationally meaningful — error, not
    // warn. We still return 0 so one bad query doesn't 500 the page.
    console.error('[dashboard] count query failed:', error.message ?? '(unknown)')
    if (tracker) tracker.count += 1
    return 0
  }
  return count ?? 0
}

// Resolve the caller (by Clerk-derived email) onto a workforce employee
// row so we can render department-flavoured content. Soft-fails to a
// null profile when there's no match — the dashboard is still usable
// without department context.
async function getDashboardCaller(): Promise<DashboardCaller> {
  const empty: DashboardCaller = {
    employeeId: null,
    department: null,
    jobTitle: null,
    fullName: null,
  }
  const email = await getCallerEmail()
  if (!email) return empty

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('id, department, job_title, full_name')
    .ilike('email', email)
    .maybeSingle<{ id: string; department: Department; job_title: string; full_name: string }>()
  if (error) {
    console.warn('[dashboard] caller profile lookup failed:', error.message)
    return empty
  }
  if (!data) return empty
  return {
    employeeId: data.id,
    department: data.department,
    jobTitle: data.job_title,
    fullName: data.full_name,
  }
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
// Why this is JS-side aggregation rather than SQL GROUP BY: Supabase's
// JS client doesn't expose raw GROUP BY without a Postgres function, and
// the underlying tables are small enough (tens to low hundreds of rows)
// that pulling created_at + a label and bucketing in memory is faster
// to write, easier to maintain, and still subsecond. If any series ever
// grows into the thousands, swap that one for a Postgres view.

const WEEK_MS = 7 * 86_400_000

// Format a Date as "May 12" — short enough for the X-axis without a
// year, which a 8-week window doesn't need.
function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Returns the most recent 8 week-start dates in chronological order.
// Anchor on Monday so weeks line up with how people read calendars.
function lastEightWeekStarts(): Date[] {
  const now = new Date()
  // Monday-of-this-week
  const day = now.getUTCDay() // 0=Sun, 1=Mon, ...
  const monday = new Date(now)
  monday.setUTCHours(0, 0, 0, 0)
  monday.setUTCDate(now.getUTCDate() - ((day + 6) % 7))
  return Array.from({ length: 8 }, (_, i) => new Date(monday.getTime() - (7 - i) * WEEK_MS))
}

function bucketByWeek(timestamps: string[]): ChartPoint[] {
  const weeks = lastEightWeekStarts()
  const counts = new Array(weeks.length).fill(0)
  const earliest = weeks[0].getTime()
  for (const iso of timestamps) {
    const t = new Date(iso).getTime()
    if (Number.isNaN(t) || t < earliest) continue
    const idx = Math.floor((t - earliest) / WEEK_MS)
    if (idx >= 0 && idx < counts.length) counts[idx]++
  }
  return weeks.map((d, i) => ({ label: shortDate(d), value: counts[i] }))
}

// Stable colours for known onboarding states — anything else falls back
// to a neutral grey so a future enum value renders without crashing.
const VENDOR_STATUS_COLOR: Record<string, string> = {
  active: '#10b981',
  needs_corrections: '#f59e0b',
  pending_review: '#0ea5e9',
  admin_review: '#0284c7',
  verification_pending: '#0369a1',
  application_in_progress: '#94a3b8',
  in_progress: '#94a3b8',
  invited: '#cbd5e1',
  suspended: '#ef4444',
}

function prettyStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const DEPARTMENT_COLOR: Record<string, string> = {
  Founders: '#7E5896',
  Operations: '#0ea5e9',
  Technology: '#10b981',
  'Content, Brand and Social Media': '#f59e0b',
  'Marketing & Partnership': '#ec4899',
  'UI & UX Design': '#a855f7',
  'Finance & Accountings': '#0284c7',
  HR: '#14b8a6',
  Studio: '#A84F66',
}

async function getDashboardCharts(): Promise<DashboardCharts> {
  const supabase = createSupabaseAdminClient()
  const eightWeeksAgo = new Date(Date.now() - 8 * WEEK_MS).toISOString()

  const [inquiriesRes, vendorsRes, employeesRes] = await Promise.all([
    supabase
      .from('inquiries')
      .select('created_at')
      .gte('created_at', eightWeeksAgo),
    supabase
      .from('vendors')
      .select('created_at, onboarding_status'),
    supabase
      .from('workforce_employees')
      .select('department')
      .not('status', 'in', ENDED_EMPLOYEE_STATUSES_SQL),
  ])

  // Inquiries trend (last 8 weeks)
  const inquiryTimestamps =
    (inquiriesRes.data as Array<{ created_at: string }> | null)?.map((r) => r.created_at) ?? []
  const inquiriesByWeek = bucketByWeek(inquiryTimestamps)

  // Vendor signups trend (last 8 weeks). Include all vendors but only
  // bucket those within the window.
  const vendors = (vendorsRes.data as Array<{ created_at: string; onboarding_status: string }> | null) ?? []
  const signupsByWeek = bucketByWeek(vendors.map((v) => v.created_at))

  // Vendor pipeline donut — all vendors grouped by onboarding_status,
  // sorted descending so "active" leads. Falls back gracefully if the
  // status string is unknown.
  const statusCounts = new Map<string, number>()
  for (const v of vendors) {
    statusCounts.set(v.onboarding_status, (statusCounts.get(v.onboarding_status) ?? 0) + 1)
  }
  const vendorPipeline: SegmentPoint[] = Array.from(statusCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([status, value]) => ({
      label: prettyStatus(status),
      value,
      color: VENDOR_STATUS_COLOR[status] ?? '#94a3b8',
    }))

  // Team by department donut — active (non-Resigned) employees only.
  const deptCounts = new Map<string, number>()
  for (const e of (employeesRes.data as Array<{ department: string }> | null) ?? []) {
    deptCounts.set(e.department, (deptCounts.get(e.department) ?? 0) + 1)
  }
  const teamByDepartment: SegmentPoint[] = Array.from(deptCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([department, value]) => ({
      label: department,
      value,
      color: DEPARTMENT_COLOR[department] ?? '#94a3b8',
    }))

  return { inquiriesByWeek, signupsByWeek, vendorPipeline, teamByDepartment }
}

// Founders-only block — counts the things that fall through the cracks
// elsewhere on the dashboard: vendors stuck in onboarding, suspended
// vendors waiting on a decision, inquiries no-one has answered, soon-
// to-expire invitations. Cheap COUNTs, all parallel.
async function getPlatformPulse(tracker: SafeCountTracker): Promise<PlatformPulse> {
  const supabase = createSupabaseAdminClient()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const threeDaysFromNow = new Date(Date.now() + 3 * 86_400_000).toISOString()

  const [
    vendorsStuckInOnboarding,
    vendorsNeedingCorrections,
    vendorsSuspended,
    inquiriesStaleOver7Days,
    invitationsExpiringSoon,
  ] = await Promise.all([
    safeCount(
      supabase
        .from('vendors')
        .select('id', { count: 'exact', head: true })
        .in('onboarding_status', [
          'invited',
          'in_progress',
          'application_in_progress',
          'verification_pending',
          'pending_review',
          'admin_review',
        ])
        .lt('updated_at', fourteenDaysAgo),
      tracker,
    ),
    safeCount(
      supabase
        .from('vendors')
        .select('id', { count: 'exact', head: true })
        .eq('onboarding_status', 'needs_corrections'),
      tracker,
    ),
    safeCount(
      supabase
        .from('vendors')
        .select('id', { count: 'exact', head: true })
        .eq('onboarding_status', 'suspended'),
      tracker,
    ),
    safeCount(
      supabase
        .from('inquiries')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lt('created_at', sevenDaysAgo),
      tracker,
    ),
    safeCount(
      supabase
        .from('workforce_invitations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lt('expires_at', threeDaysFromNow),
      tracker,
    ),
  ])

  return {
    vendorsStuckInOnboarding,
    vendorsNeedingCorrections,
    vendorsSuspended,
    inquiriesStaleOver7Days,
    invitationsExpiringSoon,
  }
}

// ---------------------------------------------------------------------------
// Department lanes
// ---------------------------------------------------------------------------
// One builder per department. Each runs its own cheap queries (mostly
// COUNT and a small top-N) and returns a uniform lane shape that
// DepartmentLane.tsx renders. Builders may return null cards/lists so
// they're skipped — the renderer drops empties rather than showing
// "0 nothing" rows.
//
// Performance: every builder fires its own queries in parallel; the
// snapshot fans out by department, not by query.
//
// The Founders lane is intentionally absent — Founders see the broader
// PlatformPulse band instead.

const DAY = 86_400_000

async function buildOperationsLane(supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<DepartmentLane> {
  const threeDaysAgo = new Date(Date.now() - 3 * DAY).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY).toISOString()

  const [
    overdueAdminReview,
    inquiriesOver72h,
    bookingsThisWeek,
    topVendorsRaw,
  ] = await Promise.all([
    safeCount(
      supabase
        .from('vendors')
        .select('id', { count: 'exact', head: true })
        .eq('onboarding_status', 'admin_review')
        .lt('updated_at', threeDaysAgo),
    ),
    safeCount(
      supabase
        .from('inquiries')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lt('created_at', threeDaysAgo),
    ),
    safeCount(
      supabase
        .from('inquiries')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo),
    ),
    // Cheap top-3 by inquiry volume. Pull the last week's inquiries and
    // bucket in memory — much smaller than the full inquiries table.
    supabase
      .from('inquiries')
      .select('vendor_name')
      .gte('created_at', sevenDaysAgo)
      .not('vendor_name', 'is', null)
      .limit(500),
  ])

  const vendorCounts = new Map<string, number>()
  for (const row of (topVendorsRaw.data as Array<{ vendor_name: string | null }> | null) ?? []) {
    const name = row.vendor_name?.trim()
    if (!name) continue
    vendorCounts.set(name, (vendorCounts.get(name) ?? 0) + 1)
  }
  const topVendors = Array.from(vendorCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([name, count]) => ({
      primary: name,
      secondary: 'Inquiries this week',
      meta: String(count),
      href: '/operations/bookings',
    }))

  return {
    department: 'Operations',
    title: 'Operations — decisions for today',
    cards: [
      {
        tone: overdueAdminReview > 0 ? 'red' : 'gray',
        label: 'Vendors in admin review',
        count: overdueAdminReview,
        hint: overdueAdminReview > 0 ? 'Older than 3 days' : 'None overdue',
        href: '/operations/vendors',
      },
      {
        tone: inquiriesOver72h > 0 ? 'amber' : 'gray',
        label: 'Inquiries with no response',
        count: inquiriesOver72h,
        hint: inquiriesOver72h > 0 ? 'Older than 72 hours' : 'All recent',
        href: '/operations/bookings',
      },
      {
        tone: 'blue',
        label: 'Inquiries landing this week',
        count: bookingsThisWeek,
        hint: 'Last 7 days',
        href: '/operations/bookings',
      },
    ],
    list: topVendors.length > 0
      ? { title: 'Top vendors by inquiry volume', items: topVendors }
      : undefined,
  }
}

async function buildTechnologyLane(supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<DepartmentLane> {
  const seventyTwoHoursAgo = new Date(Date.now() - 3 * DAY).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY).toISOString()

  const [
    criticalAuditEvents,
    errorAuditEvents,
    expiredInvites,
    recentAuditFeedRes,
  ] = await Promise.all([
    safeCount(
      supabase
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('severity', 'critical')
        .gte('created_at', seventyTwoHoursAgo),
    ),
    safeCount(
      supabase
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('severity', 'error')
        .gte('created_at', sevenDaysAgo),
    ),
    safeCount(
      supabase
        .from('workforce_invitations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'expired'),
    ),
    supabase
      .from('audit_log')
      .select('id, event_type, severity, message, actor_email, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const recentItems: LaneListItem[] = (
    (recentAuditFeedRes.data as Array<{
      id: string
      event_type: string
      severity: string
      message: string
      actor_email: string | null
      created_at: string
    }> | null) ?? []
  ).map((row) => ({
    primary: row.message,
    secondary: `${row.event_type} · ${row.actor_email ?? 'system'}`,
    meta: relativeShort(row.created_at),
    href: '/insights/audit',
  }))

  return {
    department: 'Technology',
    title: 'Technology — system status',
    cards: [
      {
        tone: criticalAuditEvents > 0 ? 'red' : 'gray',
        label: 'Security-critical events (72h)',
        count: criticalAuditEvents,
        hint: criticalAuditEvents > 0 ? 'Permission or role denials' : 'No critical events',
        href: '/insights/audit',
      },
      {
        tone: errorAuditEvents > 0 ? 'amber' : 'gray',
        label: 'Errors logged (7d)',
        count: errorAuditEvents,
        hint: 'Failed operations worth investigating',
        href: '/insights/audit',
      },
      {
        tone: expiredInvites > 0 ? 'amber' : 'gray',
        label: 'Expired invitations',
        count: expiredInvites,
        hint: 'May indicate a delivery issue',
        href: '/workforce/roles',
      },
    ],
    list: recentItems.length > 0
      ? {
          title: 'Latest audit events',
          items: recentItems,
          emptyMessage: 'No audit events yet',
        }
      : undefined,
  }
}

async function buildContentLane(supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<DepartmentLane> {
  const fiveDaysAgo = new Date(Date.now() - 5 * DAY).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * DAY).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY).toISOString()

  const [
    staleSubmissions,
    aginDrafts,
    publishedRecently,
    topPipelineRaw,
  ] = await Promise.all([
    safeCount(
      supabase
        .from('advice_article_submissions')
        .select('id', { count: 'exact', head: true })
        .in('status', ['submitted', 'pending', 'revisions', 'changes_requested'])
        .lt('updated_at', fiveDaysAgo),
    ),
    safeCount(
      supabase
        .from('advice_article_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft')
        .lt('updated_at', fourteenDaysAgo),
    ),
    safeCount(
      supabase
        .from('advice_article_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .gte('published_at', sevenDaysAgo),
    ),
    supabase
      .from('advice_article_submissions')
      .select('id, title, status, updated_at')
      .in('status', ['submitted', 'pending', 'revisions', 'changes_requested'])
      .order('updated_at', { ascending: true })
      .limit(3),
  ])

  const pipelineItems: LaneListItem[] = (
    (topPipelineRaw.data as Array<{
      id: string
      title: string | null
      status: string
      updated_at: string
    }> | null) ?? []
  ).map((row) => ({
    primary: row.title?.trim() || 'Untitled submission',
    secondary: prettyStatus(row.status),
    meta: relativeShort(row.updated_at),
    href: `/operations/articles/submissions/${row.id}`,
  }))

  return {
    department: 'Content, Brand and Social Media',
    title: 'Editorial pipeline — decisions for today',
    cards: [
      {
        tone: staleSubmissions > 0 ? 'red' : 'gray',
        label: 'Submissions waiting on review',
        count: staleSubmissions,
        hint: staleSubmissions > 0 ? 'Older than 5 days' : 'None overdue',
        href: '/operations/articles/submissions',
      },
      {
        tone: aginDrafts > 0 ? 'amber' : 'gray',
        label: 'Drafts going cold',
        count: aginDrafts,
        hint: 'Untouched for 14+ days',
        href: '/operations/articles/submissions',
      },
      {
        tone: 'green',
        label: 'Published this week',
        count: publishedRecently,
        hint: 'Last 7 days',
        href: '/operations/articles',
      },
    ],
    list: pipelineItems.length > 0
      ? {
          title: 'Oldest open submissions',
          items: pipelineItems,
        }
      : undefined,
  }
}

async function buildMarketingLane(supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<DepartmentLane> {
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY).toISOString()
  const ninetyDaysAgo = new Date(Date.now() - 90 * DAY).toISOString()

  const [signupsThisWeek, unpublishedSignups] = await Promise.all([
    safeCount(
      supabase
        .from('vendors')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo),
    ),
    safeCount(
      supabase
        .from('vendors')
        .select('id', { count: 'exact', head: true })
        .neq('onboarding_status', 'active')
        .lt('created_at', ninetyDaysAgo),
    ),
  ])

  return {
    department: 'Marketing & Partnership',
    title: 'Marketing — pipeline & traction',
    cards: [
      {
        tone: 'blue',
        label: 'Vendor signups this week',
        count: signupsThisWeek,
        hint: 'Last 7 days',
        href: '/operations/vendors',
      },
      {
        tone: unpublishedSignups > 0 ? 'amber' : 'gray',
        label: 'Signed up but never launched',
        count: unpublishedSignups,
        hint: 'Older than 90 days',
        href: '/operations/vendors',
      },
    ],
  }
}

async function buildDesignLane(supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<DepartmentLane> {
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY).toISOString()

  const [recentlyUpdated, needsCorrections, recentRaw] = await Promise.all([
    safeCount(
      supabase
        .from('vendors')
        .select('id', { count: 'exact', head: true })
        .eq('onboarding_status', 'active')
        .gte('updated_at', sevenDaysAgo),
    ),
    safeCount(
      supabase
        .from('vendors')
        .select('id', { count: 'exact', head: true })
        .eq('onboarding_status', 'needs_corrections'),
    ),
    supabase
      .from('vendors')
      .select('id, business_name, slug, updated_at, category')
      .eq('onboarding_status', 'active')
      .gte('updated_at', sevenDaysAgo)
      .order('updated_at', { ascending: false })
      .limit(5),
  ])

  const items: LaneListItem[] = (
    (recentRaw.data as Array<{
      id: string
      business_name: string | null
      slug: string | null
      updated_at: string
      category: string | null
    }> | null) ?? []
  ).map((row) => ({
    primary: row.business_name?.trim() || 'Unnamed vendor',
    secondary: row.category ?? undefined,
    meta: relativeShort(row.updated_at),
    href: row.slug ? `/operations/vendors/${row.slug}` : '/operations/vendors',
  }))

  return {
    department: 'UI & UX Design',
    title: 'Curation — review recent vendor updates',
    cards: [
      {
        tone: 'blue',
        label: 'Vendor profiles updated',
        count: recentlyUpdated,
        hint: 'Last 7 days · review for feature',
        href: '/operations/vendors',
      },
      {
        tone: needsCorrections > 0 ? 'amber' : 'gray',
        label: 'Vendors needing corrections',
        count: needsCorrections,
        hint: 'Awaiting design feedback',
        href: '/operations/vendors',
      },
    ],
    list: items.length > 0
      ? { title: 'Recently updated profiles', items }
      : undefined,
  }
}

async function buildFinanceLane(supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<DepartmentLane> {
  const [pendingLeave, latestPayrollRes, activeHeadcount] = await Promise.all([
    safeCount(
      supabase
        .from('workforce_leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Pending'),
    ),
    supabase
      .from('workforce_payroll_runs')
      .select('id, period, pay_date, status, net_tzs, headcount')
      .order('pay_date', { ascending: false })
      .limit(1)
      .maybeSingle<{
        id: string
        period: string
        pay_date: string
        status: string
        net_tzs: number
        headcount: number
      }>(),
    safeCount(
      supabase
        .from('workforce_employees')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', ENDED_EMPLOYEE_STATUSES_SQL),
    ),
  ])

  const payroll = latestPayrollRes.data
  const payrollCard: LaneCard = payroll
    ? {
        tone: payroll.status === 'Approved' || payroll.status === 'In review'
          ? 'amber'
          : payroll.status === 'Paid'
            ? 'green'
            : 'blue',
        label: `Payroll · ${payroll.period}`,
        count: payroll.status,
        hint: `Net ${formatTzs(payroll.net_tzs)} · ${payroll.headcount} on payroll`,
        href: '/finance/payroll',
      }
    : {
        tone: 'gray',
        label: 'Payroll',
        count: '—',
        hint: 'No payroll runs yet',
        href: '/finance/payroll',
      }

  return {
    department: 'Finance & Accountings',
    title: 'Finance — money decisions',
    cards: [
      payrollCard,
      {
        tone: pendingLeave > 0 ? 'amber' : 'gray',
        label: 'Leave requests pending',
        count: pendingLeave,
        hint: 'Affects payroll calculations',
        href: '/workforce/leave',
      },
      {
        tone: 'blue',
        label: 'People on payroll',
        count: activeHeadcount,
        hint: 'Excludes resigned',
        href: '/workforce/employees',
      },
    ],
  }
}

async function buildHrLane(supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<DepartmentLane> {
  const twoDaysAgo = new Date(Date.now() - 2 * DAY).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY).toISOString()

  const [overdueLeave, slowOnboarding, openRolesRes, candidatesRes] = await Promise.all([
    safeCount(
      supabase
        .from('workforce_leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Pending')
        .lt('submitted_at', twoDaysAgo),
    ),
    safeCount(
      supabase
        .from('workforce_employees')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Onboarding')
        .lt('start_date', thirtyDaysAgo.slice(0, 10)),
    ),
    supabase
      .from('workforce_jobs')
      .select('id, title, department')
      .eq('status', 'Open')
      .order('opened_at', { ascending: false })
      .limit(5),
    supabase
      .from('workforce_candidates')
      .select('job_id')
      .in('stage', ['Applied', 'Screening', 'Interview', 'Offer']),
  ])

  const openRoles = (openRolesRes.data as Array<{ id: string; title: string; department: string }> | null) ?? []
  const candidates = (candidatesRes.data as Array<{ job_id: string }> | null) ?? []
  const candidatesByJob = new Map<string, number>()
  for (const c of candidates) {
    candidatesByJob.set(c.job_id, (candidatesByJob.get(c.job_id) ?? 0) + 1)
  }

  const items: LaneListItem[] = openRoles.map((job) => ({
    primary: job.title,
    secondary: job.department,
    meta: `${candidatesByJob.get(job.id) ?? 0} in pipeline`,
    href: '/workforce/recruitment',
  }))

  return {
    department: 'HR',
    title: 'HR — people decisions',
    cards: [
      {
        tone: overdueLeave > 0 ? 'red' : 'gray',
        label: 'Leave requests waiting',
        count: overdueLeave,
        hint: overdueLeave > 0 ? 'Older than 2 days' : 'None overdue',
        href: '/workforce/leave',
      },
      {
        tone: slowOnboarding > 0 ? 'amber' : 'gray',
        label: 'Onboarding past day 30',
        count: slowOnboarding,
        hint: 'Schedule a check-in',
        href: '/workforce/employees',
      },
      {
        tone: 'blue',
        label: 'Open roles',
        count: openRoles.length,
        hint: `${candidates.length} candidates in pipeline`,
        href: '/workforce/recruitment',
      },
    ],
    list: items.length > 0
      ? { title: 'Open positions', items }
      : undefined,
  }
}

// Dispatcher — pick a builder based on department. Returns null for
// Founders (they get PlatformPulse instead) and null when there's no
// department (legacy admins without a workforce_employees row).
// Studio currently has no dedicated lane and falls through to the
// default (no lane); the page still renders cleanly.
async function getDepartmentLane(
  department: Department | null,
): Promise<DepartmentLane | null> {
  if (!department) return null
  if (department === 'Founders') return null
  const supabase = createSupabaseAdminClient()
  switch (department) {
    case 'Operations':
      return buildOperationsLane(supabase)
    case 'Technology':
      return buildTechnologyLane(supabase)
    case 'Content, Brand and Social Media':
      return buildContentLane(supabase)
    case 'Marketing & Partnership':
      return buildMarketingLane(supabase)
    case 'UI & UX Design':
      return buildDesignLane(supabase)
    case 'Finance & Accountings':
      return buildFinanceLane(supabase)
    case 'HR':
      return buildHrLane(supabase)
    default:
      return null
  }
}

// Tiny helpers shared by lane builders. Kept private — the lanes only
// need a short relative date string and a TZS formatter.
function relativeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diff) || diff < 0) return 'now'
  const min = Math.floor(diff / 60_000)
  if (min < 60) return `${Math.max(min, 1)}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  return `${day}d`
}

function formatTzs(amount: number): string {
  if (!Number.isFinite(amount)) return 'TZS 0'
  return `TZS ${Math.round(amount).toLocaleString('en-US')}`
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const supabase = createSupabaseAdminClient()
  // Single tracker for the top-level decision surface (action queue +
  // headline metrics + Founders' platform pulse). If any of these
  // counters fail, the snapshot includes a non-zero errorCount and the
  // page surfaces a banner so 0 doesn't look like "all clear." Lane
  // builders don't share this tracker — their failures only degrade a
  // single department's view, not the dashboard-wide read.
  const tracker = new SafeCountTracker()

  // Fire the caller profile lookup in parallel with the count batch
  // below — we'll await it before deciding whether to also fetch
  // platform pulse (Founders-only).
  const callerPromise = getDashboardCaller()

  // --- Action queue + headline counts (all parallel) ---
  const [
    vendorsPendingReview,
    activeVendors,
    totalVendors,
    workforceInvitesPending,
    activeEmployees,
    dashboardUsers,
    reviewsPendingModeration,
    leaveRequestsPending,
    articleSubmissionsInPipeline,
    totalInquiries,
    inquiriesThisWeek,
    inquiriesUnanswered,
  ] = await Promise.all([
    safeCount(
      supabase
        .from('vendors')
        .select('id', { count: 'exact', head: true })
        .in('onboarding_status', ['pending_review', 'admin_review', 'verification_pending']),
      tracker,
    ),
    safeCount(
      supabase
        .from('vendors')
        .select('id', { count: 'exact', head: true })
        .eq('onboarding_status', 'active'),
      tracker,
    ),
    safeCount(supabase.from('vendors').select('id', { count: 'exact', head: true }), tracker),
    safeCount(
      supabase
        .from('workforce_invitations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      tracker,
    ),
    safeCount(
      supabase
        .from('workforce_employees')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', ENDED_EMPLOYEE_STATUSES_SQL),
      tracker,
    ),
    safeCount(
      supabase
        .from('workforce_employees')
        .select('id', { count: 'exact', head: true })
        .eq('dashboard_access', true),
      tracker,
    ),
    safeCount(
      supabase
        .from('vendor_reviews')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      tracker,
    ),
    safeCount(
      supabase
        .from('workforce_leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Pending'),
      tracker,
    ),
    safeCount(
      // Editorial pipeline — submitted_at not null AND not in a terminal
      // state. The `draft` exclusion is belt-and-braces (drafts shouldn't
      // have submitted_at, but a manually-edited row could).
      supabase
        .from('advice_article_submissions')
        .select('id', { count: 'exact', head: true })
        .not('submitted_at', 'is', null)
        .not('status', 'in', '(published,rejected,draft)'),
      tracker,
    ),
    safeCount(supabase.from('inquiries').select('id', { count: 'exact', head: true }), tracker),
    safeCount(
      supabase
        .from('inquiries')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString()),
      tracker,
    ),
    safeCount(
      supabase
        .from('inquiries')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      tracker,
    ),
  ])

  // --- Recent activity feed ---
  // Pulled from three tables in parallel, then merged + truncated to the
  // most recent 8. Each source is small (LIMIT 5) so the merge stays
  // O(n) tiny. We pick three sources because they're the highest-signal
  // for an admin: vendor lifecycle, customer inquiries, internal team
  // changes. Add more sources here as new modules ship (e.g. payouts).
  const [vendorsAgo, inquiriesAgo, invitesAgo] = await Promise.all([
    supabase
      .from('vendors')
      .select('id, business_name, slug, created_at, onboarding_status')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('inquiries')
      .select('id, name, vendor_name, vendor_slug, created_at, status')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('workforce_invitations')
      .select('id, email, status, invited_at, accepted_at')
      .order('invited_at', { ascending: false })
      .limit(5),
  ])

  const activity: ActivityItem[] = []

  for (const v of (vendorsAgo.data ?? []) as Array<{
    id: string
    business_name: string | null
    slug: string | null
    created_at: string
    onboarding_status: string | null
  }>) {
    activity.push({
      id: `vendor:${v.id}`,
      kind: 'vendor_signup',
      title: v.business_name?.trim() || 'Unnamed vendor',
      subtitle: v.onboarding_status ? `Status: ${v.onboarding_status.replace(/_/g, ' ')}` : null,
      href: v.slug ? `/operations/vendors/${v.slug}` : '/operations/vendors',
      occurredAt: v.created_at,
    })
  }

  for (const inq of (inquiriesAgo.data ?? []) as Array<{
    id: string
    name: string | null
    vendor_name: string | null
    vendor_slug: string | null
    created_at: string
    status: string | null
  }>) {
    activity.push({
      id: `inquiry:${inq.id}`,
      kind: 'inquiry',
      title: `${inq.name?.trim() || 'Anonymous'} → ${inq.vendor_name?.trim() || 'No vendor'}`,
      subtitle: inq.status === 'pending' ? 'Awaiting response' : `Status: ${inq.status ?? 'unknown'}`,
      href: '/operations/bookings',
      occurredAt: inq.created_at,
    })
  }

  for (const inv of (invitesAgo.data ?? []) as Array<{
    id: string
    email: string
    status: string
    invited_at: string
    accepted_at: string | null
  }>) {
    if (inv.status === 'accepted' && inv.accepted_at) {
      activity.push({
        id: `invite-accept:${inv.id}`,
        kind: 'workforce_invite_accepted',
        title: `${inv.email} accepted invite`,
        subtitle: 'Now has dashboard access',
        href: '/workforce/employees',
        occurredAt: inv.accepted_at,
      })
    } else {
      activity.push({
        id: `invite:${inv.id}`,
        kind: 'workforce_invite',
        title: `Invitation sent to ${inv.email}`,
        subtitle: inv.status === 'pending' ? 'Awaiting acceptance' : `Status: ${inv.status}`,
        href: '/workforce/roles',
        occurredAt: inv.invited_at,
      })
    }
  }

  activity.sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  )

  // Resolve the caller now and gate Platform Pulse on Founders. Other
  // departments don't need this band — they have department-flavoured
  // lanes (built by getDepartmentLane below). Charts are loaded for
  // everyone (cheap aggregations on small tables) and rendered as the
  // caller's role permissions allow.
  const [caller, charts] = await Promise.all([callerPromise, getDashboardCharts()])
  const [platformPulse, departmentLane] = await Promise.all([
    caller.department === 'Founders' ? getPlatformPulse(tracker) : Promise.resolve(null),
    getDepartmentLane(caller.department),
  ])

  return {
    caller,
    actionQueue: {
      vendorsPendingReview,
      workforceInvitesPending,
      reviewsPendingModeration,
      leaveRequestsPending,
      articleSubmissionsInPipeline,
      inquiriesUnanswered,
    },
    headline: {
      activeVendors,
      totalVendors,
      activeEmployees,
      dashboardUsers,
      inquiriesThisWeek,
      totalInquiries,
    },
    activity: activity.slice(0, 8),
    platformPulse,
    charts,
    departmentLane,
    errorCount: tracker.count,
  }
}
