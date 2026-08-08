import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { AuthLoading } from '@/components/auth/AuthGate';

export default function AuthLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  // Wait for Clerk to restore the session before deciding. Without this a
  // returning user renders sign-in for a frame while `isSignedIn` is still
  // false, then gets redirected away — a visible flash on every cold launch.
  if (!isLoaded) return <AuthLoading />;
  if (isSignedIn) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
