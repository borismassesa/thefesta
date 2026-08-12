'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CloudOff,
  Keyboard,
  Loader2,
  RefreshCw,
  Search,
  User,
  X,
} from 'lucide-react'
import { GuestAvatar } from './GuestAvatar'
import { GuestConfirmCard } from './GuestConfirmCard'
import { PartyBadge } from './PartyBadge'
import { ScannerLocaleToggle } from './ScannerLocaleToggle'
import { useScannerT } from '@/hooks/useScannerT'
import type { CheckinScanResult, ManualLookupResult, RosterEntry } from '@/types/scanner-checkin'

/** Brand green, matching the live/active pills used elsewhere in the product. */
const LIVE_GREEN = '#9FE870'
const ACCENT = '#C9A0DC'

/** A legacy entry code is 6 characters; a Pass ID is 8. Both are typed into
 *  the same box because a guest reading one out does not know which they have.
 *  Every issued ticket now prints an 8-character Pass ID, so 8 is what the box
 *  is sized and timed for; 6 stays accepted for tickets printed before it. */
const ENTRY_CODE_LENGTH = 6
const PASS_ID_LENGTH = 8
const MAX_IDENTIFIER_LENGTH = PASS_ID_LENGTH

/** Fold typing variations onto the stored form, exactly as the server does.
 *  Mirrors normaliseTypedIdentifier in opus_pass lib/checkin/identifiers.ts —
 *  safe because the alphabet excludes O, I and L, so folding can only rescue a
 *  mistype and can never turn one valid identifier into another. */
function normaliseCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .slice(0, MAX_IDENTIFIER_LENGTH)
}

/** Whether a typed value is a complete identifier of either kind. */
function isCompleteIdentifier(value: string): boolean {
  return value.length === ENTRY_CODE_LENGTH || value.length === PASS_ID_LENGTH
}

type Mode = 'code' | 'name'

