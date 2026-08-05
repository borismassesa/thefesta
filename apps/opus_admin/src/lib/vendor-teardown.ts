import 'server-only'
import type { createSupabaseAdminClient } from '@/lib/supabase'

// Vendor teardown, shared by the two surfaces that can destroy a storefront:
// Operations, Vendors (deleteVendor) and OpusPass, Couple Accounts (deleting a
// couple whose login also owns a storefront).
//
// It lives here rather than in either page's actions.ts because a `'use server'`
// module may only export server actions — a plain helper exported from one would
// break the build the moment the other imported it.
//
// WHY THE COUPLES PAGE NEEDS THIS AT ALL: `vendors.user_id` is
// `REFERENCES users(id) ON DELETE CASCADE`, so deleting the `users` row behind a
// couple silently takes the storefront with it — no Clerk login removed in the
// vendors portal, no stored KYC scans or portfolio media purged. Routing that
// path through here makes the cascade explicit and complete instead.

type AdminClient = ReturnType<typeof createSupabaseAdminClient>

const CLERK_API_BASE = 'https://api.clerk.com/v1'

/**
 * Recursively collect every object key under a storage prefix. Supabase's
 * `list` is one folder deep, so we walk into sub-folders (entries with no
 * `id`) until we bottom out. Used to purge a deleted vendor's media so we
 * don't orphan private KYC scans or portfolio files in the bucket.
 */
async function listStorageObjects(
  admin: AdminClient,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const { data, error } = await admin.storage.from(bucket).list(prefix, {
    limit: 1000,
  })
  if (error || !data) {
    if (error) {
      console.warn(
        `[admin] storage list failed (${bucket}/${prefix}): ${error.message}`
      )
    }
    return []
  }
  const keys: string[] = []
  for (const entry of data) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.id === null) {
      // A folder — recurse into it.
      keys.push(...(await listStorageObjects(admin, bucket, path)))
    } else {
      keys.push(path)
    }
  }
  return keys
}

/**
 * Best-effort purge of a vendor's stored files before the row (and its
 * exact storage-path records) disappear. Pulls precise verification-document
 * and signature paths from the DB, plus a recursive sweep of the portfolio
 * folder. Never throws — a storage hiccup must not block the DB delete.
 */
export async function removeVendorStorageObjects(
  admin: AdminClient,
  vendorId: string
): Promise<void> {
  // vendor_verification bucket: KYC documents + the drawn signature image.
  const verificationKeys = new Set<string>()
  const docs = await admin
    .from('vendor_verification_documents')
    .select('storage_path')
    .eq('vendor_id', vendorId)
  if (!docs.error) {
    for (const row of docs.data ?? []) {
      const path = (row as { storage_path: string | null }).storage_path
      if (path) verificationKeys.add(path)
    }
  }
  const agreements = await admin
    .from('vendor_agreements')
    .select('signature_image_path')
    .eq('vendor_id', vendorId)
  if (!agreements.error) {
    for (const row of agreements.data ?? []) {
      const path = (row as { signature_image_path: string | null })
        .signature_image_path
      if (path) verificationKeys.add(path)
    }
  }
  // Belt-and-braces: also sweep anything left under the vendor's folder.
  for (const key of await listStorageObjects(
    admin,
    'vendor_verification',
    vendorId
  )) {
    verificationKeys.add(key)
  }
  if (verificationKeys.size > 0) {
    const { error } = await admin.storage
      .from('vendor_verification')
      .remove(Array.from(verificationKeys))
    if (error) {
      console.warn(
        `[admin] vendor_verification purge failed for ${vendorId}: ${error.message}`
      )
    }
  }

  // vendor-portfolios bucket: cover, gallery, and video uploads.
  const portfolioKeys = await listStorageObjects(
    admin,
    'vendor-portfolios',
    vendorId
  )
  if (portfolioKeys.length > 0) {
    const { error } = await admin.storage
      .from('vendor-portfolios')
      .remove(portfolioKeys)
    if (error) {
      console.warn(
        `[admin] vendor-portfolios purge failed for ${vendorId}: ${error.message}`
      )
    }
  }
}

