'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Play,
  Plus,
  ReceiptText,
  Smartphone,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Avatar from '../../workforce/_components/Avatar'
import StatusPill from '../../workforce/_components/StatusPill'
import Kpi, { KpiRow } from '../../workforce/_components/Kpi'
import { formatTzs, formatTzsCompact } from '../../workforce/_lib/format'
import type { Employee, PayrollRun, PayrollStatus } from '../../workforce/_lib/data'
import { recomputePayrollRun, setPayrollStatus, startPayrollRun } from './actions'
import { isCurrentEmployee } from '../../workforce/_lib/types'

const STATUS_TONE: Record<PayrollStatus, 'gray' | 'amber' | 'blue' | 'green'> = {
  Draft: 'gray',
  'In review': 'amber',
  Approved: 'blue',
  Paid: 'green',
}

type EmpLine = {
  employee: Employee
  gross: number
  paye: number
  nssf: number
  net: number
}

function computeLines(employees: Employee[]): EmpLine[] {
  // PAYE ≈ 18% effective, NSSF 10% (split 10% employer/10% employee in TZ; we
  // model the employee half here). These are illustrative — the real engine
  // will live in `lib/payroll`.
  return employees
    .filter((e) => isCurrentEmployee(e.status))
    .map((e) => {
      const gross = e.salaryTzs
      const paye = Math.round(gross * 0.185)
      const nssf = Math.round(gross * 0.1)
      return { employee: e, gross, paye, nssf, net: gross - paye - nssf }
    })
}

