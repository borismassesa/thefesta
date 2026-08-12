import { redirect } from 'next/navigation'
import { getCallerPermissions, getCallerProfile } from '@/lib/admin-auth'
import { getSelfIdentity } from '@/lib/workforce/identity'
import DashboardHeading from './_dashboard/DashboardHeading'
import DashboardErrorBanner from './_dashboard/DashboardErrorBanner'
import ActionQueue from './_dashboard/ActionQueue'
import DepartmentLane from './_dashboard/DepartmentLane'
import MetricStrip from './_dashboard/MetricStrip'
import ChartGrid from './_dashboard/ChartGrid'
import PlatformPulse from './_dashboard/PlatformPulse'
import RecentActivity from './_dashboard/RecentActivity'
import QuickActions from './_dashboard/QuickActions'
import { getDashboardSnapshot } from './_dashboard/queries'

export const dynamic = 'force-dynamic'

// Soft-flavours the dashboard subtitle by department. Founders see the
// platform-wide framing; departmental folks see "you're seeing your
// team's view" so it's clear why the action queue / metrics are biased
// to their work.
function buildSubtitle(department: string | null): string {
  if (!department) return "Here's what's happening across OpusFesta today."
  if (department === 'Founders') {
    return "Platform-wide view — every department, every queue."
  }
  return `Your view as ${department} · everything you can act on right now.`
}

// Admin dashboard. Server component that pulls a single snapshot of
// counts + recent activity in one round trip, then composes the four
// sections — each gated by the caller's permission set so a finance-only
// viewer (for example) doesn't see vendor moderation cards.
//
// Personalised "Welcome, <name>" lives in <DashboardHeading /> (client)
// so it can push into PageHeading context. The name itself is resolved
// on the server (workforce / auth-bypass profile) — never via useUser,
// which throws outside ClerkProvider and is empty under DISABLE_ADMIN_AUTH.

export default async function DashboardPage() {
  // A Workspace-only employee (the seeded `employee` role holds zero keys)
  // would otherwise land on an empty dashboard: every section below is
  // permission-gated, so they would see chrome and nothing else. Send them to
  // the surface that is actually theirs.
  //
  // Checked before the snapshot query so we do not pay for a dashboard we are
  // about to redirect away from.
  const callerPermissions = await getCallerPermissions()
  if (callerPermissions.size === 0) {
    const identity = await getSelfIdentity()
    if (identity.ok) redirect('/workspace')
  }

  const [snapshot, permissions, profile] = await Promise.all([
    getDashboardSnapshot(),
    getCallerPermissions(),
    getCallerProfile(),
  ])

  return (
    <div className="px-8 py-8">
      <DashboardHeading
        subtitle={buildSubtitle(snapshot.caller.department)}
        name={snapshot.caller.fullName || profile.name}
      />

      <div className="mx-auto max-w-350 space-y-8">
        {/* Soft "values may be off" banner when one or more counter
            queries failed during snapshot build. Without it, broken
            DB = green dashboard. */}
        <DashboardErrorBanner errorCount={snapshot.errorCount} />

        {/* KPI strip at the top — the at-a-glance numbers anchor the page
            so the rest of the dashboard reads as supporting detail. */}
        <MetricStrip metrics={snapshot.headline} granted={permissions} />

        {/* Trends (charts) take the left, prominent column. Needs your
            attention sits on the right as a compact action list — the
            two flow as a hero band: numbers up top, charts in the middle,
            decisions waiting at hand. */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <ChartGrid
            charts={snapshot.charts}
            granted={permissions}
            department={snapshot.caller.department}
          />
          <ActionQueue
            counts={snapshot.actionQueue}
            granted={permissions}
            variant="list"
          />
        </div>

        {/* Department-flavoured "decisions for today" band. Renders
            nothing for Founders (they get PlatformPulse instead) or
            callers without a matching workforce_employees row. */}
        {snapshot.departmentLane && (
          <DepartmentLane lane={snapshot.departmentLane} />
        )}

        {/* Founders-only pulse band — surfaces the cross-departmental
            "stuck" items no single owner pursues by default. The query
            layer returns null for non-Founders, so this just doesn't
            render for everyone else. */}
        {snapshot.platformPulse && (
          <PlatformPulse pulse={snapshot.platformPulse} />
        )}

        {/* Two-column layout below the hero — activity on the left
            (the bigger surface, since the feed grows over time), quick
            actions on the right as a stable shortcut rail. */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <RecentActivity items={snapshot.activity} />
          <QuickActions granted={permissions} />
        </div>
      </div>
    </div>
  )
}
