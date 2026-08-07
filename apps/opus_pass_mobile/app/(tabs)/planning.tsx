import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PlanningScreen() {
  return (
    <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
      <View className="flex-1 items-center justify-center px-6 pb-32">
        <Text className="font-inter-bold text-section-title text-ed-on-surface">
          Planning
        </Text>
        <Text className="mt-2 text-center font-inter text-body-sm text-ed-on-surface-variant">
          Coming soon.
        </Text>
      </View>
    </SafeAreaView>
  );
}
