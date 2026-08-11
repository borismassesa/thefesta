'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import StatusPill from '../_components/StatusPill'
import SetGrowthHeading from '../_components/SetGrowthHeading'
import Tabs from '../_components/Tabs'
import { computeStatus } from '../_lib/status'
import {
  addOutreachLogEntry,
  deleteOutreachLogEntry,
  saveOutreachTarget,
  updateOutreachLogEntry,
  type OutreachLogInput,
} from './actions'

export type RosterRow = {
  id: string
  staffName: string
  department: string
  targetOutreach: number
  targetMeetings: number
  targetSigned: number
  doneOutreach: number
  doneMeetings: number
  doneSigned: number
}

export type OutreachLogEntry = {
  id: string
  logDate: string
  staffName: string
  vendorName: string
  category: string
  contactMethod: string
  stage: string
  nextAction: string
  nextActionDate: string | null
  travelCostTzs: number | null
  outcome: string
  notes: string
}

const CATEGORIES = [
  'Decorator',
  'Photographer',
  'Caterer',
  'Venue',
  'Florist',
  'Makeup Artist',
  'DJ/MC',
  'Cake',
  'Bridal Wear',
  'Transport',
  'Stationery',
  'Other',
] as const

const CONTACT_METHODS = [
  'WhatsApp',
  'Phone Call',
  'In-Person Visit',
  'Email',
  'LinkedIn',
  'Instagram DM',
  'Referral',
  'Other',
] as const

const STAGES = [
  '1. Initial Contact',
  '2. Follow-up Sent',
  '3. Meeting Scheduled',
  '4. Meeting Held',
  '5. Proposal Sent',
  '6. Signed Up',
  '7. Not Interested',
  '8. Lost',
] as const

const OUTCOMES = [
  'Active — In Funnel',
  'Won — Signed Up',
  'Lost — Not Interested',
  'Lost — Went Elsewhere',
  'On Hold',
] as const

function formatTzs(value: number | null): string {
  if (value === null) return '—'
  return `TZS ${Math.round(value).toLocaleString('en-US')}`
}

function formatDate(value: string): string {
  const d = new Date(`${value}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function monthLabel(monthKey: string): string {
  const d = new Date(`${monthKey}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number)
  const zeroBased = month - 1 + delta
  const newYear = year + Math.floor(zeroBased / 12)
  const newMonth = ((zeroBased % 12) + 12) % 12
  return `${newYear}-${String(newMonth + 1).padStart(2, '0')}-01`
}

const TAB_HEADINGS: Record<string, { title: string; subtitle: string }> = {
  log: {
    title: 'Outreach Log',
    subtitle: "Every vendor touch point, even if it didn't convert.",
  },
  roster: {
    title: 'Roster Targets',
    subtitle:
      'Every employee owns a vendor target. Marketing carries the heaviest load; every other department brings 5 signed vendors/month.',
  },
}

