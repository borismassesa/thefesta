import { ActivityIndicator, Text, View } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { useSavedVendors } from '@/hooks/useSavedVendors';
import { EmptyState } from '@/components/ui/EmptyState';
import { VendorListItem } from './VendorListItem';

export function SavedVendorsSection() {
  const { editorial } = useTheme();
  const { data, isLoading, error } = useSavedVendors();

  if (isLoading) {
    return <ActivityIndicator className="py-16" color={editorial.onSurfaceVariant} />;
  }

  if (error) {
    return <EmptyState icon="alert-circle-outline" label="Could not load your saved vendors." />;
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon="heart-outline"
        label="No saved vendors yet. Tap the heart on a vendor to save them here."
      />
    );
  }

  return (
    <View>
      <Text className="px-5 pb-2 font-inter text-caption text-ed-on-surface-variant">
        {data.length} saved
      </Text>
      {data.map((row) => (
        <VendorListItem key={row.id} row={row} />
      ))}
    </View>
  );
}
