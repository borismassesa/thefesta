import {
  ImageBackground,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAdviceIdeaPosts } from '@/hooks/useAdviceIdeaPosts';
import { useTheme } from '@/theme/useTheme';

type IoniconName = keyof typeof Ionicons.glyphMap;

const CATEGORY_ICON: Record<string, IoniconName> = {
  'Planning Guides': 'clipboard-outline',
  'Photo & Video Ideas': 'camera-outline',
  'Honeymoon Ideas': 'airplane-outline',
};

// Sized so 2 cards sit fully visible plus a quarter of the third one peeking
// in, hinting there's more to scroll to (same pattern as the Cards category
// swatches row).
const VISIBLE_IDEA_CARDS = 2;
const IDEA_CARD_PEEK = 0.25;
const IDEA_CARD_GAP = 12; // matches gap-3
const IDEA_ROW_PADDING = 20; // matches px-5

export function IdeasAdvice() {
  const router = useRouter();
  const { editorial } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.floor(
    (windowWidth - IDEA_ROW_PADDING * 2 - IDEA_CARD_GAP * VISIBLE_IDEA_CARDS) /
      (VISIBLE_IDEA_CARDS + IDEA_CARD_PEEK)
  );
  const posts = useAdviceIdeaPosts();

  if (
    posts.isPending ||
    posts.isError ||
    (posts.data && posts.data.length === 0)
  ) {
    return null;
  }

  return (
    <View className="mt-8 pb-8">
      <Text className="font-inter-bold text-section-title text-ed-on-surface">
        Ideas &amp; advice
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="mt-4 gap-3 pr-5"
        className="-mx-5 pl-5"
      >
        {posts.data.map((post) => (
          <Pressable
            key={post.slug}
            onPress={() =>
              router.push({
                pathname: '/article/[slug]',
                params: { slug: post.slug },
              })
            }
            style={{ width: cardWidth }}
          >
            <ImageBackground
              source={{ uri: post.hero_media_src ?? undefined }}
              resizeMode="cover"
              className="aspect-[3/4] items-end justify-end overflow-hidden rounded-2xl"
            >
              <View
                className="absolute inset-0"
                style={{ backgroundColor: 'rgba(0,0,0,0.18)' }}
              />
              <View
                className="m-2 h-8 w-8 items-center justify-center rounded-full"
                style={{ backgroundColor: 'rgba(255,255,255,0.92)' }}
              >
                <Ionicons
                  name={
                    CATEGORY_ICON[post.category ?? ''] ?? 'sparkles-outline'
                  }
                  size={16}
                  color={editorial.onSurface}
                />
              </View>
            </ImageBackground>
            <Text
              numberOfLines={2}
              className="mt-2 font-inter-semibold text-caption leading-4 text-ed-on-surface"
            >
              {post.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
