import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BackButton } from '@/components/navigation/BackButton';
import { resolveAccessCode, validateScannerSession } from '@/lib/api/checkin';
import { getErrorMessage } from '@/lib/errors';
import { useScannerSession } from '@/hooks/useScannerSession';
import { ACCENT, ON_ACCENT } from '@/theme/brand';
import { useTheme } from '@/theme/useTheme';

/** Brand green used for live/active status pills across the product. */
const LIVE_GREEN = '#9FE870';

/**
 * `family` exists because Ionicons has no "QR inside a scan frame" glyph —
 * its `scan-outline` is an empty viewfinder, which doesn't say *what* is
 * being scanned. MaterialCommunityIcons' `qrcode-scan` does, so that one
 * step renders from a different set.
 */
const STEPS = [
  {
    family: 'ion',
    icon: 'key-outline',
    title: 'Enter your access code',
    body: 'The couple or the OpusFesta team gives you this before the event.',
  },
  {
    family: 'mci',
    icon: 'qrcode-scan',
    title: 'Scan entrance tickets',
    body: 'Point the camera at the QR code on each guest’s ticket.',
  },
  {
    family: 'ion',
    icon: 'checkmark-done-outline',
    title: 'Guests are checked in',
    body: 'Arrivals update live for the couple and the OpusFesta team.',
  },
] as const;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-inter-bold text-label uppercase tracking-[2px] text-ed-on-surface-variant">
      {children}
    </Text>
  );
}

/** Input with a leading glyph and a focus ring — plain bordered boxes read as unfinished. */
function Field({
  icon,
  value,
  onChangeText,
  placeholder,
  onSubmitEditing,
  autoCapitalize,
  autoCorrect,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  onSubmitEditing: () => void;
  autoCapitalize: 'none' | 'words';
  autoCorrect?: boolean;
}) {
  const { editorial } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View
      className="mt-2 flex-row items-center gap-3 rounded-2xl bg-ed-surface px-4"
      style={{
        borderWidth: focused ? 1.5 : 1,
        borderColor: focused ? ACCENT : editorial.outlineVariant,
      }}
    >
      <Ionicons
        name={icon}
        size={18}
        color={focused ? ACCENT : editorial.onSurfaceVariant}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={editorial.onSurfaceVariant}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        returnKeyType="go"
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="flex-1 py-3.5 font-inter text-body text-ed-on-surface"
      />
    </View>
  );
}

