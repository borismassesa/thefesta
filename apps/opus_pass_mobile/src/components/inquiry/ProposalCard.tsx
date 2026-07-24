import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { formatTzs } from '@/lib/cart';
import { getErrorMessage } from '@/lib/errors';
import { useTheme } from '@/theme/useTheme';
import { useAcceptProposal, useCounterProposal } from '@/hooks/useInquiries';
import type { InquiryDetail } from '@/lib/api/inquiries';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-3 py-1">
      <Text className="font-work-sans text-xs text-ed-on-surface-variant">{label}</Text>
      <Text className="flex-1 text-right font-work-sans text-xs text-ed-on-surface">{value}</Text>
    </View>
  );
}

export function ProposalCard({ inquiry }: { inquiry: InquiryDetail }) {
  const { editorial } = useTheme();
  const [countering, setCountering] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');

  const accept = useAcceptProposal(inquiry.id);
  const counter = useCounterProposal(inquiry.id);

  const isActionable = inquiry.proposal_status === 'sent';

  const onAccept = () =>
    Alert.alert('Accept this quote?', 'The vendor will be notified and your date confirmed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: () =>
          accept.mutate(undefined, {
            onError: (error) =>
              Alert.alert(
                'Could not accept',
                getErrorMessage(error, 'Please try again.'),
              ),
          }),
      },
    ]);

  const onCounter = () => {
    const parsed = counterAmount.replace(/[^0-9]/g, '');
    if (!parsed && !counterMessage.trim()) {
      Alert.alert('Add a counter', 'Enter an amount or a note for the vendor.');
      return;
    }

    counter.mutate(
      {
        counterAmount: parsed ? Number(parsed) : undefined,
        counterMessage: counterMessage.trim() || undefined,
      },
      {
        onSuccess: () => {
          setCountering(false);
          setCounterAmount('');
          setCounterMessage('');
        },
        onError: (error) =>
          Alert.alert(
            'Could not send counter',
            getErrorMessage(error, 'Please try again.'),
          ),
      },
    );
  };

  return (
    <View className="gap-2 rounded-2xl border border-ed-outline-variant bg-ed-surface p-4">
      <Text className="font-work-sans-bold text-sm text-ed-on-surface">Vendor's quote</Text>

      {inquiry.proposal_invoice_amount != null ? (
        <Text className="font-playfair-bold text-2xl text-ed-on-surface">
          {formatTzs(inquiry.proposal_invoice_amount)}
        </Text>
      ) : null}

      <View className="mt-1">
        {inquiry.proposal_package ? <Row label="Package" value={inquiry.proposal_package} /> : null}
        {inquiry.proposal_event_date ? (
          <Row label="Date" value={new Date(inquiry.proposal_event_date).toDateString()} />
        ) : null}
        {inquiry.proposal_venue ? <Row label="Venue" value={inquiry.proposal_venue} /> : null}
        {inquiry.proposal_guest_count != null ? (
          <Row label="Guests" value={String(inquiry.proposal_guest_count)} />
        ) : null}
      </View>

      {inquiry.proposal_invoice_details ? (
        <Text className="mt-1 font-work-sans text-xs leading-5 text-ed-on-surface-variant">
          {inquiry.proposal_invoice_details}
        </Text>
      ) : null}

      {inquiry.proposal_status === 'countered' ? (
        <View className="mt-2 rounded-xl bg-ed-surface-container p-3">
          <Text className="font-work-sans-bold text-xs text-ed-on-surface">
            Your counter{' '}
            {inquiry.proposal_counter_amount != null
              ? `· ${formatTzs(inquiry.proposal_counter_amount)}`
              : ''}
          </Text>
          {inquiry.proposal_counter_message ? (
            <Text className="mt-1 font-work-sans text-xs text-ed-on-surface-variant">
              {inquiry.proposal_counter_message}
            </Text>
          ) : null}
          <Text className="mt-2 font-work-sans text-[11px] text-ed-on-surface-variant">
            Waiting on the vendor to respond.
          </Text>
        </View>
      ) : null}

      {inquiry.proposal_status === 'accepted' ? (
        <View className="mt-2 rounded-xl bg-[#dcfce7] p-3">
          <Text className="font-work-sans-bold text-xs text-[#16a34a]">
            You accepted this quote.
          </Text>
        </View>
      ) : null}

      {isActionable ? (
        countering ? (
          <View className="mt-2 gap-2">
            <TextInput
              value={counterAmount}
              onChangeText={setCounterAmount}
              placeholder="Counter amount (TZS)"
              placeholderTextColor={editorial.onSurfaceVariant}
              keyboardType="number-pad"
              className="rounded-xl border border-ed-outline-variant bg-ed-surface px-3 py-2.5 font-work-sans text-sm text-ed-on-surface"
            />
            <TextInput
              value={counterMessage}
              onChangeText={setCounterMessage}
              placeholder="Add a note (optional)"
              placeholderTextColor={editorial.onSurfaceVariant}
              multiline
              className="min-h-16 rounded-xl border border-ed-outline-variant bg-ed-surface px-3 py-2.5 font-work-sans text-sm text-ed-on-surface"
              textAlignVertical="top"
            />
            <View className="flex-row gap-2">
              <Pressable
                className="flex-1 items-center rounded-full border border-ed-outline py-2.5"
                onPress={() => setCountering(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel counter"
              >
                <Text className="font-work-sans-bold text-xs text-ed-on-surface">Cancel</Text>
              </Pressable>
              <Pressable
                className="flex-1 items-center rounded-full bg-ed-primary-container py-2.5"
                onPress={onCounter}
                disabled={counter.isPending}
                accessibilityRole="button"
                accessibilityLabel="Send counter"
              >
                {counter.isPending ? (
                  <ActivityIndicator size="small" color={editorial.onPrimary} />
                ) : (
                  <Text className="font-work-sans-bold text-xs text-ed-on-primary">
                    Send counter
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="mt-3 flex-row gap-2">
            <Pressable
              className="flex-1 items-center rounded-full border border-ed-outline py-3"
              onPress={() => setCountering(true)}
              accessibilityRole="button"
              accessibilityLabel="Counter offer"
            >
              <Text className="font-work-sans-bold text-xs text-ed-on-surface">Counter</Text>
            </Pressable>
            <Pressable
              className="flex-1 items-center rounded-full bg-ed-primary-container py-3"
              onPress={onAccept}
              disabled={accept.isPending}
              accessibilityRole="button"
              accessibilityLabel="Accept quote"
            >
              {accept.isPending ? (
                <ActivityIndicator size="small" color={editorial.onPrimary} />
              ) : (
                <Text className="font-work-sans-bold text-xs text-ed-on-primary">Accept</Text>
              )}
            </Pressable>
          </View>
        )
      ) : null}
    </View>
  );
}
