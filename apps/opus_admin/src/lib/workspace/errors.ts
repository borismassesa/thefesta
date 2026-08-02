// Browser-safe errors for the Workspace module.
//
// Pure — no 'server-only', no imports. Client components render these messages,
// and a pure function exported from a server-only module breaks the Turbopack
// production build the moment a client component imports it.
//
// The rule this file exists to enforce: a raw database or provider error must
// never reach the browser. PostgREST puts row values into `message`, `details`
// and `hint` (a unique violation echoes back the colliding email address), and
// a mail provider echoes the recipient. Server code catches, logs the SQLSTATE
// via lib/log-safe, and returns one of the fixed messages below.

export type WorkspaceErrorCode =
  /** No Clerk session at all. */
  | 'not_signed_in'
  /** Signed in, but no employee row matches this account. */
  | 'no_employee_record'
  /** More than one employee row matches, so we refuse to guess. */
  | 'ambiguous_identity'
  /** The matching employee row is already linked to a different account. */
  | 'identity_conflict'
  /** Resolved, but this employee's access state forbids the surface. */
  | 'access_denied'
  /** Resolved with read-only access; the attempted action writes. */
  | 'read_only'
  /** Resolved with documents-only access; the attempted surface is a tool. */
  | 'documents_only'
  /** Something failed underneath. Deliberately says nothing about what. */
  | 'unavailable'

const MESSAGES: Record<WorkspaceErrorCode, string> = {
  not_signed_in: 'Sign in to open your Workspace.',
  no_employee_record:
    "We couldn't find an employee profile linked to your account. Ask People Ops to add you to the directory, or to link your existing record to this sign-in.",
  ambiguous_identity:
    'Your sign-in matches more than one employee profile, so we stopped rather than guess. Ask People Ops to merge the duplicates.',
  identity_conflict:
    'Your employee profile is already linked to a different sign-in. Ask People Ops to re-link it before using Workspace.',
  access_denied: 'Your account does not have access to Workspace. Ask People Ops if you think that is wrong.',
  read_only: 'Your Workspace is read-only right now, so this change was not saved. Ask People Ops for details.',
  documents_only:
    'Your Workspace access is limited to your own documents. This tool is only available to active employees.',
  unavailable: 'Workspace could not load that right now. Try again in a moment.',
}

export class WorkspaceError extends Error {
  readonly code: WorkspaceErrorCode

  constructor(code: WorkspaceErrorCode) {
    super(MESSAGES[code])
    this.name = 'WorkspaceError'
    this.code = code
  }
}

export function workspaceMessage(code: WorkspaceErrorCode): string {
  return MESSAGES[code]
}

/**
 * Reduce ANY thrown value to a message that is safe to render.
 *
 * A WorkspaceError is ours and its text is fixed, so it passes through. Every
 * other error — Supabase, Clerk, Resend, a TypeError — collapses to the generic
 * 'unavailable' line, because none of them can be trusted not to carry a row
 * value in their message. Call this at the boundary of every Workspace server
 * action; log the real error separately with logDbError/logProviderError.
 */
export function toSafeMessage(error: unknown): string {
  if (error instanceof WorkspaceError) return error.message
  return MESSAGES.unavailable
}

export function workspaceErrorCode(error: unknown): WorkspaceErrorCode {
  return error instanceof WorkspaceError ? error.code : 'unavailable'
}
