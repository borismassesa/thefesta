import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { countLabel, expectedHeads, type RosterGroup } from '@/lib/scannerRoster';
import { GuestAvatar } from '@/components/scanner/GuestAvatar';
import { useTheme } from '@/theme/useTheme';
import type { RosterEntry } from '@/types/checkin';

interface GroupFilterSheetProps {
  visible: boolean;
  onClose: () => void;
  roster: RosterEntry[];
  groups: RosterGroup[];
  /** Null = no filter, showing everyone. */
  activeTag: string | null;
  onSelect: (tag: string | null) => void;
}

/**
 * Group picker for the guest list.
 *
 * Weddings arrive in blocks — a bus of the groom's colleagues, the bride's
 * family all at once — and the couple already records that as a group tag. At
 * the door it turns "find this one name in four hundred" into "find them among
 * the sixty in this group", which is the difference between a queue moving and
 * a queue stopping.
 */
export function GroupFilterSheet({
  visible,
  onClose,
  roster,
  groups,
  activeTag,
  onSelect,
}: GroupFilterSheetProps) {
  const { editorial } = useTheme();

  const choose = (tag: string | null) => {
    onSelect(tag);
    onClose();
  };

  const Radio = ({ selected }: { selected: boolean }) => (
    <View
      className="h-6 w-6 shrink-0 items-center justify-center rounded-full"
      style={{
        borderWidth: 2,
        borderColor: selected ? editorial.onSurface : editorial.outline,
      }}
    >
      {selected ? (
        <View
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: editorial.onSurface }}
        />
      ) : null}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Tapping the dimmed area is the fastest way out when the attendant
          opened this by accident mid-queue. */}
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close group picker"
        className="flex-1 justify-end"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      >
        <Pressable
          // Swallows taps so pressing a row doesn't hit the backdrop behind it.
          onPress={() => {}}
          className="max-h-[78%] rounded-t-3xl bg-ed-bg"
        >
          <SafeAreaView edges={['bottom']}>
            <View className="flex-row items-center justify-between px-6 pb-2 pt-6">
              <Text className="font-inter-bold text-screen-title text-ed-on-surface">
                Select group
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                hitSlop={12}
              >
                <Ionicons name="close" size={24} color={editorial.onSurface} />
              </Pressable>
            </View>

            <ScrollView className="px-6" contentContainerClassName="pb-6">
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: activeTag === null }}
                onPress={() => choose(null)}
                className="flex-row items-center gap-3 py-4"
              >
                <View
                  className="h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: editorial.surfaceContainer }}
                >
                  <Ionicons name="people" size={20} color={editorial.onSurfaceVariant} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="font-inter-bold text-body-sm text-ed-on-surface">
                    All guests
                  </Text>
                  <Text className="mt-0.5 font-inter text-caption text-ed-on-surface-variant">
                    Total {countLabel(roster.length, expectedHeads(roster))}
                  </Text>
                </View>
                <Radio selected={activeTag === null} />
              </Pressable>

              {groups.map((group) => (
                <Pressable
                  key={group.tag}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: activeTag === group.tag }}
                  onPress={() => choose(group.tag)}
                  className="flex-row items-center gap-3 border-t border-ed-outline-variant py-4"
                >
                  <GuestAvatar fullName={group.tag} colorKey={group.tag} />
                  <View className="min-w-0 flex-1">
                    <Text
                      className="font-inter-bold text-body-sm text-ed-on-surface"
                      numberOfLines={1}
                    >
                      {group.tag}
                    </Text>
                    <Text className="mt-0.5 font-inter text-caption text-ed-on-surface-variant">
                      {countLabel(group.guests.length, group.heads)} ·{' '}
                      {group.arrivedCount} in
                    </Text>
                  </View>
                  <Radio selected={activeTag === group.tag} />
                </Pressable>
              ))}
            </ScrollView>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
