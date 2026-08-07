import { Document, Page, View, Text, Svg, Path, StyleSheet } from '@react-pdf/renderer'
import { PdfLogo, PdfLetterhead, PDF_PAGE_PADDING } from '@/lib/pdf-letterhead'
import { EventMetaRows, reportPaddingTop } from '@/lib/pdf-report-header'
import {
  channelLabel,
  creditSummary,
  deliveryLabel,
  isProblemRow,
  rsvpLabel,
  sortInviteRows,
  type InviteReportData,
  type InviteReportRow,
} from '@/lib/invite-report'

const BRAND = '#5c2d8c'
const SAGE = '#2E7D55'
const AMBER = '#8a6d1a'
const ROSE = '#c0392b'
const NEUTRAL = '#9ca3af'

/** A drawn warning triangle. The standard PDF Helvetica silently drops the ⚠
 *  glyph, so the one mark on this page that has to be noticed is a shape —
 *  same trick as the check mark in checkin-report-pdf.tsx. */
function AlertIcon() {
  return (
    <Svg width={8} height={8} viewBox="0 0 24 24">
      <Path
        d="M12 3.5 1.8 20.5h20.4L12 3.5z"
        stroke={ROSE}
        strokeWidth={2.4}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M12 9.5v4.6" stroke={ROSE} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <Path d="M12 17.4v0.1" stroke={ROSE} strokeWidth={2.6} strokeLinecap="round" fill="none" />
    </Svg>
  )
}

/** The delivery state's colour. Only a refused delivery is coloured as a
 *  problem: "Not sent" is the normal state of a list nobody has used yet. */
function deliveryColor(row: InviteReportRow): string {
  switch (row.delivery) {
    case 'failed':
      return ROSE
    case 'read':
    case 'delivered':
      return SAGE
    case 'pending':
      return AMBER
    default:
      return NEUTRAL
  }
}

const s = StyleSheet.create({
  // paddingTop is set per document by reportPaddingTop() — it depends on how
  // many meta rows the header actually has.
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a', ...PDF_PAGE_PADDING },
  fixedHeader: { position: 'absolute', top: 40, left: 44, right: 44 },
  h1: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  // Top-right on every page: when a printout is passed around, "which version
  // is this?" is the first question, and the corner is where it gets answered.
  generatedLine: { position: 'absolute', top: 40, right: 44, fontSize: 7.5, color: '#9ca3af' },
  // Bottom-right, clear of the letterhead (which starts 77pt up from the page
  // edge: 26pt offset plus its own ~51pt).
  pageNumber: { position: 'absolute', bottom: 86, right: 44, fontSize: 8, color: '#9ca3af' },

  statRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statTile: { flex: 1, borderWidth: 1, borderColor: '#e6e6ea', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  statValue: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  statLabel: { marginTop: 1, fontSize: 7.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3 },

  credits: { borderWidth: 1, borderColor: '#e6e6ea', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11, marginBottom: 18 },
  creditTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 },
  creditLabel: { fontSize: 7.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3, fontFamily: 'Helvetica-Bold' },
  creditValue: { fontSize: 9 },
  // A plain View with a background is the cheapest bar primitive react-pdf
  // has — no Svg needed, and it survives every viewer.
  creditTrack: { height: 5, borderRadius: 3, backgroundColor: '#F6EEFB' },
  creditFill: { height: 5, borderRadius: 3 },
  creditWarn: { marginTop: 6, fontSize: 7.5, color: ROSE },

  // Every row reserves the accent gutter, including the head, so highlighting
  // a failed row shifts nothing horizontally.
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#d8d8dc',
    paddingBottom: 5,
    marginBottom: 2,
    paddingLeft: 6,
    borderLeftWidth: 2,
    borderLeftColor: '#ffffff',
  },
  th: { fontSize: 7.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3, fontFamily: 'Helvetica-Bold' },
  row: {
    flexDirection: 'row',
    // Top-aligned, not centred: a failed row's reason wraps to a second and
    // sometimes third line, and the guest's name should stay level with the
    // state label rather than drift to the middle of a tall cell.
    alignItems: 'flex-start',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f1f4',
    paddingLeft: 6,
    borderLeftWidth: 2,
    borderLeftColor: '#ffffff',
  },
  rowProblem: { borderLeftColor: ROSE, backgroundColor: '#FDF4F4' },

  // Every left-aligned cell reserves a right-hand gutter. Without it a value
  // that happens to fill its column (a spaced international number next to
  // "WhatsApp") butts straight against its neighbour with no visible gap.
  cName: { width: '19%', fontSize: 9.5, paddingRight: 6 },
  cPhone: { width: '16%', fontSize: 8.5, color: '#4b5563', paddingRight: 6 },
  cChannel: { width: '10%', fontSize: 9, color: '#4b5563', paddingRight: 6 },
  cSent: { width: '12%', fontSize: 8.5, color: '#4b5563', paddingRight: 6 },
  cDelivery: { width: '26%', paddingRight: 6 },
  cRsvp: { width: '17%', fontSize: 9, textAlign: 'right' },

  deliveryTop: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  deliveryState: { fontSize: 9 },
  // Wraps freely inside the fixed-width delivery column, so a long reason can
  // never push a neighbouring cell out of line.
  deliveryReason: { marginTop: 2, fontSize: 7.5, color: '#8a5a5a', lineHeight: 1.35 },
  muted: { color: NEUTRAL },

  footnote: { marginTop: 12, fontSize: 7.5, color: '#9ca3af', lineHeight: 1.5 },
})

