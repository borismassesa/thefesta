'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Ban, Check, HelpCircle, PhoneOff, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  IMPORT_STATUS_LABELS,
  statusBlocksImport,
  type GuestImportPreview,
  type GuestImportVerification,
  type ImportRowStatus,
} from '@/lib/dashboard/guest-import-review'
import { ticketTypeLabel } from '@/lib/dashboard/types'

/**
 * Import Review: what the file would do, before it does it.
 *
 * The rule this screen exists to enforce is that nothing is dropped without
 * being named. The importer it replaces returned counts, so a guest whose
 * number collided simply vanished from the list with no way to find out.
 */

/** Status is carried by an icon AND text, never colour alone. */
const STATUS_ICON: Record<ImportRowStatus, typeof Check> = {
  ready: Check,
  duplicate_phone: Ban,
  duplicate_name: Ban,
  needs_review: HelpCircle,
  possible_duplicate: AlertTriangle,
  missing_phone: PhoneOff,
  invalid_phone: PhoneOff,
  missing_name: User,
}

const STATUS_STYLE: Record<ImportRowStatus, string> = {
  ready: 'bg-[#9FE870]/20 text-[#1A1A1A] ring-[#9FE870]/60',
  duplicate_phone: 'bg-rose-50 text-rose-700 ring-rose-200',
  duplicate_name: 'bg-rose-50 text-rose-700 ring-rose-200',
  needs_review: 'bg-amber-50 text-amber-800 ring-amber-200',
  possible_duplicate: 'bg-amber-50/60 text-amber-800 ring-amber-200/70',
  missing_phone: 'bg-black/[0.04] text-[#1A1A1A]/70 ring-black/[0.08]',
  invalid_phone: 'bg-rose-50 text-rose-700 ring-rose-200',
  missing_name: 'bg-rose-50 text-rose-700 ring-rose-200',
}

export function ImportStatusBadge({ status }: { status: ImportRowStatus }) {
  const Icon = STATUS_ICON[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        STATUS_STYLE[status],
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {IMPORT_STATUS_LABELS[status]}
    </span>
  )
}

/**
 * The receipt shown after a commit: the file reconciled against the guest list
 * read back out of the database. This is the answer to "how do I know the
 * table matches my spreadsheet?" — it is checked against stored data, not
 * against what the importer believes it wrote.
 */
