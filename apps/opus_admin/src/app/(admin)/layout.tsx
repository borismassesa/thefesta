import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { DesktopOnlyNotice } from '@/components/DesktopOnlyNotice'
import { PageHeadingProvider } from '@/components/PageHeading'
import { PageSearchProvider } from '@/components/PageSearch'
import {
  getAdminAccessRole,
  getCallerPermissions,
  getCallerProfile,
  isAdminDashboardRole,
  recordDashboardLogin,
} from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/contribute')

  // Resolve the caller's full permission set + profile once on the layout and
  // pass them into the Sidebar. Independent of each other, so run in parallel.
  // Each NavItem can declare a required permission (items the caller can't see
  // drop out of the menu); the profile drives the sidebar account footer.
  const [permissionSet, profile] = await Promise.all([
    getCallerPermissions(),
    getCallerProfile(),
  ])
  const permissions = Array.from(permissionSet)

  // Stamp this visit as the caller's last dashboard sign-in (throttled in SQL,
  // fully non-throwing). Deferred via after() so the DB round-trip runs off the
  // render critical path — this layout is force-dynamic, so it would otherwise
  // add a Supabase round-trip to every navigation. Keeps the Roles page
  // "Last sign-in" column accurate.
  after(recordDashboardLogin)

  return (
    <PageHeadingProvider>
      <PageSearchProvider>
        {/* The shell has no responsive layout; this states that plainly
            below the lg breakpoint rather than serving a broken one. */}
        <DesktopOnlyNotice />
        <div className="flex h-screen bg-[#FDFDFD] font-sans antialiased text-gray-900">
          <Sidebar permissions={permissions} profile={profile} />
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
