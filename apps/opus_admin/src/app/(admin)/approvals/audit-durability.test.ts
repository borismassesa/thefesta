import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { describe, it } from 'node:test'

// The property under test is "a decision cannot commit without its audit
// record". That property lives in a Postgres transaction, so it cannot be
// proved by calling a pure function. These are source-level guards instead:
// they fail if someone reintroduces the shape that made the bug possible.
//
// The original defect: transitionApprovalRequest updated the status over
// PostgREST, then called insertActivity(), which logged its own failure and
// returned void. The action then returned ok:true. An approved request with
// no attributable history was reachable through an ordinary error path.

const actionsSrc = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8')

const MIGRATIONS = new URL('../../../../../../supabase/migrations/', import.meta.url)
const migrationSrc = readFileSync(
  new URL('20260801175357_approvals_audit_durability.sql', MIGRATIONS),
  'utf8',
)

describe('no write path bypasses the audit transaction', () => {
  it('actions.ts never writes the request or activity tables directly', () => {
    // A direct PostgREST write is a write with no transaction around it, which
    // is exactly what could commit while its audit row failed. Every mutation
    // must go through a function that pairs the two.
    const direct = actionsSrc.match(
      /\.from\('(approval_requests|approval_request_activity)'\)\s*\.\s*(insert|update|delete|upsert)/g,
    )
    assert.equal(
      direct,
      null,
      `actions.ts writes approvals tables outside the audit transaction: ${direct?.join(', ')}`,
    )
  })

  it('all four mutations go through an atomic function', () => {
    for (const fn of [
      'approval_request_create',
      'approval_request_save',
      'approval_request_transition',
      'approval_request_note',
    ]) {
      assert.ok(
        actionsSrc.includes(`.rpc('${fn}'`),
        `${fn} is no longer called — a mutation may have regressed to a direct write`,
      )
    }
  })

  it('every rpc failure returns ok:false rather than falling through', () => {
    // Each rpc call must be followed by an error check that returns a failure.
    // Without this the action reports success on a rolled-back transaction.
    const calls = actionsSrc.split(/\.rpc\('/).slice(1)
    assert.equal(calls.length, 4, 'expected exactly four approvals rpc calls')
    for (const call of calls) {
      const window = call.slice(0, 1400)
      assert.match(
        window,
        // Generous gap: the branch carries a comment and a sanitized log call
        // before it returns. What matters is that it returns a failure at all.
        /if \(error[^)]*\) \{[\s\S]{0,500}?return \{ ok: false/,
        `an rpc call does not return ok:false on error:\n${window.slice(0, 160)}`,
      )
    }
  })

  it('the stale outcome is handled wherever the function can return it', () => {
    // transition and save are compare-and-swap; 'stale' means someone else won
    // the race and must not read as success.
    const staleHandlers = actionsSrc.match(/(data|outcome) === 'stale'/g)
    assert.ok(
      (staleHandlers?.length ?? 0) >= 2,
      `expected transition and save to handle 'stale', found ${staleHandlers?.length ?? 0}`,
    )
  })
})

describe('audit emission is independent of notification routing', () => {
  it('an empty recipient list does not short-circuit the workflow event', () => {
    // The regression: `if (recipients.length === 0) return undefined` sat
    // before emitWorkflowEvent, so a decision on a request with no resolvable
    // recipient was never recorded as an event at all. Whether anyone needs
    // telling is routing; whether the decision happened is a fact.
    const emitAt = actionsSrc.indexOf('emitWorkflowEvent(')
    assert.ok(emitAt > 0, 'emitWorkflowEvent call not found')
    const beforeEmit = actionsSrc.slice(0, emitAt)
    assert.ok(
      !/if \(recipients\.length === 0\)\s*return/.test(beforeEmit),
      'a no-recipients early return was reintroduced ahead of emitWorkflowEvent',
    )
  })

  it('the event carries a correlation id back to the activity row', () => {
    assert.match(
      actionsSrc,
      /correlation_id: correlationId/,
      'workflow_events no longer correlates to approval_request_activity',
    )
    assert.match(
      actionsSrc,
      /p_correlation_id: correlationId/,
      'the transition audit row no longer shares the event correlation id',
    )
  })
})

describe('the activity feed is append-only in the database, not in a comment', () => {
  it('a trigger blocks UPDATE and DELETE', () => {
    // RLS alone is decorative here: every application write uses the service
    // role, which bypasses policies. Only a trigger applies to it.
    assert.match(
      migrationSrc,
      /BEFORE UPDATE OR DELETE ON approval_request_activity/,
      'the append-only trigger is missing',
    )
    assert.match(migrationSrc, /RAISE EXCEPTION[\s\S]{0,120}append-only/)
  })

  it('the permissive FOR ALL write policy is gone', () => {
    assert.match(
      migrationSrc,
      /DROP POLICY IF EXISTS "approval_request_activity_write"/,
      'the FOR ALL policy that allowed rewriting history is still in place',
    )
  })

  it('actors are recorded by stable id, not display name alone', () => {
    for (const column of ['actor_employee_id', 'actor_auth_id', 'previous_status', 'new_status']) {
      assert.ok(
        migrationSrc.includes(column),
        `${column} is missing — decisions stay attributed to a mutable display name`,
      )
    }
  })
})

describe('the rpc surface is not publicly callable', () => {
  // Postgres grants EXECUTE to PUBLIC by default and PostgREST publishes the
  // result as an endpoint. An unrevoked function here is an unauthenticated
  // approval mutation.
  const created = [...migrationSrc.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)]
    .map((m) => m[1])
    .filter((name) => name !== 'approval_activity_append_only')

  it('finds the functions it is meant to be checking', () => {
    assert.ok(created.length >= 5, `expected >=5 functions, found ${created.join(', ')}`)
  })

  for (const name of new Set(created)) {
    it(`${name} is revoked from PUBLIC, anon and authenticated`, () => {
      const revoke = new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon, authenticated`,
      )
      assert.match(migrationSrc, revoke, `${name} is callable by unauthorized roles`)
    })
  }

  it('every function is SECURITY DEFINER', () => {
    // Caught in review: the migration described these as SECURITY DEFINER but
    // omitted the keyword. As INVOKER they run as service_role, which has no
    // EXECUTE grant on approval_activity_write, so every transition would have
    // failed with permission denied at runtime.
    const definitions = migrationSrc.split('CREATE OR REPLACE FUNCTION').slice(1)
    for (const def of definitions) {
      const name = def.match(/public\.(\w+)\(/)?.[1] ?? 'unknown'
      const header = def.slice(0, def.indexOf('AS $$'))
      assert.match(header, /SECURITY DEFINER/, `${name} is not SECURITY DEFINER`)
      // A definer function without a pinned search_path is resolvable against
      // a caller-controlled schema.
      assert.match(header, /SET search_path = public, pg_temp/, `${name} has an unpinned search_path`)
    }
  })

  it('the internal audit writer is granted to nobody', () => {
    assert.ok(
      !/GRANT EXECUTE ON FUNCTION public\.approval_activity_write/.test(migrationSrc),
      'approval_activity_write should only be reachable via its definer callers',
    )
  })

  it('the audit writer is revoked from service_role too', () => {
    // Verified against the applied database, not assumed: Supabase has an
    // ALTER DEFAULT PRIVILEGES rule granting EXECUTE on new public functions
    // to service_role, so "no GRANT statement" did NOT mean "no grant". The
    // audit writer was directly callable with the service key, which would
    // allow an audit row with arbitrary content and no matching state change.
    // Revoking is safe: the callers are SECURITY DEFINER and run as postgres.
    const followUp = readFileSync(
      new URL('20260801181438_approvals_audit_writer_service_role_revoke.sql', MIGRATIONS),
      'utf8',
    )
    assert.match(
      followUp,
      /REVOKE ALL ON FUNCTION public\.approval_activity_write\([^)]*\) FROM service_role/,
      'the default service_role grant on the audit writer is never revoked',
    )
  })
})

describe('the migration is present and ordered after the base schema', () => {
  it('sorts after the original approvals migration', () => {
    const names = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    const base = names.indexOf('20260526000004_approval_requests.sql')
    const audit = names.indexOf('20260801175357_approvals_audit_durability.sql')
    assert.ok(base >= 0, 'base approvals migration missing')
    assert.ok(audit > base, 'audit migration must apply after the table it alters')
  })
})
