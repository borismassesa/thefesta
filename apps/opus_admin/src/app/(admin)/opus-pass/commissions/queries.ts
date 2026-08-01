import 'server-only'
import { createSupabaseAdminClient } from '@/lib/supabase'

/**
 * The commission work queue and designer board.
 * Specs: OP-CCS-PRD-001 §7.4; OP-CCS-TDD-001 §5.4.
 *
 * P2 in the PRD was "how do we know this work is assigned to a given designer"
 * — answered with an explicit queue that has ownership, acceptance and an SLA,
 * rather than an email inbox. Everything here exists to make that queue
 * readable at a glance: what is unassigned, what is at risk, and who is holding
 * what.
 */

export type QueueStatus =
  | 'queued' | 'assigned' | 'in_design' | 'internal_qa'
  | 'client_review' | 'revision_requested'

export const QUEUE_STATUSES: QueueStatus[] = [
  'queued', 'assigned', 'in_design', 'internal_qa', 'client_review', 'revision_requested',
]

export const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = {
  queued: 'Unassigned',
  assigned: 'Awaiting accept',
  in_design: 'In design',
  internal_qa: 'Internal QA',
  client_review: 'With the customer',
  revision_requested: 'Changes requested',
}

/** A designer must accept within 2 hours or the task returns to the queue. */
export const ACCEPT_SLA_HOURS = 2

export type QueueTask = {
  orderId: string
  orderNo: string
  status: QueueStatus
  packageId: string
  categoryId: string
  buyerName: string
  eventName: string | null
  eventDate: string | null

  designerId: string | null
  designerName: string | null
  assignedAt: string | null
  acceptedAt: string | null
  assignBounces: number

  slaDueAt: string | null
  slaPaused: boolean
  /** Negative once the first-draft deadline has passed. Null when off the clock. */
  hoursToDeadline: number | null
  /** Awaiting-accept only: how long the designer has left to accept. */
  hoursToAccept: number | null

  versionCount: number
  revisionsRemaining: number | null
  openClarifications: number
  createdAt: string
}

export type QueueSummary = {
  total: number
  unassigned: number
  awaitingAccept: number
  overdue: number
  dueSoon: number
  byStatus: Record<QueueStatus, number>
}

export type CapacityReading = {
  totalCapacity: number
  openTasks: number
  freeCapacity: number
  queuedCount: number
  inFlightCount: number
  /** queued as a fraction of free capacity. Over 0.7 warns, over 1.0 alerts. */
  pressure: number
}

type OrderRow = {
  id: string
  order_no: string
  status: QueueStatus
  package_id: string
  category_id: string
  buyer_name: string
  provisional_event_name: string | null
  provisional_event_date: string | null
  assigned_designer_id: string | null
  assigned_at: string | null
  accepted_at: string | null
  assign_bounces: number
  sla_due_at: string | null
  sla_paused_at: string | null
  revisions_remaining: number | null
  created_at: string
}

const ORDER_COLS =
  'id, order_no, status, package_id, category_id, buyer_name, provisional_event_name, provisional_event_date, assigned_designer_id, assigned_at, accepted_at, assign_bounces, sla_due_at, sla_paused_at, revisions_remaining, created_at'

function hoursUntil(iso: string | null): number | null {
  if (!iso) return null
  return (new Date(iso).getTime() - Date.now()) / 3_600_000
}

/**
 * @param designerId when set, restrict to that designer's own tasks. The
 *   database also enforces this through RLS; passing it here keeps the
 *   service-role read (which bypasses RLS) honest.
 */
