import { View, Text, Svg, Path, Rect, Circle, StyleSheet } from '@react-pdf/renderer'

/**
 * Drawn primitives for the check-in reports.
 *
 * TWO constraints drive everything here, both learned the hard way.
 *
 *  1. NO EMOJI, EVER. react-pdf's standard Helvetica silently DROPS glyphs it
 *     does not have — no tofu box, no warning, just nothing where the mark
 *     should be. A status column of green circles would render as a column of
 *     blank space. checkin-report-pdf.tsx already draws its tick as an SVG path
 *     for exactly this reason. Every mark below is geometry.
 *
 *  2. NO RECHARTS. It renders to the DOM and cannot target a PDF. Charts here
 *     are <Rect>/<Path> taking model data directly, which also makes the output
 *     deterministic: the same model always produces the same document, and the
 *     web and the export cannot drift apart.
 *
 * Colour never carries meaning on its own. Every status pill has a word in it,
 * every bar has a number beside it.
 */

const BRAND = '#5c2d8c'
const SAGE = '#2E7D55'
const AMBER = '#b45309'
const NEUTRAL = '#9ca3af'
const INK = '#1a1a1a'

export const REPORT_COLORS = { BRAND, SAGE, AMBER, NEUTRAL, INK } as const

// ---------------------------------------------------------------------- icons

const stroke = (color: string, width = 2) =>
  ({ stroke: color, strokeWidth: width, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }) as const

export function TickIcon({ size = 9, color = SAGE }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 6L9 17l-5-5" {...stroke(color, 3)} />
    </Svg>
  )
}

export function DashIcon({ size = 9, color = NEUTRAL }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12h14" {...stroke(color, 3)} />
    </Svg>
  )
}

/** Half-filled ring: a party that came in partly. */
export function PartialIcon({ size = 9, color = AMBER }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} {...stroke(color, 3)} />
      <Path d="M12 3a9 9 0 0 1 0 18z" fill={color} />
    </Svg>
  )
}

export function DoorIcon({ size = 11, color = BRAND }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17" {...stroke(color)} />
      <Path d="M3 21h18" {...stroke(color)} />
      <Circle cx={12} cy={12} r={1} fill={color} />
    </Svg>
  )
}

export function PeopleIcon({ size = 11, color = BRAND }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...stroke(color)} />
      <Circle cx={9} cy={7} r={4} {...stroke(color)} />
      <Path d="M22 21v-2a4 4 0 0 0-3-3.87" {...stroke(color)} />
    </Svg>
  )
}

export function ShieldIcon({ size = 11, color = BRAND }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" {...stroke(color)} />
    </Svg>
  )
}

export function ClockIcon({ size = 11, color = BRAND }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} {...stroke(color)} />
      <Path d="M12 7v5l3 2" {...stroke(color)} />
    </Svg>
  )
}

export function EnvelopeIcon({ size = 11, color = BRAND }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={2} y={5} width={20} height={14} rx={2} {...stroke(color)} />
      <Path d="M3 7l9 6 9-6" {...stroke(color)} />
    </Svg>
  )
}

// ---------------------------------------------------------------------- pills

const p = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 999 },
  pillText: { fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 0.2 },
})

export type GuestStatus = 'admitted' | 'partial' | 'not_arrived'

const STATUS_TONE: Record<GuestStatus, { bg: string; fg: string }> = {
  admitted: { bg: '#ecfdf5', fg: SAGE },
  partial: { bg: '#fffbeb', fg: AMBER },
  not_arrived: { bg: '#f3f4f6', fg: '#6b7280' },
}

/**
 * A drawn pill, not a coloured word. The label is always present, so the
 * status survives greyscale printing and colour-blind readers alike.
 */
export function StatusPill({ status, label }: { status: GuestStatus; label: string }) {
  const tone = STATUS_TONE[status]
  return (
    <View style={[p.pill, { backgroundColor: tone.bg }]}>
      {status === 'admitted' ? (
        <TickIcon size={7} color={tone.fg} />
      ) : status === 'partial' ? (
        <PartialIcon size={7} color={tone.fg} />
      ) : (
        <DashIcon size={7} color={tone.fg} />
      )}
      <Text style={[p.pillText, { color: tone.fg }]}>{label}</Text>
    </View>
  )
}

// --------------------------------------------------------------------- charts

