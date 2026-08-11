'use client';

import { useActionState } from 'react';
import {
  respondToBackgroundCheckConsent,
  submitCandidateAssessmentTask,
  uploadCandidatePortalDocument,
  type PortalTaskState,
} from './actions';

const initial: PortalTaskState = { ok: false, message: null };

export function AssessmentTaskForm({ taskId }: { taskId: string }) {
  const [state, action, pending] = useActionState(
    submitCandidateAssessmentTask.bind(null, taskId),
    initial
  );
  return (
    <form action={action} className="mt-4 space-y-3">
      <textarea
        name="answer"
        required
        minLength={10}
        rows={6}
        placeholder="Your response"
        className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
      />
      <label className="block text-xs font-semibold text-amber-900">
        Optional attachment
        <input
          name="attachment"
          type="file"
          accept=".pdf,.doc,.docx"
          className="mt-1 block w-full rounded-lg border border-amber-200 bg-white p-2 text-xs"
        />
      </label>
      <button data-opus-button="warning" data-opus-button-size="medium"
        disabled={pending}
        className="rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white"
      >
        {pending ? 'Submitting…' : 'Submit assessment'}
      </button>
      {state.message && (
        <p
          role="status"
          className={`text-xs font-medium ${state.ok ? 'text-emerald-800' : 'text-rose-800'}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

export function DocumentTaskForm({
  taskId,
  applicationId,
}: {
  taskId: string | null;
  applicationId: string | null;
}) {
  const [state, action, pending] = useActionState(
    uploadCandidatePortalDocument.bind(null, taskId),
    initial
  );
  return (
    <form action={action} className="mt-4 space-y-3">
      {applicationId && (
        <input type="hidden" name="applicationId" value={applicationId} />
      )}
      <select
        name="documentType"
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
      >
        <option value="other">Requested document</option>
        <option value="resume">Updated CV</option>
        <option value="cover_letter">Cover letter</option>
        <option value="portfolio">Portfolio</option>
        <option value="academic_certificate">Academic certificate</option>
        <option value="professional_licence">Professional licence</option>
      </select>
      <input
        name="document"
        type="file"
        required
        accept=".pdf,.doc,.docx"
        className="block w-full rounded-lg border border-gray-200 bg-white p-2 text-xs"
      />
      <button data-opus-button="primary" data-opus-button-size="medium"
        disabled={pending}
        className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
      >
        {pending ? 'Uploading securely…' : 'Upload document'}
      </button>
      {state.message && (
        <p
          role="status"
          className={`text-xs font-medium ${state.ok ? 'text-emerald-800' : 'text-rose-800'}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

export function BackgroundCheckConsentForm({ taskId }: { taskId: string }) {
  return (
    <form className="mt-4 space-y-3">
      <p className="text-xs leading-5 text-amber-900">
        Your response is recorded with the request. A declined request cancels
        the check and does not authorize a provider to proceed.
      </p>
      <div className="flex gap-2">
        <button data-opus-button="control"
          formAction={respondToBackgroundCheckConsent.bind(null, taskId, true)}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
        >
          I consent
        </button>
        <button data-opus-button="warning" data-opus-button-size="medium"
          formAction={respondToBackgroundCheckConsent.bind(null, taskId, false)}
          className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-950"
        >
          I do not consent
        </button>
      </div>
    </form>
  );
}
