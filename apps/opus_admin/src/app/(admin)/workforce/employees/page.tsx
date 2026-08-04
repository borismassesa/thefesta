import { getCallerPermissions } from '@/lib/admin-auth'
import WorkforceHeading from '../_components/PageHeading'
import EmployeesClient from './EmployeesClient'
import { DEPARTMENTS, getEmployees, getOpenJobsCount, getRoles } from '../_lib/queries'
import { getAnnualLeaveEntitlementDays, getLeavePolicies } from '../_lib/leave-policy'

export const dynamic = 'force-dynamic'

export default async function EmployeesPage() {
  // Workforce roles are needed in the dialog so admins can pick which
  // dashboard role a new hire should hold; canManageAccess gates the
  // grant/revoke controls (only callers with platform.admin can change who
  // has dashboard access — see grantDashboardAccess in actions.ts).
  const [employees, openJobs, roles, permissions, leavePolicies] = await Promise.all([
    getEmployees(),
    getOpenJobsCount(),
    getRoles(),
    getCallerPermissions(),
    getLeavePolicies(),
  ])

  const canManageAccess = permissions.has('platform.admin')
  const annualLeaveEntitlementDays = getAnnualLeaveEntitlementDays(leavePolicies)

  return (
    <>
      <WorkforceHeading title="Employees" />
      <EmployeesClient
        employees={employees}
        departments={DEPARTMENTS}
        openJobs={openJobs}
        roles={roles}
        canManageAccess={canManageAccess}
        annualLeaveEntitlementDays={annualLeaveEntitlementDays}
      />
    </>
  )
}
