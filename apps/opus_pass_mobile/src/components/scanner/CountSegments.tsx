import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';

export interface CountSegment {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Full screen-reader label ("Still to arrive"). */
  label: string;
  /** One word printed under the count ("waiting"). Attendants are one-shift
   *  workers: a bare icon bar asks them to already know the iconography, and
   *  at the start of a night two of the three counts are the same number. */
  caption: string;
  count: number;
}

interface CountSegmentsProps {
  segments: CountSegment[];
  /** Highlighted segment. Omit on screens where the bar only navigates. */
  activeKey?: string | null;
  onSelect: (key: string) => void;
  /** `camera` renders in translucent white for use over a live camera feed. */
  tone?: 'camera' | 'surface';
}

/**
 * Icon-and-count bar: the whole state of the door in one glance.
 *
 * Numbers rather than words because an attendant reads this between guests,
 * often at arm's length, and because the three counts answer the only
 * questions asked at a door all night — how many are still to come, how many
 * are in, how many were invited. Every segment is a target, so the count is
 * also the way into the matching list.
 */
export function CountSegments({
  segments,
  activeKey,
  onSelect,
  tone = 'surface',
}: CountSegmentsProps) {
  const { editorial } = useTheme();
  const onCamera = tone === 'camera';

  // On light surfaces the track is a real card — white surface with the same
  // hairline border every other card on these screens wears — not a grey
  // slab, which read as a filler block rather than part of the card family.
  // The camera keeps its translucent track; over a live feed the counts need
  // something to sit on.
  const trackColor = onCamera ? 'rgba(255,255,255,0.14)' : editorial.surface;
  const activeColor = onCamera ? 'rgba(255,255,255,0.20)' : editorial.surfaceContainer;
  const activeBorder = onCamera ? 'rgba(255,255,255,0.9)' : editorial.onSurface;
  const textColor = onCamera ? '#FFFFFF' : editorial.onSurface;
  const idleColor = onCamera ? 'rgba(255,255,255,0.72)' : editorial.onSurfaceVariant;
  // outline, not outlineVariant: the variant is a near-match for the track
  // grey and disappears into it. Same reason the camera value is well above
  // the track's 0.14 white.
  const separatorColor = onCamera ? 'rgba(255,255,255,0.45)' : editorial.outline;

  return (
    <View
      className="flex-row items-center rounded-2xl p-1"
      style={{
        backgroundColor: trackColor,
        borderWidth: onCamera ? 0 : 1,
        borderColor: onCamera ? 'transparent' : editorial.outlineVariant,
      }}
    >
      {segments.map((segment, index) => {
        const active = activeKey === segment.key;
        const color = active ? textColor : idleColor;
        // Inset divider: shorter than the segment so it floats between the
        // counts instead of slicing the track into boxes. Always drawn —
        // iOS hides the ones beside the selection, but our active style is
        // too quiet for a missing line to read as anything but a bug.
        return (
          <Fragment key={segment.key}>
            {index > 0 ? (
              <View
                style={{
                  width: 1,
                  height: 22,
                  borderRadius: 0.5,
                  backgroundColor: separatorColor,
                }}
              />
            ) : null}
            <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${segment.label}: ${segment.count}`}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(segment.key)}
            className="h-[52px] flex-1 items-center justify-center rounded-xl"
            // A visible press response is the only affordance this control
            // gets: three numbers in a row read as a readout, and nothing
            // else tells a first-time attendant they are buttons.
            style={({ pressed }) => ({
              backgroundColor: active ? activeColor : pressed ? activeColor : 'transparent',
              borderWidth: active ? 1.5 : 0,
              borderColor: active ? activeBorder : 'transparent',
              opacity: pressed && !active ? 0.85 : 1,
            })}
          >
            <View className="flex-row items-center justify-center gap-1.5">
              <Ionicons name={segment.icon} size={15} color={color} />
              <Text className="font-inter-semibold text-body-sm" style={{ color }}>
                {segment.count}
              </Text>
            </View>
            <Text
              className="font-inter-medium text-label uppercase tracking-[0.5px]"
              style={{ color: idleColor, marginTop: 1 }}
            >
              {segment.caption}
            </Text>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}

interface GroupChipProps {
  /** Null means no group filter is applied. */
  activeTag: string | null;
  onPress: () => void;
  tone?: 'camera' | 'surface';
}

/** Companion to the bar: which slice of the roster the counts are describing. */
export function GroupChip({ activeTag, onPress, tone = 'surface' }: GroupChipProps) {
  const { editorial } = useTheme();
  const onCamera = tone === 'camera';
  const filtered = Boolean(activeTag);

  // Card treatment to match the count bar it sits beside; a heavier border
  // is what says a group filter is applied.
  const background = onCamera
    ? filtered
      ? 'rgba(255,255,255,0.24)'
      : 'rgba(255,255,255,0.14)'
    : editorial.surface;
  const color = onCamera ? '#FFFFFF' : editorial.onSurface;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={activeTag ? `Filtering by ${activeTag}. Change group` : 'Filter by group'}
      onPress={onPress}
      className="h-[52px] max-w-[150px] flex-row items-center gap-1.5 rounded-2xl px-3.5"
      style={{
        backgroundColor: background,
        borderWidth: onCamera ? (filtered ? 1.5 : 0) : filtered ? 1.5 : 1,
        borderColor: onCamera
          ? filtered
            ? 'rgba(255,255,255,0.9)'
            : 'transparent'
          : filtered
            ? editorial.onSurface
            : editorial.outlineVariant,
      }}
    >
      <Ionicons name="people-circle-outline" size={19} color={color} />
      {activeTag ? (
        <Text
          className="shrink font-inter-semibold text-caption"
          style={{ color }}
          numberOfLines={1}
        >
          {activeTag}
        </Text>
      ) : null}
      <Ionicons name="chevron-down" size={14} color={color} />
    </Pressable>
  );
}
