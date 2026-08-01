import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  DEFAULT_SENSITIVITY,
  DOCUMENT_SENSITIVITIES,
  canReadDocument,
  visibleDocuments,
  workspaceDocumentsFor,
  type DocumentViewer,
  type EmployeeDocumentRef,
} from './documents'

const SUBJECT = 'emp-subject'
const MANAGER = 'emp-manager'
const PEER = 'emp-peer'

const doc = (
  sensitivity: EmployeeDocumentRef['sensitivity'],
  employeeId = SUBJECT,
): EmployeeDocumentRef => ({ id: `doc-${sensitivity}`, employeeId, sensitivity })

const viewer = (over: Partial<DocumentViewer> = {}): DocumentViewer => ({
  isOwner: false,
  permissions: new Set(),
  employeeId: null,
  directReportIds: [],
  ...over,
})

const subjectViewer = viewer({ employeeId: SUBJECT })
const managerViewer = viewer({ employeeId: MANAGER, directReportIds: [SUBJECT] })
const peerViewer = viewer({ employeeId: PEER })
const peopleOps = viewer({
  employeeId: 'emp-hr',
  permissions: new Set(['workforce.employee_documents.read']),
})
const payrollViewer = viewer({
  employeeId: 'emp-pay',
  permissions: new Set(['workforce.payroll']),
})
const legalViewer = viewer({
  employeeId: 'emp-legal',
  permissions: new Set([
    'workforce.employee_documents.read',
    'workforce.employee_documents.legal',
  ]),
})
const ownerViewer = viewer({ isOwner: true, employeeId: 'emp-owner' })

describe('the employee (subject)', () => {
  it('reads their own shared_with_employee documents', () => {
    assert.equal(canReadDocument(subjectViewer, doc('shared_with_employee')).allowed, true)
  })
  it('cannot read manager_confidential about themselves', () => {
    assert.equal(canReadDocument(subjectViewer, doc('manager_confidential')).allowed, false)
  })
  it('cannot read people_ops, payroll, legal or restricted about themselves', () => {
    for (const s of ['people_ops_confidential', 'payroll_confidential', 'legal_confidential', 'restricted'] as const) {
      assert.equal(canReadDocument(subjectViewer, doc(s)).allowed, false, s)
    }
  })
  it('cannot read another employee’s shared document', () => {
    assert.equal(
      canReadDocument(subjectViewer, doc('shared_with_employee', PEER)).allowed,
      false,
    )
  })
})

describe('the direct manager', () => {
  it('reads shared_with_employee and manager_confidential for a report', () => {
    assert.equal(canReadDocument(managerViewer, doc('shared_with_employee')).allowed, true)
    assert.equal(canReadDocument(managerViewer, doc('manager_confidential')).allowed, true)
  })
  it('cannot read payroll, legal or restricted', () => {
    for (const s of ['payroll_confidential', 'legal_confidential', 'restricted'] as const) {
      assert.equal(canReadDocument(managerViewer, doc(s)).allowed, false, s)
    }
  })
  it('cannot read documents for a peer outside their scope', () => {
    assert.equal(
      canReadDocument(managerViewer, doc('manager_confidential', PEER)).allowed,
      false,
    )
  })
})

describe('a peer with no relationship', () => {
  it('reads nothing at all', () => {
    for (const s of DOCUMENT_SENSITIVITIES) {
      assert.equal(canReadDocument(peerViewer, doc(s)).allowed, false, s)
    }
  })
})

describe('permission-holders', () => {
  it('employee_documents.read sees people_ops but NOT payroll', () => {
    assert.equal(canReadDocument(peopleOps, doc('people_ops_confidential')).allowed, true)
    assert.equal(canReadDocument(peopleOps, doc('payroll_confidential')).allowed, false)
  })
  it('employee_documents.read alone cannot read legal', () => {
    assert.equal(canReadDocument(peopleOps, doc('legal_confidential')).allowed, false)
  })
  it('legal requires BOTH document read and the legal grant', () => {
    const legalOnly = viewer({ permissions: new Set(['workforce.employee_documents.legal']) })
    assert.equal(canReadDocument(legalOnly, doc('legal_confidential')).allowed, false)
    assert.equal(canReadDocument(legalViewer, doc('legal_confidential')).allowed, true)
  })
  it('payroll sees payroll but not legal or restricted', () => {
    assert.equal(canReadDocument(payrollViewer, doc('payroll_confidential')).allowed, true)
    assert.equal(canReadDocument(payrollViewer, doc('legal_confidential')).allowed, false)
    assert.equal(canReadDocument(payrollViewer, doc('restricted')).allowed, false)
  })
})

describe('restricted documents', () => {
  it('are owner-only', () => {
    assert.equal(canReadDocument(ownerViewer, doc('restricted')).allowed, true)
    assert.equal(canReadDocument(legalViewer, doc('restricted')).allowed, false)
  })
  it('require a stated reason even for the owner', () => {
    const d = canReadDocument(ownerViewer, doc('restricted'))
    assert.equal(d.allowed && d.requiresReason, true)
  })
  it('are the only class requiring a reason', () => {
    for (const s of DOCUMENT_SENSITIVITIES) {
      if (s === 'restricted') continue
      const d = canReadDocument(ownerViewer, doc(s))
      assert.equal(d.allowed && d.requiresReason, false, s)
    }
  })
})

describe('failing closed', () => {
  it('rejects an unrecognised sensitivity class', () => {
    const rogue = { id: 'x', employeeId: SUBJECT, sensitivity: 'public' as never }
    assert.equal(canReadDocument(ownerViewer, rogue).allowed, false)
  })
  it('defaults migrated rows to people_ops_confidential', () => {
    assert.equal(DEFAULT_SENSITIVITY, 'people_ops_confidential')
    // Which the subject themselves cannot read — the migration cannot widen.
    assert.equal(canReadDocument(subjectViewer, doc(DEFAULT_SENSITIVITY)).allowed, false)
  })
})

describe('visibleDocuments', () => {
  const all = DOCUMENT_SENSITIVITIES.map((s) => doc(s))
  it('gives the subject only their shared documents', () => {
    assert.deepEqual(
      visibleDocuments(subjectViewer, all).map((d) => d.sensitivity),
      ['shared_with_employee'],
    )
  })
  it('gives the manager shared plus manager_confidential', () => {
    assert.deepEqual(
      visibleDocuments(managerViewer, all).map((d) => d.sensitivity),
      ['shared_with_employee', 'manager_confidential'],
    )
  })
  it('gives a peer nothing', () => {
    assert.deepEqual(visibleDocuments(peerViewer, all), [])
  })
})

describe('workspaceDocumentsFor', () => {
  const mixed = [
    doc('shared_with_employee', SUBJECT),
    doc('manager_confidential', SUBJECT),
    doc('shared_with_employee', PEER),
  ]
  it('returns only the employee’s own shared documents', () => {
    const out = workspaceDocumentsFor(SUBJECT, mixed)
    assert.equal(out.length, 1)
    assert.equal(out[0].employeeId, SUBJECT)
    assert.equal(out[0].sensitivity, 'shared_with_employee')
  })
  it('is narrower than visibleDocuments for a manager viewing themselves', () => {
    // A manager in Workspace sees only what is shared with them, not the
    // manager_confidential files they could see about a report.
    const own = workspaceDocumentsFor(MANAGER, [
      doc('shared_with_employee', MANAGER),
      doc('manager_confidential', MANAGER),
    ])
    assert.deepEqual(own.map((d) => d.sensitivity), ['shared_with_employee'])
  })
})
