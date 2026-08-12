'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { PERF_PERIODS } from './_range'

// Calendar-period selector (This week / month / quarter). Pushes ?range=
// onto the current path so the server component re-fetches with the new
// window. Works on both the team list and the per-employee detail.
export default function RangeTabs({ active }: { active: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
      {PERF_PERIODS.map((r) => {
        const isActive = r.value === active
        return (
          <button data-opus-button="primary" data-opus-button-size="small"
            key={r.value}
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => router.push(`${pathname}?range=${r.value}`))}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {r.label}
          </button>
        )
      })}
    </div>
  )
}
