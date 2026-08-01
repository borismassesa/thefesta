// Deterministic re-rendering of a notification email from persisted data.
//
// WHY THIS EXISTS
// The retry worker claims a `staff_notifications` row and has to send it. The
// row carries title/body/href — enough for a bell entry, nowhere near enough
// to rebuild a transactional email. Without this the claim function would hand
// a worker a row it could not act on, and "retry" would be a column nobody
// could honour.
//
// The alternative was storing the rendered subject/html/text on every row.
// Re-rendering from a payload is better: rows stay small, and a template bug
// fixed today also fixes every message still queued from yesterday.
//
// The payload is written to `workflow_events.metadata.email_payload` at emit
// time. Treat it as a persisted contract: fields may be added, but renaming or
// removing one silently breaks retry for every message already in the queue.

import {
  buildApprovedEmail,
  buildInfoRequestedEmail,
  buildRefusedEmail,
  buildSubmittedEmail,
  type ApprovalEmailInput,
} from '@/lib/approval-email'
import type { WorkflowEventType } from './types'

export type RenderedEmail = { subject: string; html: string; text: string }

// Serialisable form of ApprovalEmailInput. Kept structurally identical so the
// builders can consume it directly, but declared separately to make it obvious
// that this shape is written to the database and cannot be changed freely.
export type PersistedEmailPayload = {
  approvalSubject: string
  approvalCategory: string
  approvalLink: string
  submitter: { name: string; email: string; role?: string | null }
  actor: { name: string; email: string; role?: string | null }
  note?: string | null
}

const BUILDERS: Record<WorkflowEventType, (input: ApprovalEmailInput) => RenderedEmail> = {
  'approval.submitted': buildSubmittedEmail,
  'approval.approved': buildApprovedEmail,
  'approval.refused': buildRefusedEmail,
  'approval.info_requested': buildInfoRequestedEmail,
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function asParty(v: unknown): { name: string; email: string; role?: string | null } | null {
  if (!isRecord(v)) return null
  if (typeof v.name !== 'string' || typeof v.email !== 'string') return null
  return {
    name: v.name,
    email: v.email,
    role: typeof v.role === 'string' ? v.role : null,
  }
}

// Validates a payload read back out of jsonb. Returns null rather than
// throwing: a worker that hits one malformed row must skip it and carry on,
// not die and stall the whole queue.
export function parseEmailPayload(value: unknown): PersistedEmailPayload | null {
  if (!isRecord(value)) return null
  const submitter = asParty(value.submitter)
  const actor = asParty(value.actor)
  if (!submitter || !actor) return null
  if (
    typeof value.approvalSubject !== 'string' ||
    typeof value.approvalCategory !== 'string' ||
    typeof value.approvalLink !== 'string'
  ) {
    return null
  }
  return {
    approvalSubject: value.approvalSubject,
    approvalCategory: value.approvalCategory,
    approvalLink: value.approvalLink,
    submitter,
    actor,
    note: typeof value.note === 'string' ? value.note : null,
  }
}

export function isWorkflowEventType(value: unknown): value is WorkflowEventType {
  return typeof value === 'string' && value in BUILDERS
}

// For a submitted request the "actor" slot in the template is the *recipient*
// (the approver being addressed), not the person who submitted. The emitter
// substitutes per recipient; retry has to reproduce that or every approver
// gets an email addressed to whoever happened to be first.
export function renderNotificationEmail(
  eventType: WorkflowEventType,
  payload: PersistedEmailPayload,
  recipient: { name: string; email: string },
): RenderedEmail {
  const input: ApprovalEmailInput =
    eventType === 'approval.submitted'
      ? { ...payload, actor: { name: recipient.name, email: recipient.email, role: null } }
      : payload
  return BUILDERS[eventType](input)
}
