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
        <Text className="font-inter-bold text-card-title text-red-900">Missing environment configuration</Text>
        <Text className="mt-2 font-inter text-body-sm leading-5 text-red-800">
          OpusPass is configured to use Clerk + Supabase, but required environment variables are missing.
        </Text>
        <Text className="mt-3 font-inter-medium text-body-sm text-red-900">Missing keys:</Text>
        {missingVars.map((key) => (
          <Text key={key} className="mt-1 font-inter text-body-sm text-red-800">
            - {key}
          </Text>
        ))}
        <Text className="mt-4 font-inter text-caption leading-5 text-red-700">
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
  // Five files, not ten. Inter carries the whole interface at four weights;
  // Playfair Bold is kept for celebratory display type only. Each weight is a
  // separate family name because Android picks a face by file rather than by
  // fontWeight, and a synthesised bold on iOS would not match it.
  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
    'PlayfairDisplay-Bold': require('../assets/fonts/PlayfairDisplay-Bold.ttf'),
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
        <Text className="mt-3 text-body-sm text-ed-on-surface-variant">Preparing app…</Text>
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
