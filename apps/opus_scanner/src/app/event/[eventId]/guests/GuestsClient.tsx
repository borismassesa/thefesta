'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, CloudOff, Loader2, Search, Users, X } from 'lucide-react'
import { CountSegments, GroupChip } from '@/components/scanner/CountSegments'
import { GroupFilterSheet } from '@/components/scanner/GroupFilterSheet'
import { GuestAvatar } from '@/components/scanner/GuestAvatar'
import { GuestConfirmCard } from '@/components/scanner/GuestConfirmCard'
import { PartyBadge } from '@/components/scanner/PartyBadge'
import { SessionGate } from '@/components/scanner/SessionGate'
import { submitScan, validateScannerSession } from '@/lib/api/checkin'
import { withGuestDetail } from '@/lib/api/guestDetail'
import { getErrorMessage } from '@/lib/errors'
import { arrivedHeads, clampArrived, countLabel, groupRoster, UNGROUPED_LABEL } from '@/lib/scannerRoster'
import { useScannerSession } from '@/hooks/useScannerSession'
import type { RosterEntry } from '@/types/checkin'

/** Brand green, matching the live/active pills used elsewhere in the product. */
const LIVE_GREEN = '#9FE870'

/** Used only when the server rejects an admission without saying why. */
const FALLBACK_ADMIT_ERROR: Record<'duplicate' | 'invalid' | 'error', string> = {
  duplicate: 'This guest is already checked in.',
  invalid: 'This guest can no longer be admitted to this event.',
  error: 'Check-in failed. Nothing was recorded — try again.',
}

type Filter = 'all' | 'pending' | 'arrived'

function isFilter(value: unknown): value is Filter {
  return value === 'all' || value === 'pending' || value === 'arrived'
}

/**
 * Manual check-in fallback: a guest whose phone is dead, whose pass never
 * arrived, or whose QR won't scan in bad light still has to get through the
 * door. Every admission from here is recorded with a reason so the couple's
 * audit trail distinguishes it from a real scan.
 *
 * Organised the way guests actually turn up — in groups, a family or a bus at
 * a time — so the attendant narrows to sixty names before searching rather
 * than scrolling four hundred.
 *
 * Ported from apps/opus_pass_mobile/app/scanner/[eventId]/guests.tsx.
 */
