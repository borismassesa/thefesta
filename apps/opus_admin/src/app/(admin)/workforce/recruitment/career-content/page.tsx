import { requirePermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import CollectionPage from '../_components/CollectionPage'
import { getSimpleCollectionRows } from '../_lib/collections'
import { createCareersPage, createCareersReferenceContent, setCareersReferenceStatus } from './actions'

const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm'

export default async function CareerContentPage() {
  await requirePermission('workforce.careers_content.read')
  const rows = await getSimpleCollectionRows('career-content')
  const db = createSupabaseAdminClient()
  const referenceGroups = await Promise.all([
    db.from('careers_cms_benefits').select('id, title, status').order('sort_order'),
    db.from('careers_cms_faqs').select('id, question, status').order('sort_order'),
    db.from('careers_cms_locations').select('id, name, status').order('name'),
    db.from('careers_cms_departments').select('id, name, status').order('name'),
    db.from('careers_cms_stories').select('id, headline, status').order('sort_order'),
  ])
  for (const result of referenceGroups) if (result.error) throw result.error
  const references = [
    ['benefit', referenceGroups[0].data ?? [], 'title'], ['faq', referenceGroups[1].data ?? [], 'question'],
    ['location', referenceGroups[2].data ?? [], 'name'], ['department', referenceGroups[3].data ?? [], 'name'],
    ['story', referenceGroups[4].data ?? [], 'headline'],
  ] as const

  return (
    <>
      <CollectionPage
        title="Career content"
        subtitle="Localized pages, reusable blocks, benefits, stories, FAQs and SEO."
        rows={rows}
        emptyMessage="Create the careers homepage and supporting department, location, benefit and policy content."
      />

      <section className="rounded-2xl border border-violet-100 bg-violet-50 p-5">
        <h2 className="font-semibold text-violet-950">Create localized page</h2>
        <form action={createCareersPage} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input name="title" required placeholder="Page title" className={inputClass} />
          <input name="slug" required placeholder="Slug, e.g. careers" className={inputClass} />
          <select name="locale" className={inputClass}>
            <option value="en">English</option>
            <option value="sw">Kiswahili</option>
          </select>
          <button className="rounded-lg bg-[#5B2D8E] px-4 py-2 text-xs font-semibold text-white">Create draft</button>
          <input name="seo_title" placeholder="SEO title" className={`${inputClass} sm:col-span-2`} />
          <input name="seo_description" placeholder="SEO description" className={`${inputClass} sm:col-span-2`} />
        </form>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-gray-950">Reference content</h2>
        <p className="mt-1 text-sm text-gray-500">Manage reusable benefits, FAQs, locations, departments, and employee stories.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <details className="rounded-xl bg-gray-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold">Add benefit</summary>
            <form action={createCareersReferenceContent.bind(null, 'benefit')} className="mt-3 space-y-2">
              <input name="title" required placeholder="Benefit title" className={inputClass} />
              <textarea name="description" required placeholder="Description" className={inputClass} />
              <input name="icon" placeholder="Icon name" className={inputClass} />
              <button className="rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white">Save draft</button>
            </form>
          </details>

          <details className="rounded-xl bg-gray-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold">Add FAQ</summary>
            <form action={createCareersReferenceContent.bind(null, 'faq')} className="mt-3 space-y-2">
              <input name="question" required placeholder="Question" className={inputClass} />
              <textarea name="answer" required placeholder="Answer" className={inputClass} />
              <input name="category" placeholder="Category" className={inputClass} />
              <select name="locale" className={inputClass}>
                <option value="en">English</option>
                <option value="sw">Kiswahili</option>
              </select>
              <button className="rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white">Save draft</button>
            </form>
          </details>

          {(['department', 'location'] as const).map((kind) => (
            <details key={kind} className="rounded-xl bg-gray-50 p-4">
              <summary className="cursor-pointer text-sm font-semibold capitalize">Add {kind}</summary>
              <form action={createCareersReferenceContent.bind(null, kind)} className="mt-3 space-y-2">
                <input name="name" required placeholder="Name" className={inputClass} />
                <textarea name="description" placeholder="Description" className={inputClass} />
                {kind === 'location' && (
                  <>
                    <input name="address" placeholder="Address" className={inputClass} />
                    <input name="timezone" defaultValue="Africa/Dar_es_Salaam" className={inputClass} />
                  </>
                )}
                <button className="rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white">Save draft</button>
              </form>
            </details>
          ))}

          <details className="rounded-xl bg-gray-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold">Add employee story</summary>
            <form action={createCareersReferenceContent.bind(null, 'story')} className="mt-3 space-y-2">
              <input name="person_name" required placeholder="Person" className={inputClass} />
              <input name="role_title" placeholder="Role" className={inputClass} />
              <input name="headline" required placeholder="Headline" className={inputClass} />
              <textarea name="body" required placeholder="Story" className={inputClass} />
              <input name="image_url" type="url" placeholder="Image URL" className={inputClass} />
              <button className="rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white">Save draft</button>
            </form>
          </details>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {references.map(([kind, items, labelKey]) => <section key={kind} className="rounded-xl border border-gray-100 p-4"><h3 className="text-sm font-semibold capitalize">{kind.replaceAll('_', ' ')} content</h3><div className="mt-3 space-y-2">{items.map((item) => { const row = item as unknown as Record<string, string>; const next = row.status === 'published' ? 'archived' : 'published'; return <div key={row.id} className="rounded-lg bg-gray-50 p-3"><p className="text-sm font-medium">{row[labelKey]}</p><div className="mt-2 flex items-center justify-between"><span className="text-xs capitalize text-gray-500">{row.status}</span><form action={setCareersReferenceStatus.bind(null, kind, row.id, next)}><button className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold">{next === 'published' ? 'Publish' : 'Archive'}</button></form></div></div>})}{items.length === 0 && <p className="text-xs text-gray-400">No {kind}s yet.</p>}</div></section>)}
        </div>
      </section>
    </>
  )
}
