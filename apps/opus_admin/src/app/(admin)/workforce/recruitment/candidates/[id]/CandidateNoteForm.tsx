'use client'

import { useActionState } from 'react'
import { addCandidateNote, type CandidateActionState } from '../actions'

const initialState: CandidateActionState = { ok: false, message: null }

export default function CandidateNoteForm({ candidateId }: { candidateId: string }) {
  const [state, action, pending] = useActionState(addCandidateNote.bind(null, candidateId), initialState)
  return (
    <form action={action} className="mt-4 space-y-3">
      <textarea name="body" required maxLength={5000} rows={3} placeholder="Add evidence-based recruiting context…" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#7E5896] focus:ring-2 focus:ring-[#E8D4F1]" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="text-xs font-semibold text-gray-600">Visible to <select name="visibility" className="ml-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5"><option value="recruiting_team">Recruiting team</option><option value="hiring_team">Hiring team</option><option value="private">Only me</option></select></label>
        <button disabled={pending} className="rounded-lg bg-[#5B2D8E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#492270] disabled:opacity-50">{pending ? 'Saving…' : 'Add note'}</button>
      </div>
      {state.message && <p role="status" className={`text-xs font-medium ${state.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{state.message}</p>}
    </form>
  )
}
