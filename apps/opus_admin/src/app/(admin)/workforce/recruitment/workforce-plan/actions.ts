'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getCallerEmployeeId, requirePermission } from '@/lib/admin-auth';

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}
function number(formData: FormData, key: string): number {
  const value = Number(text(formData, key));
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${key} must be a non-negative whole number.`);
  return value;
}

export async function createWorkforcePlan(formData: FormData): Promise<void> {
  await requirePermission('workforce.recruitment_settings.write');
  const name = text(formData, 'name');
  const fiscalYear = number(formData, 'fiscal_year');
  if (
    name.length < 3 ||
    fiscalYear < new Date().getFullYear() - 1 ||
    fiscalYear > new Date().getFullYear() + 5
  )
    throw new Error('Enter a valid plan name and fiscal year.');
  const employeeId = await getCallerEmployeeId();
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from('recruitment_workforce_plans')
    .insert({
      name,
      fiscal_year: fiscalYear,
      department: text(formData, 'department') || null,
      planned_headcount: number(formData, 'planned_headcount'),
      approved_headcount: number(formData, 'approved_headcount'),
      planned_budget_tzs: number(formData, 'planned_budget_tzs'),
      assumptions: text(formData, 'assumptions') || null,
      owner_employee_id: employeeId,
      created_by: employeeId,
    });
  if (error) throw error;
  revalidatePath('/workforce/recruitment/workforce-plan');
}

export async function addPlannedPosition(
  planId: string,
  formData: FormData
): Promise<void> {
  await requirePermission('workforce.recruitment_settings.write');
  const title = text(formData, 'title');
  const department = text(formData, 'department');
  const location = text(formData, 'location');
  const min = number(formData, 'salary_min');
  const max = number(formData, 'salary_max');
  if (title.length < 3 || !department || !location || max < min)
    throw new Error('Complete the planned position and salary band.');
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from('recruitment_positions')
    .insert({
      workforce_plan_id: planId,
      position_code: `POS-${randomUUID().slice(0, 10).toUpperCase()}`,
      title,
      department,
      location,
      employment_type: text(formData, 'employment_type') || 'Permanent',
      budgeted_salary_min_tzs: min,
      budgeted_salary_max_tzs: max,
      headcount: number(formData, 'headcount'),
      target_start_date: text(formData, 'target_start_date') || null,
    });
  if (error) throw error;
  revalidatePath('/workforce/recruitment/workforce-plan');
}

export async function updateWorkforcePlan(
  planId: string,
  formData: FormData
): Promise<void> {
  await requirePermission('workforce.recruitment_settings.write');
  const name = text(formData, 'name');
  const fiscalYear = number(formData, 'fiscal_year');
  if (name.length < 3) throw new Error('Plan name is required.');
  const { error } = await createSupabaseAdminClient()
    .from('recruitment_workforce_plans')
    .update({
      name,
      fiscal_year: fiscalYear,
      department: text(formData, 'department') || null,
      planned_headcount: number(formData, 'planned_headcount'),
      approved_headcount: number(formData, 'approved_headcount'),
      planned_budget_tzs: number(formData, 'planned_budget_tzs'),
      assumptions: text(formData, 'assumptions') || null,
    })
    .eq('id', planId)
    .eq('status', 'draft');
  if (error) throw error;
  revalidatePath('/workforce/recruitment/workforce-plan');
}

export async function deleteWorkforcePlan(
  planId: string,
  formData: FormData
): Promise<void> {
  await requirePermission('workforce.recruitment_settings.write');
  if (text(formData, 'confirmation') !== 'delete')
    throw new Error('Deletion was not confirmed.');
  const db = createSupabaseAdminClient();
  const { count, error: countError } = await db
    .from('recruitment_positions')
    .select('id', { count: 'exact', head: true })
    .eq('workforce_plan_id', planId);
  if (countError) throw countError;
  if ((count ?? 0) > 0)
    throw new Error('Remove the draft positions before deleting this plan.');
  const { error } = await db
    .from('recruitment_workforce_plans')
    .delete()
    .eq('id', planId)
    .eq('status', 'draft');
  if (error) throw error;
  revalidatePath('/workforce/recruitment/workforce-plan');
}

export async function updatePlannedPosition(
  planId: string,
  positionId: string,
  formData: FormData
): Promise<void> {
  await requirePermission('workforce.recruitment_settings.write');
  const title = text(formData, 'title');
  const department = text(formData, 'department');
  const location = text(formData, 'location');
  const min = number(formData, 'salary_min');
  const max = number(formData, 'salary_max');
  if (title.length < 3 || !department || !location || max < min)
    throw new Error('Complete the planned position and salary band.');
  const db = createSupabaseAdminClient();
  const { data: plan, error: planError } = await db
    .from('recruitment_workforce_plans')
    .select('status')
    .eq('id', planId)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan || plan.status !== 'draft')
    throw new Error('Only positions in a draft plan can be edited.');
  const { error } = await db
    .from('recruitment_positions')
    .update({
      title,
      department,
      location,
      employment_type: text(formData, 'employment_type') || 'Permanent',
      budgeted_salary_min_tzs: min,
      budgeted_salary_max_tzs: max,
      headcount: number(formData, 'headcount'),
      target_start_date: text(formData, 'target_start_date') || null,
    })
    .eq('id', positionId)
    .eq('workforce_plan_id', planId)
    .eq('status', 'planned');
  if (error) throw error;
  revalidatePath('/workforce/recruitment/workforce-plan');
}

export async function deletePlannedPosition(
  planId: string,
  positionId: string,
  formData: FormData
): Promise<void> {
  await requirePermission('workforce.recruitment_settings.write');
  if (text(formData, 'confirmation') !== 'delete')
    throw new Error('Deletion was not confirmed.');
  const db = createSupabaseAdminClient();
  const { data: plan, error: planError } = await db
    .from('recruitment_workforce_plans')
    .select('status')
    .eq('id', planId)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan || plan.status !== 'draft')
    throw new Error('Only positions in a draft plan can be deleted.');
  const { count, error: requisitionError } = await db
    .from('recruitment_requisitions')
    .select('id', { count: 'exact', head: true })
    .eq('position_id', positionId);
  if (requisitionError) throw requisitionError;
  if ((count ?? 0) > 0)
    throw new Error(
      'This position is linked to a requisition and cannot be deleted.'
    );
  const { error } = await db
    .from('recruitment_positions')
    .delete()
    .eq('id', positionId)
    .eq('workforce_plan_id', planId)
    .eq('status', 'planned')
    .eq('filled_headcount', 0);
  if (error) throw error;
  revalidatePath('/workforce/recruitment/workforce-plan');
}

export async function transitionWorkforcePlan(
  planId: string,
  status: 'submitted' | 'approved' | 'locked' | 'archived'
): Promise<void> {
  await requirePermission('workforce.recruitment_settings.write');
  const supabase = createSupabaseAdminClient();
  const { data: plan, error: lookupError } = await supabase
    .from('recruitment_workforce_plans')
    .select('status')
    .eq('id', planId)
    .single<{ status: string }>();
  if (lookupError) throw lookupError;
  const allowed: Record<string, string[]> = {
    draft: ['submitted', 'archived'],
    submitted: ['approved', 'archived'],
    approved: ['locked', 'archived'],
    locked: ['archived'],
  };
  if (!(allowed[plan.status] ?? []).includes(status))
    throw new Error('Invalid plan transition.');
  const timestamps = {
    submitted_at: status === 'submitted' ? new Date().toISOString() : undefined,
    approved_at: status === 'approved' ? new Date().toISOString() : undefined,
    locked_at: status === 'locked' ? new Date().toISOString() : undefined,
  };
  const { error } = await supabase
    .from('recruitment_workforce_plans')
    .update({ status, ...timestamps })
    .eq('id', planId);
  if (error) throw error;
  revalidatePath('/workforce/recruitment/workforce-plan');
}
