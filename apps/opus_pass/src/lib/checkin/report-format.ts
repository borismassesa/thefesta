import type { ReportLocale } from './report-strings'
import type { Rate } from './report-model-core'

/**
 * Every date and time a check-in report prints, locked to East Africa Time.
 *
 * All OpusFesta events are Tanzanian, so a guest arrived at the wall-clock time
 * their hosts would name. This is not a preference. The 7 August report printed
 * three morning arrivals (10:52, 9:14 and 8:00 EAT) as 12:52 AM, 11:14 PM and
 * 10:00 PM because it was formatted from the downloading browser's locale on a
 * UTC-7 machine: a ten-hour error on a document a couple keeps forever. Vercel
 * runs in UTC, so the zone must be forced here rather than inherited from
 * anywhere at all.
 */

const EAT = 'Africa/Dar_es_Salaam'

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const MONTHS_SW = [
  'Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni',
  'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba',
]

interface Parts {
  day: number
  month: number
  year: number
  hour: number
  minute: number
}

function eatParts(iso: string): Parts | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EAT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return {
    day: get('day'),
    month: get('month'),
    year: get('year'),
    hour: get('hour'),
    minute: get('minute'),
  }
}

/** "8 August 2026" / "8 Agosti 2026". Empty string when there is no date. */
export function formatReportDate(iso: string | null, locale: ReportLocale = 'en'): string {
  if (!iso) return ''
  const p = eatParts(iso)
  if (!p) return ''
  const months = locale === 'sw' ? MONTHS_SW : MONTHS_EN
  return `${p.day} ${months[p.month - 1]} ${p.year}`
}

/** "10:52 PM" in English, 24-hour "22:52" in Swahili, where a 12-hour clock
 *  with AM/PM is not how the time is said. */
export function formatReportTime(iso: string | null, locale: ReportLocale = 'en'): string {
  if (!iso) return ''
  const p = eatParts(iso)
  if (!p) return ''
  if (locale === 'sw') return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  const suffix = p.hour < 12 ? 'AM' : 'PM'
  const twelve = p.hour % 12 === 0 ? 12 : p.hour % 12
  return `${twelve}:${String(p.minute).padStart(2, '0')} ${suffix}`
}

/** "8 August 2026 at 10:52 PM". */
export function formatReportDateTime(iso: string | null, locale: ReportLocale = 'en'): string {
  if (!iso) return ''
  const date = formatReportDate(iso, locale)
  const time = formatReportTime(iso, locale)
  if (!date) return ''
  return `${date} ${locale === 'sw' ? 'saa' : 'at'} ${time}`
}

/** "9:00 PM to 9:15 PM" — a window, because that is how a couple remembers the
 *  rush, not as an instant. */
export function formatReportWindow(
  startIso: string,
  endIso: string,
  locale: ReportLocale = 'en',
): string {
  const joiner = locale === 'sw' ? 'hadi' : 'to'
  return `${formatReportTime(startIso, locale)} ${joiner} ${formatReportTime(endIso, locale)}`
}

/**
 * "83.9%" from a rate.
 *
 * Returns null for a null rate rather than "0%": a wedding with nobody yet
 * confirmed has no attendance rate, and printing 0% states something false.
 * Callers render the null as "not yet measured".
 */
export function formatRatePercent(rate: Rate | null): string | null {
  if (!rate || rate.denominator <= 0) return null
  const pct = (rate.numerator / rate.denominator) * 100
  // One decimal, but never a pointless ".0".
  const rounded = Math.round(pct * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`
}
