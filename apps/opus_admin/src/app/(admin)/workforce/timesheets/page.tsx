import { redirect } from 'next/navigation'
import WorkforceHeading from '../_components/PageHeading'
import {
  getEmployees,
} from '../_lib/queries'
import { getScopedAttendance, getScopedCurrentlyClocked } from './_lib/queries'
import TimesheetsClient from './TimesheetsClient'

export const dynamic = 'force-dynamic'

const TZ = 'Africa/Dar_es_Salaam'

// Same Monday-anchored week as the employee /me/timeclock page. Kept
// duplicated rather than shared because the two pages have different
// surfaces and we want to avoid pulling page-level helpers across route
// boundaries.
function mondayOf(now: Date): Date {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const map: Record<string, number> = { Sun: 6, Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5 }
  const sinceMonday = map[get('weekday')] ?? 0
  const today = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00+03:00`)
  return new Date(today.getTime() - sinceMonday * 86_400_000)
}

function parseWeekParam(raw: string | undefined, now: Date): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00+03:00`)
  }
  return mondayOf(now)
}

type Search = { week?: string }

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  // Access is Team OR Org (spec 4): a manager reviews their own direct
  // reports without holding a Workforce key, and workforce.attendance.read
  // grants the organisation-wide view. Legacy workforce.read expands into it,
  // so Finance and Viewer keep the access they have for payroll and audits.
  //
  // Correcting punches is a SEPARATE, stronger authority — see canCorrect
  // below. Team visibility must never imply it.
  const params = await searchParams

  const now = new Date()
  const weekStart = parseWeekParam(params.week, now)
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000)

  const [attendance, allEmployees] = await Promise.all([
    getScopedAttendance(weekStart.toISOString(), weekEnd.toISOString()),
    getEmployees(),
  ])
  if (attendance.isEmptyTeam && !attendance.isOrgScope) redirect('/')
  const currentlyClocked = await getScopedCurrentlyClocked(attendance.visibleEmployeeIds)

  // The directory is narrowed to the same population as the punches, so a
  // manager cannot enumerate the company through the name column.
  const allowed = attendance.visibleEmployeeIds
    ? new Set(attendance.visibleEmployeeIds)
    : null
  const employees = allEmployees.filter((e) => (allowed ? allowed.has(e.id) : true))

  return (
    <>
      <WorkforceHeading
        title="Attendance"
        subtitle={
          attendance.isOrgScope
            ? "See who's working, review hours, fix punches, export for payroll."
            : 'Attendance for your direct reports.'
        }
      />
      <TimesheetsClient
        employees={employees.map((e) => ({
          id: e.id,
          employeeCode: e.employeeCode,
          name: e.name,
          department: e.department,
          avatarUrl: e.avatarUrl,
          avatarColor: e.avatarColor,
          status: e.status,
        }))}
        punches={attendance.punches}
        currentlyClocked={currentlyClocked}
        weekStartIso={weekStart.toISOString()}
        timeZone={TZ}
        canEdit={attendance.canCorrect}
      />
    </>
  )
}
