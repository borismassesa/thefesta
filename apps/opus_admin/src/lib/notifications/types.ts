// Shared vocabulary for the staff notification subsystem. Kept free of
// server-only imports so client components (the bell) can use the same types
// and the same priority/category mapping the emitter used to write the rows.

export type NotificationChannel = 'bell' | 'email'

export type NotificationCategory = 'approvals' | 'requests' | 'mentions' | 'system'

export type NotificationPriority = 'critical' | 'high' | 'normal' | 'info'

export type NotificationStatus = 'unread' | 'read' | 'archived' | 'dismissed'

// Event types are namespaced by module so `workflow_events` stays readable
// once leave, payroll and recruitment publish to it too.
export type WorkflowEventType =
  | 'approval.submitted'
  | 'approval.approved'
  | 'approval.refused'
  | 'approval.info_requested'

// How each event presents in the bell. Priority drives colour and, for
// 'critical', whether the recipient is allowed to have muted it.
export const EVENT_PRESENTATION: Record<
  WorkflowEventType,
  { category: NotificationCategory; priority: NotificationPriority }
> = {
  // Action required — someone is blocked until this person decides.
  'approval.submitted': { category: 'approvals', priority: 'high' },
  // Outcomes routed back to the submitter. Informational, not actionable.
  'approval.approved': { category: 'requests', priority: 'normal' },
  'approval.refused': { category: 'requests', priority: 'high' },
  // Returned for more information — actionable, and easy to miss if it is
  // styled like a rejection, so it gets its own event type rather than
  // being folded into 'refused'.
  'approval.info_requested': { category: 'requests', priority: 'high' },
}

export type StaffNotification = {
  id: string
  eventId: string
  eventType: string
  channel: NotificationChannel
  category: NotificationCategory
  priority: NotificationPriority
  title: string
  body: string | null
  href: string | null
  status: NotificationStatus
  createdAt: string
  // Entity the event happened to — lets the bell offer inline actions
  // without re-fetching the source record.
  entityType: string
  entityId: string
}

export const CATEGORY_LABEL: Record<NotificationCategory | 'all', string> = {
  all: 'All',
  approvals: 'Approvals',
  requests: 'Requests',
  mentions: 'Mentions',
  system: 'System',
}

export const PRIORITY_DOT: Record<NotificationPriority, string> = {
  critical: 'bg-rose-500',
  high: 'bg-amber-500',
  normal: 'bg-blue-500',
  info: 'bg-gray-300',
}
