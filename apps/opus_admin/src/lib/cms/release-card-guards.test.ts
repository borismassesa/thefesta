import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// Three properties of the release path that are orderings and predicates across
// database round trips, not values a pure function can return. Same technique
// and the same justification as card-release-ordering.test.ts: each one is a
// decision that can be undone by an edit that looks entirely reasonable and
// leaves every visible behaviour intact, which is exactly how the cluster of
// silent failures these replace got in.

const releaseSrc = readFileSync(new URL('./release-card.ts', import.meta.url), 'utf8')
const actionsSrc = readFileSync(
  new URL('../../app/(admin)/opus-pass/digital-cards/designer/actions.ts', import.meta.url),
  'utf8',
)

function bodyOf(src: string, declaration: string): string {
  const start = src.indexOf(declaration)
  assert.notEqual(start, -1, `${declaration} has been renamed or removed`)
  const next = src.indexOf('\n}', start)
  return src.slice(start, next === -1 ? undefined : next)
}

describe('a failed release is rolled back in the safe order', () => {
  it('deletes the release row before removing the storage object', () => {
    // Object first was the original order. If the row delete then failed, the
    // surviving row still looked live and pointed at an object that no longer
    // existed, so a guest send would resolve it and 404. Row first cannot
    // produce that: the worst case is an unreferenced object in a bucket.
    const body = bodyOf(releaseSrc, 'async function rollbackRelease')
    const row = body.indexOf("from('invitation_card_design_releases')")
    const object = body.indexOf('storage')

    assert.notEqual(row, -1, 'rollbackRelease no longer deletes the release row')
    assert.notEqual(object, -1, 'rollbackRelease no longer removes the storage object')
    assert.ok(
      row < object,
      'the storage object is removed before the release row, so a failed row delete would leave a live release pointing at a deleted object',
    )
  })

  it('reads the outcome of both rollback steps', () => {
    const body = bodyOf(releaseSrc, 'async function rollbackRelease')
    assert.ok(
      !body.includes('.catch(() => undefined)'),
      'a swallowing .catch is back. storage-js and postgrest-js report API failures as { error } rather than by rejecting, so it catches nothing and discards everything',
    )
    assert.equal(
      body.match(/logReleaseFailure\(/g)?.length,
      2,
      'each rollback step should report its own failure, so a stuck rollback is visible',
    )
  })
})

describe('two concurrent publishes cannot both win', () => {
  it('guards the release pointer write with a compare-and-set', () => {
    // Without this, both publishes insert a release, each writes its own id
    // over the other's, and the loser's release is left live with nothing
    // pointing at it. The callers' status guard does not catch it: 'ready' is
    // still 'ready' after the first publish lands.
    const body = bodyOf(releaseSrc, 'export async function releaseApprovedDesign')
    assert.match(
      body,
      /statusWrite\.eq\('current_release_id', previousReleaseId\)/,
      'the design update no longer compares-and-sets on the release it read',
    )
    assert.match(
      body,
      /statusWrite\.is\('current_release_id', null\)/,
      'the first release of a card no longer asserts that it is the first',
    )
    assert.match(
      body,
      /if \(error \|\| !written\)/,
      'the guarded update no longer distinguishes a failed write from a write that matched no row, so a lost race would be reported as success',
    )
  })
})

describe('the order tracker is never advanced on a failed read', () => {
  it('does not substitute an empty list for a failed sibling read', () => {
    // `(siblings ?? [])` is the shape of the original bug: an empty list has no
    // in-flight card in it, so the stage decision fell through to the most
    // advanced value and marked a couple's whole order Delivered.
    const body = bodyOf(actionsSrc, 'async function syncOrderStage')
    assert.ok(
      !/siblings \?\?/.test(body),
      'syncOrderStage is treating a failed read as an empty list again',
    )
    assert.match(
      body,
      /if \(readError \|\| !siblings\)/,
      'syncOrderStage no longer fails closed on a read error',
    )
    assert.ok(
      body.indexOf('if (!orderStage)') < body.indexOf("from('invitation_orders')"),
      'the order is written before the undecidable case is rejected',
    )
  })
})

describe('history writes are read, not discarded', () => {
  it('does not use the resolve-and-reject form that cannot see a postgrest error', () => {
    // postgrest-js resolves with { error } instead of rejecting, so
    // `.then(() => undefined, () => undefined)` sent every real failure down
    // the FULFILLED arm and dropped it. The rejection arm was dead code.
    const body = bodyOf(actionsSrc, 'async function recordDesignEvent')
    assert.ok(
      !/\.then\(\s*\(\) => undefined/.test(body),
      'recordDesignEvent is discarding its insert result again',
    )
    assert.match(
      body,
      /if \(error\)/,
      'recordDesignEvent no longer checks the error postgrest actually returns',
    )
  })
})