/** Look up a vendors-portal Clerk id by email. `null` means no such login. */
async function findVendorClerkUserId(
  headers: Record<string, string>,
  email: string
): Promise<{ ok: true; clerkId: string | null } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `${CLERK_API_BASE}/users?email_address=${encodeURIComponent(email)}&limit=1`,
      { headers }
    )
    if (res.status === 404) return { ok: true, clerkId: null }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `Clerk user lookup failed (${res.status}): ${body.slice(0, 200)}` }
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

/** DELETE one Clerk id. `deleted: false` means the id is not in this instance,
 *  which is a reason to look harder, not a success. */
async function deleteVendorClerkUserById(
  headers: Record<string, string>,
  clerkId: string
): Promise<{ ok: true; deleted: boolean } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${CLERK_API_BASE}/users/${clerkId}`, { method: 'DELETE', headers })
    if (res.ok) return { ok: true, deleted: true }
    if (res.status === 404) return { ok: true, deleted: false }
    const body = await res.text().catch(() => '')
    return { ok: false, error: `Clerk login deletion failed (${res.status}): ${body.slice(0, 200)}` }
  } catch (err) {
    return {
      ok: false,
      error: `Clerk login deletion error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Delete the vendor's login from the vendors-portal Clerk instance so the
 * email is freed for a fresh sign-up — the whole reason admins shouldn't have
 * to open the Clerk dashboard. Uses VENDORS_CLERK_SECRET_KEY (the *portal*
 * instance's secret, NOT the admin instance's).
 *
 * `users.clerk_id` is NOT trusted as the last word. It drifts from the live
 * login — an id minted by a different Clerk instance, or one left from a login
 * that was rebuilt — and a DELETE by a drifted id returns 404. Treating that
 * 404 as "already gone" is what let the couple-side equivalent delete an
 * account over and over while the real login stayed live and re-created it (see
 * deletePlatformClerkLogin in @/lib/platform-clerk for the full account of that
 * failure). A vendor login shares the column and the risk, so it gets the same
 * treatment: 404 by id falls through to the email lookup, and when neither
 * resolves, that is reported as a warning rather than passed off as done.
 *
 * When the secret is NOT configured, returns `{ ok: true, warning }` rather than
 * an error: a missing platform config shouldn't block a core admin operation, so
 * the caller proceeds with the DB deletion and surfaces the warning (the email
 * may stay reserved in the vendors portal until the key is set). A genuine Clerk
 * rejection still returns `{ ok: false }` so the caller can abort.
 */
export async function deleteVendorClerkLogin(opts: {
  clerkId: string | null
  email: string | null
}): Promise<{ ok: boolean; error?: string; warning?: string }> {
  const secret = process.env.VENDORS_CLERK_SECRET_KEY?.trim()
  if (!secret) {
    return {
      ok: true,
      warning:
        'The vendor record was deleted, but their portal sign-in login was NOT removed — VENDORS_CLERK_SECRET_KEY (the vendors-portal Clerk secret) is not configured on the admin app. That email may stay reserved in the vendors portal until the key is set and the login is cleared.',
    }
  }
  const headers = { Authorization: `Bearer ${secret}` }

  const storedId = opts.clerkId?.trim() || null
  const email = opts.email?.trim() || null

  if (storedId) {
    const byId = await deleteVendorClerkUserById(headers, storedId)
    if (!byId.ok) return byId
    if (byId.deleted) return { ok: true }
  }

  // No stored id (an admin-created vendor that never signed in), or a stale one.
  if (!email) {
    return storedId
      ? {
          ok: true,
          warning: `The vendor record was deleted, but their portal sign-in login was NOT removed: the stored Clerk id (${storedId}) is not in the vendors-portal Clerk instance and there is no email to search by. If that id belongs to a different Clerk instance, the login is still live.`,
        }
      : { ok: true }
  }

  const lookup = await findVendorClerkUserId(headers, email)
  if (!lookup.ok) return { ok: false, error: lookup.error }
  if (!lookup.clerkId) {
    return storedId
      ? {
          ok: true,
          warning: `The vendor record was deleted, but their portal sign-in login was NOT removed: neither the stored Clerk id (${storedId}) nor ${email} exists in the vendors-portal Clerk instance this app is configured against. Either it was already deleted, or this environment points at a different Clerk instance from the one the vendor really signs in to.`,
        }
      : { ok: true }
  }

  const byEmail = await deleteVendorClerkUserById(headers, lookup.clerkId)
  if (!byEmail.ok) return byEmail
  if (!byEmail.deleted) {
    return {
      ok: true,
      warning: `The portal login for ${email} disappeared between lookup and deletion, so it may not have been removed.`,
    }
  }
  return storedId && storedId !== lookup.clerkId
    ? {
        ok: true,
        warning: `The portal login for ${email} was removed, but the stored Clerk id (${storedId}) did not match the live one (${lookup.clerkId}). Worth checking whether this environment is pointed at the right Clerk instance.`,
      }
    : { ok: true }
}

