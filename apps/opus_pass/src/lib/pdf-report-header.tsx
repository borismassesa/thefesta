import { View, Text, Svg, Path, Rect, Circle, StyleSheet } from '@react-pdf/renderer'

/**
 * The event date and venue lines that head every OpusPass report.
 *
 * One row each, with a drawn icon, rather than "date · venue" on a single line.
 * A middot leaves the reader to work out where one fact ends and the next
 * begins, which on a venue like "Ngurdoto Mountain Lodge, Arusha" — already
 * full of its own commas — is real work. Two labelled rows are unambiguous.
 *
 * Shared across the three reports because all three print the identical block;
 * the icons in particular are the sort of thing that drifts once copied. Drawn
 * as shapes because the standard PDF Helvetica silently drops pictographs, the
 * same reason checkin-report-pdf.tsx draws its check mark.
 */

const MUTED = '#6b7280'

const stroke = {
  stroke: MUTED,
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  fill: 'none',
} as const

function CalendarIcon() {
  return (
    <Svg width={9.5} height={9.5} viewBox="0 0 24 24">
      <Rect x={3} y={5} width={18} height={16} rx={2} {...stroke} />
      <Path d="M3 10h18" {...stroke} />
      <Path d="M8 3v4" {...stroke} />
      <Path d="M16 3v4" {...stroke} />
    </Svg>
  )
}

function PinIcon() {
  return (
    <Svg width={9.5} height={9.5} viewBox="0 0 24 24">
      <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" {...stroke} />
      <Circle cx={12} cy={10} r={3} {...stroke} />
    </Svg>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  text: { fontSize: 9.5, color: MUTED },
})

export function EventMetaRows({
  eventDate,
  venue,
}: {
  eventDate: string | null
  venue: string | null
}) {
  return (
    <>
      {eventDate ? (
        <View style={s.row}>
          <CalendarIcon />
          <Text style={s.text}>{eventDate}</Text>
        </View>
      ) : null}
      {venue ? (
        <View style={s.row}>
          <PinIcon />
          <Text style={s.text}>{venue}</Text>
        </View>
      ) : null}
    </>
  )
}

/**
 * How far down the page body has to start to clear the fixed header.
 *
 * Computed from what the header actually contains rather than hardcoded per
 * document: the meta block is now one row per fact, so an event with no venue
 * would otherwise print a band of empty space where that row would have been.
 *
 * `extraLines` is for a document that adds its own line to the header — the
 * seating plan's guest-index page carries a subtitle.
 */
export function reportPaddingTop({
  eventDate,
  venue,
  extraLines = 0,
}: {
  eventDate: string | null
  venue: string | null
  extraLines?: number
}): number {
  const rows = (eventDate ? 1 : 0) + (venue ? 1 : 0) + extraLines
  // 104pt covers the logo and the event name; each further line adds ~16pt.
  return 104 + rows * 16
}
