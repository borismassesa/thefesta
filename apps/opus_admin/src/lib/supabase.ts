import { auth } from '@clerk/nextjs/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export class SupabaseAdminConfigError extends Error {
  constructor() {
    super('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    this.name = 'SupabaseAdminConfigError'
  }
}

export function hasSupabaseAdminConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function isSupabaseAdminConfigError(error: unknown): error is SupabaseAdminConfigError {
  return error instanceof SupabaseAdminConfigError
}

/**
 * One retry on transient DNS / connection blips.
 *
 * Local `next dev` and brief Wi-Fi hiccups routinely surface as
 * `TypeError: fetch failed` / `getaddrinfo ENOTFOUND` against Supabase.
 * Without a retry, the admin dashboard paints every counter as 0 and
 * looks like a quiet healthy day. HTTP 4xx/5xx responses are NOT
 * retried — those are real answers.
 */
function fetchWithTransientRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init).catch(async (err: unknown) => {
    await new Promise((r) => setTimeout(r, 250))
    return fetch(input, init).catch(() => {
      // Re-throw the original failure so callers see the first cause,
      // not a second identical one.
      throw err
    })
  })
}

/**
 * Server-side admin client (bypasses RLS via service role).
 * Use for trusted admin writes — never expose to the browser.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new SupabaseAdminConfigError()
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTransientRetry },
  })
}

/**
 * Server-side Clerk-authenticated client (subject to RLS).
 * Use for read paths or for writes where RLS should still apply.
 */
export async function createClerkSupabaseServerClient(): Promise<SupabaseClient> {
  const { getToken } = await auth()
  const token = await getToken({ template: 'supabase' })
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    }
  )
}
