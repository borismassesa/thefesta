import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useAuth, useSSO, useSignInWithApple } from '@clerk/clerk-expo';
import * as AppleAuthentication from 'expo-apple-authentication';
import { getErrorCode, getErrorMessage } from '@/lib/errors';
import { displayNameFor } from '@/lib/names';
import { ensureProvisioned } from '@/lib/provisioning';

export type SocialResult =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

type FlowResult = {
  createdSessionId: string | null;
  setActive?: (params: { session: string }) => Promise<void>;
  signUp?: { emailAddress?: string | null; firstName?: string | null } | null;
};

/**
 * Google and Apple sign-in.
 *
 * Uses `useSSO` rather than the deprecated `useOAuth`, and deliberately does
 * not call `WebBrowser.maybeCompleteAuthSession()` — ClerkProvider already
 * does, and calling it again closes the session the flow is waiting on.
 * `redirectUrl` is left off so Clerk builds `opuspass://sso-callback` from the
 * app scheme itself.
 */
export function useSocialAuth() {
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const { getToken } = useAuth();
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    let active = true;
    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (active) setIsAppleAvailable(available);
      })
      .catch(() => {
        // Treated as "not available" — the button simply doesn't render.
      });

    return () => {
      active = false;
    };
  }, []);

  const finish = useCallback(
    async (result: FlowResult): Promise<SocialResult> => {
      if (!result.createdSessionId || !result.setActive) {
        // No session and no throw means the user backed out of the sheet.
        return { status: 'cancelled' };
      }

      await result.setActive({ session: result.createdSessionId });

      // A first-time social sign-in creates the Clerk user but nothing in our
      // database, and there is no form here to ask for a name — so take the
      // best one the provider gave us. The outcome is deliberately not acted
      // on: the caller navigates either way, and the (app) layout retries on
      // the next launch if this didn't land.
      await ensureProvisioned({
        getToken,
        partner1Name: displayNameFor({
          firstName: result.signUp?.firstName ?? null,
          email: result.signUp?.emailAddress ?? null,
        }),
      });

      return { status: 'success' };
    },
    [getToken],
  );

  const signInWithGoogle = useCallback(async (): Promise<SocialResult> => {
    try {
      const result = await startSSOFlow({ strategy: 'oauth_google' });
      if (result.authSessionResult && result.authSessionResult.type !== 'success') {
        return { status: 'cancelled' };
      }
      return await finish(result as FlowResult);
    } catch (err) {
      return { status: 'error', message: getErrorMessage(err, "Couldn't sign in with Google") };
    }
  }, [finish, startSSOFlow]);

  const signInWithApple = useCallback(async (): Promise<SocialResult> => {
    try {
      // The native sheet is iOS-only; Clerk's non-iOS build of this hook is a
      // stub that throws, so everywhere else has to go through the web flow.
      if (Platform.OS !== 'ios') {
        const result = await startSSOFlow({ strategy: 'oauth_apple' });
        if (result.authSessionResult && result.authSessionResult.type !== 'success') {
          return { status: 'cancelled' };
        }
        return await finish(result as FlowResult);
      }

      const result = await startAppleAuthenticationFlow();
      return await finish(result as FlowResult);
    } catch (err) {
      // Dismissing the Apple sheet throws rather than returning — not an error.
      if (getErrorCode(err) === 'ERR_REQUEST_CANCELED') return { status: 'cancelled' };
      return { status: 'error', message: getErrorMessage(err, "Couldn't sign in with Apple") };
    }
  }, [finish, startAppleAuthenticationFlow, startSSOFlow]);

  return { isAppleAvailable, signInWithGoogle, signInWithApple };
}
