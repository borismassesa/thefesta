import { requireWorkspaceCapability } from '@/lib/workspace/guards'
import { workspaceErrorCode } from '@/lib/workspace/errors'
import AccessNotice from './_components/AccessNotice'
import HomeView from './_components/HomeView'
import WorkspaceHeading from './_components/WorkspaceHeading'
import { getWorkspaceHome } from './_lib/home'

export const dynamic = 'force-dynamic'

// Workspace Home.
//
// The page authorizes itself. The layout above already resolved the same
// session (React.cache means this costs nothing extra), but a page that trusts
// its layout is a page that stops being protected the moment someone renders it
// from somewhere else.
export default async function WorkspaceHomePage() {
  let context
  try {
    context = await requireWorkspaceCapability('workspace.read', { action: 'workspace.home' })
  } catch (error) {
    // Only ever a WorkspaceError with a fixed, safe message; anything else was
    // already collapsed to 'unavailable' inside the guard.
    return (
      <>
        <WorkspaceHeading title="Workspace" />
        <AccessNotice code={workspaceErrorCode(error)} />
      </>
    )
  }

  // The employee object IS the authorization. getWorkspaceHome takes no id.
  const home = await getWorkspaceHome(context.employee)

  return (
    <>
      <WorkspaceHeading
        title="Your day"
        subtitle={`${formatDayHeading(home.today)} · ${context.employee.name.split(' ')[0]}`}
      />
      <HomeView home={home} onboarding={context.onboarding} />
    </>
  )
}

function formatDayHeading(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}
