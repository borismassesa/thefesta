'use client'

import { useState, useTransition } from 'react'
import { UserCheck, X, Phone } from 'lucide-react'
import { approveReviewGuest, dismissReviewGuest } from '@/lib/dashboard/actions'
import type { GuestWithInvitations } from '@/lib/dashboard/types'

const STATUS_TEXT: Record<string, string> = {
  attending: 'Attending',
  maybe: 'Maybe',
  declined: 'Declined',
  pending: 'Pending',
}

export default function ReviewQueue({ initial }: { initial: GuestWithInvitations[] }) {
  const [guests, setGuests] = useState(initial)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  if (guests.length === 0) return null

  function act(id: string, fn: (id: string) => Promise<void>) {
    setPendingId(id)
    startTransition(async () => {
      try {
        await fn(id)
        setGuests((prev) => prev.filter((g) => g.id !== id))
      } finally {
        setPendingId(null)
      }
    })
  }

  return (
    <section className="mb-6 rounded-2xl border border-[#9FE870]/60 bg-[#9FE870]/12 p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-[#14342B]">
          Needs review · {guests.length}
        </h2>
        <p className="text-sm text-[#1A1A1A]/60">
          These guests RSVP’d through your shared link. Approve to add them to your roster, or dismiss
          if you don’t recognise them.
        </p>
      </div>

      <ul className="space-y-2.5">
        {guests.map((g) => {
          const status = g.invitations[0]?.rsvp_status
          const party = g.invitations.find((i) => i.rsvp_status === 'attending')?.party_size
          const busy = pendingId === g.id
          return (
            <li
              key={g.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/[0.08] bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-[#1A1A1A]">{g.full_name}</p>
                <p className="flex items-center gap-2 text-xs text-[#1A1A1A]/55">
                  {g.phone ? (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {g.phone}
                    </span>
                  ) : null}
                  {status ? (
                    <span>
                      · {STATUS_TEXT[status] ?? status}
                      {status === 'attending' && party && party > 1 ? ` (party of ${party})` : ''}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button data-opus-button="control"
                  onClick={() => act(g.id, approveReviewGuest)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#14342B] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0f2a22] disabled:opacity-50"
                >
                  <UserCheck className="h-3.5 w-3.5" /> Approve
                </button>
                <button data-opus-button="neutral" data-opus-button-size="small"
                  onClick={() => act(g.id, dismissReviewGuest)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-xs font-semibold text-[#1A1A1A]/70 hover:bg-black/[0.03] disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Dismiss
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