export async function getCommissionQueue(designerId?: string): Promise<QueueTask[]> {
  const supabase = createSupabaseAdminClient()

  let query = supabase
    .from('card_orders')
    .select(ORDER_COLS)
    .in('status', QUEUE_STATUSES)
    .is('archived_at', null)
  if (designerId) query = query.eq('assigned_designer_id', designerId)

  const { data, error } = await query.returns<OrderRow[]>()
  if (error) throw new Error(`getCommissionQueue failed: ${error.message}`)
  const orders = data ?? []
  if (orders.length === 0) return []

  const orderIds = orders.map((o) => o.id)
  const designerIds = [...new Set(orders.map((o) => o.assigned_designer_id).filter(Boolean))] as string[]

  const [{ data: designers }, { data: versions }, { data: clarifications }] = await Promise.all([
    designerIds.length
      ? supabase
          .from('designer_profiles')
          .select('employee_id, display_name')
          .in('employee_id', designerIds)
          .returns<{ employee_id: string; display_name: string }[]>()
      : Promise.resolve({ data: [] as { employee_id: string; display_name: string }[] }),
    supabase
      .from('design_versions')
      .select('order_id')
      .in('order_id', orderIds)
      .returns<{ order_id: string }[]>(),
    supabase
      .from('brief_clarifications')
      .select('order_id')
      .in('order_id', orderIds)
      .is('answered_at', null)
      .returns<{ order_id: string }[]>(),
  ])

  const nameById = new Map((designers ?? []).map((d) => [d.employee_id, d.display_name]))
  const versionCount = new Map<string, number>()
  for (const v of versions ?? []) versionCount.set(v.order_id, (versionCount.get(v.order_id) ?? 0) + 1)
  const clarCount = new Map<string, number>()
  for (const c of clarifications ?? []) clarCount.set(c.order_id, (clarCount.get(c.order_id) ?? 0) + 1)

  const tasks: QueueTask[] = orders.map((o) => {
    const paused = o.sla_paused_at !== null
    return {
      orderId: o.id,
      orderNo: o.order_no,
      status: o.status,
      packageId: o.package_id,
      categoryId: o.category_id,
      buyerName: o.buyer_name,
      eventName: o.provisional_event_name,
      eventDate: o.provisional_event_date,
      designerId: o.assigned_designer_id,
      designerName: o.assigned_designer_id ? (nameById.get(o.assigned_designer_id) ?? 'Unknown') : null,
      assignedAt: o.assigned_at,
      acceptedAt: o.accepted_at,
      assignBounces: o.assign_bounces,
      slaDueAt: o.sla_due_at,
      slaPaused: paused,
      // A paused clock has no meaningful countdown — showing one would make a
      // designer look late for time the customer is holding.
      hoursToDeadline: paused ? null : hoursUntil(o.sla_due_at),
      hoursToAccept:
        o.status === 'assigned' && o.assigned_at && !o.accepted_at
          ? ACCEPT_SLA_HOURS - (Date.now() - new Date(o.assigned_at).getTime()) / 3_600_000
          : null,
      versionCount: versionCount.get(o.id) ?? 0,
      revisionsRemaining: o.revisions_remaining,
      openClarifications: clarCount.get(o.id) ?? 0,
      createdAt: o.created_at,
    }
  })

  // Unassigned first, then closest to breaching. The board should read
  // top-down as "what needs a human right now".
  tasks.sort((a, b) => {
    if (a.status === 'queued' && b.status !== 'queued') return -1
    if (b.status === 'queued' && a.status !== 'queued') return 1
    const ad = a.hoursToDeadline ?? Number.POSITIVE_INFINITY
    const bd = b.hoursToDeadline ?? Number.POSITIVE_INFINITY
    return ad - bd
  })

  return tasks
}

export function summariseQueue(tasks: QueueTask[]): QueueSummary {
  const byStatus = Object.fromEntries(QUEUE_STATUSES.map((s) => [s, 0])) as Record<QueueStatus, number>
  for (const t of tasks) byStatus[t.status] += 1
  const onClock = tasks.filter((t) => t.hoursToDeadline !== null)
  return {
    total: tasks.length,
    unassigned: byStatus.queued,
    awaitingAccept: byStatus.assigned,
    overdue: onClock.filter((t) => (t.hoursToDeadline as number) < 0).length,
    dueSoon: onClock.filter((t) => {
      const h = t.hoursToDeadline as number
      return h >= 0 && h <= 6
    }).length,
    byStatus,
  }
}

/**
 * The studio's live throughput reading.
 *
 * PRD §4.1 calls capacity "the single largest operational risk in this
 * feature": there is no freelance pool, so demand above headcount cannot be
 * absorbed. Ops needs this number visible before checkout keeps promising SLAs
 * the studio cannot staff — the remedy for a missed SLA is a full refund on
 * work already paid for in salary.
 */
