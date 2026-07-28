import type { Booking, BookingStage } from './mock-data'
import type { Translator } from '@/components/providers/PortalUIStringsProvider'

export const STAGE_META: Record<
  BookingStage,
  {
    label: string
    pillClass: string
    dotClass: string
    order: number
  }
> = {
  quoted: {
    label: 'Quoted',
    pillClass: 'bg-[#F0DFF6] text-[#7E5896] border-[#E0C7EE]',
    dotClass: 'bg-[#7E5896]',
    order: 0,
  },
  reserved: {
    label: 'Reserved',
    pillClass: 'bg-[#FCE9C2] text-[#8a5a14] border-[#F1D08F]',
    dotClass: 'bg-[#F5C77E]',
    order: 1,
  },
  confirmed: {
    label: 'Confirmed',
    pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
    order: 2,
  },
  completed: {
    label: 'Completed',
    pillClass: 'bg-gray-100 text-gray-700 border-gray-200',
    dotClass: 'bg-gray-400',
    order: 3,
  },
  cancelled: {
    label: 'Cancelled',
    pillClass: 'bg-rose-50 text-rose-700 border-rose-200',
    dotClass: 'bg-rose-400',
    order: 4,
  },
}

// Translated stage labels, keyed the same as STAGE_META — callers use this for
// the rendered label and STAGE_META[stage] for the styling (pillClass/dotClass).
export function buildStageLabel(t: Translator): Record<BookingStage, string> {
  return {
    quoted: t('stage_quoted'),
    reserved: t('stage_reserved'),
    confirmed: t('booking_status_confirmed'),
    completed: t('booking_status_completed'),
    cancelled: t('stage_cancelled'),
  }
}

