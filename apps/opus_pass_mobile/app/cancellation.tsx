import { Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/navigation/BackButton';

// Content mirrors apps/opus_pass/src/app/(content)/cancellation/page.tsx
// verbatim (same eyebrow/title/updated date, same five sections, same
// copy) so the policy reads identically on web and mobile. Web renders it
// as a two-column doc with a sticky Table of Contents; that layout doesn't
// translate to a phone screen, so this is a single-column scroll instead —
// only the presentation differs, not the policy text itself.

interface PolicySection {
  id: string;
  title: string;
  body: React.ReactNode;
}

function Bold({ children }: { children: React.ReactNode }) {
  return <Text className="font-inter-semibold text-ed-on-surface">{children}</Text>;
}

const SECTIONS: PolicySection[] = [
  {
    id: 'digital-packages',
    title: 'Digital packages',
    body: (
      <Text className="font-inter text-body-sm leading-6 text-ed-on-surface-variant">
        You can cancel for a{' '}
        <Bold>full refund any time before your digital cards are sent</Bold>. Once invites have
        gone out, the package is non-refundable — the cards and tickets are already live to your
        guests and the work has been delivered.
      </Text>
    ),
  },
  {
    id: 'attendant-add-on',
    title: 'On-site attendant add-on',
    body: (
      <Text className="font-inter text-body-sm leading-6 text-ed-on-surface-variant">
        The on-site scanning attendant can be cancelled up to{' '}
        <Bold>7 days before your event</Bold> for a full refund. Within 7 days of the event the
        attendant has already been scheduled and travel arranged, so this add-on is
        non-refundable, though we&rsquo;ll always try to accommodate a date change where we can.
      </Text>
    ),
  },
  {
    id: 'printed-cards',
    title: 'Premium printed cards',
    body: (
      <Text className="font-inter text-body-sm leading-6 text-ed-on-surface-variant">
        Printed cards can be cancelled for a full refund any time{' '}
        <Bold>before they go to print</Bold>. Once printing has started the cards are made to
        order, so the print portion of your order is non-refundable. Your digital package is
        unaffected and follows the policy above.
      </Text>
    ),
  },
  {
    id: 'changes',
    title: 'Changing your event details',
    body: (
      <Text className="font-inter text-body-sm leading-6 text-ed-on-surface-variant">
        Because your digital cards are delivered digitally, you can{' '}
        <Bold>update event details — venue, date, or time — at no cost</Bold>, even after invites
        are sent. Every guest sees the change instantly, so a reschedule never means buying again.
      </Text>
    ),
  },
  {
    id: 'how-to-cancel',
    title: 'How to cancel',
    body: (
      <Text className="font-inter text-body-sm leading-6 text-ed-on-surface-variant">
        Email{' '}
        <Text
          onPress={() => Linking.openURL('mailto:support@opusfesta.com')}
          className="font-inter-semibold text-ed-secondary"
        >
          support@opusfesta.com
        </Text>{' '}
        or message us on WhatsApp with your order details. Approved refunds are returned to your
        original payment method (M-Pesa, Airtel Money, Mixx by Yas, Selcom Pesa, Visa, or
        Mastercard) within 7–14 business days.
      </Text>
    ),
  },
];

export default function CancellationPolicyScreen() {
  return (
    <SafeAreaView className="flex-1 bg-ed-bg">
      <View className="px-4 pt-2">
        <BackButton />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-16 pt-4"
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-center font-inter-semibold text-label uppercase tracking-[0.2em] text-ed-on-surface-variant">
          Legal
        </Text>
        <Text className="mt-3 text-center font-inter-bold text-screen-title text-ed-on-surface">
          Cancellation &amp; Refund Policy
        </Text>
        <Text className="mt-2 text-center font-inter text-caption text-ed-on-surface-variant">
          Last updated June 2026
        </Text>

        <Text className="mt-8 font-inter text-body-sm leading-6 text-ed-on-surface-variant">
          This policy explains how cancellations and refunds work across OpusPass digital
          packages, add-ons, and printed cards.
        </Text>

        <View className="mt-8 gap-8">
          {SECTIONS.map((section) => (
            <View key={section.id}>
              <Text className="font-inter-bold text-section-title text-ed-on-surface">
                {section.title}
              </Text>
              <View className="mt-2.5">{section.body}</View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
