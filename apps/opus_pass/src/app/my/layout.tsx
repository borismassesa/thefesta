import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import DashboardShell from '@/components/dashboard/DashboardShell'
import StaffSessionBanner from '@/components/dashboard/StaffSessionBanner'
import { UIStringsProvider } from '@/components/providers/UIStringsProvider'
import { requireDashboardUser } from '@/lib/dashboard/auth'
import { getStaffSession } from '@/lib/dashboard/staff-session'
import { getCoupleProfile, coupleFirstNames } from '@/lib/dashboard/queries'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function MyLayout({ children }: { children: ReactNode }) {
  const user = await requireDashboardUser('/my/dashboard')
  const profile = await getCoupleProfile()
  // Sidebar caption reads best short — "Jonathan & Jenifer", not the full
  // "Jonathan David & Jenifer Kasala".
  const coupleName = coupleFirstNames(profile)
  const initial = (user.name ?? user.email).charAt(0).toUpperCase()
  const collapsed = (await cookies()).get('sidebar_collapsed')?.value === '1'
  const locale = await getLocale()
  const dashboardChrome = await loadUiStrings('dashboard-chrome', locale)
  // Only resolves when an OpusFesta admin opened this couple from the admin
  // Couple Accounts console. Re-verified here rather than passed down from
  // requireDashboardUser so the banner can also show when the session expires.
  const staffSession = await getStaffSession()

  return (
    <UIStringsProvider bundles={{ 'dashboard-chrome': dashboardChrome }}>
      <DashboardShell
        coupleName={coupleName}
        userEmail={user.email}
        userInitial={initial}
        defaultCollapsed={collapsed}
        staffSession={Boolean(staffSession)}
      >
        {staffSession ? (
          <StaffSessionBanner
            coupleName={coupleName}
            coupleEmail={user.email}
            adminEmail={staffSession.adminEmail}
            expiresAt={staffSession.expiresAt}
          />
        ) : null}
        {children}
      </DashboardShell>
    </UIStringsProvider>
  )
}
