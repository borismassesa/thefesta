'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  AlertCircle,
  ArrowRight,
  CheckCheck,
  KeyRound,
  List,
  Loader2,
  Lock,
  LogOut,
  Plus,
  QrCode,
  ScanLine,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react'
import ScannerVisual from '@/components/ScannerVisual'
import { resolveAccessCode, validateScannerSession } from '@/lib/api/checkin'
import { getErrorMessage } from '@/lib/errors'
import { useScannerSession } from '@/hooks/useScannerSession'

/** Brand green used for live/active status pills across the product. */
const LIVE_GREEN = '#9FE870'
const ACCENT = '#C9A0DC'
const ON_ACCENT = '#1A1A1A'

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: KeyRound,
    title: 'Enter your access code',
    body: 'The couple or the OpusFesta team gives you this before the event.',
  },
  {
    icon: ScanLine,
    title: 'Scan entrance tickets',
    body: 'Point the camera at the QR code on each guest’s ticket.',
  },
  {
    icon: CheckCheck,
    title: 'Guests are checked in',
    body: 'Arrivals update live for the couple and the OpusFesta team.',
  },
]

/** Input with a leading glyph and a focus ring — plain bordered boxes read as unfinished. */
function Field({
  icon: Icon,
  value,
  onChange,
  placeholder,
  onSubmit,
  autoCapitalize,
  autoComplete,
}: {
  icon: LucideIcon
  value: string
  onChange: (next: string) => void
  placeholder: string
  onSubmit: () => void
  autoCapitalize: string
  autoComplete?: string
}) {
  const [focused, setFocused] = useState(false)

  return (
    <div
      className="mt-2 flex items-center gap-3 rounded-2xl bg-black/3 px-4"
      style={{
        borderWidth: focused ? 1.5 : 1,
        borderColor: focused ? ACCENT : 'rgba(26,26,26,0.12)',
      }}
    >
      <Icon size={18} className="shrink-0" color={focused ? '#8e57b3' : 'rgba(26,26,26,0.5)'} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect="off"
        enterKeyHint="go"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onSubmit()
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full bg-transparent py-3.5 text-base text-[#1A1A1A] outline-none placeholder:text-[#1A1A1A]/40"
      />
    </div>
  )
}

/**
 * Scanner entry — the web twin of the mobile app's /scanner screen.
 *
 * A door shift is keyed by a door access code, not an account, which is what
 * makes the scanner shareable as a bare link: the couple sends the link (or
 * reads out the code), the attendant opens it, and they are scanning within a
 * minute with no OpusFesta login.
 */
export default function Home() {
  const router = useRouter()
  const { session, isLoading, saveSession, clearSession } = useScannerSession()

  const [code, setCode] = useState('')
  const [attendantName, setAttendantName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Set when an attendant with a running shift asks to enter a different code. */
  const [showCodeForm, setShowCodeForm] = useState(false)

  /** The running shift, or null while we're deliberately showing the code form
   *  over the top of it. */
  const activeShift = showCodeForm ? null : session

  const confirmEndShift = () => {
    if (
      window.confirm("End this shift?\n\nYou'll need the access code again to start scanning for this event.")
    ) {
      clearSession()
      setShowCodeForm(false)
    }
  }

  /** Deliberately gentler than ending a shift, because it is: the saved
   *  session survives until a different code is actually validated. */
  const confirmNewShift = () => {
    const current = session?.eventName ?? 'your current shift'
    if (
      window.confirm(
        `Start a new shift?\n\nYou'll need an access code for the other event. ${current} stays saved until you enter a different one.`
      )
    ) {
      setShowCodeForm(true)
    }
  }

  const handleStart = async () => {
    const trimmed = code.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      const resolved = await resolveAccessCode(trimmed)
      if (!resolved.ok) {
        setError(resolved.error)
        return
      }
      // Resolve only routes; validate is what actually confirms the code is
      // live and gives us the door label + whether an admin already named
      // the attendant.
      const validated = await validateScannerSession(resolved.eventId, trimmed)
      if (!validated.ok) {
        setError(validated.error)
        return
      }
      saveSession({
        eventId: resolved.eventId,
        accessToken: trimmed,
        doorLabel: validated.doorLabel,
        attendantName: validated.attendantName ?? (attendantName.trim() || null),
        eventName: validated.event?.name ?? null,
        expiresAt: validated.expiresAt ?? null,
      })
      router.push(`/event/${resolved.eventId}/scan`)
    } catch (err) {
      setError(getErrorMessage(err, 'Something went wrong.'))
    } finally {
      setBusy(false)
    }
  }

  const resumeShift = () => {
    if (session) router.push(`/event/${session.eventId}/scan`)
  }

  const canStart = Boolean(code.trim()) && !busy

  return (
    <main className="flex min-h-dvh flex-col bg-white">
      {/* Logo stays in document flow so it never overlaps the form on
          short phones the way an absolute header did. */}
      <header className="shrink-0 px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-2 sm:px-8 lg:px-12">
        <Image
          src="/assets/logo/OpusPass Logo.svg"
          alt="OpusPass"
          width={203}
          height={65}
          priority
          unoptimized
          className="h-8 w-auto sm:h-9 lg:h-10"
        />
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pb-[max(env(safe-area-inset-bottom),2rem)] pt-6 sm:px-8 sm:pt-8 lg:flex-row lg:items-center lg:justify-center lg:gap-16 lg:px-12 lg:pt-4 xl:gap-24 xl:px-20">
        <div className="mx-auto w-full min-w-0 max-w-md lg:mx-0 lg:max-w-md lg:flex-none xl:max-w-lg">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-[#8e57b3]" />
            </div>
          ) : activeShift ? (
            /* An attendant mid-shift wants one thing: get back to the camera.
               The shift owns the screen and everything else moves behind a
               toggle. */
            <div>
              {session && showCodeForm ? (
                <div className="mb-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowCodeForm(false)}
                    className="flex h-10 items-center gap-1.5 rounded-full px-4"
                    style={{ backgroundColor: LIVE_GREEN }}
                  >
                    <QrCode size={14} color="#1A1A1A" />
                    <span className="text-xs font-bold text-[#1A1A1A]">Your shift</span>
                  </button>
                </div>
              ) : null}

              <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5">
                {/* Title and status share a row on wider phones; stack on the
                    narrowest screens so a long event name doesn't crush the
                    pill. */}
                <div className="flex flex-col gap-2 min-[400px]:flex-row min-[400px]:items-start min-[400px]:justify-between min-[400px]:gap-3">
                  <h1 className="line-clamp-2 min-w-0 flex-1 text-xl font-bold text-[#1A1A1A] sm:text-2xl">
                    {activeShift.eventName ?? 'Your shift'}
                  </h1>
                  <span
                    className="w-fit shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#1A1A1A]"
                    style={{ backgroundColor: LIVE_GREEN }}
                  >
                    Shift in progress
                  </span>
                </div>

                {/* Door and attendant as separate icon-led facts. */}
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm text-[#1A1A1A]/60">
                    <ScanLine size={15} className="shrink-0" />
                    <span className="truncate">{activeShift.doorLabel}</span>
                  </span>
                  {activeShift.attendantName ? (
                    <span className="flex min-w-0 items-center gap-1.5 text-sm text-[#1A1A1A]/60">
                      <User size={14} className="shrink-0" />
                      <span className="truncate">{activeShift.attendantName}</span>
                    </span>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={resumeShift}
                  className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full sm:h-14"
                  style={{ backgroundColor: ACCENT }}
                >
                  <QrCode size={17} color={ON_ACCENT} />
                  <span className="text-sm font-bold uppercase tracking-[1px]" style={{ color: ON_ACCENT }}>
                    Continue scanning
                  </span>
                </button>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => router.push(`/event/${activeShift.eventId}/arrivals`)}
                    className="flex h-12 items-center justify-center gap-1.5 rounded-full border border-black/12"
                  >
                    <Users size={15} color="#1A1A1A" />
                    <span className="text-xs font-semibold text-[#1A1A1A]">Arrivals</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/event/${activeShift.eventId}/guests`)}
                    className="flex h-12 items-center justify-center gap-1.5 rounded-full border border-black/12"
                  >
                    <List size={15} color="#1A1A1A" />
                    <span className="text-xs font-semibold text-[#1A1A1A]">Guest list</span>
                  </button>
                </div>
              </div>

              {/* Both shift-level actions are real buttons, not text links:
                  each one costs the attendant their current session. */}
              <div className="mt-4 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:gap-3">
                <button
                  type="button"
                  onClick={confirmNewShift}
                  className="flex h-12 items-center justify-center gap-2 rounded-full border border-[#1B7F4C]"
                >
                  <Plus size={17} color="#1B7F4C" />
                  <span className="text-xs font-bold text-[#1B7F4C]">New shift</span>
                </button>
                <button
                  type="button"
                  onClick={confirmEndShift}
                  className="flex h-12 items-center justify-center gap-2 rounded-full border border-[#B3261E]"
                >
                  <LogOut size={16} color="#B3261E" />
                  <span className="text-xs font-bold text-[#B3261E]">End shift</span>
                </button>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A] sm:text-[1.75rem] lg:text-3xl">
                OpusPass Check In
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#1A1A1A]/60">
                Every guest who RSVP&apos;d receives an entrance ticket. Scan its QR code as they arrive to check
                them in.
              </p>

              <div className="mt-6 rounded-3xl border border-black/10 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5">
                <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#1A1A1A]/50">Access code</span>
                <Field
                  icon={KeyRound}
                  value={code}
                  onChange={(next) => {
                    setCode(next)
                    if (error) setError(null)
                  }}
                  placeholder="Paste or type the code"
                  onSubmit={handleStart}
                  autoCapitalize="none"
                  autoComplete="off"
                />

                <div className="mt-6">
                  <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#1A1A1A]/50">Your name</span>
                  {/* One line, no caveat: the "code already has a name" case
                      resolves itself server-side. */}
                  <p className="mt-1.5 text-xs leading-5 text-[#1A1A1A]/60">
                    Recorded against every guest you check in.
                  </p>
                  <Field
                    icon={User}
                    value={attendantName}
                    onChange={setAttendantName}
                    placeholder="e.g. Asha"
                    onSubmit={handleStart}
                    autoCapitalize="words"
                    autoComplete="name"
                  />
                </div>

                {error ? (
                  <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[#B3261E] bg-[#B3261E]/8 p-3">
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#B3261E]" />
                    <span className="min-w-0 flex-1 break-words text-sm text-[#B3261E]">{error}</span>
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={!canStart}
                  onClick={handleStart}
                  className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full transition-colors sm:h-14"
                  style={{ backgroundColor: canStart ? ACCENT : 'rgba(26,26,26,0.08)' }}
                >
                  {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin" style={{ color: ON_ACCENT }} />
                  ) : (
                    <>
                      <span
                        className="text-sm font-bold uppercase tracking-[1px]"
                        style={{ color: canStart ? ON_ACCENT : 'rgba(26,26,26,0.5)' }}
                      >
                        Start scanning
                      </span>
                      <ArrowRight size={16} color={canStart ? ON_ACCENT : 'rgba(26,26,26,0.5)'} />
                    </>
                  )}
                </button>

                <div className="mt-4 flex items-center justify-center gap-1.5 px-1 text-center">
                  <Lock size={12} className="shrink-0" color="#059669" />
                  <span className="text-xs text-[#1A1A1A]/60">Access codes work for one event only.</span>
                </div>
              </div>

              {/* How it works — gives the lower half of the screen a job
                  instead of leaving it empty under the form. */}
              <h2 className="mt-8 text-[10px] font-bold uppercase tracking-[2px] text-[#1A1A1A]/50 sm:mt-9">
                How a shift runs
              </h2>
              <div className="mt-3.5">
                {STEPS.map((step, index) => (
                  <div key={step.title} className="flex gap-3.5">
                    {/* Rail: icon node plus the connector to the next step. */}
                    <div className="flex flex-col items-center">
                      <div className="flex h-9 w-9 items-center justify-center">
                        <step.icon size={18} color="#1A1A1A" />
                      </div>
                      {index < STEPS.length - 1 ? <div className="w-px flex-1 bg-black/10" /> : null}
                    </div>
                    <div className={index < STEPS.length - 1 ? 'min-w-0 flex-1 pb-5' : 'min-w-0 flex-1'}>
                      <p className="text-xs font-bold text-[#1A1A1A]">{step.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-[#1A1A1A]/60">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Decorative only — door staff almost always work on a phone, so
            the illustration stays desktop-only. */}
        <div className="hidden shrink-0 lg:block lg:h-80 lg:w-80 xl:h-105 xl:w-105">
          <ScannerVisual />
        </div>
      </div>
    </main>
  )
}
