'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requirePermission } from '@/lib/admin-auth'
import { getPunchesForRange } from '../_lib/queries'
import { summarizePunchesByDay } from '../_lib/time-summary'

const TZ = 'Africa/Dar_es_Salaam'

function friendlyAlternationError(message: string, type: 'in' | 'out'): string {
  if (/first punch/i.test(message)) {
    return "First punch for this employee must be a clock-in — add an 'in' before the 'out'."
  }
  if (/must alternate/i.test(message) || /duplicate type/i.test(message)) {
    return type === 'in'
      ? "That would create two clock-ins in a row. Add or move a clock-out first."
      : "That would create two clock-outs in a row. Add or move a clock-in first."
  }
  return message
}

export type AdminPunchInput = {
  employeeId: string
  punchAtIso: string
  type: 'in' | 'out'
  note?: string | null
}

export async function adminInsertPunch(input: AdminPunchInput): Promise<{ id: string }> {
  await requirePermission('workforce.write')
  const { userId } = await auth()
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_time_punches')
    .insert({
      employee_id: input.employeeId,
      punch_at: input.punchAtIso,
      punch_type: input.type,
      source: 'admin_manual',
      note: input.note?.trim() || null,
      created_by_clerk_id: userId,
    })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(friendlyAlternationError(error.message, input.type))
  revalidatePath('/workforce/timesheets')
  revalidatePath('/workspace/time-clock')
  return { id: data.id }
}

export type AdminPunchUpdate = {
  id: string
  punchAtIso: string
  type: 'in' | 'out'
  note?: string | null
}

export async function adminUpdatePunch(input: AdminPunchUpdate): Promise<void> {
  await requirePermission('workforce.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_time_punches')
    .update({
      punch_at: input.punchAtIso,
      punch_type: input.type,
      note: input.note?.trim() || null,
    })
    .eq('id', input.id)
  if (error) throw new Error(friendlyAlternationError(error.message, input.type))
  revalidatePath('/workforce/timesheets')
  revalidatePath('/workspace/time-clock')
}

export async function adminDeletePunch(id: string): Promise<void> {
  await requirePermission('workforce.write')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('workforce_time_punches')
    .delete()
    .eq('id', id)
  if (error) throw error
  revalidatePath('/workforce/timesheets')
  revalidatePath('/workspace/time-clock')
}

// Build a CSV of worked-minutes per employee × day for the given week.
// Returns the CSV body as a string so the client can drive a download
// without an extra API route.
export async function exportTimesheetCsv(
  weekStartIso: string,
  weekEndIsoExclusive: string,
): Promise<{ filename: string; csv: string }> {
  await requirePermission('workforce.write')

  const supabase = createSupabaseAdminClient()
  const [{ data: emps, error: empErr }, punches] = await Promise.all([
    supabase
      .from('workforce_employees')
      .select('id, employee_code, full_name, department')
      .order('employee_code', { ascending: true })
      .returns<Array<{ id: string; employee_code: string; full_name: string; department: string }>>(),
    getPunchesForRange(weekStartIso, weekEndIsoExclusive),
  ])
  if (empErr) throw empErr

  // Index punches by employee for fast per-row summarization.
  const byEmp = new Map<string, typeof punches>()
  for (const p of punches) {
    const arr = byEmp.get(p.employeeId)
    if (arr) arr.push(p)
    else byEmp.set(p.employeeId, [p])
  }

  // Day labels for the header — Mon..Sun in the workforce timezone.
  const dayLabels: string[] = []
  const dayKeys: string[] = []
  const dayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  for (let i = 0; i < 7; i++) {
    const d = new Date(new Date(weekStartIso).getTime() + i * 86_400_000)
    dayKeys.push(dayFmt.format(d))
    dayLabels.push(
      d.toLocaleDateString('en-GB', {
        timeZone: TZ,
        weekday: 'short',
        day: '2-digit',
        month: 'short',
      }),
    )
  }

  const rows: string[][] = []
  rows.push(['Employee ID', 'Name', 'Department', ...dayLabels, 'Total (hours)'])
  for (const e of emps ?? []) {
    const days = summarizePunchesByDay(byEmp.get(e.id) ?? [], TZ)
    const byDay = new Map(days.map((d) => [d.date, d.workedMinutes]))
    const dayMinutes = dayKeys.map((k) => byDay.get(k) ?? 0)
    const total = dayMinutes.reduce((a, b) => a + b, 0)
    rows.push([
      e.employee_code,
      e.full_name,
      e.department,
      ...dayMinutes.map((m) => (m / 60).toFixed(2)),
      (total / 60).toFixed(2),
    ])
  }

  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n')
  const filename = `timesheet_${dayKeys[0]}_to_${dayKeys[6]}.csv`
  return { filename, csv }
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
