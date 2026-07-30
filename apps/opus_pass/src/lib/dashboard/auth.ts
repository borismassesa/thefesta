import 'server-only'
import { randomUUID } from 'node:crypto'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { auth, currentUser } from '@clerk/nextjs/server'
import { createDashboardClient } from './supabase'
import { getStaffSession } from './staff-session'

export interface DashboardUser {
  /** public.users.id used to scope every dashboard query */
  id: string
  /** Clerk identity id (auth.userId). Empty for a staff session, which has no
   *  Clerk identity of its own on this instance. */
  clerkId: string
  email: string
  name: string | null
  /** Set when an OpusFesta admin is acting as this couple. Read by the layout
   *  to render the staff banner. */
  staffAdminEmail?: string
}

/**
 * Resolve the couple an OpusFesta admin is acting for, when a valid staff
 * session cookie is present (see ./staff-session.ts). This is the ONE place
 * impersonation enters the dashboard: everything downstream scopes off
 * `DashboardUser.id`, so nothing else needs to know.
 *
 * Returns null when there is no staff session, when the token no longer
 * verifies, or when the account it names has since been deleted — every case
 * falls through to the normal Clerk path below.
 */
async function loadStaffUser(): Promise<DashboardUser | null> {
  const session = await getStaffSession()
  if (!session) return null

  const supabase = createDashboardClient()
  const [{ data }, { data: workspace }, { data: storefronts }] = await Promise.all([
    supabase
      .from('users')
      .select('id, clerk_id, email, name, role')
      .eq('id', session.userId)
      .maybeSingle<{
        id: string
        clerk_id: string | null
        email: string | null
        name: string | null
        role: string | null
      }>(),
    supabase
      .from('couple_accounts')
      .select('user_id')
      .eq('user_id', session.userId)
      .is('archived_at', null)
      .maybeSingle<{ user_id: string }>(),
    supabase.from('vendors').select('id').eq('user_id', session.userId).returns<{ id: string }[]>(),
  ])
  if (!data) return null

  // Couple side only: a live couple workspace, or a signup that has not become
  // anything yet (staff set those up over the phone, which is what this session
  // is for). A token naming a vendor or a platform admin is treated as unusable
  // rather than opening someone else's data.
  //
  // This used to test `users.role === 'user'`, which is not a fact: no vendor
  // signup path ever wrote 'vendor', so it admitted vendor logins and rejected
  // couples that had been mislabelled (migration 20260730030000).
  const isCoupleSide = workspace
    ? true
    : (storefronts ?? []).length === 0 && data.role !== 'admin'
  if (!isCoupleSide) return null

  return {
    id: data.id,
    clerkId: data.clerk_id ?? '',
    email: data.email ?? '',
    name: data.name,
    staffAdminEmail: session.adminEmail,
  }
}

/**
 * Resolves the signed-in Clerk user to a row in public.users, provisioning
 * one if the Clerk sync webhook hasn't run yet. Returns null when no Clerk
 * session is present.
 *
 * Provisioning is concurrency-safe: a page fires several auth checks in
 * parallel, so the insert uses ON CONFLICT (clerk_id) DO NOTHING and re-reads
 * the row when another request beat it. The 23505 (unique violation) branch
 * lets a Clerk identity adopt a pre-existing row when the email collides —
 * needed because the marketplace app may have provisioned the row from an
 * earlier sign-up. Neither path mutates the row's `id`, so foreign keys that
 * reference it (vendors, couple_profiles, …) stay intact.
 */
