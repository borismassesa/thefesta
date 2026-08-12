'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, Barcode, Loader2, Minus, PenLine, Phone, Plus, Tag, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { GuestAvatar } from './GuestAvatar'
import { Sheet } from './Sheet'
import { clampArrived, partySizeLabel } from '@/lib/scannerRoster'
import type { RosterEntry } from '@/types/checkin'

/** Brand green, matching the live/active pills used elsewhere in the product. */
const LIVE_GREEN = '#9FE870'

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface GuestConfirmCardProps {
  visible: boolean
  guest: RosterEntry | null
  busy?: boolean
  /** Why the last admit attempt failed. The card stays open while this is
   *  set: dismissing on a rejected admit is what makes a guest walk in
   *  against a check-in the server never recorded. */
  error?: string | null
  onCancel: () => void
  /** True while the guest's phone number is still being fetched. The roster
   *  does not carry it, so a guest picked from the list arrives here without
   *  one; showing "Not recorded" during that gap would state as fact the very
   *  thing still being looked up. */
  phonePending?: boolean
  /** Fires with the guest and the confirmed headcount. For a party of 1 the
   *  count is always 1; larger parties default to everyone unless the
   *  attendant steps it down. */
  onConfirm: (guest: RosterEntry, arrived: number) => void
}

/**
 * Confirmation step between picking a guest and admitting them.
 *
 * Manual check-in is the one path with no QR to verify against, so the only
 * safeguard is the attendant reading the right row. A tap that admitted
 * somebody instantly made a mis-tap silent and unrecoverable — first-scan-wins
 * means the real guest then arrives to find themselves already inside. Showing
 * the guest large, with their ticket code and party size, turns that into a
 * deliberate act.
 *
 * Ported from apps/opus_pass_mobile/src/components/scanner/GuestConfirmCard.tsx.
 */
