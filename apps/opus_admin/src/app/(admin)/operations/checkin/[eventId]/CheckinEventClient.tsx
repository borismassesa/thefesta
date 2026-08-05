'use client'

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import {
  ChevronDown,
  Copy,
  DoorOpen,
  Link2,
  Loader2,
  LogIn,
  MailCheck,
  RotateCw,
  Send,
  ShieldCheck,
  ShieldOff,
  UserPlus,
  UserRoundX,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  checkinChannelName,
  createCheckinRealtimeClient,
  type CheckinBroadcastPayload,
} from '@/lib/checkin-realtime'
import { capacityTone } from '@/lib/checkin-event-status'
import {
  assignAttendant,
  revokeAttendant,
  sendAccessCode,
  type AttendantAssignment,
  type DeliveryResult,
} from '../actions'
import {
  ACCESS_CODE_VALIDITY_OPTIONS,
  formatScannerAccessCode,
  type AccessCodeValidity,
} from '@/lib/checkin-code'

export interface CheckinBaseline {
  event: {
    id: string
    name: string
    eventType: string
    startsAt: string | null
    endsAt: string | null
    venueName: string | null
    city: string | null
    coupleName: string | null
  } | null
  totalAttending: number
  totalCheckedIn: number
  /** Arrivals per entrance, already tallied server-side. Re-sums to
   *  totalCheckedIn — scans with no recorded door land in one bucket. */
  doorCounts: { doorLabel: string; count: number }[]
  recent: { guestName: string; doorLabel: string | null; checkedInAt: string }[]
}

interface FeedEntry {
  guestName: string
  doorLabel: string | null
  checkedInAt: string
  duplicate?: boolean
}

/** Doors offered in the assign form when this event has none of its own yet. */
const DEFAULT_DOORS = ['Main Gate', 'East Gate', 'VIP Entrance']
/** Bucket the server uses for scans with no door recorded — a real place
 *  name to a reader, but never a door you can assign someone to. */
const UNRECORDED_DOOR = 'Unrecorded door'
/** A code this close to expiry is flagged so it can be re-issued before an
 *  attendant is locked out mid-shift rather than after. */
