import { hasPermission } from '@/lib/admin-auth'
import { workspaceErrorCode } from '@/lib/workspace/errors'
import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import {
  aggregateEntries,
  getItemsForEntries,
  getMyEntries,
  getMyUnits,
  getMyWeeklySummaries,
  getReviewQueue,
} from '@/lib/tracker/queries'
import { addDays } from '@/lib/tracker/deadlines'
import AccessNotice from '../_components/AccessNotice'
import WorkspaceHeading from '../_components/WorkspaceHeading'
import TrackerClient from './TrackerClient'
import {
  addItem,
  addTrackerComment,
  removeItem,
  reviewEntry,
  saveEntry,
  saveWeeklySummary,
  setItemStatus,
  submitEntry,
  submitWeeklySummary,
} from './actions'

export const dynamic = 'force-dynamic'

// The daily tracker.
//
// Everything is scoped through getMyUnits, which reads tracking_assignments for
// the resolved employee. A unit nobody assigned to you is a unit you cannot see
// or name, which is the whole of "employees only see units assigned to them".
export default async function TrackerPage() {
  let context
  try {
    context = await requireWorkspaceCapability('tools.use', { action: 'tracker.view' })
  } catch (error) {
    return (
      <>
        <WorkspaceHeading title="Daily tracker" />
        <AccessNotice code={workspaceErrorCode(error)} />
      </>
    )
  }

  const { employee } = context
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  // Two weeks back: enough to see last week's review alongside this week's days
  // without loading a quarter of history nobody scrolls to.
  const from = addDays(today, -13)

  const [units, entries, weekly, reviewQueue, isAdmin] = await Promise.all([
    getMyUnits(employee),
    getMyEntries(employee, from, today),
    getMyWeeklySummaries(employee, 8),
    getReviewQueue(employee),
    hasPermission('workforce.write'),
  ])

  const weekStart = addDays(today, -(isoWeekdayOf(today) - 1))
  const thisWeek = entries.filter((e) => e.entryDate >= weekStart)

  // Items for the days on screen. Re-scoped through the caller's assignments
  // inside the query, so an entry id alone proves nothing.
  const itemsByEntry = await getItemsForEntries(
    employee,
    entries.map((e) => e.id),
  )

  return (
    <>
      <WorkspaceHeading
        title="Daily tracker"
        subtitle="What you committed to, what happened, and what is carrying forward."
      />
      <TrackerClient
        today={today}
        weekStart={weekStart}
        units={units}
        entries={entries}
        itemsByEntry={Object.fromEntries(itemsByEntry)}
        weekAggregate={aggregateEntries(thisWeek)}
        weeklySummaries={weekly}
        reviewQueue={reviewQueue}
        isAdmin={isAdmin}
        actions={{
          saveEntry,
          addItem,
          setItemStatus,
          removeItem,
          submitEntry,
          reviewEntry,
          saveWeeklySummary,
          submitWeeklySummary,
          addTrackerComment,
        }}
      />
    </>
  )
}

function isoWeekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 ? 7 : day
}