export async function getCapacity(): Promise<CapacityReading> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('commission_capacity')
    .select('*')
    .maybeSingle<{
      total_capacity: number
      open_tasks: number
      free_capacity: number
      queued_count: number
      in_flight_count: number
    }>()
  if (error) throw new Error(`getCapacity failed: ${error.message}`)
  const r = data ?? {
    total_capacity: 0, open_tasks: 0, free_capacity: 0, queued_count: 0, in_flight_count: 0,
  }
  return {
    totalCapacity: r.total_capacity,
    openTasks: r.open_tasks,
    freeCapacity: r.free_capacity,
    queuedCount: r.queued_count,
    inFlightCount: r.in_flight_count,
    // Guard the divide: zero free capacity with anything queued is maximum
    // pressure, not a NaN.
    pressure: r.free_capacity > 0 ? r.queued_count / r.free_capacity : r.queued_count > 0 ? 99 : 0,
  }
}

export type DesignerLoad = {
  employeeId: string
  displayName: string
  grade: string
  capacity: number
  openTasks: number
  active: boolean
  onLeaveUntil: string | null
  categories: string[]
}

export async function getDesignerLoad(): Promise<DesignerLoad[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('designer_profiles')
    .select('employee_id, display_name, studio_grade, capacity, active, on_leave_until, categories')
    .order('display_name')
    .returns<{
      employee_id: string
      display_name: string
      studio_grade: string
      capacity: number
      active: boolean
      on_leave_until: string | null
      categories: string[]
    }[]>()
  if (error) throw new Error(`getDesignerLoad failed: ${error.message}`)

  const rows = data ?? []
  const counts = await Promise.all(
    rows.map((d) =>
      supabase
        .rpc('designer_open_task_count', { p_employee_id: d.employee_id })
        .returns<number>()
        .then(({ data: n }) => Number(n ?? 0)),
    ),
  )

  return rows.map((d, i) => ({
    employeeId: d.employee_id,
    displayName: d.display_name,
    grade: d.studio_grade,
    capacity: d.capacity,
    openTasks: counts[i],
    active: d.active,
    onLeaveUntil: d.on_leave_until,
    categories: d.categories ?? [],
  }))
}

/** The caller's designer profile, if they have one. */
export async function getMyDesignerProfile(clerkUserId: string): Promise<{ employeeId: string; displayName: string } | null> {
  const supabase = createSupabaseAdminClient()
  const { data: employee } = await supabase
    .from('workforce_employees')
    .select('id')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle<{ id: string }>()
  if (!employee) return null

  const { data: profile } = await supabase
    .from('designer_profiles')
    .select('employee_id, display_name')
    .eq('employee_id', employee.id)
    .maybeSingle<{ employee_id: string; display_name: string }>()
  if (!profile) return null
  return { employeeId: profile.employee_id, displayName: profile.display_name }
}

/**
 * The brief, as a DESIGNER may see it.
 *
 * Note what is absent: buyer phone, buyer email, the guest list. A designer
 * gets the brief, the category and the event's display name and nothing more
 * (loophole L5). The RLS policy enforces this for a direct JWT read; this
 * projection enforces it for the service-role path the admin app uses.
 */
export async function getDesignerBrief(orderId: string): Promise<{
  answers: Record<string, unknown>
  attachments: { name: string; path: string; size: number }[]
  eventName: string | null
  eventDate: string | null
  categoryId: string
  packageId: string
} | null> {
  const supabase = createSupabaseAdminClient()
  const [{ data: order }, { data: brief }] = await Promise.all([
    supabase
      .from('card_orders')
      .select('provisional_event_name, provisional_event_date, category_id, package_id')
      .eq('id', orderId)
      .maybeSingle<{
        provisional_event_name: string | null
        provisional_event_date: string | null
        category_id: string
        package_id: string
      }>(),
    supabase
      .from('order_briefs')
      .select('answers, attachments')
      .eq('order_id', orderId)
      .maybeSingle<{ answers: Record<string, unknown>; attachments: { name: string; path: string; size: number }[] }>(),
  ])
  if (!order) return null
  return {
    answers: brief?.answers ?? {},
    attachments: brief?.attachments ?? [],
    eventName: order.provisional_event_name,
    eventDate: order.provisional_event_date,
    categoryId: order.category_id,
    packageId: order.package_id,
  }
}
