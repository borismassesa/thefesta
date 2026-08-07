import { Fragment, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { PLAN_STAGES, TOTAL_GOALS, taskCountLabel, type PlanGoal, type PlanStage } from '@/constants/plan';
import { usePlanProgress } from '@/hooks/usePlanProgress';
import { useTheme } from '@/theme/useTheme';

const CIRCLE_SIZE = 40;

function StepCircle({ stage, active }: { stage: PlanStage; active: boolean }) {
  const { editorial } = useTheme();

  return (
    <View
      className="items-center justify-center rounded-full"
      style={{
        width: active ? CIRCLE_SIZE + 8 : CIRCLE_SIZE,
        height: active ? CIRCLE_SIZE + 8 : CIRCLE_SIZE,
        backgroundColor: active ? `${editorial.secondary}26` : 'transparent',
      }}
    >
      <View
        className="items-center justify-center rounded-full"
        style={{
          width: CIRCLE_SIZE,
          height: CIRCLE_SIZE,
          backgroundColor: active ? editorial.secondary : editorial.surfaceContainerHigh,
        }}
      >
        <Text
          className="font-inter-bold text-body"
          style={{ color: active ? '#FFFFFF' : editorial.onSurfaceVariant }}
        >
          {stage.id}
        </Text>
      </View>
    </View>
  );
}

function GoalRow({ goal, done, onPress }: { goal: PlanGoal; done: boolean; onPress: () => void }) {
  const { editorial } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      className="mb-3 flex-row items-center rounded-2xl border border-ed-outline-variant bg-ed-surface p-3.5"
    >
      <View
        className="h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: done ? '#2D8E5B1F' : editorial.secondaryContainer }}
      >
        <Ionicons
          name={done ? 'checkmark' : goal.icon}
          size={22}
          color={done ? '#2D8E5B' : editorial.onSurface}
        />
      </View>

      <View className="ml-3.5 flex-1">
        <Text
          className="font-inter-bold text-body-sm"
          style={{
            color: done ? editorial.onSurfaceVariant : editorial.onSurface,
            textDecorationLine: done ? 'line-through' : 'none',
          }}
        >
          {goal.title}
        </Text>
        {!done ? (
          <Text className="mt-0.5 font-inter text-body-sm text-ed-on-surface-variant">
            {taskCountLabel(goal)}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={20} color={editorial.onSurfaceVariant} />
    </Pressable>
  );
}

export function PlanChecklist() {
  const router = useRouter();
  const { editorial } = useTheme();
  const { completed } = usePlanProgress();
  const [activeStageId, setActiveStageId] = useState(PLAN_STAGES[0].id);

  const activeStage = PLAN_STAGES.find((stage) => stage.id === activeStageId) ?? PLAN_STAGES[0];

  return (
    <View className="mt-8">
      <View className="flex-row items-baseline justify-between">
        <Text className="font-inter-bold text-section-title text-ed-on-surface">Your plan</Text>
        <Text className="font-inter-medium text-body-sm text-ed-on-surface-variant">
          {completed.size}/{TOTAL_GOALS} goals
        </Text>
      </View>

      {/* Timeline stepper */}
      <View className="mt-6 flex-row items-center">
        {PLAN_STAGES.map((stage, index) => (
          <Fragment key={stage.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${stage.label} plan stage`}
              onPress={() => setActiveStageId(stage.id)}
            >
              <StepCircle stage={stage} active={stage.id === activeStageId} />
            </Pressable>
            {index < PLAN_STAGES.length - 1 ? (
              <View className="mx-2 h-px flex-1" style={{ backgroundColor: editorial.outlineVariant }} />
            ) : null}
          </Fragment>
        ))}
      </View>
      <View className="mt-2 flex-row">
        {PLAN_STAGES.map((stage) => (
          <Pressable
            key={stage.id}
            onPress={() => setActiveStageId(stage.id)}
            className="flex-1 items-center"
          >
            <Text
              numberOfLines={1}
              className={`font-inter text-caption ${
                stage.id === activeStageId
                  ? 'font-inter-bold text-ed-on-surface'
                  : 'text-ed-on-surface-variant'
              }`}
            >
              {stage.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Goals for the selected stage */}
      <View className="mt-6">
        {activeStage.goals.map((goal) => (
          <GoalRow
            key={goal.id}
            goal={goal}
            done={completed.has(goal.id)}
            onPress={() => router.push({ pathname: '/goal/[id]', params: { id: goal.id } })}
          />
        ))}
      </View>

      {activeStageId > PLAN_STAGES[0].id ? (
        <Pressable onPress={() => setActiveStageId(activeStageId - 1)} accessibilityRole="button">
          <Text className="font-inter-semibold text-body-sm text-ed-secondary">
            See the previous checklist
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
