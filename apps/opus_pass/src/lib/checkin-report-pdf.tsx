import { Document, Page, View, Text, Svg, Path, StyleSheet } from '@react-pdf/renderer'
import { PdfLogo, PdfLetterhead, PDF_PAGE_PADDING } from '@/lib/pdf-letterhead'
import { EventMetaRows, reportPaddingTop } from '@/lib/pdf-report-header'

const BRAND = '#5c2d8c'
const SAGE = '#2E7D55'
const NEUTRAL = '#9ca3af'

/** A drawn check mark — the standard PDF Helvetica font silently drops the ✓
 *  glyph, so arrivals are marked with a shape instead (same trick as the star
 *  in seating-plan-pdf.tsx). */
function CheckIcon() {
  return (
    <Svg width={9} height={9} viewBox="0 0 24 24">
      <Path d="M20 6L9 17l-5-5" stroke={SAGE} strokeWidth={3} fill="none" />
    </Svg>
  )
}

/** One attending guest and their door check-in, if any. */
export interface CheckinReportRow {
  name: string
  /** Globally unique admission identifier, so a paper report can be
   *  reconciled against what a guest was told. Null on invitations that
   *  predate Pass IDs. */
  passId: string | null
  /** "Single" / "Double" / "Wakwe" or an exact legacy party count. */
  ticket: string
  /** Seating-plan table name; null when the guest isn't seated yet. */
  table: string | null
  door: string | null
  attendant: string | null
  /** Pre-formatted Dar es Salaam arrival clock (e.g. "8:24 PM"); null if not yet arrived. */
  arrivedAt: string | null
}

/** Plain data in — every derived line (percent arrived, plurals, order) is
 *  computed in this file so the document never depends on a caller getting
 *  the arithmetic right. */
export interface CheckinReportData {
  eventName: string
  eventDate: string | null
  venue: string | null
  /** Pre-formatted "17 July 2026 at 3:42 PM". */
  generatedAt: string
  totalAttending: number
  totalArrived: number
  rows: CheckinReportRow[]
}

const s = StyleSheet.create({
  // paddingTop is set per document by reportPaddingTop() — it depends on how
  // many meta rows the header actually has.
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a', ...PDF_PAGE_PADDING },
  fixedHeader: { position: 'absolute', top: 40, left: 44, right: 44 },
  h1: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  // Top-right on every page: a door report gets printed and passed around, and
  // "how old is this copy?" is the first thing anyone needs to know.
  generatedLine: { position: 'absolute', top: 40, right: 44, fontSize: 7.5, color: '#9ca3af' },
  // Bottom-right, clear of the letterhead (26pt offset plus its own ~51pt).
  pageNumber: { position: 'absolute', bottom: 86, right: 44, fontSize: 8, color: '#9ca3af' },

  statRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  statTile: { flex: 1, borderWidth: 1, borderColor: '#e6e6ea', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  statValue: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  statLabel: { marginTop: 1, fontSize: 7.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3 },

  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#d8d8dc',
    paddingBottom: 5,
    marginBottom: 2,
  },
  th: { fontSize: 7.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3, fontFamily: 'Helvetica-Bold' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f1f4',
  },
  cName: { width: '22%', fontSize: 9.5 },
  // Monospaced so 8 characters line up down the page — the column exists to
  // be scanned against a value someone read aloud, not read as prose.
  cPassId: { width: '12%', fontSize: 8.5, fontFamily: 'Courier', color: '#4b5563' },
  cTicket: { width: '9%', fontSize: 9 },
  cTable: { width: '15%', fontSize: 9, color: '#4b5563' },
  cDoor: { width: '13%', fontSize: 9, color: '#4b5563' },
  cAttendant: { width: '15%', fontSize: 9, color: '#4b5563' },
  cArrived: { width: '14%', fontSize: 9, textAlign: 'right', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 3 },
  arrivedTime: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: SAGE },
  pending: { fontSize: 9, color: NEUTRAL, textAlign: 'right' },
  muted: { color: NEUTRAL },
})

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={s.statTile}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

function PageHeader({ data }: { data: CheckinReportData }) {
  return (
    <>
      <View style={s.fixedHeader} fixed>
        <PdfLogo />
        <Text style={[s.h1, { marginTop: 8 }]}>{data.eventName}</Text>
        <EventMetaRows eventDate={data.eventDate} venue={data.venue} />
        {/* No summary sentence: the stat tiles below already carry every one of
            those counts, and saying them twice just costs a line. */}
      </View>
      <Text style={s.generatedLine} fixed>
        Generated on {data.generatedAt}
      </Text>
      <Text style={s.pageNumber} fixed render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </>
  )
}

export function CheckinReportPdf({ data }: { data: CheckinReportData }) {
  const pct = data.totalAttending > 0 ? Math.round((data.totalArrived / data.totalAttending) * 100) : 0
  const notArrived = data.totalAttending - data.totalArrived

  // Arrived first (in arrival order), then the not-yet-arrived — the same
  // reading order as the live tab, so the printout matches the screen.
  const rows = [...data.rows].sort((a, b) => {
    if (a.arrivedAt && b.arrivedAt) return 0
    if (a.arrivedAt) return -1
    if (b.arrivedAt) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <Document title={`${data.eventName}: Check-in report`}>
      <Page size="A4" style={[s.page, { paddingTop: reportPaddingTop(data) }]}>
        <PageHeader data={data} />

        <View style={s.statRow}>
          <StatTile label="Confirmed" value={data.totalAttending} />
          <StatTile label="Arrived" value={data.totalArrived} />
          <StatTile label="Not arrived" value={notArrived} />
          <StatTile label="Turnout" value={`${pct}%`} />
        </View>

        <View style={s.tableHead} fixed>
          <Text style={[s.th, { width: '22%' }]}>Guest</Text>
          <Text style={[s.th, { width: '12%' }]}>Pass ID</Text>
          <Text style={[s.th, { width: '9%' }]}>Ticket</Text>
          <Text style={[s.th, { width: '15%' }]}>Table</Text>
          <Text style={[s.th, { width: '13%' }]}>Door</Text>
          <Text style={[s.th, { width: '15%' }]}>Attendant</Text>
          <Text style={[s.th, { width: '14%', textAlign: 'right' }]}>Checked in</Text>
        </View>

        {rows.map((r, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={s.cName}>{r.name}</Text>
            <Text style={s.cPassId}>{r.passId ?? '—'}</Text>
            <Text style={s.cTicket}>{r.ticket}</Text>
            <Text style={s.cTable}>{r.table ?? '—'}</Text>
            <Text style={s.cDoor}>{r.arrivedAt ? r.door ?? '—' : '—'}</Text>
            <Text style={s.cAttendant}>{r.arrivedAt ? r.attendant ?? '—' : '—'}</Text>
            {r.arrivedAt ? (
              <View style={s.cArrived}>
                <CheckIcon />
                <Text style={s.arrivedTime}>{r.arrivedAt}</Text>
              </View>
            ) : (
              <Text style={s.pending}>Not arrived</Text>
            )}
          </View>
        ))}

        <PdfLetterhead />
      </Page>
    </Document>
  )
}
