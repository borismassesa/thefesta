import { requirePermission } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import CollectionPage from '../_components/CollectionPage';
import {
  DANGER_BUTTON_SMALL,
  FIELD,
  FIELD_LABEL,
  NEUTRAL_BUTTON_SMALL,
  PANEL,
  PRIMARY_BUTTON,
  PRIMARY_BUTTON_SMALL,
  StatusPill,
  SUMMARY,
} from '../_components/ui';
import { getSimpleCollectionRows } from '../_lib/collections';
import ConfirmActionForm from '../_components/ConfirmActionForm';
import {
  createCareersPage,
  createCareersReferenceContent,
  deleteCareersReferenceContent,
  setCareersReferenceStatus,
  updateCareersReferenceContent,
  type CareersReferenceKind,
} from './actions';

const inputClass = FIELD;

type ReferenceRow = {
  id: string;
  status: string;
  title?: string;
  description?: string;
  icon?: string | null;
  question?: string;
  answer?: string;
  category?: string | null;
  locale?: string;
  name?: string;
  address?: string | null;
  country_code?: string | null;
  timezone?: string | null;
  summary?: string | null;
  content?: { summary?: string };
  person_name?: string;
  role_title?: string | null;
  headline?: string;
  body?: string;
  image_url?: string | null;
};

function ReferenceEditFields({
  kind,
  row,
}: {
  kind: CareersReferenceKind;
  row: ReferenceRow;
}) {
  if (kind === 'benefit') {
    return (
      <>
        <label className="block">
          <span className={FIELD_LABEL}>Title</span>
          <input
            name="title"
            required
            defaultValue={row.title}
            className={FIELD}
          />
        </label>
        <label className="block">
          <span className={FIELD_LABEL}>Description</span>
          <textarea
            name="description"
            required
            defaultValue={row.description}
            className={FIELD}
            rows={3}
          />
        </label>
        <label className="block">
          <span className={FIELD_LABEL}>Icon</span>
          <input name="icon" defaultValue={row.icon ?? ''} className={FIELD} />
        </label>
      </>
    );
  }
  if (kind === 'faq') {
    return (
      <>
        <label className="block">
          <span className={FIELD_LABEL}>Question</span>
          <input
            name="question"
            required
            defaultValue={row.question}
            className={FIELD}
          />
        </label>
        <label className="block">
          <span className={FIELD_LABEL}>Answer</span>
          <textarea
            name="answer"
            required
            defaultValue={row.answer}
            className={FIELD}
            rows={4}
          />
        </label>
        <label className="block">
          <span className={FIELD_LABEL}>Category</span>
          <input
            name="category"
            defaultValue={row.category ?? ''}
            className={FIELD}
          />
        </label>
        <label className="block">
          <span className={FIELD_LABEL}>Language</span>
          <select name="locale" defaultValue={row.locale} className={FIELD}>
            <option value="en">English</option>
            <option value="sw">Kiswahili</option>
          </select>
        </label>
      </>
    );
  }
  if (kind === 'location') {
    return (
      <>
        <label className="block">
          <span className={FIELD_LABEL}>Name</span>
          <input
            name="name"
            required
            defaultValue={row.name}
            className={FIELD}
          />
        </label>
        <label className="block">
          <span className={FIELD_LABEL}>Description</span>
          <textarea
            name="description"
            defaultValue={row.content?.summary ?? ''}
            className={FIELD}
            rows={3}
          />
        </label>
        <label className="block">
          <span className={FIELD_LABEL}>Address</span>
          <input
            name="address"
            defaultValue={row.address ?? ''}
            className={FIELD}
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className={FIELD_LABEL}>Country code</span>
            <input
              name="country_code"
              defaultValue={row.country_code ?? 'TZ'}
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className={FIELD_LABEL}>Timezone</span>
            <input
              name="timezone"
              defaultValue={row.timezone ?? 'Africa/Dar_es_Salaam'}
              className={FIELD}
            />
          </label>
        </div>
      </>
    );
  }
  if (kind === 'department') {
    return (
      <>
        <label className="block">
          <span className={FIELD_LABEL}>Name</span>
          <input
            name="name"
            required
            defaultValue={row.name}
            className={FIELD}
          />
        </label>
        <label className="block">
          <span className={FIELD_LABEL}>Description</span>
          <textarea
            name="description"
            defaultValue={row.summary ?? ''}
            className={FIELD}
            rows={3}
          />
        </label>
      </>
    );
  }
  return (
    <>
      <label className="block">
        <span className={FIELD_LABEL}>Person</span>
        <input
          name="person_name"
          required
          defaultValue={row.person_name}
          className={FIELD}
        />
      </label>
      <label className="block">
        <span className={FIELD_LABEL}>Role</span>
        <input
          name="role_title"
          defaultValue={row.role_title ?? ''}
          className={FIELD}
        />
      </label>
      <label className="block">
        <span className={FIELD_LABEL}>Headline</span>
        <input
          name="headline"
          required
          defaultValue={row.headline}
          className={FIELD}
        />
      </label>
      <label className="block">
        <span className={FIELD_LABEL}>Story</span>
        <textarea
          name="body"
          required
          defaultValue={row.body}
          className={FIELD}
          rows={5}
        />
      </label>
      <label className="block">
        <span className={FIELD_LABEL}>Image URL</span>
        <input
          name="image_url"
          type="url"
          defaultValue={row.image_url ?? ''}
          className={FIELD}
        />
      </label>
    </>
  );
}

