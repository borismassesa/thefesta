import { Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { useTheme } from '@/theme/useTheme';

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = 'sentences',
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  multiline?: boolean;
}) {
  const { editorial } = useTheme();

  return (
    <View className="mb-4">
      <Text className="mb-1.5 font-inter-medium text-caption uppercase tracking-wide text-ed-on-surface-variant">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={editorial.onSurfaceVariant}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        className="rounded-2xl border border-ed-outline-variant bg-ed-surface px-4 py-3.5 font-inter text-body-sm text-ed-on-surface"
        style={multiline ? { minHeight: 96, textAlignVertical: 'top' } : undefined}
      />
    </View>
  );
}
