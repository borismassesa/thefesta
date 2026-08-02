// The transition table is the module's safety property: an invalid transition
// that slips through inflates payable hours. These tests enumerate the whole
// state x action grid rather than spot-checking the happy path, so adding a
// state without deciding its transitions fails here.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ATTENDANCE_ACTIONS,
  ATTENDANCE_STATES,
  availableActions,
  canPerform,
  deriveState,
  isOpenState,
  stateLabel,
  transition,
  type AttendanceAction,
  type AttendanceState,
} from './state'

describe('valid transitions', () => {
  it('off clock -> clock in', () => {
    assert.deepEqual(transition('off_clock', 'clock_in'), { ok: true, next: 'clocked_in' })
  })

  it('clocked in -> start break', () => {
    assert.deepEqual(transition('clocked_in', 'start_break'), { ok: true, next: 'on_break' })
  })

  it('on break -> end break', () => {
    assert.deepEqual(transition('on_break', 'end_break'), { ok: true, next: 'clocked_in' })
  })

  it('clocked in -> clock out', () => {
    assert.deepEqual(transition('clocked_in', 'clock_out'), { ok: true, next: 'clocked_out' })
  })

  it('on break -> clock out closes the break rather than trapping the employee', () => {
    assert.deepEqual(transition('on_break', 'clock_out'), { ok: true, next: 'clocked_out' })
  })

  it('allows a second session in the same day from every closed state', () => {
    for (const state of ['clocked_out', 'auto_closed', 'pending_correction'] as const) {
      assert.equal(canPerform(state, 'clock_in'), true, `clock_in from ${state}`)
    }
  })
})

describe('rejected transitions', () => {
  it('refuses a clock in while already clocked in', () => {
    assert.deepEqual(transition('clocked_in', 'clock_in'), {
      ok: false,
      reason: 'already_clocked_in',
    })
  })

  it('refuses a clock in while on break', () => {
    assert.deepEqual(transition('on_break', 'clock_in'), {
      ok: false,
      reason: 'already_clocked_in',
    })
  })

  it('refuses a clock out with no open session', () => {
    for (const state of ['off_clock', 'clocked_out', 'auto_closed', 'pending_correction'] as const) {
      assert.deepEqual(transition(state, 'clock_out'), { ok: false, reason: 'not_clocked_in' })
    }
  })

  it('refuses starting a break while off clock', () => {
    assert.deepEqual(transition('off_clock', 'start_break'), {
      ok: false,
      reason: 'not_clocked_in',
    })
  })

  it('refuses starting a break while already on one', () => {
    assert.deepEqual(transition('on_break', 'start_break'), {
      ok: false,
      reason: 'already_on_break',
    })
  })

  it('refuses ending a break when there is no active break', () => {
    assert.deepEqual(transition('clocked_in', 'end_break'), { ok: false, reason: 'not_on_break' })
    assert.deepEqual(transition('off_clock', 'end_break'), { ok: false, reason: 'not_clocked_in' })
  })
})

describe('the full grid', () => {
  // Locks the complete table. Any new state or action must be decided here
  // rather than silently defaulting.
  const EXPECTED: Record<AttendanceState, AttendanceAction[]> = {
    off_clock: ['clock_in'],
    clocked_in: ['start_break', 'clock_out'],
    on_break: ['end_break', 'clock_out'],
    clocked_out: ['clock_in'],
    auto_closed: ['clock_in'],
    pending_correction: ['clock_in'],
  }

  it('offers exactly the expected actions in every state', () => {
    for (const state of ATTENDANCE_STATES) {
      assert.deepEqual(availableActions(state), EXPECTED[state], `actions for ${state}`)
    }
  })

  it('never returns ok without a next state, or a refusal with one', () => {
    for (const state of ATTENDANCE_STATES) {
      for (const action of ATTENDANCE_ACTIONS) {
        const result = transition(state, action)
        if (result.ok) {
          assert.ok(ATTENDANCE_STATES.includes(result.next))
        } else {
          assert.ok(result.reason.length > 0)
        }
      }
    }
  })

  it('knows which states hold an open session', () => {
    assert.equal(isOpenState('clocked_in'), true)
    assert.equal(isOpenState('on_break'), true)
    for (const state of ['off_clock', 'clocked_out', 'auto_closed', 'pending_correction'] as const) {
      assert.equal(isOpenState(state), false)
    }
  })

  it('labels every state', () => {
    for (const state of ATTENDANCE_STATES) {
      assert.ok(stateLabel(state).length > 0)
    }
  })
})

describe('deriveState', () => {
  it('is off_clock when nothing has happened today', () => {
    assert.equal(deriveState({ openSession: null, latestSessionToday: null }), 'off_clock')
  })

  it('reads the open session first', () => {
    assert.equal(
      deriveState({
        openSession: { state: 'on_break', closedAt: null },
        latestSessionToday: { state: 'clocked_out', closedAt: '2026-08-02T10:00:00Z' },
      }),
      'on_break',
    )
  })

  it('surfaces a closed day as its terminal state', () => {
    for (const state of ['clocked_out', 'auto_closed', 'pending_correction'] as const) {
      assert.equal(
        deriveState({
          openSession: null,
          latestSessionToday: { state, closedAt: '2026-08-02T17:00:00Z' },
        }),
        state,
      )
    }
  })

  it('does not let yesterday colour today', () => {
    // The caller only ever passes TODAY's session, so an empty argument means a
    // fresh day — not a stale "clocked out" from a shift that ended on Friday.
    assert.equal(deriveState({ openSession: null, latestSessionToday: null }), 'off_clock')
  })
})
