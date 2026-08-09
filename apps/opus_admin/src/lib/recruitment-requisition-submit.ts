/**
 * Preconditions a requisition draft must satisfy before it can be submitted.
 *
 * These mirror the guards inside the `recruitment_submit_requisition` RPC. The
 * database stays the authority; this exists so the draft page can say what is
 * missing instead of rendering a button that throws. Keep the two in the same
 * order so a change on either side is easy to spot.
 *
 * Deliberately pure and free of server-only imports so it can be unit tested
 * and used from either a server component or a client one.
 */

export type RequisitionSubmitState = {
  status: string
  hiring_manager_employee_id: string | null
  recruiter_employee_id: string | null
  salary_min_tzs: number | null
  salary_max_tzs: number | null
  budget_confirmed: boolean
}

/** Statuses the RPC accepts. Anything else is already past submission. */
export const SUBMITTABLE_REQUISITION_STATUSES = ['draft', 'changes_requested'] as const

export function isSubmittableStatus(status: string): boolean {
  return (SUBMITTABLE_REQUISITION_STATUSES as readonly string[]).includes(status)
}

/**
 * Human-readable list of what still has to happen, in the order the RPC checks
 * them. Empty means the draft is ready to submit.
 */
export function requisitionSubmitBlockers(requisition: RequisitionSubmitState): string[] {
  const blockers: string[] = []
  if (!requisition.hiring_manager_employee_id) blockers.push('Assign a hiring manager.')
  if (!requisition.recruiter_employee_id) blockers.push('Assign a recruiter.')
  // The RPC requires BOTH bounds, so one alone is still a blocker. Reported as
  // a single item because "set the salary band" is one action for the user.
  if (requisition.salary_min_tzs == null || requisition.salary_max_tzs == null) {
    blockers.push('Set both the minimum and maximum salary.')
  }
  if (!requisition.budget_confirmed) blockers.push('Confirm the budget for this request.')
  return blockers
}

export function canSubmitRequisition(requisition: RequisitionSubmitState): boolean {
  return (
    isSubmittableStatus(requisition.status) &&
    requisitionSubmitBlockers(requisition).length === 0
  )
}

/**
 * Turns a failed `recruitment_submit_requisition` call into something a person
 * can act on.
 *
 * The draft page hides the submit button until the preconditions are met, so a
 * failure here normally means the record changed underneath the user: a
 * colleague submitted it, or cleared the budget, between render and click.
 * Rethrowing the raw PostgREST object rendered
 * `{code: ..., details: Null, hint: ...}` on screen, which says nothing about
 * what to do next.
 */
export function submitRequisitionMessage(error: { message?: string | null }): string {
  const raw = error.message ?? ''
  if (raw.includes('Hiring manager and recruiter are required')) {
    return 'Assign both a hiring manager and a recruiter before submitting.'
  }
  if (raw.includes('Salary band and confirmed budget are required')) {
    return 'Set a minimum and maximum salary and confirm the budget before submitting.'
  }
  if (raw.includes('Only draft or returned requisitions can be submitted')) {
    return 'This requisition is no longer a draft. Reload the page to see its current state.'
  }
  if (raw.includes('Requisition not found')) {
    return 'This requisition no longer exists.'
  }
  return 'This requisition could not be submitted. Reload the page and try again.'
}
