import {
  canApprove,
  resolveReadScope,
  type ApprovalDecision,
  type ReadScope,
} from '@/lib/workforce/approvals'
import type { CallerScope } from '@/lib/workforce/scope'

// Pure leave-approval policy. Composes the shared primitives rather than
// re-deriving manager detection: canApprove already checks self-approval FIRST
// (so an org key cannot buy your own signature) and then Org permission, then
// direct reports. All this module adds is the leave-specific transition rule.
//
// ORG PERMISSION USED THROUGHOUT: workforce.leave.approve. Legacy
// workforce.write expands into it, so today's approvers keep working.

export const LEAVE_APPROVE_PERMISSION = 'workforce.leave.approve'

export type DecidableRequest = {
  id: string
  employeeId: string
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'
}

export type LeaveDecision = 'Approved' | 'Rejected'

/**
 * May this caller decide this request, and is the request in a decidable
 * state?
 *
 * Authority and transition are separate questions and both must pass. The
 * authority check runs first so that an out-of-scope caller is told they lack
 * authority rather than learning the request's current status, which is itself
 * information about someone else's leave.
 */
export function canDecideLeaveRequest(
  request: DecidableRequest,
  scope: CallerScope,
): ApprovalDecision {
  const authority = canApprove(request, scope, LEAVE_APPROVE_PERMISSION)
  if (!authority.allowed) return authority

  if (request.status !== 'Pending') {
    return {
      allowed: false,
      reason: `That request is already ${request.status.toLowerCase()} and cannot be decided again.`,
    }
  }
  return { allowed: true }
}

/**
 * Which employees' requests should the leave list read?
 *
 * Returned so the DATABASE query can be scoped, rather than fetching
 * organisation-wide rows and filtering in memory. `scopeAll` is org tier;
 * an explicit id list is team tier; an EMPTY list means a manager with no
 * current direct reports, which yields no rows rather than falling back to
 * department or organisation scope.
 */
export type LeaveReadScope = ReadScope

export function leaveReadScope(scope: CallerScope): LeaveReadScope {
  // Delegates to the shared primitive; only the org keys are leave-specific.
  return resolveReadScope(scope, ['workforce.leave.read', LEAVE_APPROVE_PERMISSION])
}
