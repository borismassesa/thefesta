import type { Employee, LeaveRequest } from './types'
import { countLeaveWeekdaysOverlapping } from './leave-days'

export type LeaveYear = {
  startDate: string
  endDate: string
  label: string
}

export type AnnualLeaveBalance = {
  employeeId: string
  entitlementDays: number
  usedDays: number
  remainingDays: number
  usagePercent: number
}

export function leaveYearForDate(date = new Date()): LeaveYear {
  const year = date.getUTCFullYear()
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    label: String(year),
  }
}

export function buildAnnualLeaveBalances({
  employees,
  requests,
  entitlementDays,
  leaveYear,
}: {
  employees: Pick<Employee, 'id' | 'leaveBalanceDays'>[]
  requests: Pick<LeaveRequest, 'employeeId' | 'type' | 'status' | 'startDate' | 'endDate'>[]
  entitlementDays: number
  leaveYear: Pick<LeaveYear, 'startDate' | 'endDate'>
}): AnnualLeaveBalance[] {
  const usedByEmployee = new Map<string, number>()

  for (const request of requests) {
    if (request.status !== 'Approved') continue

    const days = countLeaveWeekdaysOverlapping(
      request.startDate,
      request.endDate,
      leaveYear.startDate,
      leaveYear.endDate,
    )
    if (days === 0) continue

    usedByEmployee.set(request.employeeId, (usedByEmployee.get(request.employeeId) ?? 0) + days)
  }

  return employees.map((employee) => {
    const usedDays = usedByEmployee.get(employee.id) ?? 0
    const remainingDays = Math.max(0, entitlementDays - usedDays)
    const usagePercent =
      entitlementDays > 0
        ? Math.min(100, Math.max(0, Math.round((usedDays / entitlementDays) * 100)))
        : 0

    return {
      employeeId: employee.id,
      entitlementDays,
      usedDays,
      remainingDays,
      usagePercent,
    }
  })
}
