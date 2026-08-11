import { redirect } from 'next/navigation'
import { getAdminAccessRole, hasPermission, isAdminDashboardRole } from '@/lib/admin-auth'
import PayrollClient from './PayrollClient'
import FinancePayrollHeading from './FinancePayrollHeading'
// Payroll is presented under HR & People in the application navigation while
// its existing /finance/payroll URL is retained for bookmarks. Its data still
// flows through workforce_employees and workforce_payroll_runs.
import { getEmployees, getPayrollRuns } from '../../workforce/_lib/queries'

export const dynamic = 'force-dynamic'

export default async function PayrollPage() {
  // No finance/layout yet — gate here. Running payroll is privileged;
  // requirePermission would throw, hasPermission lets us redirect nicely.
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/contribute')
  if (!(await hasPermission('workforce.payroll'))) redirect('/')

  const [runs, employees] = await Promise.all([getPayrollRuns(), getEmployees()])
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <FinancePayrollHeading />
      <PayrollClient runs={runs} employees={employees} />
    </div>
  )
}