async function loadDashboardUser(): Promise<DashboardUser | null> {
  // Checked before Clerk: an admin acting for a couple has no Clerk session on
  // this instance at all (admin signs in against a different one), so the
  // Clerk path would bounce them to /sign-in.
  const staff = await loadStaffUser()
  if (staff) return staff

  const { userId } = await auth()
  if (!userId) return null

  const supabase = createDashboardClient()

  const { data: existing } = await supabase
    .from('users')
    .select('id, clerk_id, email, name')
    .eq('clerk_id', userId)
    .maybeSingle<{ id: string; clerk_id: string; email: string | null; name: string | null }>()

  if (existing) {
    return {
      id: existing.id,
      clerkId: existing.clerk_id,
      email: existing.email ?? '',
      name: existing.name,
    }
  }

  const clerk = await currentUser()
  const email =
    clerk?.primaryEmailAddress?.emailAddress ??
    clerk?.emailAddresses?.[0]?.emailAddress ??
    null
  const name = [clerk?.firstName, clerk?.lastName].filter(Boolean).join(' ') || null

  // `ignoreDuplicates` => INSERT ... ON CONFLICT (clerk_id) DO NOTHING. Crucially
  // it never runs a DO UPDATE, so a row that already carries this clerk_id (e.g. a
  // concurrent request just provisioned it) is left untouched. The previous
  // upsert-with-update rewrote the row's primary key `id` to a fresh UUID on
  // conflict, which breaks FKs that reference it (vendors.user_id,
  // couple_profiles, …) and threw `23503`. A real insert returns the new row; a
  // no-op returns nothing, so we re-read by clerk_id below.
  const { data: inserted, error } = await supabase
    .from('users')
    .upsert(
      {
        id: randomUUID(),
        clerk_id: userId,
        email,
        name,
        avatar: clerk?.imageUrl ?? null,
        // `role` is deliberately NOT written. Loading this dashboard says
        // nothing about whether someone is a couple — a vendor signing in to
        // look around would have been stamped role='user' here and then shown
        // up in admin's Couple Accounts list. Couple-ness is a couple_accounts
        // row, created by real engagement (migration 20260730030000).
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clerk_id', ignoreDuplicates: true },
    )
    .select('id, clerk_id, email, name')
    .maybeSingle<{ id: string; clerk_id: string; email: string | null; name: string | null }>()

  if (inserted) {
    return {
      id: inserted.id,
      clerkId: inserted.clerk_id,
      email: inserted.email ?? '',
      name: inserted.name,
    }
  }

  // No row + no error => the insert was a no-op because another request already
  // provisioned this clerk_id (the page fires several auth checks in parallel).
  // Re-read the existing row instead of trying to write again.
  if (!error) {
    const { data: byClerk } = await supabase
      .from('users')
      .select('id, clerk_id, email, name')
      .eq('clerk_id', userId)
      .maybeSingle<{ id: string; clerk_id: string; email: string | null; name: string | null }>()
    if (byClerk) {
      return {
        id: byClerk.id,
        clerkId: byClerk.clerk_id,
        email: byClerk.email ?? '',
        name: byClerk.name,
      }
    }
  }

  // The email already belongs to a users row (email is UNIQUE). Resolve to it so
  // the verified email owner can use the dashboard — Clerk only issues a session
  // for an email the user controls, so an email match is the same person.
  //
  // We stamp our clerk_id onto the row ONLY when it's still unclaimed (null), the
  // marketplace pre-provision case. If the row already carries a clerk_id — e.g.
  // the same person's vendor account, possibly under a different Clerk instance —
  // we return it READ-ONLY without rewriting clerk_id, so we never hijack a
  // binding another app keys on (and never sever an owner from their data).
  const isEmailConflict =
    (error as { code?: string } | null)?.code === '23505' &&
    (error?.message?.includes('email') ?? false)
  if (email && isEmailConflict) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('id, clerk_id, email, name')
      .eq('email', email)
      .maybeSingle<{ id: string; clerk_id: string | null; email: string | null; name: string | null }>()
    if (byEmail) {
      if (!byEmail.clerk_id) {
        await supabase
          .from('users')
          .update({ clerk_id: userId, updated_at: new Date().toISOString() })
          .eq('id', byEmail.id)
          .is('clerk_id', null)
      }
      return {
        id: byEmail.id,
        clerkId: userId,
        email: byEmail.email ?? '',
        name: byEmail.name,
      }
    }
  }

  // Last resort: a concurrent writer — another request, or the Clerk
  // `user.created` webhook (hosted in opus_website / vendors_portal) — may be
  // provisioning this row right now. Its INSERT can be mid-flight, committed
  // micro-seconds from now, so retry the read a few times with a short backoff
  // before giving up. Without this, losing that race redirects a legitimately
  // signed-in user to /sign-in (or renders a blank dashboard) even though their
  // row is about to exist.
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: finalByClerk } = await supabase
      .from('users')
      .select('id, clerk_id, email, name')
      .eq('clerk_id', userId)
      .maybeSingle<{ id: string; clerk_id: string; email: string | null; name: string | null }>()
    if (finalByClerk) {
      return {
        id: finalByClerk.id,
        clerkId: finalByClerk.clerk_id,
        email: finalByClerk.email ?? '',
        name: finalByClerk.name,
      }
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)))
  }

  // `error` here is the upsert error from above, which on this retry-exhausted
  // path is typically null (the insert no-op'd cleanly); log the actionable
  // context instead so a genuine provisioning failure is diagnosable.
  console.error('[dashboard auth] failed to provision Clerk user', {
    userId,
    hasEmail: Boolean(email),
    attempts: 4,
    upsertError: error?.message ?? null,
  })
  return null
}

/**
 * Per-request memoized resolver. The dashboard layout + page each call
 * requireDashboardUser(), so several getDashboardUser() calls fire in parallel
 * within a single request. React cache() collapses them to one execution, so a
 * brand-new user is provisioned exactly once instead of N racing inserts — the
 * losers of which used to re-read before the winner's row had committed and
 * returned null, blanking the dashboard until a manual reload.
 */
export const getDashboardUser = cache(loadDashboardUser)

/**
 * Guard for /my/* routes. Redirects to /sign-in (preserving return_to) when
 * the Clerk session is missing or the public.users row couldn't be resolved.
 * Middleware already enforces auth above /my, so this is belt-and-suspenders.
 */
export async function requireDashboardUser(returnTo?: string): Promise<DashboardUser> {
  const user = await getDashboardUser()
  if (user) return user
  const params = new URLSearchParams()
  if (returnTo) params.set('redirect_url', returnTo)
  const query = params.toString()
  redirect(`/sign-in${query ? `?${query}` : ''}`)
}
