'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Clock,
  MailCheck,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import StatusPill from '../_components/StatusPill'
import type { WorkforceInvitationListRow } from '../_lib/queries'
import {
  resendWorkforceInvitationAction,
  revokeWorkforceInvitationAction,
} from './actions'

const ROW_GRID =
  'grid min-w-[820px] grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_140px_140px_140px_72px] items-center gap-3'

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function isExpiringSoon(iso: string): boolean {
  const days = (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  return days < 3
}

export default function PendingInvitationsSection({
  invitations,
  canManageAccess,
}: {
  invitations: WorkforceInvitationListRow[]
  canManageAccess: boolean
}) {
  // We only show pending invitations (the most actionable subset). Past
  // invites are queryable from the audit log; surfacing them here would
  // dilute the "needs attention" framing.
  const pending = invitations.filter((i) => i.status === 'pending')

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
            <MailCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-gray-900">Pending invitations</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {pending.length === 0
                ? 'No invitations waiting on a response. Add a new employee to invite the next teammate.'
                : `${pending.length} ${pending.length === 1 ? 'person hasn’t' : 'people haven’t'} accepted their invite yet.`}
              {!canManageAccess && ' · only owners can manage invitations'}
            </p>
          </div>
        </div>
        <Link
          href="/workforce/employees"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <UserPlus className="h-4 w-4" />
          Invite via Employees
        </Link>
      </header>

      <div className="overflow-x-auto no-scrollbar rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div data-opus-table-header
          role="row"
          className={cn(
            ROW_GRID,
            'border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500',
          )}
        >
          <span>Invitee</span>
          <span>Role</span>
          <span>Sent</span>
          <span>Expires</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        {pending.length === 0 ? (
          <EmptyRow />
        ) : (
          pending.map((row) => (
            <InvitationRow key={row.id} row={row} canManageAccess={canManageAccess} />
          ))
        )}
      </div>
    </section>
  )
}

function InvitationRow({
  row,
  canManageAccess,
}: {
  row: WorkforceInvitationListRow
  canManageAccess: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const expiringSoon = isExpiringSoon(row.expiresAt)

  function resend() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      try {
        const result = await resendWorkforceInvitationAction(row.employeeId, row.roleId)
        if (result.emailSent) {
          setNotice('Invitation resent.')
        } else if (result.emailReason === 'no_email_needed_existing_user') {
          // Not a failure — the person already has a Clerk account, so
          // we granted access directly instead of sending an invitation
          // they'd never need to act on. The row will drop off the
          // pending list once the page revalidates.
          setNotice(`${row.email} already has a Clerk account — access granted directly, no email needed.`)
        } else {
          setError(`Invitation regenerated but the email did not send (${result.emailReason ?? 'unknown'}).`)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not resend invite.')
      }
    })
  }

  function revoke() {
    if (!window.confirm(`Revoke the invitation for ${row.email}?`)) return
    setError(null)
    setNotice(null)
    startTransition(async () => {
      try {
        await revokeWorkforceInvitationAction(row.id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not revoke invite.')
      }
    })
  }

  return (
    <div data-opus-table-row
      role="row"
      className={cn(
        ROW_GRID,
        'border-b border-gray-100 px-5 py-3.5 last:border-b-0',
        pending && 'pointer-events-none opacity-70',
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-950">{row.employeeName}</p>
        <p className="truncate text-xs text-gray-500">
          {row.email} · <span className="font-mono">{row.employeeCode}</span>
        </p>
        {(error || notice) && (
          <p
            className={cn(
              'mt-1 truncate text-xs font-medium',
              error ? 'text-rose-700' : 'text-emerald-700',
            )}
          >
            {error ?? notice}
          </p>
        )}
      </div>

      <div className="text-sm text-gray-700">{row.roleName}</div>

      <div className="text-xs text-gray-500">{formatDate(row.invitedAt)}</div>

      <div className="text-xs">
        <span className={cn(expiringSoon ? 'font-semibold text-amber-700' : 'text-gray-500')}>
          {formatDate(row.expiresAt)}
        </span>
        {expiringSoon && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] uppercase font-bold tracking-wider text-amber-700">
            <Clock className="h-3 w-3" />
            soon
          </span>
        )}
      </div>

      <div>
        <StatusPill tone="amber" label="Awaiting" />
      </div>

      <div className="flex items-center justify-end gap-1">
        {canManageAccess ? (
          <>
            <button data-opus-button="control"
              type="button"
              onClick={resend}
              disabled={pending}
              aria-label={`Resend invitation to ${row.email}`}
              title="Resend invitation"
              className="rounded-md p-1.5 text-gray-400 hover:bg-[#F0DFF6] hover:text-[#5B2D8E] disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button data-opus-button="control"
              type="button"
              onClick={revoke}
              disabled={pending}
              aria-label={`Revoke invitation for ${row.email}`}
              title="Revoke invitation"
              className="rounded-md p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        ) : (
          <span title="Only owners can manage invitations" className="text-gray-300">
            <ShieldAlert className="h-4 w-4" />
          </span>
        )}
      </div>
    </div>
  )
}

function EmptyRow() {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm font-semibold text-gray-900">No pending invitations</p>
      <p className="mt-1 text-xs text-gray-500">
        Invite a new teammate from the Employees page by ticking “Grant dashboard access.”
      </p>
    </div>
  )
}

