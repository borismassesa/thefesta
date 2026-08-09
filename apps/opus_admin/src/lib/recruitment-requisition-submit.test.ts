import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  canSubmitRequisition,
  isSubmittableStatus,
  requisitionSubmitBlockers,
  submitRequisitionMessage,
  type RequisitionSubmitState,
} from './recruitment-requisition-submit'

/**
 * Regression cover for the bug where the requisition page offered "Submit for
 * approval" on any draft. When the draft was missing its salary band or budget
 * confirmation, `recruitment_submit_requisition` raised, the server action
 * rethrew the raw PostgREST error, and the user got the page-level
 * "This page failed to load" boundary showing `{code: ..., details: Null}`.
 */

const ready = (over: Partial<RequisitionSubmitState> = {}): RequisitionSubmitState => ({
  status: 'draft',
  hiring_manager_employee_id: 'emp-hm',
  recruiter_employee_id: 'emp-rec',
  salary_min_tzs: 1_200_000,
  salary_max_tzs: 1_800_000,
  budget_confirmed: true,
  ...over,
})

describe('requisitionSubmitBlockers', () => {
  it('a complete draft has nothing outstanding', () => {
    assert.deepEqual(requisitionSubmitBlockers(ready()), [])
  })

  it('names a missing hiring manager', () => {
    assert.deepEqual(requisitionSubmitBlockers(ready({ hiring_manager_employee_id: null })), [
      'Assign a hiring manager.',
    ])
  })

  it('names a missing recruiter', () => {
    assert.deepEqual(requisitionSubmitBlockers(ready({ recruiter_employee_id: null })), [
      'Assign a recruiter.',
    ])
  })

  it('treats a half-filled salary band as incomplete', () => {
    // The RPC requires both bounds, so either one alone must still block.
    for (const half of [{ salary_min_tzs: null }, { salary_max_tzs: null }]) {
      assert.deepEqual(requisitionSubmitBlockers(ready(half)), [
        'Set both the minimum and maximum salary.',
      ])
    }
  })

  it('names an unconfirmed budget', () => {
    assert.deepEqual(requisitionSubmitBlockers(ready({ budget_confirmed: false })), [
      'Confirm the budget for this request.',
    ])
  })

  it('a zero salary is a real value, not a missing one', () => {
    // An unpaid or nominal-salary role is still a complete band. Using a
    // falsy check here instead of a null check would wrongly block it.
    assert.deepEqual(requisitionSubmitBlockers(ready({ salary_min_tzs: 0 })), [])
  })

  it('reports every outstanding item at once', () => {
    const blockers = requisitionSubmitBlockers({
      status: 'draft',
      hiring_manager_employee_id: null,
      recruiter_employee_id: null,
      salary_min_tzs: null,
      salary_max_tzs: null,
      budget_confirmed: false,
    })
    // Listing them together is the point: fixing one at a time and pressing
    // submit again is the loop this replaced.
    assert.equal(blockers.length, 4)
  })
})

describe('isSubmittableStatus', () => {
  it('accepts the two states the RPC accepts', () => {
    assert.equal(isSubmittableStatus('draft'), true)
    assert.equal(isSubmittableStatus('changes_requested'), true)
  })

  it('rejects states that are already past submission', () => {
    for (const status of ['pending_department_approval', 'approved', 'recruiting', 'rejected']) {
      assert.equal(isSubmittableStatus(status), false, status)
    }
  })
})

describe('canSubmitRequisition', () => {
  it('is true only for a complete draft', () => {
    assert.equal(canSubmitRequisition(ready()), true)
  })

  it('is false once the requisition has moved on, even if complete', () => {
    assert.equal(canSubmitRequisition(ready({ status: 'pending_department_approval' })), false)
  })

  it('is false for a draft with anything outstanding', () => {
    assert.equal(canSubmitRequisition(ready({ budget_confirmed: false })), false)
  })
})

describe('submitRequisitionMessage', () => {
  it('translates each RPC guard into an instruction', () => {
    assert.match(
      submitRequisitionMessage({ message: 'Hiring manager and recruiter are required' }),
      /hiring manager and a recruiter/,
    )
    assert.match(
      submitRequisitionMessage({ message: 'Salary band and confirmed budget are required' }),
      /confirm the budget/,
    )
    assert.match(
      submitRequisitionMessage({ message: 'Only draft or returned requisitions can be submitted' }),
      /no longer a draft/,
    )
    assert.match(
      submitRequisitionMessage({ message: 'Requisition not found' }),
      /no longer exists/,
    )
  })

  it('falls back to something actionable for an unrecognised failure', () => {
    const message = submitRequisitionMessage({ message: 'some unexpected database failure' })
    assert.match(message, /could not be submitted/)
    // The raw database text must not reach the user.
    assert.equal(message.includes('some unexpected database failure'), false)
  })

  it('handles an error with no message at all', () => {
    assert.match(submitRequisitionMessage({}), /could not be submitted/)
    assert.match(submitRequisitionMessage({ message: null }), /could not be submitted/)
  })
})
