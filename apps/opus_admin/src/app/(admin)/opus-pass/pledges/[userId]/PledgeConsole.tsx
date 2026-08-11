'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarDays, MapPin, ShieldCheck, UserRound } from 'lucide-react'
import { useSetPageHeading } from '@/components/PageHeading'
import {
  createGuestAdmin,
  createPledgeAdmin,
  deleteGuestAdmin,
  deletePledgeAdmin,
  recordPledgePaymentAdmin,
  sendPledgeReminderAdmin,
  sendPledgeRequestsAdmin,
  updateCollectionSettingsAdmin,
  type PledgeInputAdmin,
} from './actions'
import type { PledgeCouple, PledgeEvent, PledgeGuest, PledgeRow } from './queries'
import type { PledgeConciergeTier } from '../tier'
import { toTzs } from '../currency'

const STATUS_LABEL: Record<string, string> = {
  invited: 'Invited',
  pledged: 'Pledged',
  partial: 'Partial',
  paid: 'Paid',
  declined: 'Declined',
}
const STATUS_CLASS: Record<string, string> = {
  invited: 'border-gray-200 bg-gray-50 text-gray-600',
  pledged: 'border-blue-200 bg-blue-50 text-blue-700',
  partial: 'border-amber-200 bg-amber-50 text-amber-800',
  paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  declined: 'border-rose-200 bg-rose-50 text-rose-700',
}

function formatTzs(value: number): string {
  return `TZS ${value.toLocaleString('en-US')}`
}

