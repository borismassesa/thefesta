'use client'

import { AlertTriangle } from 'lucide-react'

export default function OperationsError({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-[55vh] items-center justify-center px-6 py-12">
      <div className="max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-gray-950">Operations could not be loaded</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          The command center did not receive a usable response. Retry the read; no
          operational records were changed.
        </p>
        <button data-opus-button="control"
          type="button"
          onClick={reset}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-gray-950 px-4 text-sm font-semibold text-white transition hover:bg-gray-800"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
