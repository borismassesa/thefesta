import { auth } from '@clerk/nextjs/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side admin client (bypasses RLS via service role).
 * Use only for trusted writes from server actions / route handlers.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}


/**
 * Anonymous client for data that is public-read by RLS (the category
 * catalogue, CMS copy). Reaching for the Clerk-authenticated client here
 * couples a public list to the state of the 'supabase' JWT template: if the
 * token is missing or rejected, the read fails and callers silently fall back
 * to stale hardcoded data. Nothing here is per-user, so don't pay that cost.
 */
export function createSupabasePublicClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    )
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Server-side Clerk-authenticated client (subject to RLS).
 * The Clerk JWT 'supabase' template carries the user's sub claim, which
 * RLS policies resolve to public.users.id via requesting_user_id().
 * Vendor scope is then enforced through vendor_memberships joins.
 *
 * **Keyless / dev fallback:** If the Clerk app has no 'supabase' JWT template
 * configured (e.g. running in keyless dev mode), `getToken` throws a 404. In
 * that case we fall back to the **service-role admin client** so writes still
 * land — every consumer of this function already authenticates the request
 * via Clerk middleware + `getCurrentVendor`, then constrains the query with
 * an explicit `WHERE vendor_id = ?` / `WHERE id = ?` filter. The Clerk
 * session is the trust boundary; RLS is defense-in-depth that isn't
 * load-bearing here. Previously we returned an *unauthenticated* client,
 * which silently no-op'd every UPDATE (RLS matched 0 rows but Supabase
 * doesn't surface that as an error) — vendors saw "Save" appear to work
 * while nothing persisted.
 *
 * Production deployments should still configure the JWT template so RLS
 * gives proper defense-in-depth; the fallback only kicks in when the
 * template is missing.
 */
export async function createClerkSupabaseServerClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    )
  }
  const { getToken } = await auth()
  let token: string | null = null
  try {
    token = await getToken({ template: 'supabase' })
  } catch (err) {
    const isMissingTemplate =
      err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404
    if (!isMissingTemplate) throw err
    // Keyless / dev fallback: use the service-role admin client so writes
    // actually land. See jsdoc above for the trust-boundary rationale.
    //
    // SECURITY: with this fallback active, RLS is NOT enforced for the
    // request — every query made through this client MUST pin explicit
    // tenant filters (WHERE vendor_id / id = ...). An unfiltered query here
    // is exactly how agreement signatures once landed on another vendor's
    // record (PR #192).
    const message =
      "[supabase] Clerk JWT template 'supabase' not found (404): falling back to the SERVICE-ROLE client — RLS is NOT enforced for this request. Configure the template at https://dashboard.clerk.com/last-active?path=jwt-templates to restore RLS defense-in-depth."
    if (process.env.NODE_ENV === 'production') {
      // Error-level so production monitoring can't miss the misconfiguration.
      // TODO: once the production Clerk instance has the template configured
      // and has soaked, make this branch throw instead of falling back.
      console.error(message)
    } else {
      console.warn(message)
    }
    return createSupabaseAdminClient()
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  })
}