function formatDate(iso: string | null): string {
  if (!iso) return 'No date set'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'No date set'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const TABS = ['Overview', 'Pledges', 'Contributors', 'Send', 'Settings'] as const
type Tab = (typeof TABS)[number]

export default function PledgeConsole({
  userId,
  tier,
  couple,
  events,
  guests,
  pledges,
  eventFilter,
  canWrite,
}: {
  userId: string
  tier: PledgeConciergeTier
  couple: PledgeCouple
  events: PledgeEvent[]
  guests: PledgeGuest[]
  pledges: PledgeRow[]
  eventFilter: string | null
  canWrite: boolean
}) {
  const [tab, setTab] = useState<Tab>('Overview')
  const router = useRouter()

  useSetPageHeading({
    title: couple.coupleName,
    back: { href: '/opus-pass/pledges', label: 'Pledge Concierge' },
  })

  const totalPledged = pledges.reduce((sum, p) => sum + toTzs(p.pledgedAmount, p.currency), 0)
  const totalReceived = pledges.reduce((sum, p) => sum + toTzs(p.amountReceived, p.currency), 0)
  const outstanding = pledges.filter((p) => p.status !== 'paid' && p.status !== 'declined').length
  const goalPct = couple.pledgeGoalAmount ? Math.min(100, Math.round((totalReceived / couple.pledgeGoalAmount) * 100)) : null
  // Same fallback the list page uses (couple_profiles.wedding_date is often
  // null while the event carries the real date) so the two never disagree.
  const displayDate = couple.weddingDate ?? events.find((e) => e.startsAt)?.startsAt ?? null
  const collectedPct = totalPledged > 0 ? Math.min(100, Math.round((totalReceived / totalPledged) * 100)) : 0
  // Onboarding writes placeholder values into couple_profiles.city; rendering
  // "other" next to a location pin reads as a bug rather than as no answer.
  const city = couple.city && !['other', 'undisclosed'].includes(couple.city.trim().toLowerCase()) ? couple.city : null

  return (
    <div>
      {/* The shared header renders "< Pledge Concierge" in place of the title
          on detail pages, so the couple's identity has to live here — without
          it the tier pill was floating on its own with nothing to qualify. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-gray-900">{couple.coupleName}</h1>
          <p className="mt-1 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
            {formatDate(displayDate)}
            {city ? (
              <>
                <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                {city}
              </>
            ) : null}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-[#C9A0DC] bg-[#F0DFF6] px-2.5 py-1 text-xs font-semibold text-[#5d3a78]">
              {tier === 'signature' ? 'Signature' : 'Elegant'}
            </span>
            {outstanding > 0 ? (
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                {outstanding} outstanding
              </span>
            ) : pledges.length > 0 ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                Fully collected
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-500">
                Not started
              </span>
            )}
            {/* Replaces a full-width amber banner that said the same thing.
                Staff-initiated logging is a standing fact about this console,
                not an alert, so it gets pill weight not banner weight. */}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-500">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Staff-managed, every action logged
            </span>
          </div>
        </div>

        <Link
          href={`/opus-pass/couples/${userId}`}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-[#C9A0DC] hover:text-[#7E5896]"
        >
          <UserRound className="h-4 w-4" />
          Open account
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-1.5 border-b border-gray-200">
        {TABS.map((t) => (
          <button data-opus-button="control"
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-t-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === t ? 'border-b-2 border-[#7E5896] text-[#7E5896]' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Pledged" value={formatTzs(totalPledged)} />
          <StatCard label="Received" value={formatTzs(totalReceived)} accent="text-emerald-700" />
          <StatCard label="Outstanding pledges" value={String(outstanding)} accent="text-amber-700" />
          <StatCard label="Contributors" value={String(guests.length)} />
          {/* Collection always renders (received against what was actually
              pledged); goal progress only when the couple set a target. */}
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)] sm:col-span-2 lg:col-span-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-900">Collected against pledges</span>
              <span className="tabular-nums text-gray-500">
                {collectedPct}% · {formatTzs(totalReceived)} of {formatTzs(totalPledged)}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${collectedPct}%` }} />
            </div>
            {pledges.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">
                No pledges recorded yet. Add contributors, then record their pledges from the Pledges tab.
              </p>
            ) : null}
          </div>

          {goalPct !== null ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)] sm:col-span-2 lg:col-span-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-gray-900">Goal progress</span>
                <span className="tabular-nums text-gray-500">
                  {goalPct}% · {formatTzs(totalReceived)} of {formatTzs(couple.pledgeGoalAmount!)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-[#7E5896]" style={{ width: `${goalPct}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'Pledges' ? (
        <PledgesTab
          userId={userId}
          events={events}
          guests={guests}
          pledges={pledges}
          eventFilter={eventFilter}
          canWrite={canWrite}
          onRefresh={() => router.refresh()}
        />
      ) : null}

      {tab === 'Contributors' ? (
        <ContributorsTab userId={userId} guests={guests} canWrite={canWrite} onRefresh={() => router.refresh()} />
      ) : null}

      {tab === 'Send' ? (
        <SendTab userId={userId} guests={guests} pledges={pledges} events={events} canWrite={canWrite} />
      ) : null}

      {tab === 'Settings' ? (
        <SettingsTab userId={userId} couple={couple} canWrite={canWrite} onRefresh={() => router.refresh()} />
      ) : null}
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${accent ?? 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------- Pledges tab

function PledgesTab({
  userId,
  events,
  guests,
  pledges,
  eventFilter,
  canWrite,
  onRefresh,
}: {
  userId: string
  events: PledgeEvent[]
  guests: PledgeGuest[]
  pledges: PledgeRow[]
  eventFilter: string | null
  canWrite: boolean
  onRefresh: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [paymentDraft, setPaymentDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  function recordPayment(pledgeId: string) {
    const amount = Number(paymentDraft[pledgeId] ?? 0)
    setError(null)
    startTransition(async () => {
      const res = await recordPledgePaymentAdmin(userId, pledgeId, amount)
      if (!res.ok) setError(res.error)
      else {
        setPaymentDraft((prev) => ({ ...prev, [pledgeId]: '' }))
        onRefresh()
      }
    })
  }

  function remove(pledgeId: string) {
    if (!confirm('Delete this pledge?')) return
    startTransition(async () => {
      const res = await deletePledgeAdmin(userId, pledgeId)
      if (!res.ok) setError(res.error)
      else onRefresh()
    })
  }

  return (
    <div className="mt-5">
      {events.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-500">Event:</span>
          <a href={`?`} className={`rounded-full px-3 py-1 ${!eventFilter ? 'bg-[#7E5896] text-white' : 'border border-gray-200 text-gray-600'}`}>
            All
          </a>
          {events.map((e) => (
            <a
              key={e.id}
              href={`?event=${e.id}`}
              className={`rounded-full px-3 py-1 ${eventFilter === e.id ? 'bg-[#7E5896] text-white' : 'border border-gray-200 text-gray-600'}`}
            >
              {e.name ?? 'Untitled event'}
            </a>
          ))}
        </div>
      ) : null}

      {canWrite ? (
        <div className="mb-4">
          <button data-opus-button="control"
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="rounded-xl bg-[#7E5896] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6c4884]"
          >
            {creating ? 'Cancel' : '+ Add pledge'}
          </button>
          {creating ? (
            <NewPledgeForm
              userId={userId}
              guests={guests}
              events={events}
              onDone={() => {
                setCreating(false)
                onRefresh()
              }}
              onError={setError}
            />
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <table className="opus-table w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Contributor</th>
              <th className="px-4 py-3">Pledged</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Record payment</th>
              {canWrite ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody>
            {pledges.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No pledges yet.
                </td>
              </tr>
            ) : (
              pledges.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.guestName}</td>
                  <td className="px-4 py-3 tabular-nums">{formatTzs(p.pledgedAmount)}</td>
                  <td className="px-4 py-3 tabular-nums text-emerald-700">{formatTzs(p.amountReceived)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[p.status] ?? ''}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {canWrite ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          value={paymentDraft[p.id] ?? ''}
                          onChange={(e) => setPaymentDraft((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          placeholder="Amount"
                          className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-sm outline-none focus:border-[#7E5896]"
                        />
                        <button data-opus-button="control"
                          type="button"
                          disabled={pending || !paymentDraft[p.id]}
                          onClick={() => recordPayment(p.id)}
                          className="rounded-lg bg-[#7E5896] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Record
                        </button>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  {canWrite ? (
                    <td className="px-4 py-3 text-right">
                      <button data-opus-button="control" type="button" onClick={() => remove(p.id)} className="text-xs font-medium text-rose-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NewPledgeForm({
  userId,
  guests,
  events,
  onDone,
  onError,
}: {
  userId: string
  guests: PledgeGuest[]
  events: PledgeEvent[]
  onDone: () => void
  onError: (msg: string | null) => void
}) {
  const [pending, startTransition] = useTransition()
  const [guestContactId, setGuestContactId] = useState('')
  const [newName, setNewName] = useState('')
  const [amount, setAmount] = useState('')
  const [eventId, setEventId] = useState(events[0]?.id ?? '')

  function submit() {
    onError(null)
    const input: PledgeInputAdmin = {
      eventId: eventId || undefined,
      pledged_amount: Number(amount) || 0,
    }
    if (guestContactId) input.guestContactId = guestContactId
    else input.full_name = newName
    startTransition(async () => {
      const res = await createPledgeAdmin(userId, input)
      if (!res.ok) onError(res.error)
      else {
        setNewName('')
        setAmount('')
        setGuestContactId('')
        onDone()
      }
    })
  }

  return (
    <div className="mt-3 max-w-lg space-y-2.5 rounded-xl border border-gray-200 bg-gray-50/60 p-3.5">
      <select
        value={guestContactId}
        onChange={(e) => setGuestContactId(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm"
      >
        <option value="">New contributor…</option>
        {guests.map((g) => (
          <option key={g.id} value={g.id}>
            {g.fullName}
          </option>
        ))}
      </select>
      {!guestContactId ? (
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Contributor name"
          className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm"
        />
      ) : null}
      {events.length > 0 ? (
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm">
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name ?? 'Untitled event'}
            </option>
          ))}
        </select>
      ) : null}
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Pledged amount"
        className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm"
      />
      <button data-opus-button="control"
        type="button"
        disabled={pending || (!guestContactId && !newName.trim())}
        onClick={submit}
        className="rounded-lg bg-[#7E5896] px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        Save pledge
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- Contributors tab

function ContributorsTab({
  userId,
  guests,
  canWrite,
  onRefresh,
}: {
  userId: string
  guests: PledgeGuest[]
  canWrite: boolean
  onRefresh: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  function add() {
    setError(null)
    startTransition(async () => {
      const res = await createGuestAdmin(userId, { full_name: name, phone, email })
      if (!res.ok) setError(res.error)
      else {
        setName('')
        setPhone('')
        setEmail('')
        setAdding(false)
        onRefresh()
      }
    })
  }

  function remove(id: string) {
    if (!confirm('Remove this contributor?')) return
    startTransition(async () => {
      const res = await deleteGuestAdmin(userId, id)
      if (!res.ok) setError(res.error)
      else onRefresh()
    })
  }

  return (
    <div className="mt-5">
      {canWrite ? (
        <div className="mb-4">
          <button data-opus-button="control"
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-xl bg-[#7E5896] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6c4884]"
          >
            {adding ? 'Cancel' : '+ Add contributor'}
          </button>
          {adding ? (
            <div className="mt-3 flex max-w-xl flex-wrap gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" />
              <button data-opus-button="control" type="button" disabled={pending || !name.trim()} onClick={add} className="rounded-lg bg-[#7E5896] px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                Save
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <table className="opus-table w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Pledge invites sent</th>
              {canWrite ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody>
            {guests.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No contributors yet.
                </td>
              </tr>
            ) : (
              guests.map((g) => (
                <tr key={g.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-900">{g.fullName}</td>
                  <td className="px-4 py-3 text-gray-600">{g.phone ?? g.whatsappPhone ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{g.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{g.pledgeInviteCount}</td>
                  {canWrite ? (
                    <td className="px-4 py-3 text-right">
                      <button data-opus-button="control" type="button" onClick={() => remove(g.id)} className="text-xs font-medium text-rose-600 hover:underline">
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Send tab

function SendTab({
  userId,
  guests,
  pledges,
  events,
  canWrite,
}: {
  userId: string
  guests: PledgeGuest[]
  pledges: PledgeRow[]
  events: PledgeEvent[]
  canWrite: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [channel, setChannel] = useState<'whatsapp' | 'sms' | 'email'>('whatsapp')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [eventId, setEventId] = useState(events[0]?.id ?? '')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function sendRequests() {
    setError(null)
    setResult(null)
    startTransition(async () => {
      const res = await sendPledgeRequestsAdmin(userId, channel, [...selected], eventId || undefined)
      if (!res.ok && res.error) setError(res.error)
      else setResult(`Sent ${res.sent}, failed ${res.failed}, skipped ${res.skipped}${res.dryRun ? ' (dry run)' : ''}`)
    })
  }

  const outstanding = pledges.filter((p) => p.status !== 'paid' && p.status !== 'declined')

  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <h2 className="text-sm font-semibold text-gray-900">Send pledge request</h2>
        <p className="mt-1 text-xs text-gray-500">Ask selected contributors to make a pledge.</p>

        <div className="mt-3 flex gap-1.5">
          {(['whatsapp', 'sms', 'email'] as const).map((c) => (
            <button data-opus-button="control"
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${channel === c ? 'bg-[#7E5896] text-white' : 'border border-gray-200 text-gray-600'}`}
            >
              {c}
            </button>
          ))}
        </div>

        {events.length > 0 ? (
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm">
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name ?? 'Untitled event'}
              </option>
            ))}
          </select>
        ) : null}

        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-gray-100">
          {guests.map((g) => (
            <label key={g.id} className="flex items-center gap-2 border-b border-gray-50 px-3 py-2 text-sm last:border-0">
              <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggle(g.id)} />
              {g.fullName}
            </label>
          ))}
        </div>

        {canWrite ? (
          <button data-opus-button="control"
            type="button"
            disabled={pending || selected.size === 0}
            onClick={sendRequests}
            className="mt-3 rounded-xl bg-[#7E5896] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Send to {selected.size} selected
          </button>
        ) : (
          <p className="mt-3 text-xs text-amber-700">Your account has read access only.</p>
        )}
        {result ? <p className="mt-2 text-sm text-emerald-700">{result}</p> : null}
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
      </div>

      <ReminderPanel userId={userId} outstanding={outstanding} canWrite={canWrite} />
    </div>
  )
}

function ReminderPanel({
  userId,
  outstanding,
  canWrite,
}: {
  userId: string
  outstanding: PledgeRow[]
  canWrite: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [channel, setChannel] = useState<'whatsapp' | 'sms' | 'email'>('whatsapp')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Record<string, string>>({})

  function remind(p: PledgeRow) {
    const owing = p.pledgedAmount - p.amountReceived
    const text = message.trim() || `Hi ${p.guestName}, a gentle reminder about your pledge of ${formatTzs(owing)}.`
    startTransition(async () => {
      const res = await sendPledgeReminderAdmin(userId, p.id, channel, text)
      setStatus((prev) => ({ ...prev, [p.id]: res.ok ? 'Sent' : res.error ?? 'Failed' }))
    })
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <h2 className="text-sm font-semibold text-gray-900">Send follow-up reminders</h2>
      <p className="mt-1 text-xs text-gray-500">Chase outstanding pledges one at a time.</p>

      <div className="mt-3 flex gap-1.5">
        {(['whatsapp', 'sms', 'email'] as const).map((c) => (
          <button data-opus-button="control"
            key={c}
            type="button"
            onClick={() => setChannel(c)}
            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${channel === c ? 'bg-[#7E5896] text-white' : 'border border-gray-200 text-gray-600'}`}
          >
            {c}
          </button>
        ))}
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Custom message (optional). A default reminder is used if left blank, and it is ignored for WhatsApp, which always uses the approved template."
        rows={2}
        className="mt-3 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm"
      />

      <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-gray-100">
        {outstanding.length === 0 ? (
          <p className="px-3 py-4 text-sm text-gray-400">No outstanding pledges.</p>
        ) : (
          outstanding.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 border-b border-gray-50 px-3 py-2 text-sm last:border-0">
              <span className="min-w-0 truncate">{p.guestName} owes {formatTzs(p.pledgedAmount - p.amountReceived)}</span>
              {canWrite ? (
                <button data-opus-button="control"
                  type="button"
                  disabled={pending}
                  onClick={() => remind(p)}
                  className="shrink-0 rounded-lg bg-[#7E5896] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Remind
                </button>
              ) : null}
              {status[p.id] ? <span className="shrink-0 text-xs text-gray-500">{status[p.id]}</span> : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Settings tab

function SettingsTab({
  userId,
  couple,
  canWrite,
  onRefresh,
}: {
  userId: string
  couple: PledgeCouple
  canWrite: boolean
  onRefresh: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [goal, setGoal] = useState(couple.pledgeGoalAmount ? String(couple.pledgeGoalAmount) : '')
  const [methods, setMethods] = useState(couple.pledgePaymentMethods.length ? couple.pledgePaymentMethods : [{ label: '', value: '', name: '' }])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function updateMethod(i: number, patch: Partial<{ label: string; value: string; name: string }>) {
    setMethods((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  }

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await updateCollectionSettingsAdmin(userId, {
        goalAmount: goal ? Number(goal) : null,
        paymentMethods: methods,
      })
      if (!res.ok) setError(res.error)
      else {
        setSaved(true)
        onRefresh()
      }
    })
  }

  return (
    <div className="mt-5 max-w-xl rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <h2 className="text-sm font-semibold text-gray-900">Campaign settings</h2>

      <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-gray-500">Fundraising goal (TZS)</label>
      <input
        type="number"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        disabled={!canWrite}
        className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm disabled:bg-gray-50"
      />

      <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-gray-500">How to pay</label>
      <div className="mt-1 space-y-2">
        {methods.map((m, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={m.label}
              onChange={(e) => updateMethod(i, { label: e.target.value })}
              placeholder="Provider (e.g. M-Pesa)"
              disabled={!canWrite}
              className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm disabled:bg-gray-50"
            />
            <input
              value={m.value}
              onChange={(e) => updateMethod(i, { value: e.target.value })}
              placeholder="Account / number"
              disabled={!canWrite}
              className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm disabled:bg-gray-50"
            />
          </div>
        ))}
        {canWrite ? (
          <button data-opus-button="control"
            type="button"
            onClick={() => setMethods((prev) => [...prev, { label: '', value: '', name: '' }])}
            className="text-xs font-medium text-[#7E5896] hover:underline"
          >
            + Add payment method
          </button>
        ) : null}
      </div>

      {canWrite ? (
        <button data-opus-button="control"
          type="button"
          disabled={pending}
          onClick={save}
          className="mt-4 rounded-xl bg-[#7E5896] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Save settings
        </button>
      ) : null}
      {saved ? <p className="mt-2 text-sm text-emerald-700">Saved.</p> : null}
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
    </div>
  )
}
