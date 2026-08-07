import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { useCoupleProfile } from '@/hooks/useDashboard';
import { useFeaturedVendors, useSearchVendors } from '@/hooks/useVendors';
import { VENDOR_CATEGORIES } from '@/constants/vendorCategories';
import { EmptyState } from '@/components/ui/EmptyState';
import { VendorCard } from './VendorCard';

export function FindVendorsSection() {
  const router = useRouter();
  const { editorial } = useTheme();
  const [query, setQuery] = useState('');

  const { data: profile } = useCoupleProfile();
  const featured = useFeaturedVendors();
  const search = useSearchVendors(query);

  const isSearching = query.trim().length >= 2;
  const results = isSearching ? search.data : featured.data;
  const isLoading = isSearching ? search.isLoading : featured.isLoading;
  const city = profile?.city;

  return (
    <View className="gap-6 pb-4">
      <View className="gap-3 px-5">
        <Text className="font-inter-bold text-card-title text-ed-on-surface">
          {city ? `Find vendors in ${city}` : 'Find vendors'}
        </Text>

        <View className="flex-row items-center gap-2 rounded-full border border-ed-outline-variant bg-ed-surface-container-low px-4 py-2.5">
          <Ionicons name="search-outline" size={18} color={editorial.onSurfaceVariant} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search vendors"
            placeholderTextColor={editorial.onSurfaceVariant}
            returnKeyType="search"
            autoCorrect={false}
            className="flex-1 font-inter text-body-sm text-ed-on-surface"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={editorial.onSurfaceVariant} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {!isSearching ? (
        <View className="gap-3 px-5">
          <Text className="font-inter-bold text-body-sm text-ed-on-surface">Browse by category</Text>
          <View className="flex-row flex-wrap gap-3">
            {VENDOR_CATEGORIES.map((category) => (
              <Pressable
                key={category.key}
                className="h-24 flex-1 basis-[47%] overflow-hidden rounded-2xl bg-ed-surface-container"
                onPress={() => router.push(`/vendor-category/${encodeURIComponent(category.key)}`)}
                accessibilityRole="button"
                accessibilityLabel={`Browse ${category.label}`}
              >
                <Image
                  source={{ uri: category.image }}
                  className="absolute h-full w-full"
                  resizeMode="cover"
                />
                <View className="absolute h-full w-full bg-black/35" />
                <View className="flex-1 justify-end p-3">
                  <Text className="font-inter-bold text-body-sm text-white">{category.label}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View className="gap-3 px-5">
        <Text className="font-inter-bold text-body-sm text-ed-on-surface">
          {isSearching ? 'Results' : 'Featured vendors'}
        </Text>

        {isLoading ? (
          <ActivityIndicator className="py-10" color={editorial.onSurfaceVariant} />
        ) : results && results.length > 0 ? (
          <View className="flex-row flex-wrap gap-3">
            {results.map((vendor) => (
              <View key={vendor.id} className="grow basis-[47%]">
                <VendorCard vendor={vendor} />
              </View>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="storefront-outline"
            label={isSearching ? `No vendors match “${query}”.` : 'No vendors listed yet.'}
          />
        )}
      </View>
    </View>
  );
}
