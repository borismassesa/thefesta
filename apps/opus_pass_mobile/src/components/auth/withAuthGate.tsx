import type { ComponentType } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { Redirect } from 'expo-router';
import { AuthLoading } from '@/components/auth/AuthGate';
import { ProvisioningSelfHeal } from '@/components/auth/ProvisioningSelfHeal';

/**
 * Wraps a screen so only a signed-in user ever renders it.
 *
 * Deliberately a wrapper rather than a route group with its own layout. The
 * group approach reads better, but a layout route means a second Stack
 * navigator nested inside the root one, and screens inside that nested stack
 * lose touches near the bottom of their scroll content — it silently killed
 * Sign Out on the profile screen, whose own code hadn't changed at all. A
 * plain component adds no navigator and cannot do that.
 *
 * Guarding at the export also means the screen's own data hooks never run for
 * a signed-out user, instead of firing and failing.
 */
export function withAuthGate<P extends object>(Screen: ComponentType<P>): ComponentType<P> {
  function GuardedScreen(props: P) {
    const { isLoaded, isSignedIn } = useAuth();

    // Waiting matters: reading isSignedIn before Clerk restores the session
    // from the keychain reports "signed out" for a returning user and bounces
    // them to sign-in on every cold launch.
    if (!isLoaded) return <AuthLoading />;
    if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

    return (
      <>
        <ProvisioningSelfHeal />
        <Screen {...props} />
      </>
    );
  }

  GuardedScreen.displayName = `withAuthGate(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
  return GuardedScreen;
}
