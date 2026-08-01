import { redirect } from 'next/navigation'
import {
  getAdminAccessRole,
  getCallerEmail,
  getCallerPermissions,
} from '@/lib/admin-auth'
import WorkforceHeading from '../_components/PageHeading'
import RolesClient from './RolesClient'
import {
  getAllRoleMembers,
  getEmployees,
  getRoles,
  getWorkforceInvitations,
} from '../_lib/queries'
import { PERMISSIONS } from '../_lib/types'

export const dynamic = 'force-dynamic'

export default async function RolesPage() {
  // Gate on the explicit permission, not the legacy role bucket. The bucket
  // promoted every seeded role to 'admin', so the previous
  // `role !== 'owner' && role !== 'admin'` check let everyone through. The
  // server actions are authoritative regardless of what this page renders.
  const [role, permissions] = await Promise.all([
    getAdminAccessRole(),
    getCallerPermissions(),
  ])
  const isOwner = role === 'owner'
  if (!isOwner && !permissions.has('workforce.roles.read')) {
    redirect('/')
  }

  const [roles, employees, memberMap, callerEmail, invitations] =
    await Promise.all([
      getRoles(),
      getEmployees(),
      getAllRoleMembers(),
      getCallerEmail(),
      getWorkforceInvitations('pending'),
    ])

  // Mirrors the server-action gates: grant / change-role / revoke access and
  // invitation resend/revoke all require `platform.admin` (owner-only). The
  // UI hides those controls for anyone without it so non-owners never click a
  // button that would throw "You don't have permission".
  const canManageAccess = permissions.has('platform.admin')

  // Operation-level UI capabilities. These only hide controls; the server
  // actions re-check the same policy, so bypassing the UI changes nothing.
  const canWriteRoles = isOwner || permissions.has('workforce.roles.write')
  const canAssignRoles = isOwner || permissions.has('workforce.roles.assign')

  // Plain object so it crosses the server→client boundary cleanly.
  const memberIdsByRole: Record<string, string[]> = {}
  for (const r of roles) memberIdsByRole[r.id] = memberMap.get(r.id) ?? []

  return (
    <>
      <WorkforceHeading title="Roles & Permissions" />
      <RolesClient
        roles={roles}
        permissions={PERMISSIONS}
        employees={employees}
        memberIdsByRole={memberIdsByRole}
        invitations={invitations}
        callerEmail={callerEmail}
        canManageAccess={canManageAccess}
        canWriteRoles={canWriteRoles}
        canAssignRoles={canAssignRoles}
      />
    </>
  )
}
