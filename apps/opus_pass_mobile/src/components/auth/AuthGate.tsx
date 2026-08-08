import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { Redirect } from 'expo-router';
import { ProvisioningSelfHeal } from '@/components/auth/ProvisioningSelfHeal';
import { useTheme } from '@/theme/useTheme';

/** Full-screen spinner shown while Clerk hydrates its session from the keychain. */
export function AuthLoading() {
  const { colors } = useTheme();

  return (
    <View className="flex-1 items-center justify-center bg-ed-bg">
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

/**
 * Renders `children` only for a signed-in user.
 *
 * The `!isLoaded` branch is the load-bearing one: reading `isSignedIn` before
 * Clerk has read the session out of the keychain reports "signed out" for a
 * returning user, which flashes the sign-in screen on every cold launch. Three
 * layouts used to make that call independently and disagreed about it; keeping
 * it in one component means a new layout cannot get it wrong.
 *
 * The account self-heal rides along here rather than in a single layout so it
 * covers every gated surface — the tab group is a sibling of `(app)`, not a
 * child, so a user who lands straight on the dashboard would otherwise never
 * mount it. Mounting twice is harmless: it dedupes on the Clerk user id.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return <AuthLoading />;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <>
      <ProvisioningSelfHeal />
      {children}
    </>
  );
}
