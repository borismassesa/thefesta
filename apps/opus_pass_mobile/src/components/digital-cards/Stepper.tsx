import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';

/** Shared "− count +" pill used by the guest-count, per-unit add-on and cart steppers. */
export function Stepper({
  value,
  min,
  onDecrement,
  onIncrement,
  compact = false,
}: {
  value: number;
  min: number;
  onDecrement: () => void;
  onIncrement: () => void;
  /** Tighter sizing for dense rows (cart lines). */
  compact?: boolean;
}) {
  const { editorial } = useTheme();
  const atMin = value <= min;

  const button = compact ? 28 : 32;
  const iconSize = compact ? 15 : 17;

  return (
    <View
      className="flex-row items-center self-start rounded-full border border-ed-outline-variant bg-ed-surface"
      style={{ padding: 4 }}
    >
      <RoundButton
        label="Decrease"
        icon="remove"
        size={button}
        iconSize={iconSize}
        fill={editorial.secondary}
        disabled={atMin}
        onPress={onDecrement}
      />
      <View className={compact ? 'min-w-10 px-1' : 'min-w-12 px-1.5'}>
        <Text className="text-center font-work-sans-bold text-[15px] text-ed-on-surface">
          {value}
        </Text>
      </View>
      <RoundButton
        label="Increase"
        icon="add"
        size={button}
        iconSize={iconSize}
        fill={editorial.secondary}
        onPress={onIncrement}
      />
    </View>
  );
}

/** Filled circle inset from the pill's edge — the brand colour reads clearly
 *  without the two ends becoming full-height blocks. */
function RoundButton({
  label,
  icon,
  size,
  iconSize,
  fill,
  disabled,
  onPress,
}: {
  label: string;
  icon: 'add' | 'remove';
  size: number;
  iconSize: number;
  fill: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: fill,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Ionicons name={icon} size={iconSize} color="#FFFFFF" />
    </Pressable>
  );
}