// "TZS 4.2M" / "TZS 850K" / "TZS 4,200,000" depending on context.
export function formatTZS(amount: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) {
    if (amount >= 1_000_000) return `TZS ${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
    if (amount >= 1_000) return `TZS ${Math.round(amount / 1_000)}K`
    return `TZS ${amount}`
  }
  return `TZS ${amount.toLocaleString('en-GB')}`
}

// Local-date YYYY-MM-DD → midnight Date in the local zone.
function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// "in 4 days", "today", "tomorrow", "3 days ago"
export function relativeDays(eventDate: string, now: Date = new Date()): string {
  const target = parseDate(eventDate)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 0 && diff < 7) return `In ${diff} days`
  if (diff > 0 && diff < 30) return `In ${Math.round(diff / 7)} wk`
  if (diff >= 30) return `In ${Math.round(diff / 30)} mo`
  if (diff < 0 && diff > -30) return `${Math.abs(diff)}d ago`
  return `${Math.abs(Math.round(diff / 30))}mo ago`
}

// "5h", "2d 3h", "12m" — for the slot-hold countdown and other near-term timers.
export function durationUntil(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime()
  if (ms <= 0) return 'expired'
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 60) return `${totalMin}m`
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
}

// "2 days ago", "5h ago", "just now" — for last-message timestamps.
export function timeAgo(iso: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 8) return `${weeks}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export function eventDateLabel(iso: string): string {
  return parseDate(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function shortEventDate(iso: string): string {
  return parseDate(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

// Daily-driver alert types, ranked. Pipeline shows up to 3.
export type AttentionKind =
  | 'slot_expiring'
  | 'deposit_overdue'
  | 'contract_unsigned'
  | 'event_soon'
  | 'review_request'

export type AttentionItem = {
  kind: AttentionKind
  bookingId: string
  title: string
  detail: string
  ctaLabel: string
}

const ms = (h: number) => h * 60 * 60 * 1000

// Order bookings by descending urgency. Each rule may produce one item per
// booking; we cap the strip at 3 callouts to avoid overwhelming the vendor.
//
// `ctaLabel` is translated via `t`. `title`/`detail` are NOT fully localized —
// they interpolate other still-English-only helpers in this file
// (relativeDays, timeAgo, durationUntil) alongside a few fixed connector
// words. Fully localizing them means localizing those helpers too; flagged
// as a follow-up rather than done here.
export function deriveAttention(bookings: Booking[], now: Date, t: Translator): AttentionItem[] {
  const items: AttentionItem[] = []
  const today = startOfToday()
  for (const b of bookings) {
    if (b.stage === 'cancelled') continue

    // Slot hold expiring within 72h.
    if (b.stage === 'reserved' && b.slotHeldUntil) {
      const left = new Date(b.slotHeldUntil).getTime() - now.getTime()
      if (left > 0 && left < ms(72)) {
        items.push({
          kind: 'slot_expiring',
          bookingId: b.id,
          title: `${b.couple} — slot expires in ${durationUntil(b.slotHeldUntil, now)}`,
          detail: `${b.packageName} · ${formatTZS(b.totalValue, { compact: true })}`,
          ctaLabel: t('cta_send_reminder'),
        })
        continue
      }
    }

    // Deposit overdue: contract signed > 72h ago, deposit not paid.
    if (b.stage === 'reserved' && b.contractSigned && !b.depositPaid && b.contractSentAt) {
      const since = now.getTime() - new Date(b.contractSentAt).getTime()
      if (since > ms(72)) {
        items.push({
          kind: 'deposit_overdue',
          bookingId: b.id,
          title: `${b.couple} — deposit pending`,
          detail: `Contract signed ${timeAgo(b.contractSentAt, now)} · ${formatTZS(
            Math.round((b.totalValue * b.depositPercent) / 100),
            { compact: true },
          )} due`,
          ctaLabel: t('cta_send_reminder'),
        })
        continue
      }
    }

    // Event within 7 days but contract still not signed.
    if (b.stage === 'confirmed' && !b.contractSigned) {
      const target = parseDate(b.date)
      const diff = target.getTime() - today.getTime()
      if (diff >= 0 && diff <= ms(24 * 7)) {
        items.push({
          kind: 'contract_unsigned',
          bookingId: b.id,
          title: `${b.couple} — wedding ${relativeDays(b.date, now).toLowerCase()}`,
          detail: 'Contract not yet signed',
          ctaLabel: t('cta_open_contract'),
        })
        continue
      }
    }

    // Completed within 14 days, no review request sent.
    if (b.stage === 'completed' && !b.reviewRequested) {
      const target = parseDate(b.date)
      const diff = today.getTime() - target.getTime()
      if (diff >= 0 && diff <= ms(24 * 14)) {
        items.push({
          kind: 'review_request',
          bookingId: b.id,
          title: `${b.couple} — event done ${relativeDays(b.date, now).toLowerCase()}`,
          detail: 'Ask for a review while the day is fresh',
          ctaLabel: t('cta_send_review_request'),
        })
        continue
      }
    }

    // Generic upcoming event reminder (≤ 3d, deposit paid, contract signed).
    if (b.stage === 'confirmed' && b.contractSigned && b.depositPaid) {
      const target = parseDate(b.date)
      const diff = target.getTime() - today.getTime()
      if (diff >= 0 && diff <= ms(24 * 3)) {
        items.push({
          kind: 'event_soon',
          bookingId: b.id,
          title: `${b.couple} — ${relativeDays(b.date, now).toLowerCase()}`,
          detail: `${b.location} · ${b.startTime}`,
          ctaLabel: t('cta_open_brief'),
        })
      }
    }
  }
  return items.slice(0, 3)
}

export const PIPELINE_STAGES: BookingStage[] = [
  'quoted',
  'reserved',
  'confirmed',
  'completed',
  'cancelled',
]

export function depositAmount(b: Booking): number {
  return Math.round((b.totalValue * b.depositPercent) / 100)
}

export function balanceAmount(b: Booking): number {
  return b.totalValue - depositAmount(b)
}
