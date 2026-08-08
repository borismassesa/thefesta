import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';
import type { SignInResource, SignInSecondFactor, AttemptSecondFactorParams } from '@clerk/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthField } from '@/components/auth/AuthField';
import { AuthSubmit } from '@/components/auth/AuthSubmit';
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons';
import { BackButton } from '@/components/navigation/BackButton';
import { getClerkErrorCode, getErrorMessage } from '@/lib/errors';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type SecondFactorStrategy = 'totp' | 'phone_code' | 'email_code' | 'backup_code';

const SECOND_FACTOR_PRIORITY: SecondFactorStrategy[] = ['totp', 'phone_code', 'email_code', 'backup_code'];

const SECOND_FACTOR_LABEL: Record<SecondFactorStrategy, string> = {
  totp: 'Authenticator code',
  phone_code: 'Verification code',
  email_code: 'Verification code',
  backup_code: 'Backup code',
};

type Step =
  | { name: 'identifier' }
  | { name: 'password' }
  | { name: 'email_code'; emailAddressId: string }
  | { name: 'second_factor'; strategy: SecondFactorStrategy };

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  // Sign-up hands the address over when the email is already registered, so
  // the user doesn't retype what they just typed.
  const params = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>({ name: 'identifier' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Held apart from `error` because it renders an action, not a sentence.
  const [unknownEmail, setUnknownEmail] = useState(false);

  const finishSignIn = async (createdSessionId: string) => {
    if (!setActive) return;
    await setActive({ session: createdSessionId });
    router.replace('/');
  };

  const prepareSecondFactor = async (
    strategy: 'phone_code' | 'email_code',
    factors: SignInSecondFactor[],
  ) => {
    if (!signIn) return;
    if (strategy === 'phone_code') {
      const factor = factors.find((f) => f.strategy === 'phone_code');
      if (factor) await signIn.prepareSecondFactor({ strategy: 'phone_code', phoneNumberId: factor.phoneNumberId });
    } else {
      const factor = factors.find((f) => f.strategy === 'email_code');
      if (factor) await signIn.prepareSecondFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId });
    }
  };

  // Returns true once `result` has been fully handled (session started, second
  // factor step shown, or an error set) so callers don't need their own
  // fallback branch for the "needs verification" case.
  const handleFirstFactorResult = async (result: SignInResource) => {
    if (result.status === 'complete' && result.createdSessionId) {
      await finishSignIn(result.createdSessionId);
      return true;
    }
    if (result.status === 'needs_second_factor') {
      const factors = result.supportedSecondFactors ?? [];
      const strategy = SECOND_FACTOR_PRIORITY.find((s) => factors.some((f) => f.strategy === s));
      if (!strategy) {
        setError("This account requires a two-factor method that isn't supported here yet. Contact support.");
        return true;
      }
      if (strategy === 'phone_code' || strategy === 'email_code') {
        await prepareSecondFactor(strategy, factors);
      }
      setCode('');
      setStep({ name: 'second_factor', strategy });
      return true;
    }
    return false;
  };

  const handleContinue = async () => {
    if (!isLoaded || !signIn || !isValidEmail(email) || loading) return;
    setLoading(true);
    setError('');
    setUnknownEmail(false);
    try {
      const result = await signIn.create({ identifier: email });
      if (result.status === 'complete' && result.createdSessionId) {
        await finishSignIn(result.createdSessionId);
        return;
      }

      const factors = result.supportedFirstFactors ?? [];
      if (factors.some((f) => f.strategy === 'password')) {
        setStep({ name: 'password' });
        return;
      }

      const emailCodeFactor = factors.find((f) => f.strategy === 'email_code');
      if (emailCodeFactor && 'emailAddressId' in emailCodeFactor) {
        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: emailCodeFactor.emailAddressId,
        });
        setStep({ name: 'email_code', emailAddressId: emailCodeFactor.emailAddressId });
        return;
      }

      setError("This account signs in a way that isn't supported here yet. Try the web app instead.");
    } catch (err) {
      // "No such identifier" is an invitation to sign up, not an error to read.
      if (getClerkErrorCode(err) === 'form_identifier_not_found') {
        setUnknownEmail(true);
      } else {
        setError(getErrorMessage(err, "Couldn't find that account"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async () => {
    if (!isLoaded || !signIn || password.length === 0 || loading) return;
    setLoading(true);
    setError('');
    try {
      const result = await signIn.attemptFirstFactor({ strategy: 'password', password });
      const handled = await handleFirstFactorResult(result);
      if (!handled) {
        setError('Sign in could not be completed. Please try again.');
      }
    } catch (err) {
      // This instance has enforce_hibp_on_sign_in on, so a correct password
      // that has since appeared in a breach is refused here. Resetting is the
      // only way through, so say that rather than "incorrect password".
      if (getClerkErrorCode(err) === 'form_password_pwned') {
        setError(
          'This password has appeared in a data breach, so it can no longer be used. Use “Forgot password?” to set a new one.',
        );
      } else {
        setError(getErrorMessage(err, 'Incorrect password'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async () => {
    if (!isLoaded || !signIn || code.length === 0 || loading) return;
    setLoading(true);
    setError('');
    try {
      const result = await signIn.attemptFirstFactor({ strategy: 'email_code', code });
      const handled = await handleFirstFactorResult(result);
      if (!handled) {
        setError("That code didn't work. Please try again.");
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Verification failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!isLoaded || !signIn || step.name !== 'email_code' || loading) return;
    setError('');
    try {
      await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId: step.emailAddressId });
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't resend the code"));
    }
  };

  const handleSecondFactorSubmit = async () => {
    if (!isLoaded || !signIn || step.name !== 'second_factor' || code.length === 0 || loading) return;
    setLoading(true);
    setError('');
    try {
      const result = await signIn.attemptSecondFactor({
        strategy: step.strategy,
        code,
      } as AttemptSecondFactorParams);
      if (result.status === 'complete' && result.createdSessionId) {
        await finishSignIn(result.createdSessionId);
      } else {
        setError("That code didn't work. Please try again.");
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Verification failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendSecondFactorCode = async () => {
    if (!isLoaded || !signIn || step.name !== 'second_factor' || loading) return;
    if (step.strategy !== 'phone_code' && step.strategy !== 'email_code') return;
    setError('');
    try {
      await prepareSecondFactor(step.strategy, signIn.supportedSecondFactors ?? []);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't resend the code"));
    }
  };

  const heading =
    step.name === 'identifier'
      ? 'Welcome back'
      : step.name === 'password'
        ? 'Enter your password'
        : step.name === 'email_code'
          ? 'Check your email'
          : 'Two-factor verification';

  const subheading =
    step.name === 'identifier'
      ? 'Sign in to see your wedding dashboard.'
      : step.name === 'password'
        ? `Signing in as ${email}.`
        : step.name === 'email_code'
          ? `We sent a 6-digit code to ${email}.`
          : step.strategy === 'totp'
            ? 'Enter the 6-digit code from your authenticator app.'
            : step.strategy === 'phone_code'
              ? 'We sent a 6-digit code to your phone.'
              : step.strategy === 'email_code'
                ? `We sent a 6-digit code to ${email}.`
                : 'Enter one of your backup codes.';

  return (
    <SafeAreaView className="flex-1 bg-ed-bg">
      <View className="px-4 pt-2">
        <BackButton />
      </View>
      {/* Top-aligned and scrollable rather than vertically centred. Centring
          only works while the content is shorter than the visible area, and
          these screens grew past that once social sign-in was added — the
          overflow then sits outside the scroll view's frame, where it still
          draws but no longer receives touches. */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 64 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
          <Text className="font-playfair-bold text-display text-ed-on-surface">OpusPass</Text>
          <Text className="mt-2 font-inter-semibold text-screen-title text-ed-on-surface">{heading}</Text>
          <Text className="mt-1 font-inter text-body-sm text-ed-on-surface-variant">{subheading}</Text>

          <View className="mt-8 gap-4">
            {step.name === 'identifier' ? (
              <AuthField
                label="Email"
                value={email}
                onChangeText={(next) => {
                  setEmail(next);
                  setUnknownEmail(false);
                }}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoFocus
              />
            ) : null}

            {step.name === 'password' ? (
              <View>
                <AuthField
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry
                  autoComplete="password"
                  autoFocus
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/(auth)/forgot-password', params: { email } })}
                  className="mt-2 self-start"
                >
                  <Text className="font-inter-medium text-body-sm text-ed-secondary">Forgot password?</Text>
                </Pressable>
              </View>
            ) : null}

            {step.name === 'email_code' ? (
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
                <Pressable accessibilityRole="button" onPress={handleResendCode} className="mt-2 self-start">
                  <Text className="font-inter-medium text-body-sm text-ed-secondary">Resend code</Text>
                </Pressable>
              </View>
            ) : null}

            {step.name === 'second_factor' ? (
              <View>
                <AuthField
                  label={SECOND_FACTOR_LABEL[step.strategy]}
                  code
                  value={code}
                  onChangeText={setCode}
                  placeholder={step.strategy === 'backup_code' ? 'Enter backup code' : '123456'}
                  keyboardType={step.strategy === 'backup_code' ? 'default' : 'number-pad'}
                  autoCapitalize="none"
                  maxLength={step.strategy === 'backup_code' ? undefined : 6}
                  autoFocus
                />
                {step.strategy === 'phone_code' || step.strategy === 'email_code' ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleResendSecondFactorCode}
                    className="mt-2 self-start"
                  >
                    <Text className="font-inter-medium text-body-sm text-ed-secondary">Resend code</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {unknownEmail ? (
              <View className="rounded-xl border border-ed-outline-variant bg-ed-surface p-4">
                <Text className="font-inter text-body-sm text-ed-on-surface">
                  We couldn&apos;t find an account for {email}.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/(auth)/sign-up', params: { email } })}
                  className="mt-2 self-start"
                >
                  <Text className="font-inter-semibold text-body-sm text-ed-secondary">Create an account</Text>
                </Pressable>
              </View>
            ) : null}

            {error ? <Text className="font-inter text-body-sm text-ed-error">{error}</Text> : null}

            <AuthSubmit
              label={step.name === 'identifier' ? 'Continue' : 'Sign in'}
              loading={loading}
              onPress={
                step.name === 'identifier'
                  ? handleContinue
                  : step.name === 'password'
                    ? handlePasswordSubmit
                    : step.name === 'email_code'
                      ? handleCodeSubmit
                      : handleSecondFactorSubmit
              }
            />

            {step.name === 'identifier' ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/(auth)/sign-up', params: { email } })}
                  className="items-center py-2"
                >
                  <Text className="font-inter-medium text-body-sm text-ed-on-surface-variant">
                    New to OpusPass? <Text className="text-ed-secondary">Create an account</Text>
                  </Text>
                </Pressable>
                <SocialAuthButtons
                  onSuccess={() => router.replace('/')}
                  // The pending sign-up lives on Clerk's client, so sign-up
                  // picks it up on arrival and asks for the missing name.
                  onNeedsName={() => router.push('/(auth)/sign-up')}
                  disabled={loading}
                />
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setStep({ name: 'identifier' });
                  setError('');
                  setPassword('');
                  setCode('');
                }}
                className="items-center py-2"
              >
                <Text className="font-inter-medium text-body-sm text-ed-on-surface-variant">
                  Use a different email
                </Text>
              </Pressable>
            )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
