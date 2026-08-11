import { notFound } from 'next/navigation';
import WorkforceHeading from '../../../_components/PageHeading';
import { getCallerPermissions } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import {
  DANGER_BUTTON_SMALL,
  FIELD,
  FIELD_LABEL,
  NEUTRAL_BUTTON_SMALL,
  PANEL,
  PRIMARY_BUTTON_SMALL,
  SECONDARY_BUTTON_SMALL,
  SUMMARY,
} from '../../_components/ui';
import ConfirmActionForm from '../../_components/ConfirmActionForm';
import {
  addCareersBlock,
  addCareersEditorialComment,
  deleteCareersBlock,
  deleteCareersPage,
  transitionCareersPage,
  updateCareersBlock,
  updateCareersPage,
} from '../actions';

export default async function CareersContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const permissions = await getCallerPermissions();
  if (!permissions.has('workforce.careers_content.read')) {
    throw new Error('You do not have access to careers content.');
  }
  const supabase = createSupabaseAdminClient();
  const [pageResult, blocksResult, versionsResult, commentsResult] =
    await Promise.all([
      supabase.from('careers_cms_pages').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('careers_cms_blocks')
        .select('*')
        .eq('page_id', id)
        .order('sort_order'),
      supabase
        .from('careers_cms_page_versions')
        .select('id, version, created_at')
        .eq('page_id', id)
        .order('version', { ascending: false }),
      supabase
        .from('careers_cms_editorial_comments')
        .select('id, body, created_at, workforce_employees(full_name)')
        .eq('page_id', id)
        .order('created_at', { ascending: false }),
    ]);
  for (const result of [
    pageResult,
    blocksResult,
    versionsResult,
    commentsResult,
  ]) {
    if (result.error) throw result.error;
  }
  if (!pageResult.data) notFound();

  const page = pageResult.data;
  const canWrite = permissions.has('workforce.careers_content.write');
  const canPublish = permissions.has('workforce.careers_content.publish');
  const isEditable =
    canWrite && ['draft', 'in_review', 'approved'].includes(page.status);
  const transitions: Record<string, Array<[string, string]>> = {
    draft: [
      ['in_review', 'Submit for review'],
      ['archived', 'Archive page'],
    ],
    in_review: [
      ['draft', 'Return to draft'],
      ['approved', 'Approve'],
      ['archived', 'Archive page'],
    ],
    approved: [
      ['draft', 'Return to draft'],
      ['published', 'Publish now'],
      ['archived', 'Archive page'],
    ],
    scheduled: [
      ['draft', 'Cancel schedule'],
      ['published', 'Publish now'],
      ['archived', 'Archive page'],
    ],
    published: [
      ['draft', 'Create revision'],
      ['archived', 'Archive page'],
    ],
    archived: [],
  };

  return (
    <>
      <WorkforceHeading
        title={page.title}
        subtitle={`/${page.slug} · ${page.locale} · ${page.status.replaceAll('_', ' ')}`}
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className={`${PANEL} p-6`}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Page metadata
            </h2>
            <form
              action={updateCareersPage.bind(null, id)}
              className="mt-4 space-y-3"
            >
              <label className="block text-xs font-semibold text-gray-600">
                Title
                <input
                  name="title"
                  required
                  defaultValue={page.title}
                  disabled={!isEditable}
                  className={`${FIELD} mt-1`}
                />
              </label>
              <label className="block text-xs font-semibold text-gray-600">
                SEO title
                <input
                  name="seo_title"
                  defaultValue={page.seo_title ?? ''}
                  disabled={!isEditable}
                  className={`${FIELD} mt-1`}
                />
              </label>
              <label className="block text-xs font-semibold text-gray-600">
                SEO description
                <textarea
                  name="seo_description"
                  maxLength={320}
                  rows={3}
                  defaultValue={page.seo_description ?? ''}
                  disabled={!isEditable}
                  className={`${FIELD} mt-1`}
                />
              </label>
              {isEditable && (
                <button data-opus-button="control" className={PRIMARY_BUTTON_SMALL}>Save metadata</button>
              )}
            </form>
            {canWrite && !isEditable && page.status !== 'archived' && (
              <p className="mt-3 rounded-xl bg-[#F8EDFF] px-3 py-2 text-xs text-[#5B2D8E]">
                Return this page to draft before editing its metadata or content
                blocks.
              </p>
            )}
          </section>

          <section className={`${PANEL} p-6`}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Content blocks
            </h2>
            <div className="mt-4 space-y-3">
              {(blocksResult.data ?? []).map((block) => (
                <article key={block.id} className="rounded-xl bg-gray-50 p-4">
                  <div className="flex justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {block.block_type.replaceAll('_', ' ')}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        block.accessibility_status === 'passed' ||
                        block.accessibility_status === 'not_applicable'
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {block.accessibility_status.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <h3 className="mt-2 font-semibold text-gray-900">
                    {block.content?.heading}
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                    {block.content?.body}
                  </p>
                  {block.image_alt_text && (
                    <p className="mt-2 text-xs text-gray-400">
                      Alt: {block.image_alt_text}
                    </p>
                  )}

                  {isEditable && (
                    <div className="mt-3 border-t border-gray-200 pt-3">
                      <details>
                        <summary
                          className={`${SUMMARY} [&::-webkit-details-marker]:hidden`}
                        >
                          Edit block
                        </summary>
                        <form
                          action={updateCareersBlock.bind(null, id, block.id)}
                          className="mt-3 grid gap-3 rounded-xl bg-white p-3 sm:grid-cols-2"
                        >
                          <label className="block">
                            <span className={FIELD_LABEL}>Heading</span>
                            <input
                              name="heading"
                              defaultValue={block.content?.heading ?? ''}
                              className={FIELD}
                            />
                          </label>
                          <label className="block">
                            <span className={FIELD_LABEL}>Image URL</span>
                            <input
                              name="image_url"
                              type="url"
                              defaultValue={block.content?.image_url ?? ''}
                              className={FIELD}
                            />
                          </label>
                          <label className="block sm:col-span-2">
                            <span className={FIELD_LABEL}>Body</span>
                            <textarea
                              name="body"
                              rows={4}
                              defaultValue={block.content?.body ?? ''}
                              className={FIELD}
                            />
                          </label>
                          <label className="block">
                            <span className={FIELD_LABEL}>
                              Image alternative text
                            </span>
                            <input
                              name="image_alt_text"
                              defaultValue={block.image_alt_text ?? ''}
                              className={FIELD}
                            />
                          </label>
                          <label className="block">
                            <span className={FIELD_LABEL}>
                              Call-to-action label
                            </span>
                            <input
                              name="cta_label"
                              defaultValue={block.content?.cta_label ?? ''}
                              className={FIELD}
                            />
                          </label>
                          <label className="block sm:col-span-2">
                            <span className={FIELD_LABEL}>
                              Call-to-action link
                            </span>
                            <input
                              name="cta_href"
                              defaultValue={block.content?.cta_href ?? ''}
                              className={FIELD}
                            />
                          </label>
                          <button data-opus-button="control"
                            className={`${PRIMARY_BUTTON_SMALL} sm:col-span-2`}
                          >
                            Save changes
                          </button>
                        </form>
                      </details>
                      <ConfirmActionForm
                        action={deleteCareersBlock.bind(null, id, block.id)}
                        confirmMessage={`Delete this ${block.block_type.replaceAll('_', ' ')} block? This cannot be undone.`}
                        className="mt-2"
                      >
                        <button data-opus-button="control" className={DANGER_BUTTON_SMALL}>
                          Delete block
                        </button>
                      </ConfirmActionForm>
                    </div>
                  )}
                </article>
              ))}
              {blocksResult.data?.length === 0 && (
                <p className="text-sm text-gray-400">No blocks yet.</p>
              )}
            </div>

            {isEditable && (
              <form
                action={addCareersBlock.bind(null, id)}
                className="mt-5 grid gap-3 rounded-xl border border-dashed border-gray-200 p-4 sm:grid-cols-2"
              >
                <select name="block_type" className={FIELD}>
                  <option value="hero">Hero</option>
                  <option value="rich_text">Rich text</option>
                  <option value="values">Values</option>
                  <option value="benefits">Benefits</option>
                  <option value="locations">Locations</option>
                  <option value="faq">FAQ</option>
                  <option value="story">Story</option>
                  <option value="process">Process</option>
                  <option value="cta">Call to action</option>
                  <option value="image">Image</option>
                </select>
                <input name="heading" placeholder="Heading" className={FIELD} />
                <textarea
                  name="body"
                  rows={4}
                  placeholder="Body"
                  className={`${FIELD} sm:col-span-2`}
                />
                <input
                  name="image_url"
                  type="url"
                  placeholder="Image URL (optional)"
                  className={FIELD}
                />
                <input
                  name="image_alt_text"
                  placeholder="Image alternative text"
                  className={FIELD}
                />
                <input
                  name="cta_label"
                  placeholder="CTA label"
                  className={FIELD}
                />
                <input
                  name="cta_href"
                  placeholder="CTA link"
                  className={FIELD}
                />
                <button data-opus-button="control" className={`${PRIMARY_BUTTON_SMALL} sm:col-span-2`}>
                  Add block
                </button>
              </form>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className={`${PANEL} p-5`}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Editorial workflow
            </h2>
            <p className="mt-1 text-sm capitalize text-gray-600">
              Current: {page.status.replaceAll('_', ' ')}
            </p>
            <div className="mt-4 space-y-2">
              {(transitions[page.status] ?? []).map(([target, label]) => {
                const allowed = ['approved', 'published'].includes(target)
                  ? canPublish
                  : canWrite;
                return allowed ? (
                  <form
                    key={target}
                    action={transitionCareersPage.bind(null, id, target)}
                  >
                    <button data-opus-button="control"
                      className={`w-full ${target === 'archived' ? DANGER_BUTTON_SMALL : SECONDARY_BUTTON_SMALL}`}
                    >
                      {label}
                    </button>
                  </form>
                ) : null;
              })}
              {page.status === 'approved' && canPublish && (
                <form
                  action={transitionCareersPage.bind(null, id, 'scheduled')}
                  className="rounded-xl bg-white p-3"
                >
                  <label className="text-xs font-semibold text-gray-600">
                    Schedule publication
                    <input
                      name="scheduled_at"
                      type="datetime-local"
                      required
                      className={`${FIELD} mt-1`}
                    />
                  </label>
                  <button data-opus-button="control" className={`mt-2 w-full ${PRIMARY_BUTTON_SMALL}`}>
                    Schedule
                  </button>
                </form>
              )}
            </div>
            {canWrite && page.status === 'draft' && !page.published_at && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="text-xs leading-5 text-gray-500">
                  Permanent deletion is available only for a never-published
                  draft. Page blocks, comments and draft versions are removed
                  with it.
                </p>
                <ConfirmActionForm
                  action={deleteCareersPage.bind(null, id)}
                  confirmMessage={`Delete “${page.title}” and all of its draft content? This cannot be undone.`}
                  className="mt-3"
                >
                  <button data-opus-button="control" className={`w-full ${DANGER_BUTTON_SMALL}`}>
                    Delete draft permanently
                  </button>
                </ConfirmActionForm>
              </div>
            )}
          </section>

          <section className={`${PANEL} p-5`}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Version history
            </h2>
            <ol className="mt-3 space-y-2">
              {(versionsResult.data ?? []).map((version) => (
                <li
                  key={version.id}
                  className="flex justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs"
                >
                  <span className="font-semibold">
                    Version {version.version}
                  </span>
                  <time className="text-gray-400">
                    {new Date(version.created_at).toLocaleDateString('en-TZ')}
                  </time>
                </li>
              ))}
              {versionsResult.data?.length === 0 && (
                <li className="text-sm text-gray-400">
                  No workflow snapshots yet.
                </li>
              )}
            </ol>
          </section>

          <section className={`${PANEL} p-5`}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Approval comments
            </h2>
            <form
              action={addCareersEditorialComment.bind(null, id)}
              className="mt-3"
            >
              <textarea name="body" required rows={3} className={FIELD} />
              <button data-opus-button="control" className={`mt-2 ${NEUTRAL_BUTTON_SMALL}`}>
                Add comment
              </button>
            </form>
            <div className="mt-4 divide-y divide-gray-100">
              {(commentsResult.data ?? []).map((comment) => {
                const employee = Array.isArray(comment.workforce_employees)
                  ? comment.workforce_employees[0]
                  : comment.workforce_employees;
                return (
                  <article key={comment.id} className="py-3">
                    <p className="text-xs font-semibold text-gray-600">
                      {employee?.full_name ?? 'Reviewer'}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">{comment.body}</p>
                  </article>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
