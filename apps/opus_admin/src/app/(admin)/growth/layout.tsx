import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getAdminAccessRole, hasAnyPermission, isAdminDashboardRole } from '@/lib/admin-auth'
import GrowthNav from './_components/GrowthNav'

export const dynamic = 'force-dynamic'

export default async function GrowthLayout({ children }: { children: ReactNode }) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/contribute')
  if (!(await hasAnyPermission(['growth.write', 'growth.admin']))) redirect('/')

  return (
    <div className="mx-auto max-w-350 px-4 pb-10 pt-4 sm:px-6 sm:pb-12 lg:px-8">
      <GrowthNav />
      {children}
    </div>
  )
}
