import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import { isCronAuthorized } from '@/lib/cron-auth'

// Leave maintenance. Three idempotent jobs, one endpoint.
//
//   1. ACCRUAL for monthly-accrual policies. Guarded by a per-month check, so
//      running it twice in a day grants one twelfth, not two.
//   2. EXPIRY of carryover past its policy window, recorded as a transaction so
//      the balance dropping is explainable.
//   3. AVAILABILITY rebuilt on a rolling window, because a new public holiday
//      or a changed schedule affects days no leave request touched.
//
// Protected by a shared secret, same as the other cron endpoints.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** How far ahead to keep the availability calendar warm. */
const AVAILABILITY_HORIZON_DAYS = 60

export async function POST(request: NextRequest) {
  const secret = process.env.LEAVE_CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!isCronAuthorized(auth, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ error: 'Supabase admin env missing' }, { status: 503 })
  }

  const supabase = createSupabaseAdminClient()
  const failedJobs: string[] = []

  const { data: accrued, error: accrualError } = await supabase.rpc('leave_accrue_monthly', {
    p_date: null,
  })
  if (accrualError) {
    logDbError('leave.accrual', accrualError)
    failedJobs.push('accrue_monthly')
  }

  const { data: expired, error: expiryError } = await supabase.rpc('leave_expire_carryover', {
    p_date: null,
  })
  if (expiryError) {
    logDbError('leave.expiry', expiryError)
    failedJobs.push('expire_carryover')
  }

  const refreshed = await refreshAvailability(supabase)

  return NextResponse.json(
    {
      ok: failedJobs.length === 0,
      accrued: typeof accrued === 'number' ? accrued : 0,
      expired: typeof expired === 'number' ? expired : 0,
      availabilityRefreshed: refreshed,
      failedJobs,
    },
    { status: failedJobs.length === 0 ? 200 : 500 },
  )
}

async function refreshAvailability(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const horizon = new Date(Date.now() + AVAILABILITY_HORIZON_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10)

  const { data: employees, error } = await supabase
    .from('workforce_employees')
    .select('id')
    .in('status', ['Active', 'On Leave', 'Onboarding'])
    .returns<{ id: string }[]>()
  if (error) {
    logDbError('leave.availability_targets', error)
    return 0
  }

  let refreshed = 0
  for (const employee of employees ?? []) {
    const { error: refreshError } = await supabase.rpc('leave_refresh_availability', {
      p_employee_id: employee.id,
      p_from: today,
      p_to: horizon,
    })
    if (refreshError) {
      logDbError('leave.availability_refresh', refreshError, { employeeId: employee.id })
      continue
    }
    refreshed += 1
  }
  return refreshed
}
