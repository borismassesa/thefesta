import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GuestAvatar } from '@/components/scanner/GuestAvatar';
import { GuestConfirmCard } from '@/components/scanner/GuestConfirmCard';
import { PartyBadge } from '@/components/scanner/PartyBadge';
import { ACCENT } from '@/theme/brand';
import { useTheme } from '@/theme/useTheme';
import type { CheckinScanResult, RosterEntry } from '@/types/checkin';

/** Brand green, matching the live/active pills used elsewhere in the product. */
const LIVE_GREEN = '#9FE870';

/** Entry codes are 6 characters of Crockford-style base32 (no I/L/O/U). */
const CODE_LENGTH = 6;

/** Fold typing variations onto the stored form, exactly as the server does. */
function normaliseCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .slice(0, CODE_LENGTH);
}

type Mode = 'code' | 'name';

interface ManualCheckinSheetProps {
  visible: boolean;
  /** Which way the sheet opens. "QR not working" wants the keypad; a
   *  "find by name" entry point wants the search. */
  initialMode?: Mode;
  onClose: () => void;
  roster: RosterEntry[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Admit with the headcount the attendant confirmed on the card. */
  onAdmit: (guest: RosterEntry, arrived: number) => Promise<CheckinScanResult>;
  onAdmitByCode: (code: string) => Promise<CheckinScanResult>;
  onAdmitted: (result: CheckinScanResult) => void;
}

/**
 * Manual check-in for a guest whose QR won't scan.
 *
 * Opens on code entry, not search: this sheet is reached from "QR not
 * working", where the attendant is holding a ticket with a printed code. A
 * search field framed that as looking someone up, which is the slower,
 * second-choice path — offered here as a fallback for a ticket that is torn
 * or unreadable.
 *
 * A sheet rather than a pushed route so the camera is never torn down, and
 * every admission here is flagged in the audit trail as scan-less.
 */
export function ManualCheckinSheet({
  visible,
  initialMode = 'code',
  onClose,
  roster,
  isLoading,
  isError,
  onRetry,
  onAdmit,
  onAdmitByCode,
  onAdmitted,
}: ManualCheckinSheetProps) {
  const { editorial } = useTheme();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [code, setCode] = useState('');
  const [query, setQuery] = useState('');
  const [admitting, setAdmitting] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  /** Guest picked from the search results, awaiting confirmation. */
  const [confirming, setConfirming] = useState<RosterEntry | null>(null);

  const codeInputRef = useRef<TextInput>(null);
  const nameInputRef = useRef<TextInput>(null);

  // Reset between openings — stale input from the last guest would be worse
  // than useless with a queue moving.
  useEffect(() => {
    if (visible) {
      setMode(initialMode);
      return;
    }
    if (!visible) {
      setCode('');
      setQuery('');
      setAdmitting(null);
      setCodeError(null);
      setConfirming(null);
    }
  }, [visible, initialMode]);

  const focusFor = (next: Mode) => {
    // Let the swap render before focusing, or the keyboard attaches to the
    // field that just unmounted.
    setTimeout(() => {
      (next === 'code' ? codeInputRef : nameInputRef).current?.focus();
    }, 60);
  };

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...roster]
      .filter((g) => (needle ? g.fullName.toLowerCase().includes(needle) : true))
      .sort((a, b) => {
        const arrivedDiff = Number(Boolean(a.checkedInAt)) - Number(Boolean(b.checkedInAt));
        return arrivedDiff !== 0 ? arrivedDiff : a.fullName.localeCompare(b.fullName);
      });
  }, [roster, query]);

  const finish = (result: CheckinScanResult) => {
    onClose();
    onAdmitted(result);
  };

  const submitCode = async (value: string) => {
    if (admitting || value.length !== CODE_LENGTH) return;
    setAdmitting('code');
    setCodeError(null);
    try {
      const result = await onAdmitByCode(value);

      // A wrong code is a typo, not an outcome worth taking over the screen:
      // stay put, say so inline, and clear for an immediate retype.
      if (result.status === 'invalid') {
        setCodeError(result.message ?? 'No guest found with that code.');
        setCode('');
        focusFor('code');
        return;
      }

      // A network failure says nothing about the code, so keep what they
      // typed — closing here would make them re-enter a code that was fine.
      if (result.status === 'error') {
        setCodeError(result.message ?? "Couldn't reach the server.");
        return;
      }

      // success / duplicate are real answers about the guest: hand them to the
      // full-screen overlay, same as a scan.
      finish(result);
    } finally {
      setAdmitting(null);
    }
  };

  const onCodeChange = (next: string) => {
    const cleaned = normaliseCode(next);
    setCode(cleaned);
    if (codeError) setCodeError(null);
    // Submit the moment it's complete — at a door, an extra tap per guest adds up.
    if (cleaned.length === CODE_LENGTH) void submitCode(cleaned);
  };

  const admitGuest = async (guest: RosterEntry, arrived: number) => {
    if (admitting) return;
    setAdmitting(guest.invitationId);
    try {
      const result = await onAdmit(guest, arrived);
      setConfirming(null);
      finish(result);
    } finally {
      setAdmitting(null);
    }
  };

  const busyOnCode = admitting === 'code';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onShow={() => focusFor(initialMode)}
    >
      <SafeAreaView className="flex-1 bg-ed-bg">
        <View className="flex-row items-center justify-between border-b border-ed-outline-variant px-5 py-4">
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
            <Text className="font-work-sans text-[15px] text-ed-on-surface">Cancel</Text>
          </Pressable>
          <Text className="font-work-sans-bold text-[17px] text-ed-on-surface">
            {mode === 'code' ? 'Enter ticket code' : 'Find guest by name'}
          </Text>
          {/* Mode toggle. Lives here rather than as a line of copy under the
              cells: it's navigation between two ways of doing the same job,
              and a sentence there competed with the code entry itself. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              mode === 'code' ? 'Search by name instead' : 'Enter ticket code instead'
            }
            hitSlop={10}
            onPress={() => {
              const next: Mode = mode === 'code' ? 'name' : 'code';
              setMode(next);
              focusFor(next);
            }}
            className="h-9 w-[52px] items-end justify-center"
          >
            <Ionicons
              name={mode === 'code' ? 'search' : 'keypad'}
              size={20}
              color={editorial.onSurface}
            />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {mode === 'code' ? (
            <View className="px-5 pt-8">
              <Text className="text-center font-work-sans text-sm leading-5 text-ed-on-surface-variant">
                Type the {CODE_LENGTH}-character code printed under the QR on the
                guest&apos;s ticket.
              </Text>

              {/* Character cells with one hidden input behind them. Reads as
                  entering a code rather than searching, and shows progress
                  through the six characters as they type. */}
              <Pressable
                accessibilityRole="none"
                onPress={() => codeInputRef.current?.focus()}
                className="mt-7 flex-row justify-center gap-2"
              >
                {Array.from({ length: CODE_LENGTH }).map((_, i) => {
                  const char = code[i];
                  const isCursor = i === code.length && !busyOnCode;
                  return (
                    <View
                      key={i}
                      className="h-14 w-12 items-center justify-center rounded-2xl bg-ed-surface"
                      style={{
                        borderWidth: isCursor ? 2 : 1,
                        borderColor: codeError
                          ? editorial.error
                          : isCursor
                            ? ACCENT
                            : editorial.outlineVariant,
                      }}
                    >
                      <Text className="font-work-sans-bold text-2xl text-ed-on-surface">
                        {char ?? ''}
                      </Text>
                    </View>
                  );
                })}

                <TextInput
                  ref={codeInputRef}
                  value={code}
                  onChangeText={onCodeChange}
                  maxLength={CODE_LENGTH}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="off"
                  editable={!busyOnCode}
                  // Visually hidden but still the real focus target, so the
                  // system keyboard and paste behave normally.
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    opacity: 0,
                  }}
                />
              </Pressable>

              {codeError ? (
                <View className="mt-4 flex-row items-center justify-center gap-1.5">
                  <Ionicons name="alert-circle" size={15} color={editorial.error} />
                  <Text className="font-work-sans text-sm text-ed-error">{codeError}</Text>
                </View>
              ) : null}

              {busyOnCode ? (
                <View className="mt-6 items-center">
                  <ActivityIndicator color={editorial.secondary} />
                </View>
              ) : codeError && code.length === CODE_LENGTH ? (
                // Only reachable after a network failure, where the code is
                // kept. Auto-submit fires on change, so an unchanged code
                // needs an explicit way to try again.
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void submitCode(code)}
                  className="mt-6 h-12 flex-row items-center justify-center gap-2 self-center rounded-full px-6"
                  style={{ backgroundColor: ACCENT }}
                >
                  <Ionicons name="refresh" size={16} color="#1A1A1A" />
                  <Text
                    className="font-work-sans-bold text-sm uppercase tracking-[1px]"
                    style={{ color: '#1A1A1A' }}
                  >
                    Try again
                  </Text>
                </Pressable>
              ) : null}

            </View>
          ) : (
            <>
              <View className="px-5 pt-4">
                <View className="flex-row items-center rounded-full border border-ed-outline-variant bg-ed-surface px-4 py-3">
                  <Ionicons name="search-outline" size={17} color={editorial.onSurfaceVariant} />
                  <TextInput
                    ref={nameInputRef}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search the guest's name"
                    placeholderTextColor={editorial.onSurfaceVariant}
                    autoCorrect={false}
                    autoCapitalize="words"
                    returnKeyType="search"
                    className="ml-2 flex-1 font-work-sans text-base text-ed-on-surface"
                  />
                  {query ? (
                    <Pressable onPress={() => setQuery('')} hitSlop={10}>
                      <Ionicons
                        name="close-circle"
                        size={18}
                        color={editorial.onSurfaceVariant}
                      />
                    </Pressable>
                  ) : null}
                </View>

              </View>

              {isLoading ? (
                <View className="mt-16 items-center">
                  <ActivityIndicator color={editorial.secondary} />
                </View>
              ) : isError ? (
                <View className="mt-16 items-center px-8">
                  <Ionicons name="cloud-offline-outline" size={30} color={editorial.error} />
                  <Text className="mt-3 text-center font-work-sans text-sm text-ed-on-surface-variant">
                    Couldn&apos;t load the guest list. You can still check a guest
                    in with the code from their ticket.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={onRetry}
                    className="mt-4 rounded-full border border-ed-outline-variant px-5 py-2.5"
                  >
                    <Text className="font-work-sans-bold text-[13px] text-ed-on-surface">
                      Try again
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <FlatList
                  data={results}
                  keyExtractor={(g) => g.invitationId}
                  contentContainerClassName="px-5 pb-10 pt-4"
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  ListEmptyComponent={
                    <View className="mt-14 items-center px-8">
                      <Ionicons
                        name="person-outline"
                        size={30}
                        color={editorial.onSurfaceVariant}
                      />
                      <Text className="mt-3 text-center font-work-sans text-sm text-ed-on-surface-variant">
                        {query
                          ? `No guest matching “${query.trim()}”.`
                          : 'No guests on this list yet.'}
                      </Text>
                    </View>
                  }
                  renderItem={({ item }) => {
                    const arrived = Boolean(item.checkedInAt);
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ disabled: Boolean(admitting) }}
                        disabled={Boolean(admitting)}
                        // Opens the confirmation rather than admitting outright:
                        // there is no QR backing this path, so the attendant has
                        // to see who they are about to let in. Guests already
                        // inside stay tappable — the card is also how you check
                        // when and by which door they came through.
                        onPress={() => setConfirming(item)}
                        className="mb-3 flex-row items-center gap-3 rounded-2xl border border-ed-outline-variant bg-ed-surface p-4"
                        style={{ opacity: arrived ? 0.6 : 1 }}
                      >
                        <GuestAvatar fullName={item.fullName} colorKey={item.groupTag} />

                        <View className="min-w-0 flex-1">
                          <View className="flex-row items-center gap-2">
                            <Text
                              className="shrink font-work-sans-bold text-[15px] text-ed-on-surface"
                              numberOfLines={1}
                            >
                              {item.fullName}
                            </Text>
                            {item.isVip ? (
                              <View
                                className="shrink-0 rounded-full px-2 py-0.5"
                                style={{ backgroundColor: LIVE_GREEN }}
                              >
                                <Text
                                  className="font-work-sans-bold text-[9px] uppercase"
                                  style={{ color: '#1A1A1A' }}
                                >
                                  VIP
                                </Text>
                              </View>
                            ) : null}
                          </View>

                          {/* The badge names the ticket type, so this row
                              only carries the printed code and, once used,
                              the arrival detail. */}
                          {item.entryCode || arrived ? (
                            <View className="mt-1 flex-row items-center gap-2">
                              {item.entryCode ? (
                                <Text className="font-work-sans-bold text-[11px] tracking-[1px] text-ed-on-surface-variant">
                                  {item.entryCode}
                                </Text>
                              ) : null}
                              {arrived ? (
                                <Text
                                  className="shrink font-work-sans text-xs text-ed-on-surface-variant"
                                  numberOfLines={1}
                                >
                                  Already checked in ·{' '}
                                  {item.checkedInPartySize ?? item.partySize} of {item.partySize}
                                </Text>
                              ) : null}
                            </View>
                          ) : null}
                        </View>

                        {arrived ? (
                          <Ionicons name="checkmark-circle" size={24} color="#1B7F4C" />
                        ) : (
                          <PartyBadge partySize={item.partySize} />
                        )}
                      </Pressable>
                    );
                  }}
                />
              )}
            </>
          )}
        </KeyboardAvoidingView>

        <GuestConfirmCard
          visible={Boolean(confirming)}
          guest={confirming}
          busy={Boolean(admitting)}
          onCancel={() => setConfirming(null)}
          onConfirm={(guest, arrived) => void admitGuest(guest, arrived)}
        />
      </SafeAreaView>
    </Modal>
  );
}
