'use server'

import { auth, currentUser } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCurrentEmployee } from '../../workforce/_lib/queries'

// Self-service punch — the caller must be signed in via Clerk and have
// a workforce_employees row linked (by clerk_user_id or email). We don't
// gate on a workforce permission here: any signed-in employee with a
// dashboard account can clock themselves in or out.
async function punch(type: 'in' | 'out'): Promise<{ ok: true; punchAt: string }> {
  const { userId } = await auth()
  if (!userId) throw new Error('You must be signed in to clock in or out.')

  const user = await currentUser()
  const email =
    user?.primaryEmailAddress?.emailAddress?.toLowerCase() ??
    user?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ??
    null
  const employee = await getCurrentEmployee(userId, email)
  if (!employee) {
    throw new Error(
      "We couldn't find a workforce profile linked to your account. Ask People Ops to set one up.",
    )
  }

  const h = await headers()
  // x-forwarded-for is set by Vercel / most reverse proxies. The first
  // entry is the original client IP; further entries are intermediate
  // proxies. Fall back to x-real-ip for non-Vercel environments.
  const xff = h.get('x-forwarded-for')
  const ip = xff?.split(',')[0]?.trim() || h.get('x-real-ip') || null
  const userAgent = h.get('user-agent')?.slice(0, 500) ?? null

  const supabase = createSupabaseAdminClient()
  const punchAt = new Date().toISOString()
  const { error } = await supabase.from('workforce_time_punches').insert({
    employee_id: employee.id,
    punch_at: punchAt,
    punch_type: type,
    source: 'web',
    ip_address: ip,
    user_agent: userAgent,
    created_by_clerk_id: userId,
  })
  if (error) {
    // The alternation trigger raises check_violation when an employee
    // tries to clock in twice in a row (or out twice). Translate that
    // into a friendlier message — the original error mentions internal
    // table state ("previous punch was already in") which is fine for
    // an admin but confusing to an employee.
    if (error.code === '23514' || /must alternate|first punch/i.test(error.message)) {
      throw new Error(
        type === 'in'
          ? "You're already clocked in. Tap Clock out first if you want to switch."
          : "You're not currently clocked in. Tap Clock in to start a shift.",
      )
    }
    throw error
  }

  revalidatePath('/workspace/time-clock')
  revalidatePath('/workforce/timesheets')
  return { ok: true, punchAt }
}

export async function clockIn() {
  return punch('in')
}

export async function clockOut() {
  return punch('out')
}
