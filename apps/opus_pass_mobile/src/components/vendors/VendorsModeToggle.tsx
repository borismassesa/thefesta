import { Pressable, Text, View } from 'react-native';

export type VendorsMode = 'find' | 'saved' | 'booked';

const MODES: { key: VendorsMode; label: string }[] = [
  { key: 'find', label: 'Find' },
  { key: 'saved', label: 'Saved' },
  { key: 'booked', label: 'Booked' },
];

export function VendorsModeToggle({
  mode,
  onChange,
}: {
  mode: VendorsMode;
  onChange: (mode: VendorsMode) => void;
}) {
  return (
    <View className="mx-5 flex-row rounded-full bg-ed-surface-container p-1">
      {MODES.map((item) => {
        const active = item.key === mode;
        return (
          <Pressable
            key={item.key}
            className={`flex-1 items-center rounded-full py-2 ${
              active ? 'bg-ed-surface' : ''
            }`}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
          >
            <Text
              className={`font-inter-bold text-caption ${
                active ? 'text-ed-on-surface' : 'text-ed-on-surface-variant'
              }`}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
