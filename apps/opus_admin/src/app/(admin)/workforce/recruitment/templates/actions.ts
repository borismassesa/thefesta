'use server'

import { revalidatePath } from 'next/cache'
import { getCallerEmployeeId, requirePermission } from '@/lib/admin-auth'
import { sendEmail } from '@/lib/email'
import { createSupabaseAdminClient } from '@/lib/supabase'

const PATH = '/workforce/recruitment/templates'
const allowedChannels = ['email', 'sms', 'in_app', 'whatsapp', 'phone_log']
function field(data: FormData, name: string) { const value = data.get(name); return typeof value === 'string' ? value.trim() : '' }
function variables(subject: string, body: string) { return [...new Set(`${subject} ${body}`.match(/{{[a-z0-9_.]+}}/gi) ?? [])].map((value) => value.slice(2, -2)) }
function render(value: string, sample: Record<string, string>) { return value.replace(/{{([a-z0-9_.]+)}}/gi, (_, key: string) => sample[key] ?? `[${key}]`) }

export async function createMessageTemplate(formData: FormData) {
  await requirePermission('workforce.recruitment_settings.write'); const employeeId = await getCallerEmployeeId()
  const name = field(formData, 'name'); const channel = field(formData, 'channel'); const body = field(formData, 'body_template'); const subject = field(formData, 'subject_template')
  if (name.length < 3 || body.length < 3) throw new Error('Name and body are required.'); if (!allowedChannels.includes(channel)) throw new Error('Invalid channel.')
  if (channel === 'email' && !subject) throw new Error('Email templates require a subject.')
  const db = createSupabaseAdminClient(); const { data, error } = await db.from('recruitment_message_templates').insert({ name, channel, category: field(formData, 'category'), language_code: field(formData, 'language_code') || 'en', subject_template: subject || null, body_template: body, variables: variables(subject, body), created_by: employeeId }).select('id').single(); if (error) throw error
  const { error: versionError } = await db.from('recruitment_message_template_versions').insert({ template_id: data.id, version: 1, subject_template: subject || null, body_template: body, change_summary: 'Initial draft', created_by: employeeId }); if (versionError) throw versionError
  await db.from('recruitment_audit_events').insert({ event_type: 'message_template.created', entity_type: 'message_template', entity_id: data.id, actor_type: 'employee', metadata: { actor_employee_id: employeeId, channel, language_code: field(formData, 'language_code') || 'en' } }); revalidatePath(PATH)
}

export async function updateMessageTemplate(id: string, formData: FormData) {
  await requirePermission('workforce.recruitment_settings.write'); const employeeId = await getCallerEmployeeId(); const db = createSupabaseAdminClient()
  const { data: current, error: currentError } = await db.from('recruitment_message_templates').select('*').eq('id', id).single(); if (currentError) throw currentError
  const subject = field(formData, 'subject_template'); const body = field(formData, 'body_template'); if (body.length < 3) throw new Error('Template body is required.')
  const { count, error: countError } = await db.from('recruitment_message_template_versions').select('id', { count: 'exact', head: true }).eq('template_id', id); if (countError) throw countError
  const { error: versionError } = await db.from('recruitment_message_template_versions').insert({ template_id: id, version: (count ?? 0) + 1, subject_template: subject || null, body_template: body, change_summary: field(formData, 'change_summary') || 'Template revised', created_by: employeeId }); if (versionError) throw versionError
  const { error } = await db.from('recruitment_message_templates').update({ subject_template: subject || null, body_template: body, variables: variables(subject, body), status: 'draft' }).eq('id', id); if (error) throw error
  await db.from('recruitment_audit_events').insert({ event_type: 'message_template.revised', entity_type: 'message_template', entity_id: id, actor_type: 'employee', metadata: { actor_employee_id: employeeId, previous_status: current.status, changed_fields: ['subject_template', 'body_template', 'variables'] } }); revalidatePath(PATH)
}

export async function setMessageTemplateStatus(id: string, status: string) {
  await requirePermission('workforce.recruitment_settings.write'); if (!['draft', 'active', 'archived'].includes(status)) throw new Error('Invalid status.')
  const employeeId = await getCallerEmployeeId(); const db = createSupabaseAdminClient(); const { error } = await db.from('recruitment_message_templates').update({ status }).eq('id', id); if (error) throw error
  await db.from('recruitment_audit_events').insert({ event_type: 'message_template.status_changed', entity_type: 'message_template', entity_id: id, actor_type: 'employee', metadata: { actor_employee_id: employeeId, status } }); revalidatePath(PATH)
}

export async function sendTemplateTest(id: string, formData: FormData) {
  await requirePermission('workforce.recruitment_settings.write'); const address = field(formData, 'address'); if (!/^\S+@\S+\.\S+$/.test(address)) throw new Error('Enter a valid test email address.')
  const db = createSupabaseAdminClient(); const { data: template, error } = await db.from('recruitment_message_templates').select('*').eq('id', id).single(); if (error) throw error; if (template.channel !== 'email') throw new Error('Provider test sending is available for email templates only.')
  const sample = { 'candidate.first_name': 'Asha', 'candidate.full_name': 'Asha Mwakalukwa', 'job.title': 'Event Operations Manager', 'interview.date': '12 August 2026, 10:00 EAT', 'interview.location': 'OpusFesta, Dar es Salaam', 'recruiter.name': 'People Operations', 'candidate_portal_url': 'https://example.com/candidate' }
  const subject = `[TEST] ${render(template.subject_template ?? template.name, sample)}`; const body = render(template.body_template, sample)
  const result = await sendEmail({ to: address, subject, text: body, html: `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${body.replace(/[&<>]/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[value]!))}</div>` })
  await db.from('recruitment_audit_events').insert({ event_type: result.sent ? 'message_template.test_sent' : 'message_template.test_failed', entity_type: 'message_template', entity_id: id, actor_type: 'employee', metadata: { actor_employee_id: await getCallerEmployeeId(), provider_configured: result.sent } })
  if (!result.sent) throw new Error(result.error || 'Test email could not be sent.')
}
