import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '@clerk/clerk-expo';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/navigation/BackButton';
import { useAdviceIdeaPost } from '@/hooks/useAdviceIdeaPost';
import { useLikedArticle } from '@/hooks/useLikedArticle';
import { useArticleComments } from '@/hooks/useArticleComments';
import { formatShortDate } from '@/lib/format-date';
import { useTheme } from '@/theme/useTheme';
import { FontFamily } from '@/theme/tokens';
import type {
  AdviceIdeaBlock,
  AdviceIdeaParagraphBlock,
  AdviceIdeaRichSpan,
  AdviceIdeaSection,
} from '@/types/advice-ideas';

const ARTICLE_BASE_URL = 'https://opusfesta.com/advice-and-ideas';

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function RichParagraph({ block }: { block: AdviceIdeaParagraphBlock }) {
  if (!block.richText || block.richText.length === 0) {
    return (
      <Text className="mt-3 font-inter text-body-sm leading-6 text-ed-on-surface">
        {block.text.trim()}
      </Text>
    );
  }

  return (
    <Text className="mt-3 font-inter text-body-sm leading-6 text-ed-on-surface">
      {block.richText.map((span: AdviceIdeaRichSpan, index) => {
        const bold = span.marks?.some((m) => m.type === 'bold');
        const italic = span.marks?.some((m) => m.type === 'italic');
        return (
          <Text
            key={index}
            style={{
              fontFamily: bold ? FontFamily.bold : undefined,
              fontStyle: italic ? 'italic' : undefined,
            }}
          >
            {span.text}
          </Text>
        );
      })}
    </Text>
  );
}

