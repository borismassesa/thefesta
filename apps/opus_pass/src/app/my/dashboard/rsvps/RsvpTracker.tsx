'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  ClipboardCheck,
  Utensils,
  Search,
  Flag,
  Check,
  X,
  Clock,
  Mail,
  MessageCircle,
  MessageSquare,
  Link2,
  CornerUpLeft,
  Send,
  CheckCircle2,
  XCircle,
  Users,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'
import { Card, EmptyState } from '@/components/dashboard/primitives'
import { inputClass } from '@/components/dashboard/controls'
import { cn } from '@/lib/utils'
import { updateRsvp, approveReviewGuest, dismissReviewGuest } from '@/lib/dashboard/actions'
import { greetingNameOf, smsShareUrl, whatsappShareUrl } from '@/lib/dashboard/share'
import type { RsvpsDashboardCopy } from '@/lib/cms/dashboard-copy'
import type { DashboardSendStrings } from '@/lib/cms/ui-strings-fallback'
import type { SendGuestRow } from '@/lib/dashboard/queries'
import {
  RSVP_STATUS_LABELS,
  type GuestSource,
  type GuestWithInvitations,
  type LastSend,
  type RsvpStatus,
  type SendChannel,
  type WeddingEvent,
} from '@/lib/dashboard/types'

const STATUSES: RsvpStatus[] = ['attending', 'maybe', 'declined', 'pending']

type StatusFilter = 'all' | RsvpStatus | 'review'

interface Row {
  invitationId: string
  guestId: string
  guestName: string
  group: string | null
  eventId: string
  eventName: string
  status: RsvpStatus
  partySize: number
  meal: string | null
  dietary: string | null
  message: string | null
  respondedAt: string | null
  source: GuestSource
  lastSend: LastSend | null
}

const CHANNEL_LABELS: Record<SendChannel, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
  link: 'Link',
}

const CHANNEL_ICON: Record<SendChannel, LucideIcon> = {
  whatsapp: MessageCircle,
  sms: MessageSquare,
  email: Mail,
  link: Link2,
}

/** Status-colored dropdown styling — the select doubles as the status display. */
const STATUS_SELECT_COLOR: Record<RsvpStatus, string> = {
  attending: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  maybe: 'border-amber-300 bg-amber-50 text-amber-700',
  declined: 'border-rose-300 bg-rose-50 text-rose-700',
  pending: 'border-black/15 bg-white text-[#1A1A1A]/65',
}

