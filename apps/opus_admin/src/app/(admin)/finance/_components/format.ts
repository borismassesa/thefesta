/** Money and date formatting shared by the finance list pages. */

export function formatTzs(value: number): string {
  return `TZS ${value.toLocaleString('en-US')}`
}

/** Abbreviated for KPI tiles, where a full figure would wrap. */
export function compactTzs(value: number): string {
  if (value >= 1_000_000) return `TZS ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `TZS ${(value / 1_000).toFixed(0)}K`
  return formatTzs(value)
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date
    .toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
    .replace(',', ' ·')
    .replace(/\b(am|pm)\b/i, (match) => match.toUpperCase())
}

// Date + time split into parts so a line can render them cleanly as
// "date at time" without the dot separator formatDate uses.
export function dateTimeParts(iso: string | null): { date: string; time: string } | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return {
    date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d
      .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
      .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase()),
  }
}
