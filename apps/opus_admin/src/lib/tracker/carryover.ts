// Carry-over — pure, no I/O.
//
// "Carried-over items retain links to the previous entry" is the acceptance
// criterion, and the reason items are ROWS rather than prose in a textarea. A
// paragraph cannot point at the day it came from; a row can, and then an item
// that slipped for six days can be followed back through all six.
//
// Mirrors tracker_carry_over() in the migration.

import { shouldCarryOver, type TrackerStatus } from './status'

export type TrackerItem = {
  id: string
  entryId: string
  kind: 'planned' | 'completed' | 'blocker' | 'decision' | 'next_step'
  title: string
  detail: string
  status: TrackerStatus
  sortOrder: number
  linkedTaskId: string | null
  linkedProjectId: string | null
  linkedGoalId: string | null
  source: string
  carriedFromItemId: string | null
  carryCount: number
}

/** What a carried copy looks like before it is written. */
export type CarryDraft = {
  kind: 'planned' | 'blocker'
  title: string
  detail: string
  status: TrackerStatus
  sortOrder: number
  linkedTaskId: string | null
  linkedProjectId: string | null
  linkedGoalId: string | null
  source: 'carry_over'
  /** The link back. This is the whole point. */
  carriedFromItemId: string
  carryCount: number
}

/**
 * Which of an entry's items move to the next working day.
 *
 * Only commitments and blockers. Completed work does not carry (it is done),
 * and decisions do not (a decision required on Tuesday is a record of Tuesday,
 * not an ongoing task) — a decision that still needs making is raised as a
 * blocker, which does carry.
 */
export function carryableItems(items: TrackerItem[]): TrackerItem[] {
  return items.filter(
    (item) =>
      (item.kind === 'planned' || item.kind === 'next_step' || item.kind === 'blocker') &&
      shouldCarryOver(item.status),
  )
}

/**
 * Build the copies for the next entry.
 *
 * A 'next_step' becomes a 'planned' item on the following day: a step planned
 * for tomorrow IS tomorrow's plan, and keeping it as a next step would leave it
 * sitting in a section nobody works from.
 *
 * A blocked item stays blocked. Resetting it to not_started would erase the
 * fact that it is stuck, which is the single most useful thing on the entry.
 */
export function buildCarryDrafts(items: TrackerItem[]): CarryDraft[] {
  return carryableItems(items).map((item) => ({
    kind: item.kind === 'blocker' ? 'blocker' : 'planned',
    title: item.title,
    detail: item.detail,
    status: item.status === 'blocked' ? 'blocked' : 'not_started',
    sortOrder: item.sortOrder,
    linkedTaskId: item.linkedTaskId,
    linkedProjectId: item.linkedProjectId,
    linkedGoalId: item.linkedGoalId,
    source: 'carry_over',
    carriedFromItemId: item.id,
    carryCount: item.carryCount + 1,
  }))
}

/**
 * Follow an item back to where it was first raised.
 *
 * Returns the chain oldest-first. Cycle-guarded: a corrupted link must not hang
 * the page that renders the history.
 */
export function carryChain(
  itemId: string,
  byId: Map<string, TrackerItem>,
): TrackerItem[] {
  const chain: TrackerItem[] = []
  const seen = new Set<string>()
  let cursor: string | null = itemId

  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    const item: TrackerItem | undefined = byId.get(cursor)
    if (!item) break
    chain.unshift(item)
    cursor = item.carriedFromItemId
  }

  return chain
}

/** How many times an item has moved. 0 means it was raised on this entry. */
export function carryDepth(itemId: string, byId: Map<string, TrackerItem>): number {
  return Math.max(0, carryChain(itemId, byId).length - 1)
}

/**
 * Items that have slipped enough times to be worth a manager's attention.
 *
 * Three days is the default: twice is a busy week, three times is a thing that
 * is not going to happen without help.
 */
export function stalledItems(items: TrackerItem[], threshold = 3): TrackerItem[] {
  return items
    .filter((item) => item.carryCount >= threshold && shouldCarryOver(item.status))
    .sort((a, b) => b.carryCount - a.carryCount)
}
