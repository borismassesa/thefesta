import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getAdminAccessRole, hasAnyPermission, isAdminDashboardRole } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export default async function OperationsLayout({ children }: { children: ReactNode }) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/contribute')
  // This route group contains several independently-owned workflows. The
  // layout only establishes that the caller may enter at least one of them;
  // each page still enforces its own source permission. In particular,
  // OpusPass check-in used to be visible in the sidebar but rejected here for
  // an operator who held only opuspass.checkin.
  if (
    !(await hasAnyPermission([
      'vendor.read',
      'bookings.read',
      'cms.write',
      'opuspass.checkin',
      'workforce.tasks.read',
      'finance.read',
      'workforce.read',
    ]))
  ) {
    redirect('/')
  }
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      {children}
    </div>
  )
}
