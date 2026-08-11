'use client'

import { useEffect } from 'react'
import { AlertCircle, RotateCw } from 'lucide-react'

export default function AttireAndRingsCmsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[opus_admin] attire-and-rings CMS editor error:', error)
  }, [error])

  return (
    <div className="bg-white border border-red-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-gray-900">
            This editor failed to load
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            The other CMS sections in the sidebar should still work. Reload to
            try again, or share this error with the engineering team.
          </p>
          <pre className="mt-3 text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap break-words text-gray-700">
            {error?.message || 'Unknown error'}
            {error?.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>
          <button data-opus-button="primary" data-opus-button-size="small"
            type="button"
            onClick={() => reset()}
            className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#C9A0DC] hover:bg-[#b97fd0] text-[#1A1A1A] text-sm font-semibold transition-colors"
          >
            <RotateCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}
