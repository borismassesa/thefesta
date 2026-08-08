import { queryClient } from '@/lib/query-client';
import { decideOutcome, type ProvisionOutcome } from '@/lib/provisioning-outcome';
import { createAuthenticatedSupabase, type GetClerkToken } from '@/lib/supabase';

const PROVISION_TIMEOUT_MS = 10_000;

export type { ProvisionOutcome };

/**
 * The provisioning currently running, if any.
 *
 * Two callers genuinely race here: activating the session at the end of
 * sign-up flips `isSignedIn`, which redirects out of the (auth) group and
 * mounts AuthGate — so the screen's own call and the gate's self-heal can be
 * in flight at the same moment. The edge function is idempotent, so this is a
 * matter of not making two identical round-trips rather than of correctness.
 */
let inFlight: Promise<ProvisionOutcome> | null = null;

/**
 * Resolves the internal user id and writes it into the same cache entry
 * `useInternalUserId` reads.
 *
 * Runs the RPC directly rather than going through `queryClient.fetchQuery`,
 * because on the sign-up screen no component has mounted `useInternalUserId`
 * yet — the cache holds no query function, and fetchQuery would throw. Seeding
 * the entry here also means the first screen to mount after sign-up sees the
 * fresh id instead of refetching it.
 */
async function readInternalUserId(getToken: GetClerkToken): Promise<string | null> {
  try {
    const client = createAuthenticatedSupabase(getToken);
    const { data, error } = await client.rpc('requesting_user_id');
    if (error) throw error;

    const userId = (data as string | null) ?? null;
    queryClient.setQueryData(['internal-user-id'], userId);
    return userId;
  } catch {
    return null;
  }
}

/**
 * Makes sure the signed-in Clerk user has the `public.users` row the whole
 * data layer keys off, creating it via the `complete-onboarding` edge function
 * when it's missing.
 *
 * This can't be done from the client directly: the RLS insert policy on
 * `users` is `WITH CHECK (requesting_user_id() = id)`, and
 * `requesting_user_id()` resolves by looking the row up — so it returns NULL
 * for exactly the user who needs the row, and the check can never pass. A
 * service-role path is the only way in, and the Clerk `user.created` webhook
 * has never been reliable for the live instance mobile ships against
 * (docs/OPUSPASS_CLERK_PRODUCTION_INCIDENT.md).
 *
 * Never throws. Callers must be free to navigate on any outcome — leaving
 * someone stranded on the sign-up screen holding a valid session would be
 * worse than letting them into an app that is briefly missing its data.
 */
export function ensureProvisioned(args: {
  getToken: GetClerkToken;
  partner1Name: string;
}): Promise<ProvisionOutcome> {
  if (inFlight) return inFlight;

  inFlight = runProvisioning(args).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runProvisioning(args: {
  getToken: GetClerkToken;
  partner1Name: string;
}): Promise<ProvisionOutcome> {
  // Cheap and worth it: this runs on every sign-in through a social button,
  // and the overwhelmingly common case is an account that already exists.
  const existing = await readInternalUserId(args.getToken);
  if (existing) return decideOutcome({ hadRowBefore: true, httpOk: true, rowAfter: existing });

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    console.warn('[provisioning] EXPO_PUBLIC_SUPABASE_URL is not set; skipping provisioning.');
    return 'unresolved';
  }

  let httpOk = false;
  try {
    // The `supabase` template, not the default one: that JWT is signed with
    // the project's own secret, which is what lets the edge function's
    // verify_jwt accept it.
    const token = await args.getToken({ template: 'supabase' });
    if (!token) return 'unresolved';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVISION_TIMEOUT_MS);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/complete-onboarding`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'provision', profile: { partner1_name: args.partner1Name } }),
        signal: controller.signal,
      });
      httpOk = response.ok;
      if (!response.ok) {
        console.warn('[provisioning] complete-onboarding responded', response.status);
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.warn('[provisioning] complete-onboarding call failed', err);
  }

  // Re-read regardless of what happened above — see decideOutcome. This
  // overwrites the null the short-circuit cached, which matters because
  // useInternalUserId is staleTime: Infinity and would otherwise hold it for
  // the rest of the session.
  const rowAfter = await readInternalUserId(args.getToken);

  const outcome = decideOutcome({ hadRowBefore: false, httpOk, rowAfter });
  if (outcome === 'provisioned') {
    // The same call creates the couple_profiles row, so anything reading the
    // profile is stale too.
    await queryClient.invalidateQueries({ queryKey: ['dashboard', 'couple-profile'] });
  }

  return outcome;
}
