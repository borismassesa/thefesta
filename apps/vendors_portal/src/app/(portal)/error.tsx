'use client'

import { useEffect } from 'react'

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[portal] route error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-[#FDFDFD]">
      <div className="max-w-md w-full rounded-2xl border border-gray-100 bg-white p-8 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <h1 className="text-xl font-semibold text-gray-900">
          Something went wrong loading this page.
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          We hit an unexpected error. Try again, or refresh the page. If it
          keeps happening, contact your team owner.
        </p>
        {error.digest && (
          <p className="mt-3 text-[11px] font-mono text-gray-400">
            Reference: {error.digest}
          </p>
        )}
        <button data-opus-button="primary" data-opus-button-size="medium"
          type="button"
          onClick={reset}
          className="mt-6 bg-gray-900 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-800 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
