// Shared types for the Workforce module. The DB is the source of
// truth for these shapes; the client components consume the mapped
// versions returned by queries.ts.

// OpusFesta org structure — nine canonical departments. Mirrored on
// workforce_employees.department CHECK constraint
// (see migration 20260518000001_workforce_departments_v4_canonical.sql).
export type Department =
  | 'Technology'
  | 'Marketing & Partnership'
  | 'Content, Brand and Social Media'
  | 'Finance & Accountings'
  | 'UI & UX Design'
  | 'Operations'
  | 'Studio'
  | 'Founders'
  | 'HR'

export type EmploymentType = 'Permanent' | 'Contract' | 'Probation' | 'Intern'
export type EmployeeStatus = 'Active' | 'On Leave' | 'Onboarding' | 'Resigned'
export type Location = 'Dar es Salaam' | 'Arusha' | 'Zanzibar' | 'Remote'

export type DashboardAccessState = 'none' | 'invited' | 'active' | 'revoked'

export type Employee = {
  id: string
  employeeCode: string
  name: string
  email: string
  phone: string
  jobTitle: string
  department: Department
  manager: string | null
  managerId: string | null
  notes: string | null
  employmentType: EmploymentType
  status: EmployeeStatus
  location: Location
  startDate: string
  salaryTzs: number
  leaveBalanceDays: number
  avatarColor: string
  // Profile picture URL. Populated from Clerk's user.imageUrl when the
  // employee accepts their invitation (or when we link an existing Clerk
  // account). Null until then — the Avatar component falls back to the
  // initials-on-coloured-circle look.
  avatarUrl: string | null
  // Dashboard access (RBAC). When dashboardAccess is true, the employee
  // can sign in to the admin app; the role assigned via dashboardRoleId
  // determines which permissions they get. invitedAt is set the first
  // time we send them a Clerk invitation; lastDashboardLogin is updated
  // when they successfully accept it (or sign in afterwards).
  dashboardAccess: boolean
  dashboardRoleId: string | null
  invitedAt: string | null
  lastDashboardLogin: string | null
  clerkUserId: string | null
}

// A deliberately NARROW projection of Employee for pages that hand employee
// data to a client component.
//
// Anything a server component passes as a prop is serialised into the RSC
// payload and is readable in the browser's devtools. Passing the full
// `Employee` therefore ships salary_tzs, phone, notes and clerk_user_id to
// every viewer of that page, regardless of whether they hold
// workforce.payroll. The Roles page did exactly that.
//
// Keep this to fields that are genuinely rendered. If a screen needs more,
// add the field here consciously rather than widening back to `Employee`.
export type EmployeeDirectoryView = Pick<
  Employee,
  | 'id'
  | 'employeeCode'
  | 'name'
  | 'email'
  | 'jobTitle'
  | 'department'
  | 'status'
  | 'avatarColor'
  | 'avatarUrl'
  | 'dashboardAccess'
  | 'dashboardRoleId'
  | 'lastDashboardLogin'
>

/**
 * Project a full Employee down to the client-safe view. Call this in the
 * server component, never in the client.
 */
export function toEmployeeDirectoryView(e: Employee): EmployeeDirectoryView {
  return {
    id: e.id,
    employeeCode: e.employeeCode,
    name: e.name,
    email: e.email,
    jobTitle: e.jobTitle,
    department: e.department,
    status: e.status,
    avatarColor: e.avatarColor,
    avatarUrl: e.avatarUrl,
    dashboardAccess: e.dashboardAccess,
    dashboardRoleId: e.dashboardRoleId,
    lastDashboardLogin: e.lastDashboardLogin,
  }
}

/**
 * Leave-surface projection: the directory fields plus the one balance figure
 * the Leave screen renders.
 *
 * A SEPARATE view rather than widening EmployeeDirectoryView, so that adding
 * a balance to the Leave page does not silently ship it to the Roles page too.
 * Purpose-specific views keep each screen's payload to what it actually needs.
 * Still excludes salary, phone, notes and clerk_user_id.
 */
export type EmployeeLeaveView = EmployeeDirectoryView & {
  leaveBalanceDays: number
}

export function toEmployeeLeaveView(e: Employee): EmployeeLeaveView {
  return { ...toEmployeeDirectoryView(e), leaveBalanceDays: e.leaveBalanceDays }
}

export type ShiftType = 'Full day' | 'Half day' | 'On-call' | 'Remote' | 'Off'

