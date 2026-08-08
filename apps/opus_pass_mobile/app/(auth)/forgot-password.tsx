import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthField } from '@/components/auth/AuthField';
import { AuthSubmit } from '@/components/auth/AuthSubmit';
import { BackButton } from '@/components/navigation/BackButton';
import { getClerkErrorCode, getErrorMessage } from '@/lib/errors';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const MIN_PASSWORD_LENGTH = 8;
const RESEND_COOLDOWN_SECONDS = 30;

type Step = { name: 'request' } | { name: 'reset' };

/**
 * Password reset via `reset_password_email_code`.
 *
 * Both steps live on one screen rather than two routes so the email never has
 * to travel through route params and "resend" stays one tap away.
 */
export default function ForgotPasswordScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  // Sign-in hands over whatever the user already typed.
  const params = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<Step>({ name: 'request' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendCode = async () => {
    if (!signIn) return;
    await signIn.create({ strategy: 'reset_password_email_code', identifier: email });
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const handleRequest = async () => {
    if (!isLoaded || !signIn || loading) return;
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await sendCode();
      setCode('');
      setStep({ name: 'reset' });
    } catch (err) {
      // Never confirm whether an address is registered — that would turn this
      // screen into an account-enumeration oracle. Move on as if it worked.
      if (getClerkErrorCode(err) === 'form_identifier_not_found') {
        setNotice("If an account exists for that email, we've sent a code.");
        setCode('');
        setStep({ name: 'reset' });
      } else {
        setError(getErrorMessage(err, "Couldn't send a reset code"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!isLoaded || !signIn || loading) return;
    if (code.length === 0) {
      setError('Enter the code we emailed you.');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Your new password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password: newPassword,
      });

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive?.({ session: result.createdSessionId });
        router.replace('/');
        return;
      }

      if (result.status === 'needs_second_factor') {
        setError(
          "This account needs a two-factor code, which isn't supported here yet. Please reset your password on the web, or contact support.",
        );
        return;
      }

      setError("That code didn't work. Please try again.");
    } catch (err) {
      if (getClerkErrorCode(err) === 'form_password_pwned') {
        setError('That password has appeared in a data breach. Please choose another one.');
      } else {
        setError(getErrorMessage(err, "Couldn't reset your password"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!isLoaded || !signIn || cooldown > 0 || loading) return;
    setError('');
    try {
      await sendCode();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't resend the code"));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-ed-bg">
      <View className="px-4 pt-2">
        <BackButton />
      </View>
      {/* Top-aligned and scrollable — see the note in sign-in.tsx. */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 64 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
          <Text className="font-playfair-bold text-display text-ed-on-surface">OpusPass</Text>
          <Text className="mt-2 font-inter-semibold text-screen-title text-ed-on-surface">
            {step.name === 'request' ? 'Reset your password' : 'Choose a new password'}
          </Text>
          <Text className="mt-1 font-inter text-body-sm text-ed-on-surface-variant">
            {step.name === 'request'
              ? "Enter your email and we'll send you a code."
              : `Enter the code we sent to ${email} and your new password.`}
          </Text>

          <View className="mt-8 gap-4">
            {step.name === 'request' ? (
              <AuthField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoFocus
              />
            ) : (
              <>
                <View>
                  <AuthField
                    label="Verification code"
                    code
                    value={code}
                    onChangeText={setCode}
                    placeholder="123456"
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleResend}
                    disabled={cooldown > 0}
                    className="mt-2 self-start"
                  >
                    <Text
                      className={`font-inter-medium text-body-sm ${
                        cooldown > 0 ? 'text-ed-on-surface-variant' : 'text-ed-secondary'
                      }`}
                    >
                      {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                    </Text>
                  </Pressable>
                </View>
                <AuthField
                  label="New password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 8 characters"
                  secureTextEntry
                  autoComplete="new-password"
                />
              </>
            )}

            {notice ? (
              <Text className="font-inter text-body-sm text-ed-on-surface-variant">{notice}</Text>
            ) : null}
            {error ? <Text className="font-inter text-body-sm text-ed-error">{error}</Text> : null}

            <AuthSubmit
              label={step.name === 'request' ? 'Send code' : 'Reset password'}
              loading={loading}
              onPress={step.name === 'request' ? handleRequest : handleReset}
            />

            {step.name === 'reset' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setStep({ name: 'request' });
                  setError('');
                  setNotice('');
                  setCode('');
                  setNewPassword('');
                }}
                className="items-center py-2"
              >
                <Text className="font-inter-medium text-body-sm text-ed-on-surface-variant">
                  Use a different email
                </Text>
              </Pressable>
            ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
