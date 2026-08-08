import { Pressable, Text } from 'react-native';

type AuthSubmitProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  /** Label shown while `loading`. Defaults to the app's standard wait copy. */
  loadingLabel?: string;
};

/** Primary call-to-action for the auth screens. */
export function AuthSubmit({ label, onPress, loading = false, loadingLabel = 'Please wait…' }: AuthSubmitProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={loading}
      className={`mt-2 items-center rounded-xl bg-ed-primary-container py-3.5 ${loading ? 'opacity-50' : ''}`}
    >
      <Text className="font-inter-semibold text-body text-ed-on-primary">{loading ? loadingLabel : label}</Text>
    </Pressable>
  );
}
