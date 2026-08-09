import { notFound } from 'next/navigation';
import WorkforceHeading from '../../../_components/PageHeading';
import { getCallerPermissions } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { requireRecruitmentAccess } from '@/lib/recruitment-auth';
import {
  addApplicationQuestion,
  setJobLanguageStatus,
  transitionJobPosting,
  updateJobPosting,
  upsertJobChannel,
  upsertJobLanguage,
} from './actions';

const input =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm';
const transitions: Record<string, string[]> = {
  draft: ['in_review', 'archived'],
  in_review: ['draft', 'approved', 'archived'],
  approved: ['draft', 'scheduled', 'published', 'archived'],
  scheduled: ['draft', 'published', 'archived'],
  published: ['paused', 'closed', 'archived'],
  paused: ['draft', 'published', 'closed', 'archived'],
  closed: ['published', 'archived'],
};

export default async function JobPostingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = createSupabaseAdminClient();
  const { data: posting, error } = await db
    .from('recruitment_job_postings')
    .select('*, workforce_jobs(id, title, department, location, status, slug)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!posting) notFound();
  const job = Array.isArray(posting.workforce_jobs)
    ? posting.workforce_jobs[0]
    : posting.workforce_jobs;
  await requireRecruitmentAccess({
    entityType: 'job',
    entityId: posting.workforce_job_id,
    allowedPermissions: ['workforce.jobs.read'],
  });
  const [languages, questions, channels, versions, permissions] =
    await Promise.all([
      db
        .from('recruitment_job_languages')
        .select('*')
        .eq('posting_id', id)
        .order('language_code'),
      db
        .from('recruitment_application_questions')
        .select('*')
        .eq('posting_id', id)
        .order('sort_order'),
      db
        .from('recruitment_job_channels')
        .select('*')
        .eq('posting_id', id)
        .order('channel'),
      db
        .from('recruitment_job_posting_versions')
        .select('id, version, created_at')
        .eq('posting_id', id)
        .order('version', { ascending: false }),
      getCallerPermissions(),
    ]);
  for (const result of [languages, questions, channels, versions])
    if (result.error) throw result.error;
  const canWrite = permissions.has('workforce.jobs.write');
  const canPublish = permissions.has('workforce.jobs.publish');
  const canArchive = permissions.has('workforce.jobs.archive');
  return (
    <>
      <WorkforceHeading
        title={posting.public_title}
        subtitle={`${job?.department ?? 'Department'} · ${job?.location ?? 'Location'} · ${posting.status.replaceAll('_', ' ')}`}
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Public content and SEO</h2>
            <form
              action={updateJobPosting.bind(null, id)}
              className="mt-4 space-y-3"
            >
              <input
                className={input}
                name="public_title"
                required
                defaultValue={posting.public_title}
                disabled={!canWrite}
              />
              <textarea
                className={input}
                name="public_summary"
                rows={2}
                defaultValue={posting.public_summary ?? ''}
                disabled={!canWrite}
              />
              <textarea
                className={input}
                name="public_description"
                rows={8}
                required
                defaultValue={posting.public_description ?? ''}
                disabled={!canWrite}
              />
              <input
                className={input}
                name="reporting_manager_title"
                defaultValue={posting.reporting_manager_title ?? ''}
                placeholder="Reporting manager title"
                disabled={!canWrite}
              />
              <textarea
                className={input}
                name="equal_opportunity_statement"
                rows={3}
                defaultValue={posting.equal_opportunity_statement ?? ''}
                placeholder="Equal opportunity statement"
                disabled={!canWrite}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className={input}
                  name="seo_title"
                  defaultValue={posting.seo_title ?? ''}
                  placeholder="SEO title"
                  disabled={!canWrite}
                />
                <input
                  className={input}
                  name="seo_description"
                  defaultValue={posting.seo_description ?? ''}
                  placeholder="SEO description"
                  disabled={!canWrite}
                />
              </div>
              <div className="flex gap-4 text-sm">
                <label>
                  <input
                    type="checkbox"
                    name="is_featured"
                    defaultChecked={posting.is_featured}
                    disabled={!canWrite}
                  />{' '}
                  Featured
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="is_urgent"
                    defaultChecked={posting.is_urgent}
                    disabled={!canWrite}
                  />{' '}
                  Urgent
                </label>
              </div>
              {canWrite &&
                ['draft', 'in_review', 'approved'].includes(posting.status) && (
                  <button className="rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white">
                    Save content
                  </button>
                )}
            </form>
          </section>
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">English and Kiswahili versions</h2>
            <div className="mt-3 space-y-2">
              {(languages.data ?? []).map((language) => {
                const languageTransitions: Record<string, string[]> = {
                  draft: ['review'],
                  review: ['draft', 'approved'],
                  approved: ['draft', 'published'],
                  published: ['draft'],
                };
                return (
                  <div
                    key={language.id}
                    className="rounded-lg bg-gray-50 p-3 text-sm"
                  >
                    <b>
                      {language.language_code.toUpperCase()} ·{' '}
                      {language.public_title}
                    </b>
                    <br />
                    <span className="text-xs capitalize text-gray-500">
                      {language.status}
                    </span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(languageTransitions[language.status] ?? []).map(
                        (target) => {
                          const allowed = ['approved', 'published'].includes(
                            target
                          )
                            ? canPublish
                            : canWrite;
                          return allowed ? (
                            <form
                              key={target}
                              action={setJobLanguageStatus.bind(
                                null,
                                id,
                                language.id,
                                target
                              )}
                            >
                              <button className="rounded border bg-white px-2 py-1 text-xs font-semibold capitalize">
                                {target}
                              </button>
                            </form>
                          ) : null;
                        }
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {canWrite && (
              <form
                action={upsertJobLanguage.bind(null, id)}
                className="mt-4 grid gap-2 sm:grid-cols-2"
              >
                <select className={input} name="language_code">
                  <option value="en">English</option>
                  <option value="sw">Kiswahili</option>
                </select>
                <input
                  className={input}
                  name="public_title"
                  required
                  placeholder="Localized title"
                />
                <textarea
                  className={input}
                  name="public_summary"
                  placeholder="Summary"
                />
                <textarea
                  className={input}
                  name="public_description"
                  placeholder="Description"
                />
                <textarea
                  className={input}
                  name="responsibilities"
                  placeholder="Responsibilities, one per line"
                />
                <textarea
                  className={input}
                  name="requirements"
                  placeholder="Requirements, one per line"
                />
                <input
                  className={input}
                  name="seo_title"
                  placeholder="SEO title"
                />
                <input
                  className={input}
                  name="seo_description"
                  placeholder="SEO description"
                />
                <button className="rounded-lg bg-[#5B2D8E] px-4 py-2 text-xs font-semibold text-white sm:col-span-2">
                  Save translation draft
                </button>
              </form>
            )}
          </section>
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Application questions</h2>
            {(questions.data ?? []).map((question) => (
              <p
                key={question.id}
                className="mt-2 rounded-lg bg-gray-50 p-3 text-sm"
              >
                <b>{question.label}</b>
                <br />
                <span className="text-xs text-gray-500">
                  {question.question_type} ·{' '}
                  {question.is_required ? 'required' : 'optional'}
                  {question.is_knockout
                    ? ' · review flag, never auto-reject'
                    : ''}
                </span>
              </p>
            ))}
            {canWrite && (
              <form
                action={addApplicationQuestion.bind(null, id)}
                className="mt-4 grid gap-2 sm:grid-cols-3"
              >
                <input
                  className={input}
                  name="key"
                  required
                  placeholder="question_key"
                />
                <input
                  className={input}
                  name="label"
                  required
                  placeholder="Candidate-facing question"
                />
                <select className={input} name="question_type">
                  <option value="short_text">Short text</option>
                  <option value="long_text">Long text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="yes_no">Yes / no</option>
                  <option value="single_select">Single select</option>
                  <option value="multi_select">Multi-select</option>
                  <option value="file">File</option>
                  <option value="url">URL</option>
                  <option value="rating">Rating</option>
                  <option value="consent_checkbox">Consent checkbox</option>
                </select>
                <select className={input} name="requirement_stage">
                  <option value="application">At application</option>
                  <option value="before_interview">Before interview</option>
                  <option value="before_hire">Before hire</option>
                </select>
                <input
                  className={input}
                  name="help_text"
                  placeholder="Help text"
                />
                <textarea
                  className={input}
                  name="options"
                  placeholder="Select options, one per line"
                />
                <input
                  className={input}
                  name="sort_order"
                  type="number"
                  min="0"
                  defaultValue={(questions.data ?? []).length + 1}
                />
                <label className="text-xs">
                  <input type="checkbox" name="is_required" /> Required
                </label>
                <label className="text-xs">
                  <input type="checkbox" name="is_knockout" /> Flag for human
                  eligibility review
                </label>
                <input
                  className={input}
                  name="expected_answer"
                  placeholder="Expected answer for review flag"
                />
                <button className="rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white sm:col-span-3">
                  Add question
                </button>
              </form>
            )}
          </section>
        </div>
        <aside className="space-y-5">
          <section className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Editorial workflow
            </h2>
            <p className="mt-1 text-sm capitalize text-[#5B2D8E]">
              {posting.status.replaceAll('_', ' ')}
            </p>
            <div className="mt-3 space-y-2">
              {(transitions[posting.status] ?? []).map((target) => {
                const allowed =
                  target === 'published'
                    ? canPublish
                    : ['closed', 'archived'].includes(target)
                      ? canArchive
                      : canWrite;
                return allowed ? (
                  <form
                    key={target}
                    action={transitionJobPosting.bind(null, id, target)}
                  >
                    <button className="w-full rounded-lg bg-white px-3 py-2 text-xs font-semibold capitalize">
                      {target === 'draft' && posting.status === 'paused'
                        ? 'Create draft revision'
                        : target.replaceAll('_', ' ')}
                    </button>
                  </form>
                ) : null;
              })}
              {posting.status === 'approved' && canPublish && (
                <form
                  action={transitionJobPosting.bind(null, id, 'scheduled')}
                  className="rounded-xl bg-white p-3"
                >
                  <input
                    name="publish_at"
                    type="datetime-local"
                    required
                    className={input}
                  />
                  <input
                    name="unpublish_at"
                    type="datetime-local"
                    className={`${input} mt-2`}
                  />
                  <button className="mt-2 w-full rounded-lg bg-[#5B2D8E] px-3 py-2 text-xs font-semibold text-white">
                    Schedule publication
                  </button>
                </form>
              )}
            </div>
          </section>
          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Distribution channels</h2>
            {(channels.data ?? []).map((channel) => (
              <p
                key={channel.id}
                className="mt-2 rounded-lg bg-gray-50 p-2 text-xs"
              >
                <b>{channel.channel}</b> · {channel.status}
                {channel.external_url && (
                  <>
                    {' '}
                    ·{' '}
                    <a href={channel.external_url} className="underline">
                      open
                    </a>
                  </>
                )}
              </p>
            ))}
            {canWrite && (
              <form
                action={upsertJobChannel.bind(null, id)}
                className="mt-3 space-y-2"
              >
                <input
                  className={input}
                  name="channel"
                  required
                  placeholder="LinkedIn, job board…"
                />
                <input
                  className={input}
                  name="external_job_id"
                  placeholder="External job ID"
                />
                <input
                  className={input}
                  name="external_url"
                  type="url"
                  placeholder="Published URL"
                />
                <button className="w-full rounded-lg border px-3 py-2 text-xs font-semibold">
                  Queue or record channel
                </button>
              </form>
            )}
          </section>
          <section className="rounded-2xl border bg-white p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Immutable published versions</h2>
            {(versions.data ?? []).map((version) => (
              <p key={version.id} className="mt-2 text-xs">
                Version {version.version} ·{' '}
                {new Date(version.created_at).toLocaleString('en-TZ')}
              </p>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
