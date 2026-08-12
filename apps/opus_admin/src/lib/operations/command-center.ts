// Operations Command Center — pure permission and snapshot derivation.
//
// Operations does not own the records assembled here. Events remain in
// OpusPass, tasks remain in My Work, inquiries remain in Bookings, and
// approval requests remain in Approvals. This module only turns authorized,
// already-normalized rows into an actionable operational summary.

export type CommandCenterAccess = {
  events: boolean
  tasks: boolean
  bookings: boolean
  approvals: boolean
}

export function commandCenterAccess(
  permissions: ReadonlySet<string>,
): CommandCenterAccess {
  return {
    events: permissions.has('opuspass.checkin'),
    tasks: permissions.has('workforce.tasks.read'),
    bookings: permissions.has('bookings.read'),
    // Mirrors the existing Approvals route boundary. Request-level scoping is
    // applied by the Approvals query before any row reaches this module.
    approvals:
      permissions.has('finance.read') || permissions.has('workforce.read'),
  }
}

export function canViewCommandCenter(access: CommandCenterAccess): boolean {
  return Object.values(access).some(Boolean)
}

export type OperationsEvent = {
  id: string
  name: string
  eventType: string
  startsAt: string
  venue: string | null
  ownerName: string
  activeAttendants: number
}

export type OperationsTask = {
  id: string
  reference: string | null
  title: string
  status: 'backlog' | 'planned' | 'in_progress' | 'blocked' | 'in_review' | 'completed' | 'cancelled'
  priority: 'urgent' | 'high' | 'normal' | 'low'
  ownerName: string | null
  dueDate: string | null
  blockerReason: string | null
}

export type OperationsBooking = {
  id: string
  name: string
  eventType: string
  eventDate: string | null
  vendorName: string | null
  location: string | null
  createdAt: string | null
}

export type OperationsApproval = {
  id: string
  subject: string
  categoryLabel: string
  ownerName: string
  submittedAt: string
}

export type CommandCenterInput = {
  access: CommandCenterAccess
  today: string
  weekEnd: string
  events: OperationsEvent[]
  tasks: OperationsTask[]
  bookings: OperationsBooking[]
  pendingBookingCount: number
  approvals: OperationsApproval[]
  errorCount: number
  generatedAt: string
}

export type CommandCenterMetric = {
  id: 'today' | 'week' | 'overdue' | 'blocked' | 'approvals'
  label: string
  value: number
  detail: string
  tone: 'neutral' | 'warning' | 'danger'
  href: string
}

export type AttentionItem = {
  id: string
  kind: 'blocked' | 'overdue' | 'approval' | 'booking'
  label: string
  title: string
  detail: string
  timing: string
  href: string
  tone: 'warning' | 'danger' | 'neutral'
  rank: number
  sortAt: string
}

export type CommandCenterSnapshot = {
  access: CommandCenterAccess
  metrics: CommandCenterMetric[]
  attention: AttentionItem[]
  upcomingEvents: OperationsEvent[]
  pendingBookingCount: number
  errorCount: number
  generatedAt: string
}

const OPEN_TASK_STATUSES = new Set<OperationsTask['status']>([
  'backlog',
  'planned',
  'in_progress',
  'blocked',
  'in_review',
])

function eventLocalDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

