'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Users } from 'lucide-react'
import { Button, Field, inputClass } from '@/components/dashboard/controls'
import { confirmSharedContact } from '@/lib/dashboard/actions'

/**
 * Resolving a shared number.
 *
 * The delivery gate holds back guests who share a handset with someone else.
 * Without a way to clear that, the gate is a dead end: an admin sees "not
 * deliverable" and has nowhere to go. This is that way, and deliberately the
 * only one.
 *
 * Two outcomes, and the destructive-looking one is not the default:
 *
 *  - Correct the number. Usually right — a repeated number is far more often
 *    a copy-paste slip than a real shared handset.
 *  - Confirm they genuinely share it. Requires a reason, which is stored with
 *    the approver and the time. Both guests stay separate records with their
 *    own RSVP, pledge, seat and QR; they simply both get messaged on that one
 *    number, and the send preview says so every time.
 *
 * Nothing here merges or deletes a guest. "Keep both" is a decision about
 * contact details, never about identity.
 */
export function ResolveSharedContact({
  guests,
  phone,
  onCorrectNumber,
  onResolved,
}: {
  /** Everyone holding this number. Always two or more. */
  guests: { id: string; name: string }[]
  phone: string
  /** Hand back to the edit form so the admin can retype one number. */
  onCorrectNumber: (guestId: string) => void
  onResolved: () => void
}) {
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    const trimmed = reason.trim()
    if (!trimmed) {
      toast.error('Give a reason before confirming a shared number.')
      return
    }
    setBusy(true)
    try {
      const res = await confirmSharedContact(guests.map((g) => g.id), trimmed)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(`Shared number confirmed for ${guests.length} guests.`)
      onResolved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not confirm')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-900">
        <span className="flex items-center gap-1.5 font-semibold">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {guests.length} guests share {phone}
        </span>
        <p className="mt-1">
          None of them can be sent a message, a digital card or an entrance pass until this is settled. Sending as-is
          would put {guests.length} paid messages on one handset.
        </p>
      </div>

      <ul className="divide-y divide-black/[0.06] overflow-hidden rounded-xl border border-black/[0.1]">
        {guests.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="text-sm font-medium text-[#1A1A1A]">{g.name}</span>
            <button
              type="button"
              onClick={() => onCorrectNumber(g.id)}
              className="rounded-lg px-2 py-1 text-xs font-medium text-[#1A1A1A]/70 underline-offset-2 hover:bg-black/[0.05] hover:underline"
            >
              Correct this number
            </button>
          </li>
        ))}
      </ul>

      {confirming ? (
        <div className="space-y-3 rounded-xl border border-black/[0.1] bg-white p-4">
          <Field
            label="Why do these guests share one number?"
            hint="Stored with your name and the time, so the decision can be traced later."
          >
            <textarea
              className={inputClass}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Husband and wife use one handset."
            />
          </Field>
          <p className="text-xs leading-relaxed text-[#1A1A1A]/60">
            Both guests keep their own RSVP, seat, pledge and entrance pass. They will each receive a message on this
            number, and every send will say so before it runs.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Back
            </Button>
            <Button onClick={confirm} disabled={busy || !reason.trim()}>
              {busy ? 'Confirming…' : 'Confirm shared number'}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.12] px-3 py-2 text-xs font-medium text-[#1A1A1A]/75 hover:bg-black/[0.03]"
        >
          <Users className="h-3.5 w-3.5" aria-hidden />
          They really do share this number
        </button>
      )}
    </div>
  )
}
