import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { ACCENT, ON_ACCENT } from '@/theme/brand';
import { shortVendorLocation, vendorBadgeLabel, vendorImages } from '@/lib/vendor-format';
import { StarRating } from './ui/StarRating';
import { SaveVendorButton } from './SaveVendorButton';
import type { VendorListing } from '@/types/vendor';

const IMAGE_HEIGHT = 220;

export function CategoryVendorCard({ vendor }: { vendor: VendorListing }) {
  const router = useRouter();
  const { editorial } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);

  const cardWidth = screenWidth - 40;
  const images = vendorImages(vendor);
  const rating = vendor.stats?.averageRating ?? 0;
  const reviewCount = vendor.stats?.reviewCount ?? 0;
  const location = shortVendorLocation(vendor.location);
  const badge = vendorBadgeLabel(vendor);

  return (
    <Pressable
      style={{ width: cardWidth }}
      className="overflow-hidden rounded-2xl border border-ed-outline-variant bg-ed-surface"
      onPress={() => router.push(`/vendor/${vendor.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`View ${vendor.business_name}`}
    >
      <View style={{ height: IMAGE_HEIGHT }} className="bg-ed-surface-container">
        {images.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) =>
              setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / cardWidth))
            }
          >
            {images.map((uri) => (
              <Image
                key={uri}
                source={{ uri }}
                style={{ width: cardWidth, height: IMAGE_HEIGHT }}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
        ) : (
          <View className="h-full w-full items-center justify-center">
            <Ionicons name="storefront-outline" size={32} color={editorial.onSurfaceVariant} />
          </View>
        )}

        <View className="absolute right-3 top-3 h-9 w-9 items-center justify-center rounded-full bg-black/40">
          <SaveVendorButton vendorId={vendor.id} color="#FFFFFF" />
        </View>

        {badge ? (
          <View
            className="absolute left-3 top-3 rounded-full px-3 py-1"
            style={{ backgroundColor: ACCENT }}
          >
            <Text
              className="font-work-sans-bold text-[9px] uppercase tracking-[1.5px]"
              style={{ color: ON_ACCENT }}
            >
              {badge}
            </Text>
          </View>
        ) : null}

        {images.length > 1 ? (
          <View className="absolute bottom-3 w-full flex-row justify-center gap-1.5">
            {images.map((uri, index) => (
              <View
                key={uri}
                className={`h-1.5 rounded-full ${
                  index === activeIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                }`}
              />
            ))}
          </View>
        ) : null}
      </View>

      <View className="gap-1.5 px-4 py-3.5">
        <Text
          numberOfLines={1}
          className="font-work-sans-bold text-[10px] uppercase tracking-[1.5px] text-ed-on-surface-variant"
        >
          {vendor.category}
        </Text>

        <View className="flex-row items-center gap-1.5">
          <Text numberOfLines={1} className="flex-1 font-work-sans-bold text-base text-ed-on-surface">
            {vendor.business_name}
          </Text>
          {vendor.verified ? (
            <Ionicons name="checkmark-circle" size={16} color={editorial.secondary} />
          ) : null}
        </View>

        {location ? (
          <Text numberOfLines={1} className="font-work-sans text-sm text-ed-on-surface-variant">
            {location}
          </Text>
        ) : null}

        {reviewCount > 0 ? <StarRating rating={rating} count={reviewCount} /> : null}
      </View>
    </Pressable>
  );
}
