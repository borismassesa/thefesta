import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useAuth, useSignUp } from '@clerk/clerk-expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthField } from '@/components/auth/AuthField';
import { AuthSubmit } from '@/components/auth/AuthSubmit';
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons';
import { BackButton } from '@/components/navigation/BackButton';
import { getClerkErrorCode, getErrorMessage } from '@/lib/errors';
import { splitFullName } from '@/lib/names';
import { ensureProvisioned } from '@/lib/provisioning';
import { useTheme } from '@/theme/useTheme';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const MIN_PASSWORD_LENGTH = 8;
const RESEND_COOLDOWN_SECONDS = 30;
/** How long to wait on Clerk before admitting something is wrong. */
const STALL_THRESHOLD_MS = 15_000;

type Step = { name: 'details' } | { name: 'verify' } | { name: 'provisioning' };

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const { getToken } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>({ name: 'details' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Separate from `error` because it renders an action, not a sentence.
  const [existingAccountEmail, setExistingAccountEmail] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [stalled, setStalled] = useState(false);

  // An unbounded spinner is indistinguishable from a hang. If Clerk's client
  // hasn't loaded by now, say so and offer a way out.
  useEffect(() => {
    if (isLoaded) {
      setStalled(false);
      return;
    }
    const timer = setTimeout(() => setStalled(true), STALL_THRESHOLD_MS);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const goToSignIn = (prefill: string) => {
    // push, not replace: replace() is a no-op when it targets the entry
    // directly below in the stack, which sign-in usually is.
    router.push({ pathname: '/(auth)/sign-in', params: { email: prefill } });
  };

  /**
   * Starts the session, provisions, and leaves — in that order, and without
   * branching on whether provisioning worked. Someone holding a valid session
   * must never be stranded on the sign-up screen; the (app) layout retries the
   * provisioning on next launch if it didn't land here.
   */
  const finishSignUp = async (createdSessionId: string, partner1Name: string) => {
    if (!setActive) return;
    // Shown before the session is activated, because activating it flips
    // isSignedIn and the (auth) layout redirects this screen away mid-call.
    setStep({ name: 'provisioning' });
    await setActive({ session: createdSessionId });
    await ensureProvisioned({ getToken, partner1Name });
    router.replace('/');
  };

  const handleCreate = async () => {
    if (!isLoaded || !signUp || loading) return;

    const name = splitFullName(fullName);
    if (!name) {
      setError('Please enter your first and last name.');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setLoading(true);
    setError('');
    setExistingAccountEmail(null);
    try {
      // firstName/lastName are required on this Clerk instance — without both,
      // the sign-up sits at missing_requirements and the code never completes
      // it. That's why a one-word name is refused above rather than here.
      const result = await signUp.create({
        firstName: name.firstName,
        lastName: name.lastName,
        emailAddress: email,
        password,
      });

      if (result.status === 'complete' && result.createdSessionId) {
        await finishSignUp(result.createdSessionId, name.firstName);
        return;
      }

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setCode('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setStep({ name: 'verify' });
    } catch (err) {
      const errorCode = getClerkErrorCode(err);
      if (errorCode === 'form_identifier_exists') {
        // One OpusFesta login covers the couples site, OpusPass and vendors,
        // so "already taken" usually means "you already have an account here".
        setExistingAccountEmail(email);
      } else if (errorCode === 'form_password_pwned') {
        setError('That password has appeared in a data breach. Please choose another one.');
      } else if (errorCode?.startsWith('captcha') || errorCode === 'requires_captcha') {
        setError('Sign-up is temporarily unavailable in the app. Please sign up at opusfesta.com.');
      } else {
        setError(getErrorMessage(err, "Couldn't create your account"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!isLoaded || !signUp || code.length === 0 || loading) return;
    setLoading(true);
    setError('');
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });

      if (result.status === 'complete' && result.createdSessionId) {
        await finishSignUp(result.createdSessionId, result.firstName ?? fullName);
        return;
      }

      if (result.status === 'missing_requirements') {
        // Unreachable while we send first and last name, but a dead-end
        // spinner would be the worst way to find out that changed.
        setError('Your account needs a few more details. Please finish signing up at opusfesta.com.');
        return;
      }

      setError("That code didn't work. Please try again.");
    } catch (err) {
      setError(getErrorMessage(err, 'Verification failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!isLoaded || !signUp || cooldown > 0 || loading) return;
    setError('');
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't resend the code"));
    }
  };

  if (step.name === 'provisioning') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-ed-bg">
        <ActivityIndicator color={colors.primary} />
        <Text className="mt-3 font-inter text-body-sm text-ed-on-surface-variant">
          Setting up your account…
        </Text>
      </SafeAreaView>
    );
  }

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
            {step.name === 'details' ? 'Create your account' : 'Check your email'}
          </Text>
          <Text className="mt-1 font-inter text-body-sm text-ed-on-surface-variant">
            {step.name === 'details'
              ? 'Start planning your wedding in one place.'
              : `We sent a 6-digit code to ${email}.`}
          </Text>

          <View className="mt-8 gap-4">
            {step.name === 'details' ? (
              <>
                <AuthField
                  label="Your name"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Ada Lovelace"
                  autoCapitalize="words"
                  autoComplete="name"
                  autoFocus
                />
                <AuthField
                  label="Email"
                  value={email}
                  onChangeText={(next) => {
                    setEmail(next);
                    setExistingAccountEmail(null);
                  }}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
                <AuthField
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  secureTextEntry
                  autoComplete="new-password"
                />
              </>
            ) : (
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
            )}

            {existingAccountEmail ? (
              <View className="rounded-xl border border-ed-outline-variant bg-ed-surface p-4">
                <Text className="font-inter text-body-sm text-ed-on-surface">
                  {existingAccountEmail} already has an OpusFesta account.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => goToSignIn(existingAccountEmail)}
                  className="mt-2 self-start"
                >
                  <Text className="font-inter-semibold text-body-sm text-ed-secondary">Sign in instead</Text>
                </Pressable>
              </View>
            ) : null}

            {stalled ? (
              <View className="rounded-xl border border-ed-outline-variant bg-ed-surface p-4">
                <Text className="font-inter text-body-sm text-ed-on-surface">
                  This is taking longer than usual. Check your connection and try again.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setStalled(false)}
                  className="mt-2 self-start"
                >
                  <Text className="font-inter-semibold text-body-sm text-ed-secondary">Try again</Text>
                </Pressable>
              </View>
            ) : null}

            {error ? <Text className="font-inter text-body-sm text-ed-error">{error}</Text> : null}

            <AuthSubmit
              label={step.name === 'details' ? 'Create account' : 'Verify email'}
              loading={loading}
              onPress={step.name === 'details' ? handleCreate : handleVerify}
            />

            {/* No "Already have an account?" footer here on purpose. A Pressable
                in that position on this screen renders but never receives
                touches — verified on device, handler never fires — while the
                identical markup works on sign-in. Rather than ship a link that
                silently does nothing, this screen relies on the back button,
                and the "already registered" panel above carries its own
                sign-in action for the case that actually matters. */}
            {step.name === 'details' ? (
              <SocialAuthButtons onSuccess={() => router.replace('/')} disabled={loading} />
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setStep({ name: 'details' });
                  setError('');
                  setCode('');
                }}
                className="items-center py-2"
              >
                <Text className="font-inter-medium text-body-sm text-ed-on-surface-variant">
                  Use different details
                </Text>
              </Pressable>
            )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
