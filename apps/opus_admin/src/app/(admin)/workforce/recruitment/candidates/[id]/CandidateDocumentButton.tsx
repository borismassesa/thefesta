'use client'

import { useState, useTransition } from 'react'
import { ExternalLink } from 'lucide-react'
import { openCandidateDocument } from '../actions'

export default function CandidateDocumentButton({
  candidateId,
  documentId,
  disabled,
}: {
  candidateId: string
  documentId: string
  disabled: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="text-right">
      <button data-opus-button="control"
        type="button"
        disabled={disabled || pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await openCandidateDocument(candidateId, documentId)
            if (!result.ok) return setError(result.error)
            window.open(result.url, '_blank', 'noopener,noreferrer')
          })
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ExternalLink className="h-3.5 w-3.5" /> {pending ? 'Opening…' : 'Open'}
      </button>
      {error && <p role="alert" className="mt-1 max-w-48 text-xs text-rose-700">{error}</p>}
    </div>
  )
}
