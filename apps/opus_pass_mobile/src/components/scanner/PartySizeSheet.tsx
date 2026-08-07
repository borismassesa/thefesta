import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { PartyBadge } from '@/components/scanner/PartyBadge';
import { clampArrived } from '@/lib/scannerRoster';
import { useTheme } from '@/theme/useTheme';

/** The success green used by the scan result overlay, so an accepted pass
 *  reads the same whether it lands on the overlay or this card's strip. */
const DEEP_GREEN = '#1B7F4C';

interface PartySizeSheetProps {
  visible: boolean;
  guestName: string;
  /** What the guest RSVP'd for, and the ceiling on what can be admitted. */
  partySize: number;
  groupTag?: string | null;
  busy?: boolean;
  onCancel: () => void;
  /** Fires with the confirmed headcount, including the unchanged full party —
   *  the caller decides whether that needs a correction request. */
  onSubmit: (arrived: number) => void;
}

/**
 * Headcount confirmation after a party pass scans in.
 *
 * A typed count rather than a row of numbered buttons: Tanzanian weddings run
 * to parties of ten and more, where a button grid wraps into an unreadable
 * block, and the count is the figure the couple is billed and catered against.
 * The pass has already been accepted at this point, so the guest is through
 * the door either way — this only corrects the number.
 */
export function PartySizeSheet({
  visible,
  guestName: incomingName,
  partySize: incomingPartySize,
  groupTag: incomingGroupTag,
  busy = false,
  onCancel,
  onSubmit,
}: PartySizeSheetProps) {
  const { editorial } = useTheme();

  // The caller closes this by clearing the prompt, so hold the last guest to
  // render through the slide-out instead of emptying the card mid-animation.
  const lastGuest = useRef({ guestName: '', partySize: 1, groupTag: incomingGroupTag });
  if (incomingName) {
    lastGuest.current = {
      guestName: incomingName,
      partySize: incomingPartySize,
      groupTag: incomingGroupTag,
    };
  }
  const { guestName, partySize, groupTag } = lastGuest.current;

  const [value, setValue] = useState(String(partySize));
  const inputRef = useRef<TextInput>(null);

  // Reopen for the next guest with their own party pre-filled, not the last
  // guest's correction.
  useEffect(() => {
    if (visible) setValue(String(partySize));
  }, [visible, partySize]);

  const parsed = Number.parseInt(value, 10);
  // Valid means the server would record it unchanged — same 1..party_size
  // clamp as checkin_guest_invitation(), via the shared helper.
  const valid = Number.isFinite(parsed) && clampArrived(parsed, partySize) === parsed;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView className="flex-1 bg-ed-bg">
        <View className="flex-row items-center px-4 pt-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Keep the full party"
            onPress={onCancel}
            hitSlop={12}
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: editorial.surfaceContainer }}
          >
            <Ionicons name="close" size={20} color={editorial.onSurface} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="flex-1 px-5 pt-4">
            <Text className="font-inter-bold text-screen-title text-ed-on-surface">
              How many arrived?
            </Text>

            {/* Green confirmation strip on the card, so the attendant can see
                the pass was accepted while they deal with the count. */}
            <View className="mt-6 overflow-hidden rounded-2xl border border-ed-outline-variant">
              <View
                className="flex-row items-center gap-2 px-4 py-3"
                style={{ backgroundColor: DEEP_GREEN }}
              >
                <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                <Text className="font-inter-semibold text-body-sm text-white">
                  Pass accepted
                </Text>
              </View>
              <View className="flex-row items-center gap-3 bg-ed-surface p-4">
                <GuestAvatar fullName={guestName} size={48} colorKey={groupTag} />
                <View className="min-w-0 flex-1">
                  <Text
                    className="font-inter-bold text-body-sm text-ed-on-surface"
                    numberOfLines={2}
                  >
                    {guestName}
                  </Text>
                  <Text className="mt-0.5 font-inter text-caption text-ed-on-surface-variant">
                    {groupTag ? `${groupTag} · ` : ''}Invited {partySize}
                  </Text>
                </View>
                <PartyBadge partySize={partySize} />
              </View>
            </View>

            <Pressable
              accessibilityRole="none"
              onPress={() => inputRef.current?.focus()}
              className="mt-6 rounded-2xl border bg-ed-surface px-4 py-4"
              style={{ borderColor: valid ? editorial.outline : editorial.error }}
            >
              <TextInput
                ref={inputRef}
                value={value}
                onChangeText={(next) => setValue(next.replace(/[^0-9]/g, '').slice(0, 3))}
                keyboardType="number-pad"
                selectTextOnFocus
                editable={!busy}
                placeholder="Enter count arrived"
                placeholderTextColor={editorial.onSurfaceVariant}
                className="font-inter text-body text-ed-on-surface"
              />
            </Pressable>
            <Text
              className="mt-2 font-inter text-caption"
              style={{ color: valid ? editorial.onSurfaceVariant : editorial.error }}
            >
              {valid
                ? `Invited ${partySize}`
                : `Enter a number between 1 and ${partySize}`}
            </Text>
          </View>

          <View className="border-t border-ed-outline-variant px-4 pb-2 pt-3">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !valid || busy }}
              disabled={!valid || busy}
              onPress={() => onSubmit(parsed)}
              className="h-14 items-center justify-center rounded-2xl bg-ed-primary-container"
              style={{ opacity: !valid || busy ? 0.5 : 1 }}
            >
              {busy ? (
                <ActivityIndicator color={editorial.onPrimary} />
              ) : (
                <Text className="font-inter-bold text-body text-ed-on-primary">
                  Done
                </Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
