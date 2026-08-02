// The status set is where "missed is calculated, not selected" is enforced, and
// where the review permissions live.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  REVIEW_ACTIONS,
  SELECTABLE_STATUSES,
  SUPPRESSED_STATUSES,
  SYSTEM_STATUSES,
  TRACKER_STATUSES,
  TRACKER_STATUS_LABELS,
  deriveEntryStatus,
  isOpen,
  isSelectable,
  isSuppressed,
  reviewStatusLabel,
  reviewTransition,
  shouldCarryOver,
  type ReviewActor,
  type ReviewStatus,
  type TrackerStatus,
} from './status'

describe('the status set', () => {
  it('has all eight, each labelled', () => {
    assert.equal(TRACKER_STATUSES.length, 8)
    for (const s of TRACKER_STATUSES) {
      assert.ok(TRACKER_STATUS_LABELS[s].length > 0, s)
    }
  })

  it('never offers a system status to an employee', () => {
    // 'missed' above all: a self-reported miss is either never selected or
    // selected out of guilt, and either way the number stops meaning anything.
    assert.equal(isSelectable('missed'), false)
    for (const s of SYSTEM_STATUSES) {
      assert.equal(isSelectable(s), false, s)
    }
    for (const s of SELECTABLE_STATUSES) {
      assert.equal(isSelectable(s), true, s)
    }
  })

  it('partitions every status into selectable or system', () => {
    for (const s of TRACKER_STATUSES) {
      const inOne =
        (SELECTABLE_STATUSES as readonly string[]).includes(s) !==
        (SYSTEM_STATUSES as readonly string[]).includes(s)
      assert.ok(inOne, `${s} must be exactly one of selectable or system`)
    }
  })

  it('knows which statuses mean no entry was owed', () => {
    assert.deepEqual([...SUPPRESSED_STATUSES], ['not_working_day', 'waived'])
    assert.equal(isSuppressed('not_working_day'), true)
    assert.equal(isSuppressed('missed'), false, 'a missed day WAS owed')
  })
})

describe('carrying', () => {
  it('carries only what still has work in it', () => {
    const expected: Record<TrackerStatus, boolean> = {
      not_started: true,
      in_progress: true,
      blocked: true,
      done: false,
      // Already moved. Carrying again duplicates it on every run.
      carried_over: false,
      missed: false,
      not_working_day: false,
      waived: false,
    }
    for (const s of TRACKER_STATUSES) {
      assert.equal(shouldCarryOver(s), expected[s], s)
      assert.equal(isOpen(s), expected[s], s)
    }
  })
})

describe('deriveEntryStatus', () => {
  it('is done when every commitment is met', () => {
    assert.equal(
      deriveEntryStatus([
        { kind: 'planned', status: 'done' },
        { kind: 'completed', status: 'done' },
      ]),
      'done',
    )
  })

  it('is in progress while a commitment is outstanding', () => {
    assert.equal(
      deriveEntryStatus([
        { kind: 'planned', status: 'done' },
        { kind: 'planned', status: 'in_progress' },
      ]),
      'in_progress',
    )
  })

  it('lets blocked win over everything', () => {
    // A blocker is the thing a reviewer needs to see first.
    assert.equal(
      deriveEntryStatus([
        { kind: 'planned', status: 'done' },
        { kind: 'blocker', status: 'blocked' },
      ]),
      'blocked',
    )
  })

  it('does not let an unfinished non-commitment hold the entry open', () => {
    // A decision noted for the record is not an outstanding commitment.
    assert.equal(
      deriveEntryStatus([
        { kind: 'planned', status: 'done' },
        { kind: 'decision', status: 'not_started' },
      ]),
      'done',
    )
  })

  it('treats an empty entry as done rather than inventing a status', () => {
    assert.equal(deriveEntryStatus([]), 'done')
  })
})

describe('reviewTransition', () => {
  const submitted = { submitted: true }
  const ACTORS: ReviewActor[] = ['owner', 'reviewer', 'admin']

  it('walks the ordinary review path', () => {
    assert.deepEqual(reviewTransition('pending', 'start_review', 'reviewer', submitted), {
      ok: true,
      next: 'under_review',
    })
    assert.deepEqual(reviewTransition('under_review', 'accept', 'reviewer', submitted), {
      ok: true,
      next: 'accepted',
    })
    assert.deepEqual(reviewTransition('under_review', 'return', 'reviewer', submitted), {
      ok: true,
      next: 'returned',
    })
  })

  it('never lets the owner review anything', () => {
    for (const action of REVIEW_ACTIONS) {
      assert.deepEqual(
        reviewTransition('pending', action, 'owner', submitted),
        { ok: false, reason: 'not_permitted' },
        action,
      )
    }
  })

  it('only lets an admin waive', () => {
    assert.equal(reviewTransition('pending', 'waive', 'admin', submitted).ok, true)
    assert.deepEqual(reviewTransition('pending', 'waive', 'reviewer', submitted), {
      ok: false,
      reason: 'not_permitted',
    })
  })

  it('refuses to review something nobody filed in', () => {
    for (const action of ['start_review', 'return', 'accept'] as const) {
      assert.deepEqual(
        reviewTransition('pending', action, 'reviewer', { submitted: false }),
        { ok: false, reason: 'not_submitted' },
        action,
      )
    }
  })

  it('protects an accepted entry from everything but reopening', () => {
    for (const action of REVIEW_ACTIONS) {
      const result = reviewTransition('accepted', action, 'admin', submitted)
      if (action === 'reopen') {
        assert.deepEqual(result, { ok: true, next: 'pending' })
      } else {
        assert.deepEqual(result, { ok: false, reason: 'already_accepted' }, action)
      }
    }
  })

  it('never returns ok without a valid next status', () => {
    const states: ReviewStatus[] = ['pending', 'under_review', 'returned', 'accepted']
    for (const state of states) {
      for (const action of REVIEW_ACTIONS) {
        for (const actor of ACTORS) {
          const result = reviewTransition(state, action, actor, submitted)
          if (result.ok) {
            assert.ok(states.includes(result.next), `${state}/${action}/${actor}`)
          } else {
            assert.ok(result.reason.length > 0)
          }
        }
      }
    }
  })

  it('labels every review status', () => {
    for (const s of ['pending', 'under_review', 'returned', 'accepted'] as ReviewStatus[]) {
      assert.ok(reviewStatusLabel(s).length > 0)
    }
  })
})
