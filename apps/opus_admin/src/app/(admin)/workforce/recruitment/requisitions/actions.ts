'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerEmployeeId, getCallerPermissions, requirePermission } from '@/lib/admin-auth'
import { requireRecruitmentAccess } from '@/lib/recruitment-auth'

export type RequisitionFormState = { error: string | null }

const EMPLOYMENT_TYPES = new Set(['Permanent', 'Contract', 'Probation', 'Intern'])
const WORKPLACE_TYPES = new Set(['On-site', 'Hybrid', 'Remote', 'Field-based'])
const REQUISITION_TYPES = new Set([
  'new_headcount', 'replacement', 'temporary_coverage', 'internship',
  'contractor', 'seasonal', 'project_based', 'confidential_replacement',
])

function textValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim()
}

function optionalUuid(formData: FormData, key: string): string | null {
  const value = textValue(formData, key)
  if (!value) return null
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${key}.`)
  }
  return value
}

function positiveInteger(formData: FormData, key: string, fallback = 1): number {
  const value = Number(textValue(formData, key) || fallback)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive whole number.`)
  return value
}

function optionalMoney(formData: FormData, key: string): number | null {
  const raw = textValue(formData, key)
  if (!raw) return null
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${key} must be a non-negative whole amount.`)
  return value
}

function lines(formData: FormData, key: string): string[] {
  return textValue(formData, key).split('\n').map((line) => line.trim()).filter(Boolean)
}

export async function createRequisition(
  _previous: RequisitionFormState,
  formData: FormData,
): Promise<RequisitionFormState> {
  try {
    await requirePermission('workforce.requisitions.create')
    const title = textValue(formData, 'title')
    const department = textValue(formData, 'department')
    const location = textValue(formData, 'location')
    const employmentType = textValue(formData, 'employment_type')
    const workplaceType = textValue(formData, 'workplace_type')
    const requisitionType = textValue(formData, 'requisition_type')
    const reason = textValue(formData, 'reason')
    const headcount = positiveInteger(formData, 'headcount')
    const salaryMin = optionalMoney(formData, 'salary_min_tzs')
    const salaryMax = optionalMoney(formData, 'salary_max_tzs')
    if (title.length < 3) throw new Error('Position title is required.')
    if (!department) throw new Error('Department is required.')
    if (!location) throw new Error('Location is required.')
    if (!EMPLOYMENT_TYPES.has(employmentType)) throw new Error('Choose a valid employment type.')
    if (!WORKPLACE_TYPES.has(workplaceType)) throw new Error('Choose a valid workplace type.')
    if (!REQUISITION_TYPES.has(requisitionType)) throw new Error('Choose a valid requisition type.')
    if (reason.length < 20) throw new Error('Business justification must be at least 20 characters.')
    if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) {
      throw new Error('Maximum salary must be greater than or equal to minimum salary.')
    }

    const requesterId = await getCallerEmployeeId()
    const id = randomUUID()
    const number = `REQ-${new Date().getFullYear()}-${id.slice(0, 8).toUpperCase()}`
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase.from('recruitment_requisitions').insert({
      id,
      requisition_number: number,
      title,
      department,
      brand: textValue(formData, 'brand') || 'OpusFesta',
      location,
      workplace_type: workplaceType,
      employment_type: employmentType,
      requisition_type: requisitionType,
      headcount,
      hiring_manager_employee_id: optionalUuid(formData, 'hiring_manager_employee_id'),
      recruiter_employee_id: optionalUuid(formData, 'recruiter_employee_id'),
      requested_by_employee_id: requesterId,
      reason,
      responsibilities: lines(formData, 'responsibilities'),
      requirements: lines(formData, 'requirements'),
      preferred_qualifications: lines(formData, 'preferred_qualifications'),
      salary_min_tzs: salaryMin,
      salary_max_tzs: salaryMax,
      target_start_date: textValue(formData, 'target_start_date') || null,
      target_fill_date: textValue(formData, 'target_fill_date') || null,
      budget_confirmed: formData.get('budget_confirmed') === 'on',
      status: 'draft',
    })
    if (error) throw error

    await supabase.from('recruitment_audit_events').insert({
      event_type: 'requisition.created',
      entity_type: 'requisition',
      entity_id: id,
      actor_type: 'employee',
      metadata: { requisition_number: number, department, headcount },
    })
    revalidatePath('/workforce/recruitment')
    revalidatePath('/workforce/recruitment/requisitions')
    redirect(`/workforce/recruitment/requisitions/${id}`)
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error && String(error.digest).startsWith('NEXT_REDIRECT')) throw error
    console.error('[recruitment] create requisition failed', error)
    return { error: error instanceof Error ? error.message : 'Could not create requisition.' }
  }
}

export async function submitRequisition(requisitionId: string): Promise<void> {
  const access = await requireRecruitmentAccess({
    entityType: 'requisition',
    entityId: requisitionId,
    allowedPermissions: ['workforce.requisitions.create'],
  })
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.rpc('recruitment_submit_requisition', {
    p_requisition_id: requisitionId,
    p_actor_employee_id: access.employeeId,
  })
  if (error) throw error
  revalidatePath('/workforce/recruitment')
  revalidatePath(`/workforce/recruitment/requisitions/${requisitionId}`)
}

export async function updateRequisition(requisitionId: string, formData: FormData): Promise<void> {
  const access = await requireRecruitmentAccess({ entityType: 'requisition', entityId: requisitionId, allowedPermissions: ['workforce.requisitions.create'] })
  const title = textValue(formData, 'title'); const department = textValue(formData, 'department'); const location = textValue(formData, 'location'); const headcount = positiveInteger(formData, 'headcount'); const salaryMin = optionalMoney(formData, 'salary_min_tzs'); const salaryMax = optionalMoney(formData, 'salary_max_tzs'); const reason = textValue(formData, 'reason')
  if (title.length < 3 || !department || !location || reason.length < 20) throw new Error('Complete the required requisition fields.'); if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) throw new Error('Maximum salary must be at least the minimum.')
  const db = createSupabaseAdminClient(); const { data: current, error: lookupError } = await db.from('recruitment_requisitions').select('status').eq('id', requisitionId).single(); if (lookupError) throw lookupError; if (!['draft', 'changes_requested'].includes(current.status)) throw new Error('Only draft or change-requested requisitions can be revised.')
  const { error } = await db.from('recruitment_requisitions').update({ title, department, brand: textValue(formData, 'brand') || 'OpusFesta', location, workplace_type: textValue(formData, 'workplace_type'), employment_type: textValue(formData, 'employment_type'), requisition_type: textValue(formData, 'requisition_type'), headcount, hiring_manager_employee_id: optionalUuid(formData, 'hiring_manager_employee_id'), recruiter_employee_id: optionalUuid(formData, 'recruiter_employee_id'), reason, responsibilities: lines(formData, 'responsibilities'), requirements: lines(formData, 'requirements'), preferred_qualifications: lines(formData, 'preferred_qualifications'), salary_min_tzs: salaryMin, salary_max_tzs: salaryMax, target_start_date: textValue(formData, 'target_start_date') || null, target_fill_date: textValue(formData, 'target_fill_date') || null, budget_confirmed: formData.get('budget_confirmed') === 'on', status: 'draft' }).eq('id', requisitionId).in('status', ['draft', 'changes_requested']); if (error) throw error
  await db.from('recruitment_audit_events').insert({ event_type: 'requisition.revised', entity_type: 'requisition', entity_id: requisitionId, actor_type: 'employee', metadata: { actor_employee_id: access.employeeId, changed_fields: ['title', 'department', 'location', 'headcount', 'reason', 'salary_range', 'targets', 'assignments'], previous_status: current.status } }); revalidatePath(`/workforce/recruitment/requisitions/${requisitionId}`)
}

export async function addRequisitionComment(requisitionId: string, formData: FormData): Promise<void> {
  const access = await requireRecruitmentAccess({
    entityType: 'requisition', entityId: requisitionId,
    allowedPermissions: ['workforce.requisitions.read'],
  })
  const body = textValue(formData, 'body')
  if (body.length < 2) throw new Error('Comment cannot be empty.')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('recruitment_requisition_comments').insert({
    requisition_id: requisitionId,
    author_employee_id: access.employeeId,
    body,
    is_internal: true,
  })
  if (error) throw error
  revalidatePath(`/workforce/recruitment/requisitions/${requisitionId}`)
}

export async function decideRequisitionStep(
  requisitionId: string,
  decision: 'approved' | 'rejected' | 'changes_requested',
  formData: FormData,
): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { data: requisition, error: requisitionError } = await supabase
    .from('recruitment_requisitions')
    .select('id, status, requested_by_employee_id')
    .eq('id', requisitionId)
    .single<{ id: string; status: string; requested_by_employee_id: string | null }>()
  if (requisitionError) throw requisitionError
  const { data: step, error: stepError } = await supabase
    .from('recruitment_approval_steps')
    .select('id, sequence, approver_role, approver_employee_id, status')
    .eq('requisition_id', requisitionId)
    .eq('status', 'pending')
    .order('sequence')
    .limit(1)
    .maybeSingle<{ id: string; sequence: number; approver_role: string | null; approver_employee_id: string | null; status: string }>()
  if (stepError) throw stepError
  if (!step) throw new Error('There is no pending approval step.')

  const permission = step.approver_role === 'finance'
    ? 'workforce.requisitions.finance_approve'
    : step.approver_role === 'executive'
      ? 'workforce.requisitions.executive_approve'
      : 'workforce.requisitions.approve'
  await requirePermission(permission)
  const callerEmployeeId = await getCallerEmployeeId()
  if (step.approver_employee_id && step.approver_employee_id !== callerEmployeeId) {
    throw new Error('This approval step is assigned to another employee.')
  }
  const permissions = await getCallerPermissions()
  if (callerEmployeeId && requisition.requested_by_employee_id === callerEmployeeId && !permissions.has('platform.admin')) {
    throw new Error('Segregation of duties prevents approving your own requisition.')
  }

  const note = textValue(formData, 'note') || null
  if (decision !== 'approved' && !note) throw new Error('A decision note is required.')
  const { error: decisionError } = await supabase.rpc('recruitment_decide_requisition_step', {
    p_requisition_id: requisitionId,
    p_step_id: step.id,
    p_decision: decision,
    p_note: note,
    p_actor_employee_id: callerEmployeeId,
  })
  if (decisionError) throw decisionError
  revalidatePath('/workforce/recruitment')
  revalidatePath('/workforce/recruitment/requisitions')
  revalidatePath(`/workforce/recruitment/requisitions/${requisitionId}`)
}

export async function publishApprovedRequisition(requisitionId: string, formData: FormData): Promise<void> {
  const access = await requireRecruitmentAccess({
    entityType: 'requisition', entityId: requisitionId,
    allowedPermissions: ['workforce.jobs.publish'],
  })
  await requirePermission('workforce.jobs.write')
  const slug = textValue(formData, 'slug')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 96)
  const visibility = textValue(formData, 'visibility') || 'public'
  if (slug.length < 3) throw new Error('A valid public slug is required.')
  if (!['public', 'internal', 'unlisted'].includes(visibility)) throw new Error('Invalid posting visibility.')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.rpc('recruitment_publish_approved_requisition', {
    p_requisition_id: requisitionId,
    p_slug: slug,
    p_visibility: visibility,
    p_actor_employee_id: access.employeeId,
  })
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('That public job slug is already in use.')
    throw error
  }
  revalidatePath('/workforce/recruitment')
  revalidatePath('/workforce/recruitment/jobs')
  revalidatePath('/workforce/recruitment/requisitions')
  revalidatePath(`/workforce/recruitment/requisitions/${requisitionId}`)
  revalidatePath('/careers')
}
