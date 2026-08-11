'use client'

// Admin shell error boundary. Catches errors thrown by /(admin)/* pages so
// the rest of the admin chrome (sidebar, header) stays visible and the
// failure is contained to the main content area with an actionable message,
// instead of falling through to Next.js's generic "Application error".

import { useEffect } from 'react'
import { AlertCircle, RotateCw } from 'lucide-react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[opus_admin] admin section error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#FDFDFD]">
      <div className="max-w-xl w-full bg-white border border-gray-100 rounded-2xl p-8 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-gray-900">
              This page failed to load
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Something went wrong while rendering this admin page. The rest of
              the admin app is unaffected — try reloading the page or open a
              different section from the sidebar.
            </p>
            <pre className="mt-4 text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap break-words text-gray-700">
              {error?.message || 'Unknown error'}
              {error?.digest ? `\n\ndigest: ${error.digest}` : ''}
            </pre>
            <button data-opus-button="primary" data-opus-button-size="medium"
              type="button"
              onClick={() => reset()}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C9A0DC] hover:bg-[#b97fd0] text-[#1A1A1A] text-sm font-semibold transition-colors"
            >
              <RotateCw className="w-4 h-4" />
              Try again
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
