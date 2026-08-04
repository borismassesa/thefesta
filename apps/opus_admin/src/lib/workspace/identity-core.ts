// Workspace employee identity resolution — the decision, without the I/O.
//
// Pure by design: the rules below are the security boundary of the whole
// Workspace module, so they are unit-tested directly rather than through a
// database. identity.ts does the fetching and calls in here to decide.
//
// Resolution order (a deliberate ladder, not a fallback chain):
//
//   1. Match the authenticated Clerk user id to workforce_employees.clerk_user_id.
//      An explicit link, made once, is the strongest signal there is.
//   2. Only if no link exists, match the normalized authenticated email.
//   3. Accept exactly one eligible match. Two matches is a data problem, and
//      guessing which of two people is signing in is the one failure mode this
//      module cannot have.
//   4. Persist the Clerk user id onto the row after a safe unique email match,
//      so step 2 never has to run again for that person.
//   5. Reject ambiguous, missing, or already-claimed identities.
//
// Note what is NOT here: authorization. A Terminated employee resolves fine and
// is then denied by access.ts. Keeping the two apart is what lets a denial be
// audited against a known employee instead of vanishing as "no match".

export type EmployeeIdentityCandidate = {
  id: string
  /** workforce_employees.clerk_user_id — null until the account is linked. */
  clerkUserId: string | null
  email: string
}

export type IdentityResolution =
  | {
      outcome: 'resolved'
      employeeId: string
      matchedBy: 'clerk_user_id' | 'email'
      /** True when the caller should write clerkUserId onto the row (step 4). */
      shouldPersistClerkId: boolean
    }
  /** No employee row matches this account at all. */
  | { outcome: 'no_match' }
  /** Several rows match the email; refusing to pick one. */
  | { outcome: 'ambiguous'; candidateCount: number }
  /** The only match is already linked to a different Clerk account. */
  | { outcome: 'conflict' }

/**
 * Lowercase and trim an authenticated email for comparison.
 *
 * Returns null for anything that is not plausibly an address, so a blank or
 * malformed claim can never become a lookup that matches a row by accident.
 */
export function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  const at = trimmed.indexOf('@')
  // Must have a local part, a domain, and exactly one '@'.
  if (at <= 0 || at === trimmed.length - 1) return null
  if (trimmed.indexOf('@', at + 1) !== -1) return null
  return trimmed
}

export type ResolveIdentityInput = {
  clerkUserId: string
  /** Already normalized via normalizeEmail, or null when unavailable. */
  email: string | null
  /**
   * Rows whose clerk_user_id equals clerkUserId. At most one, because the
   * column is UNIQUE — but passed as a list so a broken invariant surfaces as
   * 'ambiguous' rather than as a silently-picked first row.
   */
  byClerkId: readonly EmployeeIdentityCandidate[]
  /**
   * Rows whose lower(email) equals the normalized email. Usually at most one
   * (there is a unique index on lower(email) where the data allowed it), but
   * legacy duplicates are possible and must not resolve.
   */
  byEmail: readonly EmployeeIdentityCandidate[]
}

export function resolveIdentity(input: ResolveIdentityInput): IdentityResolution {
  // --- Step 1: the explicit link -------------------------------------------
  if (input.byClerkId.length > 1) {
    // Only reachable if the UNIQUE constraint on clerk_user_id is gone. Fail
    // closed rather than take [0].
    return { outcome: 'ambiguous', candidateCount: input.byClerkId.length }
  }
  if (input.byClerkId.length === 1) {
    return {
      outcome: 'resolved',
      employeeId: input.byClerkId[0].id,
      matchedBy: 'clerk_user_id',
      shouldPersistClerkId: false,
    }
  }

  // --- Step 2: the normalized email ----------------------------------------
  if (!input.email) return { outcome: 'no_match' }
  if (input.byEmail.length === 0) return { outcome: 'no_match' }

  // --- Step 3: exactly one ELIGIBLE match ----------------------------------
  // A row already linked to somebody else's Clerk account is not eligible: two
  // people share an inbox more often than anyone admits, and claiming a linked
  // row by email would hand one of them the other's Workspace.
  const eligible = input.byEmail.filter(
    (row) => row.clerkUserId === null || row.clerkUserId === input.clerkUserId,
  )

  if (eligible.length === 0) return { outcome: 'conflict' }
  if (eligible.length > 1) {
    return { outcome: 'ambiguous', candidateCount: eligible.length }
  }

  // Ambiguity is about who is signing in, so it is judged on eligible rows.
  // But a second row carrying the same address still means the directory has a
  // duplicate; identity.ts logs that, and the migration's unique index stops
  // new ones appearing.
  const match = eligible[0]

  // --- Step 4: persist the link --------------------------------------------
  return {
    outcome: 'resolved',
    employeeId: match.id,
    matchedBy: 'email',
    shouldPersistClerkId: match.clerkUserId === null,
  }
}

/** Map a non-resolving outcome to the error the employee should see. */
export function resolutionErrorCode(
  resolution: Exclude<IdentityResolution, { outcome: 'resolved' }>,
): 'no_employee_record' | 'ambiguous_identity' | 'identity_conflict' {
  switch (resolution.outcome) {
    case 'no_match': return 'no_employee_record'
    case 'ambiguous': return 'ambiguous_identity'
    case 'conflict': return 'identity_conflict'
  }
}
