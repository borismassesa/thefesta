'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  AlertTriangle,
  Mail,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Avatar from '../_components/Avatar'
import StatusPill from '../_components/StatusPill'
import type { EmployeeDirectoryView, WorkforceRole } from '../_lib/types'
import {
  grantDashboardAccess,
  revokeDashboardAccess,
  setDashboardRole,
} from '../employees/actions'
import { isCurrentEmployee } from '../_lib/types'

// One row in the People table — an employee who currently has dashboard
// access OR a candidate the admin wants to grant access to via the dialog.
type MemberRow = {
  employee: EmployeeDirectoryView
  roleId: string | null
  roleName: string
  roleSlug: string | null
}

// 5 columns: Member · Workforce link · Role · Last sign-in · Actions. No
// "Status" column — every row in this table has dashboard_access=true, so
// the column would have always read "Active" and only ever told users
// what they already knew.
const ROW_GRID =
  'grid min-w-[860px] grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_180px_140px_72px] items-center gap-3'

function formatRelativeDay(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.round(days / 30)}mo ago`
  return `${Math.round(days / 365)}y ago`
}

export default function AdminTeamSection({
  employees,
  roles,
  callerEmail,
  canManageAccess,
}: {
  employees: EmployeeDirectoryView[]
  roles: WorkforceRole[]
  callerEmail: string | null
  canManageAccess: boolean
}) {
  const [search, setSearch] = useState('')
  const [granting, setGranting] = useState(false)
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    row: MemberRow
    nextRole: WorkforceRole
  } | null>(null)
  const [pendingRevoke, setPendingRevoke] = useState<MemberRow | null>(null)

  const rolesById = useMemo(
    () => new Map(roles.map((r) => [r.id, r] as const)),
    [roles],
  )

  // Members = employees with dashboard_access=true, joined to their role.
  // A row without a role_id shouldn't happen (DB constraint enforces it)
  // but we render "—" defensively so a transient mid-update state doesn't
  // crash the page.
  const members: MemberRow[] = useMemo(() => {
    return employees
      .filter((e) => e.dashboardAccess)
      .map((e) => {
        const role = e.dashboardRoleId ? rolesById.get(e.dashboardRoleId) ?? null : null
        return {
          employee: e,
          roleId: role?.id ?? null,
          roleName: role?.name ?? '—',
          roleSlug: role?.slug ?? null,
        }
      })
      .sort((a, b) => {
        // Owners first, then alphabetical by name.
        const ownerScore = (m: MemberRow) => (m.roleSlug === 'owner' ? 0 : 1)
        const so = ownerScore(a) - ownerScore(b)
        if (so !== 0) return so
        return a.employee.name.localeCompare(b.employee.name)
      })
  }, [employees, rolesById])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter(
      (m) =>
        m.employee.name.toLowerCase().includes(q) ||
        m.employee.email.toLowerCase().includes(q) ||
        m.employee.department.toLowerCase().includes(q) ||
        m.roleName.toLowerCase().includes(q),
    )
  }, [members, search])

  const ownerCount = members.filter((m) => m.roleSlug === 'owner').length

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-gray-900">
              People with dashboard access
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {members.length}{' '}
              {members.length === 1 ? 'person signs in' : 'people sign in'} to this
              admin app · {ownerCount} {ownerCount === 1 ? 'owner' : 'owners'}
              {!canManageAccess && ' · only owners can change this list'}
            </p>
          </div>
        </div>
        {canManageAccess && (
          <button data-opus-button="control"
            type="button"
            onClick={() => setGranting(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <UserPlus className="h-4 w-4" />
            Grant access
          </button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search by name, email, department or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
          />
        </div>
        <span className="text-xs text-gray-500 tabular-nums">
          {visible.length === members.length
            ? `${members.length} ${members.length === 1 ? 'member' : 'members'}`
            : `${visible.length} of ${members.length}`}
        </span>
      </div>

      <div className="overflow-x-auto no-scrollbar rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div data-opus-table-header
          role="row"
          className={cn(
            ROW_GRID,
            'border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500',
          )}
        >
          <span>Member</span>
          <span>Linked employee</span>
          <span>Dashboard role</span>
          <span className="text-right">Last sign-in</span>
          <span className="text-right">Actions</span>
        </div>

        {visible.length === 0 ? (
          <EmptyState hasQuery={Boolean(search)} />
        ) : (
          visible.map((m) => (
            <MemberRowView
              key={m.employee.id}
              row={m}
              roles={roles}
              callerEmail={callerEmail}
              canManageAccess={canManageAccess}
              ownerCount={ownerCount}
              onRequestRoleChange={(nextRole) =>
                setPendingRoleChange({ row: m, nextRole })
              }
              onRequestRevoke={() => setPendingRevoke(m)}
            />
          ))
        )}
      </div>

      {granting && canManageAccess && (
        <GrantAccessDialog
          employees={employees}
          roles={roles}
          onClose={() => setGranting(false)}
        />
      )}

      {pendingRoleChange && (
        <ConfirmRoleChangeDialog
          row={pendingRoleChange.row}
          nextRole={pendingRoleChange.nextRole}
          onClose={() => setPendingRoleChange(null)}
        />
      )}

      {pendingRevoke && (
        <ConfirmRevokeDialog
          row={pendingRevoke}
          onClose={() => setPendingRevoke(null)}
        />
      )}
    </section>
  )
}

function MemberRowView({
  row,
  roles,
  callerEmail,
  canManageAccess,
  ownerCount,
  onRequestRoleChange,
  onRequestRevoke,
}: {
  row: MemberRow
  roles: WorkforceRole[]
  callerEmail: string | null
  canManageAccess: boolean
  ownerCount: number
  onRequestRoleChange: (nextRole: WorkforceRole) => void
  onRequestRevoke: () => void
}) {
  const isSelf = callerEmail?.toLowerCase() === row.employee.email.toLowerCase()
  const isLastOwner = row.roleSlug === 'owner' && ownerCount <= 1

  // Only platform.admin holders manage access. Server enforces last-owner /
  // self-revoke invariants; UI mirrors them so disabled controls explain why
  // via the title attribute (still keyboard-accessible).
  const canChangeRole = canManageAccess && !isLastOwner
  const canRevoke = canManageAccess && !isSelf && !isLastOwner
  const revokeDisabledReason = !canManageAccess
    ? 'Only owners can revoke dashboard access'
    : isSelf
      ? 'You can’t revoke your own access — ask another owner'
      : isLastOwner
        ? 'Promote another teammate to Owner first — the team must keep at least one'
        : ''

  const lastLogin = formatRelativeDay(row.employee.lastDashboardLogin)

  return (
    <div data-opus-table-row
      role="row"
      className={cn(
        ROW_GRID,
        'border-b border-gray-100 px-5 py-3.5 last:border-b-0',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar
          name={row.employee.name}
          color={row.employee.avatarColor}
          src={row.employee.avatarUrl}
          size="sm"
        />
        <div className="min-w-0">
          {/* line-clamp-2 instead of truncate so long Tanzanian names wrap
              to a second line rather than getting cut to "Boris Maxmilli…". */}
          <p className="line-clamp-2 text-sm font-semibold text-gray-950">
            {row.employee.name}
            {isSelf && (
              <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-[#7E5896]">
                You
              </span>
            )}
          </p>
          <p className="truncate text-xs text-gray-500">{row.employee.email}</p>
        </div>
      </div>

      <div className="min-w-0 text-xs">
        <p className="truncate font-medium text-gray-700">
          {row.employee.jobTitle || (
            <span className="italic text-gray-400">No title yet</span>
          )}
        </p>
        <p className="truncate text-gray-500">
          {row.employee.department} ·{' '}
          <span className="font-mono">{row.employee.employeeCode}</span>
        </p>
      </div>

      <div>
        {canChangeRole ? (
          <select
            value={row.roleId ?? ''}
            onChange={(e) => {
              const nextId = e.target.value
              if (!nextId || nextId === row.roleId) return
              const nextRole = roles.find((r) => r.id === nextId)
              if (!nextRole) return
              onRequestRoleChange(nextRole)
              // Snap the visible select back to the current value until
              // the confirm modal lands a real change — otherwise an
              // accidental keyboard move looks "applied".
              e.currentTarget.value = row.roleId ?? ''
            }}
            className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        ) : (
          <span
            title={isLastOwner ? 'Last owner — role can’t be changed' : ''}
            className="inline-flex items-center rounded-full bg-[#F0DFF6] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#5B2D8E]"
          >
            {row.roleName}
          </span>
        )}
      </div>

      <div className="text-right text-xs text-gray-500">
        {lastLogin ?? <span className="text-gray-400">never</span>}
      </div>

      <div className="flex items-center justify-end gap-1">
        <button data-opus-button="control"
          type="button"
          onClick={canRevoke ? onRequestRevoke : undefined}
          disabled={!canRevoke}
          aria-disabled={!canRevoke}
          aria-label={`Revoke access for ${row.employee.email}`}
          title={canRevoke ? 'Revoke dashboard access' : revokeDisabledReason}
          className={cn(
            'rounded-md p-1.5',
            canRevoke
              ? 'text-gray-400 hover:bg-rose-50 hover:text-rose-700'
              : 'cursor-not-allowed text-gray-300',
          )}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confirm dialogs
// ---------------------------------------------------------------------------

function ConfirmRoleChangeDialog({
  row,
  nextRole,
  onClose,
}: {
  row: MemberRow
  nextRole: WorkforceRole
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  useEscapeToClose(onClose)

  function confirm() {
    setError(null)
    startTransition(async () => {
      try {
        await setDashboardRole(row.employee.id, nextRole.id)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not change role.')
      }
    })
  }

  const isDemotingOwner = row.roleSlug === 'owner' && nextRole.slug !== 'owner'

  return (
    <DialogShell onClose={onClose} ariaLabelledBy="confirm-role-change">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            isDemotingOwner
              ? 'bg-amber-50 text-amber-700'
              : 'bg-gray-100 text-gray-700',
          )}
        >
          {isDemotingOwner ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <ShieldCheck className="h-5 w-5" />
          )}
        </span>
        <div>
          <h2 id="confirm-role-change" className="text-lg font-semibold text-gray-900">
            Change {row.employee.name}’s role?
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            From <span className="font-semibold text-gray-700">{row.roleName}</span>{' '}
            to <span className="font-semibold text-gray-700">{nextRole.name}</span>.
            Their permissions update on their next request.
            {isDemotingOwner && (
              <>
                {' '}
                <span className="text-amber-700">
                  They’ll lose owner-only abilities (platform settings, payroll release).
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-rose-700">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button data-opus-button="control"
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button data-opus-button="control"
          type="button"
          onClick={confirm}
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : `Change to ${nextRole.name}`}
        </button>
      </div>
    </DialogShell>
  )
}

function ConfirmRevokeDialog({
  row,
  onClose,
}: {
  row: MemberRow
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  useEscapeToClose(onClose)

  function confirm() {
    setError(null)
    startTransition(async () => {
      try {
        await revokeDashboardAccess(row.employee.id)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not revoke access.')
      }
    })
  }

  return (
    <DialogShell onClose={onClose} ariaLabelledBy="confirm-revoke">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-700">
          <Trash2 className="h-5 w-5" />
        </span>
        <div>
          <h2 id="confirm-revoke" className="text-lg font-semibold text-gray-900">
            Revoke access for {row.employee.name}?
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            They’ll be signed out on their next request and won’t be able to sign in
            again until you re-invite them. Their employee record stays — only the
            dashboard sign-in is removed.
          </p>
        </div>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-rose-700">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button data-opus-button="control"
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button data-opus-button="danger" data-opus-button-size="medium"
          type="button"
          onClick={confirm}
          disabled={pending}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {pending ? 'Revoking…' : 'Revoke access'}
        </button>
      </div>
    </DialogShell>
  )
}

// ---------------------------------------------------------------------------
// Grant-access dialog — pick an employee that doesn't yet have access + role
// ---------------------------------------------------------------------------

function GrantAccessDialog({
  employees,
  roles,
  onClose,
}: {
  employees: EmployeeDirectoryView[]
  roles: WorkforceRole[]
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const defaultRoleId = roles.find((r) => r.slug === 'admin')?.id ?? roles[0]?.id ?? ''
  const [roleId, setRoleId] = useState(defaultRoleId)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  useEscapeToClose(onClose)

  // Candidates = active employees that don't yet have dashboard access.
  // Resigned folks are excluded — granting them sign-in is almost
  // certainly a mistake.
  const candidates = useMemo(() => {
    const list = employees.filter(
      (e) => !e.dashboardAccess && isCurrentEmployee(e.status),
    )
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.jobTitle.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q),
    )
  }, [employees, search])

  function submit() {
    if (!selectedEmployeeId || !roleId) return
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      try {
        const result = await grantDashboardAccess(selectedEmployeeId, roleId)
        const employee = employees.find((e) => e.id === selectedEmployeeId)
        setSuccess(
          result.emailSent
            ? `Invitation sent to ${employee?.email}.`
            : `Invitation created — email send failed (${result.emailReason ?? 'unknown'}). Resend from the Pending invitations list.`,
        )
        // Reset selection so the admin can grant access to another person
        // without reopening the dialog.
        setSelectedEmployeeId(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not grant access.')
      }
    })
  }

  return (
    <DialogShell onClose={onClose} ariaLabelledBy="grant-access" wide>
      <div className="flex items-start justify-between">
        <div>
          <h2 id="grant-access" className="text-lg font-semibold text-gray-900">
            Grant dashboard access
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Pick an employee and the role they should hold. We’ll send them an
            invitation email; access only turns on after they accept.
          </p>
        </div>
        <button data-opus-button="control"
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search employees without access…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
          />
        </div>

        <div className="mt-3 max-h-[320px] overflow-y-auto rounded-xl border border-gray-100">
          {candidates.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">
              {search
                ? 'No employees match the search.'
                : 'Every active employee already has dashboard access.'}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {candidates.map((e) => {
                const active = e.id === selectedEmployeeId
                return (
                  <li key={e.id}>
                    <button data-opus-button="secondary" data-opus-button-size="medium"
                      type="button"
                      onClick={() => setSelectedEmployeeId(e.id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        active ? 'bg-[#F0DFF6]' : 'hover:bg-gray-50',
                      )}
                    >
                      <Avatar name={e.name} color={e.avatarColor} src={e.avatarUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'truncate text-sm font-semibold',
                            active ? 'text-[#5B2D8E]' : 'text-gray-900',
                          )}
                        >
                          {e.name}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {e.email} · {e.jobTitle} · {e.department}
                        </p>
                      </div>
                      <StatusPill tone="gray" label={e.employeeCode} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="mt-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Dashboard role
            </span>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
            >
              {roles
                .filter((r) => r.slug !== 'author')
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
            <span className="mt-1 block text-[11px] text-gray-400">
              Author is excluded — Authors live under /contribute and don’t need
              dashboard access.
            </span>
          </label>
        </div>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-rose-700">{error}</p>}
      {success && (
        <p className="mt-3 text-sm font-medium text-emerald-700">{success}</p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button data-opus-button="control"
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {success ? 'Done' : 'Cancel'}
        </button>
        <button data-opus-button="control"
          type="button"
          onClick={submit}
          disabled={pending || !selectedEmployeeId}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" />
          {pending ? 'Inviting…' : 'Send invitation'}
        </button>
      </div>
    </DialogShell>
  )
}

// ---------------------------------------------------------------------------
// Shared scaffolding
// ---------------------------------------------------------------------------

function DialogShell({
  children,
  onClose,
  ariaLabelledBy,
  wide,
}: {
  children: React.ReactNode
  onClose: () => void
  ariaLabelledBy: string
  wide?: boolean
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={cn(
          'w-full rounded-2xl bg-white p-6 shadow-xl',
          wide ? 'max-w-xl' : 'max-w-md',
        )}
      >
        {children}
      </div>
    </div>
  )
}

function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-700">
        <Mail className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-gray-900">
        {hasQuery ? 'No-one matches the search' : 'No-one has dashboard access yet'}
      </p>
      <p className="mt-1 text-sm text-gray-500">
        {hasQuery
          ? 'Try a different name, email or role.'
          : 'Use “Grant access” to invite the first teammate.'}
      </p>
    </div>
  )
}
