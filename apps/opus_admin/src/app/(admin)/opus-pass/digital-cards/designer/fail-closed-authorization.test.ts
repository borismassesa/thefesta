import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// The property under test is "an action that cannot establish WHO is acting, or
// WHO the card belongs to, refuses instead of proceeding". The decision logic
// itself is unit-tested in lib/cms/card-review-authorization.test.ts; what
// cannot be unit-tested is that every action in this file actually consults it
// and honours the refusal. These are source-level guards instead: they fail if
// someone reintroduces the shape that made the bug possible.
//
// The original defects, both fail-OPEN:
//
//   1. isSelfReview discarded the query `error`. A timeout or an RLS denial
//      produced data === null, indistinguishable from "the staff row was
//      deleted", and the function returned false — i.e. ALLOWED the review. It
//      is the only thing stopping an assignee approving their own card.
//
//   2. `(await getCallerEmail()) ?? 'unknown'`. An unresolvable identity became
//      a string that matches no assignee, so the self-review gate opened for
//      exactly the caller we could not name — and 'unknown' was then written
//      into released_by on an immutable release row.

const actionsSrc = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8')

/** Every `export async function` body in actions.ts, keyed by name. */
function actionBodies(): Map<string, string> {
  const bodies = new Map<string, string>()
  const starts = [...actionsSrc.matchAll(/export async function (\w+)/g)]
  starts.forEach((match, i) => {
    const from = match.index!
    const to = i + 1 < starts.length ? starts[i + 1].index! : actionsSrc.length
    bodies.set(match[1], actionsSrc.slice(from, to))
  })
  return bodies
}

// The actions that stamp an author onto a row: submitted_by, reviewed_by, or
// released_by via releaseApprovedDesign. Listed explicitly rather than derived,
// so adding an action that writes an author without resolving one is a failure
// here and not a silent omission.
const ATTRIBUTING_ACTIONS = [
  'submitForReview',
  'approveAndRelease',
  'requestChanges',
  'markDelivered',
  'saveAndPublishReleasedDesign',
]

// The two that cut or move a release, and so must not be performed by the
// person the card is assigned to.
const TWO_EYES_ACTIONS = ['approveAndRelease', 'saveAndPublishReleasedDesign']