function dateLabel(date: string | null, fallback: string): string {
  if (!date) return fallback
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

export function buildCommandCenter(input: CommandCenterInput): CommandCenterSnapshot {
  // Defense in depth: even a caller that accidentally supplies rows for a
  // disabled lane cannot put those rows into the snapshot returned to React.
  const events = input.access.events ? input.events : []
  const tasks = input.access.tasks ? input.tasks : []
  const bookings = input.access.bookings ? input.bookings : []
  const approvals = input.access.approvals ? input.approvals : []

  const upcomingEvents = events
    .filter((event) => {
      const date = eventLocalDate(event.startsAt)
      return date >= input.today && date <= input.weekEnd
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 8)

  const todayCount = upcomingEvents.filter(
    (event) => eventLocalDate(event.startsAt) === input.today,
  ).length
  const overdue = tasks.filter(
    (task) =>
      task.dueDate !== null &&
      task.dueDate < input.today &&
      OPEN_TASK_STATUSES.has(task.status),
  )
  const blocked = tasks.filter((task) => task.status === 'blocked')

  const metrics: CommandCenterMetric[] = []
  if (input.access.events) {
    metrics.push(
      {
        id: 'today',
        label: 'Happening today',
        value: todayCount,
        detail: 'OpusPass events',
        tone: todayCount > 0 ? 'warning' : 'neutral',
        href: '/operations/checkin',
      },
      {
        id: 'week',
        label: 'Next 7 days',
        value: upcomingEvents.length,
        detail: 'Upcoming delivery dates',
        tone: 'neutral',
        href: '/operations/checkin',
      },
    )
  }
  if (input.access.tasks) {
    metrics.push(
      {
        id: 'overdue',
        label: 'Overdue work',
        value: overdue.length,
        detail: 'Open tasks past due',
        tone: overdue.length > 0 ? 'danger' : 'neutral',
        href: '/workspace/work',
      },
      {
        id: 'blocked',
        label: 'Blocked work',
        value: blocked.length,
        detail: 'Tasks needing intervention',
        tone: blocked.length > 0 ? 'danger' : 'neutral',
        href: '/workspace/work',
      },
    )
  }
  if (input.access.approvals) {
    metrics.push({
      id: 'approvals',
      label: 'Waiting on you',
      value: approvals.length,
      detail: 'Pending approval decisions',
      tone: approvals.length > 0 ? 'warning' : 'neutral',
      href: '/approvals?tab=pending',
    })
  }

  const attention: AttentionItem[] = [
    ...blocked.map((task) => ({
      id: `blocked:${task.id}`,
      kind: 'blocked' as const,
      label: 'Blocked task',
      title: task.title,
      detail: task.blockerReason?.trim() || 'A blocker reason was not recorded.',
      timing: dateLabel(task.dueDate, 'No due date'),
      href: '/workspace/work',
      tone: 'danger' as const,
      rank: 0,
      sortAt: task.dueDate ?? '9999-12-31',
    })),
    ...overdue
      .filter((task) => task.status !== 'blocked')
      .map((task) => ({
        id: `overdue:${task.id}`,
        kind: 'overdue' as const,
        label: 'Overdue task',
        title: task.title,
        detail: task.ownerName ? `Owner: ${task.ownerName}` : 'No owner assigned',
        timing: `Due ${dateLabel(task.dueDate, 'earlier')}`,
        href: '/workspace/work',
        tone: 'danger' as const,
        rank: 1,
        sortAt: task.dueDate ?? '9999-12-31',
      })),
    ...approvals.map((approval) => ({
      id: `approval:${approval.id}`,
      kind: 'approval' as const,
      label: 'Approval decision',
      title: approval.subject,
      detail: `${approval.categoryLabel} · requested by ${approval.ownerName}`,
      timing: dateLabel(approval.submittedAt.slice(0, 10), 'Pending'),
      href: '/approvals?tab=pending',
      tone: 'warning' as const,
      rank: 2,
      sortAt: approval.submittedAt,
    })),
    ...bookings.map((booking) => ({
      id: `booking:${booking.id}`,
      kind: 'booking' as const,
      label: 'Booking inquiry',
      title: `${booking.name} · ${booking.eventType}`,
      detail: booking.vendorName || booking.location || 'Vendor response required',
      timing: booking.eventDate
        ? `Event ${dateLabel(booking.eventDate, 'date pending')}`
        : 'Date TBD',
      href: '/operations/bookings?status=pending',
      tone: 'neutral' as const,
      rank: 3,
      sortAt: booking.createdAt ?? '9999-12-31',
    })),
  ]
    .sort((a, b) => a.rank - b.rank || a.sortAt.localeCompare(b.sortAt))
    .slice(0, 10)

  return {
    access: input.access,
    metrics,
    attention,
    upcomingEvents,
    pendingBookingCount: input.access.bookings ? input.pendingBookingCount : 0,
    errorCount: input.errorCount,
    generatedAt: input.generatedAt,
  }
}
