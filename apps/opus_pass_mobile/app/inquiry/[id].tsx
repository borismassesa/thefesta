import { useState } from 'react';
import { withAuthGate } from '@/components/auth/withAuthGate';
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
import { useInquiry, useSendInquiryMessage } from '@/hooks/useInquiries';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProposalCard } from '@/components/inquiry/ProposalCard';
import { InquiryStatusBadge } from '@/components/inquiry/InquiryStatusBadge';

function InquiryDetailScreen() {
  const router = useRouter();
  const { editorial } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [draft, setDraft] = useState('');

  const { data, isLoading, error } = useInquiry(id);
  const sendMessage = useSendInquiryMessage(id);

  const inquiry = data?.inquiry;
  const messages = data?.messages ?? [];

  const onSend = () => {
    const content = draft.trim();
    if (!content) return;
    setDraft('');
    sendMessage.mutate(content, {
      onError: (err) => {
        setDraft(content);
        Alert.alert('Could not send', getErrorMessage(err, 'Please try again.'));
      },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-ed-bg" edges={['top']}>
      <View className="flex-row items-center gap-3 border-b border-ed-outline-variant px-5 pb-3 pt-2">
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={editorial.onSurface} />
        </Pressable>
        <Text numberOfLines={1} className="flex-1 font-inter-bold text-card-title text-ed-on-surface">
          {inquiry?.vendor_name ?? 'Request'}
        </Text>
        {inquiry ? (
          <InquiryStatusBadge
            status={inquiry.status}
            proposalStatus={inquiry.proposal_status}
          />
        ) : null}
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView className="flex-1" contentContainerClassName="gap-4 px-5 py-4">
          {isLoading ? (
            <ActivityIndicator className="py-16" color={editorial.onSurfaceVariant} />
          ) : error || !inquiry ? (
            <EmptyState
              icon="alert-circle-outline"
              label={getErrorMessage(error, 'Could not load this request.')}
            />
          ) : (
            <>
              {inquiry.proposal_status ? <ProposalCard inquiry={inquiry} /> : null}

              <View className="gap-2">
                <Text className="font-inter-bold text-body-sm text-ed-on-surface">
                  Conversation
                </Text>

                {messages.length > 0 ? (
                  messages.map((message) => {
                    const isMe = message.sender_type === 'client';
                    return (
                      <View
                        key={message.id}
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                          isMe
                            ? 'self-end bg-ed-primary-container'
                            : 'self-start bg-ed-surface-container'
                        }`}
                      >
                        <Text
                          className={`font-inter text-body-sm ${
                            isMe ? 'text-ed-on-primary' : 'text-ed-on-surface'
                          }`}
                        >
                          {message.content}
                        </Text>
                      </View>
                    );
                  })
                ) : (
                  <Text className="font-inter text-caption text-ed-on-surface-variant">
                    No replies yet.
                  </Text>
                )}
              </View>
            </>
          )}
        </ScrollView>

        {inquiry ? (
          <View className="flex-row items-end gap-2 border-t border-ed-outline-variant px-4 py-2.5">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Reply to the vendor"
              placeholderTextColor={editorial.onSurfaceVariant}
              multiline
              className="max-h-28 flex-1 rounded-2xl bg-ed-surface-container px-4 py-2.5 font-inter text-body-sm text-ed-on-surface"
            />
            <Pressable
              onPress={onSend}
              disabled={!draft.trim() || sendMessage.isPending}
              className={`h-10 w-10 items-center justify-center rounded-full ${
                draft.trim() ? 'bg-ed-primary-container' : 'bg-ed-surface-container-high'
              }`}
              accessibilityRole="button"
              accessibilityLabel="Send reply"
            >
              {sendMessage.isPending ? (
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
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Signed-in only. Wrapper, not a route group — see withAuthGate. */
export default withAuthGate(InquiryDetailScreen);
