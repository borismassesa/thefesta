import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { useSavedVendorIds } from '@/hooks/useSavedVendors';
import { FindVendorsSection } from '@/components/vendors/FindVendorsSection';
import { SavedVendorsSection } from '@/components/vendors/SavedVendorsSection';
import { BookedVendorsSection } from '@/components/vendors/BookedVendorsSection';
import { VendorsModeToggle, type VendorsMode } from '@/components/vendors/VendorsModeToggle';

export default function VendorsScreen() {
  const router = useRouter();
  const { editorial } = useTheme();
  const [mode, setMode] = useState<VendorsMode>('find');
  const { data: savedIds } = useSavedVendorIds();

  const savedCount = savedIds?.length ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
      <View className="flex-row items-center justify-between px-5 pb-3 pt-2">
        <Text className="font-inter-bold text-screen-title text-ed-on-surface">Vendors</Text>

        <View className="flex-row items-center gap-4">
          <Pressable
            onPress={() => router.push('/inquiries')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="My quote requests"
          >
            <Ionicons name="document-text-outline" size={22} color={editorial.onSurface} />
          </Pressable>

          <Pressable
            onPress={() => setMode('saved')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Saved vendors, ${savedCount}`}
          >
            <Ionicons name="heart-outline" size={22} color={editorial.onSurface} />
            {savedCount > 0 ? (
              <View className="absolute -right-2 -top-1 h-4 min-w-4 items-center justify-center rounded-full bg-ed-primary-container px-1">
                <Text className="font-inter-bold text-label text-ed-on-primary">
                  {savedCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <VendorsModeToggle mode={mode} onChange={setMode} />

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-32 pt-4"
        keyboardShouldPersistTaps="handled"
      >
        {mode === 'find' ? <FindVendorsSection /> : null}
        {mode === 'saved' ? <SavedVendorsSection /> : null}
        {mode === 'booked' ? <BookedVendorsSection /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
