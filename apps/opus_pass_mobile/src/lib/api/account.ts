import { requestOpusWebsite } from '@/lib/api/opusWebsite';

/**
 * Permanently deletes the signed-in person's account.
 *
 * This calls opus_website's `DELETE /api/my/profile` rather than doing the work
 * from the app, for two reasons:
 *
 *  1. It cannot be done client-side at all. Removing the `public.users` row
 *     needs the service role, and removing the Clerk user needs the Clerk
 *     secret key — neither can ship in an app bundle.
 *  2. That route already implements the whole teardown, in the order that makes
 *     a partial failure survivable: the Supabase row goes first (cascading to
 *     couple_profiles, guests, events and the rest), and the Clerk login is
 *     deleted last so the session stays valid until the data is gone. Doing it
 *     the other way round would strand rows no one can ever authenticate to
 *     clean up.
 *
 * Deleting the Clerk user alone would NOT be enough: no webhook in this
 * monorepo handles `user.deleted` (both live handlers filter to `user.created`
 * and `user.updated`), so the `public.users` row would outlive the login — and
 * because `users.email` is UNIQUE, it would then block that person from ever
 * signing up again with the same address.
 */
export async function deleteMyAccount(token: string): Promise<void> {
  await requestOpusWebsite<{ success: boolean }>('/profile', token, { method: 'DELETE' });
}
