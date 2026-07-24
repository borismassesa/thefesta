import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useUser } from '@clerk/clerk-expo';
import { useTheme } from '@/theme/useTheme';
import { useVendor } from '@/hooks/useVendors';
import { useCreateBookingInquiry } from '@/hooks/useBookings';
import { useCoupleProfile } from '@/hooks/useDashboard';
import { coupleFirstNames } from '@/types/dashboard';
import { parsePackagePrice } from '@/lib/vendor-detail';
import { getErrorMessage } from '@/lib/errors';

const GUEST_STEP = 10;
const BUDGET_OPTIONS = ['Under 1M', '1M – 3M', '3M – 5M', '5M – 10M', '10M+'];

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Maps a package's price onto the closest budget bucket so picking a package pre-selects one. */
function budgetBucketForPrice(price: string | undefined): string | null {
  const amount = parsePackagePrice(price);
  if (!amount) return null;
  if (amount < 1_000_000) return 'Under 1M';
  if (amount < 3_000_000) return '1M – 3M';
  if (amount < 5_000_000) return '3M – 5M';
  if (amount < 10_000_000) return '5M – 10M';
  return '10M+';
}

export default function BookingRequestScreen() {
  const router = useRouter();
  const { editorial } = useTheme();
  const { vendorId, package: packageName, price: packagePrice } = useLocalSearchParams<{
    vendorId: string;
    package?: string;
    price?: string;
  }>();

  const { user } = useUser();
  const { data: profile } = useCoupleProfile();
  const { data: vendor } = useVendor(vendorId);
  const createInquiry = useCreateBookingInquiry();

  const [eventDate, setEventDate] = useState<Date | null>(
    profile?.wedding_date ? new Date(profile.wedding_date) : null,
  );
  const [showPicker, setShowPicker] = useState(false);
  const [guestCount, setGuestCount] = useState(100);
  const [budget, setBudget] = useState<string | null>(() => budgetBucketForPrice(packagePrice));
  const [message, setMessage] = useState(() =>
    packageName ? `I'm interested in the ${packageName} package.` : '',
  );

  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const name = coupleFirstNames(profile ?? null);

  const canSubmit = Boolean(eventDate) && Boolean(email) && !createInquiry.isPending;

  const onSubmit = () => {
    if (!eventDate) {
      Alert.alert('Pick a date', 'Let the vendor know when your event is.');
      return;
    }
    if (!email) {
      Alert.alert('Missing email', 'We need an email address to send the vendor’s reply to.');
      return;
    }

    createInquiry.mutate(
      {
        vendorId: vendorId!,
        name,
        email,
        eventDate: toISODate(eventDate),
        guestCount,
        budget: budget ?? undefined,
        message:
          message.trim() ||
          `We're interested in booking ${vendor?.business_name ?? 'you'} for our wedding.`,
      },
      {
        onSuccess: () => {
          Alert.alert(
            'Request sent',
            'The vendor will reply soon — you can follow up in Messages.',
            [{ text: 'Done', onPress: () => router.back() }],
          );
        },
        onError: (error) => {
          console.error('[booking] createBookingInquiry failed', error);
          Alert.alert('Could not send request', getErrorMessage(error, 'Please try again.'));
        },
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={editorial.onSurface} />
        </Pressable>
        <Text className="flex-1 font-playfair-bold text-xl text-ed-on-surface">Request a quote</Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView className="flex-1" contentContainerClassName="gap-6 px-5 pb-10 pt-2">
          {vendor ? (
            <Text className="font-work-sans text-sm text-ed-on-surface-variant">
              Sending to {vendor.business_name}
            </Text>
          ) : null}

          {packageName ? (
            <View className="flex-row items-center gap-2 self-start rounded-full border border-ed-outline-variant bg-ed-surface px-3 py-1.5">
              <Ionicons name="pricetag-outline" size={13} color={editorial.onSurfaceVariant} />
              <Text className="font-work-sans-bold text-xs text-ed-on-surface">
                {packageName}
                {packagePrice ? ` · TZS ${packagePrice}` : ''}
              </Text>
            </View>
          ) : null}

          <View className="gap-2">
            <Text className="font-work-sans-bold text-sm text-ed-on-surface">Event date</Text>
            <Pressable
              className="flex-row items-center justify-between rounded-xl border border-ed-outline-variant bg-ed-surface px-4 py-3"
              onPress={() => setShowPicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Choose event date"
            >
              <Text
                className={`font-work-sans text-sm ${
                  eventDate ? 'text-ed-on-surface' : 'text-ed-on-surface-variant'
                }`}
              >
                {eventDate ? eventDate.toDateString() : 'Select a date'}
              </Text>
              <Ionicons name="calendar-outline" size={18} color={editorial.onSurfaceVariant} />
            </Pressable>

            {showPicker ? (
              <DateTimePicker
                value={eventDate ?? new Date()}
                mode="date"
                minimumDate={new Date()}
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(event, selected) => {
                  if (Platform.OS !== 'ios') setShowPicker(false);
                  if (event.type === 'set' && selected) setEventDate(selected);
                }}
              />
            ) : null}
          </View>

          <View className="gap-2">
            <Text className="font-work-sans-bold text-sm text-ed-on-surface">Guests</Text>
            <View className="flex-row items-center justify-between rounded-xl border border-ed-outline-variant bg-ed-surface px-4 py-2.5">
              <Pressable
                onPress={() => setGuestCount((count) => Math.max(GUEST_STEP, count - GUEST_STEP))}
                hitSlop={8}
                accessibilityLabel="Fewer guests"
              >
                <Ionicons name="remove-circle-outline" size={24} color={editorial.onSurface} />
              </Pressable>
              <Text className="font-work-sans-bold text-base text-ed-on-surface">{guestCount}</Text>
              <Pressable
                onPress={() => setGuestCount((count) => count + GUEST_STEP)}
                hitSlop={8}
                accessibilityLabel="More guests"
              >
                <Ionicons name="add-circle-outline" size={24} color={editorial.onSurface} />
              </Pressable>
            </View>
          </View>

          <View className="gap-2">
            <Text className="font-work-sans-bold text-sm text-ed-on-surface">Budget (optional)</Text>
            <View className="flex-row flex-wrap gap-2">
              {BUDGET_OPTIONS.map((option) => {
                const active = budget === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setBudget(active ? null : option)}
                    className={`rounded-full border px-3 py-1.5 ${
                      active
                        ? 'border-ed-primary-container bg-ed-primary-container'
                        : 'border-ed-outline-variant bg-ed-surface'
                    }`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Budget ${option}`}
                  >
                    <Text
                      className={`font-work-sans text-xs ${
                        active ? 'text-ed-on-primary' : 'text-ed-on-surface-variant'
                      }`}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="gap-2">
            <Text className="font-work-sans-bold text-sm text-ed-on-surface">Message</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Tell the vendor about your day…"
              placeholderTextColor={editorial.onSurfaceVariant}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              className="min-h-24 rounded-xl border border-ed-outline-variant bg-ed-surface px-4 py-3 font-work-sans text-sm text-ed-on-surface"
            />
          </View>

          <Pressable
            className={`items-center rounded-full py-3.5 ${
              canSubmit ? 'bg-ed-primary-container' : 'bg-ed-surface-container-high'
            }`}
            onPress={onSubmit}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Send request"
          >
            {createInquiry.isPending ? (
              <ActivityIndicator color={editorial.onPrimary} />
            ) : (
              <Text
                className={`font-work-sans-bold text-sm ${
                  canSubmit ? 'text-ed-on-primary' : 'text-ed-on-surface-variant'
                }`}
              >
                Send request
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
