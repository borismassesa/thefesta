import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSocialAuth, type SocialResult } from '@/hooks/useSocialAuth';
import { useTheme } from '@/theme/useTheme';

/** Matches the py-3.5 + text height of the Google button beside it. */
const APPLE_BUTTON_HEIGHT = 50;

type SocialAuthButtonsProps = {
  onSuccess: () => void;
  /**
   * Called when the provider authenticated the person but Clerk still needs a
   * name to finish the sign-up. Screens that can ask for one handle this;
   * without a handler the person is told to sign up by email instead.
   */
  onNeedsName?: () => void;
  disabled?: boolean;
};

/** Google and Apple sign-in, under an "or" divider. */
export function SocialAuthButtons({ onSuccess, onNeedsName, disabled = false }: SocialAuthButtonsProps) {
  const { isAppleAvailable, signInWithGoogle, signInWithApple } = useSocialAuth();
  const { editorial, effective } = useTheme();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const busy = pending || disabled;

  const run = async (flow: () => Promise<SocialResult>) => {
    if (busy) return;
    setPending(true);
    setError('');
    try {
      const result = await flow();
      // A dismissed sheet is a decision, not a failure — say nothing.
      if (result.status === 'success') {
        onSuccess();
      } else if (result.status === 'needs-name') {
        if (onNeedsName) onNeedsName();
        else setError('We need your name to finish. Please create your account with an email address.');
      } else if (result.status === 'error') {
        setError(result.message);
      }
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
        // Sized by a plain View so the surrounding layout doesn't depend on
        // what the native Apple button reports to Yoga.
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
