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
import type { CheckinScanResult, ManualLookupResult, RosterEntry } from '@/types/checkin';

/** Brand green, matching the live/active pills used elsewhere in the product. */
const LIVE_GREEN = '#9FE870';

/** A legacy entry code is 6 characters; a Pass ID is 8. Both are typed into
 *  the same box because a guest reading one out does not know which they have.
 *  Every issued ticket now prints an 8-character Pass ID, so 8 is what the box
 *  is sized and timed for; 6 stays accepted for tickets printed before it. */
const ENTRY_CODE_LENGTH = 6;
const PASS_ID_LENGTH = 8;
const MAX_IDENTIFIER_LENGTH = PASS_ID_LENGTH;

/** Fold typing variations onto the stored form, exactly as the server does.
 *  Mirrors normaliseTypedIdentifier in opus_pass lib/checkin/identifiers.ts —
 *  safe because the alphabet excludes O, I and L, so folding can only rescue a
 *  mistype and can never turn one valid identifier into another. */
function normaliseCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .slice(0, MAX_IDENTIFIER_LENGTH);
}

/** Whether a typed value is a complete identifier of either kind. */
function isCompleteIdentifier(value: string): boolean {
  return value.length === ENTRY_CODE_LENGTH || value.length === PASS_ID_LENGTH;
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
  /** Read-only lookup for a Pass ID: the guest to confirm, nothing matched, or
   *  why the question couldn't be answered. Writes nothing — admission is the
   *  separate onAdmit call the confirm card makes. */
  onLookup?: (passId: string) => Promise<ManualLookupResult>;
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
  onLookup,
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
  /** True while a picked guest's phone number is still being resolved. */
  const [phonePending, setPhonePending] = useState(false);
  /** Which guest-detail lookup is the current one, so a superseded reply
   *  cannot speak for the guest now on screen. */
  const detailRequest = useRef(0);

  const codeInputRef = useRef<TextInput>(null);
  const nameInputRef = useRef<TextInput>(null);

  /**
   * Held in a ref, not in `admitting`, because two triggers can fire for the
   * same code inside one tick: auto-submit when the eighth character lands,
   * and the keyboard's return key. State does not update until the next
   * render, so both would read `admitting` as null and both would go to the
   * server. A ref closes that window synchronously.
   */
  const submitLock = useRef(false);

  /**
   * The admission waiting to be handed up, held while the modals go away.
   *
   * An admission ends with up to two stacked modals on screen (this sheet,
   * and the confirm card inside it) and a full-screen result overlay to show
   * underneath them. Dismissing both in one frame leaves iOS with a window
   * that no longer draws but still takes touches: the attendant sees the
   * green "Checked in" screen and the door stops responding entirely. So the
   * teardown is sequenced — confirm card first, then this sheet, then the
   * result — each step waiting for the last to actually finish.
   */
  const pendingResult = useRef<CheckinScanResult | null>(null);


  // Reset between openings — stale input from the last guest would be worse
  // than useless with a queue moving.
  useEffect(() => {
    if (visible) {
      setMode(initialMode);
      // Cleared on OPEN, not on close. flushPending runs from a native
      // callback, and a callback is a thing that can fail to arrive; left set,
      // a stale result would make this sheet's next "Not this guest" close the
      // whole sheet, a failure with no visible connection to the admission
      // that caused it. It cannot be cleared on close: `visible` flips false
      // the moment onClose is called, which is BEFORE the dismissal completes,
      // so clearing there would throw away the very result being delivered.
      pendingResult.current = null;
      submitLock.current = false;
      return;
    }
    if (!visible) {
      setCode('');
      setQuery('');
      setAdmitting(null);
      setCodeError(null);
      setConfirming(null);
      setPhonePending(false);
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

  // Always eight slots: that is what a ticket prints, so the box should show
  // the shape the attendant is copying. A shorter legacy code simply leaves
  // the last two empty.
  const slotCount = PASS_ID_LENGTH;

  /** Hand the finished admission up, once nothing is left covering the screen. */
  const flushPending = () => {
    const result = pendingResult.current;
    pendingResult.current = null;
    if (result) onAdmitted(result);
  };

  // onDismiss is iOS-only. Elsewhere there is no completion callback, and no
  // stacked-modal problem to sequence around either, so run it straight away.
  const AWAITS_DISMISS = Platform.OS === 'ios';

  const finish = (result: CheckinScanResult) => {
    pendingResult.current = result;
    onClose();
    if (!AWAITS_DISMISS) flushPending();
  };

  const submitCode = async (value: string) => {
    if (submitLock.current || admitting || !isCompleteIdentifier(value)) return;
    submitLock.current = true;
    setAdmitting('code');
    setCodeError(null);
    try {
      // A Pass ID is looked up FIRST and shown for confirmation rather than
      // admitting on the spot. The whole reason a guest reads one out is that
      // something already went wrong, so the attendant needs to see who they
      // are looking at — right guest, right event, how many of the party are
      // left — before anyone is admitted. The lookup writes nothing.
      if (value.length === PASS_ID_LENGTH && onLookup) {
        const found = await onLookup(value);
        if (found.status === 'error') {
          // Keep what they typed. The Pass ID was never the problem, and
          // clearing it would make them retype a code that was fine.
          setCodeError(found.message);
          return;
        }
        if (found.status === 'not_found') {
          setCodeError('No guest found with that Pass ID.');
          setCode('');
          focusFor('code');
          return;
        }
        // Hand it to the same confirm card a roster pick uses, so admitting is
        // a deliberate second tap on both paths.
        setConfirming(found.guest);
        setCode('');
        return;
      }

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
      submitLock.current = false;
    }
  };

  const onCodeChange = (next: string) => {
    const cleaned = normaliseCode(next);
    setCode(cleaned);
    if (codeError) setCodeError(null);
    // Submit the moment a full Pass ID is there — at a door, an extra tap per
    // guest adds up. Only at eight: firing at six would submit the first six
    // characters of an eight-character Pass ID and clear the box before the
    // attendant could type the last two, which made Pass IDs impossible to
    // enter by hand. A six-character legacy code is submitted with the button
    // below instead.
    if (cleaned.length === PASS_ID_LENGTH) void submitCode(cleaned);
  };

  /**
   * Open the confirm card for a guest picked out of the search results, then
   * fill in the phone number the roster does not carry.
   *
   * The card opens on the roster row straight away rather than waiting for
   * the lookup: the attendant is identifying somebody standing in front of
   * them, and a network round trip in front of every admission is the wrong
   * trade. The number lands a moment later, or not at all.
   */
  const openConfirm = async (guest: RosterEntry) => {
    setConfirming(guest);
    const identifier = guest.passId ?? guest.entryCode;
    if (!identifier || !onLookup) return;
    // Only the newest pick owns the card. Two taps in a row leave two lookups
    // in flight, and whichever returns first must not speak for the other:
    // without this, a fast lookup for the guest the attendant has already
    // moved off would clear the pending flag and make the guest now on screen
    // read "Not recorded" until their own slower lookup landed.
    const request = (detailRequest.current += 1);
    setPhonePending(true);
    try {
      const found = await onLookup(identifier);
      if (detailRequest.current !== request || found.status !== 'found') return;
      setConfirming((current) =>
        current?.invitationId === found.guest.invitationId
          ? { ...current, phone: found.guest.phone }
          : current
      );
    } finally {
      if (detailRequest.current === request) setPhonePending(false);
    }
  };

  const admitGuest = async (guest: RosterEntry, arrived: number) => {
    if (admitting) return;
    setAdmitting(guest.invitationId);
    try {
      const result = await onAdmit(guest, arrived);
      pendingResult.current = result;
      // Only the confirm card starts closing here. This sheet follows from
      // its onDismissed, so the two never animate out on top of each other.
      setConfirming(null);
      if (!AWAITS_DISMISS) {
        onClose();
        flushPending();
      }
    } finally {
      setAdmitting(null);
    }
  };

  /** The confirm card has gone. Close this sheet too, but only when the card
   *  closed because a guest was admitted — "Not this guest" just goes back to
   *  the list, which is the whole point of that button. */
  const handleConfirmCardDismissed = () => {
    if (pendingResult.current) onClose();
  };

  const busyOnCode = admitting === 'code';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      // The result overlay is shown by the screen underneath, so it must not
      // appear until this sheet has actually left the screen.
      onDismiss={flushPending}
      onShow={() => focusFor(initialMode)}
    >
      <SafeAreaView className="flex-1 bg-ed-bg">
        <View className="flex-row items-center justify-between border-b border-ed-outline-variant px-5 py-4">
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
            <Text className="font-inter text-body-sm text-ed-on-surface">Cancel</Text>
          </Pressable>
          <Text className="font-inter-bold text-body text-ed-on-surface">
            {mode === 'code' ? 'Enter Pass ID or ticket code' : 'Find guest by name'}
          </Text>
          {/* Mode toggle. Lives here rather than as a line of copy under the
              cells: it's navigation between two ways of doing the same job,
              and a sentence there competed with the code entry itself. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              mode === 'code' ? 'Search by name instead' : 'Enter Pass ID or ticket code instead'
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
              <Text className="text-center font-inter text-body-sm leading-5 text-ed-on-surface-variant">
                Type the Pass ID or ticket code printed under the QR on the
                guest&apos;s ticket. A Pass ID shows the guest for you to check
                before anyone is admitted.
              </Text>

              {/* Character cells with one hidden input behind them. Reads as
                  entering a code rather than searching, and shows progress
                  through the eight characters as they type. */}
              <Pressable
                accessibilityRole="none"
                onPress={() => codeInputRef.current?.focus()}
                className="mt-7 flex-row justify-center gap-2"
              >
                {Array.from({ length: slotCount }).map((_, i) => {
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
                      <Text className="font-inter-bold text-screen-title text-ed-on-surface">
                        {char ?? ''}
                      </Text>
                    </View>
                  );
                })}

                <TextInput
                  ref={codeInputRef}
                  value={code}
                  onChangeText={onCodeChange}
                  maxLength={MAX_IDENTIFIER_LENGTH}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="off"
                  editable={!busyOnCode}
                  returnKeyType="go"
                  onSubmitEditing={() => void submitCode(code)}
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
                  <Text className="font-inter text-body-sm text-ed-error">{codeError}</Text>
                </View>
              ) : null}

              {busyOnCode ? (
                <View className="mt-6 items-center">
                  <ActivityIndicator color={editorial.secondary} />
                </View>
              ) : isCompleteIdentifier(code) ? (
                // Two cases, one button. A six-character legacy code is never
                // auto-submitted (an eight-character Pass ID passes through
                // six on its way), so it needs a deliberate submit. And after
                // a network failure the typed value is kept, so an unchanged
                // code needs a way to go again.
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void submitCode(code)}
                  className="mt-6 h-12 flex-row items-center justify-center gap-2 self-center rounded-full px-6"
                  style={{ backgroundColor: ACCENT }}
                >
                  <Ionicons
                    name={codeError ? 'refresh' : 'arrow-forward'}
                    size={16}
                    color="#1A1A1A"
                  />
                  <Text
                    className="font-inter-bold text-body-sm uppercase tracking-[1px]"
                    style={{ color: '#1A1A1A' }}
                  >
                    {codeError ? 'Try again' : 'Check in'}
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
                    className="ml-2 flex-1 font-inter text-body text-ed-on-surface"
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
                  <Text className="mt-3 text-center font-inter text-body-sm text-ed-on-surface-variant">
                    Couldn&apos;t load the guest list. You can still check a guest
                    in with the code from their ticket.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={onRetry}
                    className="mt-4 rounded-full border border-ed-outline-variant px-5 py-2.5"
                  >
                    <Text className="font-inter-bold text-caption text-ed-on-surface">
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
                      <Text className="mt-3 text-center font-inter text-body-sm text-ed-on-surface-variant">
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
                        onPress={() => void openConfirm(item)}
                        className="mb-3 flex-row items-center gap-3 rounded-2xl border border-ed-outline-variant bg-ed-surface p-4"
                        style={{ opacity: arrived ? 0.6 : 1 }}
                      >
                        <GuestAvatar fullName={item.fullName} colorKey={item.groupTag} />

                        <View className="min-w-0 flex-1">
                          <View className="flex-row items-center gap-2">
                            <Text
                              className="shrink font-inter-bold text-body-sm text-ed-on-surface"
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
                                  className="font-inter-bold text-label uppercase"
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
                                <Text className="font-inter-bold text-label tracking-[1px] text-ed-on-surface-variant">
                                  {item.entryCode}
                                </Text>
                              ) : null}
                              {arrived ? (
                                <Text
                                  className="shrink font-inter text-caption text-ed-on-surface-variant"
                                  numberOfLines={1}
                                >
                                  Already in, {item.checkedInPartySize ?? item.partySize} of{' '}
                                  {item.partySize}
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
          phonePending={phonePending}
          onCancel={() => setConfirming(null)}
          onDismissed={handleConfirmCardDismissed}
          onConfirm={(guest, arrived) => void admitGuest(guest, arrived)}
        />
      </SafeAreaView>
    </Modal>
  );
}
