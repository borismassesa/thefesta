import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AttendanceDonut } from '@/components/dashboard/AttendanceDonut';
import { useCoupleProfile } from '@/hooks/useDashboard';
import { useEvents, useGuests, useRsvpQuestions, useToggleEventRsvp } from '@/hooks/useGuests';
import { computeStats } from '@/lib/api/dashboard';
import { getErrorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/useTheme';
import { EVENT_TYPE_LABELS, type WeddingEvent } from '@/types/dashboard';

function EventRsvpCard({ event }: { event: WeddingEvent }) {
  const { editorial } = useTheme();
  const guests = useGuests();
  const questions = useRsvpQuestions();
  const toggleRsvp = useToggleEventRsvp();

  // Scope the roster to this event, then reuse the same stats computation the
  // home dashboard uses so both surfaces can never disagree.
  const eventGuests = (guests.data ?? [])
    .map((g) => ({ ...g, invitations: g.invitations.filter((i) => i.event_id === event.id) }))
    .filter((g) => g.invitations.length > 0);
  const stats = computeStats(eventGuests);

  const eventQuestions = (questions.data ?? []).filter(
    (q) => q.event_id === event.id || q.event_id === null,
  );

  return (
    <View className="mb-4 overflow-hidden rounded-2xl border border-ed-outline-variant bg-ed-surface">
      <View className="flex-row items-center justify-between gap-3 p-4">
        <View className="flex-1">
          <Text className="font-inter-bold text-body-sm text-ed-on-surface">{event.name}</Text>
          <Text className="mt-0.5 font-inter text-caption text-ed-on-surface-variant">
            {EVENT_TYPE_LABELS[event.event_type]} · {eventGuests.length} guest
            {eventGuests.length === 1 ? '' : 's'}
          </Text>
        </View>
        <Switch
          value={event.allow_rsvp}
          onValueChange={(next) =>
            toggleRsvp.mutate(
              { id: event.id, allowRsvp: next },
              {
                onError: (error) =>
                  Alert.alert(
                    "Couldn't update RSVPs",
                    getErrorMessage(error, 'Please try again shortly.'),
                  ),
              },
            )
          }
          trackColor={{ false: editorial.surfaceContainerHigh, true: editorial.secondary }}
        />
      </View>

      {event.allow_rsvp ? (
        <View className="border-t border-ed-outline-variant p-4">
          <AttendanceDonut stats={stats} />

          <View className="mt-4 border-t border-ed-outline-variant pt-3">
            <Text className="font-inter-medium text-caption uppercase tracking-wide text-ed-on-surface-variant">
              RSVP questions
            </Text>
            {eventQuestions.length === 0 ? (
              <Text className="mt-2 font-inter text-body-sm text-ed-on-surface-variant">
                No custom questions yet. Guests just reply yes or no.
              </Text>
            ) : (
              eventQuestions.map((q) => (
                <View key={q.id} className="mt-2 flex-row items-start gap-2">
                  <Ionicons
                    name={q.kind === 'multiple_choice' ? 'list-outline' : 'chatbox-outline'}
                    size={14}
                    color={editorial.onSurfaceVariant}
                    style={{ marginTop: 2 }}
                  />
                  <Text className="flex-1 font-inter text-body-sm text-ed-on-surface">
                    {q.prompt}
                    {q.event_id === null ? (
                      <Text className="font-inter text-caption text-ed-on-surface-variant"> · all events</Text>
                    ) : null}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function RsvpsTab() {
  const router = useRouter();
  const { editorial } = useTheme();
  const events = useEvents();
  const profile = useCoupleProfile();
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  const sharingOn = Boolean(profile.data?.public_sharing_enabled);

  if (events.isPending) {
    return (
      <View className="items-center py-16">
        <ActivityIndicator color={editorial.secondary} />
      </View>
    );
  }

  if (events.isError) {
    return (
      <Text className="py-16 text-center font-inter text-body-sm text-ed-error">
        Couldn&rsquo;t load your RSVPs. Pull to refresh, or try again shortly.
      </Text>
    );
  }

  if (events.data.length === 0) {
    return (
      <View className="items-center py-12">
        <Text className="text-center font-inter-bold text-section-title text-ed-on-surface">
          No events yet
        </Text>
        <Text className="mt-2 text-center font-inter text-body-sm text-ed-on-surface-variant">
          Add an event first, then turn its RSVP page on here.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {!sharingOn && !noticeDismissed ? (
        <Pressable
          onPress={() => router.push('/website')}
          className="mb-4 flex-row items-start gap-3 rounded-2xl p-4"
          style={{ backgroundColor: editorial.secondary }}
        >
          <Ionicons name="information-circle" size={20} color="#FFFFFF" />
          <Text className="flex-1 font-inter text-body-sm leading-5 text-white">
            Heads-up! Your RSVP settings are saved, but guests can&rsquo;t reply until you share
            your invite link. Tap to set it up.
          </Text>
          <Pressable onPress={() => setNoticeDismissed(true)} hitSlop={8}>
            <Ionicons name="close" size={18} color="#FFFFFF" />
          </Pressable>
        </Pressable>
      ) : null}

      {events.data.map((event) => (
        <EventRsvpCard key={event.id} event={event} />
      ))}
    </View>
  );
}
