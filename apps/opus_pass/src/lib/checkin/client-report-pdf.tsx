import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { PdfDocumentHead, PdfLetterhead, PdfLogo, PDF_PAGE_PADDING } from '@/lib/pdf-letterhead'
import {
  ArrivalTimeline,
  CategoryBars,
  EmptyState,
  RatioMeter,
  StatRow,
  StatusPill,
  REPORT_COLORS,
} from '@/lib/pdf/report-visuals'
import {
  formatReportDate,
  formatReportDateTime,
  formatReportTime,
  formatReportWindow,
  formatRatePercent,
} from './report-format'
import { reportStrings, type ReportLocale } from './report-strings'
import { ticketLabelFor, type CheckinReportModel } from './report-model-core'

/**
 * The Client Event Report: the document a couple keeps.
 *
 * Renders from a FINALIZED SNAPSHOT of the canonical model, never from live
 * tables, and is therefore only reachable once an event has been explicitly
 * finalized. That gate is what stops the failure this whole redesign began
 * with: the previous report could be downloaded the night before the wedding
 * and would cheerfully wrap a keepsake around a 3% turnout figure taken twelve
 * hours before anyone arrived.
 *
 * Six designed pages plus a suppressible appendix. The appendix carries the
 * length so the designed part stays intentional.
 *
 * No emoji anywhere: react-pdf's Helvetica drops them silently. Every mark is
 * drawn geometry from report-visuals.tsx.
 */

const { BRAND, NEUTRAL, SAGE } = REPORT_COLORS

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a', ...PDF_PAGE_PADDING },

  // Cover. The one page with no document head: it identifies the event, it
  // does not grade it, so no statistic appears here at all.
  cover: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  coverKicker: { fontSize: 9, letterSpacing: 2.6, color: NEUTRAL, textTransform: 'uppercase' },
  coverRule: { width: 46, height: 2, backgroundColor: BRAND, marginVertical: 22 },
  coverName: { fontSize: 30, fontFamily: 'Helvetica-Bold', textAlign: 'center', lineHeight: 1.25 },
  coverAnd: { fontSize: 14, color: NEUTRAL, marginVertical: 6, textAlign: 'center' },
  coverMeta: { marginTop: 26, fontSize: 11, color: '#4b5563', textAlign: 'center' },
  coverVenue: { marginTop: 4, fontSize: 10, color: NEUTRAL, textAlign: 'center' },

  h2: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  sub: { fontSize: 9, color: '#6b7280', marginBottom: 12 },
  block: { marginTop: 22 },
  label: { fontSize: 7.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3 },
  value: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  explainer: { marginTop: 14, fontSize: 9, color: '#4b5563', lineHeight: 1.5 },

  highlight: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e6e6ea',
    borderRadius: 8,
    backgroundColor: '#faf7fc',
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  highlightValue: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: BRAND },
  highlightLabel: { fontSize: 10, color: '#4b5563', flex: 1 },

  pairRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  pair: { flex: 1, borderWidth: 1, borderColor: '#e6e6ea', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11 },

  // Appendix table
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
  cell: { fontSize: 9 },
  passCell: { fontSize: 8.5, fontFamily: 'Courier', color: '#4b5563' },
  muted: { fontSize: 9, color: NEUTRAL },

  runningHead: { position: 'absolute', top: 22, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between' },
  runningText: { fontSize: 7.5, color: NEUTRAL },

  closing: { marginTop: 40, alignItems: 'center' },
  closingH: { fontSize: 15, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  closingBody: { marginTop: 12, fontSize: 10, color: '#4b5563', lineHeight: 1.6, textAlign: 'center', maxWidth: 380 },
  provenance: { marginTop: 34, fontSize: 8, color: NEUTRAL, textAlign: 'center', lineHeight: 1.6 },
})