interface ManualCheckinFormProps {
  /** Which way the page opens. "QR not working" wants the keypad; a
   *  "find by name" entry point wants the search. */
  initialMode?: Mode
  onBack: () => void
  roster: RosterEntry[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  /** Admit with the headcount the attendant confirmed on the card. */
  onAdmit: (guest: RosterEntry, arrived: number) => Promise<CheckinScanResult>
  onAdmitByCode: (code: string) => Promise<CheckinScanResult>
  /** Read-only lookup for a Pass ID: the guest to confirm, nothing matched, or
   *  why the question couldn't be answered. Writes nothing — admission is the
   *  separate onAdmit call the confirm card makes. */
  onLookup?: (identifier: string) => Promise<ManualLookupResult>
  onAdmitted: (result: CheckinScanResult) => void
}

/**
 * Manual check-in for a guest whose QR won't scan.
 *
 * Full page (not a sheet over the camera): reached from "QR not working",
 * where the attendant is holding a ticket with a printed code. Opens on code
 * entry; name search is the secondary path for a ticket that is torn or
 * unreadable. Every admission here is flagged in the audit trail as scan-less.
 */
export function ManualCheckinForm({
  initialMode = 'code',
  onBack,
  roster,
  isLoading,
  isError,
  onRetry,
  onAdmit,
  onAdmitByCode,
  onLookup,
  onAdmitted,
}: ManualCheckinFormProps) {
  const t = useScannerT()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [code, setCode] = useState('')
  const [query, setQuery] = useState('')
  const [admitting, setAdmitting] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  /** Guest picked from the search results, awaiting confirmation. */
  const [confirming, setConfirming] = useState<RosterEntry | null>(null)
  /** True while a picked guest's phone number is still being resolved. */
  const [phonePending, setPhonePending] = useState(false)
  /** Which guest-detail lookup is the current one, so a superseded reply
   *  cannot speak for the guest now on screen. */
  const detailRequest = useRef(0)

  const codeInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  /**
   * Held in a ref, not in `admitting`, because two triggers can fire for the
   * same code inside one tick: auto-submit when the eighth character lands,
   * and the keyboard's Enter key. State does not update until the next
   * render, so both would read `admitting` as null and both would go to the
   * server. A ref closes that window synchronously.
   */
  const submitLock = useRef(false)

  const focusFor = (next: Mode) => {
    // Let the swap render before focusing, or focus attaches to the field
    // that just unmounted.
    setTimeout(() => {
      ;(next === 'code' ? codeInputRef : nameInputRef).current?.focus()
    }, 60)
  }

  useEffect(() => {
    setMode(initialMode)
    focusFor(initialMode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return [...roster]
      .filter((g) => (needle ? g.fullName.toLowerCase().includes(needle) : true))
      .sort((a, b) => {
        const arrivedDiff = Number(Boolean(a.checkedInAt)) - Number(Boolean(b.checkedInAt))
        return arrivedDiff !== 0 ? arrivedDiff : a.fullName.localeCompare(b.fullName)
      })
  }, [roster, query])

  // Always eight slots: that is what a ticket prints, so the box should show
  // the shape the attendant is copying. A shorter legacy code simply leaves
  // the last two empty.
  const slotCount = PASS_ID_LENGTH

  const submitCode = async (value: string) => {
    if (submitLock.current || admitting || !isCompleteIdentifier(value)) return
    submitLock.current = true
    setAdmitting('code')
    setCodeError(null)
    try {
      // A Pass ID is looked up FIRST and shown for confirmation rather than
      // admitting on the spot. The whole reason a guest reads one out is that
      // something already went wrong, so the attendant needs to see who they
      // are looking at — right guest, right event, how many of the party are
      // left — before anyone is admitted. The lookup writes nothing.
      if (value.length === PASS_ID_LENGTH && onLookup) {
        const found = await onLookup(value)
        if (found.status === 'error') {
          // Keep what they typed. The Pass ID was never the problem, and
          // clearing it would make them retype a code that was fine.
          setCodeError(found.message)
          return
        }
        if (found.status === 'not_found') {
          setCodeError(t('no_guest_matching', { query: value }))
          setCode('')
          focusFor('code')
          return
        }
        // Hand it to the same confirm card a roster pick uses, so admitting is
        // a deliberate second tap on both paths.
        setConfirming(found.guest)
        setCode('')
        return
      }

      const result = await onAdmitByCode(value)

      // A wrong code is a typo, not an outcome worth taking over the screen:
      // stay put, say so inline, and clear for an immediate retype.
      if (result.status === 'invalid') {
        setCodeError(result.message ?? t('no_guest_matching', { query: value }))
        setCode('')
        focusFor('code')
        return
      }

      // A network failure says nothing about the code, so keep what they
      // typed — closing here would make them re-enter a code that was fine.
      if (result.status === 'error') {
        setCodeError(result.message ?? t('something_went_wrong'))
        return
      }

      // success / duplicate are real answers about the guest: hand them up
      // for the full-screen overlay, same as a scan.
      onAdmitted(result)
    } finally {
      setAdmitting(null)
      submitLock.current = false
    }
  }

  const onCodeChange = (next: string) => {
    const cleaned = normaliseCode(next)
    setCode(cleaned)
    if (codeError) setCodeError(null)
    // Submit the moment a full Pass ID is there — at a door, an extra tap per
    // guest adds up. Only at eight: firing at six would submit the first six
    // characters of an eight-character Pass ID and clear the box before the
    // attendant could type the last two, which made Pass IDs impossible to
    // enter by hand. A six-character legacy code is submitted with the button
    // below instead.
    if (cleaned.length === PASS_ID_LENGTH) void submitCode(cleaned)
  }

  /**
   * Open the confirm card for a guest picked out of the search results, then
   * fill in the phone number the roster does not carry.
   *
   * The card opens on the roster row straight away rather than waiting for
   * the lookup: the attendant is identifying somebody standing in front of
   * them, and a network round trip in front of every admission is the wrong
   * trade. The number lands a moment later, or not at all.
   */
  const openConfirm = async (guest: RosterEntry) => {
    setConfirming(guest)
    const identifier = guest.passId ?? guest.entryCode
    if (!identifier || !onLookup) return
    // Only the newest pick owns the card. Two taps in a row leave two lookups
    // in flight, and whichever returns first must not speak for the other.
    const request = (detailRequest.current += 1)
    setPhonePending(true)
    try {
      const found = await onLookup(identifier)
      if (detailRequest.current !== request || found.status !== 'found') return
      setConfirming((current) =>
        current?.invitationId === found.guest.invitationId ? { ...current, phone: found.guest.phone } : current,
      )
    } finally {
      if (detailRequest.current === request) setPhonePending(false)
    }
  }

  const admitGuest = async (guest: RosterEntry, arrived: number) => {
    if (admitting) return
    setAdmitting(guest.invitationId)
    try {
      const result = await onAdmit(guest, arrived)
      // Every outcome — success, duplicate, error — is handed up so the
      // page's full-screen overlay reports it exactly like a scan.
      setConfirming(null)
      onAdmitted(result)
    } finally {
      setAdmitting(null)
    }
  }

  const busyOnCode = admitting === 'code'
  const title = mode === 'code' ? t('enter_pass_or_code') : t('find_guest_by_name')

  return (
    <main className="flex min-h-dvh flex-col bg-white">
      <header className="flex shrink-0 items-center gap-3 border-b border-black/8 px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-5">
        <button
          type="button"
          aria-label={t('go_back')}
          onClick={onBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 transition-colors hover:bg-black/8"
        >
          <ArrowLeft size={20} color="#1A1A1A" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-base font-bold text-[#1A1A1A]">{title}</h1>
        <ScannerLocaleToggle className="shrink-0" />
        {/* Mode toggle. Lives here rather than as a line of copy under the
            cells: it's navigation between two ways of doing the same job. */}
        <button
          type="button"
          aria-label={mode === 'code' ? t('search_by_name_instead') : t('enter_code_instead_mode')}
          onClick={() => {
            const next: Mode = mode === 'code' ? 'name' : 'code'
            setMode(next)
            focusFor(next)
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 transition-colors hover:bg-black/8"
        >
          {mode === 'code' ? <Search size={20} color="#1A1A1A" /> : <Keyboard size={20} color="#1A1A1A" />}
        </button>
      </header>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
        {mode === 'code' ? (
          <div className="flex-1 overflow-y-auto px-5 pt-8 pb-10">
            <p className="text-center text-sm leading-5 text-[#1A1A1A]/60">{t('pass_code_hint')}</p>

            {/* Character cells with one real input behind them. Reads as
                entering a code rather than searching, and shows progress
                through the eight characters as they type. */}
            <div className="relative mt-7 flex justify-center gap-2" onClick={() => codeInputRef.current?.focus()}>
              {Array.from({ length: slotCount }).map((_, i) => {
                const char = code[i]
                const isCursor = i === code.length && !busyOnCode
                return (
                  <div
                    key={i}
                    className="flex h-14 w-10 items-center justify-center rounded-2xl bg-black/4 sm:w-12"
                    style={{
                      borderWidth: isCursor ? 2 : 1,
                      borderColor: codeError ? '#B3261E' : isCursor ? ACCENT : 'rgba(26,26,26,0.12)',
                    }}
                  >
                    <span className="text-2xl font-bold text-[#1A1A1A]">{char ?? ''}</span>
                  </div>
                )
              })}

              <input
                ref={codeInputRef}
                value={code}
                onChange={(e) => onCodeChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitCode(code)
                }}
                maxLength={MAX_IDENTIFIER_LENGTH}
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                disabled={busyOnCode}
                enterKeyHint="go"
                aria-label={t('pass_or_ticket_code')}
                // Visually hidden but still the real focus target, so the
                // system keyboard and paste behave normally.
                className="absolute inset-0 h-full w-full opacity-0"
              />
            </div>

            {codeError ? (
              <div className="mt-4 flex items-center justify-center gap-1.5">
                <AlertCircle size={15} className="shrink-0 text-[#B3261E]" />
                <span className="text-sm text-[#B3261E]">{codeError}</span>
              </div>
            ) : null}

            {busyOnCode ? (
              <div className="mt-6 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-[#8e57b3]" />
              </div>
            ) : isCompleteIdentifier(code) ? (
              // Two cases, one button. A six-character legacy code is never
              // auto-submitted (an eight-character Pass ID passes through six
              // on its way), so it needs a deliberate submit. And after a
              // network failure the typed value is kept, so an unchanged code
              // needs a way to go again.
              <button
                type="button"
                onClick={() => void submitCode(code)}
                className="mx-auto mt-6 flex h-12 items-center justify-center gap-2 rounded-full px-6"
                style={{ backgroundColor: ACCENT }}
              >
                {codeError ? <RefreshCw size={16} color="#1A1A1A" /> : <ArrowRight size={16} color="#1A1A1A" />}
                <span className="text-sm font-bold uppercase tracking-[1px] text-[#1A1A1A]">
                  {codeError ? t('try_again') : t('check_in')}
                </span>
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="px-5 pt-4">
              <div className="flex items-center rounded-full border border-black/12 bg-white px-4 py-3">
                <Search size={17} className="shrink-0 text-[#1A1A1A]/50" />
                <input
                  ref={nameInputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('search_guest_name')}
                  autoCorrect="off"
                  autoCapitalize="words"
                  enterKeyHint="search"
                  className="ml-2 flex-1 bg-transparent text-base text-[#1A1A1A] outline-none placeholder:text-[#1A1A1A]/40"
                />
                {query ? (
                  <button type="button" aria-label={t('clear_search')} onClick={() => setQuery('')}>
                    <X size={18} className="text-[#1A1A1A]/50" />
                  </button>
                ) : null}
              </div>
            </div>

            {isLoading ? (
              <div className="mt-16 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-[#8e57b3]" />
              </div>
            ) : isError ? (
              <div className="mt-16 flex flex-col items-center px-8">
                <CloudOff size={30} className="text-[#B3261E]" />
                <p className="mt-3 text-center text-sm text-[#1A1A1A]/60">{t('load_failed_use_code')}</p>
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-4 rounded-full border border-black/12 px-5 py-2.5 text-xs font-bold text-[#1A1A1A]"
                >
                  {t('try_again')}
                </button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-5 pt-4 pb-10">
                {results.length === 0 ? (
                  <div className="mt-14 flex flex-col items-center px-8">
                    <User size={30} className="text-[#1A1A1A]/40" />
                    <p className="mt-3 text-center text-sm text-[#1A1A1A]/60">
                      {query ? t('no_guest_matching', { query: query.trim() }) : t('empty_all')}
                    </p>
                  </div>
                ) : (
                  results.map((item) => {
                    const arrived = Boolean(item.checkedInAt)
                    return (
                      <button
                        key={item.invitationId}
                        type="button"
                        disabled={Boolean(admitting)}
                        // Opens the confirmation rather than admitting outright:
                        // there is no QR backing this path, so the attendant has
                        // to see who they are about to let in. Guests already
                        // inside stay tappable — the card is also how you check
                        // when and by which door they came through.
                        onClick={() => void openConfirm(item)}
                        className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-black/8 bg-white p-4 text-left"
                        style={{ opacity: arrived ? 0.6 : 1 }}
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
                                {t('vip')}
                              </span>
                            ) : null}
                          </span>

                          {/* The badge names the ticket type, so this row only
                              carries the printed code and, once used, the
                              arrival detail. */}
                          {item.entryCode || arrived ? (
                            <span className="mt-1 flex items-center gap-2">
                              {item.entryCode ? (
                                <span className="text-[10px] font-bold tracking-[1px] text-[#1A1A1A]/60">
                                  {item.entryCode}
                                </span>
                              ) : null}
                              {arrived ? (
                                <span className="truncate text-xs text-[#1A1A1A]/60">
                                  {t('already_in_of', {
                                    a: item.checkedInPartySize ?? item.partySize,
                                    b: item.partySize,
                                  })}
                                </span>
                              ) : null}
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
                  })
                )}
              </div>
            )}
          </>
        )}
      </div>

      <GuestConfirmCard
        visible={Boolean(confirming)}
        guest={confirming}
        busy={Boolean(admitting)}
        phonePending={phonePending}
        onCancel={() => setConfirming(null)}
        onConfirm={(guest, arrived) => void admitGuest(guest, arrived)}
      />
    </main>
  )
}

/** @deprecated Use ManualCheckinForm — kept as an alias for older imports. */
export const ManualCheckinSheet = ManualCheckinForm
