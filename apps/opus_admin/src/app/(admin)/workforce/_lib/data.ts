// Public type surface for the Workforce module. Source data lives in
// Supabase — server components fetch via `queries.ts`, mutations live
// in each route's `actions.ts`.

export type {
  Candidate,
  Department,
  Employee,
  EmployeeDirectoryView,
  EmployeeLeaveView,
  EmployeeStatus,
  EmploymentType,
  Job,
  JobStage,
  JobStatus,
  LeaveRequest,
  LeavePolicy,
  LeaveStatus,
  LeaveType,
  Location,
  PayrollRun,
  PayrollStatus,
  Permission,
  PermissionGroup,
  ShiftType,
  WorkforceAttendance,
  WorkforceShift,
  WorkforceRole,
} from './types'
export type { AnnualLeaveBalance, LeaveYear } from './leave-balances'

export {
  PERMISSIONS as permissions,
  JOB_STAGES,
  DEPARTMENTS as departments,
  EMPLOYEE_STATUSES,
  ENDED_EMPLOYEE_STATUSES,
  isCurrentEmployee,
} from './types'

// Backwards-compatible aliases kept so existing client components don't
// need to update their type imports.
export type Shift = import('./types').WorkforceShift
export type AttendancePoint = import('./types').WorkforceAttendance

export function jobStages(): import('./types').JobStage[] {
  return ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected']
}
