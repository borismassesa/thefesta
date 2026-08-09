import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import type { DocumentProps } from '@react-pdf/renderer'

// Offer letters go out on the same letterhead as every other OpusFesta
// document — report-pdf.tsx and tracker-pdf.tsx build the identical masthead
// and footer. This one used to open on a text-only wordmark in an off-brand
// purple, which is not a letter a candidate should receive.

const LOGO_URL = 'https://www.opusfesta.com/assets/logo/opusfesta-logo-black.png'
const ACCENT = '#6B4E8C'

export type OfferPdfData = {
  offerNumber: string
  version: number
  candidateName: string
  jobTitle: string
  department: string | null
  managerName: string | null
  startDate: string | null
  employmentType: string | null
  location: string | null
  workplaceType: string | null
  baseSalary: number
  currency: string
  payFrequency: string
  workingHours: string | null
  contractDuration: string | null
  probationTerms: string | null
  conditions: string[]
  expiresAt: string | null
}

const styles = StyleSheet.create({
  // Bottom padding clears the fixed letterhead on every page.
  page: { paddingTop: 44, paddingHorizontal: 48, paddingBottom: 104, fontFamily: 'Helvetica', fontSize: 10, color: '#1f2937', lineHeight: 1.5 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: ACCENT,
    paddingBottom: 14,
  },
  logo: { height: 34, width: 105 },
  tagline: { marginTop: 4, fontSize: 6.5, letterSpacing: 1.5, color: ACCENT, fontFamily: 'Helvetica-Bold' },
  companyBlock: { alignItems: 'flex-end', fontSize: 8.5, lineHeight: 1.5, color: '#4b5563' },
  companyName: { fontFamily: 'Helvetica-Bold', color: ACCENT },
  meta: { marginTop: 18, fontSize: 8, color: '#6b7280' },
  title: { marginTop: 6, fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#111827' },
  paragraph: { marginTop: 12 },
  table: { marginTop: 20, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  label: { width: '34%', padding: 8, backgroundColor: '#f9fafb', fontFamily: 'Helvetica-Bold' },
  value: { width: '66%', padding: 8 },
  heading: { marginTop: 24, fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111827' },
  bullet: { marginTop: 5, paddingLeft: 12 },
  confidential: { marginTop: 20, fontSize: 8, color: '#6b7280' },
  // Letterhead footer — pinned to every page, matching report-pdf.tsx.
  letterhead: { position: 'absolute', left: 48, right: 48, bottom: 26 },
  lhCols: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 20,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
  },
  lhBlock: { fontSize: 7.5, lineHeight: 1.55, color: '#6b7280', flex: 1 },
  lhName: { fontFamily: 'Helvetica-Bold', color: ACCENT },
  lhContact: { flex: 1, alignItems: 'flex-end' },
  lhBar: { height: 4, borderRadius: 2, backgroundColor: ACCENT },
})

/**
 * The response deadline in the long form the letterhead uses — "20 August
 * 2026, 18:00", on Dar es Salaam time. A candidate reads this letter as a
 * deadline, so it is never left as a locale-default "20/08/2026, 18:00:00".
 */
function formatDeadline(iso: string): string {
  const at = new Date(iso)
  const opts = { timeZone: 'Africa/Dar_es_Salaam' } as const
  const date = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', ...opts })
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...opts })
  return `${date}, ${time}`
}

function OfferDocument({ offer }: { offer: OfferPdfData }) {
  const money = new Intl.NumberFormat('en-TZ', { style: 'currency', currency: offer.currency, maximumFractionDigits: 0 }).format(offer.baseSalary)
  const rows = [
    ['Position', offer.jobTitle], ['Department', offer.department ?? '—'], ['Manager', offer.managerName ?? '—'],
    ['Start date', offer.startDate ?? '—'], ['Employment type', offer.employmentType ?? '—'],
    ['Location', [offer.location, offer.workplaceType].filter(Boolean).join(' · ') || '—'],
    ['Base salary', `${money} · ${offer.payFrequency}`], ['Working hours', offer.workingHours ?? '—'],
    ['Contract duration', offer.contractDuration ?? 'Not fixed'], ['Probation', offer.probationTerms ?? 'Per employment policy'],
  ]
  return (
    <Document title={`OpusFesta offer ${offer.offerNumber}`} author="OpusFesta">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Image style={styles.logo} src={LOGO_URL} />
            <Text style={styles.tagline}>PLAN LESS, CELEBRATE MORE</Text>
          </View>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>OpusFesta Company Limited</Text>
            <Text>Samaki Wabichi Annex, Mbezi Beach,</Text>
            <Text>P.O.Box 7787 Dar es Salaam, Tanzania</Text>
            <Text>info@opusfesta.com | www.opusfesta.com</Text>
          </View>
        </View>
        <Text style={styles.meta}>{offer.offerNumber} · Version {offer.version}</Text>
        <Text style={styles.title}>Offer of employment</Text>
        <Text style={styles.paragraph}>Dear {offer.candidateName},</Text>
        <Text style={styles.paragraph}>We are pleased to offer you the position described below, subject to the conditions in this letter and completion of the required pre-employment checks.</Text>
        <View style={styles.table}>{rows.map(([label, value], index) => <View key={label} style={[styles.row, index === rows.length - 1 ? { borderBottomWidth: 0 } : {}]}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>)}</View>
        {offer.conditions.length > 0 && <><Text style={styles.heading}>Conditions</Text>{offer.conditions.map((condition) => <Text key={condition} style={styles.bullet}>• {condition}</Text>)}</>}
        <Text style={styles.paragraph}>Please review and respond in your secure candidate portal by {offer.expiresAt ? formatDeadline(offer.expiresAt) : 'the stated deadline'}.</Text>
        <Text style={styles.confidential}>
          Confidential · This document is valid only for the offer version shown above.
        </Text>

        <View style={styles.letterhead} fixed>
          <View style={styles.lhCols}>
            <View style={styles.lhBlock}>
              <Text style={styles.lhName}>OpusFesta Company Limited</Text>
              <Text>Samaki Wabichi Annex, Mbezi Beach</Text>
              <Text>P.O.Box 7787 Dar es Salaam, Tanzania</Text>
            </View>
            <View style={[styles.lhBlock, styles.lhContact]}>
              <Text style={styles.lhName}>www.opusfesta.com</Text>
              <Text>info@opusfesta.com | +255 799 242 475</Text>
            </View>
          </View>
          <View style={styles.lhBar} />
        </View>
      </Page>
    </Document>
  )
}

export async function renderOfferPdfBuffer(offer: OfferPdfData): Promise<Buffer> {
  return renderToBuffer(createElement(OfferDocument, { offer }) as ReactElement<DocumentProps>)
}
