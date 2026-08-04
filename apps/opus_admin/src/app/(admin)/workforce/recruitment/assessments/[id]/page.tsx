import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClipboardCheck, Clock3, ShieldCheck } from 'lucide-react';
import WorkforceHeading from '../../../_components/PageHeading';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getCallerPermissions } from '@/lib/admin-auth';
import { requireRecruitmentAccess } from '@/lib/recruitment-auth';
import AssessmentReviewForm from './AssessmentReviewForm';
import AssessmentAttachmentButton from './AssessmentAttachmentButton';

export default async function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [access, permissions] = await Promise.all([
    requireRecruitmentAccess({
      entityType: 'assessment',
      entityId: id,
      allowedPermissions: ['workforce.assessments.read'],
    }),
    getCallerPermissions(),
  ]);
  const supabase = createSupabaseAdminClient();
  const [assessmentResult, submissionsResult] = await Promise.all([
    supabase
      .from('recruitment_assessments')
      .select(
        '*, recruitment_applications(id, application_reference, recruitment_candidates(full_name, primary_email), workforce_jobs(title, department))'
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('recruitment_assessment_submissions')
      .select('id, attempt, response, storage_paths, started_at, submitted_at')
      .eq('assessment_id', id)
      .order('attempt', { ascending: false }),
  ]);
  if (assessmentResult.error) throw assessmentResult.error;
  if (submissionsResult.error) throw submissionsResult.error;
  if (!assessmentResult.data) notFound();
  const assessment = assessmentResult.data;
  const application = Array.isArray(assessment.recruitment_applications)
    ? assessment.recruitment_applications[0]
    : assessment.recruitment_applications;
  const candidate = Array.isArray(application?.recruitment_candidates)
    ? application.recruitment_candidates[0]
    : application?.recruitment_candidates;
  const job = Array.isArray(application?.workforce_jobs)
    ? application.workforce_jobs[0]
    : application?.workforce_jobs;
  const latest = submissionsResult.data?.[0];
  const { data: review, error: reviewError } =
    latest && access.employeeId
      ? await supabase
          .from('recruitment_assessment_reviews')
          .select('score, recommendation, comments, status')
          .eq('submission_id', latest.id)
          .eq('reviewer_employee_id', access.employeeId)
          .maybeSingle()
      : { data: null, error: null };
  if (reviewError) throw reviewError;
  const canScore =
    permissions.has('workforce.assessments.score') &&
    (!assessment.reviewer_employee_id ||
      assessment.reviewer_employee_id === access.employeeId);

  return (
    <>
      <WorkforceHeading
        title={assessment.title}
        subtitle={`${candidate?.full_name ?? 'Candidate'} · ${job?.title ?? 'Role'} · ${assessment.status}`}
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {assessment.assessment_type}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-gray-950">
                  {assessment.title}
                </h2>
                <Link
                  href={`/workforce/recruitment/applications/${application?.id}`}
                  className="mt-1 inline-block text-sm text-[#5B2D8E]"
                >
                  {application?.application_reference} ·{' '}
                  {candidate?.primary_email}
                </Link>
              </div>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold capitalize text-sky-800">
                {assessment.status}
              </span>
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase text-gray-400">
                  Due
                </dt>
                <dd className="mt-1 text-sm text-gray-700">
                  {assessment.due_at
                    ? new Date(assessment.due_at).toLocaleString('en-TZ')
                    : 'No due date'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-gray-400">
                  Time limit
                </dt>
                <dd className="mt-1 text-sm text-gray-700">
                  {assessment.time_limit_minutes
                    ? `${assessment.time_limit_minutes} minutes`
                    : 'Not timed'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-gray-400">
                  Score
                </dt>
                <dd className="mt-1 text-sm text-gray-700">
                  {assessment.score == null
                    ? 'Not scored'
                    : `${assessment.score}/${assessment.max_score ?? '—'}`}
                </dd>
              </div>
            </dl>
            <div className="mt-5 rounded-xl bg-gray-50 p-4">
              <h3 className="text-sm font-semibold text-gray-800">
                Instructions
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                {assessment.instructions ?? 'No additional instructions.'}
              </p>
            </div>
            {assessment.accommodation_request && (
              <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50 p-4">
                <p className="text-xs font-semibold uppercase text-violet-800">
                  Accommodation request
                </p>
                <p className="mt-2 text-sm text-violet-950">
                  {assessment.accommodation_request}
                </p>
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-[#5B2D8E]" />
              <h2 className="font-semibold text-gray-950">
                Candidate submission
              </h2>
            </div>
            {latest ? (
              <div className="mt-4">
                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                  <span>Attempt {latest.attempt}</span>
                  <span>
                    Submitted{' '}
                    {new Date(latest.submitted_at).toLocaleString('en-TZ')}
                  </span>
                  <span>{latest.storage_paths?.length ?? 0} attachment(s)</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(latest.storage_paths ?? []).map((path: string, index: number) => (
                    <AssessmentAttachmentButton key={path} assessmentId={id} submissionId={latest.id} index={index} />
                  ))}
                </div>
                <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 font-sans text-sm leading-6 text-gray-700">
                  {typeof latest.response === 'object' &&
                  latest.response &&
                  'answer' in latest.response
                    ? String(latest.response.answer)
                    : JSON.stringify(latest.response, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-400">
                The candidate has not submitted this assessment.
              </p>
            )}
          </section>
          {canScore && latest && (
            <section className="rounded-2xl border border-violet-100 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-gray-950">Structured review</h2>
              <AssessmentReviewForm
                assessmentId={id}
                maxScore={assessment.max_score}
                review={
                  review
                    ? {
                        score: review.score,
                        recommendation: review.recommendation,
                        comments: review.comments,
                      }
                    : null
                }
                locked={['submitted', 'locked'].includes(review?.status ?? '')}
              />
            </section>
          )}
        </div>
        <aside className="space-y-5">
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-[#5B2D8E]" />
              <h2 className="font-semibold text-gray-950">Attempts</h2>
            </div>
            <ol className="mt-4 space-y-3">
              {(submissionsResult.data ?? []).map((submission) => (
                <li
                  key={submission.id}
                  className="rounded-xl bg-gray-50 p-3 text-sm"
                >
                  <span className="font-semibold">
                    Attempt {submission.attempt}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">
                    {new Date(submission.submitted_at).toLocaleString('en-TZ')}
                  </span>
                </li>
              ))}
              {submissionsResult.data?.length === 0 && (
                <li className="text-sm text-gray-400">No attempts.</li>
              )}
            </ol>
          </section>
          <section className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-700" />
              <h2 className="font-semibold text-amber-950">
                Decision safeguard
              </h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-amber-900">
              Assessment results and integrity indicators require human review.
              They must not be the sole automated basis for rejection.
            </p>
            {assessment.integrity_note && (
              <p className="mt-3 rounded-lg bg-white/70 p-3 text-sm text-amber-950">
                {assessment.integrity_note}
              </p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
