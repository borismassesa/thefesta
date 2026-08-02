import { hasAnyPermission, hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { logGrowthDbError } from '../_lib/action-utils'
import { getGrowthEmployeeOptions } from '../_lib/queries'
import VendorOutreachClient, { type OutreachLogEntry, type RosterRow } from './VendorOutreachClient'

export const dynamic = 'force-dynamic'

const MEETING_STAGES = ['4. Meeting Held', '5. Proposal Sent', '6. Signed Up']
const WON_OUTCOME = 'Won — Signed Up'

type TargetRow = {
  id: string
  staff_name: string
  department: string
  target_outreach: number
  target_meetings: number
  target_signed: number
  sort_order: number
}

type LogRow = {
  id: string
  log_date: string
  staff_name: string
  vendor_name: string
  category: string
  contact_method: string
  stage: string
  next_action: string
  next_action_date: string | null
  travel_cost_tzs: number | string | null
  outcome: string
  notes: string
  created_by_employee_id: string | null
}

const MONTH_RE = /^\d{4}-\d{2}-01$/

function currentMonthStart(): string {
  // eslint-disable-next-line react-hooks/purity -- server component, reflects request time
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

export default async function VendorOutreachPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const canView = await hasAnyPermission(['growth.write', 'growth.admin'])
  if (!canView) {
    throw new Error("You don't have permission to view Vendor Outreach.")
  }
  const canWrite = await hasPermission('growth.write')
  const canAdmin = await hasPermission('growth.admin')

  const params = await searchParams
  const requestedMonth = firstParam(params?.month)
  const monthStart = requestedMonth && MONTH_RE.test(requestedMonth) ? requestedMonth : currentMonthStart()
  const [monthYear, monthNum] = monthStart.split('-').map(Number)
  const nextMonthStart = `${monthNum === 12 ? monthYear + 1 : monthYear}-${String(monthNum === 12 ? 1 : monthNum + 1).padStart(2, '0')}-01`
  const supabase = createSupabaseAdminClient()

  const [{ data: targetRows, error: targetsError }, { data: monthLogRows, error: monthLogError }, { data: fullLogRows, error: fullLogError }, employeeOptions] =
    await Promise.all([
      supabase
        .from('growth_vendor_outreach_targets')
        .select('id, staff_name, department, target_outreach, target_meetings, target_signed, sort_order')
        .order('sort_order', { ascending: true })
        .returns<TargetRow[]>(),
      supabase
        .from('growth_vendor_outreach_log')
        .select('staff_name, stage, outcome')
        .gte('log_date', monthStart)
        .lt('log_date', nextMonthStart)
        .returns<{ staff_name: string; stage: string; outcome: string }[]>(),
      supabase
        .from('growth_vendor_outreach_log')
        .select(
          'id, log_date, staff_name, vendor_name, category, contact_method, stage, next_action, next_action_date, travel_cost_tzs, outcome, notes, created_by_employee_id',
        )
        .order('log_date', { ascending: false })
        .limit(300)
        .returns<LogRow[]>(),
      getGrowthEmployeeOptions(),
    ])

  if (targetsError) {
    logGrowthDbError('growth.vendor_outreach_targets.select', targetsError)
    throw new Error('Could not load Growth vendor outreach targets.')
  }
  if (monthLogError) {
    logGrowthDbError('growth.vendor_outreach_log.month_select', monthLogError)
    throw new Error('Could not load Growth vendor outreach month log.')
  }
  if (fullLogError) {
    logGrowthDbError('growth.vendor_outreach_log.full_select', fullLogError)
    throw new Error('Could not load Growth vendor outreach log.')
  }

  const doneByStaff = new Map<string, { outreach: number; meetings: number; signed: number }>()
  for (const row of monthLogRows ?? []) {
    const entry = doneByStaff.get(row.staff_name) ?? { outreach: 0, meetings: 0, signed: 0 }
    entry.outreach += 1
    if (MEETING_STAGES.includes(row.stage)) entry.meetings += 1
    if (row.outcome === WON_OUTCOME) entry.signed += 1
    doneByStaff.set(row.staff_name, entry)
  }

  const roster: RosterRow[] = (targetRows ?? []).map((r) => {
    const done = doneByStaff.get(r.staff_name) ?? { outreach: 0, meetings: 0, signed: 0 }
    return {
      id: r.id,
      staffName: r.staff_name,
      department: r.department,
      targetOutreach: r.target_outreach,
      targetMeetings: r.target_meetings,
      targetSigned: r.target_signed,
      doneOutreach: done.outreach,
      doneMeetings: done.meetings,
      doneSigned: done.signed,
    }
  })

  const log: OutreachLogEntry[] = (fullLogRows ?? []).map((r) => ({
    id: r.id,
    logDate: r.log_date,
    staffName: r.staff_name,
    vendorName: r.vendor_name,
    category: r.category,
    contactMethod: r.contact_method,
    stage: r.stage,
    nextAction: r.next_action,
    nextActionDate: r.next_action_date,
    travelCostTzs: r.travel_cost_tzs === null ? null : Number(r.travel_cost_tzs),
    outcome: r.outcome,
    notes: r.notes,
  }))

  return (
    <VendorOutreachClient
      roster={roster}
      log={log}
      employeeNames={employeeOptions.map((e) => e.name)}
      canWrite={canWrite}
      canAdmin={canAdmin}
      month={monthStart}
    />
  )
}
