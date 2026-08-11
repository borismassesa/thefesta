'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  Download,
  Filter,
  LayoutGrid,
  List,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  Receipt,
  Search,
  Upload,
  Wallet,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Avatar from '../../workforce/_components/Avatar'
import StatusPill from '../../workforce/_components/StatusPill'
import Kpi, { KpiRow } from '../../workforce/_components/Kpi'
import { formatTzs, formatTzsCompact, formatDate } from '../../workforce/_lib/format'
import type { Expense, ExpenseCategory, ExpenseEmployeeOption, ExpenseStatus } from './queries'
import { createExpense, deleteExpense, setExpenseStatus } from './actions'

const STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: 'Draft',
  submitted: 'To Approve',
  approved: 'Approved',
  in_payment: 'In Payment',
  paid: 'Paid',
  posted: 'Posted',
  refused: 'Refused',
}

const STATUS_TONE: Record<ExpenseStatus, 'gray' | 'amber' | 'blue' | 'green' | 'rose' | 'purple'> = {
  draft: 'gray',
  submitted: 'amber',
  approved: 'blue',
  in_payment: 'purple',
  paid: 'green',
  posted: 'green',
  refused: 'rose',
}

type TabKey = 'all' | 'mine' | 'to-approve' | 'reporting'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: 'All Expenses' },
  { key: 'mine', label: 'My Expenses' },
  { key: 'to-approve', label: 'To Approve' },
  { key: 'reporting', label: 'Reporting' },
]

type ViewMode = 'list' | 'kanban'

