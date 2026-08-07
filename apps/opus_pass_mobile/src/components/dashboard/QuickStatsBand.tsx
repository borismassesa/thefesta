import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { useSavedVendorIds } from '@/hooks/useSavedVendors';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface QuickStat {
  icon: IoniconName;
  iconColor: string;
  value: string;
  label: string;
}

function StatPill({ stat }: { stat: QuickStat }) {
  return (
    <View className="flex-1 items-center gap-1 rounded-2xl border border-ed-outline-variant bg-ed-surface px-2 py-3">
      <View className="flex-row items-center gap-1.5">
        <Ionicons name={stat.icon} size={16} color={stat.iconColor} />
        <Text className="font-inter-bold text-body text-ed-on-surface">{stat.value}</Text>
      </View>
      <Text className="font-inter text-caption text-ed-on-surface-variant">{stat.label}</Text>
    </View>
  );
}

/** Goal budget has no backing feature yet, so it stays a static placeholder —
 * Attending and Saved vendors are real. */
export function QuickStatsBand({ attending }: { attending: number }) {
  const { editorial } = useTheme();
  const { data: savedVendorIds } = useSavedVendorIds();

  const stats: QuickStat[] = [
    { icon: 'wallet', iconColor: '#D46A9F', value: '--', label: 'Goal budget' },
    {
      icon: 'storefront',
      iconColor: editorial.secondary,
      value: String(savedVendorIds?.length ?? 0),
      label: 'Saved vendors',
    },
    { icon: 'people', iconColor: '#5B8DEF', value: String(attending), label: 'Attending' },
  ];

  return (
    <View className="mt-6 flex-row gap-2.5">
      {stats.map((stat) => (
        <StatPill key={stat.label} stat={stat} />
      ))}
    </View>
  );
}
