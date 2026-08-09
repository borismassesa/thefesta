import { useEffect, useState } from 'react';
import { withAuthGate } from '@/components/auth/withAuthGate';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/components/navigation/BackButton';
import { FormField } from '@/components/guests/FormField';
import { useGuests, useSaveGuest } from '@/hooks/useGuests';
import { getErrorMessage } from '@/lib/errors';
import { TICKET_TYPES, ticketPartyFor } from '@/lib/tickets';
import { useTheme } from '@/theme/useTheme';
import type { GuestContactDraft } from '@/types/dashboard';

const EMPTY_DRAFT: GuestContactDraft = {
  full_name: '',
  email: null,
  phone: null,
  whatsapp_phone: null,
  group_tag: null,
  max_party_size: 1,
  notes: null,
};

/** Blank inputs should clear the column, not store an empty string. */
function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function GuestFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { editorial } = useTheme();
  const guests = useGuests();
  const saveGuest = useSaveGuest();

  const isNew = id === 'new';
  const existing = isNew ? null : guests.data?.find((g) => g.id === id);

  const [draft, setDraft] = useState<GuestContactDraft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);

  // The list query may still be in flight on a deep link straight to /guest/<id>.
  useEffect(() => {
    if (hydrated || isNew || !existing) return;
    setDraft({
      full_name: existing.full_name,
      email: existing.email,
      phone: existing.phone,
      whatsapp_phone: existing.whatsapp_phone,
      group_tag: existing.group_tag,
      max_party_size: existing.max_party_size,
      notes: existing.notes,
    });
    setHydrated(true);
  }, [existing, hydrated, isNew]);

  const set = <K extends keyof GuestContactDraft>(key: K, value: GuestContactDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (draft.full_name.trim() === '') {
      Alert.alert('Name required', "Please enter the guest's name.");
      return;
    }
    saveGuest.mutate(
      { id: isNew ? undefined : id, draft: { ...draft, full_name: draft.full_name.trim() } },
      {
        onSuccess: () => router.back(),
        onError: (error) =>
          Alert.alert(
            "Couldn't save guest",
            getErrorMessage(error, 'Please try again shortly.'),
          ),
      },
    );
  };

  if (!isNew && guests.isPending) {
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
          <Text className="mb-6 font-inter-bold text-screen-title text-ed-on-surface">
            {isNew ? 'Add a guest' : 'Edit guest'}
          </Text>

          <FormField
            label="Full name"
            value={draft.full_name}
            onChangeText={(v) => set('full_name', v)}
            placeholder="Asha Juma"
            autoCapitalize="words"
          />
          <FormField
            label="Phone"
            value={draft.phone ?? ''}
            onChangeText={(v) => set('phone', nullable(v))}
            placeholder="0712 345 678"
            keyboardType="phone-pad"
          />
          <FormField
            label="WhatsApp"
            value={draft.whatsapp_phone ?? ''}
            onChangeText={(v) => set('whatsapp_phone', nullable(v))}
            placeholder="Same as phone, if different"
            keyboardType="phone-pad"
          />
          <FormField
            label="Email"
            value={draft.email ?? ''}
            onChangeText={(v) => set('email', nullable(v))}
            placeholder="asha@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <FormField
            label="Group"
            value={draft.group_tag ?? ''}
            onChangeText={(v) => set('group_tag', nullable(v))}
            placeholder="Bride's family"
            autoCapitalize="words"
          />
          {/* A ticket picker, not a free seat count: the server snaps whatever
              it is given onto a sold ticket, so a typed "5" came back as a
              Double with no explanation. These are the three tickets that
              exist, and each says how many people its QR admits. */}
          <View className="mb-4">
            <Text className="mb-1.5 font-inter-medium text-caption uppercase tracking-wide text-ed-on-surface-variant">
              Ticket type
            </Text>
            <View className="flex-row gap-2">
              {TICKET_TYPES.map(({ size, label }) => {
                const active = ticketPartyFor(draft.max_party_size) === size;
                return (
                  <Pressable
                    key={size}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => set('max_party_size', size)}
                    className="flex-1 items-center rounded-2xl border py-3"
                    style={{
                      borderColor: active ? editorial.secondary : editorial.outlineVariant,
                      backgroundColor: active ? editorial.secondaryContainer : editorial.surface,
                    }}
                  >
                    <Text
                      className="font-inter-semibold text-body-sm"
                      style={{ color: active ? editorial.onSecondaryContainer : editorial.onSurface }}
                    >
                      {label}
                    </Text>
                    <Text
                      className="font-inter text-caption"
                      style={{ color: active ? editorial.onSecondaryContainer : editorial.onSurfaceVariant }}
                    >
                      {size === 1 ? '1 person' : `${size} people`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <FormField
            label="Notes"
            value={draft.notes ?? ''}
            onChangeText={(v) => set('notes', nullable(v))}
            placeholder="Dietary needs, travel plans…"
            multiline
          />

          <Pressable
            onPress={handleSave}
            disabled={saveGuest.isPending}
            className="mt-2 items-center rounded-2xl py-4"
            style={{ backgroundColor: editorial.secondary, opacity: saveGuest.isPending ? 0.6 : 1 }}
          >
            {saveGuest.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="font-inter-bold text-body-sm text-white">
                {isNew ? 'Add guest' : 'Save changes'}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Signed-in only. Wrapper, not a route group — see withAuthGate. */
export default withAuthGate(GuestFormScreen);
