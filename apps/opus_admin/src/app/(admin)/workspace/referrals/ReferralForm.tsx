'use client'

import { useActionState, useEffect, useRef } from 'react'
import { submitEmployeeReferral, type ReferralActionState } from './actions'

type Opportunity = {
  id: string
  title: string
  department: string
  location: string
}

const initialState: ReferralActionState = { status: 'idle', message: null }
const input =
  'mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-950 outline-none transition focus:border-[#7E5896] focus:ring-2 focus:ring-[#E8D4F1]'
const label = 'block text-sm font-semibold text-gray-700'

export default function ReferralForm({ opportunities }: { opportunities: Opportunity[] }) {
  const [state, action, pending] = useActionState(submitEmployeeReferral, initialState)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state.status === 'success') formRef.current?.reset()
  }, [state.status])

  return (
    <form ref={formRef} action={action} className="space-y-5">
      {state.message && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            state.status === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {state.message}
          {state.reference ? ` Reference: ${state.reference}.` : ''}
        </div>
      )}

      <label className={label}>
        Opportunity
        <select className={input} name="jobId" required defaultValue="">
          <option value="" disabled>Select a vacancy</option>
          {opportunities.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title} · {job.department} · {job.location}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Candidate name
          <input className={input} name="candidateName" required minLength={2} maxLength={120} autoComplete="name" />
        </label>
        <label className={label}>
          Candidate email
          <input className={input} name="candidateEmail" type="email" required maxLength={200} autoComplete="email" />
        </label>
      </div>

      <label className={label}>
        How do you know them?
        <input className={input} name="relationship" required minLength={2} maxLength={120} placeholder="For example: former colleague" />
      </label>

      <label className={label}>
        Why would they be a strong fit?
        <textarea className={input} name="endorsement" rows={4} required minLength={10} maxLength={3000} />
      </label>

      <label className={label}>
        Conflict disclosure <span className="font-normal text-gray-400">(optional)</span>
        <textarea className={input} name="conflictDisclosure" rows={2} maxLength={1000} placeholder="Disclose family, reporting, financial, or other potential conflicts." />
      </label>

      <label className={label}>
        Candidate CV <span className="font-normal text-gray-400">(optional, PDF/DOC/DOCX, max 10 MB)</span>
        <input className={`${input} file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold`} name="cv" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
      </label>

      <label className="flex items-start gap-3 rounded-xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm leading-6 text-gray-700">
        <input className="mt-1 h-4 w-4 rounded border-gray-300 text-[#5B2D8E] focus:ring-[#7E5896]" type="checkbox" name="candidateConsent" required />
        <span>I confirm that this person gave me permission to share their contact details and any attached CV with OpusFesta for this referral.</span>
      </label>

      <button data-opus-button="control"
        disabled={pending || opportunities.length === 0}
        className="rounded-xl bg-[#5B2D8E] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#492270] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Submitting securely…' : 'Submit referral'}
      </button>
    </form>
  )
}
