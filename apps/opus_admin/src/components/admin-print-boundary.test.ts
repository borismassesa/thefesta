import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('the narrow-screen notice and admin chrome can never enter a printout', () => {
  assert.match(read('./DesktopOnlyNotice.tsx'), /print:hidden/)
  assert.match(read('./Header.tsx'), /print:hidden/)
  assert.match(read('./Sidebar.tsx'), /print:hidden/)

  const layout = read('../app/(admin)/layout.tsx')
  assert.match(layout, /print:block print:h-auto print:bg-white/)
  assert.match(layout, /secondary-sidebar[^>]+print:hidden/)
  assert.match(layout, /print:block print:h-auto print:overflow-visible/)
})

test('the check-in report owns a full-width landscape print page', () => {
  const report = read('../app/(admin)/operations/checkin/[eventId]/CheckinReportClient.tsx')
  assert.match(report, /@page \{ size: A4 landscape; margin: 12mm; \}/)
  assert.match(report, /checkin-report-print-root/)
  assert.match(report, /print-color-adjust: exact/)
})

test('printed reports carry the company letterhead, not a bare title', () => {
  for (const path of [
    '../app/(admin)/operations/checkin/[eventId]/CheckinReportClient.tsx',
    '../app/(admin)/workforce/_components/ReportDocument.tsx',
  ]) {
    const source = read(path)
    assert.match(source, /PrintLetterhead/, `${path} must render the shared letterhead`)
    assert.match(source, /PrintLetterheadFooter/, `${path} must close on the letterhead footer`)
  }
})

test('the printed figure row and chart row state their own column count', () => {
  // Paper matches no screen breakpoint: leaving these to `lg:` printed the
  // four figures as a 2 × 2 block and stacked the two time charts.
  const report = read('../app/(admin)/operations/checkin/[eventId]/CheckinReportClient.tsx')
  assert.match(report, /print:grid-cols-4/)
  assert.match(report, /print:grid-cols-2/)
})

test('printed charts are drawn at a fixed size and scaled to the paper column', () => {
  // A ResponsiveContainer measures itself against the window and keeps that
  // width on paper, which left the printed chart cards half empty.
  const report = read('../app/(admin)/operations/checkin/[eventId]/CheckinReportClient.tsx')
  assert.match(report, /checkin-print-chart/)
  assert.match(report, /\.checkin-print-chart \.recharts-wrapper svg \{[\s\S]*?width: 100% !important/)
})
