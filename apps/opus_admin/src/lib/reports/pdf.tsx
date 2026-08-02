import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import { allFields, type ReportField } from './fields'
import type { ReportVersion } from './queries'

// PDF of a filed report version.
//
// THE CONTRACT. This renders `version.content` against `version.fieldSnapshot`,
// both taken from the same immutable row. It does not read the live template, so
// a template edited after filing cannot change what an already-filed report
// appears to say, and two PDFs of the same version are the same document.
//
// Field types render generically. There is no per-report layout here for the
// same reason there is no per-report form: the structure is data.

const ACCENT = '#6B4E8C'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
    paddingTop: 44,
    paddingHorizontal: 44,
    paddingBottom: 56,
  },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: ACCENT },
  meta: { fontSize: 9, color: '#666', marginTop: 4 },
  rule: { borderBottomWidth: 1, borderBottomColor: '#e5e5e5', marginTop: 14, marginBottom: 18 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginTop: 16,
    marginBottom: 8,
    color: '#1a1a1a',
  },
  fieldLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#444', marginBottom: 3 },
  fieldValue: { fontSize: 10, lineHeight: 1.45, marginBottom: 10 },
  muted: { color: '#999', fontStyle: 'italic' },
  row: { flexDirection: 'row', marginBottom: 3 },
  cell: { flex: 1, paddingRight: 8, fontSize: 9 },
  cellHead: { flex: 1, paddingRight: 8, fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#444' },
  bullet: { marginBottom: 2, fontSize: 10 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 44,
    right: 44,
    fontSize: 8,
    color: '#999',
    textAlign: 'center',
  },
})

function formatScalar(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function FieldValue({ field, value }: { field: ReportField; value: unknown }) {
  const blank = value === null || value === undefined || value === '' ||
    (Array.isArray(value) && value.length === 0)
  if (blank) {
    return createElement(Text, { style: [s.fieldValue, s.muted] }, 'Not answered')
  }

  switch (field.type) {
    case 'date_range': {
      const range = value as { start?: string | null; end?: string | null }
      return createElement(
        Text,
        { style: s.fieldValue },
        `${range.start ?? '—'} to ${range.end ?? '—'}`,
      )
    }

    case 'kpi_value': {
      const kpi = value as { value?: number | null; target?: number | null; note?: string | null }
      const parts = [
        kpi.value !== null && kpi.value !== undefined ? `Actual ${kpi.value}` : null,
        kpi.target !== null && kpi.target !== undefined ? `Target ${kpi.target}` : null,
        kpi.note || null,
      ].filter(Boolean)
      return createElement(Text, { style: s.fieldValue }, parts.join('  ·  '))
    }

    case 'percentage':
      return createElement(Text, { style: s.fieldValue }, `${formatScalar(value)}%`)

    case 'currency':
      return createElement(
        Text,
        { style: s.fieldValue },
        `${field.currencyCode ?? 'TZS'} ${Number(value).toLocaleString('en-GB')}`,
      )

    case 'rating':
      return createElement(
        Text,
        { style: s.fieldValue },
        `${formatScalar(value)} out of ${field.scale ?? 5}`,
      )

    case 'file': {
      const files = value as { fileName: string }[]
      return createElement(
        View,
        { style: { marginBottom: 10 } },
        ...files.map((f, i) =>
          createElement(Text, { key: i, style: s.bullet }, `Attachment: ${f.fileName}`),
        ),
      )
    }

    case 'repeatable_list':
    case 'table': {
      const rows = value as Record<string, unknown>[]
      const subFields = field.subFields ?? []

      if (field.type === 'repeatable_list' && subFields.length === 1) {
        // A single-column list reads as bullets, which is what it is.
        const key = subFields[0].key
        return createElement(
          View,
          { style: { marginBottom: 10 } },
          ...rows.map((row, i) =>
            createElement(Text, { key: i, style: s.bullet }, `•  ${formatScalar(row[key])}`),
          ),
        )
      }

      return createElement(
        View,
        { style: { marginBottom: 10 } },
        createElement(
          View,
          { style: s.row },
          ...subFields.map((sub) => createElement(Text, { key: sub.key, style: s.cellHead }, sub.label)),
        ),
        ...rows.map((row, i) =>
          createElement(
            View,
            { key: i, style: s.row },
            ...subFields.map((sub) =>
              createElement(Text, { key: sub.key, style: s.cell }, formatScalar(row[sub.key])),
            ),
          ),
        ),
      )
    }

    default:
      return createElement(Text, { style: s.fieldValue }, formatScalar(value))
  }
}

export type ReportPdfInput = {
  templateName: string
  periodLabel: string
  authorName: string
  state: string
  version: ReportVersion
}

export async function renderReportVersionPdf(input: ReportPdfInput): Promise<Buffer> {
  const fields = allFields(input.version.fieldSnapshot)
  const filedOn = new Date(input.version.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const body = input.version.fieldSnapshot.sections.map((section, si) =>
    createElement(
      View,
      { key: section.key || si, wrap: false },
      createElement(Text, { style: s.sectionTitle }, section.title),
      ...section.fields.map((field) =>
        createElement(
          View,
          { key: field.key },
          createElement(Text, { style: s.fieldLabel }, field.label),
          createElement(FieldValue, { field, value: input.version.content[field.key] }),
        ),
      ),
    ),
  )

  const doc = createElement(
    Document,
    { title: `${input.templateName} — ${input.periodLabel}` },
    createElement(
      Page,
      { size: 'A4', style: s.page },
      createElement(Text, { style: s.title }, input.templateName),
      createElement(
        Text,
        { style: s.meta },
        `${input.periodLabel}  ·  ${input.authorName}  ·  filed ${filedOn}`,
      ),
      createElement(
        Text,
        { style: s.meta },
        `Version ${input.version.version}  ·  status ${input.state}`,
      ),
      createElement(View, { style: s.rule }),
      ...(fields.length > 0
        ? body
        : [createElement(Text, { key: 'empty', style: s.muted }, 'This report has no fields.')]),
      createElement(
        Text,
        {
          style: s.footer,
          fixed: true,
          render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `OpusFesta  ·  ${input.templateName}  ·  version ${input.version.version}  ·  page ${pageNumber} of ${totalPages}`,
        },
        '',
      ),
    ),
  )

  return renderToBuffer(doc as ReactElement<DocumentProps>)
}
