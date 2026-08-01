// How long a submitted request has been sitting, in one place.
//
// This is *waiting age*, not lateness. Nothing in the schema carries a
// target decision date, so a request in the `delayed` band is one that has
// waited a long time — not one that has missed a deadline. Keep the
// vocabulary ("Waiting 4d") away from "overdue" until an SLA model exists,
// at which point this file is the single thing that changes.

export type AgeBand = 'normal' | 'attention' | 'delayed'

export const AGE_BANDS: { key: AgeBand; label: string; upToDays: number }[] = [
  { key: 'normal', label: 'Normal', upToDays: 2 },
  { key: 'attention', label: 'Attention', upToDays: 4 },
  { key: 'delayed', label: 'Delayed', upToDays: Number.POSITIVE_INFINITY },
]

export function daysWaiting(iso: string, now: number): number {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, (now - t) / 86_400_000)
}

// 0–1 day normal, 2–3 attention, 4+ delayed.
export function ageBand(iso: string, now: number): AgeBand {
  const days = daysWaiting(iso, now)
  for (const band of AGE_BANDS) {
    if (days < band.upToDays) return band.key
  }
  return 'delayed'
}

// Anything past this counts as "ageing" in aggregate views.
export const AGEING_FROM_DAYS = AGE_BANDS[0].upToDays

export const BAND_DOT: Record<AgeBand, string> = {
  normal: 'bg-emerald-500',
  attention: 'bg-amber-500',
  delayed: 'bg-rose-500',
}

export const BAND_TEXT: Record<AgeBand, string> = {
  normal: 'text-gray-500',
  attention: 'text-amber-600',
  delayed: 'text-rose-600',
}
