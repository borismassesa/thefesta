import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildCommandCenter,
  canViewCommandCenter,
  commandCenterAccess,
  type CommandCenterInput,
} from './command-center'

const fullAccess = {
  events: true,
  tasks: true,
  bookings: true,
  approvals: true,
}

function input(overrides: Partial<CommandCenterInput> = {}): CommandCenterInput {
  return {
    access: fullAccess,
    today: '2026-08-10',
    weekEnd: '2026-08-16',
    events: [],
    tasks: [],
    bookings: [],
    pendingBookingCount: 0,
    approvals: [],
    errorCount: 0,
    generatedAt: '2026-08-10T09:00:00.000Z',
    ...overrides,
  }
}

describe('Operations Command Center access', () => {
  it('derives every lane from the permission that owns its source', () => {
    const access = commandCenterAccess(
      new Set(['opuspass.checkin', 'workforce.tasks.read', 'bookings.read']),
    )
    assert.deepEqual(access, {
      events: true,
      tasks: true,
      bookings: true,
      approvals: false,
    })
    assert.equal(canViewCommandCenter(access), true)
    assert.equal(
      canViewCommandCenter(commandCenterAccess(new Set(['cms.write']))),
      false,
    )
  })

  it('drops rows supplied for unauthorized lanes before building the snapshot', () => {
    const snapshot = buildCommandCenter(
      input({
        access: { events: false, tasks: false, bookings: false, approvals: false },
        events: [
          {
            id: 'event-1',
            name: 'Private event',
            eventType: 'Wedding',
            startsAt: '2026-08-10T10:00:00+03:00',
            venue: null,
            ownerName: 'Private owner',
            activeAttendants: 0,
          },
        ],
        tasks: [
          {
            id: 'task-1',
            reference: null,
            title: 'Private task',
            status: 'blocked',
            priority: 'urgent',
            ownerName: 'Private owner',
            dueDate: '2026-08-01',
            blockerReason: 'Private blocker',
          },
        ],
        pendingBookingCount: 9,
      }),
    )
    assert.deepEqual(snapshot.metrics, [])
    assert.deepEqual(snapshot.attention, [])
    assert.deepEqual(snapshot.upcomingEvents, [])
    assert.equal(snapshot.pendingBookingCount, 0)
  })
})

describe('Operations Command Center snapshot', () => {
  it('computes actionable counts from canonical rows', () => {
    const snapshot = buildCommandCenter(
      input({
        events: [
          {
            id: 'today',
            name: 'Today event',
            eventType: 'Wedding',
            startsAt: '2026-08-10T12:00:00+03:00',
            venue: 'Dar es Salaam',
            ownerName: 'A Couple',
            activeAttendants: 2,
          },
          {
            id: 'week',
            name: 'Week event',
            eventType: 'Reception',
            startsAt: '2026-08-14T12:00:00+03:00',
            venue: null,
            ownerName: 'B Couple',
            activeAttendants: 0,
          },
          {
            id: 'later',
            name: 'Later event',
            eventType: 'Wedding',
            startsAt: '2026-08-20T12:00:00+03:00',
            venue: null,
            ownerName: 'C Couple',
            activeAttendants: 0,
          },
        ],
        tasks: [
          {
            id: 'blocked',
            reference: 'TSK-1',
            title: 'Allocate scanners',
            status: 'blocked',
            priority: 'urgent',
            ownerName: 'Ops Owner',
            dueDate: '2026-08-09',
            blockerReason: 'No scanners available',
          },
          {
            id: 'overdue',
            reference: 'TSK-2',
            title: 'Confirm transport',
            status: 'in_progress',
            priority: 'high',
            ownerName: null,
            dueDate: '2026-08-08',
            blockerReason: null,
          },
          {
            id: 'closed',
            reference: 'TSK-3',
            title: 'Done already',
            status: 'completed',
            priority: 'normal',
            ownerName: null,
            dueDate: '2026-08-01',
            blockerReason: null,
          },
        ],
        approvals: [
          {
            id: 'approval-1',
            subject: 'Transport vendor',
            categoryLabel: 'Procurement',
            ownerName: 'Requester',
            submittedAt: '2026-08-09T09:00:00Z',
          },
        ],
        pendingBookingCount: 3,
      }),
    )

    assert.deepEqual(
      Object.fromEntries(snapshot.metrics.map((metric) => [metric.id, metric.value])),
      { today: 1, week: 2, overdue: 2, blocked: 1, approvals: 1 },
    )
    assert.deepEqual(snapshot.upcomingEvents.map((event) => event.id), ['today', 'week'])
    assert.equal(snapshot.pendingBookingCount, 3)
  })

  it('orders intervention work ahead of approvals and booking follow-up', () => {
    const snapshot = buildCommandCenter(
      input({
        tasks: [
          {
            id: 'late',
            reference: null,
            title: 'Late task',
            status: 'planned',
            priority: 'high',
            ownerName: null,
            dueDate: '2026-08-09',
            blockerReason: null,
          },
          {
            id: 'blocked',
            reference: null,
            title: 'Blocked task',
            status: 'blocked',
            priority: 'urgent',
            ownerName: null,
            dueDate: '2026-08-11',
            blockerReason: 'Waiting for access',
          },
        ],
        approvals: [
          {
            id: 'approval',
            subject: 'Approve vendor',
            categoryLabel: 'Procurement',
            ownerName: 'Owner',
            submittedAt: '2026-08-08T12:00:00Z',
          },
        ],
        bookings: [
          {
            id: 'booking',
            name: 'Client',
            eventType: 'Wedding',
            eventDate: null,
            vendorName: 'Vendor',
            location: null,
            createdAt: '2026-08-07T12:00:00Z',
          },
        ],
      }),
    )
    assert.deepEqual(snapshot.attention.map((item) => item.kind), [
      'blocked',
      'overdue',
      'approval',
      'booking',
    ])
  })
})