describe('an unresolvable caller is never given a name', () => {
  it('nothing falls back to a placeholder author', () => {
    // Not just 'unknown': any literal default here re-creates the bug, because
    // the self-review gate compares the caller to the assignee by email and no
    // placeholder will ever match one.
    const fallback = actionsSrc.match(/getCallerEmail\(\)\s*\)?\s*(\?\?|\|\|)/g)
    assert.equal(
      fallback,
      null,
      `a default author was reintroduced: ${fallback?.join(', ')}`,
    )
  })

  it('getCallerEmail is only read through the refusing helper', () => {
    // One resolution point keeps the refusal from being optional. Two call
    // sites: the import, and resolveAuthor itself.
    const calls = actionsSrc.match(/getCallerEmail\(/g) ?? []
    assert.equal(calls.length, 1, `getCallerEmail is called ${calls.length} times; it should only be called by resolveAuthor`)
    const resolver = actionBodies().get('resolveAuthor') ?? actionsSrc.slice(actionsSrc.indexOf('async function resolveAuthor'))
    assert.ok(resolver.includes('getCallerEmail('), 'resolveAuthor no longer resolves the caller')
  })

  it('resolveAuthor returns a failure rather than a placeholder', () => {
    const start = actionsSrc.indexOf('async function resolveAuthor')
    assert.notEqual(start, -1, 'resolveAuthor has been renamed or removed')
    const body = actionsSrc.slice(start, actionsSrc.indexOf('\n}', start))
    assert.match(
      body,
      /if \(!author\) \{[\s\S]{0,400}?return \{\s*ok: false/,
      'resolveAuthor no longer refuses when the caller cannot be identified',
    )
  })

  for (const name of ATTRIBUTING_ACTIONS) {
    it(`${name} refuses when the caller cannot be identified`, () => {
      const body = actionBodies().get(name)
      assert.ok(body, `${name} has been renamed or removed`)
      assert.match(
        body!,
        /const caller = await resolveAuthor\(\)\s*\n\s*if \(!caller\.ok\) return caller/,
        `${name} does not resolve its author and bail out before writing`,
      )
      // The refusal has to come before anything is written, otherwise the row
      // moves and only the attribution is missing.
      const resolveAt = body!.indexOf('resolveAuthor()')
      for (const write of ['.update(', '.insert(', 'releaseApprovedDesign(']) {
        const writeAt = body!.indexOf(write)
        if (writeAt === -1) continue
        assert.ok(resolveAt < writeAt, `${name} performs ${write} before it has an identified author`)
      }
    })
  }
})

describe('a self-review check that could not run does not count as passing', () => {
  it('the check reports failure separately from its answer', () => {
    // A boolean cannot carry "I could not tell", which is precisely how the
    // failure used to be rendered as "not the assignee".
    const src = readFileSync(
      new URL('../../../../../lib/cms/card-review-authorization.ts', import.meta.url),
      'utf8',
    )
    assert.match(src, /\{ ok: true; isSelf: boolean \}/, 'the check no longer distinguishes its answer from its outcome')
    assert.match(src, /\{ ok: false; error: string \}/, 'the check can no longer report that it failed')
    assert.match(
      src,
      /const \{ data, error \} = await supabase/,
      'the assignee lookup discards its error again',
    )
    assert.match(
      src,
      /if \(error\) \{[\s\S]{0,400}?return \{\s*\n?\s*ok: false/,
      'a failed assignee lookup no longer refuses',
    )
  })

  it('actions.ts holds no second, unchecked assignee lookup', () => {
    // The gate is only fail-closed if there is exactly one way to ask.
    assert.ok(
      !/\.from\('workforce_employees'\)/.test(actionsSrc),
      'actions.ts queries workforce_employees directly again, bypassing checkSelfReview',
    )
  })

  for (const name of TWO_EYES_ACTIONS) {
    it(`${name} propagates a failed check instead of releasing`, () => {
      const body = actionBodies().get(name)
      assert.ok(body, `${name} has been renamed or removed`)
      assert.match(
        body!,
        /const selfReview = await checkSelfReview\([\s\S]{0,200}?\)\s*\n\s*if \(!selfReview\.ok\) return selfReview/,
        `${name} does not return the check's failure, so an unverifiable assignment would release the card`,
      )
      assert.match(
        body!,
        /if \(selfReview\.isSelf\) \{/,
        `${name} no longer blocks the assignee from reviewing their own card`,
      )
      // Both branches must precede the release, not follow it.
      const checkAt = body!.indexOf('checkSelfReview(')
      const releaseAt = body!.indexOf('releaseApprovedDesign(')
      assert.notEqual(releaseAt, -1, `${name} no longer cuts a release`)
      assert.ok(checkAt < releaseAt, `${name} releases the card before checking who it belongs to`)
    })
  }

  it('no caller treats the check result as a bare boolean', () => {
    // `if (await checkSelfReview(...))` is always truthy — an object — so the
    // gate would reject every reviewer. The opposite failure, and just as bad.
    assert.ok(
      !/if \(await checkSelfReview\(/.test(actionsSrc),
      'checkSelfReview is being awaited straight into a condition; its result is an object, not a boolean',
    )
  })
})

// The gate above is only worth anything if assigned_to is ever set. It was not:
// the column, its index, the queue column and checkSelfReview all existed, but
// NOTHING in the repo wrote it. So every card was unassigned, every self-review
// check returned isSelf: false, and the two-eyes rule — the only thing standing
// between a designer and approving their own uncancellable wedding card —
// silently passed for everyone.
//
// A gate with no writer is not a gate. These guard the writer.
describe('assigned_to has a writer', () => {
  it('starting a job records who started it', () => {
    const body = actionBodies().get('startDesignJob')
    assert.ok(body, 'startDesignJob has been renamed or removed')
    assert.match(
      body!,
      /assigned_to: callerEmployeeId/,
      'startDesignJob no longer assigns the job to whoever started it, so cards go back to being unowned',
    )
    assert.match(
      body!,
      /getCallerEmployeeId\(\)/,
      'startDesignJob no longer resolves the caller to an employee id',
    )
  })

  it('there is an explicit way to assign and to release', () => {
    const bodies = actionBodies()
    assert.ok(bodies.get('setDesignAssignee'), 'setDesignAssignee has been renamed or removed')
    assert.ok(bodies.get('claimDesignJob'), 'claimDesignJob has been renamed or removed')
  })

  it('claiming refuses when the caller has no employee record', () => {
    // getCallerEmployeeId returns null for an account with no directory row.
    // Passing that through would write assigned_to: null — silently releasing
    // the card instead of claiming it, which is the opposite of what was asked
    // AND reopens the two-eyes hole.
    const body = actionBodies().get('claimDesignJob')!
    assert.match(
      body,
      /if \(!employeeId\) \{[\s\S]{0,400}?return \{\s*\n?\s*ok: false/,
      'claimDesignJob no longer refuses when the caller cannot be resolved to an employee',
    )
  })

  it('assigning is permission-gated before it writes', () => {
    const body = actionBodies().get('setDesignAssignee')!
    assert.match(
      body,
      /await requirePermission\('digitalcards\.write'\)/,
      'setDesignAssignee is no longer permission-gated',
    )
    assert.ok(
      body.indexOf('requirePermission(') < body.indexOf('.update('),
      'setDesignAssignee writes before checking permission',
    )
  })

  it('assignment is a compare-and-set, not a blind overwrite', () => {
    // Two people pressing Take at the same instant must not both believe they
    // got the card — one of them would then be assigned to work they think is
    // theirs while the other is the one barred from approving it.
    const body = actionBodies().get('setDesignAssignee')!
    assert.match(
      body,
      /\.is\('assigned_to', null\)[\s\S]{0,200}?\.eq\('assigned_to', design\.assigned_to\)/,
      'setDesignAssignee no longer conditions its write on the previous holder',
    )
  })

  it('the assignee lookup stays out of actions.ts', () => {
    // Enforced by the "no second, unchecked assignee lookup" test above; this
    // states the positive half, so the helper cannot be quietly inlined back.
    assert.match(
      actionsSrc,
      /import \{ resolveAssignableEmployee \} from '@\/lib\/cms\/card-assignee'/,
      'the assignable-employee check has been inlined into actions.ts',
    )
  })
})
