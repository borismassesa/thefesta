import { Document, Page, View, Text, Svg, Path, StyleSheet } from '@react-pdf/renderer'
import { PdfLogo, PdfLetterhead, PDF_PAGE_PADDING } from '@/lib/pdf-letterhead'
import { EventMetaRows, reportPaddingTop } from '@/lib/pdf-report-header'

const BRAND = '#5c2d8c'

// Fill-state palette for the per-table capacity indicator — sage (healthy),
// ochre (nearly full), dusty rose (overbooked). Applied as a left border so
// a couple can tell a table's state at a glance instead of doing the math.
const SAGE = '#8A9A7E'
const OCHRE = '#C99A3C'
const DUSTY_ROSE = '#C97B84'
const NEUTRAL = '#d8d8dc'

function fillColor(seated: number, capacity: number): string {
  if (capacity <= 0) return NEUTRAL
  const ratio = seated / capacity
  if (ratio > 1) return DUSTY_ROSE
  if (ratio >= 0.8) return OCHRE
  return SAGE
}

/** "1 table" vs "3 tables" — the CMS template string this used to go through
 *  couldn't pluralize, so the doc always read "1 tables". */
function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/** The standard PDF Helvetica font @react-pdf/renderer uses has no ★ glyph —
 *  it silently drops unsupported Unicode characters — so the "head table"
 *  marker is a drawn shape instead of a text character. Mirrors the icon
 *  pattern already used in invoice-pdf.tsx. */
function StarIcon() {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24">
      <Path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={BRAND}
      />
    </Svg>
  )
}

export interface SeatingPlanPdfGuest {
  name: string
  seats: number
  meal: string | null
}

export interface SeatingPlanPdfTable {
  name: string
  isHead: boolean
  capacity: number
  seated: number
  guests: SeatingPlanPdfGuest[]
}

/** Raw numbers/plain data in — pluralization and every derived line ("X of Y
 *  seats filled", capacity %, fill-state color) are computed in this file,
 *  not pre-formatted by the caller, so this document isn't at the mercy of a
 *  CMS template string that can't pluralize or do arithmetic. */
export interface SeatingPlanPdfData {
  eventName: string
  /** Pre-formatted display date (e.g. "24 February 2027") — the caller already
   *  has the right timezone-aware formatter; this file just displays it. */
  eventDate: string | null
  venue: string | null
  /** Pre-formatted "17 July 2026 at 3:42 PM". */
  generatedAt: string
  totalCapacity: number
  seatedTotal: number
  unassignedTotal: number
  tables: SeatingPlanPdfTable[]
  unassigned: SeatingPlanPdfGuest[]
}

const s = StyleSheet.create({
  // paddingTop is set per page by reportPaddingTop() — it depends on how many
  // meta rows the header has, and the guest-index page adds a subtitle line.
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a', ...PDF_PAGE_PADDING },
  fixedHeader: { position: 'absolute', top: 40, left: 44, right: 44 },
  h1: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  summaryLine: { marginTop: 5, fontSize: 9.5, color: '#374151' },
  // Top-right on every page: a seating plan is reprinted as guests move, and
  // an usher holding two copies needs to see which is the newer one.
  generatedLine: { position: 'absolute', top: 40, right: 44, fontSize: 7.5, color: '#9ca3af' },
  // Bottom-right, clear of the letterhead (26pt offset plus its own ~51pt).
  pageNumber: { position: 'absolute', bottom: 86, right: 44, fontSize: 8, color: '#9ca3af' },

  statRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  statTile: { flex: 1, borderWidth: 1, borderColor: '#e6e6ea', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  statValue: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  statLabel: { marginTop: 1, fontSize: 7.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3 },

  unassignedCard: {
    borderWidth: 1,
    borderColor: DUSTY_ROSE,
    backgroundColor: '#fdf3f4',
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
  },
  unassignedTitle: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: '#96414c', marginBottom: 6 },
  unassignedRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 2 },
  unassignedName: { fontSize: 9.5 },
  unassignedSeats: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: '#96414c' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  table: { width: 158, borderWidth: 1, borderLeftWidth: 3, borderColor: '#e6e6ea', borderRadius: 8, padding: 10, marginBottom: 12 },
  tableHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 5,
    marginBottom: 5,
  },
  tableName: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  tableCount: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND },
  guestRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, paddingVertical: 2 },
  guestName: { fontSize: 8.5 },
  guestSeats: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: BRAND },
  meal: { fontSize: 7, color: '#8a8a8a', marginBottom: 2 },
  empty: { fontSize: 9, color: '#bbb' },

  indexRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  indexName: { fontSize: 9.5 },
  indexTable: { fontSize: 9.5, color: '#4b5563' },
  indexTableUnassigned: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: DUSTY_ROSE },
})

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={s.statTile}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

