import { Text, View } from 'react-native';

export function StarRating({
  rating,
  count,
  size = 'sm',
}: {
  rating: number;
  count?: number;
  size?: 'sm' | 'md';
}) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;
  const emptyStars = Math.max(0, 5 - fullStars - (hasHalf ? 1 : 0));

  return (
    <View className="flex-row items-center gap-0.5">
      <Text className={`text-[#C4920A] ${size === 'sm' ? 'text-caption' : 'text-body'}`}>
        {'★'.repeat(fullStars)}
        {hasHalf ? '★' : ''}
        {'☆'.repeat(emptyStars)}
      </Text>
      {count !== undefined && (
        <Text className="ml-1 font-inter text-caption text-ed-on-surface-variant">
          {rating.toFixed(1)}
          {count > 0 && ` (${count})`}
        </Text>
      )}
    </View>
  );
}
