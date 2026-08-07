import { Text, View } from 'react-native';
import type { InquiryStatus, ProposalStatus } from '@/types/vendor';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-ed-surface-container', text: 'text-ed-on-surface-variant', label: 'Sent' },
  responded: { bg: 'bg-[#fff7ed]', text: 'text-[#C4920A]', label: 'Vendor replied' },
  accepted: { bg: 'bg-[#dcfce7]', text: 'text-[#16a34a]', label: 'Accepted' },
  declined: { bg: 'bg-ed-surface-container', text: 'text-ed-on-surface-variant', label: 'Declined' },
  closed: { bg: 'bg-ed-surface-container', text: 'text-ed-on-surface-variant', label: 'Closed' },
};

const PROPOSAL_STYLES: Record<ProposalStatus, { bg: string; text: string; label: string }> = {
  sent: { bg: 'bg-[#fff7ed]', text: 'text-[#C4920A]', label: 'Quote received' },
  countered: { bg: 'bg-ed-surface-container', text: 'text-ed-on-surface-variant', label: 'Countered' },
  accepted: { bg: 'bg-[#dcfce7]', text: 'text-[#16a34a]', label: 'Accepted' },
  declined: { bg: 'bg-ed-surface-container', text: 'text-ed-on-surface-variant', label: 'Declined' },
};

/** The proposal state is the more specific signal, so it wins when present. */
export function InquiryStatusBadge({
  status,
  proposalStatus,
}: {
  status: InquiryStatus;
  proposalStatus?: ProposalStatus | null;
}) {
  const style = proposalStatus
    ? PROPOSAL_STYLES[proposalStatus]
    : STATUS_STYLES[status] ?? STATUS_STYLES.pending;

  return (
    <View className={`rounded-full px-2.5 py-1 ${style.bg}`}>
      <Text className={`font-inter-bold text-label ${style.text}`}>{style.label}</Text>
    </View>
  );
}
