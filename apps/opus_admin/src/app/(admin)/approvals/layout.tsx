import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import {
  getAdminAccessRole,
  hasAnyPermission,
  isAdminDashboardRole,
} from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export default async function ApprovalsLayout({ children }: { children: ReactNode }) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/contribute')
  // Approvals is for finance/HR/ops approvers. Bounce anyone who only
  // holds CMS or vendor-moderation permissions (Content Editor, Vendor
  // Success) — they have no business in the travel/payments/procurement
  // feed. Mirror of the sidebar gate in components/Sidebar.tsx.
  if (!(await hasAnyPermission(['finance.read', 'workforce.read']))) {
    redirect('/')
  }
  return (
    // Tight top padding: the tab bar sits directly under the page heading
    // and reads as part of it, so the usual page-top gap just orphans it.
    <div className="mx-auto max-w-[1400px] px-4 pb-8 pt-3 sm:px-6 sm:pb-10 sm:pt-4 lg:px-8">
      {children}
    </div>
  )
}
