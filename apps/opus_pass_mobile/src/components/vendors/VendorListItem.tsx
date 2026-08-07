import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { Avatar } from './ui/Avatar';
import { StarRating } from './ui/StarRating';
import type { SavedVendorRow } from '@/types/vendor';

export function VendorListItem({ row }: { row: SavedVendorRow }) {
  const router = useRouter();
  const { editorial } = useTheme();
  const vendor = row.vendors;

  if (!vendor) return null;

  const rating = vendor.stats?.averageRating ?? 0;
  const reviewCount = vendor.stats?.reviewCount ?? 0;
  const location = vendor.location?.city ?? '';

  return (
    <Pressable
      className="flex-row items-center gap-3 border-b border-ed-outline-variant px-5 py-3"
      onPress={() => router.push(`/vendor/${vendor.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`View ${vendor.business_name}`}
    >
      <Avatar name={vendor.business_name} uri={vendor.cover_image ?? vendor.logo} />

      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1} className="font-inter-bold text-body-sm text-ed-on-surface">
          {vendor.business_name}
        </Text>
        <Text numberOfLines={1} className="font-inter text-caption text-ed-on-surface-variant">
          {[vendor.category, location].filter(Boolean).join(' · ')}
        </Text>
        {reviewCount > 0 ? <StarRating rating={rating} count={reviewCount} /> : null}
      </View>

      {row.status === 'booked' ? (
        <View className="rounded-full bg-[#dcfce7] px-2 py-1">
          <Text className="font-inter-bold text-label text-[#16a34a]">Booked</Text>
        </View>
      ) : null}

      <Ionicons name="chevron-forward" size={16} color={editorial.onSurfaceVariant} />
    </Pressable>
  );
}
