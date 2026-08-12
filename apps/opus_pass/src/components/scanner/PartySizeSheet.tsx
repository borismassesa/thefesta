'use client'

import { useRef, useState } from 'react'
import { Check, CheckCircle2, Loader2, Minus, Plus, X } from 'lucide-react'
import { GuestAvatar } from './GuestAvatar'
import { PartyBadge } from './PartyBadge'
import { Sheet } from './Sheet'
import { Button } from '@/components/ui/button'
import { useScannerT } from '@/hooks/useScannerT'
import { clampArrived, partySizeLabel } from '@/lib/scanner/roster'
import { cn } from '@/lib/utils'

/** Soft success green — present, but secondary to the headcount decision. */
const PASS_STRIP_BG = '#E8F5EE'
const PASS_STRIP_FG = '#1B7F4C'

interface PartySizeSheetProps {
  visible: boolean
  guestName: string
  /** What the guest RSVP'd for, and the ceiling on what can be admitted. */
  partySize: number
  groupTag?: string | null
  busy?: boolean
  onCancel: () => void
  /** Fires with the confirmed headcount, including the unchanged full party —
   *  the caller decides whether that needs a correction request. */
  onSubmit: (arrived: number) => void
}

/**
 * Headcount confirmation after a party pass scans in.
 *
 * Ticket language only: Single, Double, Wakwe — never “full party”.
 * Double: two big taps (Single or Double). Wakwe / larger: − / + stepper
 * clamped to 1…invited. Buttons use the Opus lavender system.
 * Closing (X, backdrop, Escape) keeps the scanned ticket count already stored.
 */
export function PartySizeSheet({
  visible,
  guestName: incomingName,
  partySize: incomingPartySize,
  groupTag: incomingGroupTag,
  busy = false,
  onCancel,
  onSubmit,
}: PartySizeSheetProps) {
  const t = useScannerT()

  // The caller closes this by clearing the prompt, so hold the last guest to
  // render through the transition instead of emptying the card mid-close.
  const lastGuest = useRef({ guestName: '', partySize: 1, groupTag: incomingGroupTag })
  if (incomingName) {
    lastGuest.current = {
      guestName: incomingName,
      partySize: incomingPartySize,
      groupTag: incomingGroupTag,
    }
  }
  const { guestName, partySize, groupTag } = lastGuest.current
  const isDouble = partySize === 2

  const [arrived, setArrived] = useState(incomingPartySize)
  // Seed in render so Double → Wakwe never keeps the previous headcount.
  const openSeed = visible ? `${incomingName}|${incomingPartySize}` : null
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (visible && openSeed !== seededFor) {
    setSeededFor(openSeed)
    setArrived(incomingPartySize)
  } else if (!visible && seededFor !== null) {
    setSeededFor(null)
  }

  const valid = clampArrived(arrived, partySize) === arrived && arrived >= 1
  const entireTicket = arrived === partySize

  const submit = () => {
    if (!valid || busy) return
    onSubmit(arrived)
  }

  const ctaLabel =
    arrived === 1 ? t('check_in_1_guest') : t('check_in_n_guests', { n: arrived })

  return (
    <Sheet open={visible} onClose={onCancel} label={t('how_many_arrived')} fit="content">
      <div className="flex shrink-0 items-center px-4 pt-4">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={t('close')}
          onClick={onCancel}
        >
          <X size={20} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1 pb-3">
        <h2 className="text-2xl font-bold text-[#1A1A1A]">{t('how_many_arrived')}</h2>
        <p className="mt-1 text-sm leading-snug text-[#1A1A1A]/60">
          {t('invited_for_n', { name: guestName, n: partySize })}
        </p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-black/8 bg-white">
          <div
            className="flex items-center gap-2 px-4 py-2"
            style={{ backgroundColor: PASS_STRIP_BG, color: PASS_STRIP_FG }}
          >
            <CheckCircle2 size={15} color={PASS_STRIP_FG} />
            <span className="text-[11px] font-semibold tracking-wide uppercase">{t('pass_accepted')}</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <GuestAvatar fullName={guestName} size={44} colorKey={groupTag} />
            <p className="min-w-0 flex-1 line-clamp-2 text-base font-bold text-[#1A1A1A]">{guestName}</p>
            <PartyBadge partySize={partySize} />
          </div>
        </div>

        {isDouble ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {([1, 2] as const).map((n) => {
              const selected = arrived === n
              return (
                <button
                  key={n}
                  type="button"
                  data-opus-button="control"
                  disabled={busy}
                  onClick={() => setArrived(n)}
                  aria-pressed={selected}
                  className={cn(
                    'relative flex flex-col items-center justify-center rounded-2xl px-3 py-4 transition-colors',
                    selected
                      ? 'bg-[var(--opus-button-primary,#C9A0DC)] text-[var(--opus-button-on-primary,#2d163f)]'
                      : 'border border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f9fafb]',
                  )}
                >
                  {selected ? (
                    <span className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--opus-button-on-primary,#2d163f)]/12">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  ) : null}
                  <span className="text-3xl font-bold tabular-nums leading-none">{n}</span>
                  <span
                    className={cn(
                      'mt-1.5 text-xs font-semibold',
                      selected ? 'text-[var(--opus-button-on-primary,#2d163f)]/75' : 'text-[#374151]/70',
                    )}
                  >
                    {partySizeLabel(n)}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-center text-xs font-semibold tracking-wide text-[#1A1A1A]/45 uppercase">
              {t('guests_arriving')}
            </p>
            <div className="mt-3 flex items-center justify-center gap-5">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label={t('decrease_count')}
                disabled={busy || arrived <= 1}
                onClick={() => setArrived((n) => clampArrived(n - 1, partySize))}
                className="h-14 w-14"
              >
                <Minus size={22} strokeWidth={2.5} />
              </Button>
              <span className="min-w-[3ch] text-center text-5xl font-bold tabular-nums text-[#1A1A1A]">
                {arrived}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label={t('increase_count')}
                disabled={busy || arrived >= partySize}
                onClick={() => setArrived((n) => clampArrived(n + 1, partySize))}
                className="h-14 w-14"
              >
                <Plus size={22} strokeWidth={2.5} />
              </Button>
            </div>
            <p className="mt-3 text-center text-sm font-semibold text-[#1A1A1A]">
              {t('n_of_m', { a: arrived, b: partySize })}
            </p>
            {entireTicket ? (
              <p className="mt-0.5 text-center text-xs text-[#1A1A1A]/55">
                {t('ticket_arriving', { ticket: partySizeLabel(partySize) })}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-black/8 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <Button
          type="button"
          size="lg"
          disabled={!valid || busy}
          onClick={submit}
          className="w-full font-bold"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : ctaLabel}
        </Button>
      </div>
    </Sheet>
  )
}
