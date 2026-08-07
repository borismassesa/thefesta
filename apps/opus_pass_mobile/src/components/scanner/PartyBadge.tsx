import { Text, View } from 'react-native';
import { partySizeLabel } from '@/lib/scannerRoster';
import { TIER_PILL } from '@/theme/brand';

/**
 * Ticket-type pill: Single, Double, or "Party of N".
 *
 * Colours are borrowed from the invitation tier palette rather than invented:
 * slate for a Single, lavender for a Double, gold for the hand-entered larger
 * parties — so each ticket type is recognisable at a glance down a list, the
 * same trick the tier pills pull on the cards catalogue. Fixed colours by
 * design, like all of TIER_PILL: they don't flip with dark mode, and their
 * dark text keeps contrast on both schemes.
 */
const BADGE_COLORS: Record<'single' | 'double' | 'group', { bg: string; text: string }> = {
  single: { bg: TIER_PILL.lite.bg, text: TIER_PILL.lite.text },
  double: { bg: TIER_PILL.classic.bg, text: TIER_PILL.classic.text },
  group: { bg: TIER_PILL.signature.bg, text: TIER_PILL.signature.text },
};

export function PartyBadge({ partySize }: { partySize: number }) {
  const colors =
    partySize === 1
      ? BADGE_COLORS.single
      : partySize === 2
        ? BADGE_COLORS.double
        : BADGE_COLORS.group;
  return (
    <View
      className="shrink-0 rounded-lg px-2.5 py-1"
      style={{ backgroundColor: colors.bg }}
    >
      <Text className="font-inter-semibold text-caption" style={{ color: colors.text }}>
        {partySizeLabel(partySize)}
      </Text>
    </View>
  );
}
