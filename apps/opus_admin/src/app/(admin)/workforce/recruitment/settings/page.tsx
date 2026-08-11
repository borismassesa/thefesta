import WorkforceHeading from '../../_components/PageHeading';
import { requirePermission } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import {
  NEUTRAL_BUTTON_SMALL,
  PRIMARY_BUTTON_SMALL,
  StatusPill,
} from '../_components/ui';
import {
  addPipelineStage,
  addScorecardCriterion,
  addScorecardSection,
  createAssessmentTemplate,
  createAutomationRule,
  createPipeline,
  createPrivacyNotice,
  createScorecardTemplate,
  createSource,
  setAutomationStatus,
  setPrivacyNoticeStatus,
  setTemplateStatus,
  createLegalHold,
  processRetentionItem,
  releaseLegalHold,
  runRetentionScan,
  updatePrivacyRequest,
  upsertRetentionPolicy,
} from './actions';

const input =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm';
const card =
  'rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]';
const button = PRIMARY_BUTTON_SMALL;

export default async function RecruitmentSettingsPage() {
  await requirePermission('workforce.recruitment_settings.write');
  const db = createSupabaseAdminClient();
  const [
    pipelines,
    stages,
    scorecards,
    sections,
    criteria,
    assessments,
    retention,
    automations,
    sources,
    notices,
    requests,
    holds,
    retentionQueue,
    candidates,
    applications,
  ] = await Promise.all([
    db.from('recruitment_pipeline_templates').select('*').order('name'),
    db.from('recruitment_pipeline_stages').select('*').order('sort_order'),
    db.from('recruitment_scorecard_templates').select('*').order('name'),
    db.from('recruitment_scorecard_sections').select('*').order('sort_order'),
    db.from('recruitment_scorecard_criteria').select('*').order('sort_order'),
    db.from('recruitment_assessment_templates').select('*').order('name'),
    db.from('recruitment_retention_policies').select('*').order('record_type'),
    db.from('recruitment_automation_rules').select('*').order('priority'),
    db.from('recruitment_source_definitions').select('*').order('name'),
    db
      .from('recruitment_privacy_notice_versions')
      .select('*')
      .order('created_at', { ascending: false }),
    db
      .from('recruitment_privacy_requests')
      .select('*')
      .order('due_at')
      .limit(100),
    db
      .from('recruitment_legal_holds')
      .select('*')
      .is('released_at', null)
      .order('created_at', { ascending: false }),
    db
      .from('recruitment_retention_queue')
      .select('*, recruitment_retention_policies(record_type, action)')
      .in('status', ['pending', 'held', 'failed'])
      .order('due_at')
      .limit(200),
    db
      .from('recruitment_candidates')
      .select('id, full_name, primary_email')
      .not('status', 'in', '(deleted,anonymized)')
      .order('full_name')
      .limit(500),
    db
      .from('recruitment_applications')
      .select('id, application_reference')
      .order('created_at', { ascending: false })
      .limit(500),
  ]);
  for (const result of [
    pipelines,
    stages,
    scorecards,
    sections,
    criteria,
    assessments,
    retention,
    automations,
    sources,
    notices,
    requests,
    holds,
    retentionQueue,
    candidates,
    applications,
  ])
    if (result.error) throw result.error;

  return (
    <>
      <WorkforceHeading
        title="Recruitment settings"
        subtitle="Governed pipelines, scorecards, assessments, retention, automation, sources and privacy operations."
      />
      <div className="space-y-6">
        <section className={card}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Pipelines and service levels
          </h2>
          <form
            action={createPipeline}
            className="mt-4 grid gap-2 md:grid-cols-4"
          >
            <input
              className={input}
              name="name"
              required
              placeholder="Pipeline name"
            />
            <input
              className={input}
              name="department"
              placeholder="Department"
            />
            <input
              className={input}
              name="description"
              placeholder="Description"
            />
            <button data-opus-button="control" className={button}>Create draft</button>
          </form>
          <div className="mt-4 space-y-3">
            {(pipelines.data ?? []).map((pipeline) => (
              <details key={pipeline.id} className="rounded-xl bg-gray-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold">
                  {pipeline.name} · <StatusPill status={pipeline.status} />
                </summary>
                <div className="mt-3 space-y-2">
                  {(stages.data ?? [])
                    .filter((stage) => stage.pipeline_id === pipeline.id)
                    .map((stage) => (
                      <div
                        key={stage.id}
                        className="flex justify-between rounded-lg bg-white px-3 py-2 text-xs"
                      >
                        <span>
                          {stage.sort_order}. {stage.label}
                        </span>
                        <span>
                          {stage.candidate_facing_status} ·{' '}
                          {stage.service_level_hours ?? '—'}h
                        </span>
                      </div>
                    ))}
                </div>
                {pipeline.status === 'draft' && (
                  <form
                    action={addPipelineStage.bind(null, pipeline.id)}
                    className="mt-3 grid gap-2 md:grid-cols-4"
                  >
                    <input
                      className={input}
                      name="label"
                      required
                      placeholder="Stage label"
                    />
                    <input
                      className={input}
                      name="key"
                      required
                      placeholder="stage_key"
                    />
                    <select className={input} name="candidate_status">
                      <option>Application received</option>
                      <option>Under review</option>
                      <option>Next steps</option>
                      <option>Interview process</option>
                      <option>Decision made</option>
                      <option>Offer</option>
                      <option>Hired</option>
                      <option>Withdrawn</option>
                    </select>
                    <select className={input} name="stage_type">
                      <option value="review">Review</option>
                      <option value="screening">Screening</option>
                      <option value="assessment">Assessment</option>
                      <option value="interview">Interview</option>
                      <option value="check">Check</option>
                      <option value="offer">Offer</option>
                    </select>
                    <input
                      className={input}
                      name="sort_order"
                      type="number"
                      min="1"
                      required
                      placeholder="Order"
                    />
                    <input
                      className={input}
                      name="sla_hours"
                      type="number"
                      min="1"
                      placeholder="SLA hours"
                    />
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" name="requires_scorecards" />{' '}
                      Requires scorecards
                    </label>
                    <button data-opus-button="control" className={button}>Add stage</button>
                  </form>
                )}
                <form
                  action={setTemplateStatus.bind(
                    null,
                    'pipeline',
                    pipeline.id,
                    pipeline.status === 'active' ? 'archived' : 'active'
                  )}
                  className="mt-3"
                >
                  <button data-opus-button="control" className={NEUTRAL_BUTTON_SMALL}>
                    {pipeline.status === 'active' ? 'Archive' : 'Activate'}
                  </button>
                </form>
              </details>
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Structured scorecards
          </h2>
          <form
            action={createScorecardTemplate}
            className="mt-4 grid gap-2 md:grid-cols-4"
          >
            <input
              className={input}
              name="name"
              required
              placeholder="Template name"
            />
            <input
              className={input}
              name="department"
              placeholder="Department"
            />
            <input
              className={input}
              name="instructions"
              placeholder="Evidence guidance"
            />
            <button data-opus-button="control" className={button}>Create template</button>
          </form>
          <div className="mt-4 space-y-3">
            {(scorecards.data ?? []).map((template) => (
              <details key={template.id} className="rounded-xl bg-gray-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold">
                  {template.name} · {template.status}
                </summary>
                <div className="mt-3 space-y-3">
                  {(sections.data ?? [])
                    .filter((section) => section.template_id === template.id)
                    .map((section) => (
                      <div key={section.id} className="rounded-lg bg-white p-3">
                        <p className="text-sm font-semibold">
                          {section.title} · weight {section.weight}
                        </p>
                        {(criteria.data ?? [])
                          .filter(
                            (criterion) => criterion.section_id === section.id
                          )
                          .map((criterion) => (
                            <p
                              key={criterion.id}
                              className="mt-1 text-xs text-gray-500"
                            >
                              {criterion.label} · /{criterion.rating_scale} ·
                              weight {criterion.weight}
                              {criterion.is_required ? ' · required' : ''}
                            </p>
                          ))}
                        {template.status === 'draft' && (
                          <form
                            action={addScorecardCriterion.bind(
                              null,
                              section.id
                            )}
                            className="mt-2 grid gap-2 md:grid-cols-4"
                          >
                            <input
                              className={input}
                              name="label"
                              required
                              placeholder="Criterion"
                            />
                            <input
                              className={input}
                              name="description"
                              placeholder="Observable evidence"
                            />
                            <input
                              className={input}
                              name="rating_scale"
                              type="number"
                              min="2"
                              max="10"
                              defaultValue="5"
                            />
                            <input
                              className={input}
                              name="weight"
                              type="number"
                              min="0.1"
                              step="0.1"
                              defaultValue="1"
                            />
                            <input
                              type="hidden"
                              name="sort_order"
                              value={
                                (criteria.data ?? []).filter(
                                  (c) => c.section_id === section.id
                                ).length + 1
                              }
                            />
                            <label className="text-xs">
                              <input
                                name="is_required"
                                type="checkbox"
                                defaultChecked
                              />{' '}
                              Required
                            </label>
                            <button data-opus-button="control" className={button}>Add criterion</button>
                          </form>
                        )}
                      </div>
                    ))}
                </div>
                {template.status === 'draft' && (
                  <form
                    action={addScorecardSection.bind(null, template.id)}
                    className="mt-3 grid gap-2 md:grid-cols-4"
                  >
                    <input
                      className={input}
                      name="title"
                      required
                      placeholder="Section"
                    />
                    <input
                      className={input}
                      name="description"
                      placeholder="Description"
                    />
                    <input
                      className={input}
                      name="weight"
                      type="number"
                      step="0.1"
                      min="0.1"
                      defaultValue="1"
                    />
                    <input
                      className={input}
                      name="sort_order"
                      type="number"
                      min="0"
                      defaultValue={
                        (sections.data ?? []).filter(
                          (s) => s.template_id === template.id
                        ).length + 1
                      }
                    />
                    <button data-opus-button="control" className={button}>Add section</button>
                  </form>
                )}
                <form
                  action={setTemplateStatus.bind(
                    null,
                    'scorecard',
                    template.id,
                    template.status === 'active' ? 'archived' : 'active'
                  )}
                  className="mt-3"
                >
                  <button data-opus-button="control" className={NEUTRAL_BUTTON_SMALL}>
                    {template.status === 'active' ? 'Archive' : 'Activate'}
                  </button>
                </form>
              </details>
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Assessment templates
          </h2>
          <form
            action={createAssessmentTemplate}
            className="mt-4 grid gap-2 md:grid-cols-3"
          >
            <input
              className={input}
              name="name"
              required
              placeholder="Template name"
            />
            <input
              className={input}
              name="assessment_type"
              required
              placeholder="Type"
            />
            <input
              className={input}
              name="time_limit_minutes"
              type="number"
              min="1"
              placeholder="Time limit"
            />
            <textarea
              className={`${input} md:col-span-2`}
              name="instructions"
              required
              placeholder="Candidate instructions"
            />
            <textarea
              className={input}
              name="rubric"
              defaultValue="[]"
              aria-label="Rubric JSON"
            />
            <textarea
              className={`${input} md:col-span-2`}
              name="accommodation_guidance"
              placeholder="Accommodation guidance"
            />
            <button data-opus-button="control" className={button}>Create template</button>
          </form>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {(assessments.data ?? []).map((item) => (
              <article key={item.id} className="rounded-xl bg-gray-50 p-3">
                <p className="text-sm font-semibold">
                  {item.name} · v{item.version}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {item.assessment_type} · {item.status}
                </p>
                <form
                  action={setTemplateStatus.bind(
                    null,
                    'assessment',
                    item.id,
                    item.status === 'active' ? 'archived' : 'active'
                  )}
                  className="mt-2"
                >
                  <button data-opus-button="control" className={NEUTRAL_BUTTON_SMALL}>
                    {item.status === 'active' ? 'Archive' : 'Activate'}
                  </button>
                </form>
              </article>
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Retention policies
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Durations require legal/privacy approval. Active legal holds
            override the expiry queue.
          </p>
          <form
            action={upsertRetentionPolicy}
            className="mt-4 grid gap-2 md:grid-cols-5"
          >
            <input
              className={input}
              name="record_type"
              required
              placeholder="Record type"
            />
            <input
              className={input}
              name="retention_days"
              type="number"
              min="1"
              required
              placeholder="Days"
            />
            <select className={input} name="action">
              <option value="review">Review</option>
              <option value="anonymize">Anonymize</option>
              <option value="delete">Delete</option>
            </select>
            <input
              className={input}
              name="legal_basis"
              required
              placeholder="Legal basis"
            />
            <button data-opus-button="control" className={button}>Save policy</button>
          </form>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {(retention.data ?? []).map((policy) => (
              <p
                key={policy.id}
                className="rounded-lg bg-gray-50 px-3 py-2 text-xs"
              >
                <b>{policy.record_type.replaceAll('_', ' ')}</b>:{' '}
                {policy.retention_days} days → {policy.action}
                <br />
                <span className="text-gray-500">{policy.legal_basis}</span>
              </p>
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Logged automation
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Automations may notify or assign; opaque rules must never reject
            candidates.
          </p>
          <form
            action={createAutomationRule}
            className="mt-4 grid gap-2 md:grid-cols-3"
          >
            <input
              className={input}
              name="name"
              required
              placeholder="Rule name"
            />
            <input
              className={input}
              name="trigger_event"
              required
              placeholder="application.submitted"
            />
            <input
              className={input}
              name="priority"
              type="number"
              defaultValue="100"
            />
            <textarea
              className={input}
              name="conditions"
              defaultValue="{}"
              aria-label="Conditions JSON"
            />
            <textarea
              className={input}
              name="actions"
              defaultValue="[]"
              aria-label="Actions JSON"
            />
            <button data-opus-button="control" className={button}>Create draft</button>
          </form>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {(automations.data ?? []).map((rule) => (
              <article key={rule.id} className="rounded-xl bg-gray-50 p-3">
                <p className="text-sm font-semibold">{rule.name}</p>
                <p className="text-xs text-gray-500">
                  {rule.trigger_event} · {rule.status} · priority{' '}
                  {rule.priority}
                </p>
                <form
                  action={setAutomationStatus.bind(
                    null,
                    rule.id,
                    rule.status === 'active' ? 'paused' : 'active'
                  )}
                  className="mt-2"
                >
                  <button data-opus-button="control" className={NEUTRAL_BUTTON_SMALL}>
                    {rule.status === 'active' ? 'Pause' : 'Activate'}
                  </button>
                </form>
              </article>
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Normalized sources and UTM mapping
          </h2>
          <form
            action={createSource}
            className="mt-4 grid gap-2 md:grid-cols-5"
          >
            <input
              className={input}
              name="name"
              required
              placeholder="Source name"
            />
            <input
              className={input}
              name="source_type"
              required
              placeholder="Source type"
            />
            <input
              className={input}
              name="utm_source"
              placeholder="utm_source"
            />
            <input
              className={input}
              name="utm_medium"
              placeholder="utm_medium"
            />
            <button data-opus-button="control" className={button}>Add source</button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            {(sources.data ?? []).map((source) => (
              <span
                key={source.id}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs"
              >
                {source.name} · {source.utm_source ?? 'no UTM'}
              </span>
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Privacy notices and requests
          </h2>
          <form
            action={createPrivacyNotice}
            className="mt-4 grid gap-2 md:grid-cols-4"
          >
            <input
              className={input}
              name="purpose"
              required
              placeholder="Purpose"
            />
            <input
              className={input}
              name="version"
              required
              placeholder="Version"
            />
            <select className={input} name="locale">
              <option value="en">English</option>
              <option value="sw">Kiswahili</option>
            </select>
            <input
              className={input}
              name="title"
              required
              placeholder="Notice title"
            />
            <textarea
              className={`${input} md:col-span-3`}
              name="body"
              required
              placeholder="Notice text"
            />
            <button data-opus-button="control" className={button}>Save draft</button>
          </form>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {(notices.data ?? []).map((notice) => (
              <article key={notice.id} className="rounded-xl bg-gray-50 p-3">
                <p className="text-sm font-semibold">
                  {notice.title} · {notice.version} · {notice.locale}
                </p>
                <p className="text-xs capitalize text-gray-500">
                  {notice.purpose} · {notice.status}
                </p>
                <form
                  action={setPrivacyNoticeStatus.bind(
                    null,
                    notice.id,
                    notice.status === 'active' ? 'retired' : 'active'
                  )}
                  className="mt-2"
                >
                  <button data-opus-button="control" className={NEUTRAL_BUTTON_SMALL}>
                    {notice.status === 'active' ? 'Retire' : 'Activate'}
                  </button>
                </form>
              </article>
            ))}
          </div>
          <h3 className="mt-6 text-sm font-semibold">Privacy request queue</h3>
          <div className="mt-2 space-y-2">
            {(requests.data ?? []).map((request) => (
              <form
                key={request.id}
                action={updatePrivacyRequest.bind(null, request.id)}
                className="grid gap-2 rounded-xl border border-gray-100 p-3 md:grid-cols-[1fr_180px_2fr_auto]"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {request.request_reference} · {request.request_type}
                  </p>
                  <p className="text-xs text-gray-500">
                    {request.requester_email} · due{' '}
                    {new Date(request.due_at).toLocaleDateString('en-TZ')}
                  </p>
                </div>
                <select
                  className={input}
                  name="status"
                  defaultValue={request.status}
                >
                  <option value="received">Received</option>
                  <option value="identity_verification">
                    Identity verification
                  </option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="denied">Denied</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <input
                  className={input}
                  name="resolution_note"
                  defaultValue={request.resolution_note ?? ''}
                  placeholder="Resolution note"
                />
                <button data-opus-button="control" className={button}>Update</button>
              </form>
            ))}
          </div>
          <h3 className="mt-6 text-sm font-semibold">Legal holds</h3>
          <form
            action={createLegalHold}
            className="mt-2 grid gap-2 md:grid-cols-4"
          >
            <select className={input} name="candidate_id">
              <option value="">Candidate (optional)</option>
              {(candidates.data ?? []).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.full_name} · {candidate.primary_email}
                </option>
              ))}
            </select>
            <select className={input} name="application_id">
              <option value="">Application (optional)</option>
              {(applications.data ?? []).map((application) => (
                <option key={application.id} value={application.id}>
                  {application.application_reference}
                </option>
              ))}
            </select>
            <input
              className={input}
              name="reason"
              required
              minLength={10}
              placeholder="Hold reason"
            />
            <input className={input} name="ends_at" type="date" />
            <button data-opus-button="control" className={button}>Create hold</button>
          </form>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {(holds.data ?? []).map((hold) => (
              <div key={hold.id} className="rounded-lg bg-amber-50 p-3 text-xs">
                <b>{hold.reason}</b>
                <br />
                <span>
                  Candidate {hold.candidate_id ?? '—'} · application{' '}
                  {hold.application_id ?? '—'}
                </span>
                <form
                  action={releaseLegalHold.bind(null, hold.id)}
                  className="mt-2"
                >
                  <button data-opus-button="control" className={NEUTRAL_BUTTON_SMALL}>
                    Release hold
                  </button>
                </form>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Retention expiry queue</h3>
              <p className="text-xs text-gray-500">
                Scanning only queues records. Each mutation remains an explicit
                reviewed action and legal holds win.
              </p>
            </div>
            <form action={runRetentionScan}>
              <button data-opus-button="control" className={button}>Run expiry scan</button>
            </form>
          </div>
          <div className="mt-3 space-y-2">
            {(retentionQueue.data ?? []).map((item) => {
              const policy = Array.isArray(item.recruitment_retention_policies)
                ? item.recruitment_retention_policies[0]
                : item.recruitment_retention_policies;
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 p-3 text-xs"
                >
                  <span>
                    <b>{policy?.record_type?.replaceAll('_', ' ')}</b> ·{' '}
                    {item.entity_type} · {item.status} · action {policy?.action}
                  </span>
                  {item.status === 'pending' && (
                    <form action={processRetentionItem.bind(null, item.id)}>
                      <button data-opus-button="control" className={NEUTRAL_BUTTON_SMALL}>
                        Review and process
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
