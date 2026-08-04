// "Leave balances reconcile from ledger transactions" and "cancelling approved
// leave creates a reversal rather than deleting history" are both decided here.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LEAVE_TRANSACTION_KINDS,
  TRANSACTION_KIND_LABELS,
  availableDays,
  buildReversal,
  carryoverAmount,
  checkBalance,
  computeBalance,
  pendingDays,
  reconciles,
  withRunningBalance,
  type LeaveTransaction,
} from './ledger'

let seq = 0
function tx(over: Partial<LeaveTransaction> & Pick<LeaveTransaction, 'kind' | 'days'>): LeaveTransaction {
  seq += 1
  return {
    id: `tx-${String(seq).padStart(3, '0')}`,
    effectiveDate: '2026-01-01',
    reason: null,
    requestId: null,
    reversesTransactionId: null,
    actorEmployeeId: null,
    ...over,
  }
}

describe('computeBalance', () => {
  it('sums a realistic year', () => {
    const ledger = [
      tx({ kind: 'opening_balance', days: 3 }),
      tx({ kind: 'carryover', days: 5 }),
      tx({ kind: 'accrual', days: 28 }),
      tx({ kind: 'usage', days: -10 }),
      tx({ kind: 'usage', days: -2.5 }),
      tx({ kind: 'adjustment', days: 1, reason: 'Goodwill day' }),
      tx({ kind: 'expiry', days: -2 }),
    ]
    const balance = computeBalance(ledger)
    assert.equal(balance.openingDays, 3)
    assert.equal(balance.carryoverDays, 5)
    assert.equal(balance.accruedDays, 28)
    assert.equal(balance.usedDays, 12.5, 'used is reported positive for display')
    assert.equal(balance.adjustedDays, 1)
    assert.equal(balance.expiredDays, 2)
    assert.equal(balance.balanceDays, 22.5, '3 + 5 + 28 - 12.5 + 1 - 2')
  })

  it('is zero for an empty ledger rather than undefined', () => {
    const balance = computeBalance([])
    assert.equal(balance.balanceDays, 0)
    assert.equal(balance.usedDays, 0)
  })

  it('handles a negative balance where the policy allowed borrowing', () => {
    const balance = computeBalance([tx({ kind: 'accrual', days: 5 }), tx({ kind: 'usage', days: -8 })])
    assert.equal(balance.balanceDays, -3)
  })

  it('keeps half days exact', () => {
    const balance = computeBalance([
      tx({ kind: 'accrual', days: 28 }),
      tx({ kind: 'usage', days: -0.5 }),
      tx({ kind: 'usage', days: -0.5 }),
      tx({ kind: 'usage', days: -0.25 }),
    ])
    assert.equal(balance.usedDays, 1.25)
    assert.equal(balance.balanceDays, 26.75)
  })

  it('labels every kind', () => {
    assert.equal(LEAVE_TRANSACTION_KINDS.length, 7)
    for (const kind of LEAVE_TRANSACTION_KINDS) {
      assert.ok(TRANSACTION_KIND_LABELS[kind].length > 0, kind)
    }
  })
})

describe('cancelling produces a reversal, not a deletion', () => {
  it('builds an equal and opposite entry pointing at the original', () => {
    const usage = tx({ kind: 'usage', days: -4, requestId: 'req-1' })
    const reversal = buildReversal(usage, 'Trip cancelled', 'emp-mgr')

    assert.equal(reversal.kind, 'reversal')
    assert.equal(reversal.days, 4)
    assert.equal(reversal.reversesTransactionId, usage.id)
    assert.equal(reversal.requestId, 'req-1')
    assert.equal(reversal.reason, 'Trip cancelled')
  })

  it('restores the balance without erasing the history', () => {
    const usage = tx({ kind: 'usage', days: -4, requestId: 'req-1' })
    const ledger = [tx({ kind: 'accrual', days: 28 }), usage]
    assert.equal(computeBalance(ledger).balanceDays, 24)

    const reversal = tx({ ...buildReversal(usage, 'Trip cancelled', null) })
    const after = [...ledger, reversal]

    assert.equal(computeBalance(after).balanceDays, 28, 'the days come back')
    assert.equal(
      computeBalance(after).usedDays,
      4,
      'and the record still shows leave WAS taken and then returned',
    )
    assert.equal(after.length, 3, 'nothing was deleted')
  })
})

