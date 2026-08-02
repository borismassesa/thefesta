'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { DEPARTMENTS } from '../_lib/types'
import { getCallerScope, isInTaskScope, type CallerScope } from '../_lib/task-scope'
import type {
  Department,
  TaskCadence,
  TaskCategory,
  TaskTargetType,
} from '../_lib/types'

// Server actions for the admin task-assignment surface (/workforce/tasks).
//
// Authz model — two tiers:
//   1. workforce.write holders (owners, admins, People Ops) can assign to
//      anyone or any department.
//   2. Dept managers (employees who have at least one direct report) can
//      assign, but only within their own department.
// Everything runs as the service role (bypasses RLS); the scope check
// below is the gate. Generation of the actual per-employee task rows is
// delegated to the workforce_generate_task_occurrences() SQL function,
// which we call inline so the first occurrence appears immediately.

const CADENCES = new Set<TaskCadence>(['once', 'daily', 'weekly', 'monthly'])
const CATEGORIES = new Set<TaskCategory>([
  'General', 'Project', 'Admin', 'Reporting', 'Meeting', 'Onboarding', 'Review',
])
const DEPARTMENT_SET = new Set<string>(DEPARTMENTS)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type CreateAssignmentInput = {
  title: string
  description?: string | null
  category: TaskCategory
  targetType: TaskTargetType
  targetEmployeeId?: string | null
  targetDepartment?: Department | null
  cadence: TaskCadence
  startDate: string
  endDate?: string | null
}

export type CreateAssignmentResult =
  | { ok: true; id: string; generated: number; warning?: string }
  | { ok: false; error: string }

export async function createAssignment(
  input: CreateAssignmentInput,
): Promise<CreateAssignmentResult> {
  const scope = await getCallerScope()
  if (!scope) {
    return {
      ok: false,
      error: "You can't assign tasks. Ask an owner for workforce access, or you must be set as a manager.",
    }
  }

  const title = input.title.trim()
  if (title.length === 0) return { ok: false, error: 'Give the task a title.' }
  if (!CATEGORIES.has(input.category)) return { ok: false, error: 'Pick a known category.' }
  if (!CADENCES.has(input.cadence)) return { ok: false, error: 'Pick a valid frequency.' }
  if (!DATE_RE.test(input.startDate)) return { ok: false, error: 'Pick a valid start date.' }
  if (input.endDate && !DATE_RE.test(input.endDate)) {
    return { ok: false, error: 'End date is invalid.' }
  }
  if (input.endDate && input.endDate < input.startDate) {
    return { ok: false, error: 'End date must be on or after the start date.' }
  }

  const supabase = createSupabaseAdminClient()

  let targetEmployeeId: string | null = null
  let targetDepartment: Department | null = null

  if (input.targetType === 'employee') {
    if (!input.targetEmployeeId) return { ok: false, error: 'Pick an employee to assign to.' }
    // Confirm the target exists and capture their department for scoping.
    const { data: target } = await supabase
      .from('workforce_employees')
      .select('id')
      .eq('id', input.targetEmployeeId)
      .maybeSingle<{ id: string }>()
    if (!target) return { ok: false, error: 'That employee no longer exists.' }
    // Team tier is direct reports only. Sharing a department is no longer
    // sufficient — a manager could otherwise assign to peers who do not
    // report to them.
    if (!isInTaskScope(scope, target.id)) {
      return { ok: false, error: 'You can only assign tasks to your direct reports.' }
    }
    targetEmployeeId = target.id
  } else if (input.targetType === 'department') {
    const dept = input.targetDepartment
    if (!dept || !DEPARTMENT_SET.has(dept)) return { ok: false, error: 'Pick a known department.' }
    // Department targeting assigns to everyone in that department, which by
    // definition exceeds any set of direct reports. It is an ORG capability.
    if (!scope.canAssignAll) {
      return {
        ok: false,
        error: 'Assigning to a whole department needs the Tasks assign permission. You can assign to your direct reports individually.',
      }
    }
    targetDepartment = dept
  } else {
    return { ok: false, error: 'Pick who to assign to.' }
  }

  const { data, error } = await supabase
    .from('workforce_task_assignments')
    .insert({
      title,
      description: input.description?.trim() || null,
      category: input.category,
      target_type: input.targetType,
      target_employee_id: targetEmployeeId,
      target_department: targetDepartment,
      cadence: input.cadence,
      start_date: input.startDate,
      end_date: input.endDate || null,
      assigned_by: scope.employeeId,
    })
    .select('id')
    .single<{ id: string }>()

  if (error) {
    console.error('[workforce] createAssignment insert failed', error)
    return { ok: false, error: error.message || 'Could not create this assignment.' }
  }

  // Materialise occurrences up to today so the task shows immediately.
  // pg_cron keeps generating future ones nightly.
  const { data: generated, error: genError } = await supabase
    .rpc('workforce_generate_task_occurrences')
    .returns<number>()
  if (genError) {
    console.error('[workforce] generate occurrences failed', genError)
  }

  revalidatePath('/workforce/tasks')
  revalidatePath('/workspace/tasks')
  revalidatePath('/')
  return {
    ok: true,
    id: data.id,
    generated: typeof generated === 'number' ? generated : 0,
    // The assignment was saved, but the first occurrence couldn't be
    // materialised. The nightly generator will pick it up; tell the admin so
    // they don't think the assignee will see it immediately.
    warning: genError
      ? "Assignment saved, but its first task couldn't be generated yet — it'll appear after the nightly run."
      : undefined,
  }
}

