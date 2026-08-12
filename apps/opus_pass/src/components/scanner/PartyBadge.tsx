import { partySizeLabel } from '@/lib/scanner/roster'

/**
 * Ticket-type pill: Single, Double, Wakwe, or "Party of N".
 *
 * The three sold tickets use distinct semantic colour families so an attendant
 * can recognise them before reading: green for Single, purple for Double and
 * gold for Wakwe. Fixed light fills and dark text preserve contrast in both
 * contexts; the border keeps each pill defined against a white card.
 */
const BADGE_COLORS: Record<'single' | 'double' | 'group', { bg: string; border: string; text: string }> = {
  single: { bg: '#DDF3E4', border: '#8CC7A4', text: '#185C37' },
  double: { bg: '#EADDF7', border: '#B98FD6', text: '#5B2D8E' },
  group: { bg: '#F8E3A3', border: '#D6A934', text: '#6F4D00' },
}

export function PartyBadge({ partySize }: { partySize: number }) {
  const colors = partySize === 1 ? BADGE_COLORS.single : partySize === 2 ? BADGE_COLORS.double : BADGE_COLORS.group
  return (
    <span
      className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold"
      style={{
        backgroundColor: colors.bg,
        borderColor: colors.border,
        borderWidth: 1,
        color: colors.text,
      }}
    >
      {partySizeLabel(partySize)}
    </span>
  )
}
