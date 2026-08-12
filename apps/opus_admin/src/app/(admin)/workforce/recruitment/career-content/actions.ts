'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCallerEmployeeId, requirePermission } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';

const CAREER_CONTENT_PATH = '/workforce/recruitment/career-content';
const CAREERS_PATH = '/careers';
const EDITABLE_PAGE_STATUSES = ['draft', 'in_review', 'approved'];

export type CareersReferenceKind =
  | 'benefit'
  | 'faq'
  | 'location'
  | 'department'
  | 'story';

const REFERENCE_TABLES: Record<CareersReferenceKind, string> = {
  benefit: 'careers_cms_benefits',
  faq: 'careers_cms_faqs',
  location: 'careers_cms_locations',
  department: 'careers_cms_departments',
  story: 'careers_cms_stories',
};

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 100);
}

function validateUrl(value: string): void {
  if (!value || value.startsWith('/')) return;
  const parsed = new URL(value);
  if (!['https:', 'http:'].includes(parsed.protocol))
    throw new Error('Use a valid URL.');
}

function revalidateCareerContent(pageId?: string): void {
  revalidatePath(CAREER_CONTENT_PATH);
  if (pageId) revalidatePath(`${CAREER_CONTENT_PATH}/${pageId}`);
  revalidatePath(CAREERS_PATH);
}

async function audit(
  eventType: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const actorEmployeeId = await getCallerEmployeeId();
  const { error } = await createSupabaseAdminClient()
    .from('recruitment_audit_events')
    .insert({
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      actor_type: 'employee',
      metadata: { actor_employee_id: actorEmployeeId, ...metadata },
    });
  if (error) throw error;
}