export function ImportVerification({ result }: { result: GuestImportVerification }) {
  const problems = result.rows.filter((r) => r.verdict !== 'matched')
  const clean = problems.length === 0

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'rounded-xl border px-3 py-2.5 text-xs leading-relaxed',
          clean ? 'border-[#9FE870]/60 bg-[#9FE870]/15 text-[#1A1A1A]' : 'border-amber-200 bg-amber-50 text-amber-900',
        )}
      >
        {clean ? (
          <>
            <b className="font-semibold">All {result.matched} rows check out.</b> Every guest in your file is on the
            list with the same name and number.
          </>
        ) : (
          <>
            <b className="font-semibold">
              {result.matched} of {result.rows.length} {result.rows.length === 1 ? 'row' : 'rows'}{' '}
              {result.matched === 1 ? 'matches' : 'match'} your file.
            </b>{' '}
            {result.differs > 0
              ? `${result.differs} ${result.differs === 1 ? 'is' : 'are'} stored differently. `
              : ''}
            {result.missing > 0
              ? `${result.missing} ${result.missing === 1 ? 'is' : 'are'} not on the list. `
              : ''}
            Each one is listed below with what the file said and what is stored.
          </>
        )}
      </div>

      {clean ? null : (
        <div className="overflow-hidden rounded-xl border border-black/[0.1]">
          <table className="opus-table w-full text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-[#1A1A1A]/50">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">In your file</th>
                <th scope="col" className="px-3 py-2 font-medium">On the guest list</th>
                <th scope="col" className="px-3 py-2 font-medium">What differs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.06]">
              {problems.map((r) => (
                <tr key={r.lineNumber}>
                  <td className="px-3 py-2 align-top">
                    <span className="block font-medium text-[#1A1A1A]">{r.fileName || '—'}</span>
                    <span className="text-xs text-[#1A1A1A]/50">
                      Row {r.lineNumber} · {r.filePhone ?? 'no number'}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {r.storedName ? (
                      <>
                        <span className="block text-[#1A1A1A]">{r.storedName}</span>
                        <span className="text-xs text-[#1A1A1A]/50">{r.storedPhone ?? 'no number'}</span>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700">
                        <Ban className="h-3.5 w-3.5" aria-hidden /> Not found
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-xs leading-relaxed text-[#1A1A1A]/70">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

type RowFilter = 'all' | 'blocked' | 'issues' | 'ready'

export function ImportReview({
  preview,
  approved,
  onToggle,
  onApproveAllHolds,
}: {
  preview: GuestImportPreview
  /** Line numbers currently selected for import. */
  approved: ReadonlySet<number>
  onToggle: (lineNumber: number) => void
  onApproveAllHolds: () => void
}) {
  const [filter, setFilter] = useState<RowFilter>('all')
  const { counts, rows } = preview

  const visible = useMemo(() => {
    switch (filter) {
      case 'blocked':
        return rows.filter((r) => statusBlocksImport(r.status))
      case 'issues':
        return rows.filter((r) => r.issues.length > 0)
      case 'ready':
        return rows.filter((r) => r.status === 'ready')
      default:
        // Problems first: on a 700-row file the admin must not have to scroll
        // for the four rows that need them.
        return [...rows].sort((a, b) => {
          const rank = (blocked: boolean, issues: number) => (blocked ? 0 : issues > 0 ? 1 : 2)
          return (
            rank(statusBlocksImport(a.status), a.issues.length) -
              rank(statusBlocksImport(b.status), b.issues.length) || a.lineNumber - b.lineNumber
          )
        })
    }
  }, [rows, filter])

  const approvedCount = rows.filter((r) => approved.has(r.lineNumber)).length
  const unresolved = rows.filter((r) => statusBlocksImport(r.status) && !approved.has(r.lineNumber)).length

  const summary: { key: RowFilter; label: string; value: number; tone?: 'bad' | 'warn' }[] = [
    { key: 'all', label: 'Rows in file', value: counts.total },
    { key: 'ready', label: 'Ready', value: counts.ready },
    { key: 'blocked', label: 'Need a decision', value: counts.blocked, tone: counts.blocked ? 'bad' : undefined },
    {
      key: 'issues',
      label: 'Missing phone',
      value: counts.missingPhone,
      tone: counts.missingPhone ? 'warn' : undefined,
    },
  ]

  return (
    <div className="space-y-4">
      {/* Data-quality summary. Each tile filters the rows below. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {summary.map((tile) => (
          <button data-opus-button="neutral" data-opus-button-size="medium"
            key={tile.key}
            type="button"
            onClick={() => setFilter(tile.key)}
            className={cn(
              'rounded-xl border px-3 py-2.5 text-left transition',
              filter === tile.key
                ? 'border-[#1A1A1A]/25 bg-black/[0.04]'
                : 'border-black/[0.08] bg-white hover:bg-black/[0.02]',
            )}
          >
            <span
              className={cn(
                'block text-lg font-semibold leading-tight',
                tile.tone === 'bad' && 'text-rose-600',
                tile.tone === 'warn' && 'text-amber-700',
                !tile.tone && 'text-[#1A1A1A]',
              )}
            >
              {tile.value}
            </span>
            <span className="mt-0.5 block text-xs text-[#1A1A1A]/60">{tile.label}</span>
          </button>
        ))}
      </div>

      {counts.conflictGroups > 0 ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-800">
          <b className="font-semibold">
            {counts.conflictGroups} phone {counts.conflictGroups === 1 ? 'number is' : 'numbers are'} claimed by more
            than one guest.
          </b>{' '}
          Each of those guests would get their own digital card and their own WhatsApp message, both sent to the same
          handset. Correct the number, or confirm the guests really do share it.
        </div>
      ) : null}

      {counts.missingPhone > 0 ? (
        <div className="rounded-xl border border-black/[0.08] bg-black/[0.02] px-3 py-2.5 text-xs leading-relaxed text-[#1A1A1A]/75">
          {counts.missingPhone} {counts.missingPhone === 1 ? 'guest has' : 'guests have'} no phone number. They will be
          added so they keep a seat and a place at a table, but they cannot receive a WhatsApp message, a digital card
          or an entrance pass until a number is added.
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[#1A1A1A]/60">
          {approvedCount} of {counts.total} selected to import
          {unresolved > 0 ? ` · ${unresolved} still unresolved` : ''}
        </p>
        {counts.needsReview > 0 ? (
          <button data-opus-button="primary" data-opus-button-size="small"
            type="button"
            onClick={onApproveAllHolds}
            className="rounded-lg px-2 py-1 text-xs font-medium text-[#1A1A1A]/70 underline-offset-2 hover:bg-black/[0.05] hover:underline"
          >
            {counts.needsReview === 1
              ? 'Approve the 1 row held for review'
              : `Approve all ${counts.needsReview} held for review`}
          </button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-black/[0.1]">
        <table className="opus-table w-full text-left text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-[#1A1A1A]/50">
            <tr>
              <th scope="col" className="w-10 px-3 py-2" />
              <th scope="col" className="px-3 py-2 font-medium">Guest</th>
              <th scope="col" className="px-3 py-2 font-medium">Phone</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 font-medium">Issues</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.06]">
            {visible.map((r) => {
              const blocked = statusBlocksImport(r.status)
              // A row the database itself would refuse cannot be approved from
              // here — the admin has to fix the number or drop the row.
              const refusable =
                r.flags.hasExactPhoneDuplicate || r.flags.hasExactNameDuplicate || r.flags.hasMissingName
              return (
                <tr key={r.lineNumber} className={cn(blocked && 'bg-rose-50/30')}>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={approved.has(r.lineNumber)}
                      disabled={refusable}
                      onChange={() => onToggle(r.lineNumber)}
                      aria-label={`Import ${r.row.full_name || `row ${r.lineNumber}`}`}
                      className="mt-1 h-4 w-4 rounded border-black/20 accent-[#9FE870] disabled:opacity-40"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="block font-medium text-[#1A1A1A]">
                      {r.row.full_name || <span className="italic text-[#1A1A1A]/45">No name</span>}
                    </span>
                    <span className="text-xs text-[#1A1A1A]/45">
                      Row {r.lineNumber} · {ticketTypeLabel(r.row.max_party_size)}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-[#1A1A1A]/75">
                    {r.row.phone || <span className="italic text-[#1A1A1A]/40">None</span>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <ImportStatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    {r.issues.length === 0 ? (
                      <span className="text-xs text-[#1A1A1A]/40">No issues</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {r.issues.map((issue) => (
                          <li key={issue} className="text-xs leading-relaxed text-[#1A1A1A]/70">
                            {issue}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              )
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-[#1A1A1A]/50">
                  No rows match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
