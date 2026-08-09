import { useCallback, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { deleteMyAccount } from '@/lib/api/account';
import { queryClient } from '@/lib/query-client';

/**
 * Deletes the account, then tears down the local session.
 *
 * The sign-out is part of the operation, not a follow-up: once the row and the
 * Clerk user are gone the in-memory session is pointing at nothing, and any
 * query that refetched before it was cleared would see a missing user row —
 * which is exactly the condition ProvisioningSelfHeal reacts to by writing a
 * fresh row. Signing out immediately unmounts the gated screens that could
 * trigger that, and withAuthGate takes it from there.
 */
export function useDeleteAccount() {
  const { getToken, signOut } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteAccount = useCallback(async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      // Default session token — opus_website's middleware expects this, not
      // the `supabase` JWT template the data layer uses.
      const token = await getToken();
      if (!token) throw new Error('You need to be signed in to delete your account.');

      await deleteMyAccount(token);
      await signOut();
      queryClient.clear();
    } finally {
      setIsDeleting(false);
    }
  }, [getToken, isDeleting, signOut]);

  return { deleteAccount, isDeleting };
}
