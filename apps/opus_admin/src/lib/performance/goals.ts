// Goals, alignment and key result measurement — pure, no I/O.
//
// Mirrors goal_is_visible_to(), goal_assert_alignment(), key_result_attainment()
// and goal_validate_weights() in the migration.

export const GOAL_LEVELS = ['company', 'brand', 'department', 'team', 'employee'] as const
export type GoalLevel = (typeof GOAL_LEVELS)[number]

export const GOAL_LEVEL_LABELS: Record<GoalLevel, string> = {
  company: 'Company',
  brand: 'Brand',
  department: 'Department',
  team: 'Team',
  employee: 'Personal',
}

/**
 * How high up the tree a level sits. Lower number is higher up.
 *
 * A goal may roll up to something at its own level or above it, never below.
 * A company goal reporting to a personal goal inverts the tree and every
 * rollup after it is wrong.
 */
export function levelRank(level: GoalLevel): number {
  return GOAL_LEVELS.indexOf(level) + 1
}

export const GOAL_STATUSES = [
  'not_started',
  'on_track',
  'at_risk',
  'off_track',
  'achieved',
  'partially_achieved',
  'missed',
  'cancelled',
] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  not_started: 'Not started',
  on_track: 'On track',
  at_risk: 'At risk',
  off_track: 'Off track',
  achieved: 'Achieved',
  partially_achieved: 'Partly achieved',
  missed: 'Missed',
  cancelled: 'Cancelled',
}

export const CLOSED_GOAL_STATUSES: readonly GoalStatus[] = ['achieved', 'missed', 'cancelled']

export function isGoalClosed(status: GoalStatus): boolean {
  return CLOSED_GOAL_STATUSES.includes(status)
}

export const APPROVAL_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'changes_requested',
  'rejected',
] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Awaiting approval',
  approved: 'Approved',
  changes_requested: 'Changes requested',
  rejected: 'Rejected',
}

export const GOAL_VISIBILITIES = ['private', 'manager', 'team', 'department', 'organisation'] as const
export type GoalVisibility = (typeof GOAL_VISIBILITIES)[number]

export const GOAL_VISIBILITY_LABELS: Record<GoalVisibility, string> = {
  private: 'Only me',
  manager: 'Me and my manager',
  team: 'My team',
  department: 'My department',
  organisation: 'Everyone',
}

export const MEASUREMENT_METHODS = [
  'key_results',
  'milestones',
  'percentage',
  'binary',
  'qualitative',
] as const
export type MeasurementMethod = (typeof MEASUREMENT_METHODS)[number]

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

export type GoalEdge = { id: string; parentId: string | null; level: GoalLevel }

export type AlignmentCheck =
  | { ok: true }
  | { ok: false; reason: 'inverted' | 'cycle' | 'self' }

/**
 * May this goal roll up to that one?
 *
 * Two separate failures, and they are not the same mistake. An inversion is
 * somebody misunderstanding the hierarchy. A cycle is somebody creating a set
 * of goals none of which can ever be completed.
 */