function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <View style={s.statTile}>
      <Text style={tone ? [s.statValue, { color: tone }] : s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

function PageHeader({ data }: { data: InviteReportData }) {
  return (
    <>
      <View style={s.fixedHeader} fixed>
        <PdfLogo />
        <Text style={[s.h1, { marginTop: 8 }]}>{data.eventName}</Text>
        <EventMetaRows eventDate={data.eventDate} venue={data.venue} />
        {/* No summary sentence here: the stat tiles below already carry every
            one of those counts, and saying them twice just costs a line. */}
      </View>
      <Text style={s.generatedLine} fixed>
        Generated on {data.generatedAt}
      </Text>
      <Text style={s.pageNumber} fixed render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </>
  )
}

function CreditBand({ used, purchased }: { used: number; purchased: number }) {
  const { remaining, pct, overdrawn } = creditSummary(used, purchased)
  return (
    <View style={s.credits} wrap={false}>
      <View style={s.creditTop}>
        <Text style={s.creditLabel}>Invitation credits</Text>
        <Text style={s.creditValue}>
          {used} of {purchased} used · {remaining} remaining
        </Text>
      </View>
      <View style={s.creditTrack}>
        <View style={[s.creditFill, { width: `${pct}%`, backgroundColor: overdrawn ? ROSE : BRAND }]} />
      </View>
      {overdrawn ? (
        <Text style={s.creditWarn}>
          Usage is above the purchased allowance. A refunded order can remove capacity that was already spent.
        </Text>
      ) : null}
    </View>
  )
}

function GuestRow({ row }: { row: InviteReportRow }) {
  const problem = isProblemRow(row)
  return (
    <View style={problem ? [s.row, s.rowProblem] : s.row} wrap={false}>
      <Text style={s.cName}>{row.name}</Text>
      <Text style={row.phone ? s.cPhone : [s.cPhone, s.muted]}>{row.phone ?? 'No number'}</Text>
      <Text style={s.cChannel}>{channelLabel(row.channel)}</Text>
      <Text style={row.sentAt ? s.cSent : [s.cSent, s.muted]}>{row.sentAt ?? '—'}</Text>
      <View style={s.cDelivery}>
        <View style={s.deliveryTop}>
          {problem ? <AlertIcon /> : null}
          <Text
            style={[
              s.deliveryState,
              { color: deliveryColor(row) },
              problem ? { fontFamily: 'Helvetica-Bold' } : {},
            ]}
          >
            {deliveryLabel(row)}
          </Text>
        </View>
        {/* Guarded on `problem`, not on the field: the render route accepts
            client JSON, and a stale reason must never print beside a
            successful delivery. */}
        {problem && row.failureReason ? <Text style={s.deliveryReason}>{row.failureReason}</Text> : null}
      </View>
      <Text style={row.rsvp === 'none' ? [s.cRsvp, s.muted] : s.cRsvp}>{rsvpLabel(row)}</Text>
    </View>
  )
}

/**
 * The couple's invite and delivery activity for one event.
 *
 * Every derived line (the summary sentence, the labels, the credit maths, the
 * row order) comes from lib/invite-report.ts so the document can't be handed
 * arithmetic that disagrees with its own table.
 */
export function InviteReportPdf({ data }: { data: InviteReportData }) {
  const rows = sortInviteRows(data.rows)
  return (
    <Document title={`${data.eventName}: Invite report`}>
      <Page size="A4" style={[s.page, { paddingTop: reportPaddingTop(data) }]}>
        <PageHeader data={data} />

        <View style={s.statRow}>
          <StatTile label="Invited" value={data.invited} />
          <StatTile label="Delivered" value={data.delivered} />
          {/* Rose only when it means something. A permanent rose zero is an
              alarm nobody would keep believing. */}
          <StatTile label="Not delivered" value={data.undelivered} tone={data.undelivered > 0 ? ROSE : undefined} />
          <StatTile label="Viewed" value={data.viewed} />
          <StatTile label="Responded" value={data.responded} />
        </View>

        <CreditBand used={data.creditsUsed} purchased={data.creditsPurchased} />

        <View style={s.tableHead} fixed>
          <Text style={[s.th, { width: '19%' }]}>Guest</Text>
          <Text style={[s.th, { width: '16%' }]}>Phone</Text>
          <Text style={[s.th, { width: '10%' }]}>Channel</Text>
          <Text style={[s.th, { width: '12%' }]}>Sent</Text>
          <Text style={[s.th, { width: '26%' }]}>Delivery</Text>
          <Text style={[s.th, { width: '17%', textAlign: 'right' }]}>RSVP</Text>
        </View>

        {rows.map((row, i) => (
          <GuestRow key={i} row={row} />
        ))}

        {/* Load-bearing honesty: "delivered" here means WhatsApp accepted the
            invitation and never came back to refuse it, which is a weaker claim
            than the word suggests. A tooltip can carry that caveat on screen; a
            printed page has to say it. */}
        <Text style={s.footnote}>
          Delivered counts every invitation WhatsApp accepted and did not later refuse. Guests reached by SMS or
          by hand carry no delivery receipt, so they are listed without one.
        </Text>

        <PdfLetterhead />
      </Page>
    </Document>
  )
}
