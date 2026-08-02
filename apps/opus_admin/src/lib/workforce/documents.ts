// ---------------------------------------------------------------------------
// Employee document sensitivity — PURE.
// ---------------------------------------------------------------------------
// Implements section 3.4 of docs/WORKSPACE_WORKFORCE_ARCHITECTURE.md.
//
// Document access is a TWO-FACTOR decision:
//   the permission key says WHETHER you can read documents at all,
//   the sensitivity class says WHICH ones.
//
// Splitting documents out of workforce.employees.read matters because a
// manager who can see a profile must not automatically see salary letters,
// medical notes, disciplinary records, identity documents or bank details.
//
// The DB column ships in the same PR as a migration; this module is the policy
// and is testable without it.

import type { PermissionKey } from './permissions'

// Named for WHO may read, not for who the subject is. Revision 2 of the spec
// called the first class `employee_visible`, which wrongly implies "employee
// only" when the direct manager and People Ops can also read it.
export type DocumentSensitivity =
  | 'shared_with_employee'
  | 'manager_confidential'
  | 'people_ops_confidential'
  | 'payroll_confidential'
  | 'legal_confidential'
  | 'restricted'

export const DOCUMENT_SENSITIVITIES: readonly DocumentSensitivity[] = [
  'shared_with_employee',
  'manager_confidential',
  'people_ops_confidential',
  'payroll_confidential',
  'legal_confidential',
  'restricted',
] as const

/**
 * Default for rows that existed before the sensitivity column.
 *
 * Deliberately the RESTRICTIVE middle value: a migration must never widen
 * access. Reclassification is a deliberate People Ops action, and audited.
 */
export const DEFAULT_SENSITIVITY: DocumentSensitivity = 'people_ops_confidential'

export type EmployeeDocumentRef = {
  id: string
  employeeId: string
  sensitivity: DocumentSensitivity
}

export type DocumentViewer = {
  isOwner: boolean
  permissions: ReadonlySet<PermissionKey>
  /** The viewer's own employee id, or null for an Org-only administrator. */
  employeeId: string | null
  /** Employee ids the viewer manages (Team scope). */
  directReportIds: readonly string[]
}

export type DocumentAccess =
  | { allowed: true; requiresReason: false }
  // `restricted` reads demand a stated reason and always write an audit event.
  | { allowed: true; requiresReason: true }
  | { allowed: false; reason: string }

const denyMsg = 'You do not have access to this document.'

/**
 * Can this viewer read this document?
 *
 * Fails closed on an unrecognised class. Owner is allowed everywhere but still
 * carries requiresReason for `restricted`, so the audit trail is unbroken even
 * for the person who can see everything.
 */
export function canReadDocument(
  viewer: DocumentViewer,
  doc: EmployeeDocumentRef,
): DocumentAccess {
  const isSubject = viewer.employeeId !== null && viewer.employeeId === doc.employeeId
  const isManager = viewer.directReportIds.includes(doc.employeeId)
  const has = (k: PermissionKey) => viewer.permissions.has(k)
  const docReader = viewer.isOwner || has('workforce.employee_documents.read')

  switch (doc.sensitivity) {
    case 'restricted':
      // Owner only, reason mandatory, audit mandatory.
      return viewer.isOwner
        ? { allowed: true, requiresReason: true }
        : { allowed: false, reason: denyMsg }

    case 'legal_confidential':
      // Needs BOTH the document read permission and the explicit legal grant.
      // Never reachable through legacy expansion.
      return viewer.isOwner ||
        (has('workforce.employee_documents.read') &&
          has('workforce.employee_documents.legal'))
        ? { allowed: true, requiresReason: false }
        : { allowed: false, reason: denyMsg }

    case 'payroll_confidential':
      return viewer.isOwner || has('workforce.payroll')
        ? { allowed: true, requiresReason: false }
        : { allowed: false, reason: denyMsg }

    case 'people_ops_confidential':
      return docReader
        ? { allowed: true, requiresReason: false }
        : { allowed: false, reason: denyMsg }

    case 'manager_confidential':
      return docReader || isManager
        ? { allowed: true, requiresReason: false }
        : { allowed: false, reason: denyMsg }

    case 'shared_with_employee':
      return docReader || isManager || isSubject
        ? { allowed: true, requiresReason: false }
        : { allowed: false, reason: denyMsg }

    default:
      // Unknown class: fail closed rather than guess.
      return { allowed: false, reason: denyMsg }
  }
}

/** Filter a document list down to what the viewer may see. */
export function visibleDocuments<T extends EmployeeDocumentRef>(
  viewer: DocumentViewer,
  docs: readonly T[],
): T[] {
  return docs.filter((d) => canReadDocument(viewer, d).allowed)
}

/**
 * The Workspace Documents slice: an employee's OWN documents, restricted to
 * the class that is genuinely shared with them.
 *
 * Note this is narrower than `visibleDocuments` for the same person. A manager
 * viewing their own record in Workspace sees only shared_with_employee, not
 * the manager_confidential files they could see about a report.
 */
export function workspaceDocumentsFor<T extends EmployeeDocumentRef>(
  employeeId: string,
  docs: readonly T[],
): T[] {
  return docs.filter(
    (d) => d.employeeId === employeeId && d.sensitivity === 'shared_with_employee',
  )
}
