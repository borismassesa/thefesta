import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AttendanceDonut } from '@/components/dashboard/AttendanceDonut';
import { HomeHeader } from '@/components/dashboard/HomeHeader';
import { IdeasAdvice } from '@/components/dashboard/IdeasAdvice';
import { PlanChecklist } from '@/components/dashboard/PlanChecklist';
import { QuickStatsBand } from '@/components/dashboard/QuickStatsBand';
import { StatCard } from '@/components/dashboard/StatCard';
import { useCoupleProfile, useDashboardStats, useUpcomingEvents } from '@/hooks/useDashboard';
import { formatShortDate } from '@/lib/format-date';
import { EVENT_TYPE_LABELS } from '@/types/dashboard';

export default function Home() {
  const profile = useCoupleProfile();
  const stats = useDashboardStats();
  const upcoming = useUpcomingEvents();

  const isLoading = profile.isPending || stats.isPending || upcoming.isPending;

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
        <View className="px-5 pt-2">
          <HomeHeader />
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#7E5896" />
        </View>
      </SafeAreaView>
    );
  }

  if (stats.isError) {
    return (
      <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
        <View className="px-5 pt-2">
          <HomeHeader />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center font-inter text-body-sm text-ed-error">
            Couldn't load your dashboard. Pull to refresh, or try again shortly.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const s = stats.data!;
  const hasAnyData = s.totalGuests > 0 || upcoming.data?.length;

  return (
    <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-32 pt-2"
        showsVerticalScrollIndicator={false}
      >
        <HomeHeader />

        <QuickStatsBand attending={s.attending} />
        <PlanChecklist />
        <IdeasAdvice />

        {hasAnyData ? (
          <>
            {/* Stat cards */}
            <View className="mt-6 flex-row gap-3">
              <StatCard label="Guests" value={s.totalGuests} accent />
              <StatCard label="Attending" value={s.attending} hint={`${s.expectedHeadcount} expected`} />
            </View>
            <View className="mt-3 flex-row gap-3">
              <StatCard label="Declined" value={s.declined} />
              <StatCard label="Awaiting reply" value={s.pending} />
            </View>

            {/* Response progress */}
            <View className="mt-6 rounded-2xl border border-ed-outline-variant bg-ed-surface p-4">
              <Text className="font-inter-semibold text-body text-ed-on-surface">Responses</Text>
              <View className="mt-4">
                <AttendanceDonut stats={s} />
              </View>
              {s.mealBreakdown.length > 0 ? (
                <View className="mt-5 gap-2 border-t border-ed-outline-variant pt-4">
                  <Text className="font-inter-medium text-caption uppercase tracking-wide text-ed-on-surface-variant">
                    Meal choices
                  </Text>
                  {s.mealBreakdown.map((m) => (
                    <View key={m.choice} className="flex-row items-center justify-between">
                      <Text className="font-inter text-body-sm text-ed-on-surface">{m.choice}</Text>
                      <Text className="font-inter-semibold text-body-sm text-ed-on-surface-variant">
                        {m.count}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Upcoming events */}
            {upcoming.data && upcoming.data.length > 0 ? (
              <View className="mt-6">
                <Text className="font-inter-semibold text-body text-ed-on-surface">Upcoming events</Text>
                <View className="mt-3 gap-2">
                  {upcoming.data.map((event) => (
                    <View
                      key={event.id}
                      className="rounded-2xl border border-ed-outline-variant bg-ed-surface p-4"
                    >
                      <Text className="font-inter-semibold text-body-sm text-ed-on-surface">{event.name}</Text>
                      <Text className="mt-1 font-inter text-caption text-ed-on-surface-variant">
                        {EVENT_TYPE_LABELS[event.event_type]}
                        {event.starts_at ? ` · ${formatShortDate(event.starts_at)}` : ''}
                        {event.venue_name ? ` · ${event.venue_name}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