export default function GuestsClient({ eventId }: { eventId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { session } = useScannerSession()
  const queryClient = useQueryClient()

  const [query, setQuery] = useState('')
  // Seeded from the count the attendant tapped on the scan screen, so
  // "8 still to arrive" lands on exactly those eight.
  const [filter, setFilter] = useState<Filter>(() => {
    const param = searchParams.get('filter')
    return isFilter(param) ? param : 'all'
  })
  const [groupTag, setGroupTag] = useState<string | null>(null)
  const [groupSheetOpen, setGroupSheetOpen] = useState(false)
  const [confirming, setConfirming] = useState<RosterEntry | null>(null)
  const [phonePending, setPhonePending] = useState(false)
  /** Which guest-detail lookup is the current one, so a superseded reply
   *  cannot speak for the guest now on screen. */
  const detailRequest = useRef(0)
  const [admitting, setAdmitting] = useState(false)
  const [admitError, setAdmitError] = useState<string | null>(null)

  const sessionReady = session !== null && session.eventId === eventId

  const rosterQuery = useQuery({
    queryKey: ['scanner', 'roster', eventId],
    enabled: sessionReady,
    queryFn: async () => {
      const validated = await validateScannerSession(session!.eventId, session!.accessToken)
      if (!validated.ok) throw new Error(validated.error)
      return validated.roster
    },
  })

  const roster = useMemo(() => rosterQuery.data ?? [], [rosterQuery.data])
  const groups = useMemo(() => groupRoster(roster), [roster])

  /** Counts describe the group in view, not the whole event — otherwise the
   *  segment bar contradicts the list under it. */
  const inGroup = useMemo(
    () => (groupTag === null ? roster : roster.filter((g) => (g.groupTag?.trim() || UNGROUPED_LABEL) === groupTag)),
    [roster, groupTag],
  )
  const arrivedCount = inGroup.filter((g) => g.checkedInAt).length

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return inGroup
      .filter((g) => (needle ? g.fullName.toLowerCase().includes(needle) : true))
      .filter((g) => (filter === 'arrived' ? g.checkedInAt : filter === 'pending' ? !g.checkedInAt : true))
  }, [inGroup, query, filter])

  /** Sections mirror the couple's own groups, biggest first, names A–Z inside. */
  const sections = useMemo(
    () =>
      groupRoster(visible).map((group) => ({
        title: group.tag,
        // Under the arrived filter the heads figure has to be who actually
        // walked in, not who was expected — otherwise a section of three
        // part-arrived parties reads "3 guests · 9 people" with 5 in the room.
        subtitle: countLabel(group.guests.length, filter === 'arrived' ? arrivedHeads(group.guests) : group.heads),
        data: [...group.guests].sort((a, b) => a.fullName.localeCompare(b.fullName)),
      })),
    [visible, filter],
  )

  /**
   * Show the confirm card, then fill in the phone number.
   *
   * The card opens immediately on the roster row rather than waiting: the
   * attendant is identifying somebody standing in front of them, and holding
   * the whole card back for a contact detail would put a network round trip
   * in front of every admission. The number arrives a moment later, or not at
   * all, and neither blocks admitting.
   */
  const openConfirm = async (guest: RosterEntry) => {
    setConfirming(guest)
    if (!session) return
    // Only the newest pick owns the card. Two taps in a row leave two lookups
    // in flight, and whichever returns first must not speak for the other.
    const request = (detailRequest.current += 1)
    setPhonePending(true)
    try {
      const detailed = await withGuestDetail(
        { eventId: session.eventId, accessToken: session.accessToken },
        guest,
      )
      if (detailRequest.current !== request) return
      setConfirming((current) => (current?.invitationId === detailed.invitationId ? detailed : current))
    } finally {
      if (detailRequest.current === request) setPhonePending(false)
    }
  }

  const admit = async (guest: RosterEntry, arrived: number) => {
    if (!session || admitting) return
    setAdmitting(true)
    setAdmitError(null)
    // Same 1..party_size range the server enforces. Left undefined when the
    // full party arrived so the server's authoritative party_size fills the
    // default — the roster copy here could be stale.
    const confirmed = clampArrived(arrived, guest.partySize)
    try {
      // submitScan resolves rather than throws for every domain outcome —
      // a rejected pass, an already-used one, a 429, an expired session. So
      // the status has to be read: closing the card on all of them is how a
      // guest walks in against a check-in that was never recorded.
      const result = await submitScan({
        eventId: session.eventId,
        accessToken: session.accessToken,
        invitationId: guest.invitationId,
        // Required by the API — this is what marks the admission as
        // scan-less in the audit trail.
        manualReason: 'No scannable pass',
        // Deliberate per-tap admission, so a new id every time. It gives this
        // admission its own row in the server-side scan audit trail.
        requestId: crypto.randomUUID(),
        checkedInPartySize: confirmed === guest.partySize ? undefined : confirmed,
        doorLabel: session.doorLabel,
        attendantName: session.attendantName ?? undefined,
      })
      // The roster is refetched either way: on a duplicate it is the server
      // that knows this guest is already in, and the row should say so.
      await queryClient.invalidateQueries({ queryKey: ['scanner', 'roster', eventId] })
      if (result.status === 'success') {
        setConfirming(null)
        return
      }
      setAdmitError(result.message ?? FALLBACK_ADMIT_ERROR[result.status])
    } catch (err) {
      setAdmitError(getErrorMessage(err, FALLBACK_ADMIT_ERROR.error))
    } finally {
      setAdmitting(false)
    }
  }

  return (
    <SessionGate eventId={eventId}>
      {(gateSession) => (
        <main className="flex min-h-dvh flex-col bg-[#F7F4FA]">
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
            <div className="flex items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),0.5rem)]">
              <button
                type="button"
                aria-label="Back to the camera"
                onClick={() => router.back()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#1A1A1A] shadow-sm ring-1 ring-black/8 transition-colors hover:bg-gray-50"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#1A1A1A]">Guest list</p>
                <p className="truncate text-xs text-[#1A1A1A]/60">{groupTag ?? gateSession.eventName ?? 'This event'}</p>
              </div>
            </div>

            <div className="px-5 pt-3">
              {/* Counts first, search second: the attendant usually arrives
                  here by tapping a number and wants to see that number's
                  list, not to type. */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <CountSegments
                    activeKey={filter}
                    onSelect={(key) => setFilter(key as Filter)}
                    segments={[
                      {
                        key: 'pending',
                        icon: 'time',
                        label: 'Still to arrive',
                        caption: 'waiting',
                        count: inGroup.length - arrivedCount,
                      },
                      { key: 'arrived', icon: 'check', label: 'Checked in', caption: 'in', count: arrivedCount },
                      { key: 'all', icon: 'people', label: 'On the list', caption: 'all', count: inGroup.length },
                    ]}
                  />
                </div>
                {groups.length > 1 ? <GroupChip activeTag={groupTag} onPress={() => setGroupSheetOpen(true)} /> : null}
              </div>

              <div className="mt-3 flex items-center rounded-full border border-black/10 bg-white px-4 py-2.5 transition-colors focus-within:border-[#C9A0DC] focus-within:ring-2 focus-within:ring-[#C9A0DC]/30">
                <Search size={16} className="shrink-0 text-[#1A1A1A]/50" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name"
                  autoCorrect="off"
                  autoCapitalize="words"
                  enterKeyHint="search"
                  className="ml-2 flex-1 bg-transparent text-sm text-[#1A1A1A] outline-none placeholder:text-[#1A1A1A]/40"
                />
                {query ? (
                  <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                    <X size={17} className="text-[#1A1A1A]/50" />
                  </button>
                ) : null}
              </div>
            </div>

            {rosterQuery.isPending ? (
              <div className="mt-16 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-[#8e57b3]" />
              </div>
            ) : rosterQuery.isError ? (
              <div className="mt-16 flex flex-col items-center px-10 text-center">
                <CloudOff size={30} className="text-[#B3261E]" />
                <p className="mt-3 text-sm text-[#B3261E]">Couldn&apos;t load the guest list.</p>
                <button
                  type="button"
                  onClick={() => void rosterQuery.refetch()}
                  className="mt-4 rounded-full border border-black/12 px-5 py-2.5 text-xs font-bold text-[#1A1A1A]"
                >
                  Try again
                </button>
              </div>
            ) : sections.length === 0 ? (
              <div className="mt-16 flex flex-col items-center px-10 text-center">
                {query ? (
                  <Search size={30} className="text-[#1A1A1A]/40" />
                ) : (
                  <Users size={30} className="text-[#1A1A1A]/40" />
                )}
                <p className="mt-3 text-sm text-[#1A1A1A]/60">
                  {query
                    ? 'No guests match that search.'
                    : filter === 'pending'
                      ? 'Everyone here has arrived.'
                      : filter === 'arrived'
                        ? 'Nobody from this list has been checked in yet.'
                        : 'No guests on this list yet.'}
                </p>
              </div>
            ) : (
              <div className="px-5 pt-4 pb-16">
                {sections.map((section) => (
                  <section key={section.title}>
                    <div className="mt-3 mb-2 flex items-baseline justify-between">
                      <h2 className="min-w-0 truncate text-sm font-bold text-[#1A1A1A]">{section.title}</h2>
                      <span className="ml-3 shrink-0 text-xs text-[#1A1A1A]/60">{section.subtitle}</span>
                    </div>
                    {section.data.map((item) => {
                      const arrived = Boolean(item.checkedInAt)
                      return (
                        <button
                          key={item.invitationId}
                          type="button"
                          aria-label={`${item.fullName}, ${arrived ? 'checked in' : 'not yet arrived'}`}
                          onClick={() => {
                            setAdmitError(null)
                            void openConfirm(item)
                          }}
                          className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-black/8 bg-white p-4 text-left transition-colors hover:border-[#C9A0DC]/60"
                        >
                          <GuestAvatar fullName={item.fullName} colorKey={item.groupTag} />

                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-bold text-[#1A1A1A]">{item.fullName}</span>
                              {item.isVip ? (
                                <span
                                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-[#1A1A1A] uppercase"
                                  style={{ backgroundColor: LIVE_GREEN }}
                                >
                                  VIP
                                </span>
                              ) : null}
                            </span>
                            {/* The badge names the ticket type, so the subtitle
                                only carries what the badge can't: arrival
                                detail or the printed code for the fallback. */}
                            {arrived || item.entryCode ? (
                              <span className="mt-0.5 block truncate text-xs text-[#1A1A1A]/60">
                                {arrived
                                  ? `Arrived, ${item.checkedInPartySize ?? item.partySize} of ${item.partySize}`
                                  : item.entryCode}
                              </span>
                            ) : null}
                          </span>

                          {arrived ? (
                            <CheckCircle2 size={24} className="shrink-0 text-[#1B7F4C]" />
                          ) : (
                            <PartyBadge partySize={item.partySize} />
                          )}
                        </button>
                      )
                    })}
                  </section>
                ))}
              </div>
            )}
          </div>

          <GroupFilterSheet
            visible={groupSheetOpen}
            onClose={() => setGroupSheetOpen(false)}
            roster={roster}
            groups={groups}
            activeTag={groupTag}
            onSelect={setGroupTag}
          />

          <GuestConfirmCard
            visible={Boolean(confirming)}
            guest={confirming}
            busy={admitting}
            error={admitError}
            phonePending={phonePending}
            onCancel={() => {
              setConfirming(null)
              setAdmitError(null)
            }}
            onConfirm={(guest, arrived) => void admit(guest, arrived)}
          />
        </main>
      )}
    </SessionGate>
  )
}
