'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requirePermission } from '@/lib/admin-auth'
import { ENDED_EMPLOYEE_STATUSES_SQL, type PayrollStatus } from '../../workforce/_lib/types'

// PAYE/NSSF rates — illustrative; the real engine will live in
// `lib/payroll`. Keeping the rates here as a single source so the
// preview "compute next run" action and the UI's per-line view agree.
const PAYE_RATE = 0.185
const NSSF_RATE = 0.1

type PayrollMatrix = {
  headcount: number
  grossTzs: number
  payeTzs: number
  nssfTzs: number
  netTzs: number
}

async function computeMatrixFromActiveEmployees(): Promise<PayrollMatrix> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('salary_tzs, status')
    .not('status', 'in', ENDED_EMPLOYEE_STATUSES_SQL)
    .returns<Array<{ salary_tzs: number; status: string }>>()
  if (error) throw error

  let gross = 0
  let headcount = 0
  for (const r of data ?? []) {
    gross += Number(r.salary_tzs)
    headcount += 1
  }
  const paye = Math.round(gross * PAYE_RATE)
  const nssf = Math.round(gross * NSSF_RATE)
  return {
    headcount,
    grossTzs: gross,
    payeTzs: paye,
    nssfTzs: nssf,
    netTzs: gross - paye - nssf,
  }
}

// Period is "Month YYYY" (e.g. "May 2026"). Pay date is the last
// banking day; here we just pick the 28th to match the convention
// used in the seed data.
function periodFromDate(date: Date): { period: string; payDate: string } {
  const month = date.toLocaleDateString('en-US', { month: 'long' })
  const year = date.getFullYear()
  const payDate = new Date(year, date.getMonth(), 28).toISOString().slice(0, 10)
  return { period: `${month} ${year}`, payDate }
}

export async function startPayrollRun(input?: { period?: string; payDate?: string }): Promise<{ id: string }> {
  await requirePermission('workforce.payroll')

  const supabase = createSupabaseAdminClient()
  const matrix = await computeMatrixFromActiveEmployees()

  const fallback = periodFromDate(new Date())
  const period = input?.period ?? fallback.period
  const payDate = input?.payDate ?? fallback.payDate

  const { data, error } = await supabase
    .from('workforce_payroll_runs')
    .upsert(
      {
        period,
        pay_date: payDate,
        status: 'Draft',
        headcount: matrix.headcount,
        gross_tzs: matrix.grossTzs,
        paye_tzs: matrix.payeTzs,
        nssf_tzs: matrix.nssfTzs,
        net_tzs: matrix.netTzs,
      },
      { onConflict: 'period' },
    )
    .select('id')
    .single<{ id: string }>()

  if (error) throw error
  revalidatePath('/finance/payroll')
  return { id: data.id }
}

export async function setPayrollStatus(id: string, status: PayrollStatus): Promise<void> {
  await requirePermission('workforce.payroll')

  const patch: Record<string, unknown> = { status }
  if (status === 'Approved') patch.approved_at = new Date().toISOString()
  if (status === 'Paid') patch.paid_at = new Date().toISOString()

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('workforce_payroll_runs').update(patch).eq('id', id)
  if (error) throw error

  revalidatePath('/finance/payroll')
}

export async function recomputePayrollRun(id: string): Promise<void> {
  await requirePermission('workforce.payroll')

  const supabase = createSupabaseAdminClient()
  const { data: existing, error: fetchError } = await supabase
    .from('workforce_payroll_runs')
    .select('status')
    .eq('id', id)
    .single<{ status: PayrollStatus }>()
  if (fetchError) throw fetchError
  if (existing.status === 'Paid') {
    throw new Error('Cannot recompute a paid run — open a correction run instead.')
  }

  const matrix = await computeMatrixFromActiveEmployees()
  const { error } = await supabase
    .from('workforce_payroll_runs')
    .update({
      headcount: matrix.headcount,
      gross_tzs: matrix.grossTzs,
      paye_tzs: matrix.payeTzs,
      nssf_tzs: matrix.nssfTzs,
      net_tzs: matrix.netTzs,
    })
    .eq('id', id)
  if (error) throw error

  revalidatePath('/finance/payroll')
}
