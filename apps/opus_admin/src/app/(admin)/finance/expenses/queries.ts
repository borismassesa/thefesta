import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase'
import { ENDED_EMPLOYEE_STATUSES_SQL } from '../../workforce/_lib/types'

// Lifecycle states mirrored from the CHECK constraint on finance_expenses.
// Five primary buckets the UI uses + 'posted'/'refused' terminal states.
export type ExpenseStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'in_payment'
  | 'paid'
  | 'refused'
  | 'posted'

export type PaidBy = 'employee' | 'company'

export type ExpenseCategory = {
  id: string
  slug: string
  name: string
  accountCode: string | null
  active: boolean
}

export type Expense = {
  id: string
  reference: string
  description: string
  expenseDate: string
  paidBy: PaidBy
  totalTzs: number
  currency: string
  status: ExpenseStatus
  notes: string | null
  receiptUrl: string | null
  analyticDistribution: string | null
  activitiesCount: number
  submittedAt: string | null
  approvedAt: string | null
  paidAt: string | null
  refusedAt: string | null
  refusedReason: string | null
  createdAt: string
  category: ExpenseCategory | null
  employee: {
    id: string
    name: string
    email: string
    avatarColor: string
    avatarUrl: string | null
    jobTitle: string
  } | null
}

type ExpenseRow = {
  id: string
  reference: string
  description: string
  expense_date: string
  paid_by: PaidBy
  total_tzs: string | number
  currency: string
  status: ExpenseStatus
  notes: string | null
  receipt_url: string | null
  analytic_distribution: string | null
  activities_count: number
  submitted_at: string | null
  approved_at: string | null
  paid_at: string | null
  refused_at: string | null
  refused_reason: string | null
  created_at: string
  category: {
    id: string
    slug: string
    name: string
    account_code: string | null
    active: boolean
  } | null
  employee: {
    id: string
    full_name: string
    email: string
    job_title: string
    avatar_color: string
    avatar_url: string | null
  } | null
}

const EXPENSE_COLUMNS = `
  id, reference, description, expense_date, paid_by, total_tzs, currency, status,
  notes, receipt_url, analytic_distribution, activities_count,
  submitted_at, approved_at, paid_at, refused_at, refused_reason, created_at,
  category:finance_expense_categories ( id, slug, name, account_code, active ),
  employee:workforce_employees ( id, full_name, email, job_title, avatar_color, avatar_url )
`

function mapExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    reference: row.reference,
    description: row.description,
    expenseDate: row.expense_date,
    paidBy: row.paid_by,
    totalTzs: Number(row.total_tzs),
    currency: row.currency,
    status: row.status,
    notes: row.notes,
    receiptUrl: row.receipt_url,
    analyticDistribution: row.analytic_distribution,
    activitiesCount: row.activities_count,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    paidAt: row.paid_at,
    refusedAt: row.refused_at,
    refusedReason: row.refused_reason,
    createdAt: row.created_at,
    category: row.category
      ? {
          id: row.category.id,
          slug: row.category.slug,
          name: row.category.name,
          accountCode: row.category.account_code,
          active: row.category.active,
        }
      : null,
    employee: row.employee
      ? {
          id: row.employee.id,
          name: row.employee.full_name,
          email: row.employee.email,
          jobTitle: row.employee.job_title,
          avatarColor: row.employee.avatar_color,
          avatarUrl: row.employee.avatar_url,
        }
      : null,
  }
}

export async function getExpenses(): Promise<Expense[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('finance_expenses')
    .select(EXPENSE_COLUMNS)
    .order('expense_date', { ascending: false })
    .returns<ExpenseRow[]>()
  if (error) throw new Error(`[finance] getExpenses: ${error.message}`)
  return (data ?? []).map(mapExpense)
}

export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('finance_expense_categories')
    .select('id, slug, name, account_code, active')
    .eq('active', true)
    .order('name', { ascending: true })
    .returns<Array<{ id: string; slug: string; name: string; account_code: string | null; active: boolean }>>()
  if (error) throw new Error(`[finance] getExpenseCategories: ${error.message}`)
  return (data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    accountCode: c.account_code,
    active: c.active,
  }))
}

// Light-weight employee listing so the "Submit for…" picker doesn't pull
// the whole workforce row down.
export type ExpenseEmployeeOption = {
  id: string
  name: string
  email: string
  jobTitle: string
  avatarColor: string
  avatarUrl: string | null
}

export async function getExpenseEmployeeOptions(): Promise<ExpenseEmployeeOption[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('id, full_name, email, job_title, avatar_color, avatar_url, status')
    .not('status', 'in', ENDED_EMPLOYEE_STATUSES_SQL)
    .order('full_name', { ascending: true })
    .returns<
      Array<{
        id: string
        full_name: string
        email: string
        job_title: string
        avatar_color: string
        avatar_url: string | null
        status: string
      }>
    >()
  if (error) throw new Error(`[finance] getExpenseEmployeeOptions: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.full_name,
    email: r.email,
    jobTitle: r.job_title,
    avatarColor: r.avatar_color,
    avatarUrl: r.avatar_url,
  }))
}

// Allocates the next REFxxxx reference. Naive scan of existing references —
// fine at our scale (single-tenant admin app, no concurrent writers expected).
// Migrate to a sequence if write volume ever grows.
export async function allocateExpenseReference(): Promise<string> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('finance_expenses')
    .select('reference')
    .order('reference', { ascending: false })
    .limit(1)
    .returns<Array<{ reference: string }>>()
  if (error) throw new Error(`[finance] allocateExpenseReference: ${error.message}`)
  const last = data?.[0]?.reference ?? 'REF0000'
  const n = Number.parseInt(last.replace(/^REF/i, ''), 10) || 0
  return `REF${String(n + 1).padStart(4, '0')}`
}
