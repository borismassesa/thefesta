import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/navigation/BackButton';

/** Generic stub destination for header/nav icons whose real screens aren't built yet. */
export default function ComingSoonScreen() {
  const { title } = useLocalSearchParams<{ title?: string }>();

  return (
    <SafeAreaView className="flex-1 bg-ed-bg">
      <View className="px-4 pt-2">
        <BackButton />
      </View>
      <View className="flex-1 items-center justify-center px-6 pb-16">
        <Text className="font-inter-bold text-section-title text-ed-on-surface">{title ?? 'Coming soon'}</Text>
        <Text className="mt-2 text-center font-inter text-body-sm text-ed-on-surface-variant">
          Coming soon.
        </Text>
      </View>
    </SafeAreaView>
  );
}
