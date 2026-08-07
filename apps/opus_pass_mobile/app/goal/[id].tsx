import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { IdeasAdvice } from '@/components/dashboard/IdeasAdvice';
import { BackButton } from '@/components/navigation/BackButton';
import { findGoal, type GoalCta } from '@/constants/plan';
import { usePlanProgress } from '@/hooks/usePlanProgress';
import { useTheme } from '@/theme/useTheme';

function CtaCard({ cta, onPress }: { cta: GoalCta; onPress: () => void }) {
  const { editorial } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      className="mt-4 flex-row items-center rounded-2xl bg-ed-surface-container p-4"
    >
      <View className="flex-1 pr-4">
        <View className="flex-row items-center gap-1.5">
          <Text className="font-inter-bold text-body-sm text-ed-on-surface">{cta.title}</Text>
          <Ionicons name="arrow-forward" size={15} color={editorial.onSurface} />
        </View>
        <Text className="mt-1 font-inter text-body-sm leading-5 text-ed-on-surface-variant">
          {cta.subtitle}
        </Text>
      </View>
      <View
        className="h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: editorial.secondaryContainer }}
      >
        <Ionicons name={cta.icon} size={24} color={editorial.onSurface} />
      </View>
    </Pressable>
  );
}

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { editorial } = useTheme();
  const { completed, toggleGoal } = usePlanProgress();

  const found = findGoal(id);

  if (!found) {
    return (
      <SafeAreaView className="flex-1 bg-ed-bg">
        <View className="px-4 pt-2">
          <BackButton />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center font-inter text-body-sm text-ed-on-surface-variant">
            We couldn&rsquo;t find that goal.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { goal, stage } = found;
  const done = completed.has(goal.id);

  return (
    <SafeAreaView className="flex-1 bg-ed-bg">
      <View className="px-4 pt-2">
        <BackButton />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-16 pt-2"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5">
          <Text className="font-inter text-body-sm text-ed-on-surface-variant">{stage.label}</Text>
          <Text className="mt-1 font-inter-bold text-screen-title text-ed-on-surface">{goal.title}</Text>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            onPress={() => toggleGoal(goal.id)}
            className="mt-5 flex-row items-center gap-3"
          >
            <View
              className="h-7 w-7 items-center justify-center rounded-full border-2"
              style={{
                borderColor: done ? '#2D8E5B' : editorial.outline,
                backgroundColor: done ? '#2D8E5B' : 'transparent',
              }}
            >
              {done ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
            </View>
            <Text className="font-inter text-body text-ed-on-surface">
              {done ? 'Goal done' : 'Mark goal as done'}
            </Text>
          </Pressable>
        </View>

        <View className="mt-8 px-5">
          {/* Things to do */}
          <View className="rounded-2xl border border-ed-outline-variant bg-ed-surface p-5">
            <View className="flex-row items-start justify-between gap-3">
              <Text className="flex-1 font-inter-bold text-card-title text-ed-on-surface">Things to do</Text>
              <Ionicons name="list" size={22} color={editorial.onSurfaceVariant} />
            </View>
            <View className="mt-3 gap-2.5">
              {goal.tasks.map((task) => (
                <View key={task} className="flex-row items-start gap-2.5">
                  <Text className="font-inter text-body leading-6 text-ed-on-surface-variant">•</Text>
                  <Text className="flex-1 font-inter text-body-sm leading-6 text-ed-on-surface">
                    {task}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {goal.ctas?.map((cta) => (
            <CtaCard key={cta.id} cta={cta} onPress={() => router.push(cta.route)} />
          ))}
        </View>

        <View className="px-5">
          <IdeasAdvice />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
