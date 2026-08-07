import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { useVendorsByCategory } from '@/hooks/useVendors';
import { findVendorCategory } from '@/constants/vendorCategories';
import { EmptyState } from '@/components/ui/EmptyState';
import { CategoryVendorCard } from '@/components/vendors/CategoryVendorCard';

export default function VendorCategoryScreen() {
  const router = useRouter();
  const { editorial } = useTheme();
  const { category } = useLocalSearchParams<{ category: string }>();

  const categoryKey = category ? decodeURIComponent(category) : undefined;
  const { data, isLoading, error } = useVendorsByCategory(categoryKey);
  const title = findVendorCategory(categoryKey)?.label ?? categoryKey ?? 'Vendors';

  return (
    <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={editorial.onSurface} />
        </Pressable>
        <Text className="flex-1 font-inter-bold text-section-title text-ed-on-surface">{title}</Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="items-center gap-4 px-5 pb-32 pt-2">
        {isLoading ? (
          <ActivityIndicator className="py-16" color={editorial.onSurfaceVariant} />
        ) : error ? (
          <EmptyState icon="alert-circle-outline" label="Could not load vendors." />
        ) : data && data.length > 0 ? (
          data.map((vendor) => <CategoryVendorCard key={vendor.id} vendor={vendor} />)
        ) : (
          <EmptyState icon="storefront-outline" label={`No ${title.toLowerCase()} listed yet.`} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