export function GuestConfirmCard({
  visible,
  guest: incomingGuest,
  busy = false,
  error = null,
  phonePending = false,
  onCancel,
  onConfirm,
}: GuestConfirmCardProps) {
  // Callers clear the selection to close, which would empty the card before
  // the sheet has finished sliding away. Holding the last guest keeps the
  // dismissal looking like a dismissal rather than a blank flash.
  const lastGuest = useRef<RosterEntry | null>(null)
  if (incomingGuest) lastGuest.current = incomingGuest
  const guest = incomingGuest ?? lastGuest.current

  // The headcount going in with this confirmation. Defaults to the full party
  // so the common everyone-came case needs no input; the QR scan path asks the
  // same question through PartySizeSheet, and both feed the number the couple
  // is billed against, so a manual admit must not silently assume the RSVP.
  const [arriving, setArriving] = useState(() => clampArrived(incomingGuest?.partySize ?? 1, incomingGuest?.partySize ?? 1))
  const incomingId = incomingGuest?.invitationId
  const incomingParty = incomingGuest?.partySize
  // Reset per guest, not per open: the card stays mounted between guests, and
  // one party's correction must never carry over to the next.
  useEffect(() => {
    if (incomingId) setArriving(clampArrived(incomingParty ?? 1, incomingParty ?? 1))
  }, [incomingId, incomingParty])

  const arrived = Boolean(guest?.checkedInAt)
  const admitted = guest ? (guest.checkedInPartySize ?? guest.partySize) : 0

  const DetailRow = ({ icon: Icon, label, value, first }: { icon: LucideIcon; label: string; value: string; first?: boolean }) => (
    <div className={`flex items-center gap-3 py-4 ${first ? '' : 'border-t border-black/8'}`}>
      <Icon size={20} className="shrink-0 text-[#1A1A1A]/60" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#1A1A1A]">{label}</p>
        <p className="mt-0.5 text-sm text-[#1A1A1A]/60">{value}</p>
      </div>
    </div>
  )

  return (
    <Sheet open={visible && Boolean(guest)} onClose={onCancel} label="Confirm guest">
      {guest ? (
        <>
          {/* Header carries the group the way a delivery app carries the order
              it belongs to: it's the fastest way to catch "right name, wrong
              side of the family". */}
          <div className="flex items-center gap-3 px-4 pb-3 pt-4">
            <button
              type="button"
              aria-label="Back to the guest list"
              onClick={onCancel}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5"
            >
              <ArrowLeft size={20} color="#1A1A1A" />
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
              <GuestAvatar fullName={guest.groupTag || guest.fullName} size={26} colorKey={guest.groupTag} />
              <span className="truncate text-sm font-semibold text-[#1A1A1A]">{guest.groupTag || 'Guest list'}</span>
            </div>
            <div className="h-10 w-10 shrink-0" />
          </div>

          <div className="flex-1 overflow-y-auto pb-4">
            {/* Portrait panel standing in for the product shot: the guest is
                what's being identified, so they get the same visual weight. */}
            <div className="mx-4 flex flex-col items-center justify-center rounded-3xl bg-black/4 py-10">
              <GuestAvatar fullName={guest.fullName} size={112} colorKey={guest.groupTag} />
              {guest.isVip ? (
                <span className="mt-5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[1.5px] text-[#1A1A1A]" style={{ backgroundColor: LIVE_GREEN }}>
                  {guest.groupTag || 'VIP'}
                </span>
              ) : null}
            </div>

            <div className="px-5 pt-5">
              {/* Name alone. The ticket type and the printed code both live in
                  Guest details below: repeating them here made the identity
                  line compete with two pieces of small print. */}
              <h2 className="text-2xl font-bold leading-8 text-[#1A1A1A]">{guest.fullName}</h2>

              {arrived ? (
                <div className="mt-5 flex items-center gap-3 rounded-2xl border border-black/8 p-4">
                  <AlertCircle size={22} className="shrink-0 text-[#B4751A]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#1A1A1A]">Already checked in</p>
                    <p className="mt-0.5 text-sm text-[#1A1A1A]/60">
                      {admitted} of {guest.partySize} admitted at {timeOf(guest.checkedInAt!)}
                    </p>
                    {/* The door is a separate fact from the count, so it gets
                        its own line rather than a middot. */}
                    {guest.checkedInDoor ? (
                      <p className="mt-1 text-sm text-[#1A1A1A]/60">{guest.checkedInDoor}</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-5 flex items-center gap-3 rounded-2xl border border-black/8 p-4">
                  <PenLine size={22} className="shrink-0 text-[#1A1A1A]/60" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#1A1A1A]">Check the guest is who you expect</p>
                    <p className="mt-0.5 text-sm text-[#1A1A1A]/60">
                      No pass was scanned, so this is recorded as a manual check-in on the couple&apos;s report.
                    </p>
                  </div>
                </div>
              )}

              <h3 className="mt-7 text-lg font-bold text-[#1A1A1A]">Guest details</h3>
              <div className="mt-1">
                <DetailRow first icon={UtensilsCrossed} label="Table" value={guest.table ?? 'Not seated'} />
                <DetailRow icon={Barcode} label="Ticket code" value={guest.entryCode ?? 'Not issued'} />
                {/* The number the invitation went to. Two guests with the same
                    name is the case a manual admission has no scanned pass to
                    settle, and this is what settles it. */}
                <DetailRow icon={Phone} label="Phone number" value={guest.phone ?? (phonePending ? 'Checking…' : 'Not recorded')} />
                {/* Named in the language the tickets are sold in — the guest is
                    holding a Single, a Double or a Wakwe, not "1 ct". */}
                <DetailRow icon={Tag} label="Ticket type" value={partySizeLabel(guest.partySize)} />
              </div>
            </div>
          </div>

          {/* Stacked, full width and thumb-height: the attendant is one-handed
              with a phone in the other hand's light. */}
          <div className="border-t border-black/8 px-4 pb-6 pt-3">
            {/* Headcount stepper for parties bigger than one. In the footer,
                not the scrolled detail: it has to be visible next to the
                check-in button it changes, on any screen size. */}
            {!arrived && guest.partySize > 1 ? (
              <div className="mb-3 flex items-center justify-between rounded-2xl border border-black/8 bg-white px-4 py-3">
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-sm font-semibold text-[#1A1A1A]">Arriving now</p>
                  <p className="mt-0.5 text-xs text-[#1A1A1A]/60">Invited {guest.partySize}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Fewer people arriving"
                    disabled={busy || arriving <= 1}
                    onClick={() => setArriving((n) => clampArrived(n - 1, guest.partySize))}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-black/5 disabled:opacity-40"
                  >
                    <Minus size={20} color="#1A1A1A" />
                  </button>
                  <span className="min-w-7 text-center text-xl font-bold text-[#1A1A1A]">{arriving}</span>
                  <button
                    type="button"
                    aria-label="More people arriving"
                    disabled={busy || arriving >= guest.partySize}
                    onClick={() => setArriving((n) => clampArrived(n + 1, guest.partySize))}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-black/5 disabled:opacity-40"
                  >
                    <Plus size={20} color="#1A1A1A" />
                  </button>
                </div>
              </div>
            ) : null}
            {/* Sits with the buttons, not up in the scrolled detail, so it is
                on screen next to the control the attendant just pressed. */}
            {error ? (
              <div role="alert" className="mb-3 flex items-start gap-2 rounded-2xl bg-[#B3261E]/10 px-3 py-3">
                <AlertCircle size={20} className="mt-px shrink-0 text-[#B3261E]" />
                <p className="min-w-0 flex-1 text-sm font-semibold text-[#B3261E]">{error}</p>
              </div>
            ) : null}
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-black/5"
            >
              <span className="text-base font-semibold text-[#1A1A1A]">Not this guest</span>
            </button>
            <button
              type="button"
              disabled={arrived || busy}
              onClick={() => onConfirm(guest, arriving)}
              className="mt-3 flex h-14 w-full items-center justify-center rounded-2xl bg-[#C9A0DC] disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin text-[#1A1A1A]" />
              ) : (
                <span className="text-base font-bold text-[#1A1A1A]">
                  {/* The button restates the number being recorded, so a
                      mis-tapped stepper is caught here rather than on the
                      invoice. */}
                  {arrived
                    ? 'Already checked in'
                    : guest.partySize === 1
                      ? 'Check in'
                      : arriving === guest.partySize
                        ? `Check in party of ${guest.partySize}`
                        : `Check in ${arriving} of ${guest.partySize}`}
                </span>
              )}
            </button>
          </div>
        </>
      ) : null}
    </Sheet>
  )
}
