'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  CalendarDays,
  Check,
  CloudOff,
  DoorOpen,
  Download,
  Loader2,
  PenLine,
  QrCode,
  Search,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { PartyBadge } from '@/components/scanner/PartyBadge'
import { ScannerLocaleToggle } from '@/components/scanner/ScannerLocaleToggle'
import { SessionGate } from '@/components/scanner/SessionGate'
import { reportLink, validateScannerSession } from '@/lib/scanner/api/checkin'
import { getErrorMessage } from '@/lib/scanner/errors'
import { eventDayLabel, formatEventTime } from '@/lib/scanner/eventTime'
import { arrivedHeads } from '@/lib/scanner/roster'
import { useScannerSession } from '@/hooks/useScannerSession'
import { useScannerT } from '@/hooks/useScannerT'
import type { RosterEntry } from '@/types/scanner-checkin'

/** Brand green, matching the live/active pills used elsewhere in the product. */
const LIVE_GREEN = '#9FE870'

/**
 * The attendant's audit label is built server-side as
 * "Asha (Main Gate) [pass_id] (manual: Phone battery dead)". Everything after
 * the name is shown separately or not at all, so strip both the parenthesised
 * parts and the bracketed identifier to leave just the name.
 */
function attendantOf(checkedInBy: string | null): string | null {
  if (!checkedInBy) return null
  const name = checkedInBy
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .trim()
  return name || null
}

