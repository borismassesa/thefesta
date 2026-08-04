import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  attainment,
  checkAlignment,
  formatValue,
  levelRank,
  rollUpProgress,
  sortGoals,
  validateWeights,
  type KeyResult,
} from './goals'

const kr = (over: Partial<KeyResult> = {}): KeyResult => ({
  id: 'k',
  measurementType: 'number',
  startValue: 0,
  targetValue: 10,
  currentValue: 0,
  direction: 'increase',
  unit: null,
  currency: 'TZS',
  isAchieved: false,
  weight: 0,
  ...over,
})

describe('levelRank', () => {
  it('puts company above employee', () => {
    assert.ok(levelRank('company') < levelRank('employee'))
    assert.ok(levelRank('brand') < levelRank('department'))
  })
})

describe('checkAlignment', () => {
  const graph = [
    { id: 'co', parentId: null, level: 'company' as const },
    { id: 'dept', parentId: 'co', level: 'department' as const },
    { id: 'me', parentId: 'dept', level: 'employee' as const },
  ]

  it('allows rolling up to a higher level', () => {
    assert.deepEqual(checkAlignment('new', 'employee', 'dept', graph), { ok: true })
  })

  it('allows rolling up to the same level', () => {
    assert.deepEqual(checkAlignment('new', 'employee', 'me', graph), { ok: true })
  })

  it('REFUSES an inverted alignment', () => {
    const result = checkAlignment('new', 'company', 'me', graph)
    assert.deepEqual(result, { ok: false, reason: 'inverted' })
  })

  it('REFUSES a goal parented to itself', () => {
    assert.deepEqual(checkAlignment('me', 'employee', 'me', graph), { ok: false, reason: 'self' })
  })

  it('REFUSES the edge that closes a loop', () => {
    // 'a' already leads to 'b'. Making 'b' the parent of 'a' closes it.
    const loop = [
      { id: 'a', parentId: null, level: 'employee' as const },
      { id: 'b', parentId: 'a', level: 'employee' as const },
    ]
    assert.deepEqual(checkAlignment('a', 'employee', 'b', loop), { ok: false, reason: 'cycle' })
  })

  it('does not hang on a graph that is already corrupt', () => {
    const corrupt = [
      { id: 'x', parentId: 'y', level: 'employee' as const },
      { id: 'y', parentId: 'x', level: 'employee' as const },
    ]
    assert.deepEqual(checkAlignment('new', 'employee', 'x', corrupt), { ok: true })
  })
})

describe('attainment', () => {
  it('number: halfway is 50', () => {
    assert.equal(attainment(kr({ currentValue: 5 })), 50)
  })

  it('counts DOWNWARD movement as progress on a falling target', () => {
    // Cutting response time from 40 minutes to 10 is the goal succeeding.
    // Reading it as failure is the classic bug here.
    const falling = kr({ startValue: 40, targetValue: 10, currentValue: 25, direction: 'decrease' })
    assert.equal(attainment(falling), 50)
  })

  it('caps an overshoot at 100', () => {
    assert.equal(attainment(kr({ currentValue: 30 })), 100)
  })

  it('never goes below zero when someone moves backwards', () => {
    assert.equal(attainment(kr({ currentValue: -5 })), 0)
  })

  it('boolean is 0 or 100, never in between', () => {
    assert.equal(attainment(kr({ measurementType: 'boolean', isAchieved: false })), 0)
    assert.equal(attainment(kr({ measurementType: 'boolean', isAchieved: true })), 100)
  })

  it('milestone counts the ticked ones', () => {
    const m = kr({
      measurementType: 'milestone',
      milestones: [
        { label: 'a', done: true },
        { label: 'b', done: true },
        { label: 'c', done: false },
        { label: 'd', done: false },
      ],
    })
    assert.equal(attainment(m), 50)
  })

  it('milestone with no list falls back to the achieved flag', () => {
    assert.equal(attainment(kr({ measurementType: 'milestone', milestones: [] })), 0)
    assert.equal(
      attainment(kr({ measurementType: 'milestone', milestones: [], isAchieved: true })),
      100,
    )
  })

  it('custom score reads against its own floor', () => {
    // A 1-to-5 scale sitting at 3 is halfway, not 60%.
    assert.equal(
      attainment(kr({ measurementType: 'custom_score', startValue: 1, targetValue: 5, currentValue: 3 })),
      50,
    )
  })

  it('returns 0 rather than dividing by zero when target equals start', () => {
    assert.equal(attainment(kr({ startValue: 5, targetValue: 5, currentValue: 5 })), 0)
  })

  it('returns 0 when there is no target at all', () => {
    assert.equal(attainment(kr({ targetValue: null })), 0)
  })
})

