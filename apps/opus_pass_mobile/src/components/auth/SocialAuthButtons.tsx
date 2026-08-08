import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSocialAuth } from '@/hooks/useSocialAuth';
import { useTheme } from '@/theme/useTheme';

/** Matches the py-3.5 + text height of the Google button beside it. */
const APPLE_BUTTON_HEIGHT = 50;

type SocialAuthButtonsProps = {
  onSuccess: () => void;
  disabled?: boolean;
};

/**
 * Google and Apple sign-in, under an "or" divider.
 *
 * Render this LAST in its container. The native Apple button leaves the
 * region below it unable to receive touches — siblings placed after this
 * component draw normally and look completely fine, but every tap on them is
 * swallowed. It cost a while to find precisely because nothing errors: the
 * control simply does nothing. Both auth screens therefore put their
 * "Sign in" / "Create an account" footer link above this, not below.
 */
export function SocialAuthButtons({ onSuccess, disabled = false }: SocialAuthButtonsProps) {
  const { isAppleAvailable, signInWithGoogle, signInWithApple } = useSocialAuth();
  const { editorial, effective } = useTheme();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const busy = pending || disabled;

  const run = async (flow: () => Promise<{ status: string; message?: string }>) => {
    if (busy) return;
    setPending(true);
    setError('');
    try {
      const result = await flow();
      // A dismissed sheet is a decision, not a failure — say nothing.
      if (result.status === 'success') onSuccess();
      else if (result.status === 'error') setError(result.message ?? 'Something went wrong');
    } finally {
      setPending(false);
    }
  };

  return (
    <View className="gap-3">
      <View className="my-1 flex-row items-center gap-3">
        <View className="h-px flex-1 bg-ed-outline-variant" />
        <Text className="font-inter text-caption uppercase tracking-wide text-ed-on-surface-variant">or</Text>
        <View className="h-px flex-1 bg-ed-outline-variant" />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        onPress={() => run(signInWithGoogle)}
        disabled={busy}
        className={`flex-row items-center justify-center gap-2 rounded-xl border border-ed-outline-variant bg-ed-surface py-3.5 ${
          busy ? 'opacity-50' : ''
        }`}
      >
        <Ionicons name="logo-google" size={18} color={editorial.onSurface} />
        <Text className="font-inter-semibold text-body text-ed-on-surface">Continue with Google</Text>
      </Pressable>

      {Platform.OS === 'ios' && isAppleAvailable ? (
        // Wrapped in a plain View with an explicit height on purpose. The
        // native Apple button does not report a height to Yoga under the New
        // Architecture, so laying it out directly here left the parent
        // under-measured — and in React Native a child that falls outside its
        // parent's bounds still draws but stops receiving touches. That made
        // every control rendered after this component (the "Create an
        // account" and "Sign in" links) silently untappable while looking
        // perfectly fine. Keeping the measured box a plain View makes the
        // surrounding layout independent of what the native view reports.
        <View style={{ height: APPLE_BUTTON_HEIGHT }}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              effective === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            // Matches the rounded-xl (12pt) on every other control here.
            cornerRadius={12}
            style={{ width: '100%', height: '100%' }}
            onPress={() => run(signInWithApple)}
          />
        </View>
      ) : null}

      {error ? <Text className="font-inter text-body-sm text-ed-error">{error}</Text> : null}
    </View>
  );
}
