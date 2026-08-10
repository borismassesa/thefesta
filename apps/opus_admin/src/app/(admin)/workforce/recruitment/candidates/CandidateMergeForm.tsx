'use client'

import { useState } from 'react'
import { mergeCandidates } from './actions'

/**
 * Merging two candidate profiles is irreversible and it moves applications,
 * documents, notes and pool memberships. It had no confirmation step and a
 * button labelled "Merge atomically", which describes the transaction rather
 * than what the reader is about to do.
 *
 * Client component only for the confirm: the action itself is unchanged.
 */
export default function CandidateMergeForm({
  candidates,
}: {
  candidates: Array<{ id: string; full_name: string; primary_email: string }>
}) {
  const [surviving, setSurviving] = useState('')
  const [merged, setMerged] = useState('')

  const field =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7E5896] focus:ring-2 focus:ring-[#F0DFF6]'
  const label = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500'
  const nameOf = (id: string) => candidates.find((candidate) => candidate.id === id)?.full_name ?? 'that profile'
  const sameProfile = surviving !== '' && surviving === merged

  return (
    <form
      action={mergeCandidates}
      className="mt-4 grid gap-3 md:grid-cols-4 md:items-end"
      onSubmit={(event) => {
        if (sameProfile) {
          event.preventDefault()
          return
        }
        const question = `Merge "${nameOf(merged)}" into "${nameOf(surviving)}"?\n\nApplications, documents, notes and pool memberships move across. This cannot be undone.`
        if (!confirm(question)) event.preventDefault()
      }}
    >
      <label className="block">
        <span className={label}>Surviving profile</span>
        <select name="surviving_candidate_id" required value={surviving} onChange={(e) => setSurviving(e.target.value)} className={field}>
          <option value="">Choose the profile to keep</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.full_name} · {candidate.primary_email}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={label}>Profile to merge</span>
        <select name="merged_candidate_id" required value={merged} onChange={(e) => setMerged(e.target.value)} className={field}>
          <option value="">Choose the duplicate</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.full_name} · {candidate.primary_email}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={label}>Reason</span>
        <input name="reason" required minLength={5} placeholder="What confirmed these are the same person" className={field} />
      </label>
      <div>
        <button
          disabled={sameProfile}
          className="w-full rounded-lg bg-[#A84F66] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          Merge profiles
        </button>
      </div>
      {sameProfile && (
        <p role="alert" className="md:col-span-4 rounded-lg bg-[#F5DCE2] px-3 py-2 text-xs font-medium text-[#A84F66]">
          Both fields point at the same profile. Choose the duplicate in the second field.
        </p>
      )}
    </form>
  )
}
