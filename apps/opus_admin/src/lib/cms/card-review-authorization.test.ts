import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { checkSelfReview } from './card-review-authorization'

// The two-eyes rule on a wedding card is one boolean deep. If it says "not the
// assignee" the card is released, an immutable release row is written, and the
// couple's dashboard starts serving it. So the interesting cases here are not
// the matches — they are every way the lookup can fail to produce an answer.

type Reply = { data: { email: string | null } | null; error: { message: string } | null }

/** Minimal stand-in for the one PostgREST chain checkSelfReview uses. */
function fakeSupabase(reply: Reply, spy?: { table?: string; id?: string }) {
  return {
    from(table: string) {
      if (spy) spy.table = table
      return {
        select() {
          return {
            eq(_column: string, value: string) {
              if (spy) spy.id = value
              return { async maybeSingle() { return reply } }
            },
          }
        },
      }
    },
  } as unknown as Parameters<typeof checkSelfReview>[0]
}

const found = (email: string | null): Reply => ({ data: { email }, error: null })
const absent: Reply = { data: null, error: null }
const failed = (message: string): Reply => ({ data: null, error: { message } })

describe('a designer cannot approve their own card', () => {
  it('recognises the assignee', async () => {
    const out = await checkSelfReview(fakeSupabase(found('ada@opusfesta.com')), 'emp-1', 'ada@opusfesta.com')
    assert.deepEqual(out, { ok: true, isSelf: true })
  })

  it('matches regardless of case or surrounding space', async () => {
    // workforce_employees.email is only case-sensitively unique and Clerk hands
    // back whatever the person typed, so a capitalised address must not read as
    // a different human and open the gate.
    const out = await checkSelfReview(fakeSupabase(found('  Ada@OpusFesta.com ')), 'emp-1', 'ADA@opusfesta.com')
    assert.deepEqual(out, { ok: true, isSelf: true })
  })

  it('lets a different reviewer through', async () => {
    const out = await checkSelfReview(fakeSupabase(found('ada@opusfesta.com')), 'emp-1', 'grace@opusfesta.com')
    assert.deepEqual(out, { ok: true, isSelf: false })
  })

  it('reads the assignee by id from workforce_employees', async () => {
    const spy: { table?: string; id?: string } = {}
    await checkSelfReview(fakeSupabase(found('ada@opusfesta.com'), spy), 'emp-42', 'ada@opusfesta.com')
    assert.equal(spy.table, 'workforce_employees')
    assert.equal(spy.id, 'emp-42', 'the check must resolve the assignee actually named on the card')
  })
})

describe('a failed lookup refuses instead of allowing', () => {
  it('returns a failure when the read errored', async () => {
    // THE regression this file exists for. A transient PostgREST error used to
    // be indistinguishable from "not the assignee", so the one request that
    // could not establish ownership was the one that skipped the check.
    const out = await checkSelfReview(fakeSupabase(failed('canceling statement due to statement timeout')), 'emp-1', 'ada@opusfesta.com')
    assert.equal(out.ok, false)
  })

  it('surfaces the underlying reason so the failure is diagnosable', async () => {
    const out = await checkSelfReview(fakeSupabase(failed('schema cache miss')), 'emp-1', 'ada@opusfesta.com')
    assert.equal(out.ok, false)
    assert.match(out.ok === false ? out.error : '', /schema cache miss/)
  })

  it('refuses even when the errored read also returned a row', async () => {
    // PostgREST can hand back both. Partial data next to an error is not an
    // answer, and treating it as one is how the check silently half-works.
    const both: Reply = { data: { email: 'someone-else@opusfesta.com' }, error: { message: 'timeout' } }
    const out = await checkSelfReview(fakeSupabase(both), 'emp-1', 'ada@opusfesta.com')
    assert.equal(out.ok, false)
  })

  it('refuses when the caller has no resolvable identity', async () => {
    for (const email of ['', '   ']) {
      const out = await checkSelfReview(fakeSupabase(found('ada@opusfesta.com')), 'emp-1', email)
      assert.equal(out.ok, false, `an empty caller email (${JSON.stringify(email)}) must not pass the gate`)
    }
  })
})

describe('a missing assignee is an answer, not a failure', () => {
  it('allows review when the staff row is gone', async () => {
    // Deliberately NOT the error case: the read succeeded and there is no such
    // employee. Refusing here would strand the card with nobody able to
    // release it, which is why the two outcomes had to be separated at all.
    const out = await checkSelfReview(fakeSupabase(absent), 'emp-deleted', 'ada@opusfesta.com')
    assert.deepEqual(out, { ok: true, isSelf: false })
  })

  it('allows review when the assignee row has no email', async () => {
    const out = await checkSelfReview(fakeSupabase(found(null)), 'emp-1', 'ada@opusfesta.com')
    assert.deepEqual(out, { ok: true, isSelf: false })
  })

  it('allows review of an unassigned card without a round trip', async () => {
    const spy: { table?: string; id?: string } = {}
    const out = await checkSelfReview(fakeSupabase(absent, spy), null, 'ada@opusfesta.com')
    assert.deepEqual(out, { ok: true, isSelf: false })
    assert.equal(spy.table, undefined, 'nothing to look up when no one is assigned')
  })
})
