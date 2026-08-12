'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, X } from 'lucide-react'
import { GuestAvatar } from './GuestAvatar'
import { PartyBadge } from './PartyBadge'
import { Sheet } from './Sheet'
import { clampArrived } from '@/lib/scannerRoster'

/** The success green used by the scan result overlay, so an accepted pass
 *  reads the same whether it lands on the overlay or this card's strip. */
const DEEP_GREEN = '#1B7F4C'

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
 * A typed count rather than a row of numbered buttons: Tanzanian weddings run
 * to parties of ten and more, where a button grid wraps into an unreadable
 * block, and the count is the figure the couple is billed and catered against.
 * The pass has already been accepted at this point, so the guest is through
 * the door either way — this only corrects the number.
 *
 * Ported from apps/opus_pass_mobile/src/components/scanner/PartySizeSheet.tsx.
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

  const [value, setValue] = useState(String(partySize))

  // Reopen for the next guest with their own party pre-filled, not the last
  // guest's correction.
  useEffect(() => {
    if (visible) setValue(String(partySize))
  }, [visible, partySize])

  const parsed = Number.parseInt(value, 10)
  // Valid means the server would record it unchanged — same 1..party_size
  // clamp as checkin_guest_invitation(), via the shared helper.
  const valid = Number.isFinite(parsed) && clampArrived(parsed, partySize) === parsed

  return (
    <Sheet open={visible} onClose={onCancel} label="How many arrived?">
      <div className="flex px-4 pt-4">
        <button
          type="button"
          aria-label="Keep the full party"
          onClick={onCancel}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/5"
        >
          <X size={20} color="#1A1A1A" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-4">
        <h2 className="text-2xl font-bold text-[#1A1A1A]">How many arrived?</h2>

        {/* Green confirmation strip on the card, so the attendant can see the
            pass was accepted while they deal with the count. */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-black/8">
          <div className="flex items-center gap-2 px-4 py-3" style={{ backgroundColor: DEEP_GREEN }}>
            <CheckCircle2 size={18} color="#FFFFFF" />
            <span className="text-sm font-semibold text-white">Pass accepted</span>
          </div>
          <div className="flex items-center gap-3 bg-white p-4">
            <GuestAvatar fullName={guestName} size={48} colorKey={groupTag} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-bold text-[#1A1A1A]">{guestName}</p>
              <p className="mt-0.5 text-xs text-[#1A1A1A]/60">
                {groupTag ? `${groupTag} · ` : ''}Invited {partySize}
              </p>
            </div>
            <PartyBadge partySize={partySize} />
          </div>
        </div>

        <div
          className="mt-6 rounded-2xl border bg-white px-4 py-4"
          style={{ borderColor: valid ? 'rgba(26,26,26,0.2)' : '#B3261E' }}
        >
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
            inputMode="numeric"
            pattern="[0-9]*"
            autoFocus
            onFocus={(e) => e.target.select()}
            disabled={busy}
            placeholder="Enter count arrived"
            className="w-full bg-transparent text-base text-[#1A1A1A] outline-none placeholder:text-[#1A1A1A]/40"
          />
        </div>
        <p className="mt-2 text-xs" style={{ color: valid ? 'rgba(26,26,26,0.6)' : '#B3261E' }}>
          {valid ? `Invited ${partySize}` : `Enter a number between 1 and ${partySize}`}
        </p>
      </div>

      <div className="border-t border-black/8 px-4 pb-6 pt-3">
        <button
          type="button"
          disabled={!valid || busy}
          onClick={() => onSubmit(parsed)}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#1A1A1A] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <span className="text-base font-bold text-white">Done</span>}
        </button>
      </div>
    </Sheet>
  )
}