export function checkAlignment(
  goalId: string,
  goalLevel: GoalLevel,
  parentId: string,
  graph: GoalEdge[],
  maxDepth = 50,
): AlignmentCheck {
  if (goalId === parentId) return { ok: false, reason: 'self' }

  const parent = graph.find((g) => g.id === parentId)
  if (parent && levelRank(goalLevel) < levelRank(parent.level)) {
    return { ok: false, reason: 'inverted' }
  }

  // Walk UP from the proposed parent. Arriving back at this goal means the
  // edge closes a loop.
  const byId = new Map(graph.map((g) => [g.id, g]))
  let current: string | null = parentId
  const seen = new Set<string>()
  for (let depth = 0; depth < maxDepth && current; depth += 1) {
    if (current === goalId) return { ok: false, reason: 'cycle' }
    if (seen.has(current)) break
    seen.add(current)
    current = byId.get(current)?.parentId ?? null
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Key results
// ---------------------------------------------------------------------------

export const MEASUREMENT_TYPES = [
  'number',
  'percentage',
  'currency',
  'milestone',
  'boolean',
  'custom_score',
] as const
export type MeasurementType = (typeof MEASUREMENT_TYPES)[number]

export const MEASUREMENT_TYPE_LABELS: Record<MeasurementType, string> = {
  number: 'Number',
  percentage: 'Percentage',
  currency: 'Currency',
  milestone: 'Milestones',
  boolean: 'Done or not done',
  custom_score: 'Custom score',
}

export type KeyResult = {
  id: string
  measurementType: MeasurementType
  startValue: number
  targetValue: number | null
  currentValue: number
  direction: 'increase' | 'decrease'
  unit: string | null
  currency: string
  isAchieved: boolean
  weight: number
  milestones?: { label: string; done: boolean }[]
}

/**
 * How far along a key result is, as a percentage.
 *
 * The four arithmetic types share one calculation. A 'decrease' target has a
 * negative span, and dividing one negative by another gives the right answer
 * without a second branch: 40 down to 10 against a target of 10 is
 * -30 / -30 = 100%.
 */
export function attainment(kr: KeyResult): number {
  if (kr.measurementType === 'boolean') return kr.isAchieved ? 100 : 0

  if (kr.measurementType === 'milestone') {
    const list = kr.milestones ?? []
    if (list.length === 0) return kr.isAchieved ? 100 : 0
    return round2((list.filter((m) => m.done).length / list.length) * 100)
  }

  if (kr.targetValue === null) return 0
  const span = kr.targetValue - kr.startValue
  if (span === 0) return 0
  const moved = kr.currentValue - kr.startValue
  return Math.max(0, Math.min(100, round2((moved / span) * 100)))
}

/**
 * A goal's progress, rolled up from its key results.
 *
 * Weighted where weights were set and evenly where they were not, so a goal
 * whose owner never bothered with weights still gets a sensible number rather
 * than a zero.
 */
export function rollUpProgress(keyResults: KeyResult[]): number | null {
  if (keyResults.length === 0) return null
  let weighted = 0
  let weights = 0
  for (const kr of keyResults) {
    const w = kr.weight > 0 ? kr.weight : 1
    weighted += attainment(kr) * w
    weights += w
  }
  if (weights === 0) return null
  return round2(weighted / weights)
}

function round2(value: number): number {
  // The + 0 turns a -0 into 0. Without it a key result that has not moved
  // renders as "-0%".
  return Math.round(value * 100) / 100 + 0
}

/** How a key result's current and target values should read on screen. */
export function formatValue(kr: KeyResult, value: number): string {
  switch (kr.measurementType) {
    case 'percentage':
      return `${round2(value)}%`
    case 'currency':
      return `${kr.currency} ${Math.round(value).toLocaleString('en-GB')}`
    case 'boolean':
      return kr.isAchieved ? 'Done' : 'Not done'
    case 'milestone': {
      const list = kr.milestones ?? []
      return `${list.filter((m) => m.done).length} of ${list.length}`
    }
    default:
      return kr.unit ? `${round2(value)} ${kr.unit}` : String(round2(value))
  }
}

// ---------------------------------------------------------------------------
// Weight policy
// ---------------------------------------------------------------------------

export type WeightPolicy = {
  requiredTotal: number
  tolerance: number
  minGoals: number
  maxGoals: number | null
}

export type WeightVerdict = {
  total: number
  count: number
  isValid: boolean
  problem: 'weight_over' | 'weight_under' | 'too_few_goals' | 'too_many_goals' | null
  message: string | null
}

/**
 * Do this employee's goals satisfy the cycle's weight policy?
 *
 * Evaluated over the SET, never per goal: you cannot build up to 100 one goal
 * at a time if each one has to total 100 on its own. Cancelled and rejected
 * goals are excluded because they are part of the history and not part of what
 * is being committed to.
 */
export function validateWeights(
  goals: { weight: number; status: GoalStatus; approvalStatus: ApprovalStatus }[],
  policy: WeightPolicy,
): WeightVerdict {
  const counted = goals.filter(
    (g) => g.status !== 'cancelled' && g.approvalStatus !== 'rejected',
  )
  const total = round2(counted.reduce((sum, g) => sum + g.weight, 0))
  const count = counted.length

  if (count < policy.minGoals) {
    return {
      total,
      count,
      isValid: false,
      problem: 'too_few_goals',
      message: problemMessage(policy, count, total),
    }
  }
  if (policy.maxGoals !== null && count > policy.maxGoals) {
    return { total, count, isValid: false, problem: 'too_many_goals', message: problemMessage(policy, count, total) }
  }
  if (Math.abs(total - policy.requiredTotal) > policy.tolerance) {
    return {
      total,
      count,
      isValid: false,
      problem: total > policy.requiredTotal ? 'weight_over' : 'weight_under',
      message: problemMessage(policy, count, total),
    }
  }
  return { total, count, isValid: true, problem: null, message: null }
}

function problemMessage(policy: WeightPolicy, count: number, total: number): string {
  if (count < policy.minGoals) {
    return `This cycle asks for at least ${policy.minGoals} goals. You have ${count}.`
  }
  if (policy.maxGoals !== null && count > policy.maxGoals) {
    return `This cycle allows at most ${policy.maxGoals} goals. You have ${count}.`
  }
  const gap = round2(policy.requiredTotal - total)
  return gap > 0
    ? `Your goals add up to ${total} of ${policy.requiredTotal}. ${gap} left to allocate.`
    : `Your goals add up to ${total}, which is ${round2(-gap)} over ${policy.requiredTotal}.`
}

/** Sort for a goal list: needs attention first, then closed. */
export function sortGoals<T extends { status: GoalStatus; approvalStatus: ApprovalStatus; dueDate: string | null }>(
  goals: T[],
  today: string,
): T[] {
  const rank = (g: T) => {
    if (g.approvalStatus === 'changes_requested') return 0
    if (isGoalClosed(g.status)) return 5
    if (g.status === 'off_track') return 1
    if (g.status === 'at_risk') return 2
    if (g.dueDate && g.dueDate < today) return 3
    return 4
  }
  return [...goals].sort(
    (a, b) => rank(a) - rank(b) || (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31'),
  )
}
