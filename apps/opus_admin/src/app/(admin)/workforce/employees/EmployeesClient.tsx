'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Briefcase,
  ChevronDown,
  Download,
  Mail,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  UserPlus,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { HeaderActionsSlot } from '@/components/HeaderPortals'
import Avatar from '../_components/Avatar'
import StatusPill from '../_components/StatusPill'
import Kpi, { KpiRow } from '../_components/Kpi'
import {
  Department,
  Employee,
  EmployeeStatus,
  EmploymentType,
} from '../_lib/data'
import type { WorkforceRole } from '../_lib/types'
import { formatDate, formatTzsCompact, tenureLabel } from '../_lib/format'
import {
  DeleteEmployeeDialog,
  EmployeeFormDialog,
  type ManagerCandidate,
} from './_components/EmployeeDialogs'
import { EMPLOYEE_STATUSES, isCurrentEmployee } from '../_lib/types'

const STATUS_TONE: Record<EmployeeStatus, 'green' | 'amber' | 'rose' | 'purple' | 'gray'> = {
  Active: 'green',
  'On Leave': 'amber',
  Onboarding: 'purple',
  Resigned: 'gray',
  // Access-withdrawing states read as warnings, not as neutral metadata.
  Suspended: 'amber',
  Terminated: 'rose',
}

const TYPE_TONE: Record<EmploymentType, 'blue' | 'green' | 'amber' | 'purple'> = {
  Permanent: 'green',
  Contract: 'blue',
  Probation: 'amber',
  Intern: 'purple',
}

const EMPLOYMENT_TYPES: EmploymentType[] = ['Permanent', 'Contract', 'Probation', 'Intern']
const STATUSES: EmployeeStatus[] = EMPLOYEE_STATUSES

// Seven columns: Employee, Employee ID, Role, Type, Joined, Status,
// Actions. ID sits second so the identity block (name + email +
// short HR code) clusters at the start of the row. Salary is dropped
// from the list view — sensitive comp info doesn't need to sit on a
// screenshot-friendly directory page; it still lives on the detail
// page + CSV export.
const ROW_GRID =
  'grid min-w-[1020px] grid-cols-[minmax(0,2.2fr)_90px_minmax(0,1.7fr)_110px_minmax(140px,1fr)_120px_72px] items-center gap-5'

