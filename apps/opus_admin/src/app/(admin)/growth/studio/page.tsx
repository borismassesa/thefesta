import { hasAnyPermission, hasPermission } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { logGrowthDbError } from '../_lib/action-utils'
import { getGrowthEmployeeOptions, getKpiActuals, getKpiTargets } from '../_lib/queries'
import StudioClient, { type StudioBooking } from './StudioClient'

export const dynamic = 'force-dynamic'

type BookingRow = {
  id: string
  booking_date: string
  session_date: string | null
  customer_name: string
  service: string
  photographer_name: string | null
  videographer_name: string | null
  revenue_tzs: number
  direct_cost_tzs: number
  delivery_date: string | null
  satisfaction: number | null
  notes: string | null
}

export default async function StudioPerformancePage() {
  const canView = await hasAnyPermission(['growth.write', 'growth.admin'])
  if (!canView) throw new Error("You don't have permission to view the Studio Performance tracker.")
  const canWrite = await hasPermission('growth.write')
  const canAdmin = await hasPermission('growth.admin')

  const targets = await getKpiTargets('studio')
  const actuals = await getKpiActuals(targets.map((t) => t.id))

  const supabase = createSupabaseAdminClient()
  const [{ data: bookingRows, error }, employeeOptions] = await Promise.all([
    supabase
      .from('growth_studio_bookings_log')
      .select(
        'id, booking_date, session_date, customer_name, service, photographer_name, videographer_name, revenue_tzs, direct_cost_tzs, delivery_date, satisfaction, notes',
      )
      .order('booking_date', { ascending: false })
      .limit(300)
      .returns<BookingRow[]>(),
    getGrowthEmployeeOptions(),
  ])
  if (error) {
    logGrowthDbError('growth.studio_bookings.select', error)
    throw new Error('Could not load Growth Tracker studio bookings.')
  }

  const bookings: StudioBooking[] = (bookingRows ?? []).map((r) => {
    const revenue = Number(r.revenue_tzs)
    const directCost = Number(r.direct_cost_tzs)
    const marginTzs = revenue - directCost
    const marginPct = revenue > 0 ? marginTzs / revenue : null
    return {
      id: r.id,
      bookingDate: r.booking_date,
      sessionDate: r.session_date,
      customerName: r.customer_name,
      service: r.service,
      photographerName: r.photographer_name,
      videographerName: r.videographer_name,
      revenueTzs: revenue,
      directCostTzs: directCost,
      deliveryDate: r.delivery_date,
      satisfaction: r.satisfaction,
      notes: r.notes,
      marginTzs,
      marginPct,
    }
  })

  const employeeNames = employeeOptions.map((e) => e.name)

  // eslint-disable-next-line react-hooks/purity -- server component, reflects request time
  const currentYear = new Date().getFullYear()

  return (
    <StudioClient
      targets={targets}
      actuals={actuals}
      initialYear={currentYear}
      canWrite={canWrite}
      canAdmin={canAdmin}
      bookings={bookings}
      employeeNames={employeeNames}
    />
  )
}
