'use client'

import { useState } from 'react'
import { openAssessmentAttachment } from '../actions'

export default function AssessmentAttachmentButton({ assessmentId, submissionId, index }: { assessmentId: string; submissionId: string; index: number }) {
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  return <div><button type="button" disabled={busy} onClick={async () => { setBusy(true); setError(null); const result = await openAssessmentAttachment(assessmentId, submissionId, index); setBusy(false); if (!result.ok) setError(result.error); else window.open(result.url, '_blank', 'noopener,noreferrer') }} className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold">{busy ? 'Opening…' : `Open attachment ${index + 1}`}</button>{error && <p role="alert" className="mt-1 text-xs text-rose-700">{error}</p>}</div>
}