export default function EmployeesClient({
  employees,
  departments,
  openJobs,
  roles,
  canManageAccess,
  annualLeaveEntitlementDays,
}: {
  employees: Employee[]
  departments: Department[]
  openJobs: number
  roles: WorkforceRole[]
  canManageAccess: boolean
  annualLeaveEntitlementDays: number
}) {
  const router = useRouter()
  // Manager-picker options — the roster itself is the source. Sorted
  // by name so the dropdown is scannable; computed once per employees
  // change.
  const managerCandidates: ManagerCandidate[] = useMemo(
    () =>
      [...employees]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => ({ id: e.id, name: e.name, jobTitle: e.jobTitle })),
    [employees],
  )

  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState<Department | 'All'>('All')
  const [status, setStatus] = useState<EmployeeStatus | 'All'>('All')
  const [type, setType] = useState<EmploymentType | 'All'>('All')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [deleting, setDeleting] = useState<Employee | null>(null)

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((e) => {
      if (department !== 'All' && e.department !== department) return false
      if (status !== 'All' && e.status !== status) return false
      if (type !== 'All' && e.employmentType !== type) return false
      if (!q) return true
      return (
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.jobTitle.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q)
      )
    })
  }, [employees, search, department, status, type])

  const totalSalary = useMemo(
    () => employees.filter((e) => isCurrentEmployee(e.status)).reduce((sum, e) => sum + e.salaryTzs, 0),
    [employees],
  )

  const totalActive = employees.filter((e) => isCurrentEmployee(e.status)).length
  const totalDepartments = new Set(employees.map((e) => e.department)).size
  const totalLocations = new Set(employees.map((e) => e.location)).size
  const hasActiveFilters = department !== 'All' || status !== 'All' || type !== 'All' || search !== ''

  function clearFilters() {
    setDepartment('All')
    setStatus('All')
    setType('All')
    setSearch('')
  }

  function openDetail(employeeId: string) {
    router.push(`/workforce/employees/${employeeId}`)
  }

  function exportCsv() {
    const rows = [
      ['Employee code', 'Name', 'Email', 'Phone', 'Job title', 'Department', 'Type', 'Status', 'Location', 'Start date', 'Salary (TZS)', 'Leave balance days'],
      ...visible.map((e) => [
        e.employeeCode,
        e.name,
        e.email,
        e.phone,
        e.jobTitle,
        e.department,
        e.employmentType,
        e.status,
        e.location,
        e.startDate,
        e.salaryTzs.toString(),
        e.leaveBalanceDays.toString(),
      ]),
    ]
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `opusfesta-employees-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <HeaderActionsSlot>
        <button data-opus-button="neutral" data-opus-button-size="medium"
          type="button"
          onClick={exportCsv}
          disabled={visible.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Export
        </button>
        <button data-opus-button="control"
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          Add employee
        </button>
      </HeaderActionsSlot>

      <KpiRow>
        <Kpi label="Total employees" value={String(totalActive)} delta={`${employees.length} total`} deltaTone="neutral" icon={<Users className="h-4 w-4" />} />
        <Kpi label="Departments" value={String(totalDepartments)} hint={`across ${totalLocations} location${totalLocations === 1 ? '' : 's'}`} icon={<Briefcase className="h-4 w-4" />} />
        <Kpi label="Monthly salary bill" value={formatTzsCompact(totalSalary)} delta="+1.4%" hint="vs last month" icon={<Mail className="h-4 w-4" />} />
        <Kpi label="Open roles" value={String(openJobs)} hint="recruitment pipeline" icon={<UserPlus className="h-4 w-4" />} />
      </KpiRow>

      <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search by name, role, email, ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
            />
          </div>
          <FilterPill
            label="Department"
            value={department}
            onChange={(v) => setDepartment(v as Department | 'All')}
            options={['All', ...departments]}
          />
          <FilterPill
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as EmployeeStatus | 'All')}
            options={['All', ...STATUSES]}
          />
          <FilterPill
            label="Type"
            value={type}
            onChange={(v) => setType(v as EmploymentType | 'All')}
            options={['All', ...EMPLOYMENT_TYPES]}
          />
          {hasActiveFilters && (
            <button data-opus-button="control"
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-gray-500 hover:text-[#5B2D8E]"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}

          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-gray-500 tabular-nums">
              {visible.length === employees.length
                ? `${employees.length} ${employees.length === 1 ? 'person' : 'people'}`
                : `${visible.length} of ${employees.length}`}
            </span>
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs font-semibold">
              <button data-opus-button="control"
                type="button"
                onClick={() => setView('list')}
                className={cn(
                  'rounded-md px-2.5 py-1 transition-colors',
                  view === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500',
                )}
              >
                List
              </button>
              <button data-opus-button="control"
                type="button"
                onClick={() => setView('grid')}
                className={cn(
                  'rounded-md px-2.5 py-1 transition-colors',
                  view === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500',
                )}
              >
                Grid
              </button>
            </div>
          </div>
        </div>
      </div>

      {view === 'list' ? (
        <div className="overflow-x-auto no-scrollbar rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div data-opus-table-header
            role="row"
            className={cn(
              ROW_GRID,
              'border-b border-gray-100 bg-gray-50/60 px-5 py-2.5 text-[11px] font-semibold text-gray-500',
            )}
          >
            <span>Employee</span>
            <span>Employee ID</span>
            <span>Role</span>
            <span>Type</span>
            <span>Joined</span>
            <span>Status</span>
            <span className="text-right pr-1">Actions</span>
          </div>

          {visible.length === 0 ? (
            <EmptyState />
          ) : (
            visible.map((e) => (
              <EmployeeRow
                key={e.id}
                employee={e}
                onOpen={() => openDetail(e.id)}
                onEdit={() => setEditing(e)}
                onDelete={() => setDeleting(e)}
              />
            ))
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((e) => (
            <EmployeeCard
              key={e.id}
              employee={e}
              onOpen={() => openDetail(e.id)}
              onEdit={() => setEditing(e)}
              onDelete={() => setDeleting(e)}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <EmployeeFormDialog
          mode="create"
          departments={departments}
          roles={roles}
          managerCandidates={managerCandidates}
          canManageAccess={canManageAccess}
          annualLeaveEntitlementDays={annualLeaveEntitlementDays}
          onClose={() => setShowAdd(false)}
        />
      )}
      {editing && (
        <EmployeeFormDialog
          mode="edit"
          employee={editing}
          departments={departments}
          roles={roles}
          managerCandidates={managerCandidates}
          canManageAccess={canManageAccess}
          annualLeaveEntitlementDays={annualLeaveEntitlementDays}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <DeleteEmployeeDialog
          employee={deleting}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

function EmployeeRow({
  employee,
  onOpen,
  onEdit,
  onDelete,
}: {
  employee: Employee
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Link data-opus-table-row
      role="row"
      href={`/workforce/employees/${employee.id}`}
      prefetch={false}
      onClick={(e) => {
        // Let middle/cmd-click open a new tab; intercept primary click for
        // SPA navigation via router.push so transitions stay fast.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
        e.preventDefault()
        onOpen()
      }}
      className={cn(
        ROW_GRID,
        'group cursor-pointer border-b border-gray-100 px-5 py-3 transition-colors last:border-b-0 hover:bg-gray-50/80',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={employee.name} color={employee.avatarColor} src={employee.avatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-950">{employee.name}</p>
          <p className="truncate text-xs text-gray-500">{employee.email}</p>
        </div>
      </div>
      <div className="min-w-0">
        <span className="font-mono text-[12px] font-semibold tracking-tight text-gray-700 tabular-nums">
          {employee.employeeCode}
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{employee.jobTitle}</p>
        <p className="truncate text-xs text-gray-500">{employee.department}</p>
      </div>
      <div>
        <StatusPill tone={TYPE_TONE[employee.employmentType]} label={employee.employmentType} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-700 tabular-nums">{formatDate(employee.startDate)}</p>
        <p className="truncate text-[11px] text-gray-400">{tenureLabel(employee.startDate)}</p>
      </div>
      <div className="flex flex-col items-start gap-1">
        <StatusPill tone={STATUS_TONE[employee.status]} label={employee.status} />
        {employee.dashboardAccess ? (
          <StatusPill tone="purple" label="Dashboard" />
        ) : employee.invitedAt ? (
          <StatusPill tone="amber" label="Invited" />
        ) : null}
      </div>
      <div
        className="flex items-center justify-end gap-0.5"
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
        }}
      >
        <button data-opus-button="control"
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${employee.name}`}
          title="Edit"
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-[#F0DFF6] hover:text-[#5B2D8E]"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button data-opus-button="control"
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${employee.name}`}
          title="Delete"
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-700"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </Link>
  )
}

function EmployeeCard({
  employee,
  onOpen,
  onEdit,
  onDelete,
}: {
  employee: Employee
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Link
      href={`/workforce/employees/${employee.id}`}
      prefetch={false}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
        e.preventDefault()
        onOpen()
      }}
      className="group relative block cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-3 pr-16">
        <Avatar name={employee.name} color={employee.avatarColor} src={employee.avatarUrl} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-950">{employee.name}</p>
          <p className="truncate text-xs text-gray-500">{employee.jobTitle}</p>
        </div>
      </div>
      <StatusPill
        tone={STATUS_TONE[employee.status]}
        label={employee.status}
        className="absolute right-5 top-5"
      />
      <div className="mt-4 flex flex-wrap gap-1.5">
        <StatusPill tone={TYPE_TONE[employee.employmentType]} label={employee.employmentType} />
        <StatusPill tone="gray" label={employee.department} />
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {employee.location}
        </span>
        <span className="font-bold uppercase tracking-wider text-[#7E5896]">
          {tenureLabel(employee.startDate)}
        </span>
      </div>

      <div
        className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
        }}
      >
        <button data-opus-button="control"
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${employee.name}`}
          title="Edit"
          className="rounded-md bg-white/90 p-1.5 text-gray-400 shadow-sm hover:bg-[#F0DFF6] hover:text-[#5B2D8E]"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button data-opus-button="control"
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${employee.name}`}
          title="Delete"
          className="rounded-md bg-white/90 p-1.5 text-gray-400 shadow-sm hover:bg-rose-50 hover:text-rose-700"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </Link>
  )
}

function FilterPill({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
}) {
  const active = value !== 'All'
  return (
    <label
      className={cn(
        'relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'border-[#E0BEEC] bg-[#F0DFF6] text-[#5B2D8E]'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
      )}
    >
      <span className="text-gray-400">{label}:</span>
      <span className={active ? 'text-[#5B2D8E]' : 'text-gray-900'}>{value}</span>
      <ChevronDown className="h-3 w-3 text-gray-400" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-700">
        <Users className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-gray-900">No employees match these filters</p>
      <p className="mt-1 text-sm text-gray-500">Try clearing a filter or adjusting the search.</p>
    </div>
  )
}
