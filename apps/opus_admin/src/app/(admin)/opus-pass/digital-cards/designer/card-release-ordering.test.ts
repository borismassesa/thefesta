import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// The property under test is "a published update freezes the CORRECTED values,
// not the ones it replaced". That property is an ordering between two database
// round trips, so it cannot be proved by calling a pure function. This is a
// source-level guard instead: it fails if someone reintroduces the shape that
// would make the bug possible.
//
// Why the ordering is invisible: freezeCardRelease does not take field values
// as an argument. It re-reads them from invitation_card_designs itself, and
// releaseApprovedDesign is handed the PRE-update design snapshot, from which it
// only uses id, order_id and status. So saveAndPublishReleasedDesign is correct
// solely because its .update({ field_values }) completes first. Reverse the two
// calls, or make the update conditional on the values having changed, and the
// action still returns ok:true, still inserts a release row, still moves
// current_release_id, and still marks the old release superseded. The only
// difference is that the frozen SVG holds the old values, permanently, with an
// audit trail asserting the correction was published.

const actionsSrc = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8')

function saveAndPublishBody(): string {
  const start = actionsSrc.indexOf('export async function saveAndPublishReleasedDesign')
  assert.notEqual(start, -1, 'saveAndPublishReleasedDesign has been renamed or removed')
  const next = actionsSrc.indexOf('\nexport ', start + 1)
  return actionsSrc.slice(start, next === -1 ? undefined : next)
}

describe('a published update freezes the corrected values', () => {
  it('writes field_values before cutting the release', () => {
    const body = saveAndPublishBody()
    const write = body.indexOf('field_values: merged')
    const release = body.indexOf('releaseApprovedDesign(')

    assert.notEqual(write, -1, 'saveAndPublishReleasedDesign no longer persists the merged values')
    assert.notEqual(release, -1, 'saveAndPublishReleasedDesign no longer cuts a release')
    assert.ok(
      write < release,
      'releaseApprovedDesign runs before the merged values are written, so the release would freeze the values it was meant to correct',
    )
  })

  it('persists the values unconditionally rather than only when they changed', () => {
    // Skipping the write when merged deep-equals the stored values looks like a
    // harmless optimisation and is not: freezeCardRelease reads the row, so the
    // release still has to be cut from a row this action has committed.
    //
    // Anchored on indentation rather than by scanning for an enclosing `if`.
    // The statement destructures, so any brace-counting regex trips over the
    // pattern's own `}` and silently matches nothing. Two spaces means top
    // level of the function; nesting it in any block indents it further.
    const body = saveAndPublishBody()
    assert.match(
      body,
      /\n {2}const \{ data: savedDesign, error: updateError \} = await supabase/,
      'the field_values write is no longer an unconditional top-level statement',
    )
  })

  it('freezeCardRelease still re-reads the values it freezes', () => {
    // If this ever changes to take values as an argument the ordering above
    // stops mattering, and this guard should be deleted rather than left to rot.
    const releaseSrc = readFileSync(
      new URL('../../../../../lib/cms/release-card.ts', import.meta.url),
      'utf8',
    )
    assert.match(
      releaseSrc,
      /\.select\('product_id, order_id, field_values'\)/,
      'freezeCardRelease no longer re-reads field_values, so revisit card-release-ordering.test.ts',
    )
  })
})