// Confirms the caller may mutate a given assignment. Admins: always.
// Managers: only assignments scoped to their own department.
async function assertCanMutate(
  scope: CallerScope,
  assignmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (scope.canAssignAll) return { ok: true }
  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('workforce_task_assignments')
    .select('target_type, target_department, target_employee_id')
    .eq('id', assignmentId)
    .maybeSingle<{
      target_type: TaskTargetType
      target_department: Department | null
      target_employee_id: string | null
    }>()
  if (!data) return { ok: false, error: 'Assignment not found.' }

  if (data.target_type === 'department') {
    // A department-wide assignment always covers people outside the caller's
    // direct reports, so Team tier can never manage one.
    return {
      ok: false,
      error: 'Department-wide assignments need the Tasks assign permission.',
    }
  }
  // Employee target — the assignee must be a direct report. No extra query:
  // the scope already carries the authoritative id list.
  if (data.target_employee_id && isInTaskScope(scope, data.target_employee_id)) {
    return { ok: true }
  }
  return { ok: false, error: 'You can only manage tasks for your direct reports.' }
}

export type MutateResult = { ok: true } | { ok: false; error: string }

export async function setAssignmentActive(
  assignmentId: string,
  isActive: boolean,
): Promise<MutateResult> {
  const scope = await getCallerScope()
  if (!scope) return { ok: false, error: 'You can’t manage task assignments.' }
  const allowed = await assertCanMutate(scope, assignmentId)
  if (!allowed.ok) return allowed

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_task_assignments')
    .update({ is_active: isActive })
    .eq('id', assignmentId)
  if (error) return { ok: false, error: error.message || 'Could not update the assignment.' }

  revalidatePath('/workforce/tasks')
  return { ok: true }
}

export async function deleteAssignment(assignmentId: string): Promise<MutateResult> {
  const scope = await getCallerScope()
  if (!scope) return { ok: false, error: 'You can’t manage task assignments.' }
  const allowed = await assertCanMutate(scope, assignmentId)
  if (!allowed.ok) return allowed

  const supabase = createSupabaseAdminClient()
  // Cascade drops the generated workforce_tasks instances too.
  const { error } = await supabase
    .from('workforce_task_assignments')
    .delete()
    .eq('id', assignmentId)
  if (error) return { ok: false, error: error.message || 'Could not delete the assignment.' }

  revalidatePath('/workforce/tasks')
  revalidatePath('/workspace/tasks')
  return { ok: true }
}
