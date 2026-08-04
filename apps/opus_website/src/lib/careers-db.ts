import 'server-only'

import { cache } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase'
import type { CareerJob } from '@/lib/careers'

const EXTENDED_COLUMNS = 'id, slug, title, department, location, employment_type, opened_at, posted_salary_min_tzs, posted_salary_max_tzs, description, brand, workplace_type, experience_level, closing_date, show_salary, summary, responsibilities, requirements, preferred_qualifications, working_conditions, recruitment_process'

type JobRow = {
  id: string
  slug: string
  title: string
  department: string
  location: string
  employment_type: string
  opened_at: string
  posted_salary_min_tzs: number | null
  posted_salary_max_tzs: number | null
  description: string | null
  brand?: string | null
  workplace_type?: string | null
  experience_level?: string | null
  closing_date?: string | null
  show_salary?: boolean | null
  summary?: string | null
  responsibilities?: string[] | null
  requirements?: string[] | null
  preferred_qualifications?: string[] | null
  working_conditions?: string[] | null
  recruitment_process?: string[] | null
}

const DEFAULT_PROCESS = [
  'Application review',
  'Introductory conversation',
  'Role assessment',
  'Team interview',
  'Final decision',
]

function fallbackResponsibilities(row: JobRow): string[] {
  return [
    `Own meaningful work across the ${row.department} team from brief to outcome.`,
    'Work closely with product, operations, creative and commercial teammates.',
    'Use feedback from couples, vendors and event teams to improve the work.',
    'Document decisions clearly and close the loop on commitments.',
  ]
}

function fallbackRequirements(row: JobRow): string[] {
  return [
    `Relevant experience or demonstrated potential in ${row.department.toLowerCase()}.`,
    'Clear written and verbal communication.',
    'Strong judgement, attention to detail and personal ownership.',
    'Comfort working in a fast-moving, Tanzania-first environment.',
  ]
}

function normalizeJob(row: JobRow): CareerJob {
  const summary =
    row.summary?.trim() ||
    row.description?.trim() ||
    `Join our ${row.department} team and help build the technology, experiences and operations behind celebrations across Tanzania.`

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    department: row.department,
    location: row.location,
    employmentType: row.employment_type,
    workplaceType:
      row.workplace_type ?? (row.location === 'Remote' ? 'Remote' : 'On-site'),
    experienceLevel:
      row.experience_level ?? (row.employment_type === 'Intern' ? 'Early career' : 'Professional'),
    brand: row.brand ?? 'OpusFesta',
    closingDate: row.closing_date ?? null,
    openedAt: row.opened_at,
    summary,
    description: row.description?.trim() || summary,
    responsibilities:
      row.responsibilities && row.responsibilities.length > 0
        ? row.responsibilities
        : fallbackResponsibilities(row),
    requirements:
      row.requirements && row.requirements.length > 0
        ? row.requirements
        : fallbackRequirements(row),
    preferredQualifications: row.preferred_qualifications ?? [],
    workingConditions: row.working_conditions ?? [],
    recruitmentProcess:
      row.recruitment_process && row.recruitment_process.length > 0
        ? row.recruitment_process
        : DEFAULT_PROCESS,
    showSalary: row.show_salary ?? false,
    salaryMinTzs:
      row.show_salary && row.posted_salary_min_tzs !== null
        ? Number(row.posted_salary_min_tzs)
        : null,
    salaryMaxTzs:
      row.show_salary && row.posted_salary_max_tzs !== null
        ? Number(row.posted_salary_max_tzs)
        : null,
  }
}

async function selectJobs(slug?: string): Promise<JobRow[]> {
  const supabase = createSupabaseServerClient()
  const today = new Date().toISOString().slice(0, 10)
  let postingQuery = supabase
    .from('recruitment_job_postings')
    .select('workforce_job_id, visibility, publish_at, unpublish_at')
    .eq('status', 'published')
  postingQuery = slug ? postingQuery.in('visibility', ['public', 'unlisted']) : postingQuery.eq('visibility', 'public')
  const { data: postings, error: postingError } = await postingQuery
  if (postingError) throw postingError
  const now = Date.now()
  const jobIds = (postings ?? []).filter((posting) =>
    (!posting.publish_at || Date.parse(posting.publish_at) <= now) &&
    (!posting.unpublish_at || Date.parse(posting.unpublish_at) > now),
  ).map((posting) => posting.workforce_job_id)
  if (jobIds.length === 0) return []
  let query = supabase.from('workforce_jobs').select(EXTENDED_COLUMNS).eq('status', 'Open').in('id', jobIds).order('department').order('title')
  if (slug) query = query.eq('slug', slug)
  const result = await query
  if (result.error) throw result.error
  return ((result.data ?? []) as unknown as JobRow[]).filter(
    (row) => !row.closing_date || row.closing_date >= today,
  )
}

