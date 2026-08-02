// "Employees only see authorized tasks and projects" and "task dependency rules
// prevent invalid completion where configured" are decided here.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  blockingDependencies,
  canComplete,
  canEditTask,
  canViewProject,
  canViewTask,
  checkStatusChange,
  formatEffort,
  isClosed,
  isOpen,
  sortTasks,
  wouldCreateCycle,
  type DependencyTarget,
  type TaskDependency,
  type TaskStatus,
} from './tasks'

describe('the status set', () => {
  it('has all seven, each labelled', () => {
    assert.equal(TASK_STATUSES.length, 7)
    for (const s of TASK_STATUSES) assert.ok(TASK_STATUS_LABELS[s].length > 0, s)
  })

  it('partitions every status into open or closed', () => {
    for (const s of TASK_STATUSES) {
      assert.notEqual(isOpen(s), isClosed(s), `${s} must be exactly one of open or closed`)
    }
  })
})

describe('canViewTask', () => {
  const base = {
    employeeId: 'amina',
    ownerEmployeeId: 'boaz',
    createdByEmployeeId: 'boaz',
    assigneeIds: [] as string[],
    projectVisible: false,
  }

  it('REFUSES a task nothing connects the employee to', () => {
    // The acceptance criterion, at its narrowest point.
    assert.equal(canViewTask(base), false)
  })

  it('allows the owner, the creator and an assignee', () => {
    assert.equal(canViewTask({ ...base, ownerEmployeeId: 'amina' }), true)
    assert.equal(canViewTask({ ...base, createdByEmployeeId: 'amina' }), true)
    assert.equal(canViewTask({ ...base, assigneeIds: ['amina'] }), true)
  })

  it('allows anyone who can see the project', () => {
    assert.equal(canViewTask({ ...base, projectVisible: true }), true)
  })

  it('allows an admin', () => {
    assert.equal(canViewTask({ ...base, isAdmin: true }), true)
  })

  it('hides a soft-deleted task from everyone, admin included', () => {
    assert.equal(canViewTask({ ...base, ownerEmployeeId: 'amina', deleted: true }), false)
    assert.equal(canViewTask({ ...base, isAdmin: true, deleted: true }), false)
  })
})

describe('canViewProject', () => {
  const base = {
    employeeId: 'amina',
    employeeDepartment: 'Technology',
    visibility: 'members' as const,
    managerId: 'boaz',
    sponsorId: null,
    memberIds: [] as string[],
    projectDepartment: 'Technology',
  }

  it('DEFAULTS TO PRIVATE: a members-only project is invisible to a non-member', () => {
    // "Do not grant employees unrestricted access to all company projects."
    assert.equal(canViewProject(base), false)
  })

  it('allows members, the manager and the sponsor', () => {
    assert.equal(canViewProject({ ...base, memberIds: ['amina'] }), true)
    assert.equal(canViewProject({ ...base, managerId: 'amina' }), true)
    assert.equal(canViewProject({ ...base, sponsorId: 'amina' }), true)
  })

  it('opens a department project to that department only', () => {
    assert.equal(canViewProject({ ...base, visibility: 'department' }), true)
    assert.equal(
      canViewProject({ ...base, visibility: 'department', employeeDepartment: 'Finance & Accountings' }),
      false,
    )
  })

  it('does not treat a department project with no department as visible', () => {
    assert.equal(
      canViewProject({ ...base, visibility: 'department', projectDepartment: null }),
      false,
    )
  })

  it('opens an organisation project to everyone', () => {
    assert.equal(canViewProject({ ...base, visibility: 'organisation' }), true)
  })

  it('hides an archived project even from a member', () => {
    assert.equal(canViewProject({ ...base, memberIds: ['amina'], archived: true }), false)
  })
})

describe('canEditTask', () => {
  const base = {
    employeeId: 'amina',
    ownerEmployeeId: 'boaz',
    createdByEmployeeId: 'boaz',
    assigneeIds: [] as string[],
    projectVisible: true,
  }

  it('does NOT let every project member move somebody else’s task', () => {
    // Visibility and authority are different questions. Conflating them lets
    // any member close anyone's work.
    assert.equal(canViewTask(base), true)
    assert.equal(canEditTask(base), false)
  })

  it('lets the owner and an assignee edit', () => {
    assert.equal(canEditTask({ ...base, ownerEmployeeId: 'amina' }), true)
    assert.equal(canEditTask({ ...base, assigneeIds: ['amina'] }), true)
  })

  it('never lets somebody edit what they cannot see', () => {
    assert.equal(canEditTask({ ...base, projectVisible: false, isAdmin: false }), false)
  })
})

