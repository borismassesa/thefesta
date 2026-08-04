// "Carried-over items retain links to the previous entry" is the acceptance
// criterion. These tests are mostly about the link surviving: an item that
// slipped for a week must be traceable back to the day it was first raised.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildCarryDrafts,
  carryChain,
  carryDepth,
  carryableItems,
  stalledItems,
  type TrackerItem,
} from './carryover'
import type { TrackerStatus } from './status'

function item(over: Partial<TrackerItem> & Pick<TrackerItem, 'id'>): TrackerItem {
  return {
    entryId: 'entry-1',
    kind: 'planned',
    title: 'Do the thing',
    detail: '',
    status: 'not_started',
    sortOrder: 100,
    linkedTaskId: null,
    linkedProjectId: null,
    linkedGoalId: null,
    source: 'manual',
    carriedFromItemId: null,
    carryCount: 0,
    ...over,
  }
}

describe('carryableItems', () => {
  it('carries unfinished commitments and blockers', () => {
    const items = [
      item({ id: 'a', kind: 'planned', status: 'not_started' }),
      item({ id: 'b', kind: 'planned', status: 'in_progress' }),
      item({ id: 'c', kind: 'blocker', status: 'blocked' }),
      item({ id: 'd', kind: 'next_step', status: 'not_started' }),
    ]
    assert.deepEqual(
      carryableItems(items).map((i) => i.id),
      ['a', 'b', 'c', 'd'],
    )
  })

  it('does not carry completed work', () => {
    const items = [
      item({ id: 'a', kind: 'planned', status: 'done' }),
      item({ id: 'b', kind: 'completed', status: 'done' }),
    ]
    assert.deepEqual(carryableItems(items), [])
  })

  it('does not carry an item that has ALREADY carried', () => {
    // Otherwise a re-run of the job duplicates it, every run, compounding.
    assert.deepEqual(carryableItems([item({ id: 'a', status: 'carried_over' })]), [])
  })

  it('does not carry a decision', () => {
    // A decision required on Tuesday is a record of Tuesday. One that still
    // needs making is raised as a blocker, which does carry.
    assert.deepEqual(carryableItems([item({ id: 'a', kind: 'decision', status: 'not_started' })]), [])
  })

  it('does not carry waived or missed items', () => {
    for (const status of ['waived', 'missed'] as TrackerStatus[]) {
      assert.deepEqual(carryableItems([item({ id: 'a', status })]), [], status)
    }
  })
})

describe('buildCarryDrafts', () => {
  it('LINKS every copy back to the item it came from', () => {
    const drafts = buildCarryDrafts([item({ id: 'source-1' })])
    assert.equal(drafts.length, 1)
    assert.equal(drafts[0].carriedFromItemId, 'source-1')
    assert.equal(drafts[0].source, 'carry_over')
    assert.equal(drafts[0].carryCount, 1)
  })

  it('keeps a blocked item blocked', () => {
    // Resetting it would erase the single most useful fact on the entry.
    const drafts = buildCarryDrafts([item({ id: 'a', kind: 'blocker', status: 'blocked' })])
    assert.equal(drafts[0].status, 'blocked')
    assert.equal(drafts[0].kind, 'blocker')
  })

  it('turns a next step into tomorrow’s plan', () => {
    const drafts = buildCarryDrafts([item({ id: 'a', kind: 'next_step', status: 'not_started' })])
    assert.equal(drafts[0].kind, 'planned')
  })

  it('carries the task, project and goal links with it', () => {
    const drafts = buildCarryDrafts([
      item({
        id: 'a',
        linkedTaskId: 'task-1',
        linkedProjectId: 'proj-1',
        linkedGoalId: 'goal-1',
        detail: 'Waiting on finance',
      }),
    ])
    assert.equal(drafts[0].linkedTaskId, 'task-1')
    assert.equal(drafts[0].linkedProjectId, 'proj-1')
    assert.equal(drafts[0].linkedGoalId, 'goal-1')
    assert.equal(drafts[0].detail, 'Waiting on finance')
  })

  it('increments the carry count each time', () => {
    const drafts = buildCarryDrafts([item({ id: 'a', carryCount: 4 })])
    assert.equal(drafts[0].carryCount, 5)
  })
})

describe('carryChain', () => {
  // An item raised Monday, still open on Thursday.
  const mon = item({ id: 'mon', entryId: 'e-mon', title: 'Ship the migration' })
  const tue = item({ id: 'tue', entryId: 'e-tue', carriedFromItemId: 'mon', carryCount: 1 })
  const wed = item({ id: 'wed', entryId: 'e-wed', carriedFromItemId: 'tue', carryCount: 2 })
  const thu = item({ id: 'thu', entryId: 'e-thu', carriedFromItemId: 'wed', carryCount: 3 })
  const byId = new Map([mon, tue, wed, thu].map((i) => [i.id, i]))

  it('follows an item back to the day it was first raised', () => {
    assert.deepEqual(
      carryChain('thu', byId).map((i) => i.entryId),
      ['e-mon', 'e-tue', 'e-wed', 'e-thu'],
    )
  })

  it('reports the depth as the number of moves, not of entries', () => {
    assert.equal(carryDepth('thu', byId), 3)
    assert.equal(carryDepth('mon', byId), 0)
  })

  it('stops at a broken link rather than returning nothing', () => {
    const orphan = item({ id: 'orphan', carriedFromItemId: 'deleted-item' })
    const chain = carryChain('orphan', new Map([[orphan.id, orphan]]))
    assert.deepEqual(chain.map((i) => i.id), ['orphan'])
  })

  it('survives a cyclic link instead of hanging the page', () => {
    const a = item({ id: 'a', carriedFromItemId: 'b' })
    const b = item({ id: 'b', carriedFromItemId: 'a' })
    const chain = carryChain('a', new Map([[a.id, a], [b.id, b]]))
    assert.ok(chain.length <= 2)
  })
})

describe('stalledItems', () => {
  it('surfaces what has slipped three times or more', () => {
    const items = [
      item({ id: 'a', carryCount: 1 }),
      item({ id: 'b', carryCount: 3 }),
      item({ id: 'c', carryCount: 7 }),
    ]
    assert.deepEqual(
      stalledItems(items).map((i) => i.id),
      ['c', 'b'],
      'worst first',
    )
  })

  it('ignores something that slipped but is now done', () => {
    assert.deepEqual(stalledItems([item({ id: 'a', carryCount: 9, status: 'done' })]), [])
  })

  it('takes a custom threshold', () => {
    assert.equal(stalledItems([item({ id: 'a', carryCount: 2 })], 2).length, 1)
  })
})
