import 'server-only'

// Who is acting, resolved from the Clerk session and the employee roster.
//
// Extracted from actions.ts because attachment-actions.ts needs the same
// answer. It cannot simply import it from there: actions.ts is a 'use server'
// module, so every export is a callable server action, and exporting an
// identity resolver from it would publish "tell me who I am" as an endpoint.
// A plain server-only module has no such surface.

import { auth, currentUser } from '@clerk/nextjs/server'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getCallerEmail } from '@/lib/admin-auth'
import { logDbError } from '@/lib/log-safe'
import type { ApprovalActor } from './types'

export type ResolvedActor = ApprovalActor & {
  clerkId: string | null
  // workforce_employees.id. Null for a signed-in user with no employee row:
  // they can still act, they just have no bell inbox and no stable id to
  // attribute the audit row to beyond their Clerk subject.
  employeeId: string | null
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'YOU'
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
}

// `.eq()` is case-sensitive, so a lowercased needle misses an employee stored
// as `Timothy@Gmail.com` and silently drops their stable identity from the
// audit trail. `ilike` matches regardless. The address is charset-checked
// first because it is interpolated into the filter expression.
export async function lookupEmployeeId(email: string): Promise<string | null> {
  const needle = email.trim().toLowerCase()
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(needle)) return null

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_employees')
    .select('id')
    .ilike('email', needle)
    .maybeSingle<{ id: string }>()
  if (error) {
    logDbError('workforce_employee.lookup_actor', error)
    return null
  }
  return data?.id ?? null
}

export async function resolveApprovalActor(): Promise<ResolvedActor> {
  const { userId } = await auth()
  const user = await currentUser()
  const email = (await getCallerEmail()) ?? ''
  const name = user?.fullName?.trim() || user?.firstName?.trim() || email || 'You'
  return {
    name,
    email,
    initials: initialsFromName(name),
    color: '#10B981',
    clerkId: userId ?? null,
    employeeId: await lookupEmployeeId(email),
  }
}
