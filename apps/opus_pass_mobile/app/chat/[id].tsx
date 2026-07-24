import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { getErrorMessage } from '@/lib/errors';
import { useInternalUserId } from '@/hooks/useInternalUserId';
import { useMarkThreadRead, useMessages, useSendMessage, useThread } from '@/hooks/useMessages';
import { EmptyState } from '@/components/ui/EmptyState';

export default function ChatThreadScreen() {
  const router = useRouter();
  const { editorial } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');

  const { data: userId } = useInternalUserId();
  const { data: thread } = useThread(id);
  const { data: messages, isLoading } = useMessages(id);
  const send = useSendMessage(id);
  const markRead = useMarkThreadRead(id);

  const markReadMutate = markRead.mutate;
  useEffect(() => {
    if (messages?.length) markReadMutate();
  }, [messages?.length, markReadMutate]);

  const onSend = () => {
    const content = draft.trim();
    if (!content) return;
    setDraft('');
    send.mutate(content, {
      onError: (error) => {
        setDraft(content);
        Alert.alert(
          'Could not send',
          getErrorMessage(error, 'Please try again.'),
        );
      },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
      <View className="flex-row items-center gap-3 border-b border-ed-outline-variant px-5 pb-3 pt-2">
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={editorial.onSurface} />
        </Pressable>
        <Text numberOfLines={1} className="flex-1 font-playfair-bold text-lg text-ed-on-surface">
          {thread?.vendors?.business_name ?? 'Conversation'}
        </Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerClassName="gap-2 px-5 py-4"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {isLoading ? (
            <ActivityIndicator className="py-16" color={editorial.onSurfaceVariant} />
          ) : messages && messages.length > 0 ? (
            messages.map((message) => {
              const isMe = message.sender_id === userId;
              return (
                <View
                  key={message.id}
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                    isMe
                      ? 'self-end bg-ed-primary-container'
                      : 'self-start bg-ed-surface-container'
                  }`}
                >
                  <Text
                    className={`font-work-sans text-sm ${
                      isMe ? 'text-ed-on-primary' : 'text-ed-on-surface'
                    }`}
                  >
                    {message.content}
                  </Text>
                </View>
              );
            })
          ) : (
            <EmptyState icon="chatbubble-outline" label="No messages yet. Say hello." />
          )}
        </ScrollView>

        <View className="flex-row items-end gap-2 border-t border-ed-outline-variant px-4 py-2.5">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={editorial.onSurfaceVariant}
            multiline
            className="max-h-28 flex-1 rounded-2xl bg-ed-surface-container px-4 py-2.5 font-work-sans text-sm text-ed-on-surface"
          />
          <Pressable
            onPress={onSend}
            disabled={!draft.trim() || send.isPending}
            className={`h-10 w-10 items-center justify-center rounded-full ${
              draft.trim() ? 'bg-ed-primary-container' : 'bg-ed-surface-container-high'
            }`}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            {send.isPending ? (
              <ActivityIndicator size="small" color={editorial.onPrimary} />
            ) : (
              <Ionicons
                name="arrow-up"
                size={18}
                color={draft.trim() ? editorial.onPrimary : editorial.onSurfaceVariant}
              />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