export default function ScannerEntryScreen() {
  const router = useRouter();
  const { editorial, colors } = useTheme();
  const { session, isLoading, saveSession, clearSession } = useScannerSession();

  const [code, setCode] = useState('');
  const [attendantName, setAttendantName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when an attendant with a running shift asks to enter a different code. */
  const [showCodeForm, setShowCodeForm] = useState(false);

  /** The running shift, or null while we're deliberately showing the code form
   *  over the top of it. Carries the session itself rather than a boolean so
   *  the JSX below narrows without non-null assertions. */
  const activeShift = showCodeForm ? null : session;

  const confirmEndShift = () => {
    Alert.alert(
      'End this shift?',
      "You'll need the access code again to start scanning for this event.",
      [
        { text: 'Keep scanning', style: 'cancel' },
        {
          text: 'End shift',
          style: 'destructive',
          onPress: () => {
            void clearSession();
            setShowCodeForm(false);
          },
        },
      ]
    );
  };

  /**
   * Deliberately gentler than ending a shift, because it is: the saved session
   * survives until a different code is actually validated, so this only warns
   * rather than treating it as destructive. The point is to stop an accidental
   * tap dropping the attendant into a code form mid-queue with no explanation.
   */
  const confirmNewShift = () => {
    const current = session?.eventName ?? 'your current shift';
    Alert.alert(
      'Start a new shift?',
      `You'll need an access code for the other event. ${current} stays saved until you enter a different one.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => setShowCodeForm(true) },
      ]
    );
  };

  const handleStart = async () => {
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const resolved = await resolveAccessCode(trimmed);
      if (!resolved.ok) {
        setError(resolved.error);
        return;
      }
      // Resolve only routes; validate is what actually confirms the code is
      // live and gives us the door label + whether an admin already named
      // the attendant.
      const validated = await validateScannerSession(resolved.eventId, trimmed);
      if (!validated.ok) {
        setError(validated.error);
        return;
      }
      await saveSession({
        eventId: resolved.eventId,
        accessToken: trimmed,
        doorLabel: validated.doorLabel,
        attendantName: validated.attendantName ?? attendantName.trim() ?? null,
        eventName: validated.event?.name ?? null,
        expiresAt: validated.expiresAt ?? null,
      });
      router.push(`/scanner/${resolved.eventId}/scan`);
    } catch (err) {
      setError(getErrorMessage(err, 'Something went wrong.'));
    } finally {
      setBusy(false);
    }
  };

  const resumeShift = () => {
    if (session) router.push(`/scanner/${session.eventId}/scan`);
  };

  const canStart = Boolean(code.trim()) && !busy;

  return (
    <View className="flex-1 bg-ed-bg">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="pb-16"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header sits on the plain app background — the surrounding cards
              and the accent icon carry the brand, so the page stays calm. */}
          <SafeAreaView edges={['top']}>
            <View className="px-5 pb-8 pt-2">
              <View className="flex-row items-center justify-between">
                <BackButton />
                {/* Only while the code form covers the shift. On the shift
                    card itself "Continue scanning" already does this job, and
                    two ways back to the same place is noise. Green ties it to
                    the "Shift in progress" pill. */}
                {session && showCodeForm ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back to your current shift"
                    onPress={() => setShowCodeForm(false)}
                    hitSlop={8}
                    className="h-10 flex-row items-center gap-1.5 rounded-full px-4"
                    style={{ backgroundColor: LIVE_GREEN }}
                  >
                    <Ionicons name="qr-code" size={14} color="#1A1A1A" />
                    <Text
                      className="font-inter-bold text-caption"
                      style={{ color: '#1A1A1A' }}
                    >
                      Your shift
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View className="mt-7 flex-row items-center gap-3">
                <View className="h-12 w-12 shrink-0 items-center justify-center">
                  <Ionicons name="qr-code" size={30} color={editorial.onSurface} />
                </View>
                {/* flex-1 so the title wraps inside the row on narrow screens
                    rather than pushing the icon off-screen. */}
                <Text className="flex-1 font-inter-bold text-screen-title leading-[34px] text-ed-on-surface">
                  OpusPass Check In
                </Text>
              </View>
              <Text className="mt-3 font-inter text-body-sm leading-5 text-ed-on-surface-variant">
                Every guest who RSVP&apos;d receives an entrance ticket. Scan its
                QR code as they arrive to check them in.
              </Text>
            </View>
          </SafeAreaView>

          <View className="px-5">
            {isLoading ? (
              <View className="mt-10 items-center">
                <ActivityIndicator color={editorial.secondary} />
              </View>
            ) : (
              <>
                {/* An attendant mid-shift wants one thing: get back to the
                    camera. Showing them a code form and a how-it-works primer
                    they've already been through buries that, so the shift owns
                    the screen and everything else moves behind a toggle. */}
                {activeShift ? (
                  <>
                    <View className="rounded-3xl border border-ed-outline-variant bg-ed-surface p-5">
                      {/* Title and status share a row, the status pinned
                          right. `items-start` so the pill sits on the title's
                          first line rather than drifting to the middle when a
                          long event name wraps. */}
                      <View className="flex-row items-start justify-between gap-3">
                        <Text
                          className="flex-1 font-inter-bold text-screen-title text-ed-on-surface"
                          numberOfLines={2}
                        >
                          {activeShift.eventName ?? 'Your shift'}
                        </Text>
                        <View
                          className="mt-1 shrink-0 rounded-full px-2.5 py-1"
                          style={{ backgroundColor: LIVE_GREEN }}
                        >
                          <Text
                            className="font-inter-bold text-label uppercase tracking-wide"
                            style={{ color: '#1A1A1A' }}
                          >
                            Shift in progress
                          </Text>
                        </View>
                      </View>

                      {/* Door and attendant as separate icon-led facts. A dot
                          separator ran them together as one string, which read
                          as though the person belonged to the gate name. */}
                      <View className="mt-3 flex-row flex-wrap items-center gap-x-5 gap-y-1.5">
                        <View className="flex-row items-center gap-1.5">
                          <MaterialCommunityIcons
                            name="door-open"
                            size={15}
                            color={editorial.onSurfaceVariant}
                          />
                          <Text
                            className="font-inter text-body-sm text-ed-on-surface-variant"
                            numberOfLines={1}
                          >
                            {activeShift.doorLabel}
                          </Text>
                        </View>
                        {activeShift.attendantName ? (
                          <View className="flex-row items-center gap-1.5">
                            <Ionicons
                              name="person-outline"
                              size={14}
                              color={editorial.onSurfaceVariant}
                            />
                            <Text
                              className="font-inter text-body-sm text-ed-on-surface-variant"
                              numberOfLines={1}
                            >
                              {activeShift.attendantName}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <Pressable
                        accessibilityRole="button"
                        onPress={resumeShift}
                        className="mt-5 h-14 flex-row items-center justify-center gap-2 rounded-full"
                        style={{ backgroundColor: ACCENT }}
                      >
                        <Ionicons name="qr-code" size={17} color={ON_ACCENT} />
                        <Text
                          className="font-inter-bold text-body-sm uppercase tracking-[1px]"
                          style={{ color: ON_ACCENT }}
                        >
                          Continue scanning
                        </Text>
                      </Pressable>

                      <View className="mt-3 flex-row gap-3">
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => router.push(`/scanner/${activeShift.eventId}/arrivals`)}
                          className="h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-full border border-ed-outline-variant"
                        >
                          <Ionicons
                            name="people-outline"
                            size={15}
                            color={editorial.onSurface}
                          />
                          <Text className="font-inter-semibold text-caption text-ed-on-surface">
                            Arrivals
                          </Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => router.push(`/scanner/${activeShift.eventId}/guests`)}
                          className="h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-full border border-ed-outline-variant"
                        >
                          <Ionicons
                            name="list-outline"
                            size={15}
                            color={editorial.onSurface}
                          />
                          <Text className="font-inter-semibold text-caption text-ed-on-surface">
                            Guest list
                          </Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* Both shift-level actions are real buttons, not text
                        links: each one costs the attendant their current
                        session, so they need the weight and hit area of a
                        control rather than something that reads as a caption. */}
                    <View className="mt-4 flex-row gap-3">
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Start a new shift with a different access code"
                        onPress={confirmNewShift}
                        className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-full border"
                        style={{ borderColor: colors.green }}
                      >
                        <Ionicons name="add" size={17} color={colors.green} />
                        <Text className="font-inter-bold text-caption text-of-green">
                          New shift
                        </Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        onPress={confirmEndShift}
                        className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-full border"
                        style={{ borderColor: editorial.error }}
                      >
                        <Ionicons name="log-out-outline" size={16} color={editorial.error} />
                        <Text className="font-inter-bold text-caption text-ed-error">
                          End shift
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}

                {/* Code entry. Hidden while a shift is running unless the
                    attendant explicitly asks to switch events. */}
                {activeShift ? null : (
                  <>
                <View
                  className="rounded-3xl border border-ed-outline-variant bg-ed-surface p-5"
                >
                  <FieldLabel>Access code</FieldLabel>
                  <Field
                    icon="key-outline"
                    value={code}
                    onChangeText={(next) => {
                      setCode(next);
                      if (error) setError(null);
                    }}
                    placeholder="Paste or type the code"
                    onSubmitEditing={handleStart}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <View className="mt-6">
                    <FieldLabel>Your name</FieldLabel>
                    {/* One line, no caveat: the "code already has a name"
                        case resolves itself server-side, so spelling it out
                        only asked the attendant to hold a rule they can't
                        act on. */}
                    <Text className="mt-1.5 font-inter text-caption leading-5 text-ed-on-surface-variant">
                      Recorded against every guest you check in.
                    </Text>
                    <Field
                      icon="person-outline"
                      value={attendantName}
                      onChangeText={setAttendantName}
                      placeholder="e.g. Asha"
                      onSubmitEditing={handleStart}
                      autoCapitalize="words"
                    />
                  </View>

                  {error ? (
                    <View
                      className="mt-4 flex-row items-start gap-2 rounded-2xl border p-3"
                      style={{
                        borderColor: editorial.error,
                        backgroundColor: `${editorial.error}14`,
                      }}
                    >
                      <Ionicons name="alert-circle" size={16} color={editorial.error} />
                      <Text className="flex-1 font-inter text-body-sm text-ed-error">
                        {error}
                      </Text>
                    </View>
                  ) : null}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canStart }}
                    disabled={!canStart}
                    onPress={handleStart}
                    className="mt-6 h-14 flex-row items-center justify-center gap-2 rounded-full"
                    style={{
                      backgroundColor: canStart
                        ? ACCENT
                        : editorial.surfaceContainerHigh,
                    }}
                  >
                    {busy ? (
                      <ActivityIndicator color={ON_ACCENT} />
                    ) : (
                      <>
                        <Text
                          className="font-inter-bold text-body-sm uppercase tracking-[1px]"
                          style={{
                            color: canStart ? ON_ACCENT : editorial.onSurfaceVariant,
                          }}
                        >
                          Start scanning
                        </Text>
                        <Ionicons
                          name="arrow-forward"
                          size={16}
                          color={canStart ? ON_ACCENT : editorial.onSurfaceVariant}
                        />
                      </>
                    )}
                  </Pressable>

                  <View className="mt-4 flex-row items-center justify-center gap-1.5">
                    <Ionicons name="lock-closed" size={12} color="#059669" />
                    <Text className="font-inter text-caption text-ed-on-surface-variant">
                      Access codes work for one event only.
                    </Text>
                  </View>
                </View>

                {/* How it works — gives the lower half of the screen a job
                    instead of leaving it empty under the form. */}
                <Text className="mt-9 font-inter-bold text-label uppercase tracking-[2px] text-ed-on-surface-variant">
                  How a shift runs
                </Text>
                <View className="mt-3.5">
                  {STEPS.map((step, index) => (
                    <View key={step.title} className="flex-row gap-3.5">
                      {/* Rail: numbered node plus the connector to the next step. */}
                      <View className="items-center">
                        <View className="h-9 w-9 items-center justify-center">
                          {step.family === 'mci' ? (
                            <MaterialCommunityIcons
                              name={step.icon}
                              size={19}
                              color={editorial.onSurface}
                            />
                          ) : (
                            <Ionicons
                              name={step.icon}
                              size={18}
                              color={editorial.onSurface}
                            />
                          )}
                        </View>
                        {index < STEPS.length - 1 ? (
                          <View
                            className="w-px flex-1"
                            style={{ backgroundColor: editorial.outlineVariant }}
                          />
                        ) : null}
                      </View>
                      <View className={index < STEPS.length - 1 ? 'flex-1 pb-5' : 'flex-1'}>
                        <Text className="font-inter-bold text-caption text-ed-on-surface">
                          {step.title}
                        </Text>
                        <Text className="mt-0.5 font-inter text-caption leading-5 text-ed-on-surface-variant">
                          {step.body}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                  </>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
