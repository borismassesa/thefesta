import { hasAnyPermission, hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { logGrowthDbError } from '../_lib/action-utils'
import { getGrowthEmployeeOptions, getKpiActuals, getKpiTargets } from '../_lib/queries'
import { resolveTrackerMonth, yearFromMonthKey } from '../_lib/period'
import MarketingClient from './MarketingClient'
import type { Campaign } from './MarketingClient'

export const dynamic = 'force-dynamic'

type CampaignRow = {
  id: string
  start_date: string
  end_date: string | null
  campaign_name: string
  channel: string
  owner_name: string
  spend_tzs: number
  reach: number
  leads: number
  bookings: number
  revenue_tzs: number
  notes: string | null
}

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
}

export default async function MarketingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const canView = await hasAnyPermission(['growth.write', 'growth.admin'])
  if (!canView) throw new Error("You don't have permission to view the Growth Tracker.")
  const canWrite = await hasPermission('growth.write')
  const canAdmin = await hasPermission('growth.admin')

  const params = await searchParams
  const month = resolveTrackerMonth(firstParam(params?.month))

  const targets = await getKpiTargets('sales_marketing')
  const actuals = await getKpiActuals(targets.map((t) => t.id))

  const supabase = createSupabaseAdminClient()
  const [{ data: campaignRows, error }, employeeOptions] = await Promise.all([
    supabase
      .from('growth_marketing_campaigns')
      .select(
        'id, start_date, end_date, campaign_name, channel, owner_name, spend_tzs, reach, leads, bookings, revenue_tzs, notes',
      )
      .order('start_date', { ascending: false })
      .limit(300)
      .returns<CampaignRow[]>(),
    getGrowthEmployeeOptions(),
  ])
  if (error) {
    logGrowthDbError('growth.marketing_campaigns.select', error)
    throw new Error('Could not load Growth Tracker campaigns.')
  }

  const campaigns: Campaign[] = (campaignRows ?? []).map((r) => ({
    id: r.id,
    startDate: r.start_date,
    endDate: r.end_date,
    campaignName: r.campaign_name,
    channel: r.channel,
    ownerName: r.owner_name,
    spendTzs: r.spend_tzs,
    reach: r.reach,
    leads: r.leads,
    bookings: r.bookings,
    revenueTzs: r.revenue_tzs,
    notes: r.notes ?? '',
    roiPct: r.spend_tzs > 0 ? (r.revenue_tzs - r.spend_tzs) / r.spend_tzs : null,
  }))

  const employeeNames = employeeOptions.map((e) => e.name)

  return (
    <MarketingClient
      targets={targets}
      actuals={actuals}
      initialYear={yearFromMonthKey(month)}
      month={month}
      canWrite={canWrite}
      canAdmin={canAdmin}
      campaigns={campaigns}
      employeeNames={employeeNames}
    />
  )
}