describe('pending days', () => {
  it('counts only requests awaiting a decision', () => {
    const requests = [
      { state: 'submitted', totalDays: 3 },
      { state: 'under_review', totalDays: 2 },
      { state: 'approved', totalDays: 5 },
      { state: 'draft', totalDays: 10 },
      { state: 'rejected', totalDays: 4 },
    ]
    // Approved is already in the ledger; draft reserves nothing; rejected is over.
    assert.equal(pendingDays(requests), 5)
  })
})

describe('checkBalance', () => {
  const balance = computeBalance([tx({ kind: 'accrual', days: 10 })])

  it('allows a request that fits', () => {
    const result = checkBalance({
      balance, pending: 0, requestedDays: 4, allowNegative: false, isBalanceBased: true,
    })
    assert.deepEqual(result, { ok: true, remaining: 6 })
  })

  it('COUNTS PENDING DAYS against the balance', () => {
    // 10 days, 8 already pending: a 4-day request must not be allowed just
    // because the raw balance looks like enough.
    const result = checkBalance({
      balance, pending: 8, requestedDays: 4, allowNegative: false, isBalanceBased: true,
    })
    assert.deepEqual(result, { ok: false, reason: 'insufficient_balance', short: 2 })
  })

  it('does not check a type that draws down nothing', () => {
    const result = checkBalance({
      balance: computeBalance([]), pending: 0, requestedDays: 30,
      allowNegative: false, isBalanceBased: false,
    })
    assert.equal(result.ok, true, 'sick leave with no balance is still allowed')
  })

  it('permits borrowing when the policy says so', () => {
    const result = checkBalance({
      balance, pending: 0, requestedDays: 20, allowNegative: true, isBalanceBased: true,
    })
    assert.equal(result.ok, true)
  })

  it('allows a request that exactly exhausts the balance', () => {
    assert.equal(
      checkBalance({ balance, pending: 0, requestedDays: 10, allowNegative: false, isBalanceBased: true }).ok,
      true,
    )
  })
})

describe('availableDays', () => {
  it('is the balance less what is pending', () => {
    assert.equal(availableDays(computeBalance([tx({ kind: 'accrual', days: 12 })]), 3), 9)
  })
})

describe('carryoverAmount', () => {
  it('caps at the policy limit', () => {
    assert.equal(carryoverAmount(computeBalance([tx({ kind: 'accrual', days: 12 })]), 5), 5)
  })

  it('carries the whole balance when it is under the cap', () => {
    assert.equal(carryoverAmount(computeBalance([tx({ kind: 'accrual', days: 3 })]), 5), 3)
  })

  it('carries nothing from a negative balance', () => {
    const negative = computeBalance([tx({ kind: 'accrual', days: 2 }), tx({ kind: 'usage', days: -5 })])
    assert.equal(carryoverAmount(negative, 5), 0)
  })
})

describe('withRunningBalance', () => {
  it('produces a history that ends at the current balance', () => {
    const ledger = [
      tx({ kind: 'accrual', days: 28, effectiveDate: '2026-01-01' }),
      tx({ kind: 'usage', days: -5, effectiveDate: '2026-03-10' }),
      tx({ kind: 'usage', days: -2, effectiveDate: '2026-06-01' }),
    ]
    const rows = withRunningBalance(ledger)
    assert.deepEqual(rows.map((r) => r.runningBalance), [28, 23, 21])
    assert.equal(rows[rows.length - 1].runningBalance, computeBalance(ledger).balanceDays)
  })

  it('orders oldest first even when given out of order', () => {
    const rows = withRunningBalance([
      tx({ kind: 'usage', days: -5, effectiveDate: '2026-03-10' }),
      tx({ kind: 'accrual', days: 28, effectiveDate: '2026-01-01' }),
    ])
    assert.equal(rows[0].effectiveDate, '2026-01-01')
  })
})

describe('reconciles', () => {
  const ledger = [tx({ kind: 'accrual', days: 28 }), tx({ kind: 'usage', days: -3 })]

  it('agrees when the cache matches the ledger', () => {
    assert.equal(reconciles(computeBalance(ledger), ledger), true)
  })

  it('CATCHES a hand-edited balance', () => {
    // The exact failure the ledger design exists to make detectable.
    const tampered = { ...computeBalance(ledger), balanceDays: 99 }
    assert.equal(reconciles(tampered, ledger), false)
  })

  it('tolerates rounding at the third decimal', () => {
    const cached = computeBalance(ledger)
    assert.equal(reconciles({ ...cached, balanceDays: cached.balanceDays + 0.0005 }, ledger), true)
  })
})