async function localizeJobs(jobs: CareerJob[], locale: string): Promise<CareerJob[]> {
  if (locale === 'en' || jobs.length === 0) return jobs
  const supabase = createSupabaseServerClient(); const { data: postings, error } = await supabase.from('recruitment_job_postings').select('id, workforce_job_id').in('workforce_job_id', jobs.map((job) => job.id)); if (error) throw error
  const postingIds = (postings ?? []).map((posting) => posting.id); if (!postingIds.length) return jobs
  const { data: languages, error: languageError } = await supabase.from('recruitment_job_languages').select('posting_id, public_title, public_summary, public_description, responsibilities, requirements').in('posting_id', postingIds).eq('language_code', locale).in('status', ['approved', 'published']); if (languageError) throw languageError
  const postingByJob = new Map((postings ?? []).map((posting) => [posting.workforce_job_id, posting.id])); const languageMap = new Map((languages ?? []).map((language) => [language.posting_id, language]))
  return jobs.map((job) => { const language = languageMap.get(postingByJob.get(job.id) ?? ''); return language ? { ...job, title: language.public_title, summary: language.public_summary || job.summary, description: language.public_description || job.description, responsibilities: language.responsibilities?.length ? language.responsibilities : job.responsibilities, requirements: language.requirements?.length ? language.requirements : job.requirements } : job })
}

export const loadOpenJobs = cache(async (locale = 'en'): Promise<CareerJob[]> => {
  try {
    return await localizeJobs((await selectJobs()).map(normalizeJob), locale)
  } catch (error) {
    // Public careers content should remain available during a transient data
    // outage; the UI renders a truthful no-openings state instead of a 500.
    console.error('[careers] failed to load open jobs', error)
    return []
  }
})

export const loadOpenJobBySlug = cache(async (slug: string, locale = 'en'): Promise<CareerJob | null> => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null
  try {
    const [row] = await selectJobs(slug)
    if (!row) return null
    return (await localizeJobs([normalizeJob(row)], locale))[0] ?? null
  } catch (error) {
    console.error('[careers] failed to load job', { slug, error })
    return null
  }
})

export type CareersCmsContent = {
  page: { title: string; seoTitle: string | null; seoDescription: string | null }
  blocks: Array<{ id: string; blockType: string; heading: string; body: string; imageUrl: string | null; imageAlt: string | null; ctaLabel: string | null; ctaHref: string | null }>
  benefits: Array<{ id: string; title: string; description: string; icon: string | null }>
  locations: Array<{ id: string; name: string; address: string | null; summary: string }>
  faqs: Array<{ id: string; question: string; answer: string; category: string | null }>
  stories: Array<{ id: string; personName: string; roleTitle: string | null; headline: string; body: string; imageUrl: string | null }>
}

export const loadCareersCms = cache(async (locale = 'en'): Promise<CareersCmsContent | null> => {
  try {
    const supabase = createSupabaseServerClient()
    const { data: page, error } = await supabase.from('careers_cms_pages').select('id, title, seo_title, seo_description').eq('slug', 'careers').eq('locale', locale).eq('status', 'published').maybeSingle<{ id: string; title: string; seo_title: string | null; seo_description: string | null }>()
    if (error || !page) return null
    const [blocks, benefits, locations, faqs, stories] = await Promise.all([
      supabase.from('careers_cms_blocks').select('id, block_type, content, image_alt_text').eq('page_id', page.id).eq('is_visible', true).order('sort_order'),
      supabase.from('careers_cms_benefits').select('id, title, description, icon').eq('status', 'published').order('sort_order'),
      supabase.from('careers_cms_locations').select('id, name, address, content').eq('status', 'published').order('sort_order'),
      supabase.from('careers_cms_faqs').select('id, question, answer, category').eq('status', 'published').eq('locale', locale).order('sort_order'),
      supabase.from('careers_cms_stories').select('id, person_name, role_title, headline, body, image_url').eq('status', 'published').order('sort_order'),
    ])
    for (const result of [blocks, benefits, locations, faqs, stories]) if (result.error) throw result.error
    return {
      page: { title: page.title, seoTitle: page.seo_title, seoDescription: page.seo_description },
      blocks: (blocks.data ?? []).map((block) => ({ id: block.id, blockType: block.block_type, heading: String(block.content?.heading ?? ''), body: String(block.content?.body ?? ''), imageUrl: block.content?.image_url ? String(block.content.image_url) : null, imageAlt: block.image_alt_text, ctaLabel: block.content?.cta_label ? String(block.content.cta_label) : null, ctaHref: block.content?.cta_href ? String(block.content.cta_href) : null })),
      benefits: (benefits.data ?? []).map((item) => ({ id: item.id, title: item.title, description: item.description, icon: item.icon })),
      locations: (locations.data ?? []).map((item) => ({ id: item.id, name: item.name, address: item.address, summary: String(item.content?.summary ?? '') })),
      faqs: faqs.data ?? [],
      stories: (stories.data ?? []).map((story) => ({ id: story.id, personName: story.person_name, roleTitle: story.role_title, headline: story.headline, body: story.body, imageUrl: story.image_url })),
    }
  } catch (error) {
    console.error('[careers] failed to load published CMS content', error)
    return null
  }
})
