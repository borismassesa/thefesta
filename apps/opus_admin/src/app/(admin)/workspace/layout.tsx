import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { capabilitiesFor } from '@/lib/workspace/access'
import { getWorkspaceSession } from '@/lib/workspace/identity'
import AccessNotice from './_components/AccessNotice'
import WorkspaceNav from './_components/WorkspaceNav'

export const dynamic = 'force-dynamic'

// Route shell for Workspace, the employee self-service module.
//
// The layout resolves the employee ONCE on the server (React.cache makes the
// page's own resolution free) and decides whether the module opens at all. What
// it does NOT do is authorize the page beneath it: each page and each server
// action calls requireWorkspaceCapability for itself, because a layout that
// rendered is not evidence that a later server action is allowed to write.
//
// Three outcomes:
//   unauthenticated -> bounce to sign-in.
//   unresolved      -> render the reason, no children. Missing, ambiguous and
//                      conflicting identities all land here and fail safe.
//   resolved        -> render the shell. `denied` still renders the shell, with
//                      the notice in place of the page.
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const session = await getWorkspaceSession()

  if (session.status === 'unauthenticated') {
    redirect('/sign-in?redirect_url=/workspace')
  }

  const shell = (body: ReactNode, nav?: ReactNode) => (
    <div className="mx-auto max-w-[1400px] px-4 pb-6 pt-4 sm:px-6 sm:pb-8 lg:px-8 lg:pb-10">
      {nav}
      {body}
    </div>
  )

  if (session.status === 'unresolved') {
    return shell(<AccessNotice code={session.code} />)
  }

  if (session.access === 'denied') {
    return shell(<AccessNotice code="access_denied" />)
  }

  return shell(
    children,
    <WorkspaceNav access={session.access} capabilities={capabilitiesFor(session.access)} />,
  )
}