export default async function CareerContentPage() {
  await requirePermission('workforce.careers_content.read');
  const rows = await getSimpleCollectionRows('career-content');
  const db = createSupabaseAdminClient();
  const referenceGroups = await Promise.all([
    db.from('careers_cms_benefits').select('*').order('sort_order'),
    db.from('careers_cms_faqs').select('*').order('sort_order'),
    db.from('careers_cms_locations').select('*').order('name'),
    db.from('careers_cms_departments').select('*').order('name'),
    db.from('careers_cms_stories').select('*').order('sort_order'),
  ]);
  for (const result of referenceGroups) if (result.error) throw result.error;
  const references = [
    ['benefit', referenceGroups[0].data ?? [], 'title'],
    ['faq', referenceGroups[1].data ?? [], 'question'],
    ['location', referenceGroups[2].data ?? [], 'name'],
    ['department', referenceGroups[3].data ?? [], 'name'],
    ['story', referenceGroups[4].data ?? [], 'headline'],
  ] as const;

  return (
    <>
      <CollectionPage
        title="Career content"
        subtitle="Localized pages, reusable blocks, benefits, stories, FAQs and SEO."
        rows={rows}
        emptyMessage="Create the careers homepage and supporting department, location, benefit and policy content."
      />

      <section className={`${PANEL} p-5`}>
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Create localized page
        </h2>
        <form
          action={createCareersPage}
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <input
            name="title"
            required
            placeholder="Page title"
            className={inputClass}
          />
          <input
            name="slug"
            required
            placeholder="Slug, e.g. careers"
            className={inputClass}
          />
          <select name="locale" className={inputClass}>
            <option value="en">English</option>
            <option value="sw">Kiswahili</option>
          </select>
          <button data-opus-button="control" className={`${PRIMARY_BUTTON} text-xs`}>Create draft</button>
          <input
            name="seo_title"
            placeholder="SEO title"
            className={`${inputClass} sm:col-span-2`}
          />
          <input
            name="seo_description"
            placeholder="SEO description"
            className={`${inputClass} sm:col-span-2`}
          />
        </form>
      </section>

      <section className={`${PANEL} p-5`}>
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Reference content
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Manage reusable benefits, FAQs, locations, departments, and employee
          stories.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <details className="rounded-xl bg-gray-50 p-4">
            <summary className={SUMMARY}>Add benefit</summary>
            <form
              action={createCareersReferenceContent.bind(null, 'benefit')}
              className="mt-3 space-y-2"
            >
              <input
                name="title"
                required
                placeholder="Benefit title"
                className={inputClass}
              />
              <textarea
                name="description"
                required
                placeholder="Description"
                className={inputClass}
              />
              <input
                name="icon"
                placeholder="Icon name"
                className={inputClass}
              />
              <button data-opus-button="control" className={`${PRIMARY_BUTTON} min-h-0 px-3 py-2 text-xs`}>
                Save draft
              </button>
            </form>
          </details>

          <details className="rounded-xl bg-gray-50 p-4">
            <summary className={SUMMARY}>Add FAQ</summary>
            <form
              action={createCareersReferenceContent.bind(null, 'faq')}
              className="mt-3 space-y-2"
            >
              <input
                name="question"
                required
                placeholder="Question"
                className={inputClass}
              />
              <textarea
                name="answer"
                required
                placeholder="Answer"
                className={inputClass}
              />
              <input
                name="category"
                placeholder="Category"
                className={inputClass}
              />
              <select name="locale" className={inputClass}>
                <option value="en">English</option>
                <option value="sw">Kiswahili</option>
              </select>
              <button data-opus-button="control" className={`${PRIMARY_BUTTON} min-h-0 px-3 py-2 text-xs`}>
                Save draft
              </button>
            </form>
          </details>

          {(['department', 'location'] as const).map((kind) => (
            <details key={kind} className="rounded-xl bg-gray-50 p-4">
              <summary className={`${SUMMARY} capitalize`}>Add {kind}</summary>
              <form
                action={createCareersReferenceContent.bind(null, kind)}
                className="mt-3 space-y-2"
              >
                <input
                  name="name"
                  required
                  placeholder="Name"
                  className={inputClass}
                />
                <textarea
                  name="description"
                  placeholder="Description"
                  className={inputClass}
                />
                {kind === 'location' && (
                  <>
                    <input
                      name="address"
                      placeholder="Address"
                      className={inputClass}
                    />
                    <input
                      name="timezone"
                      defaultValue="Africa/Dar_es_Salaam"
                      className={inputClass}
                    />
                  </>
                )}
                <button data-opus-button="control"
                  className={`${PRIMARY_BUTTON} min-h-0 px-3 py-2 text-xs`}
                >
                  Save draft
                </button>
              </form>
            </details>
          ))}

          <details className="rounded-xl bg-gray-50 p-4">
            <summary className={SUMMARY}>Add employee story</summary>
            <form
              action={createCareersReferenceContent.bind(null, 'story')}
              className="mt-3 space-y-2"
            >
              <input
                name="person_name"
                required
                placeholder="Person"
                className={inputClass}
              />
              <input
                name="role_title"
                placeholder="Role"
                className={inputClass}
              />
              <input
                name="headline"
                required
                placeholder="Headline"
                className={inputClass}
              />
              <textarea
                name="body"
                required
                placeholder="Story"
                className={inputClass}
              />
              <input
                name="image_url"
                type="url"
                placeholder="Image URL"
                className={inputClass}
              />
              <button data-opus-button="control" className={`${PRIMARY_BUTTON} min-h-0 px-3 py-2 text-xs`}>
                Save draft
              </button>
            </form>
          </details>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {references.map(([kind, items, labelKey]) => (
            <section
              key={kind}
              className="rounded-xl border border-gray-100 p-4"
            >
              <h3 className="text-sm font-semibold capitalize">
                {kind.replaceAll('_', ' ')} content
              </h3>
              <div className="mt-3 space-y-3">
                {items.map((item) => {
                  const row = item as unknown as ReferenceRow;
                  const archived = row.status === 'archived';
                  const published = row.status === 'published';
                  const nextStatus = published
                    ? 'archived'
                    : archived
                      ? 'draft'
                      : 'published';
                  const statusLabel = published
                    ? 'Archive'
                    : archived
                      ? 'Restore draft'
                      : 'Publish';
                  const statusClass = published
                    ? DANGER_BUTTON_SMALL
                    : archived
                      ? NEUTRAL_BUTTON_SMALL
                      : PRIMARY_BUTTON_SMALL;
                  return (
                    <article key={row.id} className="rounded-xl bg-gray-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 flex-1 text-sm font-medium text-gray-900">
                          {row[labelKey]}
                        </p>
                        <StatusPill status={row.status} />
                      </div>
                      <details className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
                        <summary
                          className={`${SUMMARY} [&::-webkit-details-marker]:hidden`}
                        >
                          Edit details
                        </summary>
                        <form
                          action={updateCareersReferenceContent.bind(
                            null,
                            kind,
                            row.id
                          )}
                          className="mt-3 space-y-3 border-t border-gray-100 pt-3"
                        >
                          <ReferenceEditFields kind={kind} row={row} />
                          <button data-opus-button="control" className={PRIMARY_BUTTON_SMALL}>
                            Save changes
                          </button>
                        </form>
                      </details>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <form
                          action={setCareersReferenceStatus.bind(
                            null,
                            kind,
                            row.id,
                            nextStatus
                          )}
                        >
                          <button data-opus-button="control" className={statusClass}>{statusLabel}</button>
                        </form>
                        {row.status === 'draft' && (
                          <ConfirmActionForm
                            action={deleteCareersReferenceContent.bind(
                              null,
                              kind,
                              row.id
                            )}
                            confirmMessage={`Delete “${row[labelKey]}”? This draft will be permanently removed.`}
                          >
                            <button data-opus-button="control" className={DANGER_BUTTON_SMALL}>
                              Delete draft
                            </button>
                          </ConfirmActionForm>
                        )}
                      </div>
                    </article>
                  );
                })}
                {items.length === 0 && (
                  <p className="text-xs text-gray-400">No {kind}s yet.</p>
                )}
              </div>
            </section>
          ))}
        </div>
      </section>
    </>
  );
}