export type WorkforceShift = {
  id: string
  employeeId: string
  weekday: number
  type: ShiftType
  start?: string
  end?: string
  note?: string
}

export type PayrollStatus = 'Draft' | 'In review' | 'Approved' | 'Paid'

export type PayrollRun = {
  id: string
  period: string
  payDate: string
  status: PayrollStatus
  headcount: number
  grossTzs: number
  payeTzs: number
  nssfTzs: number
  netTzs: number
}

export type LeaveType =
  | 'Annual'
  | 'Sick'
  | 'Maternity'
  | 'Paternity'
  | 'Compassionate'
  | 'Unpaid'
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'

export type LeaveRequest = {
  id: string
  employeeId: string
  type: LeaveType
  startDate: string
  endDate: string
  days: number
  status: LeaveStatus
  reason: string
  submittedAt: string
}

export type WorkforceAttendance = {
  id: string
  employeeId: string
  date: string
  clockIn: string | null
  clockOut: string | null
  status: 'Present' | 'Late' | 'Absent' | 'Remote' | 'Leave'
  workedHours: number
}

// --- Time clock (event log) ---

export type PunchType = 'in' | 'out'
export type PunchSource = 'web' | 'kiosk' | 'admin_manual' | 'auto_close'

export type TimePunch = {
  id: string
  employeeId: string
  punchAt: string // ISO timestamp
  type: PunchType
  source: PunchSource
  note: string | null
  locationLabel: string | null
  createdByClerkId: string | null
}

// One employee's clocking state right now.
export type TimeClockStatus = {
  employeeId: string
  isClockedIn: boolean
  sinceIso: string | null // ISO timestamp of the open clock-in, if any
  lastPunch: TimePunch | null
}

// Day rollup derived from a sequence of punches. workedMinutes counts
// completed in→out intervals. If the day ended with an unmatched 'in'
// the open interval contributes 0 to workedMinutes (we don't extrapolate
// to "now"); the caller can layer that on for the live display.
export type TimeDaySummary = {
  date: string // YYYY-MM-DD
  punches: TimePunch[]
  firstInIso: string | null
  lastOutIso: string | null
  workedMinutes: number
  openShift: boolean // last punch of the day was 'in' with no matching out
}

export type CurrentlyClockedEmployee = {
  employeeId: string
  employeeName: string
  employeeCode: string
  avatarUrl: string | null
  avatarColor: string
  sinceIso: string
}

export type PermissionGroup =
  | 'Website CMS'
  | 'Vendors'
  | 'Bookings'
  | 'Finance'
  | 'Workforce'
  | 'Insights'
  | 'Platform'
  | 'OpusPass'
  | 'MD Tracker'
  | 'Growth Tracker'
  | 'Support'

export type Permission = {
  key: string
  group: PermissionGroup
  label: string
  description: string
}

export type WorkforceRole = {
  id: string
  slug: string
  name: string
  description: string
  members: number
  permissionKeys: string[]
  isSystem: boolean
}

export type JobStage =
  | 'Applied'
  | 'Screening'
  | 'Interview'
  | 'Offer'
  | 'Hired'
  | 'Rejected'
export type JobStatus = 'Open' | 'On hold' | 'Closed'

export type Candidate = {
  id: string
  name: string
  email: string
  stage: JobStage
  appliedAt: string
  source: 'LinkedIn' | 'Referral' | 'Careers Page' | 'Direct' | 'Brighter Monday'
  rating: 1 | 2 | 3 | 4 | 5
}

// -----------------------------------------------------------------------------
// Employee records — resume / skills / certifications / badges / docs.
// Mirrors workforce_employee_{resume_entries,skills,certifications,badges,documents}
// rows (see migration 20260517000002).
// -----------------------------------------------------------------------------

export type ResumeEntryType = 'experience' | 'education' | 'project'

// Attachment metadata shared by every record type that can hold a file.
// `storagePath` is the object key in the `employees` Supabase bucket;
// the UI generates a signed URL on demand via getAttachmentUrl().
export type RecordAttachment = {
  storagePath: string
  fileName: string | null
  fileSizeBytes: number | null
  mimeType: string | null
}

export type ResumeEntry = {
  id: string
  employeeId: string
  entryType: ResumeEntryType
  title: string
  organization: string | null
  location: string | null
  startDate: string
  endDate: string | null
  description: string | null
  attachment: RecordAttachment | null
}

