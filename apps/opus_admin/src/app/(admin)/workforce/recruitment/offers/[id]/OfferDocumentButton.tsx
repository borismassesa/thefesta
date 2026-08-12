'use client'

import { useState, useTransition } from 'react'
import { FileText } from 'lucide-react'
import { openOfferDocument } from '../actions'

export default function OfferDocumentButton({ offerId, documentId }: { offerId: string; documentId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return <div><button data-opus-button="control" type="button" disabled={pending} onClick={() => startTransition(async () => { setError(null); const result = await openOfferDocument(offerId, documentId); if (!result.ok) return setError(result.error); window.open(result.url, '_blank', 'noopener,noreferrer') })} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50"><FileText className="h-4 w-4" />{pending ? 'Opening…' : 'Open version'}</button>{error && <p className="mt-1 text-xs text-rose-700">{error}</p>}</div>
}
