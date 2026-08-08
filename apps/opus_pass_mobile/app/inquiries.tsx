import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { withAuthGate } from '@/components/auth/withAuthGate';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { getErrorMessage } from '@/lib/errors';
import { useMyInquiries } from '@/hooks/useInquiries';
import { EmptyState } from '@/components/ui/EmptyState';
import { InquiryStatusBadge } from '@/components/inquiry/InquiryStatusBadge';

function InquiriesScreen() {
  const router = useRouter();
  const { editorial } = useTheme();
  const { data, isLoading, error } = useMyInquiries();

  return (
    <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={editorial.onSurface} />
        </Pressable>
        <Text className="flex-1 font-inter-bold text-section-title text-ed-on-surface">My requests</Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="pb-32">
        {isLoading ? (
          <ActivityIndicator className="py-16" color={editorial.onSurfaceVariant} />
        ) : error ? (
          <EmptyState
            icon="alert-circle-outline"
            label={getErrorMessage(error, 'Could not load your requests.')}
          />
        ) : data && data.length > 0 ? (
          data.map((inquiry) => (
            <Pressable
              key={inquiry.id}
              className="gap-1.5 border-b border-ed-outline-variant px-5 py-4"
              onPress={() => router.push(`/inquiry/${inquiry.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Request to ${inquiry.vendor_name ?? 'vendor'}`}
            >
              <View className="flex-row items-center gap-2">
                <Text
                  numberOfLines={1}
                  className="flex-1 font-inter-bold text-body-sm text-ed-on-surface"
                >
                  {inquiry.vendor_name ?? 'Vendor'}
                </Text>
                <InquiryStatusBadge status={inquiry.status} />
              </View>

              <Text className="font-inter text-caption text-ed-on-surface-variant">
                {[
                  inquiry.event_date ? new Date(inquiry.event_date).toDateString() : null,
                  inquiry.guest_count ? `${inquiry.guest_count} guests` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Pressable>
          ))
        ) : (
          <EmptyState
            icon="document-text-outline"
            label="No quote requests yet. Request one from a vendor's profile."
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Signed-in only. Wrapper, not a route group — see withAuthGate. */
export default withAuthGate(InquiriesScreen);
