'use client';

import { useActionState } from 'react';
import { submitAgencyCandidate, type AgencySubmissionState } from './actions';

const initial: AgencySubmissionState = { ok: false, message: null };
const input =
  'min-h-12 w-full rounded-xl border border-black/15 bg-white px-3 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10';

export default function AgencySubmissionForm({
  jobs,
}: {
  jobs: Array<{
    id: string;
    title: string;
    department: string;
    location: string;
  }>;
}) {
  const [state, action, pending] = useActionState(
    submitAgencyCandidate,
    initial
  );
  return (
    <form
      action={action}
      encType="multipart/form-data"
      className="mt-5 grid gap-4"
      noValidate
    >
      <label className="text-sm font-medium">
        Assigned role
        <select
          className={`${input} mt-2`}
          name="jobId"
          required
          defaultValue=""
        >
          <option value="" disabled>
            Choose a role
          </option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title} · {job.department} · {job.location}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Candidate full name
          <input className={`${input} mt-2`} name="name" required />
        </label>
        <label className="text-sm font-medium">
          Candidate email
          <input
            className={`${input} mt-2`}
            name="email"
            type="email"
            required
          />
        </label>
      </div>
      <label className="text-sm font-medium">
        Agency reference
        <input
          className={`${input} mt-2`}
          name="externalReference"
          maxLength={120}
        />
      </label>
      <label className="text-sm font-medium">
        Candidate CV{' '}
        <span className="font-normal text-black/45">
          PDF, DOC or DOCX · max 10 MB
        </span>
        <input
          className={`${input} mt-2 py-3`}
          name="resume"
          type="file"
          accept=".pdf,.doc,.docx"
          required
        />
      </label>
      <label className="flex items-start gap-3 rounded-2xl bg-[#F4F4F0] p-4 text-sm leading-6">
        <input
          className="mt-1 accent-black"
          type="checkbox"
          name="candidateConsent"
          required
        />
        <span>
          I confirm that the candidate has authorized our agency to share their
          details and CV with OpusFesta for this specific role.
        </span>
      </label>
      {state.message && (
        <p
          role="status"
          className={`rounded-xl p-3 text-sm ${state.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}
        >
          {state.message}
        </p>
      )}
      <button
        disabled={pending || jobs.length === 0}
        className="min-h-12 rounded-full bg-black px-6 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? 'Submitting securely…' : 'Submit candidate'}
      </button>
    </form>
  );
}
