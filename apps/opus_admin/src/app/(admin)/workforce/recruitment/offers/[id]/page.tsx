import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BadgeCheck,
  CircleDollarSign,
  FileCheck2,
  MessageSquareText,
} from 'lucide-react';
import WorkforceHeading from '../../../_components/PageHeading';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getCallerPermissions } from '@/lib/admin-auth';
import { requireRecruitmentAccess } from '@/lib/recruitment-auth';
import {
  addOfferComponent,
  convertCandidateToEmployee,
  decideOfferStep,
  reviseOffer,
  savePostHireReview,
  sendApprovedOffer,
  submitOfferForApproval,
  updatePreHireCheck,
} from '../actions';
import OfferDocumentButton from './OfferDocumentButton';

function dateOnly(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export default async function OfferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRecruitmentAccess({
    entityType: 'offer',
    entityId: id,
    allowedPermissions: ['workforce.offers.read'],
  });
  const supabase = createSupabaseAdminClient();
  const [
    offerResult,
    approvalsResult,
    versionsResult,
    componentsResult,
    responsesResult,
    documentsResult,
    permissions,
    conversionResult,
  ] = await Promise.all([
    supabase
      .from('recruitment_offers')
      .select(
        '*, recruitment_applications(id, application_reference, candidate_id, recruitment_candidates(full_name, primary_email), workforce_jobs(id, title, requisition_id))'
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('recruitment_offer_approvals')
      .select(
        'id, sequence, approver_role, status, note, decided_at, workforce_employees(full_name)'
      )
      .eq('offer_id', id)
      .order('sequence'),
    supabase
      .from('recruitment_offer_versions')
      .select('id, version, document_storage_path, created_at')
      .eq('offer_id', id)
      .order('version', { ascending: false }),
    supabase
      .from('recruitment_offer_components')
      .select('id, component_type, label, amount, currency, frequency, details')
      .eq('offer_id', id)
      .order('sort_order'),
    supabase
      .from('recruitment_offer_responses')
      .select('id, response, note, responded_at')
      .eq('offer_id', id)
      .order('responded_at', { ascending: false }),
    supabase
      .from('recruitment_offer_documents')
      .select(
        'id, offer_version_id, document_type, signature_status, created_at'
      )
      .eq('offer_id', id)
      .order('created_at', { ascending: false }),
    getCallerPermissions(),
    supabase
      .from('recruitment_hiring_conversions')
      .select('id, status, employee_id, converted_at')
      .eq('offer_id', id)
      .maybeSingle(),
  ]);
  for (const result of [
    offerResult,
    approvalsResult,
    versionsResult,
    componentsResult,
    responsesResult,
    documentsResult,
    conversionResult,
  ])
    if (result.error) throw result.error;
  if (!offerResult.data) notFound();
  const offer = offerResult.data;
  const application = Array.isArray(offer.recruitment_applications)
    ? offer.recruitment_applications[0]
    : offer.recruitment_applications;
  const candidate = Array.isArray(application?.recruitment_candidates)
    ? application.recruitment_candidates[0]
    : application?.recruitment_candidates;
  const canComp = permissions.has('workforce.offers.compensation_read');
  const canEdit =
    permissions.has('workforce.offers.create') &&
    ['draft', 'changes_requested'].includes(offer.status);
  const canApprove =
    permissions.has('workforce.offers.approve') &&
    offer.status === 'pending_approval';
  const canSend =
    permissions.has('workforce.offers.send') && offer.status === 'approved';
  const pendingStep = (approvalsResult.data ?? []).find(
    (step) => step.status === 'pending'
  );
  const documentByVersion = new Map(
    (documentsResult.data ?? [])
      .filter((document) => document.offer_version_id)
      .map((document) => [document.offer_version_id, document])
  );
  const { data: preHireChecks, error: checksError } = conversionResult.data
    ? await supabase
        .from('recruitment_pre_hire_checks')
        .select('id, check_type, status, result_note, completed_at')
        .eq('conversion_id', conversionResult.data.id)
        .order('created_at')
    : { data: [], error: null };
  if (checksError) throw checksError;
  const { data: postHireReviews, error: postHireError } = conversionResult.data?.status === 'converted'
    ? await supabase.from('recruitment_post_hire_reviews').select('id, review_period, hiring_manager_satisfaction, performance_outcome, retention_status, source_quality_note, reviewed_at').eq('conversion_id', conversionResult.data.id).order('created_at')
    : { data: [], error: null };
  if (postHireError) throw postHireError;
  const canConvert =
    permissions.has('workforce.offers.approve') &&
    offer.status === 'accepted' &&
    conversionResult.data?.status !== 'converted';
  const money = (amount: number) =>
    new Intl.NumberFormat('en-TZ', {
      style: 'currency',
      currency: offer.currency,
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <>
      <WorkforceHeading
        title={`${offer.job_title} offer`}
        subtitle={`${offer.offer_number} · ${candidate?.full_name ?? 'Candidate'} · version ${offer.version}`}
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Offer status
                </p>
                <p className="mt-1 text-xl font-semibold capitalize text-gray-950">
                  {offer.status.replaceAll('_', ' ')}
                </p>
                <Link
                  href={`/workforce/recruitment/applications/${application?.id}`}
                  className="mt-1 inline-block text-sm text-[#5B2D8E]"
                >
                  {application?.application_reference} ·{' '}
                  {candidate?.primary_email}
                </Link>
              </div>
              <span className="rounded-xl bg-[#F7EAFB] p-3 text-[#5B2D8E]">
                <BadgeCheck className="h-6 w-6" />
              </span>
            </div>
            <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Position', offer.job_title],
                ['Department', offer.department ?? '—'],
                ['Employment', offer.employment_type ?? '—'],
                [
                  'Location',
                  [offer.location, offer.workplace_type]
                    .filter(Boolean)
                    .join(' · ') || '—',
                ],
                ['Start date', offer.start_date ?? '—'],
                [
                  'Expiry',
                  offer.expires_at
                    ? new Date(offer.expires_at).toLocaleString('en-TZ')
                    : '—',
                ],
                ['Manager', offer.manager_employee_id ? 'Assigned' : '—'],
                ['Working hours', offer.working_hours ?? '—'],
                ['Probation', offer.probation_terms ?? 'Per policy'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-gray-800">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {canComp && (
              <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                  <CircleDollarSign className="h-4 w-4" />
                  Approved compensation scope
                </p>
                <p className="mt-2 text-xl font-semibold text-emerald-950">
                  {money(Number(offer.base_salary))}{' '}
                  <span className="text-sm font-medium">
                    {offer.pay_frequency}
                  </span>
                </p>
              </div>
            )}
          </section>

          {canEdit && (
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-gray-950">Draft terms</h2>
              <form
                action={reviseOffer.bind(null, id)}
                className="mt-4 space-y-4"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-semibold text-gray-600">
                    Base salary
                    <input
                      name="base_salary"
                      type="number"
                      min="0"
                      required
                      defaultValue={offer.base_salary}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-semibold text-gray-600">
                    Start date
                    <input
                      name="start_date"
                      type="date"
                      required
                      defaultValue={dateOnly(offer.start_date)}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-semibold text-gray-600">
                    Expires on
                    <input
                      name="expires_on"
                      type="date"
                      required
                      defaultValue={dateOnly(offer.expires_at)}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-gray-600">
                    Working hours
                    <input
                      name="working_hours"
                      defaultValue={offer.working_hours ?? ''}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs font-semibold text-gray-600">
                    Contract duration
                    <input
                      name="contract_duration"
                      defaultValue={offer.contract_duration ?? ''}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <label className="block text-xs font-semibold text-gray-600">
                  Probation terms
                  <input
                    name="probation_terms"
                    defaultValue={offer.probation_terms ?? ''}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-gray-600">
                  Conditions
                  <textarea
                    name="conditions"
                    rows={4}
                    defaultValue={(offer.conditions ?? []).join('\n')}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </label>
                <button className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700">
                  Save draft terms
                </button>
              </form>
            </section>
          )}

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-950">
              Allowances and benefits
            </h2>
            {canComp && (
              <div className="mt-4 divide-y divide-gray-100">
                {(componentsResult.data ?? []).map((component) => (
                  <div
                    key={component.id}
                    className="flex justify-between gap-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {component.label}
                      </p>
                      <p className="text-xs capitalize text-gray-500">
                        {component.component_type}
                        {component.frequency ? ` · ${component.frequency}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      {component.amount == null
                        ? (component.details ?? 'Included')
                        : money(Number(component.amount))}
                    </p>
                  </div>
                ))}
                {componentsResult.data?.length === 0 && (
                  <p className="py-3 text-sm text-gray-400">
                    No additional components.
                  </p>
                )}
              </div>
            )}
            {canEdit && (
              <form
                action={addOfferComponent.bind(null, id)}
                className="mt-4 grid gap-2 rounded-xl bg-gray-50 p-3 sm:grid-cols-2"
              >
                <select
                  name="component_type"
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="allowance">Allowance</option>
                  <option value="bonus">Bonus</option>
                  <option value="benefit">Benefit</option>
                  <option value="reimbursement">Reimbursement</option>
                  <option value="other">Other</option>
                </select>
                <input
                  name="label"
                  required
                  placeholder="Label"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <input
                  name="amount"
                  type="number"
                  min="0"
                  placeholder="Amount (optional)"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <input
                  name="frequency"
                  placeholder="Frequency"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <textarea
                  name="details"
                  placeholder="Details"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm sm:col-span-2"
                />
                <button className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white sm:col-span-2">
                  Add component
                </button>
              </form>
            )}
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-5 w-5 text-[#5B2D8E]" />
              <h2 className="font-semibold text-gray-950">
                Candidate responses
              </h2>
            </div>
            <div className="mt-4 divide-y divide-gray-100">
              {(responsesResult.data ?? []).map((response) => (
                <article key={response.id} className="py-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-semibold capitalize text-gray-800">
                      {response.response}
                    </span>
                    <time className="text-xs text-gray-400">
                      {new Date(response.responded_at).toLocaleString('en-TZ')}
                    </time>
                  </div>
                  {response.note && (
                    <p className="mt-1 text-sm text-gray-600">
                      {response.note}
                    </p>
                  )}
                </article>
              ))}
              {responsesResult.data?.length === 0 && (
                <p className="py-3 text-sm text-gray-400">
                  No candidate response yet.
                </p>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          {canEdit && (
            <section className="rounded-2xl border border-violet-100 bg-violet-50 p-5">
              <h2 className="font-semibold text-violet-950">
                Submit for approval
              </h2>
              <p className="mt-1 text-sm text-violet-800">
                Creates an immutable terms snapshot and PDF for this version.
              </p>
              <form
                action={submitOfferForApproval.bind(null, id)}
                className="mt-4"
              >
                <button className="w-full rounded-xl bg-[#5B2D8E] px-4 py-2.5 text-sm font-semibold text-white">
                  Generate and submit version{' '}
                  {offer.status === 'changes_requested'
                    ? Number(offer.version) + 1
                    : offer.version}
                </button>
              </form>
            </section>
          )}
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-950">Approval route</h2>
            <ol className="mt-4 space-y-3">
              {(approvalsResult.data ?? []).map((step) => {
                const employee = Array.isArray(step.workforce_employees)
                  ? step.workforce_employees[0]
                  : step.workforce_employees;
                return (
                  <li key={step.id} className="rounded-xl bg-gray-50 p-3">
                    <div className="flex justify-between gap-2">
                      <span className="text-sm font-semibold capitalize text-gray-800">
                        {step.sequence}.{' '}
                        {step.approver_role?.replaceAll('_', ' ')}
                      </span>
                      <span className="text-xs font-semibold capitalize text-gray-500">
                        {step.status.replaceAll('_', ' ')}
                      </span>
                    </div>
                    {employee?.full_name && (
                      <p className="mt-1 text-xs text-gray-500">
                        {employee.full_name}
                      </p>
                    )}
                    {step.note && (
                      <p className="mt-2 text-xs leading-5 text-gray-600">
                        {step.note}
                      </p>
                    )}
                  </li>
                );
              })}
              {approvalsResult.data?.length === 0 && (
                <li className="text-sm text-gray-400">
                  Submit the draft to generate approval steps.
                </li>
              )}
            </ol>
          </section>
          {canApprove && pendingStep && (
            <section className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
              <h2 className="font-semibold text-amber-950">Your approval</h2>
              <p className="mt-1 text-sm capitalize text-amber-800">
                {pendingStep.approver_role?.replaceAll('_', ' ')}
              </p>
              <form
                action={decideOfferStep.bind(null, id, 'approved')}
                className="mt-4"
              >
                <textarea
                  name="note"
                  rows={3}
                  placeholder="Required for rejection or changes"
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
                />
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button className="rounded-lg bg-emerald-700 px-2 py-2 text-xs font-semibold text-white">
                    Approve
                  </button>
                  <button
                    formAction={decideOfferStep.bind(
                      null,
                      id,
                      'changes_requested'
                    )}
                    className="rounded-lg bg-amber-200 px-2 py-2 text-xs font-semibold text-amber-950"
                  >
                    Changes
                  </button>
                  <button
                    formAction={decideOfferStep.bind(null, id, 'rejected')}
                    className="rounded-lg bg-rose-200 px-2 py-2 text-xs font-semibold text-rose-950"
                  >
                    Reject
                  </button>
                </div>
              </form>
            </section>
          )}
          {canSend && (
            <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
              <h2 className="font-semibold text-emerald-950">
                Send approved offer
              </h2>
              <p className="mt-1 text-sm text-emerald-800">
                Adds the approved version to the candidate portal and queues the
                notification.
              </p>
              <form action={sendApprovedOffer.bind(null, id)} className="mt-4">
                <button className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">
                  Send to candidate
                </button>
              </form>
            </section>
          )}
          {conversionResult.data && (
            <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
              <h2 className="font-semibold text-blue-950">
                Pre-hire and onboarding
              </h2>
              <p className="mt-1 text-sm text-blue-800">
                Conversion: {conversionResult.data.status.replaceAll('_', ' ')}
              </p>
              <div className="mt-4 space-y-3">
                {(preHireChecks ?? []).map((check) => (
                  <form
                    key={check.id}
                    action={updatePreHireCheck.bind(null, id, check.id)}
                    className="rounded-xl bg-white p-3"
                  >
                    <p className="text-sm font-semibold capitalize text-gray-800">
                      {check.check_type.replaceAll('_', ' ')}
                    </p>
                    <select
                      name="status"
                      defaultValue={check.status}
                      className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In progress</option>
                      <option value="passed">Passed</option>
                      <option value="review_required">Review required</option>
                      <option value="failed">Failed</option>
                      <option value="waived">Waived</option>
                    </select>
                    <input
                      name="result_note"
                      defaultValue={check.result_note ?? ''}
                      placeholder="Evidence or waiver reason"
                      className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
                    />
                    <button className="mt-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold">
                      Save check
                    </button>
                  </form>
                ))}
              </div>
              {canConvert && (
                <form
                  action={convertCandidateToEmployee.bind(null, id)}
                  className="mt-4"
                >
                  <button className="w-full rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white">
                    Create employee from approved terms
                  </button>
                </form>
              )}
              {conversionResult.data.status === 'converted' && (
                <Link
                  href={`/workforce/employees/${conversionResult.data.employee_id}`}
                  className="mt-4 inline-block text-sm font-semibold text-blue-900 underline"
                >
                  Open employee record
                </Link>
              )}
            </section>
          )}
          {conversionResult.data?.status === 'converted' && permissions.has('workforce.recruitment_reports.read') && (
            <section className="rounded-2xl border border-violet-100 bg-violet-50 p-5">
              <h2 className="font-semibold text-violet-950">Post-hire review</h2>
              <p className="mt-1 text-sm text-violet-800">Restricted outcome data improves source and process quality reporting.</p>
              <div className="mt-3 space-y-2">{(postHireReviews ?? []).map((review) => <p key={review.id} className="rounded-lg bg-white p-2 text-xs"><b>{review.review_period.replaceAll('_', ' ')}</b> · satisfaction {review.hiring_manager_satisfaction ?? '—'}/5 · {review.performance_outcome ?? 'No outcome'} · {review.retention_status ?? 'No retention status'}</p>)}</div>
              <form action={savePostHireReview.bind(null, id)} className="mt-4 space-y-2"><select name="review_period" className="w-full rounded-lg border px-3 py-2 text-sm"><option value="30_days">30 days</option><option value="90_days">90 days</option><option value="probation">Probation completion</option><option value="six_months">Six months</option></select><input name="hiring_manager_satisfaction" type="number" min="0" max="5" step="0.5" placeholder="Manager satisfaction / 5" className="w-full rounded-lg border px-3 py-2 text-sm" /><input name="performance_outcome" placeholder="Performance outcome" className="w-full rounded-lg border px-3 py-2 text-sm" /><input name="retention_status" placeholder="Retention status" className="w-full rounded-lg border px-3 py-2 text-sm" /><textarea name="source_quality_note" placeholder="Source/process quality note" className="w-full rounded-lg border px-3 py-2 text-sm" /><textarea name="restricted_notes" placeholder="Restricted notes" className="w-full rounded-lg border px-3 py-2 text-sm" /><button className="w-full rounded-lg bg-violet-800 px-3 py-2 text-xs font-semibold text-white">Save governed review</button></form>
            </section>
          )}
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-[#5B2D8E]" />
              <h2 className="font-semibold text-gray-950">Version history</h2>
            </div>
            <div className="mt-4 space-y-3">
              {(versionsResult.data ?? []).map((version) => {
                const document = documentByVersion.get(version.id);
                return (
                  <article
                    key={version.id}
                    className="rounded-xl bg-gray-50 p-3"
                  >
                    <div className="flex justify-between">
                      <span className="text-sm font-semibold">
                        Version {version.version}
                      </span>
                      <time className="text-xs text-gray-400">
                        {new Date(version.created_at).toLocaleDateString(
                          'en-TZ'
                        )}
                      </time>
                    </div>
                    {document && canComp && (
                      <div className="mt-2">
                        <OfferDocumentButton
                          offerId={id}
                          documentId={document.id}
                        />
                      </div>
                    )}
                  </article>
                );
              })}
              {versionsResult.data?.length === 0 && (
                <p className="text-sm text-gray-400">No submitted versions.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
