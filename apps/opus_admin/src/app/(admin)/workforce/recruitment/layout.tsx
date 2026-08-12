import type { ReactNode } from 'react'
import { getRecruitmentWorkspaceAccess } from '@/lib/recruitment-auth'
import { getCallerPermissions } from '@/lib/admin-auth'
import RecruitmentNav from './RecruitmentNav'

export const dynamic = 'force-dynamic'

export default async function RecruitmentLayout({ children }: { children: ReactNode }) {
  const [, permissions] = await Promise.all([
    getRecruitmentWorkspaceAccess(),
    getCallerPermissions(),
  ])
  return (
    <div className="recruitment-ui space-y-5">
      <RecruitmentNav permissions={[...permissions]} />
      {children}
    </div>
  )
}
