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
import { ConfirmDialog } from '@/components/scanner/ConfirmDialog'
import ScannerVisual from '@/components/scanner/ScannerVisual'
import { ScannerLocaleToggle } from '@/components/scanner/ScannerLocaleToggle'
import { resolveAccessCode, validateScannerSession } from '@/lib/scanner/api/checkin'
import { getErrorMessage } from '@/lib/scanner/errors'
import { useScannerSession } from '@/hooks/useScannerSession'
import { useScannerT } from '@/hooks/useScannerT'
import type { ScannerStringKey } from '@/lib/scanner/i18n'
import { cn } from '@/lib/utils'

/** Brand green used for live/active status pills across the product. */
const LIVE_GREEN = '#9FE870'
const ACCENT = '#C9A0DC'
const ON_ACCENT = '#1A1A1A'

const STEPS: { icon: LucideIcon; titleKey: ScannerStringKey; bodyKey: ScannerStringKey }[] = [
  { icon: KeyRound, titleKey: 'step_code_title', bodyKey: 'step_code_body' },
  { icon: ScanLine, titleKey: 'step_scan_title', bodyKey: 'step_scan_body' },
  { icon: CheckCheck, titleKey: 'step_done_title', bodyKey: 'step_done_body' },
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
  const t = useScannerT()

  const [code, setCode] = useState('')
  const [attendantName, setAttendantName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Set when an attendant with a running shift asks to enter a different code. */
  const [showCodeForm, setShowCodeForm] = useState(false)
  /** In-app confirm for ending or starting a new shift (not window.confirm). */
  const [confirmAction, setConfirmAction] = useState<'end' | 'new' | null>(null)

  /** The running shift, or null while we're deliberately showing the code form
   *  over the top of it. */
  const activeShift = showCodeForm ? null : session

  const runConfirm = () => {
    if (confirmAction === 'end') {
      clearSession()
      setShowCodeForm(false)
    } else if (confirmAction === 'new') {
      setShowCodeForm(true)
    }
    setConfirmAction(null)
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
      router.push(`/entrance-card-scanner/event/${resolved.eventId}/scan`)
    } catch (err) {
      setError(getErrorMessage(err, t('something_went_wrong')))
    } finally {
      setBusy(false)
    }
  }

  const resumeShift = () => {
    if (session) router.push(`/entrance-card-scanner/event/${session.eventId}/scan`)
  }

  const canStart = Boolean(code.trim()) && !busy

  return (
    <main className="flex min-h-dvh flex-col bg-white">
      {/* Logo stays in document flow so it never overlaps the form on
          short phones the way an absolute header did. */}
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-2 sm:px-8 sm:pt-[max(env(safe-area-inset-top),1.25rem)] lg:px-12">
        <Image
          src="/assets/logo/OpusPass Logo.svg"
          alt="OpusPass"
          width={203}
          height={65}
          priority
          unoptimized
          className="h-7 w-auto sm:h-9 lg:h-10"
        />
        <ScannerLocaleToggle />
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-4 sm:px-8 sm:pb-[max(env(safe-area-inset-bottom),2rem)] sm:pt-8 lg:flex-row lg:items-center lg:justify-center lg:gap-16 lg:px-12 lg:pt-4 xl:gap-24 xl:px-20">
        <div
          className={cn(
            'mx-auto flex w-full min-w-0 max-w-md flex-col lg:mx-0 lg:max-w-md xl:max-w-lg',
            activeShift && 'flex-1 justify-center lg:flex-none',
          )}
        >
          {isLoading ? (
            <div className="flex justify-center py-16 sm:py-20">
              <Loader2 className="h-6 w-6 animate-spin text-[#8e57b3]" />
            </div>
          ) : activeShift ? (
            /* Mid-shift: center the control card in leftover viewport height
               so phone, tablet and desktop don't strand it under empty space. */
            <div className="w-full py-2 sm:py-4">
              {session && showCodeForm ? (
                <div className="mb-3 flex justify-end sm:mb-4">
                  <button
                    type="button"
                    onClick={() => setShowCodeForm(false)}
                    className="flex h-10 items-center gap-1.5 rounded-full px-4"
                    style={{ backgroundColor: LIVE_GREEN }}
                  >
                    <QrCode size={14} color="#1A1A1A" />
                    <span className="text-xs font-bold text-[#1A1A1A]">{t('your_shift')}</span>
                  </button>
                </div>
              ) : null}

              <div className="rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:rounded-3xl sm:p-5 md:p-6">
                {/* Title and status share a row when width allows; stack on
                    the narrowest screens so a long event name doesn't crush
                    the pill. */}
                <div className="flex flex-col gap-2 min-[400px]:flex-row min-[400px]:items-start min-[400px]:justify-between min-[400px]:gap-3">
                  <h1 className="line-clamp-2 min-w-0 flex-1 text-lg font-bold text-[#1A1A1A] sm:text-xl md:text-2xl">
                    {activeShift.eventName ?? t('your_shift')}
                  </h1>
                  <span
                    className="w-fit shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#1A1A1A]"
                    style={{ backgroundColor: LIVE_GREEN }}
                  >
                    {t('shift_in_progress')}
                  </span>
                </div>

                {/* Door and attendant as separate icon-led facts. */}
                <div className="mt-2.5 flex flex-col gap-1.5 min-[380px]:mt-3 min-[380px]:flex-row min-[380px]:flex-wrap min-[380px]:items-center min-[380px]:gap-x-5">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-[#1A1A1A]/60 sm:text-sm">
                    <ScanLine size={15} className="shrink-0" />
                    <span className="truncate">{activeShift.doorLabel}</span>
                  </span>
                  {activeShift.attendantName ? (
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-[#1A1A1A]/60 sm:text-sm">
                      <User size={14} className="shrink-0" />
                      <span className="truncate">{activeShift.attendantName}</span>
                    </span>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={resumeShift}
                  className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full sm:mt-5 sm:h-12 md:h-14"
                  style={{ backgroundColor: ACCENT }}
                >
                  <QrCode size={17} color={ON_ACCENT} />
                  <span
                    className="text-xs font-bold uppercase tracking-[1px] sm:text-sm"
                    style={{ color: ON_ACCENT }}
                  >
                    {t('continue_scanning')}
                  </span>
                </button>

                {/* Side-by-side from ~360px; stack on the tiniest phones so
                    long Swahili labels keep a ≥44px tap target. */}
                <div className="mt-2.5 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:mt-3 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => router.push(`/entrance-card-scanner/event/${activeShift.eventId}/arrivals`)}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-black/12 px-2.5 py-2.5 sm:h-12 sm:py-0"
                  >
                    <Users size={15} color="#1A1A1A" className="shrink-0" />
                    <span className="text-center text-[11px] font-semibold leading-tight text-[#1A1A1A] sm:text-xs">
                      {t('arrivals')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/entrance-card-scanner/event/${activeShift.eventId}/guests`)}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-black/12 px-2.5 py-2.5 sm:h-12 sm:py-0"
                  >
                    <List size={15} color="#1A1A1A" className="shrink-0" />
                    <span className="text-center text-[11px] font-semibold leading-tight text-[#1A1A1A] sm:text-xs">
                      {t('guest_list')}
                    </span>
                  </button>
                </div>
              </div>

              {/* Both shift-level actions are real buttons, not text links:
                  each one costs the attendant their current session. */}
              <div className="mt-3 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:mt-4 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmAction('new')}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#1B7F4C] px-3 sm:h-12"
                >
                  <Plus size={17} color="#1B7F4C" className="shrink-0" />
                  <span className="text-[11px] font-bold text-[#1B7F4C] sm:text-xs">{t('new_shift')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction('end')}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#B3261E] px-3 sm:h-12"
                >
                  <LogOut size={16} color="#B3261E" className="shrink-0" />
                  <span className="text-[11px] font-bold text-[#B3261E] sm:text-xs">{t('end_shift')}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full">
              <h1 className="text-xl font-bold tracking-tight text-[#1A1A1A] sm:text-2xl lg:text-3xl">
                {t('check_in_title')}
              </h1>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-[#1A1A1A]/60 sm:mt-3">
                {t('check_in_body')}
              </p>

              <div className="mt-5 rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:mt-6 sm:rounded-3xl sm:p-5 md:p-6">
                <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#1A1A1A]/50">
                  {t('access_code')}
                </span>
                <Field
                  icon={KeyRound}
                  value={code}
                  onChange={(next) => {
                    setCode(next)
                    if (error) setError(null)
                  }}
                  placeholder={t('access_code_placeholder')}
                  onSubmit={handleStart}
                  autoCapitalize="none"
                  autoComplete="off"
                />

                <div className="mt-5 sm:mt-6">
                  <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#1A1A1A]/50">
                    {t('your_name')}
                  </span>
                  {/* One line, no caveat: the "code already has a name" case
                      resolves itself server-side. */}
                  <p className="mt-1.5 text-xs leading-5 text-[#1A1A1A]/60">{t('your_name_hint')}</p>
                  <Field
                    icon={User}
                    value={attendantName}
                    onChange={setAttendantName}
                    placeholder={t('your_name_placeholder')}
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
                  className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-full transition-colors sm:mt-6 sm:h-12 md:h-14"
                  style={{ backgroundColor: canStart ? ACCENT : 'rgba(26,26,26,0.08)' }}
                >
                  {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin" style={{ color: ON_ACCENT }} />
                  ) : (
                    <>
                      <span
                        className="text-xs font-bold uppercase tracking-[1px] sm:text-sm"
                        style={{ color: canStart ? ON_ACCENT : 'rgba(26,26,26,0.5)' }}
                      >
                        {t('start_scanning')}
                      </span>
                      <ArrowRight size={16} color={canStart ? ON_ACCENT : 'rgba(26,26,26,0.5)'} />
                    </>
                  )}
                </button>

                <div className="mt-4 flex items-center justify-center gap-1.5 px-1 text-center">
                  <Lock size={12} className="shrink-0" color="#059669" />
                  <span className="text-xs text-[#1A1A1A]/60">{t('access_codes_one_event')}</span>
                </div>
              </div>

              {/* How it works — gives the lower half of the screen a job
                  instead of leaving it empty under the form. */}
              <h2 className="mt-7 text-[10px] font-bold uppercase tracking-[2px] text-[#1A1A1A]/50 sm:mt-9">
                {t('how_shift_runs')}
              </h2>
              <div className="mt-3.5">
                {STEPS.map((step, index) => (
                  <div key={step.titleKey} className="flex gap-3.5">
                    {/* Rail: icon node plus the connector to the next step. */}
                    <div className="flex flex-col items-center">
                      <div className="flex h-9 w-9 items-center justify-center">
                        <step.icon size={18} color="#1A1A1A" />
                      </div>
                      {index < STEPS.length - 1 ? <div className="w-px flex-1 bg-black/10" /> : null}
                    </div>
                    <div className={index < STEPS.length - 1 ? 'min-w-0 flex-1 pb-5' : 'min-w-0 flex-1'}>
                      <p className="text-xs font-bold text-[#1A1A1A]">{t(step.titleKey)}</p>
                      <p className="mt-0.5 text-xs leading-5 text-[#1A1A1A]/60">{t(step.bodyKey)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Decorative only — door staff almost always work on a phone, so
            the illustration stays desktop-only. */}
        <div className="hidden shrink-0 lg:block lg:h-72 lg:w-72 xl:h-105 xl:w-105">
          <ScannerVisual />
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction === 'end' ? t('end_shift_title') : t('new_shift_title')}
        body={
          confirmAction === 'end'
            ? t('end_shift_body')
            : t('new_shift_body', { event: session?.eventName ?? t('your_current_shift') })
        }
        tone={confirmAction === 'end' ? 'danger' : 'accent'}
        confirmLabel={confirmAction === 'end' ? t('end_shift') : t('new_shift')}
        cancelLabel={t('cancel')}
        onConfirm={runConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </main>
  )
}
