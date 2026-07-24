import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/components/navigation/BackButton';
import { FormField } from '@/components/guests/FormField';
import { useEvents, useSaveEvent } from '@/hooks/useGuests';
import { getErrorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/useTheme';
import { EVENT_TYPE_LABELS, type EventType, type WeddingEventDraft } from '@/types/dashboard';

const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as EventType[];

const EMPTY_DRAFT: WeddingEventDraft = {
  name: '',
  event_type: 'wedding',
  venue_name: null,
  address: null,
  city: null,
  starts_at: null,
  allow_rsvp: false,
};

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** starts_at is a timestamptz, but there's no date-picker dependency in this
 *  app yet — so the form takes a plain YYYY-MM-DD and widens it to midnight.
 *  Anything unparseable is rejected on save rather than silently dropped. */
function dateInputToIso(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isoToDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function EventFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { editorial } = useTheme();
  const events = useEvents();
  const saveEvent = useSaveEvent();

  const isNew = id === 'new';
  const existing = isNew ? null : events.data?.find((e) => e.id === id);

  const [draft, setDraft] = useState<WeddingEventDraft>(EMPTY_DRAFT);
  const [dateInput, setDateInput] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || isNew || !existing) return;
    setDraft({
      name: existing.name,
      event_type: existing.event_type,
      venue_name: existing.venue_name,
      address: existing.address,
      city: existing.city,
      starts_at: existing.starts_at,
      allow_rsvp: existing.allow_rsvp,
    });
    setDateInput(isoToDateInput(existing.starts_at));
    setHydrated(true);
  }, [existing, hydrated, isNew]);

  const set = <K extends keyof WeddingEventDraft>(key: K, value: WeddingEventDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (draft.name.trim() === '') {
      Alert.alert('Name required', 'Please give this event a name.');
      return;
    }
    const startsAt = dateInputToIso(dateInput);
    if (dateInput.trim() !== '' && startsAt === null) {
      Alert.alert('Check the date', 'Please enter the date as YYYY-MM-DD, for example 2027-04-21.');
      return;
    }

    saveEvent.mutate(
      { id: isNew ? undefined : id, draft: { ...draft, name: draft.name.trim(), starts_at: startsAt } },
      {
        onSuccess: () => router.back(),
        onError: (error) =>
          Alert.alert(
            "Couldn't save event",
            getErrorMessage(error, 'Please try again shortly.'),
          ),
      },
    );
  };

  if (!isNew && events.isPending) {
    return (
      <SafeAreaView className="flex-1 bg-ed-bg">
        <View className="px-4 pt-2">
          <BackButton />
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={editorial.secondary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-ed-bg">
      <View className="px-4 pt-2">
        <BackButton />
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-16 pt-2"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="mb-6 font-playfair-bold text-2xl text-ed-on-surface">
            {isNew ? 'Add an event' : 'Edit event'}
          </Text>

          <FormField
            label="Event name"
            value={draft.name}
            onChangeText={(v) => set('name', v)}
            placeholder="Wedding Day"
            autoCapitalize="words"
          />

          <Text className="mb-1.5 font-work-sans-medium text-xs uppercase tracking-wide text-ed-on-surface-variant">
            Type
          </Text>
          <View className="mb-4 flex-row flex-wrap gap-2">
            {EVENT_TYPES.map((type) => {
              const active = draft.event_type === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => set('event_type', type)}
                  className="rounded-full px-3.5 py-2"
                  style={{
                    backgroundColor: active ? editorial.secondary : editorial.surfaceContainer,
                  }}
                >
                  <Text
                    className="font-work-sans-semibold text-[13px]"
                    style={{ color: active ? '#FFFFFF' : editorial.onSurfaceVariant }}
                  >
                    {EVENT_TYPE_LABELS[type]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <FormField
            label="Date"
            value={dateInput}
            onChangeText={setDateInput}
            placeholder="2027-04-21"
            autoCapitalize="none"
          />
          <FormField
            label="Venue"
            value={draft.venue_name ?? ''}
            onChangeText={(v) => set('venue_name', nullable(v))}
            placeholder="Therme Erding"
            autoCapitalize="words"
          />
          <FormField
            label="Address"
            value={draft.address ?? ''}
            onChangeText={(v) => set('address', nullable(v))}
            placeholder="Street or landmark"
          />
          <FormField
            label="City"
            value={draft.city ?? ''}
            onChangeText={(v) => set('city', nullable(v))}
            placeholder="Dar es Salaam"
            autoCapitalize="words"
          />

          <View className="mb-6 flex-row items-center justify-between rounded-2xl border border-ed-outline-variant bg-ed-surface p-4">
            <View className="flex-1 pr-4">
              <Text className="font-work-sans-semibold text-[15px] text-ed-on-surface">
                Collect RSVPs
              </Text>
              <Text className="mt-0.5 font-work-sans text-xs text-ed-on-surface-variant">
                Let guests reply to this event from your invite link.
              </Text>
            </View>
            <Switch
              value={draft.allow_rsvp}
              onValueChange={(v) => set('allow_rsvp', v)}
              trackColor={{ false: editorial.surfaceContainerHigh, true: editorial.secondary }}
            />
          </View>

          <Pressable
            onPress={handleSave}
            disabled={saveEvent.isPending}
            className="items-center rounded-2xl py-4"
            style={{ backgroundColor: editorial.secondary, opacity: saveEvent.isPending ? 0.6 : 1 }}
          >
            {saveEvent.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="font-work-sans-bold text-sm text-white">
                {isNew ? 'Add event' : 'Save changes'}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
