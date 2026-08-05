import 'server-only'

/**
 * Clerk REST helpers for the *platform* instance — the one couples sign in
 * with, whose Frontend API is clerk.opusfesta.com (the "OpusFesta" application
 * in the Clerk dashboard). It serves both opuspass.opusfesta.com and
 * www.opusfesta.com.
 *
 * This is NOT the instance the admin app authenticates against: staff sign in
 * against clerk.admin.opusfesta.com (the "OpusFesta Admin" application). So an
 * admin's own Clerk session, and this app's CLERK_SECRET_KEY, can never manage
 * a couple's login. It has to go through the platform instance's secret.
 *
 * Read from PLATFORM_CLERK_SECRET_KEY and nothing else. There is deliberately
 * NO fallback to VENDORS_CLERK_SECRET_KEY: the OpusFesta org runs four separate
 * Clerk applications (OpusFesta, OpusFesta Vendors, OpusFesta Admin,
 * OpusStudio), so that key belongs to the Vendors instance. Falling back to it
 * would create a couple's login on the wrong instance — a login that appears to
 * succeed here and does not work at OpusPass. Better to fail with a message
 * naming the missing variable.
 */

const CLERK_API_BASE = 'https://api.clerk.com/v1'

export function platformClerkSecret(): string | null {
  return process.env.PLATFORM_CLERK_SECRET_KEY?.trim() || null
}

/** Message reused wherever a missing secret degrades a flow rather than failing it. */
export const PLATFORM_CLERK_MISSING =
  'PLATFORM_CLERK_SECRET_KEY is not configured on the admin app. That is the secret key of the Clerk application serving clerk.opusfesta.com, where couples sign in, so their login could not be touched.'

/**
 * Pull the human sentence out of a Clerk error body. Clerk answers with
 * `{ errors: [{ message, long_message }] }`, and the long_message is the one
 * written for a person ("Email address must be a valid email address."). Falls
 * back to the raw text so an unexpected shape still says something.
 */
async function clerkErrorText(res: Response): Promise<string> {
  const body = await res.text().catch(() => '')
  try {
    const parsed = JSON.parse(body) as { errors?: { message?: string; long_message?: string }[] }
    const first = parsed.errors?.[0]
    const sentence = first?.long_message || first?.message
    if (sentence) return sentence
  } catch {
    // Not JSON — fall through to the raw body.
  }
  return body.slice(0, 200)
}

type LookupResult =
  | { ok: true; clerkId: string | null }
  | { ok: false; error: string }

