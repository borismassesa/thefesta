// The leave ledger — pure, no I/O.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: a balance is never a number somebody
// edits. It is the sum of a ledger. Every movement is a transaction with a kind
// that says why, and correcting a mistake means adding a reversal or an
// adjustment, never rewriting the entry that recorded it.
//
// Mirrors leave_reconcile_balance() in the migration, which writes the cached
// leave_balances row. These two computing the same answer is an acceptance
// criterion, and the verification suite checks it against a real database.

export const LEAVE_TRANSACTION_KINDS = [
  'opening_balance',
  'accrual',
  'usage',
  'reversal',
  'adjustment',
  'carryover',
  'expiry',
] as const

export type LeaveTransactionKind = (typeof LEAVE_TRANSACTION_KINDS)[number]

export const TRANSACTION_KIND_LABELS: Record<LeaveTransactionKind, string> = {
  opening_balance: 'Opening balance',
  accrual: 'Accrued',
  usage: 'Leave taken',
  reversal: 'Returned',
  adjustment: 'Adjustment',
  carryover: 'Carried over',
  expiry: 'Expired',
}

export type LeaveTransaction = {
  id: string
  kind: LeaveTransactionKind
  /** Positive credits the balance, negative debits it. */
  days: number
  effectiveDate: string
  reason: string | null
  requestId: string | null
  reversesTransactionId: string | null
  actorEmployeeId: string | null
}

export type LeaveBalance = {
  openingDays: number
  accruedDays: number
  carryoverDays: number
  usedDays: number
  adjustedDays: number
  expiredDays: number
  /** The sum of the whole ledger. */
  balanceDays: number
}

/** Rounds to the 3 decimals the numeric(7,3) columns store, so the TypeScript
 *  and SQL answers compare equal rather than differing in float noise.
 *
 *  The `+ 0` normalises negative zero. Negating an empty sum yields -0, which
 *  survives JSON and renders as "-0 days used" on a balance nobody has touched. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000 + 0
}

/**
 * Compute a balance from its transactions.
 *
 * `usedDays` and `expiredDays` are reported POSITIVE for display even though
 * they are stored negative: "used 4" reads better than "used -4", and the
 * signed values still sum to balanceDays.
 *
 * Reversals fold into `adjustedDays` alongside manual adjustments. Both are
 * corrections; splitting them would need a column nobody reads.
 */
export function computeBalance(transactions: LeaveTransaction[]): LeaveBalance {
  const sum = (kinds: LeaveTransactionKind[]) =>
    transactions.filter((t) => kinds.includes(t.kind)).reduce((acc, t) => acc + t.days, 0)

  return {
    openingDays: round(sum(['opening_balance'])),
    accruedDays: round(sum(['accrual'])),
    carryoverDays: round(sum(['carryover'])),
    usedDays: round(-sum(['usage'])),
    adjustedDays: round(sum(['adjustment', 'reversal'])),
    expiredDays: round(-sum(['expiry'])),
    balanceDays: round(transactions.reduce((acc, t) => acc + t.days, 0)),
  }
}

/**
 * Days that are spoken for but not yet taken.
 *
 * Deliberately NOT a ledger entry: nothing has happened yet, and putting it in
 * the ledger would mean a rejected request needed a reversal. It is shown
 * beside the balance so someone planning a holiday sees what is already
 * committed rather than discovering it at approval time.
 */
export function pendingDays(
  requests: { state: string; totalDays: number }[],
): number {
  return round(
    requests
      .filter((r) => r.state === 'submitted' || r.state === 'under_review')
      .reduce((acc, r) => acc + r.totalDays, 0),
  )
}

/** What is actually available to book: the balance, less what is pending. */
export function availableDays(balance: LeaveBalance, pending: number): number {
  return round(balance.balanceDays - pending)
}

export type BalanceCheck =
  | { ok: true; remaining: number }
  | { ok: false; reason: 'insufficient_balance'; short: number }

/**
 * Can this request be afforded?
 *
 * Pending days count against you. Two requests that each fit the balance but
 * together do not must not both be submittable, or the second approval quietly
 * takes someone negative.
 */
export function checkBalance(input: {
  balance: LeaveBalance
  pending: number
  requestedDays: number
  allowNegative: boolean
  isBalanceBased: boolean
}): BalanceCheck {
  // A type that does not draw down a balance (sick leave under most policies)
  // has nothing to check.
  if (!input.isBalanceBased || input.allowNegative) {
    return { ok: true, remaining: round(availableDays(input.balance, input.pending) - input.requestedDays) }
  }
  const available = availableDays(input.balance, input.pending)
  if (available < input.requestedDays) {
    return { ok: false, reason: 'insufficient_balance', short: round(input.requestedDays - available) }
  }
  return { ok: true, remaining: round(available - input.requestedDays) }
}

/**
 * The reversal entry that undoes a transaction.
 *
 * Equal and opposite, pointing back at what it reverses, and carrying a reason.
 * This is what cancelling approved leave produces instead of a delete.
 */
export function buildReversal(
  original: LeaveTransaction,
  reason: string,
  actorEmployeeId: string | null,
): Omit<LeaveTransaction, 'id' | 'effectiveDate'> & { kind: 'reversal' } {
  return {
    kind: 'reversal',
    days: -original.days,
    reason,
    requestId: original.requestId,
    reversesTransactionId: original.id,
    actorEmployeeId,
  }
}

/**
 * How much may carry into the next leave year.
 *
 * Capped by policy. Unlimited carryover turns leave into a liability nobody
 * planned for; the cap is why the figure is computed rather than copied.
 */
export function carryoverAmount(balance: LeaveBalance, maxCarryoverDays: number): number {
  if (balance.balanceDays <= 0) return 0
  return round(Math.min(balance.balanceDays, Math.max(0, maxCarryoverDays)))
}

/** A running balance for the history view, oldest first. */
export function withRunningBalance(
  transactions: LeaveTransaction[],
): (LeaveTransaction & { runningBalance: number })[] {
  const ordered = [...transactions].sort((a, b) =>
    a.effectiveDate === b.effectiveDate
      ? a.id.localeCompare(b.id)
      : a.effectiveDate.localeCompare(b.effectiveDate),
  )
  let running = 0
  return ordered.map((t) => {
    running = round(running + t.days)
    return { ...t, runningBalance: running }
  })
}

/**
 * Does the cache agree with the ledger?
 *
 * Used by the verification suite and available to an admin screen. A cache that
 * has drifted is a bug worth surfacing rather than silently trusting.
 */
export function reconciles(
  cached: LeaveBalance,
  transactions: LeaveTransaction[],
  tolerance = 0.001,
): boolean {
  const computed = computeBalance(transactions)
  return (Object.keys(computed) as (keyof LeaveBalance)[]).every(
    (key) => Math.abs(computed[key] - cached[key]) <= tolerance,
  )
}
