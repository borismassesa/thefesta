import { createHash } from 'node:crypto';
import { notFound } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase';
import { submitReferenceResponse } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Secure reference | OpusFesta Careers',
  robots: { index: false, follow: false },
};

export default async function ReferencePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { token } = await params;
  if ((await searchParams).submitted === '1')
    return (
      <main className="mx-auto max-w-2xl px-5 py-20">
        <section className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-10 w-10 text-emerald-700" />
          <h1 className="mt-4 text-3xl font-semibold">Reference received</h1>
          <p className="mt-3 text-gray-600">
            Thank you. Your response has been submitted securely and the link
            can no longer be used.
          </p>
        </section>
      </main>
    );
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data: check, error } = await createSupabaseServerClient()
    .from('recruitment_reference_checks')
    .select(
      'id, referee_name, relationship, status, access_expires_at, recruitment_applications(recruitment_candidates(full_name), workforce_jobs(title))'
    )
    .eq('access_token_hash', tokenHash)
    .eq('status', 'requested')
    .maybeSingle();
  if (
    error ||
    !check ||
    !check.access_expires_at ||
    Date.parse(check.access_expires_at) < Date.now()
  )
    notFound();
  const application = Array.isArray(check.recruitment_applications)
    ? check.recruitment_applications[0]
    : check.recruitment_applications;
  const candidate = Array.isArray(application?.recruitment_candidates)
    ? application.recruitment_candidates[0]
    : application?.recruitment_candidates;
  const job = Array.isArray(application?.workforce_jobs)
    ? application.workforce_jobs[0]
    : application?.workforce_jobs;
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 lg:py-20">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#775188]">
          Private reference request
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Reference for {candidate?.full_name ?? 'an OpusFesta candidate'}
        </h1>
        <p className="mt-3 leading-7 text-gray-600">
          You were named as a referee for {job?.title ?? 'an OpusFesta role'}.
          Your response is restricted to authorized People staff and will not be
          shown to the candidate through the portal.
        </p>
      </header>
      <form
        action={submitReferenceResponse.bind(null, token)}
        className="mt-8 space-y-5 rounded-3xl bg-white p-6 shadow-sm sm:p-8"
      >
        <label className="grid gap-2 text-sm font-semibold">
          Confirm your working relationship
          <input
            name="relationship_confirmation"
            required
            minLength={2}
            defaultValue={check.relationship ?? ''}
            className="rounded-xl border px-3 py-3 font-normal"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Candidate strengths
          <textarea
            name="strengths"
            required
            minLength={10}
            rows={4}
            className="rounded-xl border px-3 py-3 font-normal"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Development areas{' '}
          <span className="font-normal text-gray-400">Optional</span>
          <textarea
            name="development"
            rows={3}
            className="rounded-xl border px-3 py-3 font-normal"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Would you work with or rehire this person?
          <select
            name="rehire"
            required
            defaultValue=""
            className="rounded-xl border px-3 py-3 font-normal"
          >
            <option value="" disabled>
              Choose an answer
            </option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="unsure">Unsure</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Additional evidence or context
          <textarea
            name="comments"
            required
            minLength={10}
            rows={4}
            className="rounded-xl border px-3 py-3 font-normal"
          />
        </label>
        <label className="flex items-start gap-3 text-sm leading-6">
          <input name="declaration" type="checkbox" required className="mt-1" />
          I confirm this reference is accurate to the best of my knowledge and
          may be used for this recruitment decision.
        </label>
        <button className="w-full rounded-full bg-black px-5 py-3 text-sm font-semibold text-white">
          Submit reference securely
        </button>
      </form>
    </main>
  );
}
