// Server-side authority for "may this person move this request to that state".
//
// WHY THIS EXISTS
// transitionApprovalRequest previously checked only that the *target* status
// was a legal enum value. It never read the current state and never asked who
// the caller was, which meant anyone holding finance.read could:
//
//   - approve their own request (the self-approval guard was client-side only)
//   - approve a request they were not named on
//   - re-decide an already-approved or already-refused request
//   - approve something still sitting in the submitter's drafts
//
// In an approvals system that is the whole control. The UI hiding a button is
// not enforcement — the server action is the boundary, and this is it.
//
// Pure and exported so every rule is testable without a database.

import { isApproverOn, isOwnedBy } from './scoping'
import type { ApprovalRequest, ApprovalStatus } from './types'

export type DecisionKind = 'approve' | 'refuse' | 'info'

// One string for "you cannot see this", shared with the action layer so a
// caller can never distinguish a real request they are not part of from an id
// that does not exist.
export const NOT_VISIBLE = 'Request not found.'

export type TransitionCheck =
  | { ok: true }
  | { ok: false; reason: string }

export function validateTransition(
  request: ApprovalRequest,
  next: ApprovalStatus,
  actorEmail: string,
  decision?: { kind: DecisionKind },
): TransitionCheck {
  const current = request.status
  const isOwner = isOwnedBy(request, actorEmail)
  const isApprover = isApproverOn(request, actorEmail)

  // Participation is checked FIRST, and everyone else gets one uniform
  // answer. The specific reasons below describe the request's real state, so
  // handing them to a non-participant would confirm the request exists and
  // leak where it had got to. The action layer collapses this too; doing it
  // here as well means the pure function is safe for any future caller that
  // surfaces `reason` directly.
  if (!isOwner && !isApprover) {
    return { ok: false, reason: NOT_VISIBLE }
  }

  // A repeated click, a double-submitted form, or a stale tab acting on a
  // request someone else already decided. Rejecting is what makes the action
  // safe to retry.
  if (current === next && !(current === 'To Submit' && decision?.kind === 'info')) {
    return { ok: false, reason: `This request is already ${current}.` }
  }

  switch (next) {
    case 'Submitted': {
      if (current !== 'To Submit') {
        return { ok: false, reason: 'Only a draft can be submitted.' }
      }
      if (!isOwner) {
        return { ok: false, reason: 'Only the person who raised a request can submit it.' }
      }
      if (request.approvers.length === 0) {
        // Submitting with no approver routes to nobody and strands the
        // request in Submitted forever.
        return { ok: false, reason: 'Add at least one approver before submitting.' }
      }
      return { ok: true }
    }

    case 'Approved':
    case 'Refused': {
      if (current !== 'Submitted') {
        return {
          ok: false,
          reason:
            current === 'To Submit'
              ? 'This request has not been submitted yet.'
              : `This request was already ${current.toLowerCase()}.`,
        }
      }
      // The two rules that matter. Owner first, so a self-approver gets the
      // accurate reason rather than "not an approver".
      if (isOwner) {
        return { ok: false, reason: 'You cannot decide on a request you raised yourself.' }
      }
      if (!isApprover) {
        return { ok: false, reason: 'You are not an approver on this request.' }
      }
      return { ok: true }
    }

    case 'To Submit': {
      // Two different journeys land here: an approver sending it back for more
      // information, and someone reopening a decided request as a draft.
      if (decision?.kind === 'info') {
        if (current !== 'Submitted') {
          return { ok: false, reason: 'Only a submitted request can be sent back.' }
        }
        if (isOwner) {
          return { ok: false, reason: 'You cannot request information from yourself.' }
        }
        if (!isApprover) {
          return { ok: false, reason: 'You are not an approver on this request.' }
        }
        return { ok: true }
      }

      if (current !== 'Approved' && current !== 'Refused') {
        return { ok: false, reason: 'Only a decided request can be reopened.' }
      }
      // Reopening is not a decision, so the owner may do it — it returns the
      // request to their own drafts.
      if (!isOwner && !isApprover) {
        return { ok: false, reason: 'You are not involved in this request.' }
      }
      return { ok: true }
    }

    default:
      return { ok: false, reason: 'Unsupported transition.' }
  }
}
