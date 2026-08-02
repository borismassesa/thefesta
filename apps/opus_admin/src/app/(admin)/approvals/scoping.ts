// Who a request belongs to, who it is waiting on, and who hears about it.
//
// These predicates were inline in ApprovalsClient and actions.ts, which meant
// the self-approval guard and the notification recipient list were two
// separate expressions that had to agree. They are the rules most likely to
// be quietly wrong, so they live here as pure functions with tests.

import type { ApprovalRequest } from './types'
import type { WorkflowEventType } from '@/lib/notifications/types'

function norm(email: string): string {
  return email.trim().toLowerCase()
}

export function isOwnedBy(request: ApprovalRequest, email: string): boolean {
  return norm(request.ownerEmail) === norm(email) && norm(email) !== ''
}

export function isApproverOn(request: ApprovalRequest, email: string): boolean {
  if (norm(email) === '') return false
  return request.approvers.some((a) => norm(a.email) === norm(email))
}

// Blocked on this person right now.
//
// Own requests are excluded unconditionally. Nothing in the approver picker
// stops someone adding themselves, and self-approval is not a decision, it is
// a control failure. Excluding here keeps it out of the inbox, the Overview
// list, the tab badge and the notification fan-out in one place.
export function isWaitingOn(request: ApprovalRequest, email: string): boolean {
  return (
    request.status === 'Submitted' &&
    !isOwnedBy(request, email) &&
    isApproverOn(request, email)
  )
}

// Requests this person may see on their own landing page: ones they raised, or
// ones routed to them. Not every request in the organisation — an admin's
// org-wide view belongs on the permission-gated Analytics tab.
export function isRelevantTo(request: ApprovalRequest, email: string): boolean {
  return isOwnedBy(request, email) || isApproverOn(request, email)
}

export type NotifyParty = { name: string; email: string }

// Who should be told about an event on this request.
//
// Submission goes to the approvers; every outcome goes back to the submitter.
// The actor is always removed: nobody needs an email about the thing they
// just did, and a self-approver would otherwise notify themselves.
export function notificationPartiesFor(
  request: ApprovalRequest,
  eventType: WorkflowEventType,
  actorEmail: string,
): NotifyParty[] {
  const parties: NotifyParty[] =
    eventType === 'approval.submitted'
      ? request.approvers.map((a) => ({ name: a.name, email: a.email }))
      : [{ name: request.owner, email: request.ownerEmail }]

  const seen = new Set<string>()
  return parties.filter((p) => {
    const key = norm(p.email)
    if (!key) return false
    if (key === norm(actorEmail)) return false
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
