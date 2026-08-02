// Leave request states and approval scope — pure, no I/O.
//
// Two things live here that the database also enforces:
//
//   The eight-state machine, so the UI offers only what exists.
//
//   canApprove(), which is the "managers cannot approve outside authorized
//   reporting scope" criterion. It walks the management chain rather than
//   trusting a role: holding the title "manager" does not make somebody your
//   manager, and approving leave for a person who does not report to you is the
//   quiet failure this prevents.

export const LEAVE_STATES = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'returned',
  'cancelled',
  'withdrawn',
] as const

export type LeaveState = (typeof LEAVE_STATES)[number]

export const LEAVE_STATE_LABELS: Record<LeaveState, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  returned: 'Returned for changes',
  cancelled: 'Cancelled',
  withdrawn: 'Withdrawn',
}

/** States in which the days are reserved against the calendar and the balance. */
export const COMMITTED_STATES: readonly LeaveState[] = ['submitted', 'under_review', 'approved']

/** States that are over. Nothing further happens to these. */
export const CLOSED_STATES: readonly LeaveState[] = [
  'rejected',
  'cancelled',
  'withdrawn',
]

export const LEAVE_ACTIONS = [
  'submit',
  'start_review',
  'approve',
  'reject',
  'return',
  'cancel',
  'withdraw',
] as const

export type LeaveAction = (typeof LEAVE_ACTIONS)[number]

/** owner = the person taking the leave. */
export type LeaveActor = 'owner' | 'approver' | 'hr'

type Rule = { from: readonly LeaveState[]; to: LeaveState; actors: readonly LeaveActor[] }

const RULES: Record<LeaveAction, Rule> = {
  submit: { from: ['draft', 'returned'], to: 'submitted', actors: ['owner'] },
  start_review: { from: ['submitted'], to: 'under_review', actors: ['approver', 'hr'] },
  approve: { from: ['submitted', 'under_review'], to: 'approved', actors: ['approver', 'hr'] },
  reject: { from: ['submitted', 'under_review'], to: 'rejected', actors: ['approver', 'hr'] },
  return: { from: ['submitted', 'under_review'], to: 'returned', actors: ['approver', 'hr'] },
  // Cancel is for leave already APPROVED: it produces a ledger reversal.
  cancel: { from: ['approved'], to: 'cancelled', actors: ['owner', 'approver', 'hr'] },
  // Withdraw is for leave not yet decided: nothing was taken, so nothing is
  // reversed. Keeping them separate is what lets a manager tell "they changed
  // their mind" from "they had it and gave it back".
  withdraw: { from: ['draft', 'submitted', 'under_review', 'returned'], to: 'withdrawn', actors: ['owner'] },
}

export type LeaveRefusal = 'invalid_from_state' | 'not_permitted_for_actor' | 'closed'

export type LeaveTransitionResult =
  | { ok: true; next: LeaveState }
  | { ok: false; reason: LeaveRefusal }

export function transition(
  state: LeaveState,
  action: LeaveAction,
  actor: LeaveActor,
): LeaveTransitionResult {
  if (CLOSED_STATES.includes(state)) return { ok: false, reason: 'closed' }
  const rule = RULES[action]
  if (!rule.from.includes(state)) return { ok: false, reason: 'invalid_from_state' }
  if (!rule.actors.includes(actor)) return { ok: false, reason: 'not_permitted_for_actor' }
  return { ok: true, next: rule.to }
}

export function canPerform(state: LeaveState, action: LeaveAction, actor: LeaveActor): boolean {
  return transition(state, action, actor).ok
}

export function availableActions(state: LeaveState, actor: LeaveActor): LeaveAction[] {
  return LEAVE_ACTIONS.filter((action) => canPerform(state, action, actor))
}

export function isCommitted(state: LeaveState): boolean {
  return COMMITTED_STATES.includes(state)
}

export function isClosed(state: LeaveState): boolean {
  return CLOSED_STATES.includes(state)
}

/** Only an approved request needs a ledger reversal when it ends early. */
export function needsReversal(state: LeaveState): boolean {
  return state === 'approved'
}

// ---------------------------------------------------------------------------
// Approval scope
// ---------------------------------------------------------------------------

export type ManagementChain = {
  /** employee id -> their manager's id, or null. */
  managerOf: Map<string, string | null>
}

/**
 * May `approverId` decide leave for `employeeId`?
 *
 * True when the approver is somewhere above them in the management chain, or
 * when they hold HR authority. Nobody approves their own leave, whatever the
 * chain says and whatever role they hold — that is checked first precisely
 * because an HR manager taking leave is the case where it would otherwise slip.
 *
 * Depth-capped and cycle-guarded: a bad org chart must not hang an approval.
 */
export function canApprove(input: {
  approverId: string
  employeeId: string
  chain: ManagementChain
  isHr?: boolean
  maxDepth?: number
}): boolean {
  if (input.approverId === input.employeeId) return false
  if (input.isHr) return true

  const seen = new Set<string>()
  let cursor = input.chain.managerOf.get(input.employeeId) ?? null
  let depth = 0
  const maxDepth = input.maxDepth ?? 10

  while (cursor && depth < maxDepth && !seen.has(cursor)) {
    if (cursor === input.approverId) return true
    seen.add(cursor)
    cursor = input.chain.managerOf.get(cursor) ?? null
    depth += 1
  }

  return false
}

export type ApprovalStep = { step: number; approver: string }

/**
 * Is the chain finished after this approval?
 *
 * A single-step chain finishes on the first approval. A two-step chain
 * (manager, then department lead) needs both, and the request stays under
 * review in between rather than looking decided.
 */
export function isFinalStep(chain: ApprovalStep[], currentStep: number): boolean {
  return currentStep >= Math.max(1, chain.length)
}

export function parseApprovalChain(value: unknown): ApprovalStep[] {
  if (!Array.isArray(value)) return [{ step: 1, approver: 'direct_manager' }]
  const steps: ApprovalStep[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    if (typeof item.approver !== 'string') continue
    steps.push({
      step: typeof item.step === 'number' ? item.step : steps.length + 1,
      approver: item.approver,
    })
  }
  // A policy with no usable chain still needs somebody to sign, so fall back to
  // the direct manager rather than approving itself.
  return steps.length > 0 ? steps.sort((a, b) => a.step - b.step) : [{ step: 1, approver: 'direct_manager' }]
}
