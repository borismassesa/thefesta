// "Generated PDFs match the stored submission version" is an acceptance
// criterion, so it is tested by actually rendering one and reading the bytes
// back rather than by trusting the call site.
//
// The property that matters: the document is built from the version's own
// content and its own field snapshot. A template edited after filing must not
// change what an already-filed report says.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { renderReportVersionPdf } from './pdf'
import type { ReportVersion } from './queries'

const VERSION: ReportVersion = {
  id: 'ver-1',
  version: 2,
  reason: 'resubmit',
  createdAt: '2026-08-02T09:00:00.000Z',
  authorEmployeeId: 'emp-1',
  content: {
    headline: 'Shipped the booking flow',
    confidence: 4,
    spend: 1500000,
    uptake: 62,
    shipped: true,
    window: { start: '2026-07-01', end: '2026-07-31' },
    kpi: { value: 18, target: 20, note: 'Two short' },
    wins: [{ item: 'Cut checkout to two steps' }, { item: 'Fixed the Airtel callback' }],
    metrics: [
      { name: 'Bookings', this_period: 120, last_period: 90 },
      { name: 'Refunds', this_period: 3, last_period: 7 },
    ],
    empty_on_purpose: '',
  },
  fieldSnapshot: {
    sections: [
      {
        key: 'main',
        title: 'July summary',
        fields: [
          { key: 'headline', label: 'Headline', type: 'short_text' },
          { key: 'confidence', label: 'Confidence', type: 'rating', scale: 5 },
          { key: 'spend', label: 'Spend', type: 'currency', currencyCode: 'TZS' },
          { key: 'uptake', label: 'Uptake', type: 'percentage' },
          { key: 'shipped', label: 'Shipped on time', type: 'yes_no' },
          { key: 'window', label: 'Period covered', type: 'date_range' },
          { key: 'kpi', label: 'Conversions', type: 'kpi_value' },
          {
            key: 'wins',
            label: 'Wins',
            type: 'repeatable_list',
            subFields: [{ key: 'item', label: 'Win', type: 'short_text' }],
          },
          {
            key: 'metrics',
            label: 'Metrics',
            type: 'table',
            subFields: [
              { key: 'name', label: 'Metric', type: 'short_text' },
              { key: 'this_period', label: 'This period', type: 'number' },
              { key: 'last_period', label: 'Last period', type: 'number' },
            ],
          },
          { key: 'empty_on_purpose', label: 'Anything else', type: 'long_text' },
        ],
      },
    ],
  },
}

/** react-pdf compresses streams, so assert on the structure, not on prose. */
async function render() {
  return renderReportVersionPdf({
    templateName: 'Monthly Engineering Report',
    periodLabel: 'July 2026',
    authorName: 'Amina Test',
    state: 'accepted',
    version: VERSION,
  })
}

describe('renderReportVersionPdf', () => {
  it('produces a real PDF', async () => {
    const buffer = await render()
    assert.ok(buffer.length > 1000, 'a rendered report should not be a stub')
    assert.equal(buffer.subarray(0, 5).toString('utf8'), '%PDF-', 'must be a PDF')
    assert.ok(buffer.subarray(-1024).toString('latin1').includes('%%EOF'), 'must be complete')
  })

  it('renders every field type in a snapshot without throwing', async () => {
    // The regression this guards: adding a field type to the form and
    // forgetting the PDF branch, so a report with that type fails to export
    // months later when someone needs it.
    const buffer = await render()
    assert.ok(buffer.length > 0)
  })

  it('is deterministic for the same stored version', async () => {
    // Two exports of one filed version must be the same document. PDF headers
    // carry a creation timestamp, so compare the body length rather than bytes.
    const [a, b] = await Promise.all([render(), render()])
    assert.equal(a.length, b.length, 'the same version must render the same document')
  })

  it('renders from the snapshot, not from a different structure', async () => {
    // A version whose snapshot declares fewer fields must produce a shorter
    // document from the SAME content: the snapshot is what decides, not the
    // content and not the live template.
    const narrowed = await renderReportVersionPdf({
      templateName: 'Monthly Engineering Report',
      periodLabel: 'July 2026',
      authorName: 'Amina Test',
      state: 'accepted',
      version: {
        ...VERSION,
        fieldSnapshot: {
          sections: [
            {
              key: 'main',
              title: 'July summary',
              fields: [{ key: 'headline', label: 'Headline', type: 'short_text' }],
            },
          ],
        },
      },
    })
    const full = await render()
    assert.ok(
      narrowed.length < full.length,
      'the field snapshot must decide what appears, not the content',
    )
  })

  it('renders a version with no fields rather than failing', async () => {
    const buffer = await renderReportVersionPdf({
      templateName: 'Empty',
      periodLabel: 'July 2026',
      authorName: 'Nobody',
      state: 'draft',
      version: { ...VERSION, content: {}, fieldSnapshot: { sections: [] } },
    })
    assert.equal(buffer.subarray(0, 5).toString('utf8'), '%PDF-')
  })
})
