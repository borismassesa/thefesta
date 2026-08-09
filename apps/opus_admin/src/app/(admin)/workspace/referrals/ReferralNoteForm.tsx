'use client'

import { useActionState } from 'react'
import { addEmployeeReferralNote, type ReferralActionState } from './actions'

const initialState: ReferralActionState = { status: 'idle', message: null }

export default function ReferralNoteForm({ referralId }: { referralId: string }) {
  const [state, action, pending] = useActionState(addEmployeeReferralNote, initialState)
  return (
    <form action={action} className="relative mt-4">
      <input type="hidden" name="referralId" value={referralId} />
      <label className="sr-only" htmlFor={`note-${referralId}`}>Add a referral note</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={`note-${referralId}`}
          name="note"
          required
          maxLength={2000}
          placeholder="Add context for the recruitment team"
          className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#7E5896] focus:ring-2 focus:ring-[#E8D4F1]"
        />
        <button disabled={pending} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {pending ? 'Adding…' : 'Add note'}
        </button>
      </div>
      {state.message && (
        <p role="status" className={`mt-2 text-xs font-medium ${state.status === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>
          {state.message}
        </p>
      )}
    </form>
  )
}
