import { useAuth } from '@clerk/clerk-expo';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useMemo } from 'react';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);
export const missingSupabaseEnvVars = [
  !supabaseUrl ? 'EXPO_PUBLIC_SUPABASE_URL' : null,
  !supabaseAnonKey ? 'EXPO_PUBLIC_SUPABASE_ANON_KEY' : null,
].filter((value): value is string => Boolean(value));

/**
 * Public (unauthenticated) Supabase client. OpusPass leans on this more than
 * the OpusFesta app does: guest-facing surfaces (invitation view, RSVP) are
 * reached from a share link by people who never sign in.
 */
export const supabase: SupabaseClient | null = hasSupabaseEnv
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

function assertSupabaseEnvConfigured() {
  if (hasSupabaseEnv) return;

  throw new Error(
    `Missing Supabase environment variables: ${missingSupabaseEnvVars.join(', ')}. ` +
      'Set them in apps/opus_pass_mobile/.env.',
  );
}

export type GetClerkToken = (options?: { template?: string }) => Promise<string | null>;

/**
 * Builds a Clerk-authenticated Supabase client outside React.
 *
 * Split out of the hook below so provisioning — which runs from a button
 * handler on a screen that has never mounted a data hook — can resolve
 * `requesting_user_id()` for itself instead of depending on a query cache
 * entry that doesn't exist yet.
 */
export function createAuthenticatedSupabase(getToken: GetClerkToken): SupabaseClient {
  assertSupabaseEnvConfigured();

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: async (url, options: RequestInit = {}) => {
        const clerkToken = await getToken({ template: 'supabase' });
        const headers = new Headers(options.headers);
        if (clerkToken) {
          headers.set('Authorization', `Bearer ${clerkToken}`);
        }
        return fetch(url, { ...options, headers });
      },
    },
  });
}

/**
 * Supabase client with the Clerk JWT injected — for host-side surfaces
 * (guest list, pledges, invitation management). Mirrors the same `supabase`
 * JWT template the of_mobile app and the opus_pass web app use.
 */
export function useAuthenticatedSupabase(): SupabaseClient {
  const { getToken } = useAuth();

  return useMemo(() => createAuthenticatedSupabase(getToken), [getToken]);
}
