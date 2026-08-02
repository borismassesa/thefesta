'use client'

import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import {
  Award,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Globe,
  GraduationCap,
  IdCard,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Avatar from '../../_components/Avatar'
import StatusPill from '../../_components/StatusPill'
import { useSetPageHeading } from '@/components/PageHeading'
import { HeaderActionsSlot } from '@/components/HeaderPortals'
import {
  Department,
  Employee,
  EmployeeStatus,
  EmploymentType,
} from '../../_lib/data'
import type {
  Certification,
  DocumentStatus,
  EmployeeBadge,
  EmployeeDocument,
  EmployeeSkill,
  ResumeEntry,
  SkillCategory,
  WorkforceRole,
} from '../../_lib/types'
import type { EmployeeOrgNode } from '../../_lib/queries'
import { formatDate, formatTzs, tenureLabel } from '../../_lib/format'
import {
  DeleteEmployeeDialog,
  EmployeeFormDialog,
  type ManagerCandidate,
} from '../_components/EmployeeDialogs'
import {
  BadgeDialog,
  CertificationDialog,
  ConfirmDeleteRecordDialog,
  DocumentCreateDialog,
  DocumentEditDialog,
  DocumentRejectDialog,
  ResumeEntryDialog,
  SkillDialog,
  quickSetDocumentStatus,
  type DeleteKind,
} from './_components/RecordDialogs'
import { AttachmentControl } from './_components/AttachmentControl'

type Tab = 'work' | 'resume' | 'certifications' | 'badges' | 'documents'

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

// E.164 fallback for WhatsApp deep-links and tel: URIs. Strips spaces,
// dashes and parentheses so a phone like "+255 796 797 705" still pivots
// to a clean "tel:+255796797705".
function normalizePhone(phone: string): string {
  return phone.replace(/[\s()-]/g, '')
}

function waLink(phone: string): string {
  // wa.me requires no plus sign — `+255` becomes `255`.
  const digits = normalizePhone(phone).replace(/^\+/, '')
  return `https://wa.me/${digits}`
}

// Discriminated union for the open record dialog. Replacing six bool
// flags with one variant keeps render logic simple and makes
// "open exactly one dialog" the only representable state.
type RecordDialog =
  | { kind: 'resume'; entry: ResumeEntry | null }
  | { kind: 'skill'; skill: EmployeeSkill | null }
  | { kind: 'certification'; certification: Certification | null }
  | { kind: 'badge'; badge: EmployeeBadge | null }
  | { kind: 'document-create' }
  | { kind: 'document-edit'; doc: EmployeeDocument }
  | { kind: 'document-reject'; doc: EmployeeDocument }
  | { kind: 'delete'; deleteKind: DeleteKind; recordId: string; label: string }

export default function EmployeeDetailClient({
  employee,
  manager,
  directReports,
  departments,
  roles,
  managerCandidates,
  canManageAccess,
  annualLeaveEntitlementDays,
  resumeEntries,
  skills,
  certifications,
  badges,
  documents,
}: {
  employee: Employee
  manager: EmployeeOrgNode | null
  directReports: EmployeeOrgNode[]
  departments: Department[]
  roles: WorkforceRole[]
  managerCandidates: ManagerCandidate[]
  canManageAccess: boolean
  annualLeaveEntitlementDays: number
  resumeEntries: ResumeEntry[]
  skills: EmployeeSkill[]
  certifications: Certification[]
  badges: EmployeeBadge[]
  documents: EmployeeDocument[]
}) {
  const [tab, setTab] = useState<Tab>('work')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [recordDialog, setRecordDialog] = useState<RecordDialog | null>(null)

  // The global header reads from PageHeading context. On the detail
  // page we route the back link there instead of duplicating the
  // employee's name/role — that information already anchors the
  // identity card below.
  useSetPageHeading({
    title: employee.name,
    back: { href: '/workforce/employees', label: 'Employees' },
  })

  const hasContactBar =
    Boolean(employee.email) || Boolean(employee.phone)

  return (
    <div className="space-y-6">
      {/* Page-level CTAs portal into the global Header right rail. */}
      <HeaderActionsSlot>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Pencil className="h-4 w-4" />
          Edit
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </HeaderActionsSlot>

      {/* Identity hero — big avatar, name, role, contact bar. */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col gap-6 px-6 py-6 sm:flex-row sm:items-start sm:px-8 sm:py-7">
          <div className="flex-shrink-0">
            <Avatar
              name={employee.name}
              color={employee.avatarColor}
              src={employee.avatarUrl}
              size="lg"
              className="!h-24 !w-24 !rounded-2xl !text-2xl"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-gray-950 sm:text-[28px]">
                  {employee.name}
                </h1>
                <p className="mt-0.5 text-sm font-medium text-gray-500">
                  {employee.jobTitle}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusPill tone={STATUS_TONE[employee.status]} label={employee.status} />
                <StatusPill tone={TYPE_TONE[employee.employmentType]} label={employee.employmentType} />
                {employee.dashboardAccess && (
                  <StatusPill tone="purple" label="Dashboard access" />
                )}
              </div>
            </div>

            {hasContactBar && (
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                {employee.email && (
                  <a
                    href={`mailto:${employee.email}`}
                    className="inline-flex items-center gap-1.5 font-medium text-[#5B2D8E] transition-colors hover:text-[#7E5896]"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {employee.email}
                  </a>
                )}
                {employee.phone && (
                  <>
                    <a
                      href={`tel:${normalizePhone(employee.phone)}`}
                      className="inline-flex items-center gap-1.5 font-medium text-[#5B2D8E] transition-colors hover:text-[#7E5896]"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {employee.phone}
                    </a>
                    <a
                      href={waLink(employee.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:text-emerald-800"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tab strip lives at the bottom of the hero card so the visual
            hierarchy matches "identity → context → details". Documents
            shows a pending-count chip so HR sees at a glance whether
            the new hire's checklist needs attention. */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-gray-100 px-2 sm:px-4">
          <TabButton active={tab === 'work'} onClick={() => setTab('work')} label="Work" />
          <TabButton active={tab === 'resume'} onClick={() => setTab('resume')} label="Resume" />
          <TabButton
            active={tab === 'certifications'}
            onClick={() => setTab('certifications')}
            label="Certifications"
          />
          <TabButton active={tab === 'badges'} onClick={() => setTab('badges')} label="Badges" />
          <TabButton
            active={tab === 'documents'}
            onClick={() => setTab('documents')}
            label="Documents"
            badge={countOpenDocs(documents)}
          />
        </div>
      </div>

      {tab === 'work' && (
        <WorkTab employee={employee} manager={manager} directReports={directReports} />
      )}
      {tab === 'resume' && (
        <ResumeTab
          employee={employee}
          entries={resumeEntries}
          skills={skills}
          onAddEntry={() => setRecordDialog({ kind: 'resume', entry: null })}
          onEditEntry={(entry) => setRecordDialog({ kind: 'resume', entry })}
          onDeleteEntry={(entry) =>
            setRecordDialog({
              kind: 'delete',
              deleteKind: 'resume',
              recordId: entry.id,
              label: entry.title,
            })
          }
          onAddSkill={() => setRecordDialog({ kind: 'skill', skill: null })}
          onEditSkill={(skill) => setRecordDialog({ kind: 'skill', skill })}
          onDeleteSkill={(skill) =>
            setRecordDialog({
              kind: 'delete',
              deleteKind: 'skill',
              recordId: skill.id,
              label: `${skill.name} (${skill.category})`,
            })
          }
        />
      )}
      {tab === 'certifications' && (
        <CertificationsTab
          employeeId={employee.id}
          certifications={certifications}
          onAdd={() => setRecordDialog({ kind: 'certification', certification: null })}
          onEdit={(c) => setRecordDialog({ kind: 'certification', certification: c })}
          onDelete={(c) =>
            setRecordDialog({
              kind: 'delete',
              deleteKind: 'certification',
              recordId: c.id,
              label: c.name,
            })
          }
        />
      )}
      {tab === 'badges' && (
        <BadgesTab
          employeeId={employee.id}
          badges={badges}
          onAdd={() => setRecordDialog({ kind: 'badge', badge: null })}
          onEdit={(b) => setRecordDialog({ kind: 'badge', badge: b })}
          onDelete={(b) =>
            setRecordDialog({
              kind: 'delete',
              deleteKind: 'badge',
              recordId: b.id,
              label: b.name,
            })
          }
        />
      )}
      {tab === 'documents' && (
        <DocumentsTab
          employeeId={employee.id}
          documents={documents}
          onAdd={() => setRecordDialog({ kind: 'document-create' })}
          onEdit={(d) => setRecordDialog({ kind: 'document-edit', doc: d })}
          onReject={(d) => setRecordDialog({ kind: 'document-reject', doc: d })}
          onDelete={(d) =>
            setRecordDialog({
              kind: 'delete',
              deleteKind: 'document',
              recordId: d.id,
              label: d.docLabel,
            })
          }
        />
      )}

      {editOpen && (
        <EmployeeFormDialog
          mode="edit"
          employee={employee}
          departments={departments}
          roles={roles}
          managerCandidates={managerCandidates}
          canManageAccess={canManageAccess}
          annualLeaveEntitlementDays={annualLeaveEntitlementDays}
          onClose={() => setEditOpen(false)}
        />
      )}
      {deleteOpen && (
        <DeleteEmployeeDialog
          employee={employee}
          onClose={() => setDeleteOpen(false)}
        />
      )}

      {recordDialog?.kind === 'resume' && (
        <ResumeEntryDialog
          employeeId={employee.id}
          entry={recordDialog.entry}
          onClose={() => setRecordDialog(null)}
        />
      )}
      {recordDialog?.kind === 'skill' && (
        <SkillDialog
          employeeId={employee.id}
          skill={recordDialog.skill}
          onClose={() => setRecordDialog(null)}
        />
      )}
      {recordDialog?.kind === 'certification' && (
        <CertificationDialog
          employeeId={employee.id}
          certification={recordDialog.certification}
          onClose={() => setRecordDialog(null)}
        />
      )}
      {recordDialog?.kind === 'badge' && (
        <BadgeDialog
          employeeId={employee.id}
          badge={recordDialog.badge}
          onClose={() => setRecordDialog(null)}
        />
      )}
      {recordDialog?.kind === 'document-create' && (
        <DocumentCreateDialog
          employeeId={employee.id}
          onClose={() => setRecordDialog(null)}
        />
      )}
      {recordDialog?.kind === 'document-edit' && (
        <DocumentEditDialog
          employeeId={employee.id}
          doc={recordDialog.doc}
          onClose={() => setRecordDialog(null)}
        />
      )}
      {recordDialog?.kind === 'document-reject' && (
        <DocumentRejectDialog
          employeeId={employee.id}
          doc={recordDialog.doc}
          onClose={() => setRecordDialog(null)}
        />
      )}
      {recordDialog?.kind === 'delete' && (
        <ConfirmDeleteRecordDialog
          employeeId={employee.id}
          kind={recordDialog.deleteKind}
          recordId={recordDialog.recordId}
          label={recordDialog.label}
          onClose={() => setRecordDialog(null)}
        />
      )}
    </div>
  )
}

// Documents that still need work — "pending" or "sent" haven't been
// signed yet, "rejected" needs HR action to clear. Drives the count
// chip in the tab strip.
function countOpenDocs(docs: EmployeeDocument[]): number {
  return docs.filter((d) => d.status === 'pending' || d.status === 'sent' || d.status === 'rejected').length
}

function TabButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean
  onClick: () => void
  label: string
  badge?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-lg px-4 py-3 text-sm font-semibold transition-colors',
        active
          ? 'text-[#5B2D8E]'
          : 'text-gray-500 hover:text-gray-900',
      )}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span
          className={cn(
            'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
            active
              ? 'bg-[#7E5896] text-white'
              : 'bg-rose-100 text-rose-700',
          )}
        >
          {badge}
        </span>
      )}
      {active && (
        <span
          aria-hidden
          className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[#7E5896]"
        />
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Work tab
// ---------------------------------------------------------------------------

function WorkTab({
  employee,
  manager,
  directReports,
}: {
  employee: Employee
  manager: EmployeeOrgNode | null
  directReports: EmployeeOrgNode[]
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Work" icon={<Briefcase className="h-4 w-4" />} />
          <div className="divide-y divide-gray-100">
            <DetailRow label="Department" value={employee.department} />
            <DetailRow label="Job title" value={employee.jobTitle} />
            <DetailRow
              label="Manager"
              value={
                manager ? (
                  <Link
                    href={`/workforce/employees/${manager.id}`}
                    className="inline-flex items-center gap-2 font-medium text-gray-900 transition-colors hover:text-[#5B2D8E]"
                  >
                    <Avatar
                      name={manager.name}
                      color={manager.avatarColor}
                      src={manager.avatarUrl}
                      size="sm"
                    />
                    {manager.name}
                  </Link>
                ) : (
                  <span className="text-gray-500">Reports to founders</span>
                )
              }
            />
            <DetailRow label="Employment type" value={employee.employmentType} />
            <DetailRow label="Start date" value={formatDate(employee.startDate)} />
            <DetailRow label="Tenure" value={tenureLabel(employee.startDate)} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Location" icon={<MapPin className="h-4 w-4" />} />
          <div className="divide-y divide-gray-100">
            <DetailRow
              label="Address"
              value={
                <div className="text-right text-sm font-medium text-gray-900">
                  <p>OpusFesta Company Ltd.</p>
                  <p className="text-gray-500">{employee.location}</p>
                  <p className="text-gray-500">Tanzania</p>
                </div>
              }
            />
            <DetailRow label="Work location" value={employee.location} />
            <DetailRow label="Time zone" value="Africa/Dar es Salaam (EAT, UTC+3)" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Compensation" icon={<IdCard className="h-4 w-4" />} />
          <div className="divide-y divide-gray-100">
            <DetailRow label="Employee code" value={employee.employeeCode} />
            <DetailRow label="Monthly salary" value={formatTzs(employee.salaryTzs)} />
            <DetailRow label="Annual gross" value={formatTzs(employee.salaryTzs * 12)} />
            <DetailRow
              label="Leave balance"
              value={`${employee.leaveBalanceDays} day${employee.leaveBalanceDays === 1 ? '' : 's'}`}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Internal notes" icon={<FileText className="h-4 w-4" />} />
          <div className="px-5 py-4">
            {employee.notes ? (
              // `whitespace-pre-wrap` preserves line breaks admins type in
              // the textarea (probation comments, performance notes, etc.)
              // without rendering raw markup.
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                {employee.notes}
              </p>
            ) : (
              <p className="text-xs italic text-gray-400">
                No notes yet. Use the Edit dialog to add probation feedback, performance notes
                or any HR context.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Organization chart"
            icon={<Users className="h-4 w-4" />}
            trailing={
              <Link
                href="/workforce/roles"
                className="text-[11px] font-semibold uppercase tracking-wider text-[#5B2D8E] hover:text-[#7E5896]"
              >
                Roles ›
              </Link>
            }
          />
          <div className="px-4 py-4">
            {manager ? (
              <OrgNodeCard person={manager} subtitle="Manager" />
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 px-4 py-3 text-[12px] font-medium text-gray-400">
                No manager assigned — reports to founders.
              </div>
            )}

            <div className="my-3 ml-5 h-4 border-l-2 border-dashed border-gray-200" />

            <OrgNodeCard person={{ ...employeeToOrgNode(employee) }} highlighted />

            {directReports.length > 0 && (
              <div className="mt-3 space-y-2 border-l-2 border-dashed border-gray-200 pl-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Direct reports · {directReports.length}
                </p>
                {directReports.map((r) => (
                  <OrgNodeCard key={r.id} person={r} linkable />
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Dashboard access" icon={<Globe className="h-4 w-4" />} />
          <div className="divide-y divide-gray-100">
            <DetailRow
              label="Status"
              value={
                employee.dashboardAccess
                  ? 'Active — can sign in'
                  : employee.invitedAt
                    ? 'Invitation pending'
                    : 'No access'
              }
            />
            {employee.invitedAt && (
              <DetailRow label="Invited" value={formatDate(employee.invitedAt)} />
            )}
            {employee.lastDashboardLogin && (
              <DetailRow label="Last sign-in" value={formatDate(employee.lastDashboardLogin)} />
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

function employeeToOrgNode(e: Employee): EmployeeOrgNode {
  return {
    id: e.id,
    name: e.name,
    jobTitle: e.jobTitle,
    avatarColor: e.avatarColor,
    avatarUrl: e.avatarUrl,
  }
}

function OrgNodeCard({
  person,
  subtitle,
  highlighted = false,
  linkable = false,
}: {
  person: EmployeeOrgNode
  subtitle?: string
  highlighted?: boolean
  linkable?: boolean
}) {
  const inner = (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
        highlighted
          ? 'border-[#E0BEEC] bg-[#F0DFF6]'
          : 'border-gray-200 bg-white hover:border-[#E0BEEC] hover:bg-gray-50',
      )}
    >
      <Avatar name={person.name} color={person.avatarColor} src={person.avatarUrl} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-950">{person.name}</p>
        <p className="truncate text-xs text-gray-500">{subtitle ?? person.jobTitle}</p>
      </div>
      {linkable && (
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
      )}
    </div>
  )
  if (highlighted) return inner
  if (!linkable) return inner
  return (
    <Link href={`/workforce/employees/${person.id}`} className="block">
      {inner}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Resume tab — experience timeline + skills (full CRUD)
// ---------------------------------------------------------------------------

const RESUME_TYPE_LABEL: Record<ResumeEntry['entryType'], string> = {
  experience: 'Experience',
  education: 'Education',
  project: 'Project',
}

const SKILL_CATEGORY_LABEL: Record<SkillCategory, string> = {
  language: 'Languages',
  soft: 'Soft skills',
  technical: 'Technical',
  other: 'Other',
}

function ResumeTab({
  employee,
  entries,
  skills,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
  onAddSkill,
  onEditSkill,
  onDeleteSkill,
}: {
  employee: Employee
  entries: ResumeEntry[]
  skills: EmployeeSkill[]
  onAddEntry: () => void
  onEditEntry: (entry: ResumeEntry) => void
  onDeleteEntry: (entry: ResumeEntry) => void
  onAddSkill: () => void
  onEditSkill: (skill: EmployeeSkill) => void
  onDeleteSkill: (skill: EmployeeSkill) => void
}) {
  // The first entry on the timeline is always the OpusFesta tenure — a
  // synthetic row derived from workforce_employees.start_date + job_title.
  // HR-added entries appear before/after based on date order.
  const employeeTenure: ResumeEntry & { synthetic: true } = {
    id: '__current__',
    employeeId: employee.id,
    entryType: 'experience',
    title: employee.jobTitle,
    organization: 'OpusFesta Company Ltd.',
    location: employee.location,
    startDate: employee.startDate,
    endDate: null,
    description: null,
    attachment: null,
    synthetic: true,
  }

  // Merge + sort by start_date desc; nulls (current) bubble to top.
  const allEntries: (ResumeEntry & { synthetic?: boolean })[] = [employeeTenure, ...entries].sort(
    (a, b) => b.startDate.localeCompare(a.startDate),
  )

  const skillsByCategory = new Map<SkillCategory, EmployeeSkill[]>()
  for (const s of skills) {
    const list = skillsByCategory.get(s.category) ?? []
    list.push(s)
    skillsByCategory.set(s.category, list)
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <Card>
        <CardHeader
          title="Resume"
          icon={<GraduationCap className="h-4 w-4" />}
          trailing={
            <button
              type="button"
              onClick={onAddEntry}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:border-[#E0BEEC] hover:text-[#5B2D8E]"
            >
              <Plus className="h-3 w-3" />
              Add entry
            </button>
          }
        />
        <div className="px-5 py-5">
          <div className="border-l-2 border-[#E0BEEC] pl-5">
            {allEntries.map((entry) => (
              <ResumeRow
                key={entry.id}
                employeeId={employee.id}
                entry={entry}
                synthetic={Boolean(entry.synthetic)}
                onEdit={() => onEditEntry(entry)}
                onDelete={() => onDeleteEntry(entry)}
              />
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Skills"
          icon={<Sparkles className="h-4 w-4" />}
          trailing={
            <button
              type="button"
              onClick={onAddSkill}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:border-[#E0BEEC] hover:text-[#5B2D8E]"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          }
        />
        <div className="space-y-4 px-5 py-5">
          {skills.length === 0 ? (
            <EmptySection
              icon={<Sparkles className="h-4 w-4" />}
              title="No skills recorded yet"
              body="Click Add to capture languages, soft skills and technical expertise with proficiency bars."
            />
          ) : (
            (['language', 'soft', 'technical', 'other'] as SkillCategory[]).map((category) => {
              const list = skillsByCategory.get(category)
              if (!list || list.length === 0) return null
              return (
                <div key={category}>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                    {SKILL_CATEGORY_LABEL[category]}
                  </h4>
                  <div className="mt-2 space-y-2">
                    {list.map((skill) => (
                      <SkillRow
                        key={skill.id}
                        skill={skill}
                        onEdit={() => onEditSkill(skill)}
                        onDelete={() => onDeleteSkill(skill)}
                      />
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>
    </div>
  )
}

function ResumeRow({
  employeeId,
  entry,
  synthetic,
  onEdit,
  onDelete,
}: {
  employeeId: string
  entry: ResumeEntry
  synthetic: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const dateRange = entry.endDate
    ? `${formatDate(entry.startDate)} → ${formatDate(entry.endDate)}`
    : `${formatDate(entry.startDate)} → Present`
  return (
    <div className="group relative mb-5 last:mb-0">
      <span
        aria-hidden
        className="absolute -left-[27px] top-1.5 inline-block h-2.5 w-2.5 rounded-full bg-[#7E5896] ring-4 ring-[#F0DFF6]"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            <Calendar className="h-3 w-3" />
            {dateRange}
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
              {RESUME_TYPE_LABEL[entry.entryType]}
            </span>
          </p>
          <p className="mt-1 text-base font-semibold text-gray-950">{entry.title}</p>
          {entry.organization && (
            <p className="mt-0.5 text-sm text-gray-500">
              {entry.organization}
              {entry.location && <span className="text-gray-400"> · {entry.location}</span>}
            </p>
          )}
          {entry.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{entry.description}</p>
          )}
          {!synthetic && (
            <div className="mt-2">
              <AttachmentControl
                employeeId={employeeId}
                recordKind="resume"
                recordId={entry.id}
                attachment={entry.attachment}
                compact
              />
            </div>
          )}
        </div>
        {!synthetic && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <IconBtn
              label="Edit entry"
              onClick={onEdit}
              icon={<Pencil className="h-3.5 w-3.5" />}
              tone="purple"
            />
            <IconBtn
              label="Delete entry"
              onClick={onDelete}
              icon={<Trash2 className="h-3.5 w-3.5" />}
              tone="rose"
            />
          </div>
        )}
      </div>
      {synthetic && (
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-[#7E5896]">
          Current OpusFesta tenure · {tenureLabel(entry.startDate)}
        </p>
      )}
    </div>
  )
}

const LEVEL_BG: Record<EmployeeSkill['level'], string> = {
  Beginner: 'bg-gray-100 text-gray-700',
  Intermediate: 'bg-blue-50 text-blue-700',
  Advanced: 'bg-[#F0DFF6] text-[#5B2D8E]',
  Expert: 'bg-emerald-50 text-emerald-700',
}

function SkillRow({
  skill,
  onEdit,
  onDelete,
}: {
  skill: EmployeeSkill
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="group rounded-lg border border-gray-100 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-gray-950">{skill.name}</p>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                LEVEL_BG[skill.level],
              )}
            >
              {skill.level}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <IconBtn label="Edit skill" onClick={onEdit} icon={<Pencil className="h-3 w-3" />} tone="purple" />
          <IconBtn label="Remove skill" onClick={onDelete} icon={<Trash2 className="h-3 w-3" />} tone="rose" />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-[#7E5896] transition-[width] duration-200"
            style={{ width: `${skill.proficiencyPercent}%` }}
          />
        </div>
        <span className="text-[10px] font-bold tabular-nums text-gray-500">
          {skill.proficiencyPercent}%
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Certifications tab — full CRUD
// ---------------------------------------------------------------------------

function CertificationsTab({
  employeeId,
  certifications,
  onAdd,
  onEdit,
  onDelete,
}: {
  employeeId: string
  certifications: Certification[]
  onAdd: () => void
  onEdit: (c: Certification) => void
  onDelete: (c: Certification) => void
}) {
  // "Expiring soon" — surface certs within 60 days of expiry so HR
  // can chase renewals before they lapse.
  const now = new Date()
  function expiryState(cert: Certification): 'expired' | 'soon' | 'ok' | 'none' {
    if (!cert.expiresDate) return 'none'
    const expires = new Date(cert.expiresDate)
    const diffDays = (expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays < 0) return 'expired'
    if (diffDays < 60) return 'soon'
    return 'ok'
  }

  return (
    <Card>
      <CardHeader
        title="Certifications"
        icon={<Award className="h-4 w-4" />}
        trailing={
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:border-[#E0BEEC] hover:text-[#5B2D8E]"
          >
            <Plus className="h-3 w-3" />
            Add certification
          </button>
        }
      />
      {certifications.length === 0 ? (
        <div className="px-5 py-8">
          <EmptySection
            icon={<Award className="h-5 w-5" />}
            title="No certifications on file"
            body="Record diplomas, professional certificates and compliance training. Each entry tracks issuer, dates and an optional credential ID."
          />
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {certifications.map((cert) => {
            const state = expiryState(cert)
            return (
              <div key={cert.id} className="group flex items-start gap-4 px-5 py-4">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <Award className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-950">{cert.name}</p>
                    {state === 'expired' && (
                      <StatusPill tone="rose" label="Expired" />
                    )}
                    {state === 'soon' && (
                      <StatusPill tone="amber" label="Expires soon" />
                    )}
                  </div>
                  {cert.issuingBody && (
                    <p className="mt-0.5 text-xs text-gray-500">{cert.issuingBody}</p>
                  )}
                  <p className="mt-1 text-[11px] text-gray-400">
                    {cert.issuedDate ? `Issued ${formatDate(cert.issuedDate)}` : 'Issue date unknown'}
                    {cert.expiresDate && ` · Expires ${formatDate(cert.expiresDate)}`}
                    {cert.credentialId && ` · ID ${cert.credentialId}`}
                  </p>
                  {cert.notes && (
                    <p className="mt-2 text-xs text-gray-600">{cert.notes}</p>
                  )}
                  <div className="mt-2">
                    <AttachmentControl
                      employeeId={employeeId}
                      recordKind="certification"
                      recordId={cert.id}
                      attachment={cert.attachment}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <IconBtn
                    label={`Edit ${cert.name}`}
                    onClick={() => onEdit(cert)}
                    icon={<Pencil className="h-4 w-4" />}
                    tone="purple"
                  />
                  <IconBtn
                    label={`Delete ${cert.name}`}
                    onClick={() => onDelete(cert)}
                    icon={<Trash2 className="h-4 w-4" />}
                    tone="rose"
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Badges tab — full CRUD
// ---------------------------------------------------------------------------

const BADGE_TONE_BG: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700',
  purple: 'bg-[#F0DFF6] text-[#5B2D8E]',
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-blue-50 text-blue-700',
  rose: 'bg-rose-50 text-rose-700',
}

function BadgesTab({
  employeeId,
  badges,
  onAdd,
  onEdit,
  onDelete,
}: {
  employeeId: string
  badges: EmployeeBadge[]
  onAdd: () => void
  onEdit: (b: EmployeeBadge) => void
  onDelete: (b: EmployeeBadge) => void
}) {
  return (
    <Card>
      <CardHeader
        title="Badges"
        icon={<Sparkles className="h-4 w-4" />}
        trailing={
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:border-[#E0BEEC] hover:text-[#5B2D8E]"
          >
            <Plus className="h-3 w-3" />
            Award badge
          </button>
        }
      />
      {badges.length === 0 ? (
        <div className="px-5 py-8">
          <EmptySection
            icon={<Award className="h-5 w-5" />}
            title="No badges awarded yet"
            body="Recognize tenure, training completion or standout work. Each badge captures who awarded it and when."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map((badge) => {
            const tone = BADGE_TONE_BG[badge.colorToken ?? 'purple'] ?? BADGE_TONE_BG.purple
            return (
              <div
                key={badge.id}
                className="group relative flex items-start gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
              >
                <span
                  className={cn(
                    'inline-flex h-10 w-10 items-center justify-center rounded-full font-bold',
                    tone,
                  )}
                >
                  <Award className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-950">{badge.name}</p>
                  <p className="truncate text-xs uppercase tracking-wider text-gray-400">
                    {badge.badgeKind}
                  </p>
                  {badge.description && (
                    <p className="mt-1 text-xs text-gray-600">{badge.description}</p>
                  )}
                  <p className="mt-1 text-[10px] text-gray-400">
                    Awarded {formatDate(badge.awardedAt)}
                  </p>
                  <div className="mt-2">
                    <AttachmentControl
                      employeeId={employeeId}
                      recordKind="badge"
                      recordId={badge.id}
                      attachment={badge.attachment}
                      compact
                    />
                  </div>
                </div>
                <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <IconBtn
                    label={`Edit ${badge.name}`}
                    onClick={() => onEdit(badge)}
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    tone="purple"
                  />
                  <IconBtn
                    label={`Revoke ${badge.name}`}
                    onClick={() => onDelete(badge)}
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    tone="rose"
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Documents tab — onboarding checklist with status workflow
// ---------------------------------------------------------------------------

const DOC_STATUS_TONE: Record<DocumentStatus, 'gray' | 'amber' | 'blue' | 'green' | 'rose'> = {
  pending: 'gray',
  sent: 'amber',
  signed: 'blue',
  approved: 'green',
  rejected: 'rose',
}

const DOC_STATUS_LABEL: Record<DocumentStatus, string> = {
  pending: 'Pending',
  sent: 'Sent to employee',
  signed: 'Signed — awaiting review',
  approved: 'Approved',
  rejected: 'Rejected',
}

function DocumentsTab({
  employeeId,
  documents,
  onAdd,
  onEdit,
  onReject,
  onDelete,
}: {
  employeeId: string
  documents: EmployeeDocument[]
  onAdd: () => void
  onEdit: (d: EmployeeDocument) => void
  onReject: (d: EmployeeDocument) => void
  onDelete: (d: EmployeeDocument) => void
}) {
  // Group by status so HR sees pending work first, then signed (needs
  // review), then approved (archive) and rejected (needs follow-up).
  const grouped: Record<DocumentStatus, EmployeeDocument[]> = {
    pending: [],
    sent: [],
    signed: [],
    rejected: [],
    approved: [],
  }
  for (const doc of documents) grouped[doc.status].push(doc)

  const approved = grouped.approved.length
  const totalRequired = documents.filter((d) => d.required).length
  const approvedRequired = grouped.approved.filter((d) => d.required).length
  const progress = totalRequired === 0 ? 100 : Math.round((approvedRequired / totalRequired) * 100)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Onboarding documents"
          icon={<ClipboardList className="h-4 w-4" />}
          trailing={
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:border-[#E0BEEC] hover:text-[#5B2D8E]"
            >
              <Plus className="h-3 w-3" />
              Add document
            </button>
          }
        />
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <div>
              <p className="font-semibold text-gray-950">
                {approvedRequired} / {totalRequired} required documents approved
              </p>
              <p className="text-xs text-gray-500">
                {approved} total approved · {documents.length} documents tracked
              </p>
            </div>
            <span
              className={cn(
                'inline-flex h-7 items-center rounded-full px-3 text-[12px] font-bold tabular-nums',
                progress === 100
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-[#F0DFF6] text-[#5B2D8E]',
              )}
            >
              {progress}%
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={cn(
                'h-full transition-[width] duration-200',
                progress === 100 ? 'bg-emerald-500' : 'bg-[#7E5896]',
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </Card>

      {(['pending', 'sent', 'signed', 'rejected', 'approved'] as DocumentStatus[]).map((status) => {
        const list = grouped[status]
        if (list.length === 0) return null
        return (
          <Card key={status}>
            <CardHeader
              title={DOC_STATUS_LABEL[status]}
              icon={<FileText className="h-4 w-4" />}
              trailing={
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  {list.length} {list.length === 1 ? 'doc' : 'docs'}
                </span>
              }
            />
            <div className="divide-y divide-gray-100">
              {list.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  employeeId={employeeId}
                  doc={doc}
                  onEdit={() => onEdit(doc)}
                  onReject={() => onReject(doc)}
                  onDelete={() => onDelete(doc)}
                />
              ))}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function DocumentRow({
  employeeId,
  doc,
  onEdit,
  onReject,
  onDelete,
}: {
  employeeId: string
  doc: EmployeeDocument
  onEdit: () => void
  onReject: () => void
  onDelete: () => void
}) {
  // useTransition gives us the pending state so the buttons can show
  // the user that "mark as approved" is mid-flight. The action server-
  // side revalidates the page so the row re-renders with the new
  // status when we come back.
  const [pending, startTransition] = useTransition()

  function quick(next: DocumentStatus) {
    startTransition(async () => {
      try {
        await quickSetDocumentStatus(employeeId, doc, next)
      } catch (err) {
        console.error('[documents] status update failed', err)
      }
    })
  }

  return (
    <div className="group flex items-start gap-4 px-5 py-4">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
        <FileText className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-950">{doc.docLabel}</p>
          <StatusPill tone={DOC_STATUS_TONE[doc.status]} label={DOC_STATUS_LABEL[doc.status]} />
          {!doc.required && <StatusPill tone="gray" label="Optional" />}
        </div>
        <p className="mt-1 text-[11px] text-gray-400">
          {doc.sentAt && <>Sent {formatDate(doc.sentAt)} · </>}
          {doc.signedAt && <>Signed {formatDate(doc.signedAt)} · </>}
          {doc.reviewedAt && <>Reviewed {formatDate(doc.reviewedAt)}</>}
        </p>
        {doc.status === 'rejected' && doc.rejectionReason && (
          <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <span className="font-semibold">Rejected:</span> {doc.rejectionReason}
          </p>
        )}
        {doc.notes && (
          <p className="mt-1.5 text-xs text-gray-500">{doc.notes}</p>
        )}
        <div className="mt-2">
          <AttachmentControl
            employeeId={employeeId}
            recordKind="document"
            recordId={doc.id}
            attachment={doc.attachment}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          {doc.status === 'pending' && (
            <QuickAction
              icon={<Send className="h-3 w-3" />}
              label="Mark sent"
              tone="amber"
              pending={pending}
              onClick={() => quick('sent')}
            />
          )}
          {(doc.status === 'sent' || doc.status === 'pending') && (
            <QuickAction
              icon={<CheckCircle2 className="h-3 w-3" />}
              label="Mark signed"
              tone="blue"
              pending={pending}
              onClick={() => quick('signed')}
            />
          )}
          {doc.status === 'signed' && (
            <>
              <QuickAction
                icon={<CheckCircle2 className="h-3 w-3" />}
                label="Approve"
                tone="green"
                pending={pending}
                onClick={() => quick('approved')}
              />
              <QuickAction
                icon={<XCircle className="h-3 w-3" />}
                label="Reject"
                tone="rose"
                pending={pending}
                onClick={onReject}
              />
            </>
          )}
          {doc.status === 'rejected' && (
            <QuickAction
              icon={<Send className="h-3 w-3" />}
              label="Resend"
              tone="amber"
              pending={pending}
              onClick={() => quick('sent')}
            />
          )}
          {doc.status === 'approved' && (
            <QuickAction
              icon={<XCircle className="h-3 w-3" />}
              label="Revoke approval"
              tone="gray"
              pending={pending}
              onClick={() => quick('signed')}
            />
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <IconBtn
          label={`Edit ${doc.docLabel}`}
          onClick={onEdit}
          icon={<Pencil className="h-4 w-4" />}
          tone="purple"
        />
        <IconBtn
          label={`Delete ${doc.docLabel}`}
          onClick={onDelete}
          icon={<Trash2 className="h-4 w-4" />}
          tone="rose"
        />
      </div>
    </div>
  )
}

function QuickAction({
  icon,
  label,
  tone,
  pending,
  onClick,
}: {
  icon: ReactNode
  label: string
  tone: 'amber' | 'blue' | 'green' | 'rose' | 'gray'
  pending: boolean
  onClick: () => void
}) {
  const toneClass = {
    amber: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
    blue: 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    rose: 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100',
    gray: 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
  }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 font-semibold transition-colors disabled:opacity-50',
        toneClass,
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function IconBtn({
  label,
  onClick,
  icon,
  tone,
}: {
  label: string
  onClick: () => void
  icon: ReactNode
  tone: 'purple' | 'rose'
}) {
  const cls =
    tone === 'purple'
      ? 'hover:bg-[#F0DFF6] hover:text-[#5B2D8E]'
      : 'hover:bg-rose-50 hover:text-rose-700'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn('rounded-md p-1.5 text-gray-400 transition-colors', cls)}
    >
      {icon}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      {children}
    </div>
  )
}

function CardHeader({
  title,
  icon,
  trailing,
}: {
  title: string
  icon: ReactNode
  trailing?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
      <h3 className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 text-gray-700">
          {icon}
        </span>
        {title}
      </h3>
      {trailing}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
      <span className="font-medium text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{value}</span>
    </div>
  )
}

function EmptySection({
  icon,
  title,
  body,
}: {
  icon: ReactNode
  title: string
  body: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-6 py-8 text-center">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm">
        {icon}
      </span>
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="max-w-md text-xs text-gray-500">{body}</p>
    </div>
  )
}
