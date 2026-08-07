import { Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { ACCENT, ON_ACCENT } from '@/theme/brand';
import { shortVendorLocation, vendorBadgeLabel } from '@/lib/vendor-format';
import { StarRating } from './ui/StarRating';
import type { VendorListing } from '@/types/vendor';

/** `width` is for horizontal carousels; omit it to fill the parent in a grid. */
export function VendorCard({ vendor, width }: { vendor: VendorListing; width?: number }) {
  const router = useRouter();
  const { editorial } = useTheme();

  const image = vendor.cover_image || vendor.logo;
  const rating = vendor.stats?.averageRating ?? 0;
  const reviewCount = vendor.stats?.reviewCount ?? 0;
  const location = shortVendorLocation(vendor.location);
  const badge = vendorBadgeLabel(vendor);

  return (
    <Pressable
      style={width === undefined ? undefined : { width }}
      className="overflow-hidden rounded-3xl border border-ed-outline-variant bg-ed-surface"
      onPress={() => router.push(`/vendor/${vendor.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`View ${vendor.business_name}`}
    >
      <View className="h-32 w-full bg-ed-surface-container">
        {image ? (
          <Image source={{ uri: image }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <Ionicons name="storefront-outline" size={26} color={editorial.onSurfaceVariant} />
          </View>
        )}

        {badge ? (
          <View
            className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-1"
            style={{ backgroundColor: ACCENT }}
          >
            <Text
              className="font-inter-bold text-label uppercase tracking-[1.5px]"
              style={{ color: ON_ACCENT }}
            >
              {badge}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="gap-1.5 px-3.5 py-3">
        <Text
          numberOfLines={1}
          className="font-inter-bold text-label uppercase tracking-[1.5px] text-ed-on-surface-variant"
        >
          {vendor.category}
        </Text>

        <Text numberOfLines={1} className="font-inter-bold text-body leading-tight text-ed-on-surface">
          {vendor.business_name}
        </Text>

        <View className="mt-0.5 flex-row items-center justify-between gap-2">
          {reviewCount > 0 ? (
            <StarRating rating={rating} count={reviewCount} />
          ) : (
            <Text className="font-inter text-caption italic text-ed-on-surface-variant">No reviews</Text>
          )}
          {location ? (
            <View className="flex-row shrink items-center gap-0.5">
              <Ionicons name="location-outline" size={11} color={editorial.onSurfaceVariant} />
              <Text numberOfLines={1} className="font-inter text-caption text-ed-on-surface-variant">
                {location}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
