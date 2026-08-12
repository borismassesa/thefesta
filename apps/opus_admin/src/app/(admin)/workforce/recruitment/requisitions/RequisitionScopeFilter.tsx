'use client'

import { useTransition } from 'react'
import { ListFilter } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export default function RequisitionScopeFilter({ mine }: { mine: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  function changeScope(value: string) {
    const next = new URLSearchParams(searchParams.toString())
    if (value === 'mine') next.set('mine', '1')
    else next.delete('mine')

    const query = next.toString()
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname))
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="requisition-scope" className="text-xs font-semibold text-gray-600">
        View
      </label>
      <div className="relative">
        <ListFilter
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        />
        <select
          id="requisition-scope"
          value={mine ? 'mine' : 'all'}
          disabled={pending}
          onChange={(event) => changeScope(event.target.value)}
          className="h-9 min-w-44 rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-8 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] disabled:opacity-60"
        >
          <option value="all">All requisitions</option>
          <option value="mine">Assigned to me</option>
        </select>
      </div>
    </div>
  )
}