/** True when the admission came from the manual fallback rather than a scan. */
function wasManual(checkedInBy: string | null): boolean {
  return /\(manual:/i.test(checkedInBy ?? '')
}

/**
 * How this guest was identified, in words rather than the server's token.
 *
 * The audit label carries "[roster_pick]", "[pass_id]" and friends — names
 * for the code that writes them, not for the person reading the arrivals log
 * at 11pm. The distinction is worth keeping, though: "found in the guest
 * list" and "read their Pass ID out" are different amounts of evidence that
 * the right person walked in, which is exactly what someone auditing a manual
 * admission is trying to weigh.
 */
function manualMethodOf(checkedInBy: string | null): string {
  const match = /\[([a-z_]+)\]/i.exec(checkedInBy ?? '')
  switch (match?.[1]) {
    case 'roster_pick':
      return 'Checked in from the guest list'
    case 'pass_id':
      return 'Checked in with a typed Pass ID'
    case 'legacy_entry_code':
      return 'Checked in with a typed ticket code'
    default:
      // Older admissions predate the identifier tag entirely.
      return 'Checked in manually'
  }
}

/** One fact, led by the icon that says what kind of fact it is. */
function MetaItem({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon size={13} className="shrink-0 text-[#1A1A1A]/60" />
      <span className="text-xs text-[#1A1A1A]/60">{label}</span>
    </span>
  )
}

/**
 * Arrivals log: who has actually been scanned in, newest first.
 *
 * Distinct from the guest-list screen, which answers "is this person on the
 * list?" while standing in front of them. This answers "who has come in so
 * far?" — the question the couple and the OpusFesta team ask during the
 * event — so it is ordered by arrival time and carries the time, door and
 * attendant rather than search-and-admit controls.
 *
 * Ported from apps/opus_pass_mobile/app/scanner/[eventId]/arrivals.tsx.
 */
export default function ArrivalsClient({ eventId }: { eventId: string }) {
  const router = useRouter()
  const { session } = useScannerSession()
  const t = useScannerT()

  const [query, setQuery] = useState('')
  const [reportOpening, setReportOpening] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  const sessionReady = session !== null && session.eventId === eventId

  const rosterQuery = useQuery({
    queryKey: ['scanner', 'roster', eventId],
    enabled: sessionReady,
    queryFn: async () => {
      const validated = await validateScannerSession(session!.eventId, session!.accessToken)
      if (!validated.ok) throw new Error(validated.error)
      return validated.roster
    },
    // No polling: a background refetch every 15s shared this query with the
    // pull-to-refresh indicator, so the list flashed every few seconds all
    // night, and a screen that redraws while you are reading it is its own
    // problem.
  })

  const arrived = useMemo(
    () =>
      (rosterQuery.data ?? [])
        .filter((g): g is RosterEntry & { checkedInAt: string } => Boolean(g.checkedInAt))
        .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt)),
    [rosterQuery.data],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return arrived
    return arrived.filter((g) => g.fullName.toLowerCase().includes(needle))
  }, [arrived, query])

  /** Newest-first arrivals grouped by day. */
  const sections = useMemo(() => {
    const groups: { title: string; data: (RosterEntry & { checkedInAt: string })[] }[] = []
    for (const guest of visible) {
      const label = eventDayLabel(guest.checkedInAt)
      const last = groups[groups.length - 1]
      if (last && last.title === label) last.data.push(guest)
      else groups.push({ title: label, data: [guest] })
    }
    return groups
  }, [visible])

  const totalGuests = rosterQuery.data?.length ?? 0
  // Headcount, not row count: a party of 3 arriving is 3 people through the
  // door. Shared with the other scanner screens — these are the numbers the
  // couple is catered and billed against, so they derive in exactly one place.
  const headsIn = arrivedHeads(arrived)

  /**
   * Open the check-in report as a PDF.
   *
   * The same document, from the same renderer, that the couple downloads from
   * their dashboard. Opened in a new tab: the phone's own PDF viewer already
   * offers save, print and share better than a bespoke screen would.
   */
  const openReport = async () => {
    if (!session || reportOpening) return
    setReportOpening(true)
    setReportError(null)
    try {
      const url = await reportLink(session.eventId, session.accessToken)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      // Named inline rather than thrown away: this is the end of a shift and
      // the attendant needs to know whether to try again or go and tell
      // somebody the report never came.
      setReportError(getErrorMessage(err, "Couldn't open the report."))
    } finally {
      setReportOpening(false)
    }
  }

  return (
    <SessionGate eventId={eventId}>
      {(gateSession) => (
        <main className="flex min-h-dvh flex-col bg-[#F5F5F5]">
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
            <div className="flex items-start justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-5">
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A] sm:text-3xl">
                  {t('checked_in_title')}
                </h1>
                <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-[#1A1A1A]/55">
                  <CalendarDays size={14} className="shrink-0 text-[#1A1A1A]/40" />
                  <span className="truncate">{gateSession.eventName ?? t('this_event')}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ScannerLocaleToggle />
                <button
                  type="button"
                  aria-label={t('download_report')}
                  onClick={() => void openReport()}
                  disabled={rosterQuery.isPending || reportOpening}
                  className="flex h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-xs font-semibold text-[#1A1A1A] shadow-sm ring-1 ring-black/8 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  {reportOpening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download size={16} />}
                  {t('report')}
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/entrance-card-scanner/event/${eventId}/scan`)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-semibold text-[#1A1A1A] shadow-sm ring-1 ring-black/8 transition-colors hover:bg-gray-50"
                >
                  <QrCode size={15} />
                  {t('scan')}
                </button>
              </div>
            </div>

            {/* Getting every guest in is the whole job, and it lands late in a
                long shift — worth marking rather than leaving as a progress
                bar that quietly reaches the end. */}
            {totalGuests > 0 && arrived.length === totalGuests ? (
              <div className="mx-5 mt-5 overflow-hidden rounded-3xl border border-black/8 bg-white">
                <div className="flex items-center gap-4 p-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-2xl font-bold leading-8 text-[#1A1A1A]">{t('everyone_in')}</p>
                    <p className="mt-1.5 text-sm text-[#1A1A1A]/60">
                      {t('everyone_in_body', {
                        guests: totalGuests,
                        heads: headsIn,
                        people: headsIn === 1 ? t('person') : t('people'),
                      })}
                    </p>
                  </div>
                  <span
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: LIVE_GREEN }}
                  >
                    <Check size={32} color="#14532D" />
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void openReport()}
                  className="flex w-full items-center justify-center gap-2 border-t border-black/8 py-4 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-black/2"
                >
                  <Download size={17} />
                  {t('send_final_report')}
                </button>
              </div>
            ) : (
              /* The two numbers a door attendant actually wants: how many
                  people are in the room (the headline), and how far through
                  the guest list they are (progress). */
              <div className="mx-5 mt-5 rounded-3xl border border-black/8 bg-white p-5">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold leading-10.5 text-[#1A1A1A]">{headsIn}</span>
                  <span className="flex-1 text-sm text-[#1A1A1A]/60">
                    {headsIn === 1 ? t('guest_through_door') : t('guests_through_door')}
                  </span>
                </div>

                <div className="mt-5 border-t border-black/8 pt-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-[#1A1A1A]/60">{t('invitations_scanned')}</span>
                    <span className="text-xs font-semibold text-[#1A1A1A]">
                      {t('of_count', { a: arrived.length, b: totalGuests })}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/6">
                    <div
                      className="h-full rounded-full bg-[#8e57b3]"
                      style={{
                        // Guard the empty-roster case: 0/0 should read as no
                        // progress, not NaN width.
                        width: `${totalGuests > 0 ? Math.round((arrived.length / totalGuests) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {arrived.length > 0 ? (
              <div className="px-5 pt-4">
                <div className="flex items-center rounded-full border border-black/10 bg-white px-4 py-2.5 transition-colors focus-within:border-[#C9A0DC] focus-within:ring-2 focus-within:ring-[#C9A0DC]/30">
                  <Search size={16} className="shrink-0 text-[#1A1A1A]/50" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('search_arrived')}
                    autoCorrect="off"
                    autoCapitalize="words"
                    enterKeyHint="search"
                    className="ml-2 flex-1 bg-transparent text-sm text-[#1A1A1A] outline-none placeholder:text-[#1A1A1A]/40"
                  />
                </div>
              </div>
            ) : null}

            {/* Sits under the header, next to the button that failed. A report
                that silently does not arrive is the kind of thing nobody
                notices until the couple asks for it a week later. */}
            {reportError ? (
              <div
                role="alert"
                className="mx-5 mt-3 mb-2 flex items-start gap-2 rounded-2xl bg-[#B3261E]/10 px-3 py-2"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#B3261E]" />
                <p className="min-w-0 flex-1 text-xs text-[#B3261E]">{reportError}</p>
              </div>
            ) : null}

            {rosterQuery.isPending ? (
              <div className="mt-16 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-[#8e57b3]" />
              </div>
            ) : rosterQuery.isError ? (
              <div className="mt-16 flex flex-col items-center px-10 text-center">
                <CloudOff size={30} className="text-[#B3261E]" />
                <p className="mt-3 text-sm text-[#B3261E]">{t('load_arrivals_failed')}</p>
                <button
                  type="button"
                  onClick={() => void rosterQuery.refetch()}
                  className="mt-4 rounded-full border border-black/12 px-5 py-2.5 text-xs font-bold text-[#1A1A1A]"
                >
                  {t('try_again')}
                </button>
              </div>
            ) : sections.length === 0 ? (
              <div className="mt-16 flex flex-col items-center px-10 text-center">
                {query ? (
                  <Search size={32} className="text-[#1A1A1A]/40" />
                ) : (
                  <Users size={32} className="text-[#1A1A1A]/40" />
                )}
                <p className="mt-3 text-sm text-[#1A1A1A]/60">
                  {query ? t('empty_arrivals_search') : t('empty_arrivals')}
                </p>
              </div>
            ) : (
              <div className="px-5 pt-4 pb-16">
                {sections.map((section) => (
                  <section key={section.title}>
                    {sections.length > 1 || section.title !== 'Today' ? (
                      <h2 className="mt-2 mb-2 text-[11px] font-bold tracking-[2px] text-[#1A1A1A]/60 uppercase">
                        {section.title}
                      </h2>
                    ) : null}
                    {section.data.map((item) => {
                      const admitted = item.checkedInPartySize ?? item.partySize
                      const attendant = attendantOf(item.checkedInBy)
                      const manual = wasManual(item.checkedInBy)
                      return (
                        <article
                          key={item.invitationId}
                          className="mb-3 flex items-start gap-3 rounded-2xl border border-black/8 bg-white p-4"
                        >
                          <span
                            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                            style={{ backgroundColor: `${LIVE_GREEN}55` }}
                          >
                            <Check size={18} color="#1B7F4C" />
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-bold text-[#1A1A1A]">{item.fullName}</p>
                              {item.isVip ? (
                                <span
                                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-[#1A1A1A] uppercase"
                                  style={{ backgroundColor: LIVE_GREEN }}
                                >
                                  {t('vip')}
                                </span>
                              ) : null}
                            </div>

                            {/* Facts as icon-led items, not a middot run-on. */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                              <PartyBadge partySize={item.partySize} />
                              {/* Only when it disagrees with the ticket: a
                                  Double with one person is the thing worth
                                  noticing here. */}
                              {admitted !== item.partySize ? (
                                <MetaItem icon={Users} label={`${admitted} of ${item.partySize} arrived`} />
                              ) : null}
                              {item.checkedInDoor ? <MetaItem icon={DoorOpen} label={item.checkedInDoor} /> : null}
                              {attendant ? <MetaItem icon={User} label={attendant} /> : null}
                            </div>

                            {manual ? (
                              <div className="mt-1.5">
                                <MetaItem icon={PenLine} label={manualMethodOf(item.checkedInBy)} />
                              </div>
                            ) : null}
                          </div>

                          <span className="shrink-0 text-xs font-medium text-[#1A1A1A]/60">
                            {formatEventTime(item.checkedInAt)}
                          </span>
                        </article>
                      )
                    })}
                  </section>
                ))}
              </div>
            )}
          </div>
        </main>
      )}
    </SessionGate>
  )
}
