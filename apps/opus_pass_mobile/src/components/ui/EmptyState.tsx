import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';

export function EmptyState({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  const { editorial } = useTheme();
  return (
    <View className="flex-1 items-center justify-center py-24">
      <Ionicons name={icon} size={32} color={editorial.onSurfaceVariant} />
      <Text className="mt-3 px-10 text-center font-inter text-body-sm text-ed-on-surface-variant">
        {label}
      </Text>
    </View>
  );
}
