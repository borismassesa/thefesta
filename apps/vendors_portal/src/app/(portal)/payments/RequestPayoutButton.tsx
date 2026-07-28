'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, CheckCircle2, Loader2 } from 'lucide-react'
import { requestPayout } from './actions'

function tzs(n: number): string {
  return `TZS ${Math.round(n).toLocaleString('en-US')}`
}

// The vendor's "cash out" control. Requesting stamps the pending balance for the
// next weekly Monday batch (finance settles it). No money moves here — it flags
// intent. Once requested, the button becomes a confirmed state.
export function RequestPayoutButton({
  amountTzs,
  alreadyRequested,
  nextPayoutLabel,
}: {
  amountTzs: number
  alreadyRequested: boolean
  nextPayoutLabel: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(alreadyRequested)

  if (done) {
    return (
      <p className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-[#9FE870]">
        <CheckCircle2 className="h-4 w-4" /> Payout requested · pays {nextPayoutLabel}
      </p>
    )
  }

  const onClick = () => {
    setError(null)
    startTransition(async () => {
      const res = await requestPayout()
      if (res.ok) {
        setDone(true)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl bg-[#9FE870] px-5 py-2.5 text-sm font-bold text-[#1A1A1A] transition hover:brightness-95 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
        Cash out {tzs(amountTzs)}
      </button>
      {error && <p className="mt-1.5 text-xs font-medium text-rose-300">{error}</p>}
    </div>
  )
}
