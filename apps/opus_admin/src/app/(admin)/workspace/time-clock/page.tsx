import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import WorkforceHeading from '../../workforce/_components/PageHeading'
import {
  getCurrentEmployee,
  getPunchesForEmployee,
  getTimeClockStatus,
} from '../../workforce/_lib/queries'
import { summarizePunchesByDay } from '../../workforce/_lib/time-summary'
import TimeclockClient from './TimeclockClient'

export const dynamic = 'force-dynamic'

// Hard-coded to East Africa Time. OpusFesta's staff and offices are in
// Tanzania; switching to a per-employee tz would mean another column on
// workforce_employees and a tz picker on the profile. Out of scope for v1.
const TZ = 'Africa/Dar_es_Salaam'

// Returns [start-of-week ISO, start-of-day-after-Sun ISO) in TZ. Weeks
// start on Monday — matches how the existing schedule UI is laid out.
function currentWeekRange(now: Date): { startIso: string; endIso: string } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekday = get('weekday') // Sun, Mon, ...
  const map: Record<string, number> = { Sun: 6, Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5 }
  const sinceMonday = map[weekday] ?? 0
  const dayMs = 86_400_000
  // Anchor to local-tz midnight, then walk back. Approximation via UTC
  // dates is fine here — we're computing a range to feed Supabase as ISO
  // strings; off-by-a-few-minutes only matters if a punch lands exactly
  // on the boundary, which the alternation guard already rejects from
  // duplicating.
  const today = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00+03:00`)
  const start = new Date(today.getTime() - sinceMonday * dayMs)
  const end = new Date(start.getTime() + 7 * dayMs)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export default async function MyTimeclockPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in?redirect_url=/me/timeclock')

  const user = await currentUser()
  const email =
    user?.primaryEmailAddress?.emailAddress?.toLowerCase() ??
    user?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ??
    null

  const employee = await getCurrentEmployee(userId, email)
  if (!employee) {
    return (
      <>
        <WorkforceHeading title="Time clock" subtitle="Clock in and out, track your hours." />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-semibold">No employee record linked to your account.</p>
          <p className="mt-1">
            Your sign-in ({email ?? 'unknown email'}) isn't connected to a workforce profile yet.
            Ask People Ops to add you to the employee directory, or to link your existing record
            to this Clerk account.
          </p>
        </div>
      </>
    )
  }

  const now = new Date()
  const { startIso, endIso } = currentWeekRange(now)
  const [status, weekPunches] = await Promise.all([
    getTimeClockStatus(employee.id),
    getPunchesForEmployee(employee.id, startIso, endIso),
  ])
  const days = summarizePunchesByDay(weekPunches, TZ)

  return (
    <>
      <WorkforceHeading title="Time clock" subtitle="Clock in and out, track your hours." />
      <TimeclockClient
        employee={{
          id: employee.id,
          name: employee.name,
          employeeCode: employee.employeeCode,
          avatarUrl: employee.avatarUrl,
          avatarColor: employee.avatarColor,
        }}
        initialStatus={status}
        weekStartIso={startIso}
        weekDays={days}
        timeZone={TZ}
      />
    </>
  )
}
