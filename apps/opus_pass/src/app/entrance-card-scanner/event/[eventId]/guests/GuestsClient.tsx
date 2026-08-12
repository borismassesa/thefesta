'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, CloudOff, ListFilter, Loader2, QrCode, Search, Users, UsersRound, X } from 'lucide-react'
import { GroupFilterMenu } from '@/components/scanner/GroupFilterMenu'
import { GuestAvatar } from '@/components/scanner/GuestAvatar'
import { GuestConfirmCard } from '@/components/scanner/GuestConfirmCard'
import { PartyBadge } from '@/components/scanner/PartyBadge'
import { ScannerLocaleToggle } from '@/components/scanner/ScannerLocaleToggle'
import { SessionGate } from '@/components/scanner/SessionGate'
import { submitScan, validateScannerSession } from '@/lib/scanner/api/checkin'
import { withGuestDetail } from '@/lib/scanner/api/guestDetail'
import { getErrorMessage } from '@/lib/scanner/errors'
import { arrivedHeads, clampArrived, countLabel, groupRoster, UNGROUPED_LABEL } from '@/lib/scanner/roster'
import { useScannerSession } from '@/hooks/useScannerSession'
import { useScannerT } from '@/hooks/useScannerT'
import type { RosterEntry } from '@/types/scanner-checkin'

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
  const t = useScannerT()

  const filters: { key: Filter; label: string; shortLabel: string }[] = [
    { key: 'pending', label: t('filter_waiting_full'), shortLabel: t('filter_waiting') },
    { key: 'arrived', label: t('filter_in_full'), shortLabel: t('filter_in') },
    { key: 'all', label: t('filter_all_full'), shortLabel: t('filter_all') },
  ]

  const [query, setQuery] = useState('')
  // Seeded from the count the attendant tapped on the scan screen, so
  // "8 still to arrive" lands on exactly those eight.
  const [filter, setFilter] = useState<Filter>(() => {
    const param = searchParams.get('filter')
    return isFilter(param) ? param : 'all'
  })
  const [groupTag, setGroupTag] = useState<string | null>(null)
  const [groupMenuOpen, setGroupMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState<RosterEntry | null>(null)
  const [phonePending, setPhonePending] = useState(false)
  /** Which guest-detail lookup is the current one, so a superseded reply
   *  cannot speak for the guest now on screen. */
  const detailRequest = useRef(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const [admitting, setAdmitting] = useState(false)
  const [admitError, setAdmitError] = useState<string | null>(null)

  // Laptop/tablet at the door: `/` jumps to search (ignore when typing already).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
  const pendingCount = inGroup.length - arrivedCount
  const filterCounts: Record<Filter, number> = {
    pending: pendingCount,
    arrived: arrivedCount,
    all: inGroup.length,
  }
  const goToScan = () => router.push(`/entrance-card-scanner/event/${eventId}/scan`)

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
        <main className="flex min-h-dvh flex-col bg-[#F5F5F5]">
          {/* Wider than the phone-port max-w-2xl so tablets/laptops use the
              screen; still capped so a row of names doesn't stretch unreadably. */}
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col lg:max-w-4xl">
            <div className="px-4 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A]">{t('guest_list_title')}</h1>
                  <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-[#1A1A1A]/55">
                    {groupTag ? (
                      <UsersRound size={14} className="shrink-0 text-[#1A1A1A]/40" />
                    ) : (
                      <CalendarDays size={14} className="shrink-0 text-[#1A1A1A]/40" />
                    )}
                    <span className="truncate">{groupTag ?? gateSession.eventName ?? t('this_event')}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ScannerLocaleToggle />
                  <button
                    type="button"
                    onClick={goToScan}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-semibold text-[#1A1A1A] shadow-sm ring-1 ring-black/8 transition-colors hover:bg-gray-50"
                  >
                    <QrCode size={15} />
                    {t('scan')}
                  </button>
                </div>
              </div>
            </div>

            {/* One tool surface: segment + search. Sticky so long lists stay usable. */}
            <div className="sticky top-0 z-20 mt-4 space-y-2.5 bg-[#F5F5F5]/92 px-4 py-2.5 backdrop-blur-md sm:px-5">
              <div
                role="tablist"
                aria-label={t('filter_aria')}
                className="flex rounded-2xl border border-black/10 bg-white p-1"
              >
                {filters.map(({ key, label, shortLabel }) => {
                  const active = filter === key
                  const count = filterCounts[key]
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-label={`${label}: ${count}`}
                      onClick={() => setFilter(key)}
                      className={`flex min-h-11 flex-1 flex-col items-center justify-center rounded-xl px-1 transition-colors ${
                        active ? 'bg-[#EFEFEF]' : 'hover:bg-black/3'
                      }`}
                    >
                      <span
                        className={`text-sm font-semibold tabular-nums ${active ? 'text-[#1A1A1A]' : 'text-[#1A1A1A]/55'}`}
                      >
                        {count}
                      </span>
                      <span
                        className={`mt-0.5 text-[11px] font-medium ${active ? 'text-[#1A1A1A]/70' : 'text-[#1A1A1A]/45'}`}
                      >
                        <span className="sm:hidden">{shortLabel}</span>
                        <span className="hidden sm:inline">{label}</span>
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center rounded-2xl border border-black/10 bg-white px-3.5 py-2.5 transition-colors focus-within:border-[#C9A0DC] focus-within:ring-2 focus-within:ring-[#C9A0DC]/25">
                  <Search size={16} className="shrink-0 text-[#1A1A1A]/45" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('search_by_name')}
                    autoCorrect="off"
                    autoCapitalize="words"
                    enterKeyHint="search"
                    className="ml-2 min-w-0 flex-1 bg-transparent text-sm text-[#1A1A1A] outline-none placeholder:text-[#1A1A1A]/40"
                  />
                  {query ? (
                    <button type="button" aria-label={t('clear_search')} onClick={() => setQuery('')}>
                      <X size={16} className="text-[#1A1A1A]/45" />
                    </button>
                  ) : null}
                </div>

                <GroupFilterMenu
                  open={groupMenuOpen}
                  onOpenChange={setGroupMenuOpen}
                  roster={roster}
                  groups={groups}
                  activeTag={groupTag}
                  onSelect={setGroupTag}
                >
                  <button
                    type="button"
                    aria-label={
                      groupTag
                        ? t('filter_by_group_active', { group: groupTag })
                        : t('filter_by_group')
                    }
                    aria-haspopup="listbox"
                    aria-expanded={groupMenuOpen}
                    aria-pressed={Boolean(groupTag)}
                    onClick={() => setGroupMenuOpen((v) => !v)}
                    className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border bg-white transition-colors hover:bg-gray-50 ${
                      groupTag || groupMenuOpen ? 'border-[#1A1A1A]' : 'border-black/10'
                    }`}
                  >
                    <ListFilter size={18} className="text-[#1A1A1A]" />
                    {groupTag ? (
                      <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[#8e57b3]" />
                    ) : null}
                  </button>
                </GroupFilterMenu>
              </div>
            </div>

            {rosterQuery.isPending ? (
              <div className="mt-16 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-[#8e57b3]" />
              </div>
            ) : rosterQuery.isError ? (
              <div className="mt-16 flex flex-col items-center px-10 text-center">
                <CloudOff size={30} className="text-[#B3261E]" />
                <p className="mt-3 text-sm text-[#B3261E]">{t('load_failed')}</p>
                <button
                  type="button"
                  onClick={() => void rosterQuery.refetch()}
                  className="mt-4 rounded-full border border-black/12 px-5 py-2.5 text-xs font-bold text-[#1A1A1A]"
                >
                  {t('try_again')}
                </button>
              </div>
            ) : sections.length === 0 ? (
              <div className="mt-14 flex flex-col items-center px-10 text-center">
                {query ? (
                  <Search size={28} className="text-[#1A1A1A]/35" />
                ) : (
                  <Users size={28} className="text-[#1A1A1A]/35" />
                )}
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#1A1A1A]/55">
                  {query
                    ? t('empty_search')
                    : filter === 'pending'
                      ? t('empty_pending')
                      : filter === 'arrived'
                        ? t('empty_arrived')
                        : t('empty_all')}
                </p>
                {!query ? (
                  <button
                    type="button"
                    onClick={goToScan}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1A1A1A]/70 underline-offset-4 transition-colors hover:text-[#1A1A1A] hover:underline"
                  >
                    <QrCode size={15} />
                    {t('back_to_scan')}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="px-4 pt-2 pb-20 sm:px-5">
                {sections.map((section) => (
                  <section key={section.title} className="mt-4">
                    <div className="mb-2.5 flex items-baseline justify-between">
                      <h2 className="min-w-0 truncate text-sm font-bold text-[#1A1A1A]">{section.title}</h2>
                      <span className="ml-3 shrink-0 text-xs text-[#1A1A1A]/60">{section.subtitle}</span>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {section.data.map((item) => {
                        const arrived = Boolean(item.checkedInAt)
                        return (
                          <button
                            key={item.invitationId}
                            type="button"
                            aria-label={`${item.fullName}, ${arrived ? t('checked_in_aria') : t('not_yet_arrived_aria')}`}
                            onClick={() => {
                              setAdmitError(null)
                              void openConfirm(item)
                            }}
                            className="flex min-h-16 w-full items-center gap-3.5 rounded-2xl border border-black/8 bg-white px-4 py-3.5 text-left transition-colors hover:border-black/20 active:bg-[#F0F0F0]"
                          >
                            <GuestAvatar fullName={item.fullName} colorKey={item.groupTag} />

                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-[15px] font-bold text-[#1A1A1A]">{item.fullName}</span>
                                {item.isVip ? (
                                  <span
                                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-[#1A1A1A] uppercase"
                                    style={{ backgroundColor: LIVE_GREEN }}
                                  >
                                    {t('vip')}
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#1A1A1A]/60">
                                {arrived ? (
                                  <span className="font-semibold text-[#1B7F4C]">
                                    {t('checked_in_of', {
                                      a: item.checkedInPartySize ?? item.partySize,
                                      b: item.partySize,
                                    })}
                                  </span>
                                ) : (
                                  <span>{t('waiting_party', { n: item.partySize })}</span>
                                )}
                                {item.entryCode && !arrived ? <span className="truncate">{item.entryCode}</span> : null}
                              </span>
                            </span>

                            {arrived ? (
                              <CheckCircle2 size={24} className="shrink-0 text-[#1B7F4C]" />
                            ) : (
                              <PartyBadge partySize={item.partySize} />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

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