const c = StyleSheet.create({
  wrap: { marginTop: 6 },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { fontSize: 7.5, color: NEUTRAL },
  caption: { fontSize: 8, color: '#6b7280', marginTop: 6 },
  emptyBox: {
    borderWidth: 1,
    borderColor: '#e6e6ea',
    borderRadius: 8,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  emptyText: { fontSize: 9, color: NEUTRAL, textAlign: 'center' },
})

/** Empty states are sentences, never a bare 0 or a blank frame. */
export function EmptyState({ children }: { children: string }) {
  return (
    <View style={c.emptyBox}>
      <Text style={c.emptyText}>{children}</Text>
    </View>
  )
}

export interface TimelineBar {
  startsAt: string
  seats: number
}

/**
 * Seats admitted per interval.
 *
 * Bars are drawn from a shared baseline with one hue: the intervals are a
 * sequence, not categories, so length alone does the comparing. The peak bar is
 * the only one that differs, and it is labelled rather than merely coloured.
 */
export function ArrivalTimeline({
  bars,
  peakIndex,
  width = 507,
  height = 120,
  startLabel,
  endLabel,
}: {
  bars: TimelineBar[]
  peakIndex: number
  width?: number
  height?: number
  /** Rendered verbatim. The caller decides whether a date is needed: a span
   *  crossing midnight labelled with times alone reads as a short window. */
  startLabel: string
  endLabel: string
}) {
  if (bars.length === 0) return null

  const max = Math.max(...bars.map((b) => b.seats), 1)
  const gap = bars.length > 60 ? 0.5 : bars.length > 30 ? 1 : 2
  const barWidth = Math.max((width - gap * (bars.length - 1)) / bars.length, 0.6)
  const baseline = height - 14

  return (
    <View style={c.wrap}>
      <Svg width={width} height={height}>
        {/* Baseline only. Gridlines across a 120pt band would out-weigh the
            data they are supposed to support. */}
        <Path d={`M0 ${baseline} L${width} ${baseline}`} stroke="#e5e7eb" strokeWidth={1} fill="none" />
        {bars.map((b, i) => {
          const h = b.seats > 0 ? Math.max((b.seats / max) * (baseline - 6), 1.5) : 0
          if (h === 0) return null
          return (
            <Rect
              key={i}
              x={i * (barWidth + gap)}
              y={baseline - h}
              width={barWidth}
              height={h}
              fill={i === peakIndex ? BRAND : '#C9A0DC'}
            />
          )
        })}
      </Svg>
      <View style={c.axisRow}>
        <Text style={c.axisText}>{startLabel}</Text>
        <Text style={c.axisText}>{endLabel}</Text>
      </View>
    </View>
  )
}

/**
 * A horizontal meter for one ratio against a limit.
 *
 * Not a two-slice pie: this is a part of a whole measured against a known
 * maximum, and a bar reads that far more accurately than an angle.
 */
export function RatioMeter({
  numerator,
  denominator,
  width = 507,
  color = BRAND,
}: {
  numerator: number
  denominator: number
  width?: number
  color?: string
}) {
  const filled = denominator > 0 ? Math.min(Math.max(numerator / denominator, 0), 1) : 0
  return (
    <Svg width={width} height={10} style={{ marginTop: 6 }}>
      <Rect x={0} y={0} width={width} height={10} rx={5} fill="#F0DFF6" />
      {filled > 0 ? <Rect x={0} y={0} width={width * filled} height={10} rx={5} fill={color} /> : null}
    </Svg>
  )
}

/**
 * Nominal categories (door names carry no order), so every bar takes the same
 * hue and only length compares them.
 */
export function CategoryBars({
  rows,
  width = 507,
  labelWidth = 150,
}: {
  rows: { label: string; value: number }[]
  width?: number
  labelWidth?: number
}) {
  if (rows.length === 0) return null
  const max = Math.max(...rows.map((r) => r.value), 1)
  const trackWidth = width - labelWidth - 34
  return (
    <View style={{ marginTop: 4 }}>
      {rows.map((r) => (
        <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
          <Text style={{ width: labelWidth, fontSize: 9, color: '#374151' }}>{r.label}</Text>
          <Svg width={trackWidth} height={10}>
            <Rect x={0} y={1} width={Math.max((r.value / max) * trackWidth, 1)} height={8} rx={4} fill={BRAND} />
          </Svg>
          <Text style={{ width: 34, fontSize: 9, textAlign: 'right', color: '#374151' }}>{r.value}</Text>
        </View>
      ))}
    </View>
  )
}

// ----------------------------------------------------------------- stat tiles

const t = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e6e6ea',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 11,
  },
  value: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: INK },
  label: { marginTop: 3, fontSize: 7.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3 },
  hint: { marginTop: 4, fontSize: 8, color: NEUTRAL },
})

export interface StatTileProps {
  value: string
  label: string
  /** Where a rate prints "78 of 93". A metric with an unknown value passes
   *  "Not recorded" here rather than showing a misleading 0. */
  hint?: string | null
}

export function StatTile({ value, label, hint }: StatTileProps) {
  return (
    <View style={t.tile}>
      <Text style={t.value}>{value}</Text>
      <Text style={t.label}>{label}</Text>
      {hint ? <Text style={t.hint}>{hint}</Text> : null}
    </View>
  )
}

export function StatRow({ tiles }: { tiles: StatTileProps[] }) {
  return (
    <View style={t.row}>
      {tiles.map((tile) => (
        <StatTile key={tile.label} {...tile} />
      ))}
    </View>
  )
}
