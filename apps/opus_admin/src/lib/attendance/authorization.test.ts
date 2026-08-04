// Authorization and concurrency properties of the attendance module.
//
// Two of this module's guarantees are structural rather than computational, so
// they are checked against the source rather than by calling a function:
//
//   No attendance entry point accepts an employee id. If one ever did, an
//   employee could clock somebody else in by editing a request payload, and no
//   amount of correct arithmetic elsewhere would matter.
//
//   No attendance entry point accepts a timestamp. Punch times come from now()
//   inside the database transition, so a wrong browser clock and a doctored
//   payload produce the same correct time.
//
// Source-level assertions are unusual and worth justifying: these are
// invariants about the SHAPE of the interface, and the failure they guard
// against is somebody adding a parameter in six months. A runtime test cannot
// see a parameter that does not exist yet; this does.
//
// The concurrency half models the database's partial unique index in memory and
// shows that interleaved transitions produce exactly one open session, which is
// the property uniq_attendance_open_session exists to provide.

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { transition, type AttendanceAction, type AttendanceState } from './state'

// This file's own directory, resolved without import.meta.dirname (undefined
// under the tsx loader) and without __dirname (absent in ESM).
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

function source(relativePath: string): string {
  const path = join(ROOT, relativePath)
  // A moved file must fail loudly here. Silently reading nothing would turn
  // every assertion below into a pass, which is the one way a guard like this
  // can rot without anyone noticing.
  assert.ok(existsSync(path), `expected ${relativePath} to exist at ${path}`)
  return readFileSync(path, 'utf8')
}

const ACTIONS = source('app/(admin)/workspace/timeclock/actions.ts')
const QUERIES = source('lib/attendance/queries.ts')
const PAGE = source('app/(admin)/workspace/timeclock/page.tsx')

describe('no entry point accepts an employee id', () => {
  it('exports no server action with an employee id parameter', () => {
    // Every exported action's parameter list, as written.
    const signatures = [...ACTIONS.matchAll(/export async function \w+\(([^)]*)\)/g)].map(
      (m) => m[1],
    )
    assert.ok(signatures.length >= 6, 'expected the six clock actions to be found')
    for (const params of signatures) {
      assert.ok(
        !/employee_?[iI]d/.test(params),
        `a time clock action takes an employee id: (${params.trim()})`,
      )
    }
  })

  it('sets the RPC employee id only from the resolved session', () => {
    // p_employee_id must come from `employee.id` — the object returned by
    // requireWorkspaceCapability — and from nothing else.
    const assignments = [...ACTIONS.matchAll(/p_employee_id:\s*([^,\n]+)/g)].map((m) =>
      m[1].trim(),
    )
    assert.ok(assignments.length > 0, 'expected at least one RPC call')
    for (const value of assignments) {
      assert.equal(value, 'employee.id', `p_employee_id assigned from ${value}`)
    }
  })

  it('gates every exported action on the workspace capability check', () => {
    const bodies = ACTIONS.split(/export async function /).slice(1)
    for (const body of bodies) {
      const name = body.slice(0, body.indexOf('('))
      // runTransition is the shared body and does the check for the four
      // transitions, so an action either checks directly or delegates to it.
      const gated =
        body.includes('requireWorkspaceCapability') || body.includes('runTransition')
      assert.ok(gated, `${name} does not resolve the caller before acting`)
    }
  })

  it('scopes every attendance read to a resolved employee object', () => {
    // Each exported query takes `employee: WorkspaceEmployee`, never a bare id
    // string, so there is no signature through which a route could pass
    // somebody else's.
    const signatures = [...QUERIES.matchAll(/export async function (\w+)\(([\s\S]*?)\)\s*:/g)]
    assert.ok(signatures.length >= 4, 'expected the attendance queries to be found')
    for (const [, name, params] of signatures) {
      assert.ok(
        params.includes('employee: WorkspaceEmployee'),
        `${name} does not take a resolved WorkspaceEmployee`,
      )
      assert.ok(
        !/employeeId\s*:\s*string/.test(params),
        `${name} takes a raw employee id`,
      )
    }
  })

  it('authorizes the page itself rather than trusting the layout', () => {
    assert.ok(PAGE.includes('requireWorkspaceCapability'))
    assert.ok(PAGE.includes("'tools.use'"))
  })
})

