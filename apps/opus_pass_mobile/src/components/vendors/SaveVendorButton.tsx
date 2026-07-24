import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSavedVendorIds, useToggleSavedVendor } from '@/hooks/useSavedVendors';
import { getErrorMessage } from '@/lib/errors';

/**
 * Heart toggle shared by the cards and the detail hero. Owns its own saved
 * lookup so callers can drop it in without threading state through.
 */
export function SaveVendorButton({
  vendorId,
  size = 20,
  color,
  className = '',
}: {
  vendorId: string;
  size?: number;
  color?: string;
  className?: string;
}) {
  const { data: savedIds } = useSavedVendorIds();
  const toggle = useToggleSavedVendor();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  const isSaved = optimistic ?? Boolean(savedIds?.includes(vendorId));

  const onPress = () => {
    const next = !isSaved;
    setOptimistic(next);
    toggle.mutate(
      { vendorId, isSaved },
      {
        onError: (error) => {
          setOptimistic(null);
          Alert.alert(
            'Could not save',
            getErrorMessage(error, 'Please try again.'),
          );
        },
        onSuccess: () => setOptimistic(null),
      },
    );
  };

  if (toggle.isPending) {
    return <ActivityIndicator size="small" color={color} />;
  }

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      className={className}
      accessibilityRole="button"
      accessibilityLabel={isSaved ? 'Remove from saved vendors' : 'Save vendor'}
    >
      <Ionicons
        name={isSaved ? 'heart' : 'heart-outline'}
        size={size}
        color={isSaved ? '#E0245E' : color}
      />
    </Pressable>
  );
}
