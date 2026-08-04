'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerEmployeeId, requirePermission } from '@/lib/admin-auth'

function text(formData: FormData, key: string): string { const value = formData.get(key); return typeof value === 'string' ? value.trim() : '' }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '').slice(0, 100) }

export async function createCareersPage(formData: FormData): Promise<void> {
  await requirePermission('workforce.careers_content.write')
  const title = text(formData, 'title')
  const pageSlug = slug(text(formData, 'slug'))
  const locale = text(formData, 'locale') || 'en'
  if (title.length < 2 || pageSlug.length < 1 || !['en', 'sw'].includes(locale)) throw new Error('Enter a valid title, slug and language.')
  const id = randomUUID()
  const employeeId = await getCallerEmployeeId()
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('careers_cms_pages').insert({ id, slug: pageSlug, locale, title, seo_title: text(formData, 'seo_title') || title, seo_description: text(formData, 'seo_description') || null, created_by: employeeId, updated_by: employeeId })
  if (error) throw error
  revalidatePath('/workforce/recruitment/career-content')
  redirect(`/workforce/recruitment/career-content/${id}`)
}

export async function updateCareersPage(pageId: string, formData: FormData): Promise<void> {
  await requirePermission('workforce.careers_content.write')
  const title = text(formData, 'title')
  if (title.length < 2) throw new Error('Page title is required.')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('careers_cms_pages').update({ title, seo_title: text(formData, 'seo_title') || null, seo_description: text(formData, 'seo_description') || null, updated_by: await getCallerEmployeeId() }).eq('id', pageId).in('status', ['draft', 'in_review', 'approved'])
  if (error) throw error
  revalidatePath(`/workforce/recruitment/career-content/${pageId}`)
}

export async function addCareersBlock(pageId: string, formData: FormData): Promise<void> {
  await requirePermission('workforce.careers_content.write')
  const blockType = text(formData, 'block_type')
  if (!['hero', 'rich_text', 'values', 'benefits', 'locations', 'faq', 'story', 'cta', 'image', 'media', 'process'].includes(blockType)) throw new Error('Choose a valid content block.')
  const heading = text(formData, 'heading')
  const body = text(formData, 'body')
  const imageUrl = text(formData, 'image_url')
  const imageAlt = text(formData, 'image_alt_text')
  const ctaLabel = text(formData, 'cta_label')
  const ctaHref = text(formData, 'cta_href')
  if (!heading && !body && !imageUrl) throw new Error('Add content to the block.')
  if (['hero', 'image', 'media', 'story'].includes(blockType) && imageUrl && !imageAlt) throw new Error('Alternative text is required for images.')
  for (const url of [imageUrl, ctaHref].filter(Boolean)) {
    if (url.startsWith('/')) continue
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Use a valid URL.')
  }
  const supabase = createSupabaseAdminClient()
  const { count, error: countError } = await supabase.from('careers_cms_blocks').select('id', { count: 'exact', head: true }).eq('page_id', pageId)
  if (countError) throw countError
  const { error } = await supabase.from('careers_cms_blocks').insert({ page_id: pageId, block_type: blockType, sort_order: count ?? 0, image_alt_text: imageAlt || null, accessibility_status: imageUrl ? 'passed' : 'not_applicable', content: { heading, body, image_url: imageUrl || null, cta_label: ctaLabel || null, cta_href: ctaHref || null } })
  if (error) throw error
  revalidatePath(`/workforce/recruitment/career-content/${pageId}`)
}

export async function transitionCareersPage(pageId: string, target: string, formData: FormData): Promise<void> {
  await requirePermission(['approved', 'scheduled', 'published'].includes(target) ? 'workforce.careers_content.publish' : 'workforce.careers_content.write')
  const supabase = createSupabaseAdminClient()
  const scheduled = text(formData, 'scheduled_at')
  const { error } = await supabase.rpc('careers_cms_transition_page', { p_page_id: pageId, p_target_status: target, p_actor_employee_id: await getCallerEmployeeId(), p_scheduled_at: scheduled ? new Date(scheduled).toISOString() : null })
  if (error) throw error
  revalidatePath(`/workforce/recruitment/career-content/${pageId}`)
  revalidatePath('/careers')
}

export async function addCareersEditorialComment(pageId: string, formData: FormData): Promise<void> {
  await requirePermission('workforce.careers_content.read')
  const body = text(formData, 'body')
  if (body.length < 1 || body.length > 3000) throw new Error('Enter a review comment.')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('careers_cms_editorial_comments').insert({ page_id: pageId, author_employee_id: await getCallerEmployeeId(), body })
  if (error) throw error
  revalidatePath(`/workforce/recruitment/career-content/${pageId}`)
}

export async function createCareersReferenceContent(kind: 'benefit' | 'faq' | 'location' | 'department' | 'story', formData: FormData): Promise<void> {
  await requirePermission('workforce.careers_content.write')
  const supabase = createSupabaseAdminClient()
  let result
  if (kind === 'benefit') result = await supabase.from('careers_cms_benefits').insert({ title: text(formData, 'title'), description: text(formData, 'description'), icon: text(formData, 'icon') || null, status: 'draft' })
  else if (kind === 'faq') result = await supabase.from('careers_cms_faqs').insert({ question: text(formData, 'question'), answer: text(formData, 'answer'), category: text(formData, 'category') || null, locale: text(formData, 'locale') || 'en', status: 'draft' })
  else if (kind === 'location') result = await supabase.from('careers_cms_locations').insert({ slug: slug(text(formData, 'name')), name: text(formData, 'name'), address: text(formData, 'address') || null, country_code: text(formData, 'country_code') || 'TZ', timezone: text(formData, 'timezone') || 'Africa/Dar_es_Salaam', content: { summary: text(formData, 'description') }, status: 'draft' })
  else if (kind === 'department') result = await supabase.from('careers_cms_departments').insert({ slug: slug(text(formData, 'name')), name: text(formData, 'name'), summary: text(formData, 'description') || null, status: 'draft' })
  else result = await supabase.from('careers_cms_stories').insert({ slug: slug(text(formData, 'headline')), person_name: text(formData, 'person_name'), role_title: text(formData, 'role_title') || null, headline: text(formData, 'headline'), body: text(formData, 'body'), image_url: text(formData, 'image_url') || null, status: 'draft' })
  if (result.error) throw result.error
  revalidatePath('/workforce/recruitment/career-content')
}

export async function setCareersReferenceStatus(kind: 'benefit' | 'faq' | 'location' | 'department' | 'story', id: string, status: 'draft' | 'published' | 'archived'): Promise<void> {
  await requirePermission(status === 'published' ? 'workforce.careers_content.publish' : 'workforce.careers_content.write')
  const table = kind === 'benefit' ? 'careers_cms_benefits' : kind === 'faq' ? 'careers_cms_faqs' : kind === 'location' ? 'careers_cms_locations' : kind === 'department' ? 'careers_cms_departments' : 'careers_cms_stories'
  const db = createSupabaseAdminClient(); const { error } = await db.from(table).update({ status }).eq('id', id); if (error) throw error
  await db.from('recruitment_audit_events').insert({ event_type: `careers.${kind}_${status}`, entity_type: `careers_${kind}`, entity_id: id, actor_type: 'employee', metadata: { actor_employee_id: await getCallerEmployeeId(), status } })
  revalidatePath('/workforce/recruitment/career-content'); revalidatePath('/careers')
}
