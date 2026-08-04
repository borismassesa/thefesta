'use server'

import { revalidatePath } from 'next/cache'
import { getCallerEmployeeId } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requireRecruitmentAccess } from '@/lib/recruitment-auth'

function field(data: FormData, name: string) { const value = data.get(name); return typeof value === 'string' ? value.trim() : '' }
async function postingAccess(postingId: string, permissions: string[]) { const db = createSupabaseAdminClient(); const { data, error } = await db.from('recruitment_job_postings').select('workforce_job_id').eq('id', postingId).single(); if (error) throw error; const access = await requireRecruitmentAccess({ entityType: 'job', entityId: data.workforce_job_id, allowedPermissions: permissions as never }); return { db, access, jobId: data.workforce_job_id } }
function path(id: string) { return `/workforce/recruitment/jobs/${id}` }

export async function updateJobPosting(id: string, formData: FormData) {
  const { db, access } = await postingAccess(id, ['workforce.jobs.write']); const { data: current, error: lookupError } = await db.from('recruitment_job_postings').select('status').eq('id', id).single(); if (lookupError) throw lookupError; if (!['draft', 'in_review', 'approved'].includes(current.status)) throw new Error('Pause and create a reviewed revision before changing a live posting.')
  const title = field(formData, 'public_title'); const description = field(formData, 'public_description'); if (title.length < 3 || description.length < 20) throw new Error('Add a public title and complete description.')
  const { error } = await db.from('recruitment_job_postings').update({ public_title: title, public_summary: field(formData, 'public_summary') || null, public_description: description, reporting_manager_title: field(formData, 'reporting_manager_title') || null, equal_opportunity_statement: field(formData, 'equal_opportunity_statement') || null, seo_title: field(formData, 'seo_title') || null, seo_description: field(formData, 'seo_description') || null, is_featured: field(formData, 'is_featured') === 'on', is_urgent: field(formData, 'is_urgent') === 'on' }).eq('id', id); if (error) throw error
  await db.from('recruitment_audit_events').insert({ event_type: 'job.content_revised', entity_type: 'job_posting', entity_id: id, actor_type: 'employee', metadata: { actor_employee_id: access.employeeId, changed_fields: ['public_content', 'seo', 'flags'] } }); revalidatePath(path(id))
}

export async function upsertJobLanguage(id: string, formData: FormData) {
  const { db, access } = await postingAccess(id, ['workforce.jobs.write']); const language = field(formData, 'language_code'); if (!['en', 'sw'].includes(language)) throw new Error('Choose English or Kiswahili.')
  const title = field(formData, 'public_title'); if (title.length < 3) throw new Error('Localized title is required.'); const list = (name: string) => field(formData, name).split('\n').map((item) => item.trim()).filter(Boolean)
  const { error } = await db.from('recruitment_job_languages').upsert({ posting_id: id, language_code: language, public_title: title, public_summary: field(formData, 'public_summary') || null, public_description: field(formData, 'public_description') || null, responsibilities: list('responsibilities'), requirements: list('requirements'), seo_title: field(formData, 'seo_title') || null, seo_description: field(formData, 'seo_description') || null, status: 'draft' }, { onConflict: 'posting_id,language_code' }); if (error) throw error
  await db.from('recruitment_audit_events').insert({ event_type: 'job.translation_revised', entity_type: 'job_posting', entity_id: id, actor_type: 'employee', metadata: { actor_employee_id: access.employeeId, language_code: language } }); revalidatePath(path(id))
}

export async function addApplicationQuestion(id: string, formData: FormData) {
  const { db } = await postingAccess(id, ['workforce.jobs.write']); const label = field(formData, 'label'); const key = field(formData, 'key').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); if (!label || !key) throw new Error('Question label and key are required.')
  const { error } = await db.from('recruitment_application_questions').insert({ posting_id: id, key, label, help_text: field(formData, 'help_text') || null, question_type: field(formData, 'question_type'), requirement_stage: field(formData, 'requirement_stage'), is_required: field(formData, 'is_required') === 'on', is_knockout: field(formData, 'is_knockout') === 'on', knockout_rule: field(formData, 'is_knockout') === 'on' ? { expected: field(formData, 'expected_answer') } : null, sort_order: Number(field(formData, 'sort_order') || 0) }); if (error) throw error; revalidatePath(path(id))
}

export async function upsertJobChannel(id: string, formData: FormData) {
  const { db } = await postingAccess(id, ['workforce.jobs.write']); const channel = field(formData, 'channel'); if (!channel) throw new Error('Channel is required.')
  const { error } = await db.from('recruitment_job_channels').upsert({ posting_id: id, channel, external_job_id: field(formData, 'external_job_id') || null, external_url: field(formData, 'external_url') || null, status: field(formData, 'external_url') ? 'published' : 'queued', published_at: field(formData, 'external_url') ? new Date().toISOString() : null }, { onConflict: 'posting_id,channel' }); if (error) throw error; revalidatePath(path(id))
}

export async function transitionJobPosting(id: string, target: string, formData: FormData) {
  const { db, access } = await postingAccess(id, [target === 'published' ? 'workforce.jobs.publish' : target === 'archived' || target === 'closed' ? 'workforce.jobs.archive' : 'workforce.jobs.write']); const allowed = ['draft', 'in_review', 'approved', 'scheduled', 'published', 'paused', 'closed', 'archived']; if (!allowed.includes(target)) throw new Error('Invalid posting status.')
  const { data: posting, error: lookupError } = await db.from('recruitment_job_postings').select('*').eq('id', id).single(); if (lookupError) throw lookupError
  if (['approved', 'scheduled', 'published'].includes(target) && (!posting.public_title || !posting.public_description || !posting.equal_opportunity_statement)) throw new Error('Complete public content and the equal opportunity statement first.')
  if (target === 'published') { const { count } = await db.from('recruitment_job_posting_versions').select('id', { count: 'exact', head: true }).eq('posting_id', id); const { error: versionError } = await db.from('recruitment_job_posting_versions').insert({ posting_id: id, version: (count ?? 0) + 1, snapshot: posting, created_by: access.employeeId }); if (versionError) throw versionError }
  const scheduled = field(formData, 'publish_at'); if (target === 'scheduled' && (!scheduled || new Date(scheduled) <= new Date())) throw new Error('Choose a future publication time.')
  const { error } = await db.from('recruitment_job_postings').update({ status: target, publish_at: target === 'scheduled' ? new Date(scheduled).toISOString() : posting.publish_at, unpublish_at: field(formData, 'unpublish_at') ? new Date(field(formData, 'unpublish_at')).toISOString() : posting.unpublish_at }).eq('id', id); if (error) throw error
  await db.from('recruitment_audit_events').insert({ event_type: `job.${target}`, entity_type: 'job_posting', entity_id: id, actor_type: 'employee', metadata: { actor_employee_id: access.employeeId, from: posting.status, to: target } }); revalidatePath(path(id)); revalidatePath('/workforce/recruitment/jobs'); revalidatePath('/careers')
}