/** Resolve a Clerk user id from an email. `clerkId: null` means no login exists. */
export async function findPlatformClerkUserId(email: string): Promise<LookupResult> {
  const secret = platformClerkSecret()
  if (!secret) return { ok: false, error: PLATFORM_CLERK_MISSING }

  try {
    const res = await fetch(
      `${CLERK_API_BASE}/users?email_address=${encodeURIComponent(email)}&limit=1`,
      { headers: { Authorization: `Bearer ${secret}` } },
    )
    if (res.status === 404) return { ok: true, clerkId: null }
    if (!res.ok) {
      return { ok: false, error: `Clerk user lookup failed (${res.status}): ${await clerkErrorText(res)}` }
    }
    const rows = (await res.json()) as Array<{ id?: string }>
    return { ok: true, clerkId: Array.isArray(rows) ? (rows[0]?.id ?? null) : null }
  } catch (err) {
    return {
      ok: false,
      error: `Clerk user lookup error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

export type CreateLoginResult =
  | { ok: true; clerkId: string; alreadyExisted: boolean }
  | { ok: false; error: string }

/**
 * Create a login on the platform instance so the person can actually sign in.
 *
 * `skip_password_requirement` creates the user without a password: they sign
 * in with an email code or Google, which is how every couple signs in anyway.
 * We never set a password from admin — see the credential rules in the repo
 * guidelines; nobody here should be handling one.
 *
 * A pre-existing login for that email is a success (`alreadyExisted: true`),
 * not an error — the caller only wants the account reachable.
 */
export async function createPlatformClerkLogin(input: {
  email: string
  firstName?: string | null
  lastName?: string | null
}): Promise<CreateLoginResult> {
  const secret = platformClerkSecret()
  if (!secret) return { ok: false, error: PLATFORM_CLERK_MISSING }

  const existing = await findPlatformClerkUserId(input.email)
  if (!existing.ok) return existing
  if (existing.clerkId) return { ok: true, clerkId: existing.clerkId, alreadyExisted: true }

  try {
    const res = await fetch(`${CLERK_API_BASE}/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_address: [input.email],
        first_name: input.firstName?.trim() || undefined,
        last_name: input.lastName?.trim() || undefined,
        skip_password_requirement: true,
      }),
    })
    if (res.ok) {
      const created = (await res.json()) as { id?: string }
      if (!created.id) return { ok: false, error: 'Clerk created the login but returned no id.' }
      return { ok: true, clerkId: created.id, alreadyExisted: false }
    }

    // 422 is Clerk's validation status, which also covers
    // form_identifier_exists — a login was created between our lookup and this
    // POST. Re-resolve rather than reporting a failure.
    if (res.status === 422) {
      const retry = await findPlatformClerkUserId(input.email)
      if (retry.ok && retry.clerkId) {
        return { ok: true, clerkId: retry.clerkId, alreadyExisted: true }
      }
    }
    return { ok: false, error: `Clerk login creation failed (${res.status}): ${await clerkErrorText(res)}` }
  } catch (err) {
    return {
      ok: false,
      error: `Clerk login creation error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/** DELETE one Clerk id. `gone` means the id does not exist in this instance,
 *  which is the caller's cue to look harder rather than to celebrate. */
async function deleteClerkUserById(
  secret: string,
  clerkId: string,
): Promise<{ ok: true; deleted: boolean } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${CLERK_API_BASE}/users/${clerkId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${secret}` },
    })
    if (res.ok) return { ok: true, deleted: true }
    if (res.status === 404) return { ok: true, deleted: false }
    return { ok: false, error: `Clerk login deletion failed (${res.status}): ${await clerkErrorText(res)}` }
  } catch (err) {
    return {
      ok: false,
      error: `Clerk login deletion error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Remove a login so the email is freed for a fresh sign-up.
 *
 * WHY THIS IS NOT JUST "DELETE users.clerk_id".
 *
 * `users.clerk_id` and the live Clerk login drift apart. A row can carry an id
 * minted by a different Clerk instance (an admin running against production data
 * with test keys is the common way), or one left over from a login that was
 * rebuilt. When it does, DELETE by that id returns 404 — and 404 previously
 * short-circuited to `{ ok: true }` on the reasoning that the login was already
 * gone. That reasoning is wrong whenever the id is merely WRONG rather than
 * deleted, and the failure is invisible: the account row is removed, the real
 * login survives, and the next page load re-provisions the row through
 * `ON CONFLICT (clerk_id) DO NOTHING` in opus_pass's dashboard auth. Staff then
 * delete the same account over and over while nothing changes. That is a real
 * production symptom, not a hypothetical — admin@opusfesta.com sat in this loop.
 *
 * So a 404 by id now falls through to the email lookup instead of ending the
 * story. Three outcomes, all reported honestly:
 *
 *   deleted by id            → ok
 *   404, email finds a login → delete that one, ok
 *   404, email finds nothing → ok WITH A WARNING. Genuinely already gone and
 *                              "wrong Clerk instance entirely" are
 *                              indistinguishable from here, and the second one
 *                              means the login is still live somewhere. Saying
 *                              so is the only way staff can tell.
 *
 * A missing secret returns `{ ok: true, warning }` rather than an error: a
 * platform config gap must not block a deletion the admin asked for. The
 * caller surfaces the warning so nobody assumes the login is gone.
 */
export async function deletePlatformClerkLogin(input: {
  clerkId: string | null
  email: string | null
}): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const secret = platformClerkSecret()
  if (!secret) {
    return {
      ok: true,
      warning: `${PLATFORM_CLERK_MISSING} That email may stay reserved until the key is set and the login is cleared.`,
    }
  }

  const storedId = input.clerkId?.trim() || null
  const email = input.email?.trim() || null

  if (storedId) {
    const byId = await deleteClerkUserById(secret, storedId)
    if (!byId.ok) return byId
    if (byId.deleted) return { ok: true }
    // Fell through: the stored id is not in this instance. Keep going.
  }

  // Either there was no stored id (an account that never signed in), or the
  // stored one was stale. The email is the durable identifier, so ask by that.
  if (!email) {
    return storedId
      ? {
          ok: true,
          warning: `The sign-in login could not be removed: this account's stored Clerk id (${storedId}) does not exist in the platform Clerk instance, and the account has no email to search by. If that id belongs to a different Clerk instance, the login is still live and the account may come back.`,
        }
      : { ok: true }
  }

  const lookup = await findPlatformClerkUserId(email)
  if (!lookup.ok) return { ok: false, error: lookup.error }
  if (!lookup.clerkId) {
    return storedId
      ? {
          ok: true,
          warning: `The sign-in login was NOT removed: neither this account's stored Clerk id (${storedId}) nor ${email} exists in the platform Clerk instance this app is configured against. Either the login was already deleted, or this environment points at a different Clerk instance from the one the account really lives in — in which case the login is still live and the account will reappear the next time they open OpusPass.`,
        }
      : { ok: true }
  }

  const byEmail = await deleteClerkUserById(secret, lookup.clerkId)
  if (!byEmail.ok) return byEmail
  if (!byEmail.deleted) {
    return {
      ok: true,
      warning: `The sign-in login for ${email} disappeared between lookup and deletion, so it may not have been removed.`,
    }
  }
  return storedId && storedId !== lookup.clerkId
    ? {
        ok: true,
        warning: `The sign-in login for ${email} was removed, but the account's stored Clerk id (${storedId}) did not match the live one (${lookup.clerkId}). Worth checking whether this environment is pointed at the right Clerk instance.`,
      }
    : { ok: true }
}
