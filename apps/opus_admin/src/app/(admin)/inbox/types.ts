// Operations Inbox case model.
//
// The unit here is a CASE, not a message. One case holds many messages,
// internal notes and workflow events, and it carries the things operations
// actually run on: who owns it, what state it is in, and when the clock runs
// out. Email concepts (unread, starred, archived) are not enough on their own,
// so they sit alongside the case fields rather than standing in for them.
//
// Three dimensions are kept deliberately separate, because they answer
// different questions and report differently:
//   channel  — how it arrived (email, WhatsApp, a form, a system event)
//   category — what kind of work it is (booking inquiry, refund, incident)
//   team     — who owns it (Sales & Booking, Finance, Trust & Safety)

export type CaseChannel =
  | 'email'
  | 'contact_form'
  | 'booking_form'
  | 'whatsapp'
  | 'system_event'
  | 'vendor_portal'
  | 'customer_portal'
  | 'internal'

export type CaseCategory =
  | 'booking_inquiry'
  | 'client_support'
  | 'vendor_application'
  | 'vendor_support'
  | 'refund_request'
  | 'payout_dispute'
  | 'review_moderation'
  | 'technical_incident'

export type CaseTeam =
  | 'sales_booking'
  | 'customer_support'
  | 'vendor_success'
  | 'finance'
  | 'trust_safety'
  | 'technology'
  | 'operations'

// Active states are everything before resolved. `waiting_*` and `snoozed` stop
// the SLA clock; the others keep it running.
export type CaseStatus =
  | 'new'
  | 'open'
  | 'in_progress'
  | 'waiting_on_customer'
  | 'waiting_internal'
  | 'snoozed'
  | 'resolved'
  | 'closed'
  | 'spam'

export type CasePriority = 'low' | 'normal' | 'high' | 'urgent' | 'critical'

export type ResolutionReason =
  | 'inquiry_answered'
  | 'booking_converted'
  | 'refund_issued'
  | 'duplicate'
  | 'vendor_approved'
  | 'vendor_rejected'
  | 'issue_fixed'
  | 'no_response'
  | 'spam'
  | 'other'

export type PartyRole = 'client' | 'vendor' | 'system' | 'agent'

export type CaseParty = {
  name: string
  handle?: string
  role: PartyRole
  avatarColor: string
  initials: string
}

export type AttachmentKind =
  | 'image'
  | 'pdf'
  | 'doc'
  | 'sheet'
  | 'slide'
  | 'audio'
  | 'video'
  | 'archive'
  | 'other'

export type CaseAttachment = {
  id: string
  name: string
  kind: AttachmentKind
  mime?: string
  size: number
  url?: string
  thumbUrl?: string
}

export type CaseEventKind =
  | 'created'
  | 'routed'
  | 'assigned'
  | 'status_changed'
  | 'priority_changed'
  | 'sla_started'
  | 'sla_breached'
  | 'linked'
  | 'automation'
  | 'snoozed'
  | 'resolved'

// One chronological stream. Human messages, internal notes and system events
// all land here so the case reads as a single history rather than an email
// thread with the workflow hidden somewhere else.
export type TimelineEntry =
  | {
      kind: 'message'
      id: string
      at: string
      from: CaseParty
      direction: 'inbound' | 'outbound'
      body: string
      attachments?: CaseAttachment[]
    }
  | {
      kind: 'note'
      id: string
      at: string
      from: CaseParty
      body: string
      attachments?: CaseAttachment[]
    }
  | {
      kind: 'event'
      id: string
      at: string
      event: CaseEventKind
      actor: string
      detail: string
    }

export type LinkedKind =
  | 'booking'
  | 'client'
  | 'vendor'
  | 'application'
  | 'payment'
  | 'refund'
  | 'payout'
  | 'review'
  | 'task'
  | 'approval'
  | 'incident'

export type LinkedRecord = {
  kind: LinkedKind
  id: string
  label: string
  meta?: string
}

// Field lists rather than a fixed shape: a booking inquiry, a payout dispute
// and an incident all need a "what is this about" block, and none of them
// share columns. The panel renders whatever the case carries.
export type ContextField = { label: string; value: string }

export type CaseContext = {
  customer: {
    name: string
    email?: string
    phone?: string
    language?: string
    location?: string
    lifecycle?: string
    previousCases: number
  }
  record?: {
    title: string
    kind: LinkedKind
    fields: ContextField[]
  }
}

export type CaseSla = {
  // Absolute deadlines. Only one is live at a time: the first-response clock
  // until someone replies, then the resolution clock.
  firstResponseDueAt: string
  resolutionDueAt: string
  firstRespondedAt?: string
  // Set while the case waits on someone outside the team, or is snoozed.
  pausedReason?: 'waiting_on_customer' | 'snoozed'
}

export type CaseRecord = {
  id: string
  reference: string
  channel: CaseChannel
  category: CaseCategory
  team: CaseTeam
  subject: string
  preview: string
  requester: CaseParty
  openedAt: string
  lastActivityAt: string
  status: CaseStatus
  priority: CasePriority
  assignee: string | null
  followers: string[]
  mentionsMe?: boolean
  unread: boolean
  tags: string[]
  value?: number
  sla: CaseSla
  snoozedUntil?: string
  resolution?: { reason: ResolutionReason; at: string; by: string }
  context: CaseContext
  linked: LinkedRecord[]
  timeline: TimelineEntry[]
}

export type CategoryMeta = {
  key: CaseCategory
  label: string
  accent: string
  tint: string
  text: string
}