export default function VendorOutreachClient({
  roster,
  log,
  employeeNames,
  canWrite,
  canAdmin,
  month,
}: {
  roster: RosterRow[]
  log: OutreachLogEntry[]
  employeeNames: string[]
  canWrite: boolean
  canAdmin: boolean
  month: string
}) {
  const staffOptions = useMemo(() => {
    const names = new Set<string>()
    for (const r of roster) names.add(r.staffName)
    for (const n of employeeNames) names.add(n)
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [roster, employeeNames])

  const [activeTab, setActiveTab] = useState<'log' | 'roster'>('log')
  const heading = TAB_HEADINGS[activeTab]

  return (
    <div className="space-y-6 pb-16">
      <SetGrowthHeading
        title={heading.title}
        subtitle={heading.subtitle}
        back={{ href: '/growth', label: 'Growth Tracker' }}
      />
      <Tabs
        defaultKey="log"
        onChange={(key) => setActiveTab(key as 'log' | 'roster')}
        tabs={[
          {
            key: 'log',
            label: `Outreach log (${log.length})`,
            content: <OutreachLog log={log} staffOptions={staffOptions} canWrite={canWrite} />,
          },
          {
            key: 'roster',
            label: 'Roster targets',
            content: <RosterTable roster={roster} canAdmin={canAdmin} month={month} />,
          },
        ]}
      />
    </div>
  )
}

// =============================================================================
// Roster targets table
// =============================================================================

function RosterTable({ roster, canAdmin, month }: { roster: RosterRow[]; canAdmin: boolean; month: string }) {
  const totals = useMemo(() => {
    return roster.reduce(
      (acc, r) => ({
        targetOutreach: acc.targetOutreach + r.targetOutreach,
        targetMeetings: acc.targetMeetings + r.targetMeetings,
        targetSigned: acc.targetSigned + r.targetSigned,
        doneOutreach: acc.doneOutreach + r.doneOutreach,
        doneMeetings: acc.doneMeetings + r.doneMeetings,
        doneSigned: acc.doneSigned + r.doneSigned,
      }),
      { targetOutreach: 0, targetMeetings: 0, targetSigned: 0, doneOutreach: 0, doneMeetings: 0, doneSigned: 0 },
    )
  }, [roster])

  const totalStatus = computeStatus(totals.doneSigned, totals.targetSigned)

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="text-[12px] text-gray-500">Progress against each person&apos;s target for the selected month</div>
        <div className="flex items-center gap-2">
          <Link
            href={`/growth/vendor-outreach?month=${shiftMonth(month, -1)}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Link>
          <span className="min-w-[110px] text-center text-[12px] font-semibold text-gray-900">{monthLabel(month)}</span>
          <Link
            href={`/growth/vendor-outreach?month=${shiftMonth(month, 1)}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            aria-label="Next month"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
      <table className="opus-table w-full min-w-[900px] text-[12px]">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-500">
            <th className="px-4 py-2 font-medium">Staff</th>
            <th className="px-3 py-2 font-medium">Department</th>
            <th className="px-3 py-2 font-medium">Target Outreach</th>
            <th className="px-3 py-2 font-medium">Target Meetings</th>
            <th className="px-3 py-2 font-medium">Target Signed</th>
            <th className="px-3 py-2 font-medium">Done Outreach</th>
            <th className="px-3 py-2 font-medium">Done Meetings</th>
            <th className="px-3 py-2 font-medium">Done Signed</th>
            <th className="px-3 py-2 font-medium">% to Target</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((r) => (
            <RosterRowItem key={r.id} row={r} canAdmin={canAdmin} />
          ))}
          <tr className="border-t-2 border-gray-200 bg-gray-50/60 font-semibold text-gray-900">
            <td className="px-4 py-2">Total</td>
            <td className="px-3 py-2" />
            <td className="px-3 py-2">{totals.targetOutreach}</td>
            <td className="px-3 py-2">{totals.targetMeetings}</td>
            <td className="px-3 py-2">{totals.targetSigned}</td>
            <td className="px-3 py-2">{totals.doneOutreach}</td>
            <td className="px-3 py-2">{totals.doneMeetings}</td>
            <td className="px-3 py-2">{totals.doneSigned}</td>
            <td className="px-3 py-2">
              {totals.targetSigned ? `${((totals.doneSigned / totals.targetSigned) * 100).toFixed(0)}%` : '—'}
            </td>
            <td className="px-3 py-2">
              <StatusPill status={totalStatus} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function RosterRowItem({ row, canAdmin }: { row: RosterRow; canAdmin: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [draft, setDraft] = useState({
    targetOutreach: row.targetOutreach,
    targetMeetings: row.targetMeetings,
    targetSigned: row.targetSigned,
  })
  const [error, setError] = useState<string | null>(null)

  const status = computeStatus(row.doneSigned, row.targetSigned)
  const pct = row.targetSigned ? `${((row.doneSigned / row.targetSigned) * 100).toFixed(0)}%` : '—'

  function commit() {
    startTransition(async () => {
      const res = await saveOutreachTarget(row.id, draft)
      setError(res.ok ? null : res.error)
    })
  }

  return (
    <tr className={cn('border-b border-gray-50', isPending && 'opacity-60')}>
      <td className="px-4 py-2 font-semibold text-gray-900">{row.staffName}</td>
      <td className="px-3 py-2 text-gray-600">{row.department}</td>
      <td className="px-3 py-2">
        <input
          type="number"
          min={0}
          value={draft.targetOutreach}
          disabled={!canAdmin}
          onChange={(e) => setDraft((d) => ({ ...d, targetOutreach: Number(e.target.value) }))}
          onBlur={commit}
          className="w-16 rounded-md border border-gray-200 px-1.5 py-1 text-[12px] tabular-nums disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min={0}
          value={draft.targetMeetings}
          disabled={!canAdmin}
          onChange={(e) => setDraft((d) => ({ ...d, targetMeetings: Number(e.target.value) }))}
          onBlur={commit}
          className="w-16 rounded-md border border-gray-200 px-1.5 py-1 text-[12px] tabular-nums disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          min={0}
          value={draft.targetSigned}
          disabled={!canAdmin}
          onChange={(e) => setDraft((d) => ({ ...d, targetSigned: Number(e.target.value) }))}
          onBlur={commit}
          className="w-16 rounded-md border border-gray-200 px-1.5 py-1 text-[12px] tabular-nums disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
        />
      </td>
      <td className="px-3 py-2 text-gray-700">{row.doneOutreach}</td>
      <td className="px-3 py-2 text-gray-700">{row.doneMeetings}</td>
      <td className="px-3 py-2 text-gray-700">{row.doneSigned}</td>
      <td className="px-3 py-2 text-gray-600">{pct}</td>
      <td className="px-3 py-2">
        <StatusPill status={status} />
        {error && <div className="mt-1 text-[10px] text-red-600">{error}</div>}
      </td>
    </tr>
  )
}

// =============================================================================
// Outreach log
// =============================================================================

function OutreachLog({
  log,
  staffOptions,
  canWrite,
}: {
  log: OutreachLogEntry[]
  staffOptions: string[]
  canWrite: boolean
}) {
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="text-[12px] text-gray-500">Every vendor touch point, even if it didn&apos;t convert.</div>
        {canWrite && (
          <button data-opus-button="control"
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6c4884]"
          >
            <Plus className="h-4 w-4" />
            Add contact
          </button>
        )}
      </div>

      <table className="opus-table w-full min-w-[1100px] text-[12px]">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-500">
            <th className="px-4 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Staff</th>
            <th className="px-3 py-2 font-medium">Vendor</th>
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 font-medium">Contact</th>
            <th className="px-3 py-2 font-medium">Stage</th>
            <th className="px-3 py-2 font-medium">Outcome</th>
            <th className="px-3 py-2 font-medium">Travel Cost</th>
            <th className="px-3 py-2 font-medium">Notes</th>
            {canWrite && <th className="px-3 py-2 font-medium" />}
          </tr>
        </thead>
        <tbody>
          {log.length === 0 && (
            <tr>
              <td colSpan={canWrite ? 10 : 9} className="px-4 py-8 text-center text-gray-400">
                No outreach logged yet.
              </td>
            </tr>
          )}
          {log.map((entry) => (
            <LogRowItem key={entry.id} entry={entry} staffOptions={staffOptions} canWrite={canWrite} />
          ))}
        </tbody>
      </table>

      {showAdd && <AddContactDrawer staffOptions={staffOptions} onClose={() => setShowAdd(false)} />}
    </div>
  )
}

function LogRowItem({
  entry,
  staffOptions,
  canWrite,
}: {
  entry: OutreachLogEntry
  staffOptions: string[]
  canWrite: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    stage: entry.stage,
    outcome: entry.outcome,
    notes: entry.notes,
  })

  function commit() {
    startTransition(async () => {
      const res = await updateOutreachLogEntry(entry.id, draft)
      if (res.ok) {
        setError(null)
        setEditing(false)
      } else {
        setError(res.error)
      }
    })
  }

  function remove() {
    if (!window.confirm(`Delete outreach entry for "${entry.vendorName}"?`)) return
    startTransition(async () => {
      const res = await deleteOutreachLogEntry(entry.id)
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <tr className={cn('border-b border-gray-50 align-top', isPending && 'opacity-60')}>
      <td className="whitespace-nowrap px-4 py-2 text-gray-600">{formatDate(entry.logDate)}</td>
      <td className="px-3 py-2 text-gray-800">{entry.staffName}</td>
      <td className="px-3 py-2 font-medium text-gray-900">{entry.vendorName}</td>
      <td className="px-3 py-2 text-gray-600">{entry.category}</td>
      <td className="px-3 py-2 text-gray-600">{entry.contactMethod}</td>
      <td className="px-3 py-2">
        {editing ? (
          <select
            value={draft.stage}
            onChange={(e) => setDraft((d) => ({ ...d, stage: e.target.value }))}
            className="rounded-md border border-gray-200 px-1.5 py-1 text-[12px]"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-gray-700">{entry.stage}</span>
        )}
      </td>
      <td className="px-3 py-2">
        {editing ? (
          <select
            value={draft.outcome}
            onChange={(e) => setDraft((d) => ({ ...d, outcome: e.target.value }))}
            className="rounded-md border border-gray-200 px-1.5 py-1 text-[12px]"
          >
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-gray-700">{entry.outcome}</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatTzs(entry.travelCostTzs)}</td>
      <td className="min-w-[160px] max-w-[260px] px-3 py-2">
        {editing ? (
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            rows={2}
            className="w-full rounded-md border border-gray-200 px-1.5 py-1 text-[12px]"
          />
        ) : (
          <span className="text-gray-600">{entry.notes || '—'}</span>
        )}
        {error && <div className="mt-1 text-[10px] text-red-600">{error}</div>}
      </td>
      {canWrite && (
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {editing ? (
          <div className="flex justify-end gap-2">
            <button data-opus-button="control"
              type="button"
              onClick={commit}
              disabled={isPending}
              className="text-[11px] font-semibold text-[#7E5896] hover:underline disabled:opacity-50"
            >
              Save
            </button>
            <button data-opus-button="control"
              type="button"
              onClick={() => setEditing(false)}
              className="text-[11px] font-medium text-gray-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button data-opus-button="control"
              type="button"
              onClick={() => setEditing(true)}
              className="text-[11px] font-semibold text-gray-600 hover:underline"
            >
              Edit
            </button>
            <button data-opus-button="control"
              type="button"
              onClick={remove}
              disabled={isPending}
              className="text-[11px] font-semibold text-red-600 hover:underline disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        )}
      </td>
      )}
    </tr>
  )
}

// =============================================================================
// Add contact drawer
// =============================================================================

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7E5896] focus:outline-none focus:ring-2 focus:ring-[#F0DFF6]'

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </span>
      {children}
    </label>
  )
}

function AddContactDrawer({ staffOptions, onClose }: { staffOptions: string[]; onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10))
  const [staffName, setStaffName] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [category, setCategory] = useState<string>(CATEGORIES[0])
  const [contactMethod, setContactMethod] = useState<string>(CONTACT_METHODS[0])
  const [stage, setStage] = useState<string>(STAGES[0])
  const [nextAction, setNextAction] = useState('')
  const [nextActionDate, setNextActionDate] = useState('')
  const [travelCost, setTravelCost] = useState('')
  const [outcome, setOutcome] = useState<string>(OUTCOMES[0])
  const [notes, setNotes] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const input: OutreachLogInput = {
      logDate,
      staffName,
      vendorName,
      category,
      contactMethod,
      stage,
      nextAction,
      nextActionDate: nextActionDate || null,
      travelCostTzs: travelCost === '' ? null : Number(travelCost),
      outcome,
      notes,
    }
    startTransition(async () => {
      const res = await addOutreachLogEntry(input)
      if (res.ok) {
        onClose()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Add contact">
      <button data-opus-button="control" type="button" aria-label="Close" className="flex-1 bg-gray-900/30" onClick={onClose} />
      <form
        onSubmit={submit}
        className="flex h-full w-full max-w-md flex-col border-l border-gray-100 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Log an outreach contact</h2>
            <p className="text-xs text-gray-500">Record every vendor touch point, even if it didn't convert.</p>
          </div>
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date" required>
              <input
                required
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Staff name" required>
              <input
                required
                list="vendor-outreach-staff-options"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Type or pick a name"
                className={INPUT_CLASS}
              />
              <datalist id="vendor-outreach-staff-options">
                {staffOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </FormField>
          </div>

          <FormField label="Vendor / business name" required>
            <input
              required
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g. Blossom Decor"
              className={INPUT_CLASS}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT_CLASS}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Contact method">
              <select
                value={contactMethod}
                onChange={(e) => setContactMethod(e.target.value)}
                className={INPUT_CLASS}
              >
                {CONTACT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Stage">
              <select value={stage} onChange={(e) => setStage(e.target.value)} className={INPUT_CLASS}>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Outcome">
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={INPUT_CLASS}>
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Next action">
            <input
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="e.g. Send proposal follow-up"
              className={INPUT_CLASS}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Next action date">
              <input
                type="date"
                value={nextActionDate}
                onChange={(e) => setNextActionDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Travel cost (TZS)">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={travelCost}
                onChange={(e) => setTravelCost(e.target.value)}
                placeholder="0"
                className={cn(INPUT_CLASS, 'text-right tabular-nums')}
              />
            </FormField>
          </div>

          <FormField label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything worth remembering…"
              className={INPUT_CLASS}
            />
          </FormField>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}
        </div>

        <footer className="border-t border-gray-100 px-5 py-3">
          <div className="flex items-center justify-end gap-2">
            <button data-opus-button="control"
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button data-opus-button="primary" data-opus-button-size="medium"
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6c4884] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {isPending ? 'Saving…' : 'Save contact'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  )
}