/** Compact "2d ago" style relative time. Client-only (uses the wall clock). */
function relTime(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'just now'
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d}d ago`
  const w = Math.floor(d / 7)
  if (d < 60) return `${w}w ago`
  return `${Math.floor(d / 30)}mo ago`
}

export default function RsvpTracker({
  guests,
  events,
  eventFilter,
  lastSend,
  copy,
  sendRows,
  sendStrings,
}: {
  guests: GuestWithInvitations[]
  events: WeddingEvent[]
  /** Event id chosen in the tab row's EventSwitcher, or 'all' for the combined view. */
  eventFilter: string
  lastSend: Record<string, LastSend>
  copy: RsvpsDashboardCopy
  sendRows?: SendGuestRow[]
  sendStrings?: DashboardSendStrings
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const tableRef = useRef<HTMLDivElement>(null)
  const sendRowByGuestId = useMemo(
    () => new Map((sendRows ?? []).map((row) => [row.id, row])),
    [sendRows],
  )
  const showPipelineColumns = Boolean(sendRows?.length && sendStrings)

  const eventName = (id: string) => events.find((e) => e.id === id)?.name ?? 'Event'

  // Self-RSVPs from the public link sit in a review bucket until the host
  // approves them, so they're tracked separately and never counted in totals.
  const reviewGuests = useMemo(
    () => guests.filter((g) => g.review_status === 'unconfirmed'),
    [guests],
  )
  const confirmedGuests = useMemo(
    () => guests.filter((g) => g.review_status !== 'unconfirmed'),
    [guests],
  )

  // One row per confirmed invitation (a guest invited to N events → N rows).
  const confirmedRows: Row[] = useMemo(
    () =>
      confirmedGuests.flatMap((g) =>
        g.invitations.map((inv) => ({
          invitationId: inv.id,
          guestId: g.id,
          guestName: g.full_name,
          group: g.group_tag,
          eventId: inv.event_id,
          eventName: eventName(inv.event_id),
          status: inv.rsvp_status,
          partySize: inv.party_size,
          meal: inv.meal_choice,
          dietary: inv.dietary_notes,
          message: inv.guest_message,
          respondedAt: inv.responded_at,
          source: g.source,
          lastSend: lastSend[g.id] ?? null,
        })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirmedGuests, events, lastSend],
  )

  // One row per review guest (their self-RSVP is identical across events, so we
  // collapse to a single representative row — attending if they're coming).
  const reviewRows: Row[] = useMemo(
    () =>
      reviewGuests.map((g) => {
        const inv =
          g.invitations.find((i) => i.rsvp_status === 'attending') ?? g.invitations[0]
        return {
          invitationId: inv?.id ?? g.id,
          guestId: g.id,
          guestName: g.full_name,
          group: g.group_tag,
          eventId: inv?.event_id ?? 'all',
          eventName: inv ? eventName(inv.event_id) : '',
          status: inv?.rsvp_status ?? 'pending',
          partySize: inv?.party_size ?? 1,
          meal: inv?.meal_choice ?? null,
          dietary: inv?.dietary_notes ?? null,
          message: inv?.guest_message ?? null,
          respondedAt: inv?.responded_at ?? g.created_at,
          source: g.source,
          lastSend: null,
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviewGuests, events],
  )

  // Confirmed rows scoped to the chosen event — the basis for every stat.
  const scoped = useMemo(
    () => (eventFilter === 'all' ? confirmedRows : confirmedRows.filter((r) => r.eventId === eventFilter)),
    [confirmedRows, eventFilter],
  )

  const stats = useMemo(() => {
    const attendingRows = scoped.filter((r) => r.status === 'attending')
    const attendingGuests = new Set(attendingRows.map((r) => r.guestId)).size
    const headcount = attendingRows.reduce((sum, r) => sum + (r.partySize || 1), 0)
    const plusOnes = Math.max(0, headcount - attendingGuests)
    const declined = scoped.filter((r) => r.status === 'declined').length
    const maybe = scoped.filter((r) => r.status === 'maybe').length
    const pending = scoped.filter((r) => r.status === 'pending').length
    const replied = attendingRows.length + declined + maybe
    const invited = scoped.length
    return {
      attendingGuests,
      headcount,
      plusOnes,
      declined,
      maybe,
      pending,
      awaiting: pending + maybe,
      replied,
      invited,
      responseRate: invited === 0 ? 0 : Math.round((replied / invited) * 100),
    }
  }, [scoped])

  // Meal preferences — headcount per choice, among attending guests.
  const meals = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of scoped) {
      if (r.status !== 'attending' || !r.meal) continue
      map.set(r.meal, (map.get(r.meal) ?? 0) + (r.partySize || 1))
    }
    return [...map.entries()].map(([choice, count]) => ({ choice, count })).sort((a, b) => b.count - a.count)
  }, [scoped])

  // Dietary notes — flagged on RSVPs. Free text, so we group by exact wording.
  const dietary = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of scoped) {
      const note = r.dietary?.trim()
      if (!note) continue
      map.set(note, (map.get(note) ?? 0) + 1)
    }
    return [...map.entries()].map(([note, count]) => ({ note, count })).sort((a, b) => b.count - a.count)
  }, [scoped])

  const counts = useMemo(
    () => ({
      all: scoped.length + reviewRows.length,
      attending: scoped.filter((r) => r.status === 'attending').length,
      declined: stats.declined,
      awaiting: stats.awaiting,
      review: reviewRows.length,
    }),
    [scoped, reviewRows.length, stats],
  )

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (r: Row) =>
      !q ||
      (showPipelineColumns
        ? `${r.guestName} ${r.group ?? ''} ${r.eventName}`.toLowerCase()
        : `${r.guestName} ${r.group ?? ''} ${r.meal ?? ''} ${r.dietary ?? ''}`.toLowerCase()
      ).includes(q)

    if (statusFilter === 'review') return reviewRows.filter(matches)

    const base = scoped.filter((r) => {
      if (statusFilter === 'all') return true
      if (statusFilter === 'pending') return r.status === 'pending' || r.status === 'maybe'
      return r.status === statusFilter
    })
    const list = base.filter(matches)
    // Surface self-RSVPs needing review at the top of the "all" view.
    return statusFilter === 'all' ? [...reviewRows.filter(matches), ...list] : list
  }, [scoped, reviewRows, statusFilter, query, showPipelineColumns])

  const hasRows = confirmedRows.length > 0 || reviewRows.length > 0

  function changeStatus(invitationId: string, status: RsvpStatus) {
    startTransition(async () => {
      try {
        await updateRsvp(invitationId, { rsvp_status: status })
        toast.success(copy.toast_updated)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update')
      }
    })
  }

  function reviewAction(guestId: string, fn: (id: string) => Promise<void>, ok: string) {
    setPendingId(guestId)
    startTransition(async () => {
      try {
        await fn(guestId)
        toast.success(ok)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setPendingId(null)
      }
    })
  }

  function goToReview() {
    setStatusFilter('review')
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function followupMessage(row: Row, url: string): string {
    return `Hi ${greetingNameOf(row.guestName)}, please answer the follow-up questions for ${row.eventName}: ${url}`
  }

  function followupLink(url: string): string {
    return `${url}${url.includes('?') ? '&' : '?'}followups=1`
  }

  function shareFollowup(row: Row, channel: 'whatsapp' | 'sms' | 'copy') {
    const sendRow = sendRowByGuestId.get(row.guestId)
    if (!sendRow?.rsvpUrl) {
      toast.error('No personal link found for this guest')
      return
    }
    const url = followupLink(sendRow.rsvpUrl)
    if (channel === 'copy') {
      navigator.clipboard?.writeText(url).then(
        () => toast.success('Follow-up link copied'),
        () => toast.error('Could not copy link'),
      )
      return
    }
    const guest = {
      full_name: row.guestName,
      phone: sendRow.phone,
      whatsapp_phone: sendRow.whatsappPhone,
    }
    const message = followupMessage(row, url)
    const shareUrl = channel === 'whatsapp' ? whatsappShareUrl(guest, message) : smsShareUrl(guest, message)
    window.open(shareUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-6">
      {!hasRows ? (
        <EmptyState
          icon={<ClipboardCheck className="h-7 w-7" />}
          title={copy.empty_title}
          description={copy.empty_description}
        />
      ) : (
        <>
          {/* Self-RSVP review banner */}
          {reviewRows.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#C9A0DC]/60 bg-[#F0DFF6]/70 px-4 py-3.5 sm:px-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#7E5896]">
                <Flag className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#1A1A1A]">
                  {reviewRows.length} public response{reviewRows.length === 1 ? '' : 's'} need review
                </p>
                <p className="text-xs text-[#1A1A1A]/60">
                  Replies from your public link — confirm each one before it counts toward your headcount.
                </p>
              </div>
              <button
                type="button"
                onClick={goToReview}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#7E5896] px-4 py-2 text-xs font-semibold text-white hover:bg-[#6c4a83]"
              >
                Review now
              </button>
            </div>
          ) : null}

          {/* Stat cards */}
          <div
            className={
              showPipelineColumns
                ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(150px,0.65fr)_minmax(150px,0.65fr)_minmax(150px,0.65fr)_minmax(360px,1.55fr)]'
                : 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'
            }
          >
            <StatTile
              icon={CheckCircle2}
              iconColor="text-emerald-500"
              label="Attending"
              value={stats.attendingGuests}
              hint={stats.plusOnes > 0 ? `+${stats.plusOnes} plus-one${stats.plusOnes === 1 ? '' : 's'}` : 'guests confirmed'}
            />
            <StatTile
              icon={XCircle}
              iconColor="text-rose-500"
              label="Declined"
              value={stats.declined}
              hint={stats.replied > 0 ? `${Math.round((stats.declined / stats.replied) * 100)}% of replies` : 'No replies yet'}
            />
            <StatTile
              icon={Clock}
              iconColor="text-neutral-400"
              label="Awaiting reply"
              value={stats.awaiting}
              hint={stats.maybe > 0 ? `${stats.maybe} said maybe` : 'Yet to respond'}
            />
            {showPipelineColumns ? (
              <ResponseSummaryCard
                attending={counts.attending}
                declined={stats.declined}
                awaiting={stats.awaiting}
                invited={stats.invited}
                replied={stats.replied}
                responseRate={stats.responseRate}
              />
            ) : null}
            {!showPipelineColumns ? (
              <StatTile
                icon={Users}
                iconColor="text-[#C9A0DC]"
                label="Total headcount"
                value={stats.headcount}
                hint="Seats to plan for catering"
                accent
              />
            ) : null}
          </div>

          {/* Response progress. The Send Invites pipeline only shows attendance replies; meal/diet details live in Follow-up Questions. */}
          {!showPipelineColumns ? <div className="grid gap-3 lg:grid-cols-2">
            {/* Response rate — same donut as the per-event cards, for consistency */}
            <ResponseSummaryCard
              attending={counts.attending}
              declined={stats.declined}
              awaiting={stats.awaiting}
              invited={stats.invited}
              replied={stats.replied}
              responseRate={stats.responseRate}
            />

            {/* Meal preferences */}
            {!showPipelineColumns ? <Card className="p-5">
              <h2 className="text-base font-semibold text-[#1A1A1A]">Meal choices</h2>
              <p className="mb-4 mt-0.5 text-xs text-[#1A1A1A]/55">
                From guests who are attending — share this with your caterer.
              </p>
              {meals.length === 0 ? (
                <p className="text-sm text-[#1A1A1A]/45">No meal choices collected yet.</p>
              ) : (
                <div className="space-y-3">
                  {meals.map((m) => (
                    <div key={m.choice} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-sm font-medium text-[#1A1A1A]" title={m.choice}>
                        {m.choice}
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
                        <span
                          className="block h-full rounded-full bg-[#C9A0DC]"
                          style={{ width: `${pct(m.count, meals[0].count)}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-[#1A1A1A]/65">
                        {m.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card> : null}
          </div> : null}

          {/* Dietary notes — full width below, only when guests have flagged any */}
          {!showPipelineColumns && dietary.length > 0 ? (
            <Card className="p-5">
              <h2 className="text-base font-semibold text-[#1A1A1A]">Dietary notes</h2>
              <p className="mb-4 mt-0.5 text-xs text-[#1A1A1A]/55">Flagged by guests in their response.</p>
              <div className="flex flex-wrap gap-2">
                {dietary.map((d) => (
                  <span
                    key={d.note}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#9FE870]/35 px-3 py-1.5 text-xs font-medium text-[#3f6b1f]"
                  >
                    {d.note} <b className="text-[#2f5417]">{d.count}</b>
                  </span>
                ))}
              </div>
            </Card>
          ) : null}

          {/* Filters + search */}
          <div ref={tableRef} className="flex flex-wrap items-center gap-2">
            <FilterChip label="All" count={showPipelineColumns ? undefined : counts.all} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
            <FilterChip
              label={RSVP_STATUS_LABELS.attending}
              count={showPipelineColumns ? undefined : counts.attending}
              active={statusFilter === 'attending'}
              onClick={() => setStatusFilter('attending')}
            />
            <FilterChip
              label={RSVP_STATUS_LABELS.declined}
              count={showPipelineColumns ? undefined : counts.declined}
              active={statusFilter === 'declined'}
              onClick={() => setStatusFilter('declined')}
            />
            <FilterChip
              label="Awaiting"
              count={showPipelineColumns ? undefined : counts.awaiting}
              active={statusFilter === 'pending'}
              onClick={() => setStatusFilter('pending')}
            />
            {counts.review > 0 ? (
              <FilterChip
                label="Needs review"
                count={counts.review}
                active={statusFilter === 'review'}
                onClick={() => setStatusFilter('review')}
                amber
              />
            ) : null}
            <div className="relative ml-auto min-w-[280px] flex-1 sm:min-w-[340px] sm:flex-none lg:min-w-[420px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/35" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={copy.search_placeholder}
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>

          {/* Live reply table */}
          {visibleRows.length === 0 ? (
            <EmptyState title={copy.no_match_title} />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-black/[0.06] text-xs uppercase tracking-wide text-[#1A1A1A]/45">
                    <th className="px-4 py-3 font-medium">{copy.th_guest}</th>
                    <th className="px-4 py-3 font-medium">Response</th>
                    <th className="px-4 py-3 font-medium">{copy.th_party}</th>
                    {showPipelineColumns ? <th className="px-4 py-3 font-medium">{sendStrings!.th_card_type}</th> : null}
                    {showPipelineColumns ? <th className="px-4 py-3 font-medium">{sendStrings!.entrance_tag}</th> : null}
                    {!showPipelineColumns ? <th className="px-4 py-3 font-medium">{copy.th_meal}</th> : null}
                    {!showPipelineColumns ? <th className="px-4 py-3 font-medium">Dietary</th> : null}
                    <th className="px-4 py-3 font-medium">Replied via</th>
                    {showPipelineColumns ? <th className="px-4 py-3 font-medium">Follow-up link</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {visibleRows.map((r) => {
                    const isReview = reviewRows.some((rr) => rr.guestId === r.guestId)
                    const sendRow = sendRowByGuestId.get(r.guestId)
                    return (
                      <tr key={`${r.guestId}-${r.invitationId}`} className={cn('align-top', isReview && 'bg-[#FFFBEB]')}>
                        <td className="px-4 py-3.5">
                          <p className="flex items-center gap-1.5 font-medium text-[#1A1A1A]">
                            {r.guestName}
                            {isReview ? <Flag className="h-3 w-3 text-[#8a6d1a]" /> : null}
                          </p>
                          {isReview ? (
                            <p className="text-xs text-[#8a6d1a]">Public response from invite link</p>
                          ) : r.group ? (
                            <p className="text-xs text-[#1A1A1A]/45">{r.group}</p>
                          ) : null}
                          {!isReview && eventFilter === 'all' ? (
                            <p className="text-xs text-[#1A1A1A]/40">{r.eventName}</p>
                          ) : null}
                          {r.message ? (
                            <p className="mt-1 max-w-[220px] text-xs italic text-[#1A1A1A]/50">“{r.message}”</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5">
                          {isReview ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#FFFBEB] px-2.5 py-0.5 text-xs font-medium text-[#8a6d1a] ring-1 ring-inset ring-[#FBE8B0]">
                              Needs review
                            </span>
                          ) : (
                            <div className="relative inline-block">
                              <select
                                value={r.status}
                                disabled={pending}
                                onChange={(e) => changeStatus(r.invitationId, e.target.value as RsvpStatus)}
                                className={cn(
                                  'appearance-none rounded-full border py-1.5 pl-3 pr-7 text-xs font-semibold outline-none transition-colors focus:ring-2 focus:ring-[#C9A0DC]/30 disabled:opacity-60',
                                  STATUS_SELECT_COLOR[r.status],
                                )}
                              >
                                {STATUSES.map((s) => (
                                  <option key={s} value={s} className="bg-white font-medium text-[#1A1A1A]">
                                    {s === 'pending' ? 'Awaiting' : RSVP_STATUS_LABELS[s]}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-70" />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-[#1A1A1A]/70">
                          {r.status === 'attending' ? r.partySize : '—'}
                        </td>
                        {showPipelineColumns ? (
                          <td className="px-4 py-3.5">
                            {sendRow ? (
                              <span className="inline-flex rounded-full bg-[#F6EEFB] px-2.5 py-1 text-xs font-semibold text-[#5d3a78]">
                                {sendRow.assignedPartySize >= 2 ? sendStrings!.party_double : sendStrings!.party_single}
                              </span>
                            ) : (
                              <span className="text-[#1A1A1A]/35">—</span>
                            )}
                          </td>
                        ) : null}
                        {showPipelineColumns ? (
                          <td className="px-4 py-3.5">
                            {sendRow ? (
                              <span
                                className={cn(
                                  'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                                  r.status === 'attending'
                                    ? sendRow.entrancePassSent
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-[#F6EEFB] text-[#5d3a78]'
                                    : 'bg-black/[0.04] text-[#1A1A1A]/45',
                                )}
                              >
                                {r.status === 'attending'
                                  ? sendRow.entrancePassSent
                                    ? sendStrings!.entrance_status_sent
                                    : sendStrings!.entrance_status_eligible
                                  : sendStrings!.entrance_status_noteligible}
                              </span>
                            ) : (
                              <span className="text-[#1A1A1A]/35">—</span>
                            )}
                          </td>
                        ) : null}
                        {!showPipelineColumns ? <td className="px-4 py-3.5 text-[#1A1A1A]/70">
                          {r.meal ? (
                            <span className="inline-flex items-center gap-1">
                              <Utensils className="h-3.5 w-3.5 text-[#1A1A1A]/35" /> {r.meal}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td> : null}
                        {!showPipelineColumns ? <td className="px-4 py-3.5 text-[#1A1A1A]/70">
                          {r.dietary ? <span className="text-xs">{r.dietary}</span> : '—'}
                        </td> : null}
                        <td className="px-4 py-3.5">
                          {isReview ? (
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                disabled={pendingId === r.guestId}
                                onClick={() => reviewAction(r.guestId, approveReviewGuest, 'Guest confirmed')}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" /> Confirm
                              </button>
                              <button
                                type="button"
                                disabled={pendingId === r.guestId}
                                onClick={() => reviewAction(r.guestId, dismissReviewGuest, 'Public response dismissed')}
                                className="inline-flex items-center gap-1 rounded-lg bg-black/[0.04] px-2.5 py-1.5 text-xs font-semibold text-[#1A1A1A]/60 hover:bg-black/[0.07] disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" /> Dismiss
                              </button>
                            </div>
                          ) : (
                            <ReplyVia row={r} />
                          )}
                        </td>
                        {showPipelineColumns ? (
                          <td className="px-4 py-3.5">
                            {isReview ? (
                              <span className="text-xs text-[#1A1A1A]/35">Review first</span>
                            ) : r.status === 'pending' ? (
                              <span className="text-xs text-[#1A1A1A]/35">Waiting for reply</span>
                            ) : sendRow ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => shareFollowup(r, sendRow.whatsappPhone ? 'whatsapp' : 'sms')}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#1A1A1A] px-3 text-xs font-semibold text-white hover:bg-black"
                                  title={sendRow.whatsappPhone ? 'Send follow-up link on WhatsApp' : 'Send follow-up link by SMS'}
                                >
                                  <Send className="h-3.5 w-3.5" />
                                  Send
                                </button>
                                <button
                                  type="button"
                                  onClick={() => shareFollowup(r, 'copy')}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.12] text-[#1A1A1A]/65 hover:bg-black/[0.04]"
                                  title="Copy follow-up link"
                                >
                                  <Link2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-[#1A1A1A]/35">No personal link</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 100)
}

function StatTile({
  icon: Icon,
  iconColor,
  label,
  value,
  hint,
  accent,
}: {
  icon: LucideIcon
  iconColor: string
  label: string
  value: number
  hint: string
  accent?: boolean
}) {
  return (
    <Card className={cn('p-4', accent && 'bg-gradient-to-br from-[#F0DFF6]/70 to-white')}>
      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-4 w-4', iconColor)} />
        <span className="text-[11px] font-medium uppercase tracking-wide text-[#1A1A1A]/55">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-[#1A1A1A]">{value}</p>
      <p className="mt-1.5 text-xs text-[#1A1A1A]/50">{hint}</p>
    </Card>
  )
}

function ResponseSummaryCard({
  attending,
  declined,
  awaiting,
  invited,
  replied,
  responseRate,
}: {
  attending: number
  declined: number
  awaiting: number
  invited: number
  replied: number
  responseRate: number
}) {
  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-5">
      <ResponseDonut
        attending={attending}
        declined={declined}
        awaiting={awaiting}
        invited={invited}
        rate={responseRate}
      />
      <div className="min-w-[150px] flex-1 space-y-3">
        <p className="text-sm text-[#1A1A1A]/60">
          <b className="text-[#1A1A1A]">{replied}</b> of {invited} invited have replied ·{' '}
          <b className="text-[#1A1A1A]">{responseRate}%</b> response rate
        </p>
        <ul className="space-y-1.5 text-sm">
          <DonutLegend color="#10b981" label="Attending" value={attending} />
          <DonutLegend color="#f43f5e" label="Declined" value={declined} />
          <DonutLegend color="#C9A0DC" label="Awaiting" value={awaiting} />
        </ul>
      </div>
    </Card>
  )
}

/** Response-rate ring — mirrors the per-event AttendanceDonut for consistency. */
function ResponseDonut({
  attending,
  declined,
  awaiting,
  invited,
  rate,
}: {
  attending: number
  declined: number
  awaiting: number
  invited: number
  rate: number
}) {
  const r = 52
  const c = 2 * Math.PI * r
  const seg = (n: number) => (invited > 0 ? (n / invited) * c : 0)
  const segs = [
    { len: seg(attending), color: '#10b981' },
    { len: seg(declined), color: '#f43f5e' },
    { len: seg(awaiting), color: '#C9A0DC' },
  ]
  let offset = 0
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 128 128" className="h-32 w-32 -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="#e9e4ee" strokeWidth="12" />
        {invited > 0 &&
          segs.map((s, i) => {
            const el = (
              <circle
                key={i}
                cx="64"
                cy="64"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="12"
                strokeDasharray={`${s.len} ${c - s.len}`}
                strokeDashoffset={-offset}
              />
            )
            offset += s.len
            return el
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-[#1A1A1A]">{rate}%</span>
        <span className="text-[10px] uppercase tracking-wide text-[#1A1A1A]/50">replied</span>
      </div>
    </div>
  )
}

function DonutLegend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <li className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[#1A1A1A]/60">{label}</span>
      <span className="ml-auto font-semibold tabular-nums text-[#1A1A1A]">{value}</span>
    </li>
  )
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  amber,
}: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
  amber?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
        active
          ? amber
            ? 'bg-[#FFFBEB] text-[#8a6d1a] ring-1 ring-inset ring-[#FBE8B0]'
            : 'bg-[#F0DFF6] text-[#5d3a78]'
          : 'text-[#1A1A1A]/55 hover:bg-black/[0.04]',
      )}
    >
      {label}
      {typeof count === 'number' ? (
        <span className={cn('tabular-nums', active ? 'opacity-100' : 'text-[#1A1A1A]/35')}>{count}</span>
      ) : null}
    </button>
  )
}

function ReplyVia({ row }: { row: Row }) {
  if (row.source === 'public') {
    return <ChannelLines icon={Link2} label="Public link" time={relTime(row.respondedAt)} />
  }
  const channel = row.lastSend?.channel
  if (row.respondedAt) {
    return (
      <ChannelLines
        icon={channel ? CHANNEL_ICON[channel] : CornerUpLeft}
        label={channel ? CHANNEL_LABELS[channel] : 'Replied'}
        time={relTime(row.respondedAt)}
      />
    )
  }
  if (row.lastSend) {
    return <ChannelLines icon={Send} label="Invite sent" time={relTime(row.lastSend.at)} />
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[#1A1A1A]/40">
      <Clock className="h-3.5 w-3.5" /> Not sent yet
    </span>
  )
}

/** Two stacked rows, each with an icon: the channel/status, then the time. */
function ChannelLines({ icon: Icon, label, time }: { icon: LucideIcon; label: string; time: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1A1A1A]/65">
        <Icon className="h-3.5 w-3.5 text-[#1A1A1A]/45" />
        {label}
      </span>
      {time ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-[#1A1A1A]/40">
          <Clock className="h-3.5 w-3.5" />
          {time}
        </span>
      ) : null}
    </div>
  )
}
