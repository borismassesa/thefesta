import '@/lib/polyfills';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { ClerkProvider } from '@clerk/clerk-expo';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { queryClient } from '@/lib/query-client';
import { tokenCache } from '@/lib/auth';
import { hasSupabaseEnv, missingSupabaseEnvVars } from '@/lib/supabase';
import { ColorSchemeProvider } from '@/theme/ColorSchemeProvider';
import { ThemedStatusBar } from '@/theme/ThemedStatusBar';
import { useTheme } from '@/theme/useTheme';
import '../global.css';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore when called after splash has already been handled.
});

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

function MissingConfigScreen({ missingVars }: { missingVars: string[] }) {
  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <View className="w-full max-w-md rounded-2xl border border-red-200 bg-red-50 p-5">
        <Text className="font-work-sans-bold text-lg text-red-900">Missing environment configuration</Text>
        <Text className="mt-2 font-work-sans text-sm leading-5 text-red-800">
          OpusPass is configured to use Clerk + Supabase, but required environment variables are missing.
        </Text>
        <Text className="mt-3 font-work-sans-medium text-sm text-red-900">Missing keys:</Text>
        {missingVars.map((key) => (
          <Text key={key} className="mt-1 font-work-sans text-sm text-red-800">
            - {key}
          </Text>
        ))}
        <Text className="mt-4 font-work-sans text-xs leading-5 text-red-700">
          Add them to apps/opus_pass_mobile/.env and restart Expo.
        </Text>
      </View>
    </View>
  );
}

export default function RootLayout() {
  // ColorSchemeProvider is the outermost provider so every render branch below
  // (loader, missing-config, main) can read the active theme.
  return (
    <ColorSchemeProvider>
      <RootLayoutInner />
    </ColorSchemeProvider>
  );
}

function RootLayoutInner() {
  const { colors } = useTheme();
  const [fontStartupTimedOut, setFontStartupTimedOut] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    'PlayfairDisplay-SemiBold': require('../assets/fonts/PlayfairDisplay-SemiBold.ttf'),
    'PlayfairDisplay-Bold': require('../assets/fonts/PlayfairDisplay-Bold.ttf'),
    'SpaceGrotesk-Regular': require('../assets/fonts/SpaceGrotesk-Regular.ttf'),
    'SpaceGrotesk-Bold': require('../assets/fonts/SpaceGrotesk-Bold.ttf'),
    'WorkSans-Regular': require('../assets/fonts/WorkSans-Regular.ttf'),
    'WorkSans-Medium': require('../assets/fonts/WorkSans-Medium.ttf'),
    'WorkSans-SemiBold': require('../assets/fonts/WorkSans-SemiBold.ttf'),
    'WorkSans-Bold': require('../assets/fonts/WorkSans-Bold.ttf'),
    'DancingScript-Regular': require('../assets/fonts/DancingScript-Regular.ttf'),
    'DancingScript-Bold': require('../assets/fonts/DancingScript-Bold.ttf'),
  });
  const canRenderApp = fontsLoaded || Boolean(fontError) || fontStartupTimedOut;

  useEffect(() => {
    const timeout = setTimeout(() => {
      setFontStartupTimedOut(true);
    }, 6000);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (canRenderApp) {
      SplashScreen.hideAsync().catch(() => {
        // Ignore if splash is already hidden.
      });
    }
  }, [canRenderApp]);

  if (!canRenderApp) {
    return (
      <View className="flex-1 items-center justify-center bg-ed-bg">
        <ThemedStatusBar />
        <ActivityIndicator size="small" color={colors.primary} />
        <Text className="mt-3 text-sm text-ed-on-surface-variant">Preparing app…</Text>
      </View>
    );
  }

  const missingConfig = [
    !clerkPublishableKey ? 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY' : null,
    ...missingSupabaseEnvVars,
  ].filter((value): value is string => Boolean(value));

  if (!clerkPublishableKey || !hasSupabaseEnv) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemedStatusBar />
        <MissingConfigScreen missingVars={missingConfig} />
      </QueryClientProvider>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <ThemedStatusBar />
        {/* Required by react-native-gesture-handler for swipe actions
            (checklist rows) to receive touches — must wrap the whole tree. */}
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }} />
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
