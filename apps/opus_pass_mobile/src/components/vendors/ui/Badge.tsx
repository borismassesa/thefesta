import { Text, View } from 'react-native';

type BadgeVariant = 'default' | 'success' | 'warning' | 'count';

/** success/warning keep fixed semantic status colours; default/count follow the theme. */
const variantClasses: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: 'bg-ed-tertiary-fixed', text: 'text-ed-tertiary-container' },
  success: { bg: 'bg-[#dcfce7]', text: 'text-[#16a34a]' },
  warning: { bg: 'bg-[#fff7ed]', text: 'text-[#C4920A]' },
  count: { bg: 'bg-ed-primary-container', text: 'text-white' },
};

export function Badge({
  label,
  variant = 'default',
  className = '',
}: {
  label: string;
  variant?: BadgeVariant;
  className?: string;
}) {
  const v = variantClasses[variant];

  return (
    <View className={`${className} rounded-[20px] px-3 py-1 ${v.bg}`}>
      <Text className={`font-inter-bold text-label ${v.text}`}>{label}</Text>
    </View>
  );
}
