'use client'

import { removeTalentPoolMember, setTalentPoolStatus, updateTalentPool } from './actions'

/**
 * Edit, archive, restore and remove-member.
 *
 * The page could create pools and add people to them, and then nothing: a typo
 * in a pool name was permanent, and a candidate added to the wrong audience
 * could not be taken out of it. For a table that decides who receives nurture
 * email, "cannot remove" is a consent problem, not an inconvenience.
 *
 * Client component only so the destructive actions can confirm first.
 */
const FIELD =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7E5896] focus:ring-2 focus:ring-[#F0DFF6]'
const LABEL = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500'
const TOGGLE =
  'inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 [&::-webkit-details-marker]:hidden'
const DANGER =
  'rounded-lg border border-[#E89AAE] px-3 py-1.5 text-xs font-semibold text-[#A84F66] transition hover:bg-[#F5DCE2]'

export function EditPoolForm({
  pool,
}: {
  pool: { id: string; name: string; description: string | null; visibility: string; status: string }
}) {
  return (
    <details className="mt-3">
      <summary className={TOGGLE}>Edit pool</summary>
      <form action={updateTalentPool.bind(null, pool.id)} className="mt-2 space-y-2 rounded-xl bg-gray-50 p-3">
        <label className="block"><span className={LABEL}>Pool name</span>
          <input name="name" required minLength={3} defaultValue={pool.name} className={FIELD} /></label>
        <label className="block"><span className={LABEL}>Purpose and audience</span>
          <input name="description" defaultValue={pool.description ?? ''} className={FIELD} /></label>
        <label className="block"><span className={LABEL}>Visible to</span>
          <select name="visibility" defaultValue={pool.visibility} className={FIELD}>
            <option value="recruiting">Recruiting team</option>
            <option value="private">Owner only</option>
            <option value="company">Everyone at the company</option>
          </select>
        </label>
        <button className="rounded-lg bg-[#7E5896] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90">
          Save changes
        </button>
      </form>
      {/* Sibling, NOT nested. A <form> inside a <form> is invalid HTML: the
          parser drops the inner one and React fails hydration outright. I made
          this exact mistake in CandidateMergeForm and repeated it here. */}
      <div className="mt-2 flex justify-end">
        <PoolStatusButton pool={pool} />
      </div>
    </details>
  )
}

/** Archive and restore are the same control, because the state is a toggle. */
export function PoolStatusButton({ pool }: { pool: { id: string; name: string; status: string } }) {
  const archived = pool.status === 'archived'
  return (
    <form
      action={setTalentPoolStatus.bind(null, pool.id, archived ? 'active' : 'archived')}
      onSubmit={(event) => {
        if (archived) return
        const question = `Archive "${pool.name}"?\n\nIt stops appearing as an audience for new campaigns. Members and their consent history are kept, and you can restore it.`
        if (!confirm(question)) event.preventDefault()
      }}
    >
      <button className={archived ? 'rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50' : DANGER}>
        {archived ? 'Restore pool' : 'Archive pool'}
      </button>
    </form>
  )
}

export function RemoveMemberButton({
  poolId,
  candidateId,
  candidateName,
}: {
  poolId: string
  candidateId: string
  candidateName: string
}) {
  return (
    <form
      action={removeTalentPoolMember.bind(null, poolId, candidateId)}
      onSubmit={(event) => {
        if (!confirm(`Remove ${candidateName} from this pool?\n\nThey stop receiving its campaigns. The record that they were once a member is kept.`)) {
          event.preventDefault()
        }
      }}
    >
      <button
        aria-label={`Remove ${candidateName} from this pool`}
        className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-400 transition hover:bg-[#F5DCE2] hover:text-[#A84F66]"
      >
        Remove
      </button>
    </form>
  )
}