export type SkillCategory = 'language' | 'soft' | 'technical' | 'other'
export type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert'

export type EmployeeSkill = {
  id: string
  employeeId: string
  category: SkillCategory
  name: string
  level: SkillLevel
  proficiencyPercent: number
}

export type Certification = {
  id: string
  employeeId: string
  name: string
  issuingBody: string | null
  issuedDate: string | null
  expiresDate: string | null
  credentialId: string | null
  notes: string | null
  attachment: RecordAttachment | null
}

export type EmployeeBadge = {
  id: string
  employeeId: string
  badgeKind: string
  name: string
  description: string | null
  awardedAt: string
  awardedBy: string | null
  colorToken: string | null
  attachment: RecordAttachment | null
}

export type DocumentStatus = 'pending' | 'sent' | 'signed' | 'approved' | 'rejected'

export type EmployeeDocument = {
  id: string
  employeeId: string
  docType: string
  docLabel: string
  status: DocumentStatus
  required: boolean
  sentAt: string | null
  signedAt: string | null
  reviewedAt: string | null
  reviewedBy: string | null
  rejectionReason: string | null
  notes: string | null
  attachment: RecordAttachment | null
}

// Task assignments — admins / dept managers assign tasks to a single
// employee or a whole department, one-off or recurring. Mirrors
// workforce_task_assignments; workforce_tasks holds the per-employee
// instances the generator materialises. See migration 20260525000002.
export type TaskCadence = 'once' | 'daily' | 'weekly' | 'monthly'
export type TaskTargetType = 'employee' | 'department'
export type TaskCategory =
  | 'General'
  | 'Project'
  | 'Admin'
  | 'Reporting'
  | 'Meeting'
  | 'Onboarding'
  | 'Review'
export type TaskStatus = 'Todo' | 'In Progress' | 'Done' | 'Skipped'

export const TASK_CADENCES: TaskCadence[] = ['once', 'daily', 'weekly', 'monthly']
export const TASK_CATEGORIES: TaskCategory[] = [
  'General',
  'Project',
  'Admin',
  'Reporting',
  'Meeting',
  'Onboarding',
  'Review',
]

export type TaskAssignment = {
  id: string
  title: string
  description: string | null
  category: TaskCategory
  targetType: TaskTargetType
  targetEmployeeId: string | null
  targetEmployeeName: string | null
  targetDepartment: Department | null
  cadence: TaskCadence
  startDate: string
  endDate: string | null
  isActive: boolean
  assignedByName: string | null
  createdAt: string
  // Rollup over the generated instances (workforce_tasks).
  totalTasks: number
  doneTasks: number
}

// One generated per-employee instance — what the employee sees and
// completes on the My tasks page.
export type AssignedTask = {
  id: string
  title: string
  description: string | null
  category: TaskCategory
  cadence: TaskCadence
  status: TaskStatus
  dueDate: string | null
  occurrenceDate: string
  completedAt: string | null
  createdAt: string
}

export type Job = {
  id: string
  slug: string
  title: string
  department: Department
  location: Location
  type: EmploymentType
  status: JobStatus
  openedAt: string
  postedSalaryTzs: [number, number]
  hiringManager: string
  candidates: Candidate[]
}