function downloadPayrollCsv(run: PayrollRun, lines: EmpLine[]) {
  const header = ['Employee code', 'Name', 'Job title', 'Department', 'Gross (TZS)', 'PAYE (TZS)', 'NSSF (TZS)', 'Net (TZS)']
  const rows = lines.map((l) => [
    l.employee.employeeCode,
    l.employee.name,
    l.employee.jobTitle,
    l.employee.department,
    l.gross.toString(),
    l.paye.toString(),
    l.nssf.toString(),
    l.net.toString(),
  ])
  const totals = [
    'TOTAL',
    '',
    '',
    '',
    lines.reduce((s, l) => s + l.gross, 0).toString(),
    lines.reduce((s, l) => s + l.paye, 0).toString(),
    lines.reduce((s, l) => s + l.nssf, 0).toString(),
    lines.reduce((s, l) => s + l.net, 0).toString(),
  ]
  const csv = [header, ...rows, totals]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `opusfesta-payroll-${run.period.toLowerCase().replace(/\s+/g, '-')}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function PayrollClient({
  runs,
  employees,
}: {
  runs: PayrollRun[]
  employees: Employee[]
}) {
  const [selectedRunId, setSelectedRunId] = useState(runs[0]?.id ?? '')
  const selected = runs.find((r) => r.id === selectedRunId) ?? runs[0]
  const lines = useMemo(() => computeLines(employees), [employees])

  const ytdGross = runs.filter((r) => r.status === 'Paid').reduce((s, r) => s + r.grossTzs, 0)
  const ytdPaye = runs.filter((r) => r.status === 'Paid').reduce((s, r) => s + r.payeTzs, 0)

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi
          label="This month gross"
          value={formatTzsCompact(selected?.grossTzs ?? 0)}
          delta="+0.8%"
          hint="vs last month"
          icon={<Wallet className="h-4 w-4" />}
        />
        <Kpi
          label="Net to pay"
          value={formatTzsCompact(selected?.netTzs ?? 0)}
          hint={`${selected?.headcount ?? 0} employees`}
          icon={<ReceiptText className="h-4 w-4" />}
        />
        <Kpi label="YTD gross" value={formatTzsCompact(ytdGross)} hint="paid runs" icon={<FileText className="h-4 w-4" />} />
        <Kpi
          label="YTD PAYE remitted"
          value={formatTzsCompact(ytdPaye)}
          delta="On schedule"
          deltaTone="positive"
          icon={<BadgeCheck className="h-4 w-4" />}
        />
      </KpiRow>

      {selected && <CurrentRunCard run={selected} lines={lines} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Run history</h3>
              <StartRunButton />
            </div>
            <div className="mt-3 space-y-1">
              {runs.map((r) => {
                const active = r.id === selectedRunId
                return (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => setSelectedRunId(r.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                      active ? 'bg-[#F0DFF6]' : 'hover:bg-gray-50',
                    )}
                  >
                    <div>
                      <p className={cn('text-sm font-semibold', active ? 'text-[#5B2D8E]' : 'text-gray-900')}>{r.period}</p>
                      <p className="text-xs text-gray-500">{formatTzsCompact(r.netTzs)} net · {r.headcount} ppl</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill tone={STATUS_TONE[r.status]} label={r.status} />
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {selected && <PayrollBreakdown run={selected} lines={lines} />}
        </div>
      </div>
    </div>
  )
}

function CurrentRunCard({ run, lines }: { run: PayrollRun; lines: EmpLine[] }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function transitionTo(nextStatus: PayrollStatus) {
    setError(null)
    startTransition(async () => {
      try {
        await setPayrollStatus(run.id, nextStatus)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update payroll status.')
      }
    })
  }

  function recompute() {
    setError(null)
    startTransition(async () => {
      try {
        await recomputePayrollRun(run.id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not recompute totals.')
      }
    })
  }

  const primaryLabel: { label: string; next: PayrollStatus; icon: React.ReactNode } | null =
    run.status === 'Draft'
      ? { label: 'Move to review', next: 'In review', icon: <Play className="h-4 w-4" /> }
      : run.status === 'In review'
        ? { label: 'Approve run', next: 'Approved', icon: <Play className="h-4 w-4" /> }
        : run.status === 'Approved'
          ? { label: 'Release payouts', next: 'Paid', icon: <Smartphone className="h-4 w-4" /> }
          : null

  return (
    <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-[#F7EAFB] via-white to-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#7E5896]">Next pay run</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">{run.period}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {run.headcount} employees · Pay date{' '}
            <span className="font-semibold text-gray-900">
              {new Date(run.payDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={STATUS_TONE[run.status]} label={run.status} />
          {run.status !== 'Paid' && (
            <button
              type="button"
              onClick={recompute}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <BadgeCheck className="h-4 w-4" />
              Recompute totals
            </button>
          )}
          <button
            type="button"
            onClick={() => downloadPayrollCsv(run, lines)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Download report
          </button>
          {primaryLabel && (
            <button
              type="button"
              onClick={() => transitionTo(primaryLabel.next)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#C9A0DC] px-3 py-2 text-sm font-semibold text-white hover:bg-[#b97fd0] disabled:opacity-50"
            >
              {primaryLabel.icon}
              {primaryLabel.label}
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="mt-3 text-sm font-medium text-rose-700">{error}</p>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <RunStat label="Gross" value={formatTzs(run.grossTzs)} />
        <RunStat label="PAYE" value={formatTzs(run.payeTzs)} tone="rose" />
        <RunStat label="NSSF" value={formatTzs(run.nssfTzs)} tone="amber" />
        <RunStat label="Net to pay" value={formatTzs(run.netTzs)} tone="emerald" />
      </dl>

      <Timeline status={run.status} />
    </div>
  )
}

function RunStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'rose' | 'amber' | 'emerald'
}) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd
        className={cn(
          'mt-1 text-lg font-semibold tabular-nums',
          tone === 'rose' && 'text-rose-700',
          tone === 'amber' && 'text-amber-700',
          tone === 'emerald' && 'text-emerald-700',
          !tone && 'text-gray-900',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function Timeline({ status }: { status: PayrollStatus }) {
  const stages = ['Draft', 'In review', 'Approved', 'Paid'] as const
  const currentIdx = stages.indexOf(status)
  return (
    <ol className="mt-6 flex items-center gap-2">
      {stages.map((s, i) => {
        const reached = i <= currentIdx
        return (
          <li key={s} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold',
                reached ? 'bg-[#7E5896] text-white' : 'bg-gray-100 text-gray-400',
              )}
            >
              {reached ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn('text-xs font-semibold', reached ? 'text-gray-900' : 'text-gray-400')}>{s}</span>
            {i < stages.length - 1 && (
              <div className={cn('h-px flex-1', i < currentIdx ? 'bg-[#7E5896]' : 'bg-gray-200')} />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function PayrollBreakdown({ run, lines }: { run: PayrollRun; lines: EmpLine[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Line items — {run.period}</h3>
          <p className="text-xs text-gray-500">{lines.length} employees · TZS gross / deductions / net</p>
        </div>
        <button
          type="button"
          onClick={() => downloadPayrollCsv(run, lines)}
          className="text-xs font-semibold text-[#7E5896] hover:underline"
        >
          Export CSV
        </button>
      </div>
      <div
        role="row"
        className="grid min-w-[680px] grid-cols-[minmax(0,2fr)_120px_120px_120px_140px] items-center gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500"
      >
        <span>Employee</span>
        <span className="text-right">Gross</span>
        <span className="text-right">PAYE</span>
        <span className="text-right">NSSF</span>
        <span className="text-right">Net</span>
      </div>
      {lines.map((l) => (
        <div
          key={l.employee.id}
          role="row"
          className="grid min-w-[680px] grid-cols-[minmax(0,2fr)_120px_120px_120px_140px] items-center gap-3 border-b border-gray-100 px-5 py-3 last:border-b-0"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={l.employee.name} color={l.employee.avatarColor} src={l.employee.avatarUrl} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{l.employee.name}</p>
              <p className="truncate text-xs text-gray-500">{l.employee.jobTitle}</p>
            </div>
          </div>
          <div className="text-right text-sm font-medium tabular-nums text-gray-900">{formatTzs(l.gross)}</div>
          <div className="text-right text-sm tabular-nums text-rose-700">−{formatTzs(l.paye)}</div>
          <div className="text-right text-sm tabular-nums text-amber-700">−{formatTzs(l.nssf)}</div>
          <div className="text-right text-sm font-semibold tabular-nums text-emerald-700">{formatTzs(l.net)}</div>
        </div>
      ))}
    </div>
  )
}

function StartRunButton() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function go() {
    setError(null)
    startTransition(async () => {
      try {
        await startPayrollRun()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start a new run.')
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[11px] font-medium text-rose-700">{error}</span>}
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md bg-[#F0DFF6] px-2 py-1 text-xs font-semibold text-[#5B2D8E] hover:bg-[#E0BEEC] disabled:opacity-50"
      >
        <Plus className="h-3 w-3" />
        Start run
      </button>
    </div>
  )
}
