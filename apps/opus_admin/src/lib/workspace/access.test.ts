// The access-state mapping is a policy decision, so it is pinned by tests
// rather than left to whoever next edits the switch. The cases that matter most
// are the ones where "obvious" is wrong: On Leave keeps full access, Resigned
// keeps documents, and dashboard_access=false beats every status.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertCapability,
  accessStateLabel,
  can,
  capabilitiesFor,
  denialCodeFor,
  EMPLOYEE_STATUSES,
  isEmployeeLifecycleStatus,
  isOnboarding,
  resolveAccessState,
  type WorkspaceAccessState,
} from './access'
import { WorkspaceError } from './errors'

const enabled = (status: string) => resolveAccessState({ status, dashboardAccess: true })

describe('resolveAccessState — lifecycle mapping', () => {
  it('grants full access to Active, On Leave and Onboarding', () => {
    assert.equal(enabled('Active'), 'full')
    assert.equal(enabled('On Leave'), 'full')
    assert.equal(enabled('Onboarding'), 'full')
  })

  it('leaves a resigned employee with their documents and nothing else', () => {
    assert.equal(enabled('Resigned'), 'documents_only')
    assert.equal(can('documents_only', 'documents.read'), true)
    assert.equal(can('documents_only', 'tools.use'), false)
    assert.equal(can('documents_only', 'workspace.write'), false)
    // Home itself is a live view of active work, so it is not reachable either.
    assert.equal(can('documents_only', 'workspace.read'), false)
  })

  it('restricts a suspended employee to reading, never acting', () => {
    assert.equal(enabled('Suspended'), 'read_only')
    assert.equal(can('read_only', 'workspace.read'), true)
    assert.equal(can('read_only', 'documents.read'), true)
    assert.equal(can('read_only', 'workspace.write'), false)
    assert.equal(can('read_only', 'tools.use'), false)
  })

  it('denies a terminated employee outright', () => {
    assert.equal(enabled('Terminated'), 'denied')
    assert.deepEqual(capabilitiesFor('denied'), [])
  })
})

describe('resolveAccessState — fail-closed rules', () => {
  it('lets dashboard_access=false override every status', () => {
    for (const status of EMPLOYEE_STATUSES) {
      assert.equal(
        resolveAccessState({ status, dashboardAccess: false }),
        'denied',
        `${status} must be denied when dashboard access is off`,
      )
    }
  })

  it('denies statuses the policy has not been taught', () => {
    for (const unknown of ['', 'active', 'Retired', 'ACTIVE', 'Contractor']) {
      assert.equal(enabled(unknown), 'denied', `unexpected grant for "${unknown}"`)
    }
  })

  it('recognises exactly the six known statuses', () => {
    assert.equal(isEmployeeLifecycleStatus('Active'), true)
    assert.equal(isEmployeeLifecycleStatus('active'), false)
    assert.equal(isEmployeeLifecycleStatus(null), false)
    assert.equal(EMPLOYEE_STATUSES.length, 6)
  })

  it('never grants a write capability outside full access', () => {
    const states: WorkspaceAccessState[] = ['read_only', 'documents_only', 'denied']
    for (const state of states) {
      assert.equal(can(state, 'workspace.write'), false)
      assert.equal(can(state, 'tools.use'), false)
    }
  })
})

describe('onboarding context', () => {
  it('flags onboarding without reducing access', () => {
    assert.equal(isOnboarding('Onboarding'), true)
    assert.equal(enabled('Onboarding'), 'full')
    assert.equal(isOnboarding('Active'), false)
  })
})

describe('assertCapability', () => {
  it('is silent when the capability is granted', () => {
    assert.doesNotThrow(() => assertCapability('full', 'workspace.write'))
  })

  it('throws a WorkspaceError describing the actual situation', () => {
    assert.throws(
      () => assertCapability('read_only', 'workspace.write'),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'read_only',
    )
    assert.throws(
      () => assertCapability('documents_only', 'workspace.read'),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'documents_only',
    )
    assert.throws(
      () => assertCapability('denied', 'documents.read'),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'access_denied',
    )
  })

  it('never leaks a raw message — every code has fixed employee-facing text', () => {
    const err = new WorkspaceError('read_only')
    assert.ok(err.message.length > 0)
    assert.ok(!err.message.includes('workforce_employees'))
  })
})

describe('denialCodeFor', () => {
  it('distinguishes read-only from documents-only from denied', () => {
    assert.equal(denialCodeFor('read_only', 'workspace.write'), 'read_only')
    assert.equal(denialCodeFor('documents_only', 'workspace.write'), 'documents_only')
    assert.equal(denialCodeFor('denied', 'workspace.read'), 'access_denied')
  })
})

describe('accessStateLabel', () => {
  it('labels every state', () => {
    const states: WorkspaceAccessState[] = ['full', 'read_only', 'documents_only', 'denied']
    for (const state of states) {
      assert.ok(accessStateLabel(state).length > 0)
    }
  })
})
