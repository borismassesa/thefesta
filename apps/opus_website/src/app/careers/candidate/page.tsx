import Link from 'next/link';
import {
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { requirePortalCandidate } from '@/lib/candidate-portal';
import { createSupabaseServerClient } from '@/lib/supabase';
import {
  acknowledgeCandidateNotice,
  requestCandidatePrivacyAction,
  requestInterviewAccommodation,
  requestInterviewReschedule,
  respondToCandidateOffer,
  toggleCandidateSavedJob,
  updateCandidateContact,
  updateCandidateConsent,
  updateCandidatePreferences,
  withdrawCandidateApplication,
} from './actions';
import OfferDocumentButton from './OfferDocumentButton';
import {
  AssessmentTaskForm,
  BackgroundCheckConsentForm,
  DocumentTaskForm,
} from './PortalTaskForms';
import CandidateAvailabilityForm from './CandidateAvailabilityForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Candidate portal — OpusFesta Careers' };

export default async function CandidatePortalPage() {
  const candidate = await requirePortalCandidate();
  if (!candidate) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-20 sm:px-8">
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <UserRound className="mx-auto h-10 w-10 text-gray-400" />
          <h1 className="mt-5 text-3xl font-semibold text-gray-950">
            No application profile yet
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-gray-600">
            Your verified account is ready. Apply to an open role using the same
            email address and your application will appear here automatically.
          </p>
          <Link
            href="/careers#open-roles"
            className="mt-6 inline-flex rounded-full bg-black px-5 py-3 text-sm font-semibold text-white"
          >
            View open roles
          </Link>
        </div>
      </main>
    );
  }

  const supabase = createSupabaseServerClient();
  const [applications, tasks, notices, preferences, consents, savedJobs] =
    await Promise.all([
      supabase
        .from('recruitment_applications')
        .select(
          'id, job_id, application_reference, status, candidate_facing_status, submitted_at, created_at'
        )
        .eq('candidate_id', candidate.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('recruitment_candidate_portal_tasks')
        .select(
          'id, application_id, task_type, title, instructions, status, due_at'
        )
        .eq('candidate_id', candidate.id)
        .in('status', ['pending', 'in_progress'])
        .order('due_at', { ascending: true, nullsFirst: false }),
      supabase
        .from('recruitment_candidate_notices')
        .select(
          'id, application_id, title, body, version, published_at, acknowledged_at'
        )
        .eq('candidate_id', candidate.id)
        .order('published_at', { ascending: false })
        .limit(20),
      supabase
        .from('recruitment_candidate_preferences')
        .select('*')
        .eq('candidate_id', candidate.id)
        .maybeSingle(),
      supabase
        .from('recruitment_candidate_consents')
        .select('consent_type, granted_at, withdrawn_at')
        .eq('candidate_id', candidate.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('recruitment_candidate_saved_jobs')
        .select(
          'job_id, saved_at, workforce_jobs(title, slug, department, location, status)'
        )
        .eq('candidate_id', candidate.id)
        .order('saved_at', { ascending: false }),
    ]);
  if (applications.error) throw applications.error;
  if (tasks.error) throw tasks.error;
  if (notices.error) throw notices.error;
  if (preferences.error) throw preferences.error;
  if (consents.error) throw consents.error;
  if (savedJobs.error) throw savedJobs.error;
  const applicationRows = applications.data ?? [];
  const appIds = applicationRows.map((row) => row.id);
  const jobIds = applicationRows.map((row) => row.job_id);
  const [jobs, interviews, offers] = await Promise.all([
    jobIds.length
      ? supabase
          .from('workforce_jobs')
          .select('id, slug, title, department, location')
          .in('id', jobIds)
      : Promise.resolve({ data: [], error: null }),
    appIds.length
      ? supabase
          .from('recruitment_interviews')
          .select(
            'id, application_id, title, status, starts_at, ends_at, timezone, location, meeting_url, candidate_instructions'
          )
          .in('application_id', appIds)
          .in('status', ['scheduled', 'confirmed'])
          .order('starts_at')
      : Promise.resolve({ data: [], error: null }),
    appIds.length
      ? supabase
          .from('recruitment_offers')
          .select(
            'id, application_id, offer_number, job_title, status, start_date, expires_at, version'
          )
          .in('application_id', appIds)
          .in('status', ['sent', 'viewed', 'accepted', 'declined'])
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (jobs.error) throw jobs.error;
  if (interviews.error) throw interviews.error;
  if (offers.error) throw offers.error;
  const jobMap = new Map((jobs.data ?? []).map((job) => [job.id, job]));
  const offerIds = (offers.data ?? []).map((offer) => offer.id);
  const { data: offerDocuments, error: offerDocumentsError } = offerIds.length
    ? await supabase
        .from('recruitment_offer_documents')
        .select(
          'id, offer_id, offer_version_id, recruitment_offer_versions!inner(version)'
        )
        .in('offer_id', offerIds)
        .eq('document_type', 'offer_letter')
    : { data: [], error: null };
  if (offerDocumentsError) throw offerDocumentsError;
  const offerDocumentMap = new Map(
    (offerDocuments ?? []).map((document) => {
      const version = Array.isArray(document.recruitment_offer_versions)
        ? document.recruitment_offer_versions[0]
        : document.recruitment_offer_versions;
      return [`${document.offer_id}:${version?.version}`, document];
    })
  );

  return (
    <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8 lg:py-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#775188]">
            Candidate portal
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-gray-950">
            Welcome,{' '}
            {candidate.preferred_name ?? candidate.full_name.split(' ')[0]}
          </h1>
          <p className="mt-2 text-gray-600">
            Track applications, complete next steps and manage your information.
          </p>
        </div>
        <Link
          href="/careers#open-roles"
          className="text-sm font-semibold text-gray-900 underline underline-offset-4"
        >
          Explore more roles
        </Link>
      </div>

      {(savedJobs.data ?? []).length > 0 && (
        <section className="mt-10 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Saved roles</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(savedJobs.data ?? []).map((saved) => {
              const job = Array.isArray(saved.workforce_jobs)
                ? saved.workforce_jobs[0]
                : saved.workforce_jobs;
              return (
                <article
                  key={saved.job_id}
                  className="rounded-xl bg-gray-50 p-4"
                >
                  <Link
                    href={`/careers/jobs/${job?.slug}`}
                    className="font-semibold underline"
                  >
                    {job?.title ?? 'Role'}
                  </Link>
                  <p className="mt-1 text-sm text-gray-500">
                    {job?.department} · {job?.location}
                  </p>
                  <form
                    action={toggleCandidateSavedJob.bind(
                      null,
                      saved.job_id,
                      'remove'
                    )}
                    className="mt-3"
                  >
                    <button className="text-xs font-semibold text-rose-700">
                      Remove saved role
                    </button>
                  </form>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="applications-heading" className="mt-10">
        <div className="flex items-center gap-2">
          <BriefcaseBusiness className="h-5 w-5" />
          <h2 id="applications-heading" className="text-xl font-semibold">
            Applications
          </h2>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {applicationRows.map((application) => {
            const job = jobMap.get(application.job_id);
            const withdrawable = ![
              'hired',
              'rejected',
              'withdrawn',
              'archived',
              'position_closed',
            ].includes(application.status);
            return (
              <article
                key={application.id}
                className="rounded-2xl bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-950">
                      {job?.title ?? 'Position'}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {job?.department} · {job?.location}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#F2E8F6] px-3 py-1 text-xs font-semibold text-[#5B2D8E]">
                    {application.candidate_facing_status}
                  </span>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-gray-400">
                      Reference
                    </dt>
                    <dd className="mt-1 font-medium">
                      {application.application_reference}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-gray-400">
                      Submitted
                    </dt>
                    <dd className="mt-1 font-medium">
                      {application.submitted_at
                        ? new Date(application.submitted_at).toLocaleDateString(
                            'en-TZ'
                          )
                        : 'Draft'}
                    </dd>
                  </div>
                </dl>
                {withdrawable && (
                  <form
                    action={withdrawCandidateApplication.bind(
                      null,
                      application.id
                    )}
                    className="mt-5 flex gap-2"
                  >
                    <label
                      className="sr-only"
                      htmlFor={`reason-${application.id}`}
                    >
                      Withdrawal reason
                    </label>
                    <input
                      id={`reason-${application.id}`}
                      name="reason"
                      placeholder="Reason (optional)"
                      className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    />
                    <button className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold hover:bg-gray-50">
                      Withdraw
                    </button>
                  </form>
                )}
              </article>
            );
          })}
          {applicationRows.length === 0 && (
            <p className="rounded-2xl bg-white p-6 text-gray-500 shadow-sm">
              No applications yet.
            </p>
          )}
        </div>
      </section>

      {(tasks.data ?? []).length > 0 && (
        <section className="mt-10">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5" />
            <h2 className="text-xl font-semibold">Pending tasks</h2>
          </div>
          <div className="mt-4 space-y-3">
            {(tasks.data ?? []).map((task) => (
              <article
                key={task.id}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-5"
              >
                <div className="flex justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-amber-950">
                      {task.title}
                    </h3>
                    <p className="mt-1 text-sm text-amber-800">
                      {task.instructions ?? task.task_type.replaceAll('_', ' ')}
                    </p>
                  </div>
                  {task.due_at && (
                    <time className="text-xs font-semibold text-amber-900">
                      Due {new Date(task.due_at).toLocaleDateString('en-TZ')}
                    </time>
                  )}
                </div>
                {task.task_type === 'questionnaire' && (
                  <AssessmentTaskForm taskId={task.id} />
                )}
                {task.task_type === 'document_upload' && (
                  <DocumentTaskForm
                    taskId={task.id}
                    applicationId={task.application_id}
                  />
                )}
                {task.task_type === 'background_check_consent' && (
                  <BackgroundCheckConsentForm taskId={task.id} />
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {applicationRows[0] && (
        <section className="mt-10 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5" />
            <h2 className="text-xl font-semibold">Additional documents</h2>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Upload an updated CV, portfolio, certificate or licence for your
            most recent application. Files remain private and are scanned before
            recruiter access.
          </p>
          <div className="mt-4 max-w-xl">
            <DocumentTaskForm
              taskId={null}
              applicationId={applicationRows[0].id}
            />
          </div>
        </section>
      )}

      <section className="mt-10 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            <h2 className="text-xl font-semibold">Interviews</h2>
          </div>
          <div className="mt-4 space-y-4">
            {(interviews.data ?? []).map((interview) => (
              <article key={interview.id} className="rounded-xl bg-gray-50 p-4">
                <h3 className="font-semibold">{interview.title}</h3>
                <p className="mt-1 text-sm text-gray-600">
                  {interview.starts_at
                    ? new Date(interview.starts_at).toLocaleString('en-TZ')
                    : 'Scheduling in progress'}{' '}
                  · {interview.location ?? 'Details to follow'}
                </p>
                {interview.candidate_instructions && (
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    {interview.candidate_instructions}
                  </p>
                )}
                {interview.meeting_url && (
                  <a
                    href={interview.meeting_url}
                    className="mt-2 inline-block text-sm font-semibold underline"
                  >
                    Open meeting link
                  </a>
                )}
                <CandidateAvailabilityForm
                  applicationId={interview.application_id}
                  defaultTimezone={candidate.timezone ?? 'Africa/Dar_es_Salaam'}
                />
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-700">
                    Reschedule or request accommodation
                  </summary>
                  <form
                    action={requestInterviewReschedule.bind(null, interview.id)}
                    className="mt-3 flex gap-2"
                  >
                    <input
                      name="reason"
                      required
                      minLength={5}
                      placeholder="Why do you need another time?"
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <button className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold">
                      Request reschedule
                    </button>
                  </form>
                  <form
                    action={requestInterviewAccommodation.bind(
                      null,
                      interview.id
                    )}
                    className="mt-2 flex gap-2"
                  >
                    <input
                      name="request_details"
                      required
                      minLength={5}
                      placeholder="Accommodation needed"
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <button className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold">
                      Request accommodation
                    </button>
                  </form>
                </details>
              </article>
            ))}
            {(interviews.data ?? []).length === 0 && (
              <p className="text-sm text-gray-500">
                No interviews are currently scheduled.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            <h2 className="text-xl font-semibold">Offers</h2>
          </div>
          <div className="mt-4 space-y-4">
            {(offers.data ?? []).map((offer) => {
              const document = offerDocumentMap.get(
                `${offer.id}:${offer.version}`
              );
              return (
                <article key={offer.id} className="rounded-xl bg-gray-50 p-4">
                  <div className="flex justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{offer.job_title}</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {offer.offer_number} · version {offer.version}
                      </p>
                    </div>
                    <span className="text-xs font-semibold capitalize">
                      {offer.status}
                    </span>
                  </div>
                  {document && (
                    <OfferDocumentButton
                      offerId={offer.id}
                      documentId={document.id}
                    />
                  )}
                  {['sent', 'viewed'].includes(offer.status) && (
                    <form className="mt-4 space-y-2">
                      <input
                        name="typed_signature"
                        placeholder="Type your full legal name"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      <textarea
                        name="note"
                        placeholder="Question or decline reason (optional)"
                        rows={2}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          formAction={respondToCandidateOffer.bind(
                            null,
                            offer.id,
                            'accepted'
                          )}
                          className="rounded-lg bg-emerald-700 px-2 py-2 text-xs font-semibold text-white"
                        >
                          Accept
                        </button>
                        <button
                          formAction={respondToCandidateOffer.bind(
                            null,
                            offer.id,
                            'question'
                          )}
                          className="rounded-lg border border-gray-200 px-2 py-2 text-xs font-semibold"
                        >
                          Ask
                        </button>
                        <button
                          formAction={respondToCandidateOffer.bind(
                            null,
                            offer.id,
                            'declined'
                          )}
                          className="rounded-lg bg-rose-100 px-2 py-2 text-xs font-semibold text-rose-900"
                        >
                          Decline
                        </button>
                      </div>
                    </form>
                  )}
                </article>
              );
            })}
            {(offers.data ?? []).length === 0 && (
              <p className="text-sm text-gray-500">No offers are available.</p>
            )}
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <UserRound className="h-5 w-5" />
            <h2 className="text-xl font-semibold">Contact details</h2>
          </div>
          <form
            action={updateCandidateContact}
            className="mt-4 grid gap-3 sm:grid-cols-2"
          >
            <input
              name="preferred_name"
              defaultValue={candidate.preferred_name ?? ''}
              placeholder="Preferred name"
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
            <input
              name="phone"
              defaultValue={candidate.phone ?? ''}
              placeholder="Phone"
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
            <input
              name="city"
              defaultValue={candidate.city ?? ''}
              placeholder="City"
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
            <input
              name="country"
              defaultValue={candidate.country ?? ''}
              placeholder="Country"
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
            <input
              name="timezone"
              defaultValue={candidate.timezone ?? 'Africa/Dar_es_Salaam'}
              placeholder="Time zone"
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
            <button className="rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white">
              Save details
            </button>
          </form>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            <h2 className="text-xl font-semibold">Privacy</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Request a copy, correction, export, consent withdrawal or deletion
            review of your candidate data.
          </p>
          <form
            action={requestCandidatePrivacyAction}
            className="mt-4 flex gap-2"
          >
            <select
              name="request_type"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            >
              <option value="access">Access request</option>
              <option value="correction">Correction</option>
              <option value="export">Data export</option>
              <option value="withdraw_consent">Withdraw consent</option>
              <option value="delete">Deletion review</option>
            </select>
            <button className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold">
              Submit
            </button>
          </form>
        </div>
      </section>

      <section className="mt-10 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Job preferences</h2>
          <p className="mt-2 text-sm text-gray-600">
            Used only for matching roles you have asked us to consider.
          </p>
          <form
            action={updateCandidatePreferences}
            className="mt-4 grid gap-3 sm:grid-cols-2"
          >
            <input
              name="departments"
              defaultValue={
                preferences.data?.preferred_departments?.join(', ') ?? ''
              }
              placeholder="Departments, comma-separated"
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
            <input
              name="locations"
              defaultValue={
                preferences.data?.preferred_locations?.join(', ') ?? ''
              }
              placeholder="Locations, comma-separated"
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
            <input
              name="employment_types"
              defaultValue={
                preferences.data?.preferred_employment_types?.join(', ') ?? ''
              }
              placeholder="Employment types"
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
            <select
              name="remote_preference"
              defaultValue={preferences.data?.remote_preference ?? ''}
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            >
              <option value="">No workplace preference</option>
              <option value="onsite">On-site</option>
              <option value="hybrid">Hybrid</option>
              <option value="remote">Remote</option>
            </select>
            <input
              name="salary_min"
              type="number"
              min="0"
              defaultValue={preferences.data?.salary_expectation_min ?? ''}
              placeholder="Minimum salary TZS"
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
            <input
              name="salary_max"
              type="number"
              min="0"
              defaultValue={preferences.data?.salary_expectation_max ?? ''}
              placeholder="Maximum salary TZS"
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
            <input
              name="earliest_start_date"
              type="date"
              defaultValue={preferences.data?.earliest_start_date ?? ''}
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                name="willing_to_relocate"
                type="checkbox"
                defaultChecked={preferences.data?.willing_to_relocate ?? false}
              />{' '}
              Willing to relocate
            </label>
            <button className="rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2">
              Save preferences
            </button>
          </form>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Communication choices</h2>
          <p className="mt-2 text-sm text-gray-600">
            Optional consent can be withdrawn at any time without affecting an
            active application.
          </p>
          <div className="mt-4 space-y-3">
            {(
              [
                ['talent_pool', 'Future role consideration'],
                ['career_updates', 'Career and talent updates'],
                ['sms', 'SMS recruitment messages'],
              ] as const
            ).map(([type, label]) => {
              const active = (consents.data ?? []).some(
                (consent) =>
                  consent.consent_type === type &&
                  consent.granted_at &&
                  !consent.withdrawn_at
              );
              return (
                <div
                  key={type}
                  className="flex items-center justify-between rounded-xl bg-gray-50 p-3"
                >
                  <div>
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-xs text-gray-500">
                      {active ? 'Active' : 'Not active'}
                    </p>
                  </div>
                  <form
                    action={updateCandidateConsent.bind(
                      null,
                      type,
                      active ? 'withdraw' : 'grant'
                    )}
                  >
                    <button className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold">
                      {active ? 'Withdraw' : 'Grant'}
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {(notices.data ?? []).length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Notices</h2>
          <div className="mt-4 space-y-3">
            {(notices.data ?? []).map((notice) => (
              <article
                key={notice.id}
                className="rounded-2xl bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">{notice.title}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                      {notice.body}
                    </p>
                  </div>
                  {notice.acknowledged_at ? (
                    <span className="text-xs font-semibold text-emerald-700">
                      Acknowledged
                    </span>
                  ) : (
                    <form
                      action={acknowledgeCandidateNotice.bind(null, notice.id)}
                    >
                      <button className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold">
                        Acknowledge
                      </button>
                    </form>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
