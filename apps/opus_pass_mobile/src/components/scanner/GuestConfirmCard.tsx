import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GuestAvatar } from '@/components/scanner/GuestAvatar';
import { clampArrived, partySizeLabel } from '@/lib/scannerRoster';
import { ACCENT, ON_ACCENT } from '@/theme/brand';
import { useTheme } from '@/theme/useTheme';
import type { RosterEntry } from '@/types/checkin';

/** Brand green, matching the live/active pills used elsewhere in the product. */
const LIVE_GREEN = '#9FE870';

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface GuestConfirmCardProps {
  visible: boolean;
  guest: RosterEntry | null;
  busy?: boolean;
  /** Why the last admit attempt failed. The card stays open while this is
   *  set: dismissing on a rejected admit is what makes a guest walk in
   *  against a check-in the server never recorded. */
  error?: string | null;
  onCancel: () => void;
  /** True while the guest's phone number is still being fetched. The roster
   *  does not carry it, so a guest picked from the list arrives here without
   *  one; showing "Not recorded" during that gap would state as fact the very
   *  thing still being looked up. */
  phonePending?: boolean;
  /** Fires once this card's modal has FINISHED dismissing (iOS only — the
   *  platform gives no such callback elsewhere). The caller needs it to avoid
   *  tearing down a modal stacked underneath in the same frame. */
  onDismissed?: () => void;
  /** Fires with the guest and the confirmed headcount. For a party of 1 the
   *  count is always 1; larger parties default to everyone unless the
   *  attendant steps it down. */
  onConfirm: (guest: RosterEntry, arrived: number) => void;
}

/**
 * Confirmation step between picking a guest and admitting them.
 *
 * Manual check-in is the one path with no QR to verify against, so the only
 * safeguard is the attendant reading the right row. A tap that admitted
 * somebody instantly made a mis-tap silent and unrecoverable — first-scan-wins
 * means the real guest then arrives to find themselves already inside. Showing
 * the guest large, with their ticket code and party size, turns that into a
 * deliberate act.
 */