function coupleName(model: CheckinReportModel): string {
  const { partner1Name, partner2Name } = model.event
  if (partner1Name && partner2Name) return `${partner1Name}|${partner2Name}`
  return partner1Name || partner2Name || model.event.name
}

/** Continuation pages get a slim rule, not the full head: repeating the whole
 *  title block cost 150pt of every page in the old report. */
function RunningHead({ text }: { text: string }) {
  return (
    <View style={s.runningHead} fixed>
      <Text style={s.runningText}>{text}</Text>
      <Text style={s.runningText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  )
}

export interface ClientReportOptions {
  locale?: ReportLocale
  /** Included by default; the couple may suppress it before download. Framed
   *  as a content choice, not a privacy warning. */
  includeAppendix?: boolean
}

export function ClientEventReportPdf({
  model,
  options = {},
}: {
  model: CheckinReportModel
  options?: ClientReportOptions
}) {
  const locale = options.locale ?? 'en'
  const includeAppendix = options.includeAppendix ?? true
  const t = reportStrings(locale)

  const { counts, rates, arrivals, doors, integrity, delivery, staff, guests } = model
  const eventDate = formatReportDate(model.event.startsAt, locale)
  const venue = [model.event.venueName, model.event.city].filter(Boolean).join(', ')
  const names = coupleName(model).split('|')

  const seatPct = formatRatePercent(rates.seatAttendance)
  // A door that ran past midnight, or a test scan the day before, makes the
  // first and last bucket fall on different days. Time-only axis labels would
  // then read as a short evening window instead of the span it really is.
  const spansDays =
    arrivals.buckets.length > 1 &&
    formatReportDate(arrivals.buckets[0].startsAt, locale) !==
      formatReportDate(arrivals.buckets[arrivals.buckets.length - 1].startsAt, locale)
  const axisLabel = (iso: string) =>
    spansDays
      ? `${formatReportDate(iso, locale)} · ${formatReportTime(iso, locale)}`
      : formatReportTime(iso, locale)

  const peakIndex = arrivals.peak
    ? arrivals.buckets.findIndex((b) => b.startsAt === arrivals.peak?.startsAt)
    : -1

  // Conditional columns. The old report spent three of seven columns printing
  // an em dash: a table where every cell is the same value is noise, not data.
  const distinctTables = new Set(guests.map((g) => g.tableName).filter(Boolean))
  const distinctDoors = new Set(guests.map((g) => g.door).filter(Boolean))
  const showTable = distinctTables.size > 0
  const showDoor = distinctDoors.size > 1
  const soleOfficer = staff.length === 1 ? staff[0].name : null

  const runningTitle = [model.event.name, eventDate].filter(Boolean).join(' · ')

  const headMeta = [
    { label: t.metaEvent, value: model.event.name },
    { label: t.metaDate, value: eventDate },
    { label: t.metaVenue, value: venue, wide: true },
    {
      label: t.metaFinalized,
      value: formatReportDateTime(model.finalization.finalizedAt, locale),
    },
  ]

  return (
    <Document title={`${model.event.name}: ${t.coverTitle}`}>
      {/* ── Page 1: Cover ─────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <PdfLogo />
          <View style={s.coverRule} />
          <Text style={s.coverKicker}>{t.coverTitle}</Text>
          <View style={{ marginTop: 20, alignItems: 'center' }}>
            <Text style={s.coverName}>{names[0]}</Text>
            {names[1] ? (
              <>
                <Text style={s.coverAnd}>{t.coverAnd}</Text>
                <Text style={s.coverName}>{names[1]}</Text>
              </>
            ) : null}
          </View>
          {eventDate ? <Text style={s.coverMeta}>{eventDate}</Text> : null}
          {venue ? <Text style={s.coverVenue}>{venue}</Text> : null}
        </View>
        <PdfLetterhead />
      </Page>

      {/* ── Page 2: Event Summary ─────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <PdfDocumentHead
          title={t.eventReport}
          status="final"
          statusLabel={t.statusFinal}
          meta={headMeta}
          aside={{ label: t.asideHosts, value: names.join(` ${t.coverAnd} `) }}
        />

        <Text style={s.h2}>{t.summaryHeading}</Text>
        <Text style={s.sub}>{t.summarySubtitle}</Text>

        {/* Invitations and seats are separate tiles on purpose. 93 cards is 163
            people here; a single "guests" number would understate the room. */}
        <StatRow
          tiles={[
            {
              value: String(counts.confirmedInvitations),
              label: t.tileInvitations,
              hint: `${counts.singleInvitations} ${t.singleEntry} · ${counts.doubleInvitations} ${t.doubleEntry}`,
            },
            {
              value: String(counts.confirmedSeats),
              label: t.tileSeats,
              hint: t.ofInvitations(counts.confirmedInvitations),
            },
            {
              value: String(counts.admittedSeats),
              label: t.tileAdmitted,
              hint: t.ofSeats(counts.confirmedSeats),
            },
            {
              value: seatPct ?? '—',
              label: t.tileAttendance,
              hint: seatPct
                ? `${counts.admittedSeats} / ${counts.confirmedSeats}`
                : t.notYetMeasured,
            },
          ]}
        />

        {rates.seatAttendance ? (
          <RatioMeter
            numerator={rates.seatAttendance.numerator}
            denominator={rates.seatAttendance.denominator}
          />
        ) : null}

        <View style={s.block}>
          <Text style={s.h2}>{t.invitationBreakdown}</Text>
          <CategoryBars
            rows={[
              { label: t.singleEntry, value: counts.singleInvitations },
              { label: t.doubleEntry, value: counts.doubleInvitations },
            ]}
          />
        </View>

        <PdfLetterhead />
      </Page>

      {/* ── Page 3: Arrival Story ─────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <RunningHead text={runningTitle} />
        <View style={{ marginTop: 22 }}>
          <Text style={s.h2}>{t.arrivalHeading}</Text>
          <Text style={s.sub}>
            {arrivals.bucketMinutes > 0 ? t.arrivalSubtitle(arrivals.bucketMinutes) : ''}
          </Text>

          {arrivals.buckets.length > 0 ? (
            <>
              <ArrivalTimeline
                bars={arrivals.buckets}
                peakIndex={peakIndex}
                startLabel={axisLabel(arrivals.buckets[0].startsAt)}
                endLabel={axisLabel(arrivals.buckets[arrivals.buckets.length - 1].startsAt)}
              />
              <View style={s.pairRow}>
                <View style={s.pair}>
                  <Text style={s.label}>{t.firstGuestArrived}</Text>
                  <Text style={s.value}>{formatReportTime(arrivals.firstAdmittedAt, locale)}</Text>
                </View>
                <View style={s.pair}>
                  <Text style={s.label}>{t.peakArrivalPeriod}</Text>
                  <Text style={s.value}>
                    {arrivals.peak
                      ? formatReportWindow(arrivals.peak.startsAt, arrivals.peak.endsAt, locale)
                      : t.notRecorded}
                  </Text>
                </View>
                <View style={s.pair}>
                  <Text style={s.label}>{t.lastGuestArrived}</Text>
                  <Text style={s.value}>{formatReportTime(arrivals.lastAdmittedAt, locale)}</Text>
                </View>
              </View>
            </>
          ) : (
            <EmptyState>{t.arrivalEmpty}</EmptyState>
          )}
        </View>
        <PdfLetterhead />
      </Page>

      {/* ── Page 4: Check-in Performance ──────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <RunningHead text={runningTitle} />
        <View style={{ marginTop: 22 }}>
          <Text style={s.h2}>{t.performanceHeading}</Text>
          <Text style={s.sub}>{t.performanceExplainer}</Text>

          <StatRow
            tiles={[
              { value: String(doors.length), label: t.tileEntryPoints },
              { value: String(staff.length), label: t.tileTeam },
              {
                value: integrity.manualAdmissions === null ? '—' : String(integrity.manualAdmissions),
                label: t.tileManual,
                hint: integrity.manualAdmissions === null ? t.notRecorded : null,
              },
            ]}
          />

          {/* Framed as the system working, not as incidents survived. A bare
              "37" beside a short label reads as a chaotic wedding when it means
              the opposite, so this figure keeps its whole sentence. */}
          <View style={s.highlight}>
            <Text style={s.highlightValue}>{integrity.exhaustedAttempts}</Text>
            <Text style={s.highlightLabel}>{t.blockedHeadline}</Text>
          </View>

          {doors.length > 0 ? (
            <View style={s.block}>
              <Text style={s.h2}>{t.doorsHeading}</Text>
              <CategoryBars rows={doors.map((d) => ({ label: d.label, value: d.admittedSeats }))} />
            </View>
          ) : null}

          {soleOfficer ? (
            <View style={s.block}>
              <Text style={s.label}>{t.primaryOfficer}</Text>
              <Text style={s.value}>{soleOfficer}</Text>
            </View>
          ) : null}
        </View>
        <PdfLetterhead />
      </Page>

      {/* ── Page 5: Invitation Health ─────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <RunningHead text={runningTitle} />
        <View style={{ marginTop: 22 }}>
          <Text style={s.h2}>{t.deliveryHeading}</Text>

          {delivery.attempted > 0 ? (
            <>
              {/* Unknowns are named, never folded into success or failure:
                  "84 of 93 delivered" alone reads as though nine failed. */}
              <Text style={s.sub}>{t.deliverySubtitle(delivery.attempted, delivery.noReceipt)}</Text>
              <StatRow
                tiles={[
                  {
                    value: String(delivery.confirmed),
                    label: t.confirmedDelivered,
                    hint: formatRatePercent(rates.confirmedDelivery) ?? t.notYetMeasured,
                  },
                  { value: String(delivery.read), label: t.deliveryRead },
                  { value: String(delivery.failed), label: t.deliveryFailed },
                ]}
              />
              {delivery.failureReasons.length > 0 ? (
                <View style={s.block}>
                  <CategoryBars
                    rows={delivery.failureReasons.map((f) => ({ label: f.reason, value: f.count }))}
                    labelWidth={330}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <EmptyState>{t.deliveryEmpty}</EmptyState>
          )}
        </View>
        <PdfLetterhead />
      </Page>

      {/* ── Page 6: Closing ───────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <RunningHead text={runningTitle} />
        <View style={s.closing}>
          <PdfLogo />
          <Text style={[s.closingH, { marginTop: 26 }]}>{t.closingHeading}</Text>
          <Text style={s.closingBody}>{t.closingBody}</Text>
          <Text style={s.provenance}>
            {`${t.metaGenerated}: ${formatReportDateTime(model.generatedAt, locale)}`}
            {'\n'}
            {model.finalization.finalizedAt
              ? `${t.metaFinalized}: ${formatReportDateTime(model.finalization.finalizedAt, locale)}`
              : ''}
            {'\n'}
            {model.finalization.version ? `${t.metaVersion}: ${model.finalization.version}` : ''}
          </Text>
        </View>
        <PdfLetterhead />
      </Page>

      {/* ── Appendix ──────────────────────────────────────────────────────── */}
      {includeAppendix ? (
        <Page size="A4" style={s.page}>
          <RunningHead text={runningTitle} />
          <View style={{ marginTop: 22 }}>
            <Text style={s.h2}>{t.appendixHeading}</Text>
            <Text style={s.sub}>
              {`${counts.confirmedInvitations} ${t.confirmedInvitations.toLowerCase()} · ${counts.confirmedSeats} ${t.confirmedSeats.toLowerCase()}`}
            </Text>

            {guests.length === 0 ? (
              <EmptyState>{t.appendixEmpty}</EmptyState>
            ) : (
              <>
                <View style={s.tableHead} fixed>
                  <Text style={[s.th, { width: '26%' }]}>{t.colGuest}</Text>
                  <Text style={[s.th, { width: '13%' }]}>{t.colPass}</Text>
                  <Text style={[s.th, { width: '11%' }]}>{t.colTicket}</Text>
                  <Text style={[s.th, { width: '18%' }]}>{t.colStatus}</Text>
                  <Text style={[s.th, { width: showTable || showDoor ? '16%' : '32%' }]}>{t.colArrived}</Text>
                  {showTable ? <Text style={[s.th, { width: '16%' }]}>{t.colTable}</Text> : null}
                  {showDoor ? <Text style={[s.th, { width: '16%' }]}>{t.colDoor}</Text> : null}
                </View>

                {guests.map((g) => (
                  <View key={g.invitationId} style={s.row} wrap={false}>
                    <Text style={[s.cell, { width: '26%' }]}>{g.name}</Text>
                    <Text style={[s.passCell, { width: '13%' }]}>{g.passId ?? ''}</Text>
                    <Text style={[s.cell, { width: '11%' }]}>{ticketLabelFor(g.entryAllowance)}</Text>
                    <View style={{ width: '18%' }}>
                      <StatusPill
                        status={g.status}
                        label={
                          g.status === 'admitted'
                            ? t.statusAdmitted
                            : g.status === 'partial'
                              ? `${t.statusPartial} ${g.admittedSeats}/${g.entryAllowance}`
                              : t.statusNotArrived
                        }
                      />
                    </View>
                    {/* An amendment can admit a guest without ever recording an
                        arrival time, so an admitted guest with no timestamp is
                        a real state and says so rather than showing blank. */}
                    <Text
                      style={[
                        g.firstAdmittedAt ? s.cell : s.muted,
                        { width: showTable || showDoor ? '16%' : '32%' },
                      ]}
                    >
                      {g.firstAdmittedAt
                        ? formatReportTime(g.firstAdmittedAt, locale)
                        : g.status === 'not_arrived'
                          ? ''
                          : t.timeNotRecorded}
                    </Text>
                    {showTable ? (
                      <Text style={[g.tableName ? s.cell : s.muted, { width: '16%' }]}>
                        {g.tableName ?? t.unassigned}
                      </Text>
                    ) : null}
                    {showDoor ? (
                      <Text style={[g.door ? s.cell : s.muted, { width: '16%' }]}>{g.door ?? ''}</Text>
                    ) : null}
                  </View>
                ))}
              </>
            )}
          </View>
          <PdfLetterhead />
        </Page>
      ) : null}
    </Document>
  )
}

/** Exported for the renderer's version dispatch. */
export const CLIENT_REPORT_SUPPORTED_MODEL_VERSIONS = [1] as const

export class UnsupportedReportModelVersionError extends Error {
  constructor(readonly modelVersion: number) {
    super(
      `No renderer for check-in report model version ${modelVersion}. Historical snapshots must never be reinterpreted under changed semantics.`,
    )
    this.name = 'UnsupportedReportModelVersionError'
  }
}

/**
 * Renderers dispatch on the snapshot's model version and refuse what they do
 * not know. Old snapshots may be migrated forward deliberately later; they are
 * never silently treated as today's interface.
 */
export function renderClientReport(
  model: CheckinReportModel,
  options?: ClientReportOptions,
) {
  switch (model.modelVersion) {
    case 1:
      return <ClientEventReportPdf model={model} options={options} />
    default:
      throw new UnsupportedReportModelVersionError(model.modelVersion)
  }
}

/** Kept beside the renderer so the unused-colour lint cannot drift. */
export const CLIENT_REPORT_ACCENTS = { BRAND, SAGE } as const
