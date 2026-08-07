import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDeleteEvent, useEvents, useGuests } from '@/hooks/useGuests';
import { getErrorMessage } from '@/lib/errors';
import { formatShortDate } from '@/lib/format-date';
import { useTheme } from '@/theme/useTheme';
import { EVENT_TYPE_LABELS, type WeddingEvent } from '@/types/dashboard';

function EventRow({
  event,
  guestCount,
  onEdit,
  onDelete,
}: {
  event: WeddingEvent;
  guestCount: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { editorial } = useTheme();

  return (
    <Pressable
      onPress={onEdit}
      onLongPress={onDelete}
      className="mb-2.5 rounded-2xl border border-ed-outline-variant bg-ed-surface p-4"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-inter-bold text-body-sm text-ed-on-surface">{event.name}</Text>
          <Text className="mt-1 font-inter text-caption text-ed-on-surface-variant">
            {[
              EVENT_TYPE_LABELS[event.event_type],
              event.starts_at ? formatShortDate(event.starts_at) : null,
              event.venue_name,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={editorial.onSurfaceVariant} />
      </View>

      <View className="mt-3 flex-row items-center gap-2 border-t border-ed-outline-variant pt-3">
        <View
          className="rounded-full px-2.5 py-1"
          style={{ backgroundColor: event.allow_rsvp ? '#2D8E5B1F' : editorial.surfaceContainer }}
        >
          <Text
            className="font-inter-semibold text-label"
            style={{ color: event.allow_rsvp ? '#2D8E5B' : editorial.onSurfaceVariant }}
          >
            {event.allow_rsvp ? 'RSVPs on' : 'RSVPs off'}
          </Text>
        </View>
        <Text className="font-inter text-caption text-ed-on-surface-variant">
          {guestCount} guest{guestCount === 1 ? '' : 's'} invited
        </Text>
      </View>
    </Pressable>
  );
}

export function EventsTab() {
  const router = useRouter();
  const { editorial } = useTheme();
  const events = useEvents();
  const guests = useGuests();
  const deleteEvent = useDeleteEvent();

  const goToEventForm = (id?: string) =>
    router.push(id ? { pathname: '/event/[id]', params: { id } } : '/event/new');

  const guestCountFor = (eventId: string) =>
    (guests.data ?? []).filter((g) => g.invitations.some((i) => i.event_id === eventId)).length;

  const confirmDelete = (event: WeddingEvent) => {
    Alert.alert('Delete event?', `${event.name} and its RSVPs will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteEvent.mutate(event.id, {
            onError: (error) =>
              Alert.alert(
                "Couldn't delete event",
                getErrorMessage(error, 'Please try again shortly.'),
              ),
          }),
      },
    ]);
  };

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
        Couldn&rsquo;t load your events. Pull to refresh, or try again shortly.
      </Text>
    );
  }

  if (events.data.length === 0) {
    return (
      <View className="items-center py-12">
        <Text className="text-center font-inter-bold text-section-title text-ed-on-surface">
          Add your first event
        </Text>
        <Text className="mt-2 text-center font-inter text-body-sm text-ed-on-surface-variant">
          The ceremony, send-off, kitchen party — each one gets its own guest list and RSVPs.
        </Text>
        <Pressable
          onPress={() => goToEventForm()}
          className="mt-6 flex-row items-center gap-2 rounded-full px-5 py-3"
          style={{ backgroundColor: editorial.secondary }}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text className="font-inter-semibold text-body-sm text-white">New event</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="font-inter-bold text-section-title text-ed-on-surface">
          {events.data.length} event{events.data.length === 1 ? '' : 's'}
        </Text>
        <Pressable
          onPress={() => goToEventForm()}
          className="flex-row items-center gap-1.5 rounded-full px-3.5 py-2"
          style={{ backgroundColor: editorial.secondary }}
        >
          <Ionicons name="add" size={16} color="#FFFFFF" />
          <Text className="font-inter-semibold text-caption text-white">Add</Text>
        </Pressable>
      </View>

      {events.data.map((event) => (
        <EventRow
          key={event.id}
          event={event}
          guestCount={guestCountFor(event.id)}
          onEdit={() => goToEventForm(event.id)}
          onDelete={() => confirmDelete(event)}
        />
      ))}

      <Text className="mt-2 text-center font-inter text-caption text-ed-on-surface-variant">
        Tap an event to edit. Press and hold to delete.
      </Text>
    </View>
  );
}