describe('rollUpProgress', () => {
  it('averages evenly when no weights are set', () => {
    assert.equal(rollUpProgress([kr({ currentValue: 10 }), kr({ currentValue: 0 })]), 50)
  })

  it('respects weights when they are', () => {
    const heavy = kr({ currentValue: 10, weight: 3 })
    const light = kr({ currentValue: 0, weight: 1 })
    assert.equal(rollUpProgress([heavy, light]), 75)
  })

  it('returns null with nothing to roll up, rather than a misleading zero', () => {
    assert.equal(rollUpProgress([]), null)
  })

  it('never produces negative zero', () => {
    const result = rollUpProgress([kr({ currentValue: 0 })])
    assert.equal(result, 0)
    assert.equal(Object.is(result, -0), false, 'a goal at zero must not render as "-0%"')
  })
})

describe('formatValue', () => {
  it('puts the currency in front', () => {
    assert.equal(formatValue(kr({ measurementType: 'currency' }), 1500000), 'TZS 1,500,000')
  })

  it('adds the percent sign', () => {
    assert.equal(formatValue(kr({ measurementType: 'percentage' }), 75), '75%')
  })

  it('uses the unit when there is one', () => {
    assert.equal(formatValue(kr({ unit: 'vendors' }), 12), '12 vendors')
  })
})

describe('validateWeights', () => {
  const policy = { requiredTotal: 100, tolerance: 0, minGoals: 2, maxGoals: 5 }
  const goal = (weight: number, over = {}) => ({
    weight,
    status: 'on_track' as const,
    approvalStatus: 'draft' as const,
    ...over,
  })

  it('accepts exactly the required total', () => {
    const v = validateWeights([goal(60), goal(40)], policy)
    assert.equal(v.isValid, true)
    assert.equal(v.total, 100)
  })

  it('REFUSES a set that is under', () => {
    const v = validateWeights([goal(60), goal(20)], policy)
    assert.equal(v.isValid, false)
    assert.equal(v.problem, 'weight_under')
    assert.match(v.message!, /20 left to allocate/)
  })

  it('REFUSES a set that is over', () => {
    const v = validateWeights([goal(60), goal(70)], policy)
    assert.equal(v.problem, 'weight_over')
    assert.match(v.message!, /30 over 100/)
  })

  it('REFUSES too few goals even when the weights add up', () => {
    const v = validateWeights([goal(100)], policy)
    assert.equal(v.problem, 'too_few_goals')
  })

  it('REFUSES too many', () => {
    const v = validateWeights(
      [goal(20), goal(20), goal(20), goal(20), goal(10), goal(10)],
      policy,
    )
    assert.equal(v.problem, 'too_many_goals')
  })

  it('excludes cancelled and rejected goals from the total', () => {
    const v = validateWeights(
      [goal(60), goal(40), goal(50, { status: 'cancelled' }), goal(50, { approvalStatus: 'rejected' })],
      policy,
    )
    assert.equal(v.isValid, true, 'abandoned goals must not block a valid set')
    assert.equal(v.total, 100)
  })

  it('honours a tolerance when the cycle allows one', () => {
    const loose = { ...policy, tolerance: 5 }
    assert.equal(validateWeights([goal(50), goal(46)], loose).isValid, true)
    assert.equal(validateWeights([goal(50), goal(40)], loose).isValid, false)
  })

  it('treats no maximum as no maximum', () => {
    const open = { ...policy, maxGoals: null }
    const many = Array.from({ length: 12 }, () => goal(100 / 12))
    assert.equal(validateWeights(many, open).problem, null)
  })
})

describe('sortGoals', () => {
  it('puts goals sent back for changes first, and closed ones last', () => {
    const goals = [
      { id: 'done', status: 'achieved' as const, approvalStatus: 'approved' as const, dueDate: null },
      { id: 'fine', status: 'on_track' as const, approvalStatus: 'approved' as const, dueDate: null },
      { id: 'back', status: 'on_track' as const, approvalStatus: 'changes_requested' as const, dueDate: null },
      { id: 'bad', status: 'off_track' as const, approvalStatus: 'approved' as const, dueDate: null },
    ]
    assert.deepEqual(
      sortGoals(goals, '2026-08-02').map((g) => g.id),
      ['back', 'bad', 'fine', 'done'],
    )
  })
})
