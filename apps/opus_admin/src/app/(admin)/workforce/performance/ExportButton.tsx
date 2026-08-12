'use client'

import { Download } from 'lucide-react'

// Generic CSV download — builds a CSV from headers + rows and triggers a
// client-side download (same pattern as the timesheets export, no server
// round trip since the data is already on the page).
type Cell = string | number

function toCsv(headers: string[], rows: Cell[][]): string {
  const escape = (v: Cell) => {
    let s = String(v)
    // Neutralize spreadsheet formula injection: a cell starting with one of
    // these is treated as a formula by Excel/Sheets, so prefix it with a
    // tab-free apostrophe to force it to render as text.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers, ...rows].map((r) => r.map(escape).join(',')).join('\n')
}

export default function ExportButton({
  headers,
  rows,
  filename,
  label = 'Export CSV',
}: {
  headers: string[]
  rows: Cell[][]
  filename: string
  label?: string
}) {
  function download() {
    const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button data-opus-button="neutral" data-opus-button-size="small"
      type="button"
      onClick={download}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      <Download className="h-3.5 w-3.5" /> {label}
    </button>
  )
}