export function GuestConfirmCard({
  visible,
  guest: incomingGuest,
  busy = false,
  error = null,
  phonePending = false,
  onCancel,
  onDismissed,
  onConfirm,
}: GuestConfirmCardProps) {
  const { editorial } = useTheme();

  // Callers clear the selection to close, which would empty the card before
  // the sheet has finished sliding away. Holding the last guest keeps the
  // dismissal looking like a dismissal rather than a blank flash.
  const lastGuest = useRef<RosterEntry | null>(null);
  if (incomingGuest) lastGuest.current = incomingGuest;
  const guest = incomingGuest ?? lastGuest.current;

  // The headcount going in with this confirmation. Defaults to the full party
  // so the common everyone-came case needs no input; the QR scan path asks the
  // same question through PartySizeSheet, and both feed the number the couple
  // is billed against, so a manual admit must not silently assume the RSVP.
  const [arriving, setArriving] = useState(() =>
    clampArrived(incomingGuest?.partySize ?? 1, incomingGuest?.partySize ?? 1)
  );
  const incomingId = incomingGuest?.invitationId;
  const incomingParty = incomingGuest?.partySize;
  // Reset per guest, not per open: the card stays mounted between guests, and
  // one party's correction must never carry over to the next.
  useEffect(() => {
    if (incomingId) setArriving(clampArrived(incomingParty ?? 1, incomingParty ?? 1));
  }, [incomingId, incomingParty]);

  if (!guest) return null;

  const arrived = Boolean(guest.checkedInAt);
  const admitted = guest.checkedInPartySize ?? guest.partySize;

  const DetailRow = ({
    icon,
    label,
    value,
    first,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string;
    first?: boolean;
  }) => (
    <View
      className={`flex-row items-center gap-3 py-4 ${first ? '' : 'border-t border-ed-outline-variant'}`}
    >
      <Ionicons name={icon} size={20} color={editorial.onSurfaceVariant} />
      <View className="min-w-0 flex-1">
        <Text className="font-inter-semibold text-body-sm text-ed-on-surface">
          {label}
        </Text>
        <Text className="mt-0.5 font-inter text-body-sm text-ed-on-surface-variant">
          {value}
        </Text>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
      onDismiss={onDismissed}
    >
      <SafeAreaView className="flex-1 bg-ed-bg">
        {/* Header carries the group the way a delivery app carries the order
            it belongs to: it's the fastest way to catch "right name, wrong
            side of the family". */}
        <View className="flex-row items-center gap-3 px-4 pb-3 pt-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to the guest list"
            onPress={onCancel}
            hitSlop={12}
            className="h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: editorial.surfaceContainer }}
          >
            <Ionicons name="arrow-back" size={20} color={editorial.onSurface} />
          </Pressable>
          <View className="min-w-0 flex-1 flex-row items-center justify-center gap-2">
            <GuestAvatar fullName={guest.groupTag || guest.fullName} size={26} colorKey={guest.groupTag} />
            <Text
              className="shrink font-inter-semibold text-body-sm text-ed-on-surface"
              numberOfLines={1}
            >
              {guest.groupTag || 'Guest list'}
            </Text>
          </View>
          <View className="h-10 w-10 shrink-0" />
        </View>

        <ScrollView contentContainerClassName="pb-4">
          {/* Portrait panel standing in for the product shot: the guest is
              what's being identified, so they get the same visual weight. */}
          <View className="mx-4 items-center justify-center rounded-3xl bg-ed-surface-container py-10">
            <GuestAvatar fullName={guest.fullName} size={112} colorKey={guest.groupTag} />
            {guest.isVip ? (
              <View
                className="mt-5 rounded-full px-3 py-1"
                style={{ backgroundColor: LIVE_GREEN }}
              >
                <Text
                  className="font-inter-bold text-label uppercase tracking-[1.5px]"
                  style={{ color: '#1A1A1A' }}
                >
                  {guest.groupTag || 'VIP'}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="px-5 pt-5">
            {/* Name alone. The ticket type and the printed code both live in
                Guest details below: repeating them here made the identity
                line — the one thing the attendant reads against the person in
                front of them — compete with two pieces of small print. */}
            <Text className="font-inter-bold text-screen-title leading-8 text-ed-on-surface">
              {guest.fullName}
            </Text>

            {arrived ? (
              <View className="mt-5 flex-row items-center gap-3 rounded-2xl border border-ed-outline-variant p-4">
                <Ionicons name="alert-circle-outline" size={22} color="#B4751A" />
                <View className="min-w-0 flex-1">
                  <Text className="font-inter-semibold text-body-sm text-ed-on-surface">
                    Already checked in
                  </Text>
                  <Text className="mt-0.5 font-inter text-body-sm text-ed-on-surface-variant">
                    {admitted} of {guest.partySize} admitted at{' '}
                    {timeOf(guest.checkedInAt!)}
                  </Text>
                  {/* The door is a separate fact from the count, so it gets its
                      own line and its own icon rather than a middot. */}
                  {guest.checkedInDoor ? (
                    <View className="mt-1 flex-row items-center gap-1.5">
                      <Ionicons name="enter-outline" size={13} color={editorial.onSurfaceVariant} />
                      <Text className="font-inter text-body-sm text-ed-on-surface-variant">
                        {guest.checkedInDoor}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : (
              <View className="mt-5 flex-row items-center gap-3 rounded-2xl border border-ed-outline-variant p-4">
                <Ionicons
                  name="create-outline"
                  size={22}
                  color={editorial.onSurfaceVariant}
                />
                <View className="min-w-0 flex-1">
                  <Text className="font-inter-semibold text-body-sm text-ed-on-surface">
                    Check the guest is who you expect
                  </Text>
                  <Text className="mt-0.5 font-inter text-body-sm text-ed-on-surface-variant">
                    No pass was scanned, so this is recorded as a manual
                    check-in on the couple&apos;s report.
                  </Text>
                </View>
              </View>
            )}

            <Text className="mt-7 font-inter-bold text-card-title text-ed-on-surface">
              Guest details
            </Text>
            <View className="mt-1">
              <DetailRow
                first
                icon="restaurant-outline"
                label="Table"
                value={guest.table ?? 'Not seated'}
              />
              <DetailRow
                icon="barcode-outline"
                label="Ticket code"
                value={guest.entryCode ?? 'Not issued'}
              />
              {/* The number the invitation went to. Two guests with the same
                  name is the case a manual admission has no scanned pass to
                  settle, and this is what settles it. */}
              <DetailRow
                icon="call-outline"
                label="Phone number"
                value={guest.phone ?? (phonePending ? 'Checking…' : 'Not recorded')}
              />
              {/* Named in the language the tickets are sold in — the guest is
                  holding a Single or a Double, not "1 ct". */}
              <DetailRow
                icon="pricetag-outline"
                label="Ticket type"
                value={partySizeLabel(guest.partySize)}
              />
            </View>
          </View>
        </ScrollView>

        {/* Stacked, full width and thumb-height: the attendant is one-handed
            with a phone in the other hand's light. */}
        <View className="border-t border-ed-outline-variant px-4 pb-2 pt-3">
          {/* Headcount stepper for parties bigger than one. In the footer, not
              the scrolled detail: it has to be visible next to the check-in
              button it changes, on any screen size. A stepper rather than the
              PartySizeSheet's typed input because passes are overwhelmingly
              Singles and Doubles — the whole correction is one tap on minus —
              and unlike the scan path the party size is known before
              admitting, so no second sheet is needed. */}
          {!arrived && guest.partySize > 1 ? (
            <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-ed-outline-variant bg-ed-surface px-4 py-3">
              <View className="min-w-0 flex-1 pr-3">
                <Text className="font-inter-semibold text-body-sm text-ed-on-surface">
                  Arriving now
                </Text>
                <Text className="mt-0.5 font-inter text-caption text-ed-on-surface-variant">
                  Invited {guest.partySize}
                </Text>
              </View>
              <View className="flex-row items-center gap-3">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Fewer people arriving"
                  accessibilityState={{ disabled: busy || arriving <= 1 }}
                  disabled={busy || arriving <= 1}
                  hitSlop={8}
                  onPress={() => setArriving((n) => clampArrived(n - 1, guest.partySize))}
                  className="h-11 w-11 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: editorial.surfaceContainer,
                    opacity: busy || arriving <= 1 ? 0.4 : 1,
                  }}
                >
                  <Ionicons name="remove" size={20} color={editorial.onSurface} />
                </Pressable>
                <Text className="min-w-[28px] text-center font-inter-bold text-section-title text-ed-on-surface">
                  {arriving}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="More people arriving"
                  accessibilityState={{ disabled: busy || arriving >= guest.partySize }}
                  disabled={busy || arriving >= guest.partySize}
                  hitSlop={8}
                  onPress={() => setArriving((n) => clampArrived(n + 1, guest.partySize))}
                  className="h-11 w-11 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: editorial.surfaceContainer,
                    opacity: busy || arriving >= guest.partySize ? 0.4 : 1,
                  }}
                >
                  <Ionicons name="add" size={20} color={editorial.onSurface} />
                </Pressable>
              </View>
            </View>
          ) : null}
          {/* Sits with the buttons, not up in the scrolled detail, so it is
              on screen next to the control the attendant just pressed. */}
          {error ? (
            <View
              accessibilityRole="alert"
              className="mb-3 flex-row items-start gap-2 rounded-2xl px-3 py-3"
              style={{ backgroundColor: `${editorial.error}1A` }}
            >
              <Ionicons
                name="alert-circle"
                size={20}
                color={editorial.error}
                style={{ marginTop: 1 }}
              />
              <Text
                className="min-w-0 flex-1 font-inter-semibold text-body-sm"
                style={{ color: editorial.error }}
              >
                {error}
              </Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            disabled={busy}
            className="h-14 items-center justify-center rounded-2xl bg-ed-surface-container"
          >
            <Text className="font-inter-semibold text-body text-ed-on-surface">
              Not this guest
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: arrived || busy }}
            disabled={arrived || busy}
            onPress={() => onConfirm(guest, arriving)}
            // Brand accent, not the theme's primary container: this is the one
            // committing action on the screen and it must read the same in
            // both schemes, the way the accent CTA does on the web.
            className="mt-3 h-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: ACCENT, opacity: arrived || busy ? 0.5 : 1 }}
          >
            {busy ? (
              <ActivityIndicator color={ON_ACCENT} />
            ) : (
              <Text
                className="font-inter-bold text-body"
                style={{ color: ON_ACCENT }}
              >
                {/* The button restates the number being recorded, so a
                    mis-tapped stepper is caught here rather than on the
                    invoice. */}
                {arrived
                  ? 'Already checked in'
                  : guest.partySize === 1
                    ? 'Check in'
                    : arriving === guest.partySize
                      ? `Check in party of ${guest.partySize}`
                      : `Check in ${arriving} of ${guest.partySize}`}
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
