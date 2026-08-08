import { useEffect } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useInternalUserId } from '@/hooks/useInternalUserId';
import { displayNameFor } from '@/lib/names';
import { ensureProvisioned } from '@/lib/provisioning';

/**
 * Clerk user ids we've already tried this launch.
 *
 * Module-level on purpose. Provisioning can fail for reasons a retry won't fix
 * (the edge function's Clerk secret missing, an email already bound to another
 * account), and `useInternalUserId` stays null in exactly that case — so a
 * naive effect would re-POST on every remount, forever. One attempt per user
 * per app launch is the right cadence: enough to recover from the offline
 * sign-up case, not enough to hammer anything.
 */
const attempted = new Set<string>();

/**
 * Creates the `public.users` row for a signed-in user who somehow doesn't have
 * one, then renders nothing.
 *
 * The normal path provisions during sign-up. This catches the cases that path
 * can't: the network dropped mid-sign-up, the account was made on the web
 * before any of this existed, or a social sign-in landed while offline.
 * Without a row, every write in the app fails with MissingInternalUserError.
 */
export function ProvisioningSelfHeal() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { data: internalUserId, isLoading } = useInternalUserId();

  useEffect(() => {
    if (!isSignedIn || isLoading || internalUserId || !user) return;
    if (attempted.has(user.id)) return;

    attempted.add(user.id);
    void ensureProvisioned({
      getToken,
      partner1Name: displayNameFor({
        fullName: user.fullName,
        firstName: user.firstName,
        email: user.primaryEmailAddress?.emailAddress ?? null,
      }),
    });
  }, [getToken, internalUserId, isLoading, isSignedIn, user]);

  return null;
}