/**
 * Tear one storefront down completely: vendors-portal Clerk login, stored
 * media, then the `vendors` row (every child table CASCADEs off it).
 *
 * Order matters. The Clerk login goes FIRST so a genuine Clerk failure aborts
 * before any row is touched — otherwise the storefront would be gone while its
 * email stayed stuck as "taken" in the portal. Storage goes next, because after
 * the row is deleted we no longer know the exact paths.
 *
 * A missing VENDORS_CLERK_SECRET_KEY is not a failure: it comes back as a
 * warning and the teardown proceeds, so a config gap can't block the delete.
 *
 * Does NOT touch `public.users`. Whether the login survives the storefront is
 * the caller's decision: Operations, Vendors keeps it (and clears the dangling
 * `clerk_id`), while Couple Accounts deletes it right after.
 */
export async function purgeVendorRecord(
  admin: AdminClient,
  vendorId: string
): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  const vendor = await admin
    .from('vendors')
    .select('business_name, user_id, contact_info')
    .eq('id', vendorId)
    .maybeSingle<{
      business_name: string | null
      user_id: string | null
      contact_info: { email?: string | null } | null
    }>()
  if (vendor.error) {
    return {
      ok: false,
      error: `[admin] vendor lookup failed: ${vendor.error.code} ${vendor.error.message}`,
    }
  }
  // Already gone. Idempotent so a retry after a partial failure still finishes.
  if (!vendor.data) return { ok: true }

  // Resolve the vendor's login email + Clerk id from the linked users row,
  // falling back to the contact email on the vendor record.
  let clerkId: string | null = null
  let loginEmail: string | null = vendor.data.contact_info?.email?.trim() || null
  if (vendor.data.user_id) {
    const userRow = await admin
      .from('users')
      .select('clerk_id, email')
      .eq('id', vendor.data.user_id)
      .maybeSingle<{ clerk_id: string | null; email: string | null }>()
    if (!userRow.error && userRow.data) {
      clerkId = userRow.data.clerk_id?.trim() || null
      loginEmail = userRow.data.email?.trim() || loginEmail
    }
  }

  const clerkRes = await deleteVendorClerkLogin({ clerkId, email: loginEmail })
  if (!clerkRes.ok) {
    return {
      ok: false,
      error: clerkRes.error ?? 'Could not delete the vendor login.',
    }
  }

  await removeVendorStorageObjects(admin, vendorId)

  const { error } = await admin.from('vendors').delete().eq('id', vendorId)
  if (error) {
    return {
      ok: false,
      error: `[admin] delete vendor failed: ${error.code} ${error.message}`,
    }
  }

  return { ok: true, warning: clerkRes.warning }
}

/**
 * Every storefront owned by one login, newest first. Used both to warn before a
 * couple account is deleted and to tear those storefronts down when it is.
 */
export async function listVendorsOwnedBy(
  admin: AdminClient,
  userId: string
): Promise<{ id: string; businessName: string }[]> {
  const { data, error } = await admin
    .from('vendors')
    .select('id, business_name')
    .eq('user_id', userId)
    .returns<{ id: string; business_name: string | null }[]>()
  if (error) {
    console.warn(`[admin] vendor lookup failed for user=${userId}: ${error.message}`)
    return []
  }
  return (data ?? []).map((v) => ({
    id: v.id,
    businessName: v.business_name?.trim() || 'Unnamed storefront',
  }))
}