// Permission catalog. Kept inline rather than DB-backed because these
// keys are referenced from code (the matrix renders descriptions); the
// only DB state is which permissions a role has, in workforce_roles.permission_keys.
export const PERMISSIONS: Permission[] = [
  { key: 'cms.read', group: 'Website CMS', label: 'View CMS content', description: 'Browse pages, articles and curation queues.' },
  { key: 'cms.write', group: 'Website CMS', label: 'Edit CMS content', description: 'Create and update website content and curation.' },
  { key: 'cms.publish', group: 'Website CMS', label: 'Publish content', description: 'Move drafts to live and revert published items.' },
  { key: 'vendor.read', group: 'Vendors', label: 'View vendor accounts', description: 'See vendor profiles, services and documents.' },
  { key: 'vendor.moderate', group: 'Vendors', label: 'Moderate vendors', description: 'Approve, suspend or update vendor accounts.' },
  { key: 'bookings.read', group: 'Bookings', label: 'View bookings', description: 'Read all booking pipelines across the platform.' },
  { key: 'bookings.write', group: 'Bookings', label: 'Update bookings', description: 'Edit status, dates and quotes.' },
  { key: 'finance.read', group: 'Finance', label: 'View finance', description: 'See invoices, payouts and reconciliation.' },
  { key: 'finance.write', group: 'Finance', label: 'Process payouts', description: 'Trigger transfers and approve refunds.' },
  { key: 'workforce.read', group: 'Workforce', label: 'View workforce', description: 'See employees, schedule and leave.' },
  { key: 'workforce.write', group: 'Workforce', label: 'Edit workforce', description: 'Create employees, edit roles, manage payroll.' },
  { key: 'workforce.payroll', group: 'Workforce', label: 'Run payroll', description: 'Approve and release monthly payroll.' },
  { key: 'workforce.roles.read', group: 'Workforce', label: 'View roles', description: 'Inspect roles, their members and the permission matrix. Read only.' },
  { key: 'workforce.roles.write', group: 'Workforce', label: 'Edit role definitions', description: 'Create, duplicate and edit roles, and change what permissions a role grants. Does not allow assigning members.' },
  { key: 'workforce.roles.assign', group: 'Workforce', label: 'Assign roles', description: 'Put people into approved roles and revoke them. Does not allow changing what a role grants, and cannot assign Owner or Admin.' },
  // Granular workforce keys (spec 3.2). The legacy workforce.read /
  // workforce.write pair above is retained and expands into these at runtime
  // via lib/workforce/permissions.ts, so no existing role breaks.
  { key: 'workforce.employees.read', group: 'Workforce', label: 'View employees', description: 'Browse the directory and employee profile basics.' },
  { key: 'workforce.employees.write', group: 'Workforce', label: 'Edit employees', description: 'Create and edit employee profiles.' },
  { key: 'workforce.employee_records.read', group: 'Workforce', label: 'View employee records', description: 'Resume, skills, certifications and badges.' },
  { key: 'workforce.employee_records.write', group: 'Workforce', label: 'Edit employee records', description: 'Maintain resume, skills, certifications and badges.' },
  { key: 'workforce.employee_documents.read', group: 'Workforce', label: 'View employee documents', description: 'Read employee documents, subject to each document\u2019s sensitivity class.' },
  { key: 'workforce.employee_documents.write', group: 'Workforce', label: 'Manage employee documents', description: 'Upload, review and approve employee documents.' },
  { key: 'workforce.employee_documents.legal', group: 'Workforce', label: 'View legal documents', description: 'Additionally unlocks legally confidential documents. Never granted by legacy expansion.' },
  { key: 'workforce.leave.read', group: 'Workforce', label: 'View leave', description: 'Organisation-wide leave register and calendar.' },
  { key: 'workforce.leave.approve', group: 'Workforce', label: 'Approve leave', description: 'Approve or reject any leave request. Never permits approving your own.' },
  { key: 'workforce.leave.admin', group: 'Workforce', label: 'Administer leave', description: 'Leave policies, balances and manual adjustments.' },
  { key: 'workforce.attendance.read', group: 'Workforce', label: 'View attendance', description: 'Organisation-wide attendance and exceptions.' },
  { key: 'workforce.attendance.approve', group: 'Workforce', label: 'Approve attendance', description: 'Approve corrections and missing punches.' },
  { key: 'workforce.attendance.admin', group: 'Workforce', label: 'Administer attendance', description: 'Attendance policy configuration.' },
  { key: 'workforce.scheduling.read', group: 'Workforce', label: 'View schedules', description: 'Rosters, shift plans and holiday calendars.' },
  { key: 'workforce.scheduling.write', group: 'Workforce', label: 'Edit schedules', description: 'Publish rosters, edit shifts and availability.' },
  { key: 'workforce.timesheets.read', group: 'Workforce', label: 'View timesheets', description: 'Organisation-wide timesheets.' },
  { key: 'workforce.timesheets.approve', group: 'Workforce', label: 'Approve timesheets', description: 'Sign off submitted timesheets.' },
  { key: 'workforce.tasks.read', group: 'Workforce', label: 'View tasks', description: 'Organisation-wide task assignments.' },
  { key: 'workforce.tasks.assign', group: 'Workforce', label: 'Assign tasks', description: 'Create, edit, reassign, cancel and reopen organisation-scoped assignments. Managers cover their own direct reports without this key.' },
  { key: 'workforce.report_templates.write', group: 'Workforce', label: 'Edit report templates', description: 'Maintain the report form templates staff submit against.' },
  { key: 'workforce.reports.read', group: 'Workforce', label: 'Workforce analytics', description: 'Turnover, headcount and attendance reporting.' },
  { key: 'workforce.performance.read', group: 'Workforce', label: 'View performance', description: 'Reviews, objectives and KPIs.' },
  { key: 'workforce.performance.write', group: 'Workforce', label: 'Manage performance', description: 'Create review cycles and edit objectives.' },
  { key: 'workforce.recruitment.read', group: 'Workforce', label: 'View recruitment', description: 'Jobs and candidate pipelines.' },
  { key: 'workforce.recruitment.write', group: 'Workforce', label: 'Manage recruitment', description: 'Post jobs, move candidates and make offers.' },
  { key: 'insights.read', group: 'Insights', label: 'View analytics', description: 'Access dashboards, exports and audit logs.' },
  { key: 'platform.admin', group: 'Platform', label: 'Manage platform', description: 'Domain settings, secrets, feature flags.' },
  { key: 'support.read', group: 'Support', label: 'View support conversations', description: 'Read the Opus customer-support console and its conversations.' },
  { key: 'support.write', group: 'Support', label: 'Reply in support', description: 'Reply to customers as an agent and manage conversation state.' },
  { key: 'commissions.read', group: 'OpusPass', label: 'View commissions', description: 'Read the custom card commission queue and design tasks.' },
  { key: 'commissions.manage', group: 'OpusPass', label: 'Run the commission studio', description: 'Assign and reassign designers, put orders on hold, pass or fail internal QA.' },
  { key: 'commissions.design', group: 'OpusPass', label: 'Design commissions', description: 'Accept assigned commission tasks and upload card versions. Scoped to your own tasks only.' },
  { key: 'opuspass.checkin', group: 'OpusPass', label: 'Event check-in', description: 'Assign scanning attendants and watch live door arrivals.' },
  { key: 'opuspass.tickets', group: 'OpusPass', label: 'Ticket generation', description: 'Import guest lists and generate printable entry-pass tickets.' },
  { key: 'opuspass.pledges.read', group: 'OpusPass', label: 'View pledge campaigns', description: 'Read pledge concierge campaigns for Elegant and Signature couples.' },
  { key: 'opuspass.pledges.write', group: 'OpusPass', label: 'Run pledge campaigns', description: 'Record pledges and payments, and send pledge requests and reminders.' },
  { key: 'opuspass.couples.read', group: 'OpusPass', label: 'View couple accounts', description: 'Browse every registered couple and drill into their events, guests and orders.' },
  { key: 'opuspass.couples.write', group: 'OpusPass', label: 'Manage couple accounts', description: 'Create and edit couple accounts, open their dashboard as them, link unattributed orders, adjust send credits and add internal notes.' },
  { key: 'opuspass.couples.delete', group: 'OpusPass', label: 'Delete couple accounts', description: 'Permanently delete a couple account, cascading their events, guests, RSVPs, pledges and registry. Irreversible.' },
  { key: 'md_tracker.opusfesta.write', group: 'MD Tracker', label: 'OpusFesta daily entries', description: 'Log OpusFesta’s daily priorities, status and blockers.' },
  { key: 'md_tracker.opusstudio.write', group: 'MD Tracker', label: 'OpusStudio daily entries', description: 'Log OpusStudio’s daily priorities, status and blockers.' },
  { key: 'md_tracker.opuspass.write', group: 'MD Tracker', label: 'OpusPass daily entries', description: 'Log OpusPass’s daily priorities, status and blockers.' },
  { key: 'md_tracker.review', group: 'MD Tracker', label: 'CEO review', description: 'Comment on and mark reviewed any engine’s weekly tracker.' },
  { key: 'growth.write', group: 'Growth Tracker', label: 'Log entries', description: 'Log vendor outreach, campaigns, social posts and studio bookings.' },
  { key: 'growth.admin', group: 'Growth Tracker', label: 'Edit targets', description: 'Edit KPI targets, the vendor-outreach roster, challenge schedule and content-ideas bank.' },
]

export const JOB_STAGES: JobStage[] = [
  'Applied',
  'Screening',
  'Interview',
  'Offer',
  'Hired',
  'Rejected',
]

export const DEPARTMENTS: Department[] = [
  'Technology',
  'Marketing & Partnership',
  'Content, Brand and Social Media',
  'Finance & Accountings',
  'UI & UX Design',
  'Operations',
  'Studio',
  'Founders',
  'HR',
]
