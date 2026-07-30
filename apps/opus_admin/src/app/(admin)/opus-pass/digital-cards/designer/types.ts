// Client-safe shapes for the design queue.
//
// Deliberately separate from queries.ts: that module is 'server-only', and a
// client component importing anything from it — even a plain string constant —
// pulls the server bundle into the browser and breaks the build.

import type { OrderAddOn } from '@/lib/cms/order-add-ons'
import { slaApplies, slaState } from '@/lib/cms/design-sla'

/** How the queue is laid out. List reads one job at a time; table compares many. */
export type QueueView = 'list' | 'table'

export const DESIGN_STATUSES = [
  'not_started',
  'awaiting_info',
  'in_design',
  'in_review',
  'ready',
  'delivered',
] as const

export type DesignStatus = (typeof DESIGN_STATUSES)[number]

export const DESIGN_STATUS_LABELS: Record<DesignStatus, string> = {
  not_started: 'Not started',
  awaiting_info: 'Waiting on couple',
  in_design: 'In design',
  in_review: 'In review',
  ready: 'Ready',
  delivered: 'Delivered',
}

/**
 * A card line waiting for, or in, design.
 *
 * Derived by joining approved orders to their design jobs rather than
 * materialising a row per line up front: a line with no job simply hasn't been
 * started, which keeps the queue correct without writing to the database on a
 * page view.
 */
export type DesignJob = {
  orderId: string
  orderRef: string
  lineIndex: number
  productId: string
  productName: string
  cardImage: string | null

  digitalQty: number
  printQty: number
  /** Package tier bought, e.g. 'Signature'. Null on lines that predate tiers. */
  tier: string | null
  /** Stable tier id (lite/classic/elegant/signature) — drives the pill colour. */
  tierId: string | null
  addOns: OrderAddOn[]
  /** Counts came from parsing display strings — show the raw labels alongside. */
  inferred: boolean
  unparsed: string[]

  coupleName: string | null
  coupleEmail: string | null
  couplePhone: string | null
  eventDate: string | null
  paidAt: string | null
  /** Finance approval — when the 48h design clock started. */
  approvedAt: string | null
  /**
   * SLA computed ONCE on the server and shipped with the HTML.
   *
   * Recomputing in the browser makes the clock tick between render and
   * hydration, so the ring's stroke offset differs by a hair and React
   * reports a hydration mismatch. A snapshot keeps both sides identical.
   * It does go stale on a long-open page; a refresh is the cure.
   */
  sla: JobSla | null

  /** Null until a designer starts the job. */
  designId: string | null
  status: DesignStatus
  assignedTo: string | null
  assigneeName: string | null
  requestedFields: string[]
  fieldValueCount: number
}

export type JobSla = {
  /**
   * 'untracked' is a real state, not a missing one: the order was approved
   * before design tracking began, so it never had a 48h promise. Rendering it
   * as an empty cell reads as a bug; saying so reads as a decision.
   */
  tone: 'ok' | 'due_soon' | 'overdue' | 'untracked'
  /** Magnitude only — "36h", "45m" — for the middle of the ring. */
  short: string
  /** Full sentence for screen readers and the tooltip. */
  label: string
  /** 0 to 1, how much of the window is used. */
  elapsedFraction: number
  /** Pre-formatted, so the browser's locale can't disagree with the server's. */
  dueAtLabel: string
}

export type DesignQueueSummary = {
  total: number
  byStatus: Record<DesignStatus, number>
  digitalCards: number
  printedCards: number
  /** Jobs whose quantities were parsed rather than read from structured data. */
  inferredCount: number
  /** Still on the clock and past their 48h deadline. */
  overdueCount: number
  /** Still on the clock with under a quarter of the window left. */
  dueSoonCount: number
}

export function summariseQueue(jobs: DesignJob[]): DesignQueueSummary {
  const byStatus = Object.fromEntries(DESIGN_STATUSES.map((s) => [s, 0])) as Record<
    DesignStatus,
    number
  >
  for (const job of jobs) byStatus[job.status] += 1
  // Submitted work is off the clock, so it can't be overdue.
  const onClock = jobs.filter((j) => slaApplies(j.status))

  return {
    total: jobs.length,
    byStatus,
    digitalCards: jobs.reduce((n, j) => n + j.digitalQty, 0),
    printedCards: jobs.reduce((n, j) => n + j.printQty, 0),
    inferredCount: jobs.filter((j) => j.inferred).length,
    overdueCount: onClock.filter((j) => slaState(j.approvedAt)?.tone === 'overdue').length,
    dueSoonCount: onClock.filter((j) => slaState(j.approvedAt)?.tone === 'due_soon').length,
  }
}
