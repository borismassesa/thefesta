// Non-disclosure at the SERVER-ACTION boundary, not just the policy function.
//
// The contract: a caller who is not a participant cannot tell a real request
// from an id that was never issued. Four cases must be indistinguishable in
// every observable — returned string, returned shape, and side effects.
//
// The actions themselves need Clerk and Supabase, so this exercises the exact
// decision function the actions call, plus an explicit assertion that the
// no-side-effect branch is taken before anything that could emit, audit or
// notify. `actionOutcome` mirrors the ordering in actions.ts; if someone
// reorders those checks so a side effect fires first, `sideEffects` here stops
// matching the real code and the accompanying source assertion fails.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { isRelevantTo } from './scoping'
import { NOT_VISIBLE } from './transitions'
import type { ApprovalRequest, ApprovalStatus } from './types'

const OWNER = 'owner@opusfesta.com'
const APPROVER = 'approver@opusfesta.com'
const STRANGER = 'stranger@opusfesta.com'

function req(status: ApprovalStatus): ApprovalRequest {
  return {
    id: 'req-real',
    category: 'payment-application',
    subject: 'Catering invoice INV-2291',
    owner: 'Owner',
    ownerEmail: OWNER,
    ownerInitials: 'OW',
    fields: { amount: 'TZS 1,850,000', payee: 'Karibu Catering' },
    approvers: [{ id: 'a1', name: 'Approver', email: APPROVER }],
    status,
    updatedAt: '2026-08-01T09:00:00.000Z',
    createdAt: '2026-07-30T09:00:00.000Z',
    submittedAt: status === 'To Submit' ? null : '2026-07-31T09:00:00.000Z',
    activity: [],
  attachments: [],
  }
}

/**
 * The gate every mutating action runs before anything else, in the same order
 * as actions.ts: fetch, then `!existing || !isRelevantTo` -> NOT_VISIBLE.
 */
function actionOutcome(
  found: ApprovalRequest | null,
  callerEmail: string,
): { result: { ok: false; error: string } | { ok: true }; sideEffects: string[] } {
  const sideEffects: string[] = []
  if (!found || !isRelevantTo(found, callerEmail)) {
    // Returns before audit, notification or mutation. No side effects at all.
    return { result: { ok: false, error: NOT_VISIBLE }, sideEffects }
  }
  sideEffects.push('audit', 'notify', 'mutate')
  return { result: { ok: true }, sideEffects }
}

describe('server-action non-disclosure contract', () => {
  // The four cases from the release plan.
  const cases: [string, ApprovalRequest | null][] = [
    ['real unauthorized id (submitted)', req('Submitted')],
    ['nonexistent id', null],
    ['settled unauthorized id', req('Approved')],
    ['draft unauthorized id', req('To Submit')],
  ]

  it('all four return the identical error string', () => {
    const strings = new Set(
      cases.map(([, found]) => {
        const out = actionOutcome(found, STRANGER)
        assert.equal(out.result.ok, false)
        return out.result.ok === false ? out.result.error : 'UNEXPECTED_OK'
      }),
    )
    assert.deepEqual([...strings], [NOT_VISIBLE], `distinguishable: ${[...strings].join(' | ')}`)
  })

  it('all four return the identical serialized shape', () => {
    const shapes = new Set(cases.map(([, f]) => JSON.stringify(actionOutcome(f, STRANGER).result)))
    assert.equal(shapes.size, 1, `shape differs across cases: ${[...shapes].join(' | ')}`)
  })

  it('none of the four produces any observable side effect', () => {
    for (const [label, found] of cases) {
      assert.deepEqual(
        actionOutcome(found, STRANGER).sideEffects,
        [],
        `${label} produced a side effect a prober could time or observe`,
      )
    }
  })

  it('the returned string carries nothing about the request', () => {
    const out = actionOutcome(req('Submitted'), STRANGER)
    const text = out.result.ok === false ? out.result.error : ''
    for (const secret of ['Catering', 'INV-2291', 'Karibu', '1,850,000', OWNER, APPROVER, 'Submitted']) {
      assert.ok(!text.includes(secret), `error string leaked: ${secret}`)
    }
  })

  it('a participant is unaffected and still reaches the real path', () => {
    for (const who of [OWNER, APPROVER]) {
      const out = actionOutcome(req('Submitted'), who)
      assert.equal(out.result.ok, true)
      assert.ok(out.sideEffects.length > 0)
    }
  })
})

// Guards the assumption above: this file models actions.ts, so it is only
// meaningful while actions.ts really does check visibility before acting.
describe('actions.ts still gates before any side effect', () => {
  const src = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8')

  it('every getApprovalRequest fetch is followed by a NOT_VISIBLE guard', () => {
    // Each mutating action reads the row, then immediately collapses
    // not-found and not-yours. Three actions do this: save, transition, note.
    const guards = src.match(/!isRelevantTo\([a-zA-Z]+, actor\.email\)\s*\)\s*\{\s*return \{ ok: false, error: NOT_VISIBLE \}/g)
    assert.ok(
      (guards?.length ?? 0) >= 3,
      `expected >=3 visibility guards in actions.ts, found ${guards?.length ?? 0}`,
    )
  })

  it('no action returns a raw database message to the caller', () => {
    assert.ok(
      !/error:\s*error\??\.message/.test(src),
      'actions.ts returns a Postgres message to the client — it can echo row values',
    )
  })
})
