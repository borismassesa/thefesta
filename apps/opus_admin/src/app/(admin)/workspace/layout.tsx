import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getAdminAccessRole, getCallerPermissions, isAdminDashboardRole } from '@/lib/admin-auth'
import { getSelfIdentity } from '@/lib/workforce/identity'
import {
  hasAnyWorkforcePermission,
  selfIdentityMessage,
  workspaceNavFor,
} from '@/lib/workforce/scope'
import WorkspaceUnavailable from './_components/WorkspaceUnavailable'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Workspace shell — gated on IDENTITY, not on a permission.
// ---------------------------------------------------------------------------
// Implements sections 1, 2.6 and 5.1 of
// docs/WORKSPACE_WORKFORCE_ARCHITECTURE.md.
//
// This is the whole point of the Workspace/Workforce split. There is no
// "can view my own time clock" permission because no coherent role denies it.
// The gate is "is there a workforce_employees row linked to this Clerk user".
//
// Contrast with ../workforce/layout.tsx, which redirects on a missing
// workforce.read. That gate is why My Tasks and the Daily Tracker — both
// personal surfaces that were wrongly filed under /workforce — are unreachable
// today for content-editor and vendor-success, i.e. for Marketing, Content,
// UI & UX Design, Operations and Studio. Five of the nine departments.
//
// A failure here renders an explanation, never a bare 403 or a stack trace.
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/contribute')

  const identity = await getSelfIdentity()

  if (!identity.ok) {
    // Not signed in at all is a routing problem, not a Workspace problem:
    // send them to sign in rather than rendering a card that says "please
    // sign in" behind the authenticated shell.
    if (identity.error === 'UNAUTHENTICATED') redirect('/sign-in')
    // The copy differs for an administrator with no employee profile (a
    // legitimate state: they hold org permissions but were never added to the
    // directory) versus an ordinary user whose profile was never activated.
    const permissions = await getCallerPermissions()
    return (
      <WorkspaceUnavailable
        message={selfIdentityMessage(identity.error, hasAnyWorkforcePermission(permissions))}
        showWorkforceLink={hasAnyWorkforcePermission(permissions)}
      />
    )
  }

  // A resigned employee keeps documents_only: payslips and letters stay
  // reachable, but there is nothing to clock into and no requests to raise.
  if (workspaceNavFor(identity.access).length === 0) {
    return (
      <WorkspaceUnavailable
        message="Your Workspace is closed. Contact People Ops if you need access to your records."
        showWorkforceLink={false}
      />
    )
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-6 pt-4 sm:px-6 sm:pb-8 lg:px-8 lg:pb-10">
      {children}
    </div>
  )
}