const EXPIRING_SOON_MS = 2 * 60 * 60 * 1000

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatExpiry(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------- staff status

type StaffStatus = 'active' | 'expiring' | 'revoked' | 'expired'

/** Semantic, not brand: at a live door "can this person still scan" has to
 *  read at a glance, and purple-on-purple can't carry that distinction. */
const STATUS_STYLE: Record<StaffStatus, { label: string; dot: string; text: string; chip: string }> = {
  active: { label: 'Active', dot: 'bg-[#7ec24a]', text: 'text-[#3d6b1f]', chip: 'border-[#7ec24a] bg-[#9FE870]/20' },
  expiring: { label: 'Expiring soon', dot: 'bg-amber-500', text: 'text-amber-700', chip: 'border-amber-300 bg-amber-50' },
  revoked: { label: 'Revoked', dot: 'bg-rose-500', text: 'text-rose-700', chip: 'border-rose-200 bg-rose-50' },
  expired: { label: 'Expired', dot: 'bg-gray-400', text: 'text-gray-500', chip: 'border-gray-200 bg-gray-50' },
}

function staffStatus(a: AttendantAssignment, nowMs: number): StaffStatus {
  if (a.revokedAt) return 'revoked'
  const expiresMs = new Date(a.expiresAt).getTime()
  if (expiresMs <= nowMs) return 'expired'
  return expiresMs - nowMs <= EXPIRING_SOON_MS ? 'expiring' : 'active'
}

/** A code that can still open a door right now. Revoked and expired codes are
 *  kept for audit but can't be used, so they're listed separately. */
function isUsable(a: AttendantAssignment, nowMs: number): boolean {
  return !a.revokedAt && new Date(a.expiresAt).getTime() > nowMs
}

// ---------------------------------------------------------------- primitives

function Kpi({
  label,
  value,
  hint,
  icon,
  valueClass,
}: {
  label: string
  value: string
  hint?: string
  icon: ReactNode
  valueClass?: string
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[12px] font-medium text-gray-500">{label}</div>
        <span className="inline-flex h-7 w-7 items-center justify-center text-gray-400">{icon}</span>
      </div>
      <div className={cn('mt-2 text-[28px] leading-none font-semibold tracking-tight text-gray-900', valueClass)}>
        {value}
      </div>
      {hint ? <div className="mt-2 text-[11px] text-gray-400">{hint}</div> : null}
    </div>
  )
}

function Panel({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="mb-1 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#F0DFF6] text-[#7E5896]">
        {icon}
      </span>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      <p className="max-w-[34ch] text-xs leading-relaxed text-gray-400">{body}</p>
    </div>
  )
}

/** Icon-only once the label is obvious from context; the accessible name and
 *  the tooltip both carry the full wording. */
function IconAction({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors disabled:opacity-40',
        danger ? 'hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600' : 'hover:border-[#C9A0DC] hover:bg-[#F0DFF6]/50 hover:text-[#7E5896]',
      )}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------- staff card

function StaffCard({
  attendant: a,
  nowMs,
  pending,
  onRevoke,
  onReassign,
}: {
  attendant: AttendantAssignment
  nowMs: number
  pending: boolean
  onRevoke: () => void
  onReassign: () => void
}) {
  const status = staffStatus(a, nowMs)
  const style = STATUS_STYLE[status]
  const canRevoke = isUsable(a, nowMs)

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-colors',
        canRevoke ? 'border-gray-200 bg-white hover:border-[#C9A0DC]' : 'border-gray-100 bg-gray-50/60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('truncate text-sm font-semibold', canRevoke ? 'text-gray-900' : 'text-gray-500')}>
            {a.attendantName}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
            <DoorOpen className="h-3 w-3 shrink-0" /> {a.doorLabel}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
            style.chip,
            style.text,
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
          {style.label}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-xs">
        <div>
          <dt className="text-gray-400">{status === 'expired' || status === 'revoked' ? 'Ended' : 'Expires'}</dt>
          <dd className="mt-0.5 font-medium text-gray-700">{formatExpiry(a.revokedAt ?? a.expiresAt)}</dd>
        </div>
        <div>
          <dt className="text-gray-400">Last scan</dt>
          <dd className="mt-0.5 font-medium text-gray-700">
            {a.lastUsedAt ? formatTime(a.lastUsedAt) : 'Never used'}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center justify-end gap-2">
        {canRevoke ? (
          <IconAction label={`Revoke ${a.attendantName}'s access`} onClick={onRevoke} disabled={pending} danger>
            <ShieldOff className="h-3.5 w-3.5" />
          </IconAction>
        ) : (
          <IconAction label={`Issue ${a.attendantName} a new code`} onClick={onReassign} disabled={pending}>
            <RotateCw className="h-3.5 w-3.5" />
          </IconAction>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- console

export default function CheckinEventClient({
  eventId,
  baseline,
  initialAttendants,
}: {
  eventId: string
  baseline: CheckinBaseline
  initialAttendants: AttendantAssignment[]
}) {
  // ---- Live attendance (same pattern as opus_pass's LiveAttendance) ----
  const [checkedIn, setCheckedIn] = useState(baseline.totalCheckedIn)
  const [feed, setFeed] = useState<FeedEntry[]>(
    baseline.recent.map((r) => ({ guestName: r.guestName, doorLabel: r.doorLabel, checkedInAt: r.checkedInAt })),
  )
  // Per-door arrivals, seeded from the server tally and kept in step with the
  // same broadcast that moves the headline count — otherwise the doors would
  // silently drift from the total until the next page load.
  const [doorLive, setDoorLive] = useState<Record<string, number>>(() =>
    Object.fromEntries(baseline.doorCounts.map((d) => [d.doorLabel, d.count])),
  )
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let client: ReturnType<typeof createCheckinRealtimeClient>
    try {
      client = createCheckinRealtimeClient()
    } catch {
      return
    }
    const channel = client
      .channel(checkinChannelName(eventId))
      .on('broadcast', { event: 'scan' }, ({ payload }) => {
        const p = payload as CheckinBroadcastPayload
        setFeed((prev) =>
          [
            { guestName: p.guestName, doorLabel: p.doorLabel, checkedInAt: p.at, duplicate: p.status === 'duplicate' },
            ...prev,
          ].slice(0, 20),
        )
        if (p.status === 'success') {
          setCheckedIn((n) => n + 1)
          const door = p.doorLabel?.trim() || UNRECORDED_DOOR
          setDoorLive((prev) => ({ ...prev, [door]: (prev[door] ?? 0) + 1 }))
        }
      })
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'))
    return () => {
      client.removeChannel(channel)
    }
  }, [eventId])

  const remaining = Math.max(0, baseline.totalAttending - checkedIn)
  const pct = baseline.totalAttending > 0 ? Math.round((checkedIn / baseline.totalAttending) * 100) : 0
  const tone = capacityTone(pct)

  // ---- Assign attendant form + one-time reveal ----
  const [attendants, setAttendants] = useState(initialAttendants)
  const [name, setName] = useState('')
  const [door, setDoor] = useState('Main Gate')
  /** Optional coordinator address — when set, the code is emailed at mint time. */
  const [deliverTo, setDeliverTo] = useState('')
  // Defaults to the event window; the fixed durations are deliberate
  // overrides, so the safe option is never the one you have to remember.
  const [validity, setValidity] = useState<AccessCodeValidity>('event')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [reveal, setReveal] = useState<{
    attendantName: string
    doorLabel: string
    token: string
    link: string
    expiresAt: string
    linkWarning?: string
    delivery?: DeliveryResult
  } | null>(null)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  // Second-chance send from the reveal card: for when the address wasn't
  // known at assign time, or the first attempt bounced.
  const [resendTo, setResendTo] = useState('')
  const [resendState, setResendState] = useState<{ status: 'idle' | 'sent' | 'error'; message?: string }>({
    status: 'idle',
  })
  const [showSpent, setShowSpent] = useState(false)

  // Per-render snapshot, matching how expiry was already evaluated here.
  // eslint-disable-next-line react-hooks/purity -- expiry is time-relative; no SSR/hydration split on this client route
  const nowMs = Date.now()
  const usable = attendants.filter((a) => isUsable(a, nowMs))
  const spent = attendants.filter((a) => !isUsable(a, nowMs))

  // Doors this event actually uses: everywhere someone has been posted, plus
  // everywhere a guest has come through. The synthetic "no door recorded"
  // bucket is a reporting artefact, not somewhere you can post staff, so it
  // shows in occupancy but never in the assign picker.
  const knownDoors = useMemo(() => {
    const set = new Set<string>()
    for (const a of attendants) if (a.doorLabel) set.add(a.doorLabel)
    for (const d of Object.keys(doorLive)) if (d !== UNRECORDED_DOOR) set.add(d)
    for (const d of DEFAULT_DOORS) set.add(d)
    return Array.from(set).sort()
  }, [attendants, doorLive])

  // Occupancy rows: every door with arrivals, plus staffed doors still on
  // zero — a manned entrance nobody has come through is exactly the thing a
  // coordinator needs to see during an event.
  // Left to the React Compiler rather than useMemo: `usable` is derived from
  // state the compiler can't prove is never mutated, and a manual memo here
  // makes it bail out of optimizing the whole component.
  const doorCountMap = new Map<string, number>(Object.entries(doorLive))
  for (const a of usable) if (!doorCountMap.has(a.doorLabel)) doorCountMap.set(a.doorLabel, 0)
  const staffedDoors = new Set(usable.map((a) => a.doorLabel))
  const doorRows = Array.from(doorCountMap, ([doorLabel, count]) => ({
    doorLabel,
    count,
    staffed: staffedDoors.has(doorLabel),
  })).sort((a, b) => b.count - a.count || a.doorLabel.localeCompare(b.doorLabel))

  function runAssign(
    attendantName: string,
    doorLabel: string,
    codeValidity: AccessCodeValidity,
    sendTo?: string,
    onDone?: () => void,
  ) {
    setError('')
    setResendState({ status: 'idle' })
    setResendTo('')
    startTransition(async () => {
      const result = await assignAttendant(eventId, attendantName, doorLabel, codeValidity, sendTo)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setReveal({
        attendantName,
        doorLabel: doorLabel.trim() || 'Main Gate',
        token: result.token,
        link: result.link,
        expiresAt: result.expiresAt,
        linkWarning: result.linkWarning,
        delivery: result.delivery,
      })
      setAttendants((prev) => [
        {
          id: crypto.randomUUID(),
          doorLabel: doorLabel.trim() || 'Main Gate',
          attendantName,
          expiresAt: result.expiresAt,
          revokedAt: null,
          lastUsedAt: null,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ])
      onDone?.()
    })
  }

  function submitAssign(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    runAssign(trimmed, door, validity, deliverTo, () => {
      setName('')
      setDeliverTo('')
    })
  }

  /** Hand an already-revealed code to an address typed after the fact. */
  function resend() {
    if (!reveal) return
    const to = resendTo.trim()
    if (!to) return
    setResendState({ status: 'idle' })
    startTransition(async () => {
      const result = await sendAccessCode({
        eventId,
        to,
        attendantName: reveal.attendantName,
        doorLabel: reveal.doorLabel,
        code: reveal.token,
        expiresAt: reveal.expiresAt,
        link: reveal.link,
      })
      setResendState(
        result.ok ? { status: 'sent', message: to } : { status: 'error', message: result.error },
      )
      if (result.ok) setResendTo('')
    })
  }

  /** Issue a fresh code for a revoked/expired attendant under the same
   * name + door — the old code stays dead, this is a brand new row/token,
   * not a resurrection of the old one (the raw token was never stored, so
   * there's nothing to "unrevoke" into). Re-issues on the event window
   * rather than whatever was last picked in the form, so a one-off long
   * test code can't silently become the norm for every later re-issue. */
  function reassign(a: AttendantAssignment) {
    runAssign(a.attendantName, a.doorLabel, 'event')
  }


  function copy(value: string, which: 'code' | 'link') {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(which)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  function revoke(id: string) {
    startTransition(async () => {
      const result = await revokeAttendant(id, eventId)
      if (!result.ok) return
      setAttendants((prev) => prev.map((a) => (a.id === id ? { ...a, revokedAt: new Date().toISOString() } : a)))
    })
  }

  return (
    <div className="space-y-5 print:hidden">
      {/* How is the event going — answered before anything asks for input. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          label="Checked in"
          value={String(checkedIn)}
          hint={connected ? 'Live · updates as guests scan' : 'Showing last known counts'}
          icon={<LogIn className="h-4 w-4" />}
        />
        <Kpi
          label="Expected"
          value={String(baseline.totalAttending)}
          hint="guests who RSVP'd attending"
          icon={<Users className="h-4 w-4" />}
        />
        <Kpi
          label="Still to arrive"
          value={String(remaining)}
          hint={remaining === 0 && baseline.totalAttending > 0 ? 'everyone is in' : 'not yet scanned at any door'}
          icon={<UserRoundX className="h-4 w-4" />}
        />
        <Kpi
          label="Attendance"
          value={`${pct}%`}
          valueClass={tone.text}
          hint={`${usable.length} ${usable.length === 1 ? 'attendant' : 'attendants'} on duty`}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </div>

      {/* Capacity, full width so the fill is readable across the room. */}
      <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold tracking-wide text-gray-500 uppercase">Room capacity</span>
          <span className={cn('font-semibold tabular-nums', tone.text)}>
            {checkedIn} of {baseline.totalAttending} in
          </span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100">
          <div className={cn('h-full rounded-full transition-all', tone.bar)} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Staff workflow on the left, live floor on the right. */}
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div className="space-y-5">
          {/* Assign */}
          <Panel title="Assign door staff" icon={<UserPlus className="h-3.5 w-3.5 text-[#7E5896]" />}>
            <form onSubmit={submitAssign} className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="attendant-name" className="text-xs font-medium text-gray-600">
                    Staff member
                  </label>
                  <input
                    id="attendant-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Asha Mwakalinga"
                    className="mt-1.5 w-full rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-[#7E5896] focus:bg-white"
                  />
                </div>
                <div>
                  <label htmlFor="attendant-door" className="text-xs font-medium text-gray-600">
                    Door
                  </label>
                  {/* Free text with suggestions, not a fixed select: doors are
                      whatever the venue calls them, and a closed list would
                      quietly refuse a name this event actually uses. */}
                  <input
                    id="attendant-door"
                    list="checkin-known-doors"
                    value={door}
                    onChange={(e) => setDoor(e.target.value)}
                    placeholder="Main Gate"
                    className="mt-1.5 w-full rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-[#7E5896] focus:bg-white"
                  />
                  <datalist id="checkin-known-doors">
                    {knownDoors.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="attendant-email" className="text-xs font-medium text-gray-600">
                    Send code to <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    id="attendant-email"
                    type="email"
                    value={deliverTo}
                    onChange={(e) => setDeliverTo(e.target.value)}
                    placeholder="coordinator@example.com"
                    className="mt-1.5 w-full rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-[#7E5896] focus:bg-white"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">Emails the code straight to the coordinator.</p>
                </div>
                <div>
                  <label htmlFor="attendant-validity" className="text-xs font-medium text-gray-600">
                    Access duration
                  </label>
                  <select
                    id="attendant-validity"
                    value={validity}
                    onChange={(e) => setValidity(e.target.value as AccessCodeValidity)}
                    className="mt-1.5 w-full rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-[#7E5896] focus:bg-white"
                  >
                    {ACCESS_CODE_VALIDITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={!name.trim() || pending}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#7E5896] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#6b4a80] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign access'}
                </button>
              </div>
              {error ? <p className="text-xs text-rose-600">{error}</p> : null}
            </form>

            {reveal ? (
              <div className="border-t border-[#7ec24a]/40 bg-[#9FE870]/10 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-[#14361f]">
                      <ShieldCheck className="h-4 w-4" /> Access assigned
                    </p>
                    <p className="mt-0.5 text-xs text-[#3d6b1f]">
                      {reveal.attendantName} · shown once, won&apos;t be shown again
                    </p>
                  </div>
                  <IconAction label="Dismiss" onClick={() => setReveal(null)}>
                    <X className="h-3.5 w-3.5" />
                  </IconAction>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {/* Exactly what formatScannerAccessCode returns — that
                      grouping is the code's documented display form and is
                      kept in sync with opus_pass, which verifies it. */}
                  <code className="rounded-lg border border-[#7ec24a]/50 bg-white px-4 py-2 font-mono text-xl font-semibold tracking-[0.15em] text-gray-900">
                    {formatScannerAccessCode(reveal.token)}
                  </code>
                  <div className="flex items-center gap-2">
                    <IconAction label={copied === 'code' ? 'Code copied' : 'Copy code'} onClick={() => copy(reveal.token, 'code')}>
                      <Copy className="h-3.5 w-3.5" />
                    </IconAction>
                    {reveal.link ? (
                      <IconAction
                        label={copied === 'link' ? 'Link copied' : 'Copy scanner link'}
                        onClick={() => copy(reveal.link, 'link')}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </IconAction>
                    ) : null}
                  </div>
                  {copied ? <span className="text-xs font-medium text-[#3d6b1f]">Copied</span> : null}
                </div>

                {/* Whoever hands this over needs to know when it dies, or
                    they'll find out at the door. */}
                <p className="mt-3 text-xs text-[#3d6b1f]">
                  Works until {formatExpiry(reveal.expiresAt)}. Share the link directly, or read the code aloud for
                  the scanner&apos;s home screen.
                </p>
                {!reveal.link ? (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {reveal.linkWarning ?? 'Could not build a shareable link — share the code above manually.'}
                  </p>
                ) : null}

                {/* Delivery. Reported plainly either way: a bounced send that
                    looks like a success is how a coordinator ends up at a door
                    with no code. */}
                {reveal.delivery?.sent ? (
                  <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[#3d6b1f]">
                    <MailCheck className="h-3.5 w-3.5" /> Emailed to {reveal.delivery.to}
                  </p>
                ) : null}
                {reveal.delivery && !reveal.delivery.sent ? (
                  <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Could not email {reveal.delivery.to}: {reveal.delivery.error}. Share the code manually.
                  </p>
                ) : null}

                <div className="mt-3 border-t border-[#7ec24a]/30 pt-3">
                  <label htmlFor="resend-to" className="text-xs font-medium text-[#3d6b1f]">
                    {reveal.delivery?.sent ? 'Send to someone else' : 'Send this code by email'}
                  </label>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <input
                      id="resend-to"
                      type="email"
                      value={resendTo}
                      onChange={(e) => setResendTo(e.target.value)}
                      placeholder="coordinator@example.com"
                      className="min-w-[220px] flex-1 rounded-lg border border-[#7ec24a]/50 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-[#7E5896]"
                    />
                    <button
                      type="button"
                      onClick={resend}
                      disabled={!resendTo.trim() || pending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#6b4a80] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Send
                    </button>
                  </div>
                  {resendState.status === 'sent' ? (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[#3d6b1f]">
                      <MailCheck className="h-3.5 w-3.5" /> Sent to {resendState.message}
                    </p>
                  ) : null}
                  {resendState.status === 'error' ? (
                    <p className="mt-1.5 text-xs text-rose-600">{resendState.message}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </Panel>

          {/* Current access — usable codes lead; spent ones are kept for audit
              but tucked behind a disclosure so they can't be mistaken for
              someone who can currently open a door. */}
          <Panel
            title={`Current access${usable.length > 0 ? ` (${usable.length})` : ''}`}
            icon={<ShieldCheck className="h-3.5 w-3.5 text-[#7E5896]" />}
            action={
              spent.length > 0 ? (
                <button
                  onClick={() => setShowSpent((v) => !v)}
                  aria-expanded={showSpent}
                  className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-[#7E5896]"
                >
                  {showSpent ? 'Hide' : 'Show'} {spent.length} past {spent.length === 1 ? 'code' : 'codes'}
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showSpent && 'rotate-180')} />
                </button>
              ) : null
            }
          >
            {attendants.length === 0 ? (
              <EmptyState
                icon={<UserRoundX className="h-5 w-5" />}
                title="No door staff assigned yet"
                body="Assign someone above and they'll get a code that opens the scanner for their door."
              />
            ) : (
              <div className="space-y-3 p-4">
                {usable.length === 0 ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    No active codes — nobody can scan at this event right now.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {usable.map((a) => (
                      <StaffCard
                        key={a.id}
                        attendant={a}
                        nowMs={nowMs}
                        pending={pending}
                        onRevoke={() => revoke(a.id)}
                        onReassign={() => reassign(a)}
                      />
                    ))}
                  </div>
                )}

                {showSpent ? (
                  <div className="grid gap-3 border-t border-gray-100 pt-3 sm:grid-cols-2">
                    {spent.map((a) => (
                      <StaffCard
                        key={a.id}
                        attendant={a}
                        nowMs={nowMs}
                        pending={pending}
                        onRevoke={() => revoke(a.id)}
                        onReassign={() => reassign(a)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </Panel>
        </div>

        {/* Live floor */}
        <div className="space-y-5">
          <Panel title="Arrivals by door" icon={<DoorOpen className="h-3.5 w-3.5 text-[#7E5896]" />}>
            {doorRows.length === 0 ? (
              <EmptyState
                icon={<DoorOpen className="h-5 w-5" />}
                title="No doors in use yet"
                body="Each entrance appears here once staff are posted to it or a guest scans through."
              />
            ) : (
              <ul className="divide-y divide-gray-100">
                {doorRows.map((d) => {
                  const share = checkedIn > 0 ? Math.round((d.count / checkedIn) * 100) : 0
                  return (
                    <li key={d.doorLabel} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium text-gray-900">{d.doorLabel}</span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{d.count}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div className="h-full rounded-full bg-[#7E5896] transition-all" style={{ width: `${share}%` }} />
                        </div>
                        <span
                          className={cn(
                            'shrink-0 text-[11px] font-medium',
                            d.staffed ? 'text-[#3d6b1f]' : 'text-gray-400',
                          )}
                        >
                          {d.staffed ? 'Staffed' : 'No staff'}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title="Recent arrivals"
            icon={<Users className="h-3.5 w-3.5 text-[#7E5896]" />}
            action={
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'animate-pulse bg-[#7ec24a]' : 'bg-gray-300')} />
                {connected ? 'Live' : 'Last known'}
              </span>
            }
          >
            {feed.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="h-5 w-5" />}
                title="No guests have checked in yet"
                body="Scans from every entrance will appear here in real time, newest first."
              />
            ) : (
              <ul className="divide-y divide-gray-100">
                {feed.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0 truncate text-gray-900">{f.guestName}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
                      {f.duplicate ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          Duplicate
                        </span>
                      ) : null}
                      {f.doorLabel ?? 'Door'} · {formatTime(f.checkedInAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
