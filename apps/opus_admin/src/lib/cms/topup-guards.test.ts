import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// Three invariants of the invitation top-up that live in query predicates and
// branch ordering rather than in return values. Same technique and the same
// justification as release-card-guards.test.ts: each one can be undone by an
// edit that looks entirely reasonable, leaves the type-checker silent, and
// leaves every visible screen looking correct — while a designer stares at a
// job that does not exist, or a couple's paid capacity never arrives.

const designerQueueSrc = readFileSync(
  new URL('../../app/(admin)/opus-pass/digital-cards/designer/queries.ts', import.meta.url),
  'utf8',
)
const financeActionsSrc = readFileSync(
  new URL('../../app/(admin)/finance/payments/actions.ts', import.meta.url),
  'utf8',
)
const designBriefSrc = readFileSync(new URL('../design-brief-email.ts', import.meta.url), 'utf8')

function bodyOf(src: string, declaration: string): string {
  const start = src.indexOf(declaration)
  assert.notEqual(start, -1, `${declaration} has been renamed or removed`)
  const next = src.indexOf('\n}', start)
  return src.slice(start, next === -1 ? undefined : next)
}

describe('top-ups never reach a designer', () => {
  it('the design queue admits only purchases', () => {
    // A job's existence in the queue is derived from the ABSENCE of an
    // invitation_card_designs row, and a top-up never has one. Without this
    // filter every top-up ever bought becomes a permanently unstarted job:
    // counted in the summary tiles, breaching its SLA, and impossible to clear.
    const body = bodyOf(designerQueueSrc, 'export async function getDesignQueue')
    assert.ok(
      body.includes("eq('order_kind', 'purchase')"),
      'getDesignQueue no longer excludes top-ups — they will appear as unstartable design jobs',
    )
  })

  it('the design brief refuses to brief anyone on a top-up', () => {
    const body = bodyOf(designBriefSrc, 'export async function sendDesignBrief')
    assert.ok(
      body.includes("order_kind === 'topup'"),
      'sendDesignBrief no longer guards against top-ups — designers will be emailed a card that needs no making',
    )
  })
})

describe('approving a top-up releases it', () => {
  const body = bodyOf(financeActionsSrc, 'export async function approveDigitalCardPayment')

  it('sets fulfillment_status to ready in the same write as the payment', () => {
    // The entitlement query only counts orders at ready/delivered. A top-up has
    // no design job to move it there, so if approval does not do it, the couple
    // has paid for capacity that nothing will ever grant them.
    assert.ok(
      body.includes("fulfillment_status: 'ready'"),
      'approving a top-up no longer marks it ready — the paid capacity would never appear',
    )
    const statusWrite = body.indexOf("status: 'paid'")
    const readyWrite = body.indexOf("fulfillment_status: 'ready'")
    assert.ok(
      statusWrite !== -1 && readyWrite > statusWrite,
      'the ready flag must ride the same update as the payment, not a second round trip that can fail on its own',
    )
  })

  it('takes a branch that never sends a design brief', () => {
    // The top-up branch must come BEFORE the generic invitation branch, which
    // calls sendDesignBrief unconditionally.
    const topupBranch = body.indexOf('if (isTopup)')
    const briefCall = body.indexOf('sendDesignBrief')
    assert.notEqual(topupBranch, -1, 'the top-up branch has been removed from approval')
    assert.ok(
      topupBranch < briefCall,
      'the top-up branch must be checked before the branch that briefs designers',
    )
  })
})
