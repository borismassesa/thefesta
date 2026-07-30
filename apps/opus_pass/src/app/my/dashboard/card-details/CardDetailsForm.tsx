'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'
import type { CardDetailRequest } from '@/lib/dashboard/card-details'
import { cardFieldCopy } from '@/lib/dashboard/card-details-labels'

export type SaveCardDetails = (
  designId: string,
  answers: Record<string, string>,
) => Promise<{ ok: true; remaining: number } | { ok: false; error: string }>

export default function CardDetailsForm({
  requests,
  save,
  intro,
}: {
  requests: CardDetailRequest[]
  /** Passed in so the same form serves the signed-in page and the public link. */
  save: SaveCardDetails
  intro?: string
}) {
  if (requests.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <h1 className="mt-4 text-xl font-semibold text-gray-900">Nothing to fill in</h1>
        <p className="mt-2 text-sm text-gray-500">
          Our design team will let you know here if they need any details for your cards.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Your card details</h1>
        <p className="mt-1 text-sm text-gray-500">
          {intro ??
            `Our designers need a few details before they can finish your ${
              requests.length === 1 ? 'card' : 'cards'
            }. What you type here goes straight onto the design.`}
        </p>
      </header>

      {requests.map((request) => (
        <RequestCard key={request.designId} request={request} save={save} />
      ))}
    </div>
  )
}

function RequestCard({ request, save }: { request: CardDetailRequest; save: SaveCardDetails }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(request.requested.map((role) => [role, request.values[role] ?? ''])),
  )

  const filled = request.requested.filter((role) => (answers[role] ?? '').trim()).length

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await save(request.designId, answers)
        if (!result.ok) setError(result.error)
        else {
          setDone(true)
          router.refresh()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save. Please try again.')
      }
    })
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-gray-100 ring-1 ring-gray-200">
          {request.cardImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={request.cardImage} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{request.cardName}</p>
          <p className="text-xs text-gray-500">
            Order {request.orderRef} · {filled}/{request.requested.length} filled
          </p>
        </div>
      </div>

      <div className="space-y-4 px-5 py-5">
        {request.requested.map((role) => {
          const copy = cardFieldCopy(role)
          return (
            <div key={role} className="space-y-1.5">
              <label htmlFor={`f-${request.designId}-${role}`} className="block">
                <span className="text-sm font-medium text-gray-900">{copy.label}</span>
                {/* Always visible: this form is filled once, by someone who has
                    not been trained on it, and a wrong answer is printed on
                    every card. */}
                {copy.hint && (
                  <span
                    id={`h-${request.designId}-${role}`}
                    className="mt-0.5 block text-xs leading-snug text-gray-500"
                  >
                    {copy.hint}
                  </span>
                )}
              </label>
              <input
                id={`f-${request.designId}-${role}`}
                aria-describedby={copy.hint ? `h-${request.designId}-${role}` : undefined}
                value={answers[role] ?? ''}
                placeholder={copy.example}
                onChange={(e) => {
                  setDone(false)
                  setAnswers((prev) => ({ ...prev, [role]: e.target.value }))
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC]"
              />
            </div>
          )
        })}

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        {done && !error && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Sent to our design team.
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={pending || filled === 0}
          className="flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6b4a80] disabled:opacity-50"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Send details
        </button>
      </div>
    </section>
  )
}