/** Repeats on every page of whichever <Page> it's placed in (react-pdf's
 *  `fixed` prop) — a seating plan gets reprinted often, so every page should
 *  identify the event and when this particular copy was generated. */
function PageHeader({ data, subtitle }: { data: SeatingPlanPdfData; subtitle?: string }) {
  return (
    <>
      <View style={s.fixedHeader} fixed>
        <PdfLogo />
        <Text style={[s.h1, { marginTop: 8 }]}>{data.eventName}</Text>
        <EventMetaRows eventDate={data.eventDate} venue={data.venue} />
        {/* Optional: the plan page omits it because its stat tiles already say
            the same numbers. The guest index keeps it, where it is not a repeat
            of anything but the only thing naming which view the page is. */}
        {subtitle ? <Text style={s.summaryLine}>{subtitle}</Text> : null}
      </View>
      <Text style={s.generatedLine} fixed>
        Generated on {data.generatedAt}
      </Text>
      <Text style={s.pageNumber} fixed render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </>
  )
}

export function SeatingPlanPdf({ data }: { data: SeatingPlanPdfData }) {
  const pctUsed = data.totalCapacity > 0 ? Math.round((data.seatedTotal / data.totalCapacity) * 100) : 0

  // Alphabetical guest → table index — the on-the-day, "find this guest fast"
  // view, generated from the same data as the table-by-table planning view.
  const index = [
    ...data.tables.flatMap((t) => t.guests.map((g) => ({ name: g.name, table: t.name }))),
    ...data.unassigned.map((g) => ({ name: g.name, table: null as string | null })),
  ].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Document title={`${data.eventName}: Seating plan`}>
      <Page size="A4" style={[s.page, { paddingTop: reportPaddingTop(data) }]}>
        <PageHeader data={data} />

        <View style={s.statRow}>
          <StatTile label="Seated" value={data.seatedTotal} />
          <StatTile label="Unassigned" value={data.unassignedTotal} />
          <StatTile label="Tables" value={data.tables.length} />
          <StatTile label="Capacity used" value={`${pctUsed}%`} />
        </View>

        {data.unassigned.length > 0 ? (
          <View style={s.unassignedCard} wrap={false}>
            <Text style={s.unassignedTitle}>Unassigned guests ({data.unassignedTotal})</Text>
            {data.unassigned.map((g, i) => (
              <View key={i} style={s.unassignedRow}>
                <Text style={s.unassignedName}>{g.name}</Text>
                {g.seats > 1 ? <Text style={s.unassignedSeats}>×{g.seats}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.grid}>
          {data.tables.map((t, i) => (
            <View key={i} style={[s.table, { borderLeftColor: fillColor(t.seated, t.capacity) }]} wrap={false}>
              <View style={s.tableHeadRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {t.isHead ? <StarIcon /> : null}
                  <Text style={s.tableName}>{t.name}</Text>
                </View>
                <Text style={s.tableCount}>
                  {t.seated}/{t.capacity}
                </Text>
              </View>
              {t.guests.length === 0 ? (
                <Text style={s.empty}>—</Text>
              ) : (
                t.guests.map((g, gi) => (
                  <View key={gi}>
                    <View style={s.guestRow}>
                      <Text style={s.guestName}>{g.name}</Text>
                      {g.seats > 1 ? <Text style={s.guestSeats}>×{g.seats}</Text> : null}
                    </View>
                    {g.meal ? <Text style={s.meal}>{g.meal}</Text> : null}
                  </View>
                ))
              )}
            </View>
          ))}
        </View>

        <PdfLetterhead />
      </Page>

      {/* On-the-day view: alphabetical guest → table lookup, for an usher
          who needs to find one guest fast rather than browse table-by-table. */}
      {/* The guest index carries a subtitle, so its header is one line taller. */}
      <Page size="A4" style={[s.page, { paddingTop: reportPaddingTop({ ...data, extraLines: 1 }) }]}>
        <PageHeader data={data} subtitle={`Guest index · ${index.length} ${plural(index.length, 'guest', 'guests')}, alphabetical`} />

        <View>
          {index.map((row, i) => (
            <View key={i} style={s.indexRow}>
              <Text style={s.indexName}>{row.name}</Text>
              <Text style={row.table ? s.indexTable : s.indexTableUnassigned}>{row.table ?? 'Not yet seated'}</Text>
            </View>
          ))}
        </View>

        <PdfLetterhead />
      </Page>
    </Document>
  )
}
