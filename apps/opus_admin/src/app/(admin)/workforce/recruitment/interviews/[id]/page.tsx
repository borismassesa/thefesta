import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CalendarClock,
  MapPin,
  ShieldAlert,
  UsersRound,
  Video,
} from 'lucide-react';
import WorkforceHeading from '../../../_components/PageHeading';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getCallerPermissions } from '@/lib/admin-auth';
import { requireRecruitmentAccess } from '@/lib/recruitment-auth';
import { setInterviewStatus } from '../actions';
import {
  InterviewFeedbackForm,
  InterviewParticipantForm,
  InterviewScheduleForm,
  InterviewScorecardAssignmentForm,
} from './InterviewForms';

export default async function InterviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [access, permissions] = await Promise.all([
    requireRecruitmentAccess({
      entityType: 'interview',
      entityId: id,
      allowedPermissions: ['workforce.interviews.read'],
    }),
    getCallerPermissions(),
  ]);
  const supabase = createSupabaseAdminClient();
  const [
    interviewResult,
    participantsResult,
    roomsResult,
    employeesResult,
    myFeedbackResult,
    rescheduleResult,
    templatesResult,
    myScorecardResult,
  ] = await Promise.all([
    supabase
      .from('recruitment_interviews')
      .select(
        '*, recruitment_applications(id, candidate_id, application_reference, recruitment_candidates(id, full_name, preferred_name, current_position, current_organization, city, country, timezone), workforce_jobs(id, title, department, location)), recruitment_interview_stages(name, duration_minutes, instructions, scorecard_template_id)'
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('recruitment_interview_participants')
      .select(
        'employee_id, participant_role, response_status, conflict_declared, conflict_note, workforce_employees(full_name, job_title, department)'
      )
      .eq('interview_id', id),
    supabase
      .from('recruitment_interview_rooms')
      .select('id, name, location')
      .eq('status', 'active')
      .order('name'),
    permissions.has('workforce.interviews.schedule')
      ? supabase
          .from('workforce_employees')
          .select('id, full_name, job_title')
          .in('status', ['Active', 'On Leave', 'Onboarding'])
          .order('full_name')
          .limit(500)
      : Promise.resolve({ data: [], error: null }),
    access.employeeId
      ? supabase
          .from('recruitment_interview_feedback')
          .select('*')
          .eq('interview_id', id)
          .eq('employee_id', access.employeeId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('recruitment_interview_reschedule_requests')
      .select(
        'id, requested_by_type, reason, proposed_slots, status, created_at'
      )
      .eq('interview_id', id)
      .order('created_at', { ascending: false }),
    permissions.has('workforce.interviews.schedule')
      ? supabase
          .from('recruitment_scorecard_templates')
          .select('id, name, version')
          .eq('status', 'active')
          .order('name')
      : Promise.resolve({ data: [], error: null }),
    access.employeeId
      ? supabase
          .from('recruitment_scorecards')
          .select(
            'id, template_id, status, recruitment_scorecard_templates(name)'
          )
          .eq('interview_id', id)
          .eq('reviewer_employee_id', access.employeeId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const result of [
    interviewResult,
    participantsResult,
    roomsResult,
    employeesResult,
    myFeedbackResult,
    rescheduleResult,
    templatesResult,
    myScorecardResult,
  ])
    if (result.error) throw result.error;
  if (!interviewResult.data) notFound();
  const interview = interviewResult.data;
  const application = Array.isArray(interview.recruitment_applications)
    ? interview.recruitment_applications[0]
    : interview.recruitment_applications;
  const candidate = Array.isArray(application?.recruitment_candidates)
    ? application.recruitment_candidates[0]
    : application?.recruitment_candidates;
  const job = Array.isArray(application?.workforce_jobs)
    ? application.workforce_jobs[0]
    : application?.workforce_jobs;
  const stage = Array.isArray(interview.recruitment_interview_stages)
    ? interview.recruitment_interview_stages[0]
    : interview.recruitment_interview_stages;
  const participant = (participantsResult.data ?? []).find(
    (row) => row.employee_id === access.employeeId
  );
  const canScore =
    permissions.has('workforce.interviews.score') &&
    Boolean(
      participant &&
        ['lead', 'interviewer'].includes(participant.participant_role)
    );
  const ownSubmitted =
    ['submitted', 'locked'].includes(myFeedbackResult.data?.status ?? '') ||
    ['submitted', 'locked'].includes(myScorecardResult.data?.status ?? '');
  const maySeeOthers = ownSubmitted || interview.status === 'completed';
  const { data: submittedFeedback, error: submittedError } = maySeeOthers
    ? await supabase
        .from('recruitment_interview_feedback')
        .select(
          'id, employee_id, evidence, red_flags, recommendation, confidence, status, submitted_at, workforce_employees(full_name)'
        )
        .eq('interview_id', id)
        .in('status', ['submitted', 'locked'])
    : { data: [], error: null };
  if (submittedError) throw submittedError;
  const { data: availability, error: availabilityError } =
    application?.candidate_id
      ? await supabase
          .from('recruitment_candidate_availability')
          .select('id, starts_at, ends_at, timezone, note')
          .eq('candidate_id', application.candidate_id)
          .or(`application_id.is.null,application_id.eq.${application.id}`)
          .order('starts_at')
      : { data: [], error: null };
  if (availabilityError) throw availabilityError;
  const canSchedule = permissions.has('workforce.interviews.schedule');
  const myScorecard = myScorecardResult.data;
  const scorecardTemplate = Array.isArray(
    myScorecard?.recruitment_scorecard_templates
  )
    ? myScorecard.recruitment_scorecard_templates[0]
    : myScorecard?.recruitment_scorecard_templates;
  const [
    { data: scorecardSections, error: sectionError },
    { data: scorecardRatings, error: ratingError },
  ] = myScorecard
    ? await Promise.all([
        supabase
          .from('recruitment_scorecard_sections')
          .select(
            'id, title, description, sort_order, recruitment_scorecard_criteria(id, label, description, rating_scale, sort_order)'
          )
          .eq('template_id', myScorecard.template_id)
          .order('sort_order'),
        supabase
          .from('recruitment_scorecard_ratings')
          .select('criterion_id, rating, comment')
          .eq('scorecard_id', myScorecard.id),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (sectionError || ratingError) throw sectionError ?? ratingError;
  const ratingByCriterion = new Map(
    (scorecardRatings ?? []).map((rating) => [rating.criterion_id, rating])
  );
  const scorecard = myScorecard
    ? {
        name: scorecardTemplate?.name ?? 'Interview scorecard',
        sections: (scorecardSections ?? []).map((section) => ({
          id: section.id,
          title: section.title,
          description: section.description,
          criteria: (section.recruitment_scorecard_criteria ?? [])
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((criterion) => ({
              id: criterion.id,
              label: criterion.label,
              description: criterion.description,
              ratingScale: criterion.rating_scale,
              rating: ratingByCriterion.get(criterion.id)?.rating ?? null,
              comment: ratingByCriterion.get(criterion.id)?.comment ?? null,
            })),
        })),
      }
    : null;
  const currentTemplateId =
    interview.scorecard_template_id ?? stage?.scorecard_template_id ?? null;

  return (
    <>
      <WorkforceHeading
        title={interview.title}
        subtitle={`${candidate?.full_name ?? 'Candidate'} · ${job?.title ?? 'Role'} · ${interview.status}`}
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Interview
                </p>
                <h2 className="mt-1 text-xl font-semibold text-gray-950">
                  {interview.title}
                </h2>
                <p className="mt-1 text-sm capitalize text-gray-500">
                  {interview.interview_type.replaceAll('_', ' ')} ·{' '}
                  {stage?.duration_minutes
                    ? `${stage.duration_minutes} minutes`
                    : 'Duration set by schedule'}
                </p>
              </div>
              <span className="rounded-full bg-[#F8EDFF] px-3 py-1 text-xs font-semibold capitalize text-[#5B2D8E]">
                {interview.status}
              </span>
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase text-gray-400">
                  When
                </dt>
                <dd className="mt-1 flex items-start gap-2 text-sm text-gray-700">
                  <CalendarClock className="mt-0.5 h-4 w-4" />
                  {interview.starts_at
                    ? `${new Date(interview.starts_at).toLocaleString('en-TZ', { timeZone: interview.timezone ?? 'Africa/Dar_es_Salaam' })} (${interview.timezone})`
                    : 'Not scheduled'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-gray-400">
                  Where
                </dt>
                <dd className="mt-1 flex items-start gap-2 text-sm text-gray-700">
                  <MapPin className="mt-0.5 h-4 w-4" />
                  {interview.location ?? interview.room ?? 'Not set'}
                </dd>
              </div>
            </dl>
            {interview.meeting_url && (
              <a
                href={interview.meeting_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700"
              >
                <Video className="h-4 w-4" />
                Open meeting link
              </a>
            )}
            {canSchedule &&
              ['scheduled', 'confirmed'].includes(interview.status) && (
                <form
                  action={setInterviewStatus.bind(null, id)}
                  className="mt-5 flex flex-wrap gap-2"
                >
                  <button
                    name="targetStatus"
                    value="confirmed"
                    className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800"
                  >
                    Confirm
                  </button>
                  <button
                    name="targetStatus"
                    value="completed"
                    className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
                  >
                    Complete
                  </button>
                  <button
                    name="targetStatus"
                    value="no_show"
                    className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
                  >
                    No-show
                  </button>
                  <button
                    name="targetStatus"
                    value="cancelled"
                    className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800"
                  >
                    Cancel
                  </button>
                </form>
              )}
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Interview kit</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Candidate summary
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-900">
                  {candidate?.full_name}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  {candidate?.current_position ?? 'Current role not provided'}
                  {candidate?.current_organization
                    ? ` at ${candidate.current_organization}`
                    : ''}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {[candidate?.city, candidate?.country]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                <Link
                  href={`/workforce/recruitment/applications/${application?.id}`}
                  className="mt-3 inline-block text-xs font-semibold text-[#5B2D8E]"
                >
                  Open application →
                </Link>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Stage guidance
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                  {stage?.instructions ??
                    interview.internal_note ??
                    'Use the assigned competencies and capture observable evidence.'}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="text-sm font-semibold text-amber-950">
                  Areas not to ask about
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-900">
                  Do not ask about age, disability details, health history,
                  pregnancy or family plans, religion, ethnicity, marital
                  status, political views, or other protected personal
                  characteristics. Discuss accommodations only through the
                  approved People Ops process.
                </p>
              </div>
            </div>
          </section>

          {canScore && (
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Your independent feedback
              </h2>
              <InterviewFeedbackForm
                interviewId={id}
                locked={ownSubmitted}
                scorecard={scorecard}
                feedback={
                  myFeedbackResult.data
                    ? {
                        assigned_competencies:
                          myFeedbackResult.data.assigned_competencies ?? [],
                        evidence: myFeedbackResult.data.evidence,
                        red_flags: myFeedbackResult.data.red_flags,
                        recommendation: myFeedbackResult.data.recommendation,
                        confidence: myFeedbackResult.data.confidence,
                        conflictDeclared:
                          participant?.conflict_declared ?? false,
                        conflictNote: participant?.conflict_note ?? null,
                      }
                    : null
                }
              />
            </section>
          )}

          {maySeeOthers && (
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Submitted feedback
              </h2>
              <div className="mt-4 divide-y divide-gray-100">
                {(submittedFeedback ?? []).map((feedback) => {
                  const employee = Array.isArray(feedback.workforce_employees)
                    ? feedback.workforce_employees[0]
                    : feedback.workforce_employees;
                  return (
                    <article key={feedback.id} className="py-4">
                      <div className="flex flex-wrap justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-800">
                          {employee?.full_name ?? 'Interviewer'}
                        </p>
                        <p className="text-xs font-semibold capitalize text-[#5B2D8E]">
                          {feedback.recommendation?.replaceAll('_', ' ')} ·{' '}
                          {feedback.confidence} confidence
                        </p>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                        {feedback.evidence}
                      </p>
                      {feedback.red_flags && (
                        <p className="mt-2 text-sm text-rose-700">
                          Follow-up: {feedback.red_flags}
                        </p>
                      )}
                    </article>
                  );
                })}
                {submittedFeedback?.length === 0 && (
                  <p className="py-4 text-sm text-gray-400">
                    No submitted feedback yet.
                  </p>
                )}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          {canSchedule && (
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Schedule</h2>
              <InterviewScheduleForm
                interviewId={id}
                rooms={(roomsResult.data ?? []).map((room) => ({
                  id: room.id,
                  name: room.name,
                  location: room.location,
                }))}
                defaults={{
                  startsAt: interview.starts_at,
                  endsAt: interview.ends_at,
                  timezone:
                    interview.timezone ??
                    candidate?.timezone ??
                    'Africa/Dar_es_Salaam',
                  location: interview.location ?? '',
                  meetingUrl: interview.meeting_url ?? '',
                  roomId: interview.room_id ?? '',
                  instructions: interview.candidate_instructions ?? '',
                }}
              />
            </section>
          )}
          {canSchedule && (
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Scorecard</h2>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Assign one active template before interviewers submit
                independent ratings.
              </p>
              <InterviewScorecardAssignmentForm
                interviewId={id}
                currentTemplateId={currentTemplateId}
                templates={(templatesResult.data ?? []).map((template) => ({
                  id: template.id,
                  name: template.name,
                  version: template.version,
                }))}
              />
            </section>
          )}
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-2">
              <UsersRound className="h-5 w-5 text-[#5B2D8E]" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Participants</h2>
            </div>
            <ul className="mt-4 space-y-3">
              {(participantsResult.data ?? []).map((row) => {
                const employee = Array.isArray(row.workforce_employees)
                  ? row.workforce_employees[0]
                  : row.workforce_employees;
                return (
                  <li
                    key={row.employee_id}
                    className="rounded-xl bg-gray-50 px-3 py-2"
                  >
                    <p className="text-sm font-semibold text-gray-800">
                      {employee?.full_name ?? 'Employee'}
                    </p>
                    <p className="mt-0.5 text-xs capitalize text-gray-500">
                      {row.participant_role} · {row.response_status}
                    </p>
                  </li>
                );
              })}
              {participantsResult.data?.length === 0 && (
                <li className="text-sm text-gray-400">
                  No participants assigned.
                </li>
              )}
            </ul>
            {canSchedule && (
              <InterviewParticipantForm
                interviewId={id}
                employees={(employeesResult.data ?? []).map((employee) => ({
                  id: employee.id,
                  name: employee.full_name,
                  title: employee.job_title,
                }))}
              />
            )}
          </section>
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Candidate availability
            </h2>
            <ul className="mt-3 space-y-2">
              {(availability ?? []).map((slot) => (
                <li
                  key={slot.id}
                  className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600"
                >
                  {new Date(slot.starts_at).toLocaleString('en-TZ', {
                    timeZone: slot.timezone,
                  })}{' '}
                  –{' '}
                  {new Date(slot.ends_at).toLocaleTimeString('en-TZ', {
                    timeZone: slot.timezone,
                  })}
                  <span className="block text-gray-400">
                    {slot.timezone}
                    {slot.note ? ` · ${slot.note}` : ''}
                  </span>
                </li>
              ))}
              {availability?.length === 0 && (
                <li className="text-sm text-gray-400">
                  No candidate-provided slots.
                </li>
              )}
            </ul>
          </section>
          {(rescheduleResult.data ?? []).length > 0 && (
            <section className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
              <h2 className="font-semibold text-amber-950">
                Reschedule requests
              </h2>
              <ul className="mt-3 space-y-3">
                {rescheduleResult.data!.map((request) => (
                  <li key={request.id} className="text-sm text-amber-900">
                    <span className="font-semibold capitalize">
                      {request.status}
                    </span>{' '}
                    · {request.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
