'use client'

import { useState, useTransition } from 'react'
import { openCandidateOfferDocument } from './actions'

export default function OfferDocumentButton({ offerId, documentId }: { offerId: string; documentId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return <div className="mt-3"><button data-opus-button="neutral" data-opus-button-size="medium" type="button" disabled={pending} onClick={() => startTransition(async () => { setError(null); const result = await openCandidateOfferDocument(offerId, documentId); if (!result.ok) return setError(result.error); window.open(result.url, '_blank', 'noopener,noreferrer') })} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold">{pending ? 'Opening securely…' : 'Review offer PDF'}</button>{error && <p role="alert" className="mt-1 text-xs text-rose-700">{error}</p>}</div>
}
