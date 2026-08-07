import { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { useSavedVendors } from '@/hooks/useSavedVendors';
import { VENDOR_CATEGORIES } from '@/constants/vendorCategories';
import type { SavedVendorRow } from '@/types/vendor';

/**
 * A couple's booked state lives in `saved_vendors.status`, not `vendor_bookings`
 * — that table's RLS is vendor-only, so couples cannot read it.
 */
export function BookedVendorsSection() {
  const router = useRouter();
  const { editorial } = useTheme();
  const { data, isLoading } = useSavedVendors();

  const bookedByCategory = useMemo(() => {
    const map = new Map<string, SavedVendorRow>();
    for (const row of data ?? []) {
      const category = row.vendors?.category;
      if (row.status === 'booked' && category && !map.has(category)) {
        map.set(category, row);
      }
    }
    return map;
  }, [data]);

  if (isLoading) {
    return <ActivityIndicator className="py-16" color={editorial.onSurfaceVariant} />;
  }

  return (
    <View className="gap-1 px-5">
      <Text className="pb-2 font-inter text-caption text-ed-on-surface-variant">
        {bookedByCategory.size} of {VENDOR_CATEGORIES.length} booked
      </Text>

      {VENDOR_CATEGORIES.map((category) => {
        const booked = bookedByCategory.get(category.key);

        return (
          <Pressable
            key={category.key}
            className="flex-row items-center gap-3 border-b border-ed-outline-variant py-3"
            onPress={() =>
              booked
                ? router.push(`/vendor/${booked.vendor_id}`)
                : router.push(`/vendor-category/${encodeURIComponent(category.key)}`)
            }
            accessibilityRole="button"
            accessibilityLabel={
              booked
                ? `View booked ${category.label}: ${booked.vendors?.business_name ?? ''}`
                : `Find a ${category.label} vendor`
            }
          >
            <View
              className={`h-10 w-10 items-center justify-center rounded-full ${
                booked
                  ? 'bg-[#dcfce7]'
                  : 'border border-dashed border-ed-outline bg-ed-surface-container-low'
              }`}
            >
              <Ionicons
                name={booked ? 'checkmark' : category.icon}
                size={18}
                color={booked ? '#16a34a' : editorial.onSurfaceVariant}
              />
            </View>

            <View className="flex-1">
              <Text className="font-inter-bold text-body-sm text-ed-on-surface">
                {category.label}
              </Text>
              <Text numberOfLines={1} className="font-inter text-caption text-ed-on-surface-variant">
                {booked?.vendors?.business_name ?? 'Not booked yet'}
              </Text>
            </View>

            <Ionicons
              name={booked ? 'chevron-forward' : 'add'}
              size={16}
              color={editorial.onSurfaceVariant}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
