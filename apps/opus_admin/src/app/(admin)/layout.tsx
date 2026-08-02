import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { PageHeadingProvider } from '@/components/PageHeading'
import { PageSearchProvider } from '@/components/PageSearch'
import {
  getAdminAccessRole,
  getCallerPermissions,
  getCallerProfile,
  isAdminDashboardRole,
  recordDashboardLogin,
} from '@/lib/admin-auth'
import { getSelfIdentity } from '@/lib/workforce/identity'
import { workspaceNavFor } from '@/lib/workforce/scope'
import {
  WORKSPACE_LABELS,
  WORKSPACE_ROUTES,
  isWorkspaceRouteLive,
} from './workspace/_lib/routes'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/contribute')

  // Resolve the caller's full permission set + profile once on the layout and
  // pass them into the Sidebar. Independent of each other, so run in parallel.
  // Each NavItem can declare a required permission (items the caller can't see
  // drop out of the menu); the profile drives the sidebar account footer.
  const [permissionSet, profile, identity] = await Promise.all([
    getCallerPermissions(),
    getCallerProfile(),
    getSelfIdentity(),
  ])
  const permissions = Array.from(permissionSet)

  // Workspace nav is built from the caller's ACCESS STATE, on the server, and
  // handed to the Sidebar as a finished list. It is not a permission filter
  // applied in the client: Workspace carries no permission at all, and a
  // resigned employee's reduced menu (spec 2.6) is a policy decision that
  // belongs next to the policy, not in a rendering component.
  //
  // An Org-only administrator with no employee row gets an empty list and no
  // Workspace section, which is correct — there is no "my" anything for them.
  const workspace = identity.ok
    ? workspaceNavFor(identity.access)
        .filter((item) => item !== 'home')
        .map((item) => ({
          item,
          label: WORKSPACE_LABELS[item],
          href: WORKSPACE_ROUTES[item],
          live: isWorkspaceRouteLive(item),
        }))
    : []

  // Stamp this visit as the caller's last dashboard sign-in (throttled in SQL,
  // fully non-throwing). Deferred via after() so the DB round-trip runs off the
  // render critical path — this layout is force-dynamic, so it would otherwise
  // add a Supabase round-trip to every navigation. Keeps the Roles page
  // "Last sign-in" column accurate.
  after(recordDashboardLogin)

  return (
    <PageHeadingProvider>
      <PageSearchProvider>
        <div className="flex h-screen bg-[#FDFDFD] font-sans antialiased text-gray-900">
          <Sidebar permissions={permissions} profile={profile} workspace={workspace} />
          {/* Full-height secondary-sidebar column. Empty (0-width) on pages
              without a secondary nav; pages portal their sidebar in via
              SecondarySidebarSlot so the Header stays only above the content. */}
          <div id="secondary-sidebar" className="shrink-0" />
          <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
            <Header profile={profile} />
            <main className="flex-1 overflow-y-auto overflow-x-hidden">
              {children}
            </main>
          </div>
        </div>
      </PageSearchProvider>
    </PageHeadingProvider>
  )
}