describe('dependencies', () => {
  const target = (id: string, status: TaskStatus, deleted = false): DependencyTarget => ({
    id, status, deleted,
  })
  const tasksById = new Map<string, DependencyTarget>([
    ['open', target('open', 'in_progress')],
    ['done', target('done', 'completed')],
    ['dropped', target('dropped', 'cancelled')],
    ['gone', target('gone', 'in_progress', true)],
  ])

  const dep = (dependsOn: string, blocks = true): TaskDependency => ({
    taskId: 'mine', dependsOnTaskId: dependsOn, blocksCompletion: blocks,
  })

  it('BLOCKS completion on an unfinished blocking dependency', () => {
    const result = canComplete('mine', [dep('open')], tasksById)
    assert.equal(result.ok, false)
    if (!result.ok) assert.deepEqual(result.blockers.map((b) => b.id), ['open'])
  })

  it('allows completion when the blocker is done', () => {
    assert.deepEqual(canComplete('mine', [dep('done')], tasksById), { ok: true })
  })

  it('does not let a CANCELLED blocker strand the task forever', () => {
    // The work is not going to happen; keeping it as a gate would trap
    // everything behind it.
    assert.deepEqual(canComplete('mine', [dep('dropped')], tasksById), { ok: true })
  })

  it('ignores a deleted blocker', () => {
    assert.deepEqual(canComplete('mine', [dep('gone')], tasksById), { ok: true })
  })

  it('ignores a non-blocking link', () => {
    // Gating on every link makes people delete links rather than record them.
    assert.deepEqual(canComplete('mine', [dep('open', false)], tasksById), { ok: true })
  })

  it('reports every blocker, not just the first', () => {
    const many = new Map(tasksById)
    many.set('open2', target('open2', 'planned'))
    const result = canComplete('mine', [dep('open'), dep('open2')], many)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.blockers.length, 2)
  })

  it('ignores dependencies belonging to another task', () => {
    const other: TaskDependency = {
      taskId: 'someone-else', dependsOnTaskId: 'open', blocksCompletion: true,
    }
    assert.deepEqual(blockingDependencies('mine', [other], tasksById), [])
  })
})

describe('wouldCreateCycle', () => {
  // a depends on b, b depends on c.
  const existing: TaskDependency[] = [
    { taskId: 'a', dependsOnTaskId: 'b', blocksCompletion: true },
    { taskId: 'b', dependsOnTaskId: 'c', blocksCompletion: true },
  ]

  it('rejects a task depending on itself', () => {
    assert.equal(wouldCreateCycle('a', 'a', existing), true)
  })

  it('REJECTS the edge that closes a loop', () => {
    // c depending on a would make a -> b -> c -> a.
    assert.equal(wouldCreateCycle('c', 'a', existing), true)
  })

  it('allows an edge that does not', () => {
    assert.equal(wouldCreateCycle('a', 'd', existing), false)
    assert.equal(wouldCreateCycle('d', 'a', existing), false)
  })

  it('terminates on an already-cyclic graph instead of hanging', () => {
    const cyclic: TaskDependency[] = [
      { taskId: 'x', dependsOnTaskId: 'y', blocksCompletion: true },
      { taskId: 'y', dependsOnTaskId: 'x', blocksCompletion: true },
    ]
    assert.equal(wouldCreateCycle('z', 'x', cyclic), false)
  })
})

describe('checkStatusChange', () => {
  it('allows an ordinary move', () => {
    assert.deepEqual(
      checkStatusChange({ from: 'planned', to: 'in_progress', blockingCount: 0 }),
      { ok: true },
    )
  })

  it('demands a reason for blocking', () => {
    assert.deepEqual(
      checkStatusChange({ from: 'in_progress', to: 'blocked', blockingCount: 0 }),
      { ok: false, reason: 'blocker_reason_required' },
    )
    assert.deepEqual(
      checkStatusChange({ from: 'in_progress', to: 'blocked', note: 'Waiting on finance', blockingCount: 0 }),
      { ok: true },
    )
  })

  it('refuses completion while a dependency blocks', () => {
    assert.deepEqual(
      checkStatusChange({ from: 'in_progress', to: 'completed', blockingCount: 1 }),
      { ok: false, reason: 'blocked_by_dependency' },
    )
  })

  it('lets a closed task reopen, but only to an active status', () => {
    assert.deepEqual(checkStatusChange({ from: 'completed', to: 'in_progress', blockingCount: 0 }), {
      ok: true,
    })
    assert.deepEqual(checkStatusChange({ from: 'completed', to: 'cancelled', blockingCount: 0 }), {
      ok: false,
      reason: 'already_closed',
    })
  })
})

describe('sortTasks', () => {
  it('puts overdue first, then priority', () => {
    const tasks = [
      { id: 'later', dueDate: '2026-09-01', priority: 'urgent' as const, status: 'planned' as const },
      { id: 'overdue', dueDate: '2026-07-01', priority: 'low' as const, status: 'planned' as const },
      { id: 'today', dueDate: '2026-08-02', priority: 'normal' as const, status: 'planned' as const },
      { id: 'done', dueDate: '2026-07-01', priority: 'urgent' as const, status: 'completed' as const },
    ]
    assert.deepEqual(
      sortTasks(tasks, '2026-08-02').map((t) => t.id),
      ['overdue', 'today', 'later', 'done'],
    )
  })

  it('puts an undated task after a dated one of the same priority', () => {
    const tasks = [
      { id: 'undated', dueDate: null, priority: 'normal' as const, status: 'planned' as const },
      { id: 'dated', dueDate: '2026-09-01', priority: 'normal' as const, status: 'planned' as const },
    ]
    assert.deepEqual(sortTasks(tasks, '2026-08-02').map((t) => t.id), ['dated', 'undated'])
  })
})

describe('formatEffort', () => {
  it('reads as time, and says so when there is no estimate', () => {
    assert.equal(formatEffort(null), 'Not estimated')
    assert.equal(formatEffort(0), 'Not estimated')
    assert.equal(formatEffort(45), '45m')
    assert.equal(formatEffort(120), '2h')
    assert.equal(formatEffort(150), '2h 30m')
  })
})
