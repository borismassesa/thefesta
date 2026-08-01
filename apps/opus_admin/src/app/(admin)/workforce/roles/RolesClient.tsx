'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Crown,
  Eye,
  Lock,
  Minus,
  Pencil,
  PenLine,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Avatar from '../_components/Avatar'
import StatusPill from '../_components/StatusPill'
import Kpi, { KpiRow } from '../_components/Kpi'
import type { Employee, Permission, PermissionGroup, WorkforceRole } from '../_lib/data'
import type { WorkforceInvitationListRow } from '../_lib/queries'
import AdminTeamSection from './AdminTeamSection'
import PendingInvitationsSection from './PendingInvitationsSection'
import {
  createRole,
  deleteRole,
  duplicateRole,
  setRoleMembers,
  updateRolePermissions,
} from './actions'

type Tab = 'people' | 'roles'

// Distinct icon per system role so users build muscle-memory: the
// Owner row anywhere on the dashboard always wears a Crown, Admin
// wears ShieldCheck, etc. Custom roles share the Sparkles glyph.
const SYSTEM_ROLE_ICONS: Record<string, LucideIcon> = {
  owner: Crown,
  admin: ShieldCheck,
  editor: PenLine,
  viewer: Eye,
  author: BookOpen,
}

function getRoleIcon(role: WorkforceRole): LucideIcon {
  return role.isSystem ? SYSTEM_ROLE_ICONS[role.slug] ?? Shield : Sparkles
}

type GroupCoverage = 'none' | 'partial' | 'full'

function computeGroupCoverage(
  groups: [PermissionGroup, Permission[]][],
  permissionKeys: string[],
): Map<PermissionGroup, GroupCoverage> {
  const granted = new Set(permissionKeys)
  const map = new Map<PermissionGroup, GroupCoverage>()
  for (const [groupName, items] of groups) {
    const count = items.filter((p) => granted.has(p.key)).length
    map.set(
      groupName,
      count === 0 ? 'none' : count === items.length ? 'full' : 'partial',
    )
  }
  return map
}

