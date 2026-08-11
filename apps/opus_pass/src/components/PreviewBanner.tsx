'use client'

import { useTransition } from 'react'
import { Eye } from 'lucide-react'

export function PreviewBanner() {
  const [pending, startTransition] = useTransition()

  const exit = () =>
    startTransition(async () => {
      await fetch('/api/preview/disable', { method: 'POST' })
      window.location.reload()
    })

  return (
    <div className="sticky top-0 z-50 bg-amber-400 text-gray-900 border-b border-amber-500">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold">
          <Eye size={14} />
          Preview mode — showing unpublished draft content
        </div>
        <button data-opus-button="warning" data-opus-button-size="small"
          type="button"
          onClick={exit}
          disabled={pending}
          className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-gray-900 text-amber-400 hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {pending ? 'Exiting…' : 'Exit preview'}
        </button>
      </div>
    </div>
  )
}