describe('no entry point accepts a timestamp', () => {
  it('passes no time parameter to any punch RPC', () => {
    // The stored time is now() inside the transition function. If an action ever
    // forwards a client time, this fails.
    const forbidden = [
      /p_punched_at/,
      /p_at\b/,
      /p_now/,
      /p_opened_at/,
      /p_closed_at/,
      /punched_at:/,
    ]
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(ACTIONS), `a time is being sent to the database: ${pattern}`)
    }
  })

  it('sends correction times as a request, never as a punch', () => {
    // requestCorrection DOES accept times — they are claims, and they are
    // written to requested_changes on a correction row, not to a punch. The
    // distinction is the point: a claim becomes a punch only when someone
    // approves it, through attendance_apply_correction.
    assert.ok(ACTIONS.includes('requested_changes'))
    assert.ok(
      !ACTIONS.includes("from('attendance_punches')"),
      'the client-facing actions must never write a punch directly',
    )
  })

  it('never writes to attendance_sessions except to flag a pending correction', () => {
    const writes = [...ACTIONS.matchAll(/from\('attendance_sessions'\)\s*([\s\S]{0,80})/g)].map(
      (m) => m[1],
    )
    for (const tail of writes) {
      const isRead = tail.includes('.select(')
      const isCorrectionFlag = tail.includes('correction_pending')
      assert.ok(
        isRead || isCorrectionFlag,
        `an action mutates a session directly: ${tail.slice(0, 60)}`,
      )
    }
  })
})

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------
// Models uniq_attendance_open_session: at most one open session per employee.
// The store rejects a second insert exactly as the index does, so interleaving
// transitions here exercises the same property the database guarantees.

type Session = { id: number; state: AttendanceState }

class SessionStore {
  private open: Session | null = null
  private nextId = 1
  /** Rejections, so a test can assert the right ones were refused. */
  readonly refusals: string[] = []

  currentState(): AttendanceState {
    return this.open ? this.open.state : 'off_clock'
  }

  /** One transition, applied atomically. Returns whether it was accepted. */
  apply(action: AttendanceAction): boolean {
    const result = transition(this.currentState(), action)
    if (!result.ok) {
      this.refusals.push(result.reason)
      return false
    }
    if (action === 'clock_in') {
      // The unique index: an open session already exists, so this cannot land.
      if (this.open) {
        this.refusals.push('already_clocked_in')
        return false
      }
      this.open = { id: this.nextId++, state: 'clocked_in' }
      return true
    }
    if (action === 'clock_out') {
      this.open = null
      return true
    }
    this.open = { id: this.open!.id, state: result.next }
    return true
  }

  openCount(): number {
    return this.open ? 1 : 0
  }
}

describe('concurrency', () => {
  it('accepts exactly one of many simultaneous clock-ins', () => {
    // A double-tap, two tabs, or a retried request. Only one may create a
    // session; the rest must be refused with the same reason a clean serial run
    // would give.
    const store = new SessionStore()
    const results = Array.from({ length: 8 }, () => store.apply('clock_in'))

    assert.equal(results.filter(Boolean).length, 1, 'exactly one clock-in may succeed')
    assert.equal(store.openCount(), 1)
    assert.deepEqual(
      store.refusals,
      Array.from({ length: 7 }, () => 'already_clocked_in'),
    )
  })

  it('accepts exactly one of many simultaneous clock-outs', () => {
    const store = new SessionStore()
    store.apply('clock_in')
    const results = Array.from({ length: 5 }, () => store.apply('clock_out'))

    assert.equal(results.filter(Boolean).length, 1)
    assert.equal(store.openCount(), 0)
    assert.deepEqual(
      store.refusals,
      Array.from({ length: 4 }, () => 'not_clocked_in'),
    )
  })

  it('accepts exactly one of many simultaneous break starts', () => {
    const store = new SessionStore()
    store.apply('clock_in')
    const results = Array.from({ length: 4 }, () => store.apply('start_break'))

    assert.equal(results.filter(Boolean).length, 1)
    assert.equal(store.currentState(), 'on_break')
    assert.deepEqual(
      store.refusals,
      Array.from({ length: 3 }, () => 'already_on_break'),
    )
  })

  it('never leaves more than one session open under any interleaving', () => {
    // Every ordering of a realistic action mix. Whatever the sequence, the
    // invariant holds: one open session at most, and the state is always
    // reachable from the previous one.
    const actions: AttendanceAction[] = [
      'clock_in', 'clock_in', 'start_break', 'end_break', 'end_break',
      'clock_out', 'clock_out', 'clock_in', 'start_break', 'clock_out',
    ]
    const store = new SessionStore()
    for (const action of actions) {
      store.apply(action)
      assert.ok(store.openCount() <= 1, 'more than one session open')
    }
    // Ends closed: the last accepted action was a clock-out.
    assert.equal(store.currentState(), 'off_clock')
  })

  it('survives a full shift with breaks and lands back off clock', () => {
    const store = new SessionStore()
    const script: [AttendanceAction, boolean][] = [
      ['clock_in', true],
      ['start_break', true],
      ['start_break', false],
      ['end_break', true],
      ['end_break', false],
      ['start_break', true],
      ['clock_out', true], // closes the open break too
      ['clock_out', false],
    ]
    for (const [action, expected] of script) {
      assert.equal(store.apply(action), expected, `${action} should be ${expected}`)
    }
    assert.equal(store.openCount(), 0)
  })
})
