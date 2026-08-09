import Link from 'next/link';
import { Building2, ShieldCheck } from 'lucide-react';
import { requireAgencyPortalIdentity } from '@/lib/agency-portal';
import { createSupabaseServerClient } from '@/lib/supabase';
import AgencySubmissionForm from './AgencySubmissionForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Agency portal — OpusFesta Careers' };

export default async function AgencyPortalPage() {
  const identity = await requireAgencyPortalIdentity();
  if (!identity) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-20">
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <Building2 className="mx-auto h-10 w-10 text-gray-400" />
          <h1 className="mt-5 text-3xl font-semibold">
            Agency access is not active
          </h1>
          <p className="mt-3 text-gray-600">
            Your verified email is not listed as a contact for an active
            approved agency. Ask OpusFesta People Ops to review your access.
          </p>
          <Link
            href="/careers"
            className="mt-6 inline-flex rounded-full bg-black px-5 py-3 text-sm font-semibold text-white"
          >
            Back to careers
          </Link>
        </div>
      </main>
    );
  }
  const db = createSupabaseServerClient();
  const [assignments, submissions] = await Promise.all([
    db
      .from('recruitment_agency_job_assignments')
      .select(
        'job_id, ownership_days, guarantee_days, fee_percent, workforce_jobs(id, title, department, location, status)'
      )
      .eq('agency_id', identity.agencyId)
      .eq('status', 'active'),
    db
      .from('recruitment_agency_submissions')
      .select(
        'id, job_id, external_reference, submitted_name, submitted_email, ownership_expires_at, status, created_at'
      )
      .eq('agency_id', identity.agencyId)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  if (assignments.error) throw assignments.error;
  if (submissions.error) throw submissions.error;
  const jobs = (assignments.data ?? []).flatMap((assignment) => {
    const job = Array.isArray(assignment.workforce_jobs)
      ? assignment.workforce_jobs[0]
      : assignment.workforce_jobs;
    return job?.status === 'Open'
      ? [
          {
            id: job.id,
            title: job.title,
            department: job.department,
            location: job.location,
          },
        ]
      : [];
  });
  const jobMap = new Map(jobs.map((job) => [job.id, job]));
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
      <header className="flex flex-col gap-4 border-b border-black/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#775188]">
            Approved agency portal
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            {identity.agencyName}
          </h1>
          <p className="mt-2 text-gray-600">
            Signed in as {identity.contactName}. Access is limited to roles
            assigned to your agency.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
          <ShieldCheck className="h-4 w-4" /> Verified agency contact
        </div>
      </header>
      <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Submit a candidate</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Every submission is duplicate-checked. Candidate ownership begins
            only after People Ops accepts the submission.
          </p>
          <AgencySubmissionForm jobs={jobs} />
        </section>
        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Submission history</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-gray-400">
                  <th className="pb-3">Candidate</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3">Ownership</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {(submissions.data ?? []).map((submission) => (
                  <tr key={submission.id} className="border-b border-gray-100">
                    <td className="py-4 font-medium">
                      {submission.submitted_name}
                      <span className="block text-xs font-normal text-gray-400">
                        {submission.external_reference ||
                          submission.submitted_email}
                      </span>
                    </td>
                    <td className="py-4">
                      {jobMap.get(submission.job_id)?.title ?? 'Assigned role'}
                    </td>
                    <td className="py-4 text-xs text-gray-500">
                      {submission.status === 'accepted' &&
                      submission.ownership_expires_at
                        ? `Until ${new Date(submission.ownership_expires_at).toLocaleDateString('en-TZ')}`
                        : 'Pending confirmation'}
                    </td>
                    <td className="py-4">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold capitalize">
                        {submission.status.replaceAll('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
                {submissions.data?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-gray-400">
                      No submissions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
