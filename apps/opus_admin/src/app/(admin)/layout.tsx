import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { AdminMain } from '@/components/AdminMain'
import { DesktopOnlyNotice } from '@/components/DesktopOnlyNotice'
import { PageHeadingProvider } from '@/components/PageHeading'
import { PageSearchProvider } from '@/components/PageSearch'
import { InboxUnreadProvider } from '@/components/InboxUnread'
import { SidebarFocusProvider } from '@/components/SidebarFocus'
import { getInboxUnreadCount } from './inbox/data'
import {
  getAdminAccessRole,
  getCallerPermissions,
  getCallerProfile,
  isAdminAuthDisabled,
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

  // Seed for the Header's Messages badge. Cheap and synchronous today (an
  // in-memory filter over the inbox list), which is the only reason it sits
  // in the render path of a force-dynamic layout — the same reason
  // recordDashboardLogin above is deferred via after(). When the inbox moves
  // off demo data this must NOT become a blocking query here: fetch it from
  // the client provider or a route handler, or defer it, so the layout keeps
  // its promise of adding no round-trip to every navigation.
  const inboxUnreadSeed = getInboxUnreadCount()

  return (
    <PageHeadingProvider>
      <PageSearchProvider>
        <InboxUnreadProvider initial={inboxUnreadSeed}>
          {/* Lets a workspace-shaped page (the Operations Inbox today) ask the
              shell to step back to its icon rail while it is open. */}
          <SidebarFocusProvider>
            {/* The shell has no responsive layout; this states that plainly
                below the lg breakpoint rather than serving a broken one. */}
            <DesktopOnlyNotice />
            <div className="flex h-screen bg-[#FDFDFD] font-sans antialiased text-gray-900 print:block print:h-auto print:bg-white">
              <Sidebar
                permissions={permissions}
                profile={profile}
                workspace={workspace}
                clerkEnabled={!isAdminAuthDisabled()}
              />
              {/* Full-height secondary-sidebar column. Empty (0-width) on pages
                  without a secondary nav; pages portal their sidebar in via
                  SecondarySidebarSlot so the Header stays only above the content. */}
              <div id="secondary-sidebar" className="shrink-0 print:hidden" />
              <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0 print:block print:h-auto print:overflow-visible">
                <Header profile={profile} clerkEnabled={!isAdminAuthDisabled()} />
                <AdminMain>{children}</AdminMain>
              </div>
            </div>
          </SidebarFocusProvider>
        </InboxUnreadProvider>
      </PageSearchProvider>
    </PageHeadingProvider>
  )
}