async function requireEditablePage(pageId: string): Promise<void> {
  const { data, error } = await createSupabaseAdminClient()
    .from('careers_cms_pages')
    .select('status')
    .eq('id', pageId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Careers page not found.');
  if (!EDITABLE_PAGE_STATUSES.includes(data.status)) {
    throw new Error('Return this page to draft before changing its content.');
  }
}

function referenceValues(
  kind: CareersReferenceKind,
  formData: FormData
): Record<string, unknown> {
  if (kind === 'benefit') {
    const title = text(formData, 'title');
    const description = text(formData, 'description');
    if (title.length < 2 || description.length < 2)
      throw new Error('Benefit title and description are required.');
    return { title, description, icon: text(formData, 'icon') || null };
  }
  if (kind === 'faq') {
    const question = text(formData, 'question');
    const answer = text(formData, 'answer');
    const locale = text(formData, 'locale') || 'en';
    if (question.length < 2 || answer.length < 2)
      throw new Error('FAQ question and answer are required.');
    if (!['en', 'sw'].includes(locale))
      throw new Error('Choose a supported language.');
    return {
      question,
      answer,
      category: text(formData, 'category') || null,
      locale,
    };
  }
  if (kind === 'location') {
    const name = text(formData, 'name');
    if (name.length < 2) throw new Error('Location name is required.');
    return {
      slug: slug(name),
      name,
      address: text(formData, 'address') || null,
      country_code: text(formData, 'country_code') || 'TZ',
      timezone: text(formData, 'timezone') || 'Africa/Dar_es_Salaam',
      content: { summary: text(formData, 'description') },
    };
  }
  if (kind === 'department') {
    const name = text(formData, 'name');
    if (name.length < 2) throw new Error('Department name is required.');
    return {
      slug: slug(name),
      name,
      summary: text(formData, 'description') || null,
    };
  }

  const personName = text(formData, 'person_name');
  const headline = text(formData, 'headline');
  const body = text(formData, 'body');
  const imageUrl = text(formData, 'image_url');
  if (personName.length < 2 || headline.length < 2 || body.length < 2) {
    throw new Error('Person, headline and story are required.');
  }
  validateUrl(imageUrl);
  return {
    slug: slug(headline),
    person_name: personName,
    role_title: text(formData, 'role_title') || null,
    headline,
    body,
    image_url: imageUrl || null,
  };
}

export async function createCareersPage(formData: FormData): Promise<void> {
  await requirePermission('workforce.careers_content.write');
  const title = text(formData, 'title');
  const pageSlug = slug(text(formData, 'slug'));
  const locale = text(formData, 'locale') || 'en';
  if (
    title.length < 2 ||
    pageSlug.length < 1 ||
    !['en', 'sw'].includes(locale)
  ) {
    throw new Error('Enter a valid title, slug and language.');
  }
  const id = randomUUID();
  const employeeId = await getCallerEmployeeId();
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from('careers_cms_pages').insert({
    id,
    slug: pageSlug,
    locale,
    title,
    seo_title: text(formData, 'seo_title') || title,
    seo_description: text(formData, 'seo_description') || null,
    created_by: employeeId,
    updated_by: employeeId,
  });
  if (error) throw error;
  await audit('careers.page_created', 'careers_page', id, {
    locale,
    slug: pageSlug,
  });
  revalidateCareerContent(id);
  redirect(`${CAREER_CONTENT_PATH}/${id}`);
}

export async function updateCareersPage(
  pageId: string,
  formData: FormData
): Promise<void> {
  await requirePermission('workforce.careers_content.write');
  await requireEditablePage(pageId);
  const title = text(formData, 'title');
  if (title.length < 2) throw new Error('Page title is required.');
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from('careers_cms_pages')
    .update({
      title,
      seo_title: text(formData, 'seo_title') || null,
      seo_description: text(formData, 'seo_description') || null,
      updated_by: await getCallerEmployeeId(),
    })
    .eq('id', pageId)
    .in('status', EDITABLE_PAGE_STATUSES);
  if (error) throw error;
  await audit('careers.page_updated', 'careers_page', pageId, {
    changed_fields: ['title', 'seo_title', 'seo_description'],
  });
  revalidateCareerContent(pageId);
}

export async function deleteCareersPage(
  pageId: string,
  formData: FormData
): Promise<void> {
  await requirePermission('workforce.careers_content.write');
  if (text(formData, 'confirmation') !== 'delete')
    throw new Error('Deletion was not confirmed.');
  const supabase = createSupabaseAdminClient();
  const { data: page, error: pageError } = await supabase
    .from('careers_cms_pages')
    .select('status, published_at, slug, locale')
    .eq('id', pageId)
    .maybeSingle();
  if (pageError) throw pageError;
  if (!page) throw new Error('Careers page not found.');
  if (page.status !== 'draft' || page.published_at) {
    throw new Error(
      'Only a never-published draft can be permanently deleted. Archive published content instead.'
    );
  }
  const { error } = await supabase
    .from('careers_cms_pages')
    .delete()
    .eq('id', pageId)
    .eq('status', 'draft')
    .is('published_at', null);
  if (error) throw error;
  await audit('careers.page_deleted', 'careers_page', pageId, {
    slug: page.slug,
    locale: page.locale,
  });
  revalidateCareerContent();
  redirect(CAREER_CONTENT_PATH);
}

export async function addCareersBlock(
  pageId: string,
  formData: FormData
): Promise<void> {
  await requirePermission('workforce.careers_content.write');
  await requireEditablePage(pageId);
  const blockType = text(formData, 'block_type');
  if (
    ![
      'hero',
      'rich_text',
      'values',
      'benefits',
      'locations',
      'faq',
      'story',
      'cta',
      'image',
      'media',
      'process',
    ].includes(blockType)
  ) {
    throw new Error('Choose a valid content block.');
  }
  const heading = text(formData, 'heading');
  const body = text(formData, 'body');
  const imageUrl = text(formData, 'image_url');
  const imageAlt = text(formData, 'image_alt_text');
  const ctaLabel = text(formData, 'cta_label');
  const ctaHref = text(formData, 'cta_href');
  if (!heading && !body && !imageUrl)
    throw new Error('Add content to the block.');
  if (
    ['hero', 'image', 'media', 'story'].includes(blockType) &&
    imageUrl &&
    !imageAlt
  ) {
    throw new Error('Alternative text is required for images.');
  }
  validateUrl(imageUrl);
  validateUrl(ctaHref);
  const supabase = createSupabaseAdminClient();
  const { count, error: countError } = await supabase
    .from('careers_cms_blocks')
    .select('id', { count: 'exact', head: true })
    .eq('page_id', pageId);
  if (countError) throw countError;
  const { data, error } = await supabase
    .from('careers_cms_blocks')
    .insert({
      page_id: pageId,
      block_type: blockType,
      sort_order: count ?? 0,
      image_alt_text: imageAlt || null,
      accessibility_status: imageUrl ? 'passed' : 'not_applicable',
      content: {
        heading,
        body,
        image_url: imageUrl || null,
        cta_label: ctaLabel || null,
        cta_href: ctaHref || null,
      },
    })
    .select('id')
    .single();
  if (error) throw error;
  await audit('careers.block_created', 'careers_block', data.id, {
    page_id: pageId,
    block_type: blockType,
  });
  revalidateCareerContent(pageId);
}

export async function updateCareersBlock(
  pageId: string,
  blockId: string,
  formData: FormData
): Promise<void> {
  await requirePermission('workforce.careers_content.write');
  await requireEditablePage(pageId);
  const heading = text(formData, 'heading');
  const body = text(formData, 'body');
  const imageUrl = text(formData, 'image_url');
  const imageAlt = text(formData, 'image_alt_text');
  const ctaLabel = text(formData, 'cta_label');
  const ctaHref = text(formData, 'cta_href');
  if (!heading && !body && !imageUrl)
    throw new Error('Add content to the block.');
  validateUrl(imageUrl);
  validateUrl(ctaHref);
  const supabase = createSupabaseAdminClient();
  const { data: block, error: blockError } = await supabase
    .from('careers_cms_blocks')
    .select('block_type')
    .eq('id', blockId)
    .eq('page_id', pageId)
    .maybeSingle();
  if (blockError) throw blockError;
  if (!block) throw new Error('Content block not found.');
  if (
    ['hero', 'image', 'media', 'story'].includes(block.block_type) &&
    imageUrl &&
    !imageAlt
  ) {
    throw new Error('Alternative text is required for images.');
  }
  const { error } = await supabase
    .from('careers_cms_blocks')
    .update({
      image_alt_text: imageAlt || null,
      accessibility_status: imageUrl ? 'passed' : 'not_applicable',
      content: {
        heading,
        body,
        image_url: imageUrl || null,
        cta_label: ctaLabel || null,
        cta_href: ctaHref || null,
      },
    })
    .eq('id', blockId)
    .eq('page_id', pageId);
  if (error) throw error;
  await audit('careers.block_updated', 'careers_block', blockId, {
    page_id: pageId,
  });
  revalidateCareerContent(pageId);
}

export async function deleteCareersBlock(
  pageId: string,
  blockId: string,
  formData: FormData
): Promise<void> {
  await requirePermission('workforce.careers_content.write');
  if (text(formData, 'confirmation') !== 'delete')
    throw new Error('Deletion was not confirmed.');
  await requireEditablePage(pageId);
  const { error } = await createSupabaseAdminClient()
    .from('careers_cms_blocks')
    .delete()
    .eq('id', blockId)
    .eq('page_id', pageId);
  if (error) throw error;
  await audit('careers.block_deleted', 'careers_block', blockId, {
    page_id: pageId,
  });
  revalidateCareerContent(pageId);
}

export async function transitionCareersPage(
  pageId: string,
  target: string,
  formData: FormData
): Promise<void> {
  await requirePermission(
    ['approved', 'scheduled', 'published'].includes(target)
      ? 'workforce.careers_content.publish'
      : 'workforce.careers_content.write'
  );
  const supabase = createSupabaseAdminClient();
  const scheduled = text(formData, 'scheduled_at');
  const { error } = await supabase.rpc('careers_cms_transition_page', {
    p_page_id: pageId,
    p_target_status: target,
    p_actor_employee_id: await getCallerEmployeeId(),
    p_scheduled_at: scheduled ? new Date(scheduled).toISOString() : null,
  });
  if (error) throw error;
  revalidateCareerContent(pageId);
}

export async function addCareersEditorialComment(
  pageId: string,
  formData: FormData
): Promise<void> {
  await requirePermission('workforce.careers_content.read');
  const body = text(formData, 'body');
  if (body.length < 1 || body.length > 3000)
    throw new Error('Enter a review comment.');
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from('careers_cms_editorial_comments')
    .insert({
      page_id: pageId,
      author_employee_id: await getCallerEmployeeId(),
      body,
    });
  if (error) throw error;
  revalidateCareerContent(pageId);
}

export async function createCareersReferenceContent(
  kind: CareersReferenceKind,
  formData: FormData
): Promise<void> {
  await requirePermission('workforce.careers_content.write');
  const values = referenceValues(kind, formData);
  const { data, error } = await createSupabaseAdminClient()
    .from(REFERENCE_TABLES[kind])
    .insert({ ...values, status: 'draft' })
    .select('id')
    .single();
  if (error) throw error;
  await audit(`careers.${kind}_created`, `careers_${kind}`, data.id);
  revalidateCareerContent();
}

export async function updateCareersReferenceContent(
  kind: CareersReferenceKind,
  id: string,
  formData: FormData
): Promise<void> {
  await requirePermission('workforce.careers_content.write');
  const values = referenceValues(kind, formData);
  const { error } = await createSupabaseAdminClient()
    .from(REFERENCE_TABLES[kind])
    .update(values)
    .eq('id', id);
  if (error) throw error;
  await audit(`careers.${kind}_updated`, `careers_${kind}`, id, {
    changed_fields: Object.keys(values),
  });
  revalidateCareerContent();
}

export async function deleteCareersReferenceContent(
  kind: CareersReferenceKind,
  id: string,
  formData: FormData
): Promise<void> {
  await requirePermission('workforce.careers_content.write');
  if (text(formData, 'confirmation') !== 'delete')
    throw new Error('Deletion was not confirmed.');
  const db = createSupabaseAdminClient();
  const { data: record, error: recordError } = await db
    .from(REFERENCE_TABLES[kind])
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (recordError) throw recordError;
  if (!record) throw new Error('Reference content not found.');
  if (record.status !== 'draft')
    throw new Error(
      'Only draft reference content can be permanently deleted. Archive it instead.'
    );
  if (kind === 'benefit') {
    const { count, error: countError } = await db
      .from('recruitment_job_benefits')
      .select('posting_id', { count: 'exact', head: true })
      .eq('benefit_id', id);
    if (countError) throw countError;
    if ((count ?? 0) > 0)
      throw new Error(
        'This benefit is attached to a job and cannot be deleted. Archive it instead.'
      );
  }
  const { error } = await db
    .from(REFERENCE_TABLES[kind])
    .delete()
    .eq('id', id)
    .eq('status', 'draft');
  if (error) throw error;
  await audit(`careers.${kind}_deleted`, `careers_${kind}`, id);
  revalidateCareerContent();
}

export async function setCareersReferenceStatus(
  kind: CareersReferenceKind,
  id: string,
  status: 'draft' | 'published' | 'archived'
): Promise<void> {
  await requirePermission(
    status === 'published'
      ? 'workforce.careers_content.publish'
      : 'workforce.careers_content.write'
  );
  const db = createSupabaseAdminClient();
  const { error } = await db
    .from(REFERENCE_TABLES[kind])
    .update({ status })
    .eq('id', id);
  if (error) throw error;
  await audit(`careers.${kind}_${status}`, `careers_${kind}`, id, { status });
  revalidateCareerContent();
}
