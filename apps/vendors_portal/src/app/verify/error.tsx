'use client'

import { useEffect } from 'react'

// /verify sits outside the (portal) route group, so without this boundary a
// thrown server error (e.g. the loud agreements-read failure in page.tsx)
// lands on Next's unstyled default crash page — on the one gate every vendor
// must pass to get activated.
export default function VerifyError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[verify] route error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-[#FDFDFD]">
      <div className="max-w-md w-full rounded-2xl border border-gray-100 bg-white p-8 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <h1 className="text-xl font-semibold text-gray-900">
          Something went wrong loading your verification.
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Your progress is saved. Try again in a moment, or refresh the page.
          If it keeps happening, email{' '}
          <a
            href="mailto:vendors@opusfesta.com"
            className="font-semibold text-gray-700 underline underline-offset-2"
          >
            vendors@opusfesta.com
          </a>
          .
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
