import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import type { DocumentProps } from '@react-pdf/renderer'

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
  page: { padding: 48, fontFamily: 'Helvetica', fontSize: 10, color: '#1f2937', lineHeight: 1.5 },
  brand: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#5B2D8E' },
  meta: { marginTop: 4, fontSize: 8, color: '#6b7280' },
  title: { marginTop: 32, fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#111827' },
  paragraph: { marginTop: 12 },
  table: { marginTop: 20, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  label: { width: '34%', padding: 8, backgroundColor: '#f9fafb', fontFamily: 'Helvetica-Bold' },
  value: { width: '66%', padding: 8 },
  heading: { marginTop: 24, fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111827' },
  bullet: { marginTop: 5, paddingLeft: 12 },
  footer: { position: 'absolute', left: 48, right: 48, bottom: 32, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8, fontSize: 8, color: '#6b7280' },
})

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
        <Text style={styles.brand}>OpusFesta</Text>
        <Text style={styles.meta}>{offer.offerNumber} · Version {offer.version}</Text>
        <Text style={styles.title}>Offer of employment</Text>
        <Text style={styles.paragraph}>Dear {offer.candidateName},</Text>
        <Text style={styles.paragraph}>We are pleased to offer you the position described below, subject to the conditions in this letter and completion of the required pre-employment checks.</Text>
        <View style={styles.table}>{rows.map(([label, value], index) => <View key={label} style={[styles.row, index === rows.length - 1 ? { borderBottomWidth: 0 } : {}]}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>)}</View>
        {offer.conditions.length > 0 && <><Text style={styles.heading}>Conditions</Text>{offer.conditions.map((condition) => <Text key={condition} style={styles.bullet}>• {condition}</Text>)}</>}
        <Text style={styles.paragraph}>Please review and respond in your secure candidate portal by {offer.expiresAt ? new Date(offer.expiresAt).toLocaleString('en-TZ', { timeZone: 'Africa/Dar_es_Salaam' }) : 'the stated deadline'}.</Text>
        <Text style={styles.footer}>Confidential · This document is valid only for the offer version shown above. OpusFesta Limited.</Text>
      </Page>
    </Document>
  )
}

export async function renderOfferPdfBuffer(offer: OfferPdfData): Promise<Buffer> {
  return renderToBuffer(createElement(OfferDocument, { offer }) as ReactElement<DocumentProps>)
}