function Block({ block }: { block: AdviceIdeaBlock }) {
  if (block.type === 'paragraph') {
    if (!block.text.trim() && (!block.richText || block.richText.length === 0))
      return null;
    return <RichParagraph block={block} />;
  }

  if (block.type === 'image') {
    return (
      <Image
        source={{ uri: block.src }}
        className="mt-4 aspect-[4/3] w-full rounded-2xl bg-ed-surface-container-low"
        resizeMode="cover"
      />
    );
  }

  if (block.type === 'list') {
    return (
      <View className="mt-3 gap-2">
        {block.items.map((item, index) => (
          <View key={index} className="flex-row">
            <Text className="mr-2 font-inter text-body-sm text-ed-on-surface-variant">
              {block.ordered ? `${index + 1}.` : '•'}
            </Text>
            <Text className="flex-1 font-inter text-body-sm leading-6 text-ed-on-surface">
              {item.trim()}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  return null;
}

function Section({ section }: { section: AdviceIdeaSection }) {
  return (
    <View className="mt-6">
      {section.heading.trim() ? (
        <Text className="font-inter-bold text-card-title text-ed-on-surface">
          {section.heading.trim()}
        </Text>
      ) : null}
      {section.blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </View>
  );
}

export default function ArticleScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { editorial } = useTheme();
  const { user } = useUser();
  const post = useAdviceIdeaPost(slug);
  const { liked, toggle: toggleLike } = useLikedArticle(slug);
  const { comments, addComment, toggleCommentLike } = useArticleComments(slug);
  const [commentText, setCommentText] = useState('');

  const handleShare = async () => {
    if (!post.data) return;
    const url = `${ARTICLE_BASE_URL}/${post.data.slug}`;
    try {
      await Share.share({
        message: `${post.data.title}\n\n${url}`,
        url,
        title: post.data.title,
      });
    } catch {
      // User cancelled or share sheet failed — nothing to do.
    }
  };

  const handlePostComment = () => {
    if (!commentText.trim()) return;
    addComment(user?.fullName ?? user?.firstName ?? 'You', commentText);
    setCommentText('');
  };

  return (
    <SafeAreaView className="flex-1 bg-ed-bg">
      <View className="flex-row items-center justify-between px-4 pt-2">
        <BackButton />
        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={liked ? 'Unsave article' : 'Save article'}
            onPress={toggleLike}
            className="h-10 w-10 items-center justify-center rounded-full bg-ed-surface-container"
          >
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={18}
              color={liked ? '#E0245E' : editorial.onSurface}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share article"
            onPress={handleShare}
            className="h-10 w-10 items-center justify-center rounded-full bg-ed-surface-container"
          >
            <Ionicons
              name="share-outline"
              size={18}
              color={editorial.onSurface}
            />
          </Pressable>
        </View>
      </View>

      {post.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={editorial.secondary} />
        </View>
      ) : post.isError || !post.data ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center font-inter text-body-sm text-ed-error">
            Couldn't load this article. Pull to refresh, or try again shortly.
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-16 pt-2"
          showsVerticalScrollIndicator={false}
        >
          {post.data.hero_media_src ? (
            <Image
              source={{ uri: post.data.hero_media_src }}
              className="aspect-[4/3] w-full rounded-2xl bg-ed-surface-container-low"
              resizeMode="cover"
            />
          ) : null}

          {post.data.category ? (
            <Text className="mt-4 font-inter-medium text-caption uppercase tracking-wide text-ed-secondary">
              {post.data.category}
            </Text>
          ) : null}

          <Text className="mt-2 font-playfair-bold text-screen-title leading-8 text-ed-on-surface">
            {post.data.title}
          </Text>

          {post.data.author_name ? (
            <View className="mt-3 flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-ed-surface-container">
                  {post.data.author_avatar_url ? (
                    <Image
                      source={{ uri: post.data.author_avatar_url }}
                      style={{ width: 40, height: 40 }}
                    />
                  ) : (
                    <Text className="font-inter-bold text-body-sm text-ed-on-surface-variant">
                      {initialsFromName(post.data.author_name)}
                    </Text>
                  )}
                </View>
                <View>
                  <Text className="font-inter-semibold text-body-sm text-ed-on-surface">
                    {post.data.author_name}
                  </Text>
                  {post.data.author_role ? (
                    <Text className="font-inter text-caption text-ed-on-surface-variant">
                      {post.data.author_role}
                    </Text>
                  ) : null}
                </View>
              </View>
              {post.data.read_time ? (
                <View className="rounded-full bg-ed-surface-container px-3 py-1.5">
                  <Text className="font-inter-medium text-caption text-ed-on-surface-variant">
                    {post.data.read_time} min read
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {post.data.body.map((section) => (
            <Section key={section.id} section={section} />
          ))}

          <View className="mt-8 border-t border-ed-outline-variant pt-6">
            <Text className="font-inter-bold text-card-title text-ed-on-surface">
              Comments{comments.length > 0 ? ` (${comments.length})` : ''}
            </Text>

            <View className="mt-4 flex-row items-end gap-2">
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Add a comment…"
                placeholderTextColor={editorial.onSurfaceVariant}
                multiline
                className="flex-1 rounded-xl border border-ed-outline-variant bg-ed-surface px-3 py-2 font-inter text-body-sm text-ed-on-surface"
              />
              <Pressable
                onPress={handlePostComment}
                disabled={!commentText.trim()}
                className="rounded-xl bg-ed-primary-container px-4 py-2.5"
                style={{ opacity: commentText.trim() ? 1 : 0.5 }}
              >
                <Text className="font-inter-semibold text-body-sm text-ed-on-primary">
                  Post
                </Text>
              </Pressable>
            </View>

            {comments.length === 0 ? (
              <Text className="mt-4 font-inter text-body-sm text-ed-on-surface-variant">
                No comments yet — be the first to share your thoughts.
              </Text>
            ) : (
              <View className="mt-4 gap-4">
                {comments.map((comment) => (
                  <View
                    key={comment.id}
                    className="border-b border-ed-outline-variant pb-4"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="font-inter-semibold text-body-sm text-ed-on-surface">
                        {comment.author}
                      </Text>
                      <Text className="font-inter text-caption text-ed-on-surface-variant">
                        {formatShortDate(comment.createdAt)}
                      </Text>
                    </View>
                    <Text className="mt-1 font-inter text-body-sm leading-5 text-ed-on-surface">
                      {comment.text}
                    </Text>
                    <Pressable
                      onPress={() => toggleCommentLike(comment.id)}
                      className="mt-2 flex-row items-center gap-1 self-start"
                    >
                      <Ionicons
                        name={comment.liked ? 'heart' : 'heart-outline'}
                        size={14}
                        color={
                          comment.liked ? '#E0245E' : editorial.onSurfaceVariant
                        }
                      />
                      <Text
                        className="font-inter text-caption"
                        style={{
                          color: comment.liked
                            ? '#E0245E'
                            : editorial.onSurfaceVariant,
                        }}
                      >
                        Like
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