export default function ExpensesClient({
  expenses,
  categories,
  employees,
}: {
  expenses: Expense[]
  categories: ExpenseCategory[]
  employees: ExpenseEmployeeOption[]
}) {
  const [tab, setTab] = useState<TabKey>('all')
  const [view, setView] = useState<ViewMode>('list')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | 'all'>('all')
  const [showNewExpense, setShowNewExpense] = useState(false)

  // Pipeline buckets across the lifecycle. "To submit" = drafts the user has
  // started but not sent; "Waiting Approval" = sent + still under review;
  // "Waiting Reimbursement" = approved or moving through payment.
  const pipeline = useMemo(() => {
    const toSubmit = expenses.filter((e) => e.status === 'draft')
    const waitingApproval = expenses.filter((e) => e.status === 'submitted')
    const waitingReimbursement = expenses.filter(
      (e) => e.status === 'approved' || e.status === 'in_payment',
    )
    const paid = expenses.filter((e) => e.status === 'paid' || e.status === 'posted')
    return {
      toSubmit,
      waitingApproval,
      waitingReimbursement,
      paid,
      sumOf(list: Expense[]) {
        return list.reduce((s, e) => s + e.totalTzs, 0)
      },
    }
  }, [expenses])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return expenses.filter((e) => {
      if (tab === 'to-approve' && e.status !== 'submitted') return false
      if (tab === 'mine' && false) return false // placeholder — current-user filter TBD
      if (statusFilter !== 'all' && e.status !== statusFilter) return false
      if (!q) return true
      return (
        e.reference.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.employee?.name.toLowerCase().includes(q) ?? false) ||
        (e.category?.name.toLowerCase().includes(q) ?? false)
      )
    })
  }, [expenses, query, statusFilter, tab])

  const reporting = useMemo(() => {
    const byCategory = new Map<string, { name: string; total: number; count: number }>()
    for (const e of expenses) {
      if (e.status === 'refused' || e.status === 'draft') continue
      const key = e.category?.id ?? 'uncategorized'
      const name = e.category?.name ?? 'Uncategorised'
      const entry = byCategory.get(key) ?? { name, total: 0, count: 0 }
      entry.total += e.totalTzs
      entry.count += 1
      byCategory.set(key, entry)
    }
    return Array.from(byCategory.values()).sort((a, b) => b.total - a.total)
  }, [expenses])

  const hasExpenses = expenses.length > 0

  return (
    <div className="space-y-6">
      {/* KPI strip ---------------------------------------------------------- */}
      <KpiRow>
        <Kpi
          label="To submit"
          value={formatTzsCompact(pipeline.sumOf(pipeline.toSubmit))}
          hint={`${pipeline.toSubmit.length} draft${pipeline.toSubmit.length === 1 ? '' : 's'}`}
          icon={<Receipt className="h-4 w-4" />}
        />
        <Kpi
          label="Waiting approval"
          value={formatTzsCompact(pipeline.sumOf(pipeline.waitingApproval))}
          hint={`${pipeline.waitingApproval.length} pending`}
          icon={<MessageSquare className="h-4 w-4" />}
          deltaTone="neutral"
        />
        <Kpi
          label="Waiting reimbursement"
          value={formatTzsCompact(pipeline.sumOf(pipeline.waitingReimbursement))}
          hint={`${pipeline.waitingReimbursement.length} in flight`}
          icon={<Wallet className="h-4 w-4" />}
        />
        <Kpi
          label="Reimbursed YTD"
          value={formatTzsCompact(pipeline.sumOf(pipeline.paid))}
          delta="paid"
          deltaTone="positive"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </KpiRow>

      {/* Pipeline progress strip ------------------------------------------- */}
      <PipelineStrip
        steps={[
          {
            label: 'To submit',
            count: pipeline.toSubmit.length,
            total: pipeline.sumOf(pipeline.toSubmit),
          },
          {
            label: 'Waiting approval',
            count: pipeline.waitingApproval.length,
            total: pipeline.sumOf(pipeline.waitingApproval),
          },
          {
            label: 'Waiting reimbursement',
            count: pipeline.waitingReimbursement.length,
            total: pipeline.sumOf(pipeline.waitingReimbursement),
          },
        ]}
      />

      {/* Toolbar ----------------------------------------------------------- */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button data-opus-button="control"
              type="button"
              onClick={() => setShowNewExpense(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6c4884]"
            >
              <Plus className="h-4 w-4" />
              New expense
            </button>
            <button data-opus-button="control"
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              title="Upload a receipt to start a draft (coming soon)"
            >
              <Upload className="h-4 w-4" />
              Upload receipt
            </button>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by reference, description, employee…"
                className="w-72 max-w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-sm placeholder:text-gray-400 focus:border-[#7E5896] focus:outline-none focus:ring-2 focus:ring-[#F0DFF6]"
              />
            </div>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ExpenseStatus | 'all')}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <option value="all">All statuses</option>
              {(Object.keys(STATUS_LABEL) as ExpenseStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>

            <button data-opus-button="control"
              type="button"
              onClick={() => {
                setStatusFilter('all')
                setQuery('')
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Filter className="h-4 w-4" />
              Reset
            </button>

            {/* View switcher */}
            <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
              <button data-opus-button="control"
                type="button"
                onClick={() => setView('list')}
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-md',
                  view === 'list' ? 'bg-[#F0DFF6] text-[#5B2D8E]' : 'text-gray-500 hover:text-gray-700',
                )}
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
              <button data-opus-button="control"
                type="button"
                onClick={() => setView('kanban')}
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-md',
                  view === 'kanban' ? 'bg-[#F0DFF6] text-[#5B2D8E]' : 'text-gray-500 hover:text-gray-700',
                )}
                title="Kanban view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs --------------------------------------------------------- */}
        <nav className="mt-4 flex flex-wrap items-center gap-1 border-t border-gray-100 pt-3">
          {TABS.map((t) => {
            const active = tab === t.key
            return (
              <button data-opus-button="secondary" data-opus-button-size="small"
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                  active ? 'bg-[#F0DFF6] text-[#5B2D8E]' : 'text-gray-600 hover:bg-gray-100',
                )}
              >
                {t.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Main content ------------------------------------------------------ */}
      {tab === 'reporting' ? (
        <ReportingPanel byCategory={reporting} totalExpenses={expenses.length} />
      ) : !hasExpenses ? (
        <EmptyState onNew={() => setShowNewExpense(true)} />
      ) : view === 'list' ? (
        <ExpensesTable expenses={filtered} />
      ) : (
        <ExpensesKanban expenses={filtered} />
      )}

      <EmailTip />

      {showNewExpense && (
        <NewExpenseDrawer
          categories={categories}
          employees={employees}
          onClose={() => setShowNewExpense(false)}
        />
      )}
    </div>
  )
}

// =============================================================================
// Pipeline progress strip — three connected stages, mirrors the Odoo header but
// rebuilt with our card aesthetic.
// =============================================================================

function PipelineStrip({
  steps,
}: {
  steps: Array<{ label: string; count: number; total: number }>
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-gradient-to-br from-[#F7EAFB] via-white to-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex min-w-[640px] items-center gap-3">
        {steps.map((step, i) => (
          <div key={step.label} className="flex flex-1 items-center gap-3">
            <div
              className={cn(
                'flex-1 rounded-xl border px-4 py-3',
                step.count > 0
                  ? 'border-[#E0BEEC] bg-white'
                  : 'border-gray-100 bg-white/60',
              )}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#7E5896]">
                {step.label}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">
                {formatTzs(step.total)}
              </p>
              <p className="text-[11px] text-gray-500">
                {step.count} expense{step.count === 1 ? '' : 's'}
              </p>
            </div>
            {i < steps.length - 1 && <ChevronRight className="h-5 w-5 shrink-0 text-[#C9A0DC]" />}
          </div>
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// List view — densely-packed table with row actions
// =============================================================================

function ExpensesTable({ expenses }: { expenses: Expense[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Expenses</h3>
          <p className="text-xs text-gray-500">{expenses.length} record{expenses.length === 1 ? '' : 's'}</p>
        </div>
        <button data-opus-button="control"
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>
      </div>

      <div data-opus-table-header
        role="row"
        className="hidden min-w-[1000px] grid-cols-[28px_minmax(0,1.6fr)_minmax(0,2fr)_110px_minmax(0,1fr)_110px_70px_140px_120px_44px] items-center gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500 lg:grid"
      >
        <span />
        <span>Employee</span>
        <span>Description</span>
        <span>Date</span>
        <span>Category</span>
        <span>Paid by</span>
        <span className="text-center">Activities</span>
        <span>Analytic</span>
        <span className="text-right">Total</span>
        <span />
      </div>

      {expenses.length === 0 && (
        <div className="px-5 py-10 text-center text-sm text-gray-500">
          No expenses match the current filters.
        </div>
      )}

      {expenses.map((e) => (
        <ExpenseRow key={e.id} expense={e} />
      ))}
    </div>
  )
}

function ExpenseRow({ expense }: { expense: Expense }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showActions, setShowActions] = useState(false)

  function transitionTo(next: ExpenseStatus, reason?: string) {
    setError(null)
    startTransition(async () => {
      try {
        await setExpenseStatus(expense.id, next, reason)
        setShowActions(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update status.')
      }
    })
  }

  function remove() {
    setError(null)
    startTransition(async () => {
      try {
        await deleteExpense(expense.id)
        setShowActions(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not delete.')
      }
    })
  }

  return (
    <div data-opus-table-row
      role="row"
      className={cn(
        'grid min-w-[1000px] grid-cols-[28px_minmax(0,1.6fr)_minmax(0,2fr)_110px_minmax(0,1fr)_110px_70px_140px_120px_44px] items-center gap-3 border-b border-gray-100 px-5 py-3 text-sm last:border-b-0 hover:bg-gray-50/40',
        pending && 'opacity-60',
      )}
    >
      <span className="text-[11px] font-mono text-gray-400">{expense.reference.replace('REF', '#')}</span>

      <div className="flex min-w-0 items-center gap-2.5">
        {expense.employee ? (
          <>
            <Avatar
              name={expense.employee.name}
              color={expense.employee.avatarColor}
              src={expense.employee.avatarUrl}
              size="sm"
            />
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-900">{expense.employee.name}</p>
              <p className="truncate text-[11px] text-gray-500">{expense.employee.jobTitle}</p>
            </div>
          </>
        ) : (
          <span className="text-xs italic text-gray-400">Unassigned</span>
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate text-gray-900">{expense.description}</p>
        {expense.notes && <p className="truncate text-[11px] text-gray-500">{expense.notes}</p>}
        {error && <p className="mt-1 text-[11px] font-semibold text-rose-700">{error}</p>}
      </div>

      <span className="text-gray-600">{formatDate(expense.expenseDate)}</span>

      <span className="truncate text-gray-700">
        {expense.category?.name ?? <span className="italic text-gray-400">—</span>}
      </span>

      <span className="capitalize text-gray-600">{expense.paidBy}</span>

      <div className="flex items-center justify-center gap-1 text-[11px] text-gray-500">
        {expense.activitiesCount > 0 ? (
          <>
            <Paperclip className="h-3 w-3" />
            {expense.activitiesCount}
          </>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </div>

      <span className="truncate text-[11px] text-gray-500">
        {expense.analyticDistribution ?? '—'}
      </span>

      <div className="flex flex-col items-end gap-1">
        <span className="font-semibold tabular-nums text-gray-900">{formatTzs(expense.totalTzs)}</span>
        <StatusPill tone={STATUS_TONE[expense.status]} label={STATUS_LABEL[expense.status]} />
      </div>

      <div className="relative flex justify-end">
        <button data-opus-button="control"
          type="button"
          onClick={() => setShowActions((s) => !s)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Row actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {showActions && (
          <RowActionsMenu
            status={expense.status}
            pending={pending}
            onTransition={(next, reason) => transitionTo(next, reason)}
            onDelete={remove}
            onDismiss={() => setShowActions(false)}
          />
        )}
      </div>
    </div>
  )
}

function RowActionsMenu({
  status,
  pending,
  onTransition,
  onDelete,
  onDismiss,
}: {
  status: ExpenseStatus
  pending: boolean
  onTransition: (next: ExpenseStatus, reason?: string) => void
  onDelete: () => void
  onDismiss: () => void
}) {
  return (
    <div
      className="absolute right-0 top-8 z-20 w-48 rounded-xl border border-gray-100 bg-white p-1 shadow-lg"
      onMouseLeave={onDismiss}
    >
      {status === 'draft' && (
        <ActionButton onClick={() => onTransition('submitted')} disabled={pending}>
          Submit for approval
        </ActionButton>
      )}
      {status === 'submitted' && (
        <>
          <ActionButton onClick={() => onTransition('approved')} disabled={pending}>
            Approve
          </ActionButton>
          <ActionButton
            tone="rose"
            onClick={() => {
              const reason = window.prompt('Reason for refusal?') ?? ''
              if (reason.trim()) onTransition('refused', reason)
            }}
            disabled={pending}
          >
            Refuse
          </ActionButton>
        </>
      )}
      {status === 'approved' && (
        <ActionButton onClick={() => onTransition('in_payment')} disabled={pending}>
          Move to payment
        </ActionButton>
      )}
      {status === 'in_payment' && (
        <ActionButton onClick={() => onTransition('paid')} disabled={pending}>
          Mark paid
        </ActionButton>
      )}
      {status === 'paid' && (
        <ActionButton onClick={() => onTransition('posted')} disabled={pending}>
          Post to ledger
        </ActionButton>
      )}
      {(status === 'draft' || status === 'refused') && (
        <ActionButton tone="rose" onClick={onDelete} disabled={pending}>
          Delete
        </ActionButton>
      )}
    </div>
  )
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone = 'neutral',
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  tone?: 'neutral' | 'rose'
}) {
  return (
    <button data-opus-button="danger" data-opus-button-size="small"
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'block w-full rounded-md px-3 py-1.5 text-left text-xs font-semibold transition-colors',
        tone === 'rose'
          ? 'text-rose-700 hover:bg-rose-50'
          : 'text-gray-700 hover:bg-gray-100',
        disabled && 'opacity-50',
      )}
    >
      {children}
    </button>
  )
}

// =============================================================================
// Kanban view — columns per lifecycle stage
// =============================================================================

function ExpensesKanban({ expenses }: { expenses: Expense[] }) {
  const stages: ExpenseStatus[] = ['draft', 'submitted', 'approved', 'in_payment', 'paid']
  const grouped = useMemo(() => {
    const map = new Map<ExpenseStatus, Expense[]>()
    for (const s of stages) map.set(s, [])
    for (const e of expenses) {
      if (map.has(e.status)) map.get(e.status)!.push(e)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses])

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      {stages.map((s) => {
        const list = grouped.get(s) ?? []
        const total = list.reduce((sum, e) => sum + e.totalTzs, 0)
        return (
          <div
            key={s}
            className="rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]"
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <div className="flex items-center gap-2">
                <StatusPill tone={STATUS_TONE[s]} label={STATUS_LABEL[s]} />
                <span className="text-[11px] text-gray-400">{list.length}</span>
              </div>
              <span className="text-[11px] font-semibold tabular-nums text-gray-700">
                {formatTzsCompact(total)}
              </span>
            </div>
            <div className="space-y-2">
              {list.length === 0 && (
                <p className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-[11px] text-gray-400">
                  Nothing here.
                </p>
              )}
              {list.map((e) => (
                <div
                  key={e.id}
                  className="rounded-xl border border-gray-100 bg-white p-3 transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-gray-900">{e.description}</p>
                    <span className="shrink-0 text-[11px] font-mono text-gray-400">
                      {e.reference.replace('REF', '#')}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {e.category?.name ?? 'Uncategorised'} · {formatDate(e.expenseDate)}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    {e.employee ? (
                      <div className="flex items-center gap-1.5">
                        <Avatar
                          name={e.employee.name}
                          color={e.employee.avatarColor}
                          src={e.employee.avatarUrl}
                          size="sm"
                        />
                        <span className="text-[11px] text-gray-700">{e.employee.name}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] italic text-gray-400">Unassigned</span>
                    )}
                    <span className="text-xs font-semibold tabular-nums text-gray-900">
                      {formatTzs(e.totalTzs)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// =============================================================================
// Reporting tab — quick breakdown by category
// =============================================================================

function ReportingPanel({
  byCategory,
  totalExpenses,
}: {
  byCategory: Array<{ name: string; total: number; count: number }>
  totalExpenses: number
}) {
  const max = byCategory[0]?.total ?? 0
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Spend by category</h3>
          <p className="text-xs text-gray-500">
            Across {totalExpenses} expense{totalExpenses === 1 ? '' : 's'} (excludes drafts and refused)
          </p>
        </div>
        <button data-opus-button="control"
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {byCategory.length === 0 && (
          <p className="rounded-lg border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500">
            No reportable expenses yet.
          </p>
        )}
        {byCategory.map((c) => {
          const pct = max ? Math.round((c.total / max) * 100) : 0
          return (
            <div key={c.name}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-800">{c.name}</span>
                <span className="font-medium tabular-nums text-gray-700">
                  {formatTzs(c.total)} · {c.count} record{c.count === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-[#C9A0DC]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// =============================================================================
// Empty state — adapted from the Odoo screenshot but in our visual language
// =============================================================================

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F0DFF6] text-[#7E5896]">
        <Upload className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-gray-900">
        Upload or drop an expense receipt
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        We&apos;ll read the merchant, amount and date, then open a draft for you to review.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button data-opus-button="control"
          type="button"
          onClick={onNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6c4884]"
        >
          <Plus className="h-4 w-4" />
          Create a new expense
        </button>
        <span className="text-xs text-gray-400">or</span>
        <button data-opus-button="control"
          type="button"
          className="text-sm font-semibold text-[#7E5896] hover:underline"
        >
          Try a sample receipt
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// Email tip — restyled, brand-locked variant of the Odoo footer
// =============================================================================

function EmailTip() {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-gray-50/60 px-4 py-3 text-xs text-gray-600">
      <Mail className="h-3.5 w-3.5 text-gray-400" />
      <span>
        Tip: forward receipts to{' '}
        <span className="font-mono font-semibold text-gray-900">expenses@opusfesta.com</span>
        {' '}and we&apos;ll draft them for you.
      </span>
    </div>
  )
}

// =============================================================================
// New expense drawer — right-hand slide-over with the form
// =============================================================================

function NewExpenseDrawer({
  categories,
  employees,
  onClose,
}: {
  categories: ExpenseCategory[]
  employees: ExpenseEmployeeOption[]
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [employeeId, setEmployeeId] = useState<string>(employees[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? '')
  const [paidBy, setPaidBy] = useState<'employee' | 'company'>('employee')
  const [total, setTotal] = useState('')
  const [analytic, setAnalytic] = useState('')
  const [notes, setNotes] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await createExpense({
          employeeId: employeeId || null,
          description,
          expenseDate,
          categoryId: categoryId || null,
          paidBy,
          totalTzs: Number(total) || 0,
          notes,
          analyticDistribution: analytic,
        })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not create expense.')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="New expense">
      <button data-opus-button="control"
        type="button"
        aria-label="Close"
        className="flex-1 bg-gray-900/30"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="flex h-full w-full max-w-md flex-col border-l border-gray-100 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">New expense</h2>
            <p className="text-xs text-gray-500">
              Drafts can be edited until they&apos;re submitted for approval.
            </p>
          </div>
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <FormField label="Employee">
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">— Unassigned —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} · {emp.jobTitle}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Description" required>
            <input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Client lunch — DAR Hilton"
              className={INPUT_CLASS}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Expense date" required>
              <input
                required
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Total (TZS)" required>
              <input
                required
                type="number"
                inputMode="numeric"
                min={0}
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="0"
                className={cn(INPUT_CLASS, 'text-right tabular-nums')}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Category">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">— None —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Paid by">
              <select
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value as 'employee' | 'company')}
                className={INPUT_CLASS}
              >
                <option value="employee">Employee (to reimburse)</option>
                <option value="company">Company card</option>
              </select>
            </FormField>
          </div>

          <FormField label="Analytic distribution">
            <input
              value={analytic}
              onChange={(e) => setAnalytic(e.target.value)}
              placeholder="e.g. Project: Akili Wedding 2026"
              className={INPUT_CLASS}
            />
          </FormField>

          <FormField label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything finance should know…"
              className={INPUT_CLASS}
            />
          </FormField>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}
        </div>

        <footer className="border-t border-gray-100 px-5 py-3">
          <div className="flex items-center justify-end gap-2">
            <button data-opus-button="control"
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button data-opus-button="primary" data-opus-button-size="medium"
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6c4884] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {pending ? 'Saving…' : 'Save as draft'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  )
}

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7E5896] focus:outline-none focus:ring-2 focus:ring-[#F0DFF6]'

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </span>
      {children}
    </label>
  )
}
