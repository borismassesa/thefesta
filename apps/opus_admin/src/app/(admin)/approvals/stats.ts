// Derived metrics for the Approvals module. Pure functions over the
// request list the page already loads — no second source of truth, and
// nothing here invents a number. Where there's no history to measure
// (a category nobody has used yet), the getter returns null and the UI
// renders nothing rather than a placeholder that reads as real data.

import type { ApprovalCategoryKey, ApprovalRequest } from './types'

export type CategoryStats = {
  total: number
  thisYear: number
  // Mean days from submission to decision, over decided requests that
  // carry a submission stamp. Drafts, still-open requests and rows with a
  // missing or negative interval are excluded rather than counted as zero.
  // Null until at least one request in this category has been decided.
  //
  // A mean is the wrong summary once volume grows — one request that sat
  // for four months drags the whole category. Switch to a median (and
  // surface p90 alongside it) when there's enough history to warrant it.
  avgDecisionDays: number | null
  // Approvers this category has historically routed to, most-used first.
  // Stands in for a declared workflow until approval_steps exists.
  typicalApprovers: string[]
  // Most recent time the signed-in user raised one of these.
  lastUsedByMe: string | null
}

export function categoryStats(
  requests: ApprovalRequest[],
  actorEmail: string,
  now: number,
): Map<ApprovalCategoryKey, CategoryStats> {
  const year = new Date(now).getFullYear()
  const me = actorEmail.trim().toLowerCase()
  const out = new Map<ApprovalCategoryKey, CategoryStats>()
  // Accumulators kept alongside the result so a category is only walked once.
  const durations = new Map<ApprovalCategoryKey, number[]>()
  const approverHits = new Map<ApprovalCategoryKey, Map<string, number>>()

  for (const r of requests) {
    const key = r.category
    const bucket =
      out.get(key) ??
      ({
        total: 0,
        thisYear: 0,
        avgDecisionDays: null,
        typicalApprovers: [],
        lastUsedByMe: null,
      } satisfies CategoryStats)

    bucket.total += 1
    if (new Date(r.createdAt).getFullYear() === year) bucket.thisYear += 1

    if (r.ownerEmail.trim().toLowerCase() === me) {
      if (!bucket.lastUsedByMe || r.createdAt > bucket.lastUsedByMe) {
        bucket.lastUsedByMe = r.createdAt
      }
    }

    if ((r.status === 'Approved' || r.status === 'Refused') && r.submittedAt) {
      const days = (new Date(r.updatedAt).getTime() - new Date(r.submittedAt).getTime()) / 86_400_000
      if (Number.isFinite(days) && days >= 0) {
        const list = durations.get(key) ?? []
        list.push(days)
        durations.set(key, list)
      }
    }

    const hits = approverHits.get(key) ?? new Map<string, number>()
    for (const a of r.approvers) hits.set(a.name, (hits.get(a.name) ?? 0) + 1)
    approverHits.set(key, hits)

    out.set(key, bucket)
  }

  for (const [key, bucket] of out) {
    const d = durations.get(key)
    if (d && d.length > 0) {
      bucket.avgDecisionDays = d.reduce((a, b) => a + b, 0) / d.length
    }
    const hits = approverHits.get(key)
    if (hits) {
      bucket.typicalApprovers = [...hits.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name)
    }
  }

  return out
}

// Quick-create ordering, fixed and deduplicated:
//   1. favourites, in the order they were starred
//   2. most recently used by this person
//   3. most used by this person
// A category can qualify on all three; it appears once, at its best rank.
// Nothing is padded out with org defaults — an empty list on a fresh
// account is honest, and the panel says how to fill it.
export function quickCreateOrder(
  myRequests: ApprovalRequest[],
  favourites: ApprovalCategoryKey[],
  actorEmail: string,
  limit = 5,
): ApprovalCategoryKey[] {
  const me = actorEmail.trim().toLowerCase()
  const lastUsed = new Map<ApprovalCategoryKey, string>()
  const useCount = new Map<ApprovalCategoryKey, number>()

  for (const r of myRequests) {
    // Defensive: callers pass an already-scoped list, but this must never
    // surface someone else's habits as the caller's shortcuts.
    if (r.ownerEmail.trim().toLowerCase() !== me) continue
    const prev = lastUsed.get(r.category)
    if (!prev || r.createdAt > prev) lastUsed.set(r.category, r.createdAt)
    useCount.set(r.category, (useCount.get(r.category) ?? 0) + 1)
  }

  const used = [...lastUsed.keys()].sort((a, b) => {
    const recency = (lastUsed.get(b) ?? '').localeCompare(lastUsed.get(a) ?? '')
    if (recency !== 0) return recency
    return (useCount.get(b) ?? 0) - (useCount.get(a) ?? 0)
  })

  const ordered: ApprovalCategoryKey[] = []
  const seen = new Set<ApprovalCategoryKey>()
  for (const key of [...favourites, ...used]) {
    if (seen.has(key)) continue
    seen.add(key)
    ordered.push(key)
    if (ordered.length === limit) break
  }
  return ordered
}

export type FeedEntry = {
  id: string
  requestId: string
  subject: string
  category: ApprovalCategoryKey
  author: string
  authorInitials: string
  authorColor: string
  body: string
  at: string
}

// One merged, newest-first feed. The per-request activity rail answers
// "what happened to this one"; this answers "what moved across my
// requests", which is what the landing page gets asked.
//
// Scoping is the caller's job and it matters: pass only requests this
// person raised or is named on. Handing this the full org list would turn
// the landing page into an ambient feed of everyone's payments and
// contracts.
export function recentActivity(requests: ApprovalRequest[], limit = 8): FeedEntry[] {
  const all: FeedEntry[] = []
  for (const r of requests) {
    for (const a of r.activity) {
      all.push({
        id: a.id,
        requestId: r.id,
        subject: r.subject,
        category: r.category,
        author: a.author,
        authorInitials: a.authorInitials,
        authorColor: a.authorColor,
        body: a.body,
        at: a.at,
      })
    }
  }
  return all.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit)
}

export type MonthSummary = {
  approved: number
  refused: number
  avgDecisionDays: number | null
}

// Calendar-month-to-date, not a rolling 30 days — "this month" on a
// dashboard is read as the calendar month, and a rolling window would
// disagree with whatever finance reports at month end.
export function thisMonth(requests: ApprovalRequest[], now: number): MonthSummary {
  const ref = new Date(now)
  const month = ref.getMonth()
  const year = ref.getFullYear()
  const inMonth = (iso: string) => {
    const d = new Date(iso)
    return d.getMonth() === month && d.getFullYear() === year
  }

  let approved = 0
  let refused = 0
  const durations: number[] = []
  for (const r of requests) {
    if (r.status !== 'Approved' && r.status !== 'Refused') continue
    if (!inMonth(r.updatedAt)) continue
    if (r.status === 'Approved') approved += 1
    else refused += 1
    if (r.submittedAt) {
      const days =
        (new Date(r.updatedAt).getTime() - new Date(r.submittedAt).getTime()) / 86_400_000
      if (Number.isFinite(days) && days >= 0) durations.push(days)
    }
  }

  return {
    approved,
    refused,
    avgDecisionDays:
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
  }
}