export default function RolesClient({
  roles,
  permissions,
  employees,
  memberIdsByRole,
  invitations,
  callerEmail,
  canManageAccess,
  canWriteRoles,
  canAssignRoles,
}: {
  roles: WorkforceRole[]
  permissions: Permission[]
  employees: Employee[]
  memberIdsByRole: Record<string, string[]>
  invitations: WorkforceInvitationListRow[]
  callerEmail: string | null
  canManageAccess: boolean
  // Operation-level capabilities. Purely presentational: hiding a control does
  // not authorise anything, and the matching server action re-checks the same
  // policy in lib/roles-authz.ts.
  canWriteRoles: boolean
  canAssignRoles: boolean
}) {
  const [tab, setTab] = useState<Tab>('people')
  const [selectedId, setSelectedId] = useState<string>(roles[0]?.id ?? '')
  const selected = roles.find((r) => r.id === selectedId) ?? roles[0]
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<WorkforceRole | null>(null)
  const [deleting, setDeleting] = useState<WorkforceRole | null>(null)
  const [assigning, setAssigning] = useState<WorkforceRole | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)

  const employeesById = useMemo(
    () => new Map(employees.map((e) => [e.id, e] as const)),
    [employees],
  )

  // Compute true member counts per role from BOTH sources so the role
  // catalog reconciles with the People table:
  //   - workforce_employees.dashboard_role_id (the primary role; what the
  //     People tab edits)
  //   - workforce_role_members (extra M2M role assignments)
  // Dedupe across the two so an employee who has Admin as primary AND is
  // also in workforce_role_members for Admin counts once.
  const memberCounts = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const role of roles) map.set(role.id, new Set())
    for (const e of employees) {
      if (e.dashboardAccess && e.dashboardRoleId) {
        map.get(e.dashboardRoleId)?.add(e.id)
      }
    }
    for (const [roleId, ids] of Object.entries(memberIdsByRole)) {
      const set = map.get(roleId)
      if (set) for (const id of ids) set.add(id)
    }
    return map
  }, [roles, employees, memberIdsByRole])

  const membersByRoleId = useMemo(() => {
    const map = new Map<string, Employee[]>()
    for (const [roleId, ids] of memberCounts) {
      const list: Employee[] = []
      for (const id of ids) {
        const e = employeesById.get(id)
        if (e) list.push(e)
      }
      list.sort((a, b) => a.name.localeCompare(b.name))
      map.set(roleId, list)
    }
    return map
  }, [memberCounts, employeesById])

  const groups = useMemo(() => {
    const map = new Map<PermissionGroup, Permission[]>()
    for (const p of permissions) {
      const list = map.get(p.group) ?? []
      list.push(p)
      map.set(p.group, list)
    }
    return Array.from(map.entries())
  }, [permissions])

  const totalActiveAdmins = employees.filter((e) => e.dashboardAccess).length
  const ownerCount = employees.filter(
    (e) =>
      e.dashboardAccess &&
      e.dashboardRoleId &&
      roles.find((r) => r.id === e.dashboardRoleId)?.slug === 'owner',
  ).length
  const totalMembers = Array.from(memberCounts.values()).reduce(
    (s, set) => s + set.size,
    0,
  )
  const systemRoles = roles.filter((r) => r.isSystem).length

  function duplicate(role: WorkforceRole) {
    setDuplicateError(null)
    setDuplicatingId(role.id)
    void (async () => {
      try {
        const result = await duplicateRole(role.id)
        setSelectedId(result.id)
        setTab('roles')
      } catch (err) {
        setDuplicateError(err instanceof Error ? err.message : 'Could not duplicate role.')
      } finally {
        setDuplicatingId(null)
      }
    })()
  }

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi label="Dashboard access" value={String(totalActiveAdmins)} hint={`${ownerCount} owner${ownerCount === 1 ? '' : 's'}`} icon={<Lock className="h-4 w-4" />} />
        <Kpi label="Workforce roles" value={String(roles.length)} hint={`${systemRoles} system · ${roles.length - systemRoles} custom`} icon={<Shield className="h-4 w-4" />} />
        <Kpi label="Members assigned" value={String(totalMembers)} hint="across all roles" icon={<Users className="h-4 w-4" />} />
        <Kpi label="Permissions" value={String(permissions.length)} hint={`${groups.length} groups`} icon={<ShieldCheck className="h-4 w-4" />} />
      </KpiRow>

      {/* Two-tab split — "People" handles who can sign in (admin team) and
          "Roles" defines what each role can do (permission catalog). One
          URL, shared KPI strip above. The disconnect from the old single-
          scroll layout (5 admins at top, 0 members at bottom) is gone
          because both tabs read counts from the same source: workforce_
          employees.dashboard_role_id + workforce_role_members. */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <TabButton current={tab} value="people" onSelect={setTab} count={totalActiveAdmins}>
          People
        </TabButton>
        <TabButton current={tab} value="roles" onSelect={setTab} count={roles.length}>
          Roles
        </TabButton>
      </div>

      {tab === 'people' && (
        <div className="space-y-8">
          <AdminTeamSection
            employees={employees}
            roles={roles}
            callerEmail={callerEmail}
            canManageAccess={canManageAccess}
          />
          <PendingInvitationsSection
            invitations={invitations}
            canManageAccess={canManageAccess}
          />
        </div>
      )}

      {tab === 'roles' && (
      <section className="space-y-4">
        <header className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-gray-900">Workforce roles</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Define the permission bundle for each role. People in the “People” tab pick from these roles. System roles ship locked — duplicate them to make a custom variant.
            </p>
          </div>
        </header>

        {duplicateError && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {duplicateError}
          </p>
        )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <RoleRail
          roles={roles}
          selectedId={selectedId}
          memberCounts={memberCounts}
          groups={groups}
          onSelect={setSelectedId}
          onNewRole={canWriteRoles ? () => setShowCreate(true) : undefined}
        />

        {selected && (
          <div className="space-y-4">
            <RoleHeroCard
              role={selected}
              groups={groups}
              memberCount={membersByRoleId.get(selected.id)?.length ?? 0}
              duplicating={duplicatingId === selected.id}
              onDelete={canWriteRoles ? () => setDeleting(selected) : undefined}
              onDuplicate={canWriteRoles ? () => duplicate(selected) : undefined}
              onAssign={canAssignRoles ? () => setAssigning(selected) : undefined}
              onEdit={canWriteRoles ? () => setEditing(selected) : undefined}
            />

            <MembersCard
              role={selected}
              members={membersByRoleId.get(selected.id) ?? []}
              onAssign={canAssignRoles ? () => setAssigning(selected) : undefined}
            />

            <PermissionMatrix groups={groups} role={selected} />
          </div>
        )}
      </div>
      </section>
      )}

      {showCreate && (
        <RoleFormDialog
          mode="create"
          groups={groups}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editing && (
        <RoleFormDialog
          mode="edit"
          groups={groups}
          role={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <DeleteRoleDialog role={deleting} onClose={() => setDeleting(null)} />
      )}
      {assigning && (
        <AssignMembersDialog
          role={assigning}
          employees={employees}
          currentMemberIds={memberIdsByRole[assigning.id] ?? []}
          onClose={() => setAssigning(null)}
        />
      )}
    </div>
  )
}

function MembersCard({
  role,
  members,
  onAssign,
}: {
  role: WorkforceRole
  members: Employee[]
  onAssign?: () => void
}) {
  // Up to 6 chip-style avatars in a wrapping row, then "+N more" if the
  // role is larger. Clicking "Manage" opens the assign dialog. Compact —
  // not its own scrolling list — because the People tab already owns
  // the deep view of who holds what.
  const SHOWN = 6
  const visible = members.slice(0, SHOWN)
  const overflow = Math.max(0, members.length - SHOWN)

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Members</h3>
            <p className="text-xs text-gray-500">
              {members.length === 0
                ? 'No-one holds this role yet.'
                : `${members.length} ${members.length === 1 ? 'person holds' : 'people hold'} the ${role.name} role.`}
            </p>
          </div>
        </div>
        {onAssign && (
          <button
            type="button"
            onClick={onAssign}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            {members.length === 0 ? 'Assign members' : 'Manage'}
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <button
          type="button"
          onClick={onAssign}
          disabled={!onAssign}
          className="mt-4 flex w-full items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/40 px-4 py-5 text-left transition-colors hover:border-[#C9A0DC] hover:bg-[#F7EAFB]/40 disabled:cursor-default disabled:hover:border-gray-200 disabled:hover:bg-gray-50/40"
        >
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-gray-400">
            <UserPlus className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-800">Add the first member</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Pick people from the directory who should pick up this role’s permissions.
            </p>
          </div>
        </button>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {visible.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-2 rounded-full border border-gray-100 bg-gray-50/60 py-1 pl-1 pr-3"
              title={`${m.jobTitle} · ${m.department} · ${m.employeeCode}`}
            >
              <Avatar name={m.name} color={m.avatarColor} src={m.avatarUrl} size="sm" />
              <span className="text-xs font-semibold text-gray-800">{m.name}</span>
            </span>
          ))}
          {overflow > 0 && (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
              +{overflow} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function PermissionMatrix({
  groups,
  role,
}: {
  groups: [PermissionGroup, Permission[]][]
  role: WorkforceRole
}) {
  // Collapsible categories. Each opens on click; "Expand all" toggles
  // the whole matrix. Default-collapsed so the viewport isn't dominated
  // by a wall of permission descriptions — Owners with 14/14 permissions
  // were producing ~700px of vertical scroll before this redesign.
  const granted = new Set(role.permissionKeys)
  const total = groups.reduce((s, [, items]) => s + items.length, 0)
  const [openGroups, setOpenGroups] = useState<Set<PermissionGroup>>(new Set())

  function toggleGroup(name: PermissionGroup) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const allOpen = openGroups.size === groups.length
  function toggleAll() {
    setOpenGroups(allOpen ? new Set() : new Set(groups.map(([g]) => g)))
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Permission matrix</h3>
            <p className="text-xs text-gray-500">
              {granted.size} of {total} granted across {groups.length} categories
              {role.isSystem && ' · system roles are read-only'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleAll}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <ul className="divide-y divide-gray-100">
        {groups.map(([groupName, items]) => {
          const groupGranted = items.filter((p) => granted.has(p.key)).length
          const coverage: GroupCoverage =
            groupGranted === 0
              ? 'none'
              : groupGranted === items.length
                ? 'full'
                : 'partial'
          const open = openGroups.has(groupName)
          return (
            <li key={groupName}>
              <button
                type="button"
                onClick={() => toggleGroup(groupName)}
                aria-expanded={open}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors',
                  open ? 'bg-gray-50/60' : 'hover:bg-gray-50/60',
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <CoverageBadge coverage={coverage} />
                  <span className="text-sm font-semibold text-gray-900">
                    {groupName}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                      coverage === 'full'
                        ? 'bg-emerald-50 text-emerald-700'
                        : coverage === 'none'
                          ? 'bg-gray-100 text-gray-500'
                          : 'bg-amber-50 text-amber-700',
                    )}
                  >
                    {groupGranted} / {items.length}
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-gray-400 transition-transform',
                    open && 'rotate-180',
                  )}
                />
              </button>
              {open && (
                <div className="border-t border-gray-100 bg-gray-50/30 px-5 py-4">
                  <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {items.map((p) => {
                      const allowed = granted.has(p.key)
                      return (
                        <li
                          key={p.key}
                          className={cn(
                            'flex items-start justify-between gap-3 rounded-xl border bg-white px-3 py-3',
                            allowed ? 'border-emerald-100' : 'border-gray-100',
                          )}
                        >
                          <div className="min-w-0">
                            <p
                              className={cn(
                                'text-sm font-semibold',
                                allowed ? 'text-gray-900' : 'text-gray-500',
                              )}
                            >
                              {p.label}
                            </p>
                            <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                              {p.description}
                            </p>
                            <p className="mt-1.5 font-mono text-[11px] tracking-tight text-gray-500">
                              {p.key}
                            </p>
                          </div>
                          <span
                            className={cn(
                              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                              allowed
                                ? 'bg-emerald-500 text-white'
                                : 'border border-gray-200 text-gray-300',
                            )}
                            aria-label={allowed ? 'Granted' : 'Not granted'}
                          >
                            {allowed && <Check className="h-3.5 w-3.5" />}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function CoverageBadge({ coverage }: { coverage: GroupCoverage }) {
  if (coverage === 'full') {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"
        aria-label="All permissions granted"
      >
        <Check className="h-3 w-3" />
      </span>
    )
  }
  if (coverage === 'partial') {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700"
        aria-label="Some permissions granted"
      >
        <Minus className="h-3 w-3" />
      </span>
    )
  }
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 text-gray-300"
      aria-label="No permissions granted"
    >
      <Minus className="h-3 w-3" />
    </span>
  )
}

// ---------------------------------------------------------------------------
// Role rail — left column listing all roles with at-a-glance coverage
// ---------------------------------------------------------------------------

function RoleRail({
  roles,
  selectedId,
  memberCounts,
  groups,
  onSelect,
  onNewRole,
}: {
  roles: WorkforceRole[]
  selectedId: string
  memberCounts: Map<string, Set<string>>
  groups: [PermissionGroup, Permission[]][]
  onSelect: (id: string) => void
  onNewRole?: () => void
}) {
  const [filter, setFilter] = useState<'all' | 'system' | 'custom'>('all')
  const filtered = useMemo(() => {
    if (filter === 'all') return roles
    return roles.filter((r) =>
      filter === 'system' ? r.isSystem : !r.isSystem,
    )
  }, [roles, filter])

  return (
    <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
      <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between gap-2 px-1 pb-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            All roles
          </h3>
          {onNewRole && (
            <button
              type="button"
              onClick={onNewRole}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Plus className="h-3 w-3" />
              New role
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-gray-50 p-0.5 text-[11px] font-semibold">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            All <span className="text-gray-400">· {roles.length}</span>
          </FilterChip>
          <FilterChip
            active={filter === 'system'}
            onClick={() => setFilter('system')}
          >
            System
            <span className="text-gray-400">
              {' '}
              · {roles.filter((r) => r.isSystem).length}
            </span>
          </FilterChip>
          <FilterChip
            active={filter === 'custom'}
            onClick={() => setFilter('custom')}
          >
            Custom
            <span className="text-gray-400">
              {' '}
              · {roles.filter((r) => !r.isSystem).length}
            </span>
          </FilterChip>
        </div>

        <ul className="mt-2 space-y-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-gray-400">
              No roles match this filter.
            </li>
          ) : (
            filtered.map((r) => (
              <RoleListCard
                key={r.id}
                role={r}
                active={r.id === selectedId}
                memberCount={memberCounts.get(r.id)?.size ?? 0}
                groups={groups}
                onSelect={() => onSelect(r.id)}
              />
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-md px-2 py-1 transition-colors',
        active
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-500 hover:text-gray-700',
      )}
    >
      {children}
    </button>
  )
}

function RoleListCard({
  role,
  active,
  memberCount,
  groups,
  onSelect,
}: {
  role: WorkforceRole
  active: boolean
  memberCount: number
  groups: [PermissionGroup, Permission[]][]
  onSelect: () => void
}) {
  const Icon = getRoleIcon(role)
  const coverage = useMemo(
    () => computeGroupCoverage(groups, role.permissionKeys),
    [groups, role.permissionKeys],
  )
  const totalPerms = groups.reduce((s, [, items]) => s + items.length, 0)
  const grantedPerms = role.permissionKeys.length

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={cn(
          'group block w-full rounded-xl border border-transparent p-3 text-left transition-all',
          active
            ? 'bg-gradient-to-br from-[#F7EAFB] to-white'
            : 'bg-white hover:bg-gray-50',
        )}
      >
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
              active
                ? 'bg-[#7E5896] text-white'
                : 'bg-gray-100 text-gray-700',
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p
                className={cn(
                  'truncate text-sm font-semibold',
                  active ? 'text-[#5B2D8E]' : 'text-gray-900',
                )}
              >
                {role.name}
              </p>
              {role.isSystem ? (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400"
                  title="System role — locked to edits, duplicate to customise"
                >
                  <Lock className="h-2.5 w-2.5" />
                </span>
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#7E5896]">
                  Custom
                </span>
              )}
            </div>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-gray-500">
              {role.description}
            </p>
          </div>
        </div>

        {/* Permission group coverage row — one dot per category, colour-
            coded by how much of that category this role has. Lets you
            compare roles at a glance: "Admin has it all, Finance is just
            the finance dots, Viewer is light blue everywhere." */}
        <div className="mt-2.5 flex items-center justify-between gap-2 pl-10">
          <div className="flex items-center gap-1" title="Permission coverage by category">
            {groups.map(([name]) => {
              const c = coverage.get(name) ?? 'none'
              return (
                <span
                  key={name}
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    c === 'full'
                      ? 'bg-emerald-500'
                      : c === 'partial'
                        ? 'bg-amber-400'
                        : 'bg-gray-200',
                  )}
                  aria-label={`${name}: ${c}`}
                />
              )
            })}
            <span className="ml-1.5 text-[10px] font-semibold tabular-nums text-gray-400">
              {grantedPerms}/{totalPerms}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold tabular-nums text-gray-500">
            <Users className="h-3 w-3 text-gray-400" />
            {memberCount}
          </span>
        </div>
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Role hero card — large header at the top of the detail panel
// ---------------------------------------------------------------------------

function RoleHeroCard({
  role,
  groups,
  memberCount,
  duplicating,
  onDelete,
  onDuplicate,
  onAssign,
  onEdit,
}: {
  role: WorkforceRole
  groups: [PermissionGroup, Permission[]][]
  memberCount: number
  duplicating: boolean
  onDelete?: () => void
  onDuplicate?: () => void
  onAssign?: () => void
  onEdit?: () => void
}) {
  const Icon = getRoleIcon(role)
  const totalPerms = groups.reduce((s, [, items]) => s + items.length, 0)
  const grantedPerms = role.permissionKeys.length
  const coveragePct = totalPerms > 0 ? Math.round((grantedPerms / totalPerms) * 100) : 0
  const coverage = useMemo(
    () => computeGroupCoverage(groups, role.permissionKeys),
    [groups, role.permissionKeys],
  )

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="bg-gradient-to-br from-[#F7EAFB]/60 via-white to-white px-6 pb-5 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#7E5896] text-white shadow-sm">
              <Icon className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
                  {role.name}
                </h2>
                {role.isSystem ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    <Lock className="h-2.5 w-2.5" />
                    System
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#F0DFF6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#5B2D8E]">
                    <Sparkles className="h-2.5 w-2.5" />
                    Custom
                  </span>
                )}
              </div>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-gray-600">
                {role.description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!role.isSystem && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}
            {onDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              disabled={duplicating}
              title="Clone this role into a new custom role you can edit"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Copy className="h-4 w-4" />
              {duplicating ? 'Duplicating…' : 'Duplicate'}
            </button>
            )}
            {onAssign && (
              <button
                type="button"
                onClick={onAssign}
                title="Add or remove extra members on top of their primary role"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Users className="h-4 w-4" />
                Assign members
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                disabled={role.isSystem}
                title={
                  role.isSystem
                    ? 'System roles are locked. Use "Duplicate" to make a custom version.'
                    : 'Edit which permissions this role grants'
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Pencil className="h-4 w-4" />
                Edit permissions
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats strip — replaces the old "X of Y granted" text line with a
          progress bar + per-category dots + member count so a glance tells
          you what this role covers without scrolling to the matrix. */}
      <div className="grid grid-cols-1 gap-4 border-t border-gray-100 bg-white px-6 py-4 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Permissions
            </p>
            <p className="text-xs font-semibold text-gray-700">
              {grantedPerms} of {totalPerms}{' '}
              <span className="text-gray-400">· {coveragePct}%</span>
            </p>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full bg-gradient-to-r from-[#7E5896] to-[#C9A0DC]"
              style={{ width: `${coveragePct}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {groups.map(([name]) => {
              const c = coverage.get(name) ?? 'none'
              return (
                <span
                  key={name}
                  title={`${name}: ${c === 'full' ? 'all granted' : c === 'partial' ? 'partial' : 'none'}`}
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    c === 'full'
                      ? 'bg-emerald-50 text-emerald-700'
                      : c === 'partial'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-gray-100 text-gray-500',
                  )}
                >
                  {name}
                </span>
              )
            })}
          </div>
        </div>

        <div className="border-gray-100 sm:border-l sm:pl-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Members
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">
            {memberCount}
          </p>
          <p className="text-xs text-gray-500">
            {memberCount === 1 ? 'person holds this role' : 'people hold this role'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Role form — handles create + edit permissions
// ---------------------------------------------------------------------------

type RoleFormProps =
  | { mode: 'create'; groups: [PermissionGroup, Permission[]][]; onClose: () => void; role?: never }
  | { mode: 'edit'; groups: [PermissionGroup, Permission[]][]; onClose: () => void; role: WorkforceRole }

function RoleFormDialog(props: RoleFormProps) {
  const isEdit = props.mode === 'edit'
  const { groups, onClose } = props
  const [name, setName] = useState(isEdit ? props.role.name : '')
  const [description, setDescription] = useState(isEdit ? props.role.description : '')
  const [granted, setGranted] = useState<Set<string>>(
    () => new Set(isEdit ? props.role.permissionKeys : []),
  )
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggle(key: string) {
    setGranted((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleGroup(items: Permission[]) {
    setGranted((prev) => {
      const next = new Set(prev)
      const allOn = items.every((i) => next.has(i.key))
      if (allOn) {
        for (const i of items) next.delete(i.key)
      } else {
        for (const i of items) next.add(i.key)
      }
      return next
    })
  }

  function submit() {
    setError(null)
    const keys = Array.from(granted)
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateRolePermissions(props.role.id, keys)
        } else {
          await createRole({
            name,
            description: description || undefined,
            permissionKeys: keys,
          })
        }
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save role.')
      }
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isEdit ? `Edit ${props.role.name} permissions` : 'New role'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {granted.size} of {groups.reduce((s, [, items]) => s + items.length, 0)} permissions selected.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          {!isEdit && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Description</span>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="When should someone get this role?"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
                />
              </label>
            </div>
          )}

          <div className="space-y-4">
            {groups.map(([groupName, items]) => {
              const allGranted = items.every((p) => granted.has(p.key))
              return (
                <div key={groupName} className="rounded-2xl border border-gray-100 bg-gray-50/30 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">{groupName}</h3>
                    <button
                      type="button"
                      onClick={() => toggleGroup(items)}
                      className="text-xs font-semibold text-[#7E5896] hover:underline"
                    >
                      {allGranted ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {items.map((p) => {
                      const allowed = granted.has(p.key)
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => toggle(p.key)}
                          className={cn(
                            'flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                            allowed
                              ? 'border-emerald-200 bg-emerald-50/70 hover:bg-emerald-50'
                              : 'border-gray-200 bg-white hover:bg-gray-50',
                          )}
                        >
                          <div>
                            <p className={cn('text-sm font-semibold', allowed ? 'text-emerald-800' : 'text-gray-900')}>{p.label}</p>
                            <p className="mt-0.5 text-xs text-gray-500">{p.description}</p>
                          </div>
                          <div
                            className={cn(
                              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                              allowed ? 'bg-emerald-500 text-white' : 'border border-gray-300 text-gray-300',
                            )}
                          >
                            {allowed && <Check className="h-3.5 w-3.5" />}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {error && (
          <div className="border-t border-gray-100 px-6 pt-3 text-sm font-medium text-rose-700">{error}</div>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || (!isEdit && !name) || granted.size === 0}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? 'Saving…' : isEdit ? 'Save permissions' : 'Create role'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteRoleDialog({
  role,
  onClose,
}: {
  role: WorkforceRole
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function confirm() {
    setError(null)
    startTransition(async () => {
      try {
        await deleteRole(role.id)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not delete the role.')
      }
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-700">
            <Trash2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Delete {role.name}?</h2>
            <p className="mt-1 text-sm text-gray-500">
              Any members currently assigned to this role will keep their existing permissions until you reassign them. This action can&apos;t be undone.
            </p>
          </div>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-rose-700">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {pending ? 'Deleting…' : 'Delete role'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AssignMembersDialog({
  role,
  employees,
  currentMemberIds,
  onClose,
}: {
  role: WorkforceRole
  employees: Employee[]
  currentMemberIds: string[]
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(currentMemberIds))
  const [search, setSearch] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const active = employees.filter((e) => e.status !== 'Resigned')
    if (!q) return active
    return active.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.jobTitle.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q),
    )
  }, [employees, search])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        await setRoleMembers(role.id, Array.from(selected))
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update members.')
      }
    })
  }

  const initialCount = currentMemberIds.length
  const nextCount = selected.size
  const delta = nextCount - initialCount

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Assign members · {role.name}</h2>
            <p className="mt-1 text-sm text-gray-500">
              Tick everyone who should hold this role. Changes save when you click Update.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-gray-100 px-6 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search by name, role, email, department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-gray-500">
              No-one matches the search.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((e) => {
                const checked = selected.has(e.id)
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => toggle(e.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                    >
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                          checked
                            ? 'border-[#7E5896] bg-[#7E5896] text-white'
                            : 'border-gray-300 bg-white text-transparent',
                        )}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <Avatar name={e.name} color={e.avatarColor} src={e.avatarUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{e.name}</p>
                        <p className="truncate text-xs text-gray-500">{e.jobTitle} · {e.department}</p>
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                        {e.employeeCode}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {error && (
          <div className="border-t border-gray-100 px-6 pt-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-6 py-4">
          <span className="text-xs font-medium text-gray-500">
            {nextCount} selected
            {delta !== 0 && (
              <>
                {' '}
                <span className={delta > 0 ? 'text-emerald-700' : 'text-rose-700'}>
                  ({delta > 0 ? '+' : ''}
                  {delta})
                </span>
              </>
            )}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending || delta === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Update members'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TabButton({
  current,
  value,
  onSelect,
  count,
  children,
}: {
  current: Tab
  value: Tab
  onSelect: (v: Tab) => void
  count: number
  children: React.ReactNode
}) {
  const active = current === value
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
        active ? 'bg-[#F0DFF6] text-[#5B2D8E]' : 'text-gray-500 hover:bg-gray-50',
      )}
    >
      {children}
      <span
        className={cn(
          'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
          active ? 'bg-[#7E5896] text-white' : 'bg-gray-100 text-gray-500',
        )}
      >
        {count}
      </span>
    </button>
  )
}
