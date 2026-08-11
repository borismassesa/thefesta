'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarClock,
  CalendarX,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  FileSignature,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  RefreshCcw,
  Send,
  Sparkles,
  Timer,
  Wallet,
} from 'lucide-react'
import type { Booking, BookingTimelineEntry } from '@/lib/mock-data'
import {
  STAGE_META,
  balanceAmount,
  buildStageLabel,
  depositAmount,
  durationUntil,
  eventDateLabel,
  formatTZS,
  relativeDays,
  timeAgo,
} from '@/lib/bookings'
import { cn } from '@/lib/utils'
import { useBookingAction } from '@/lib/use-booking-action'
import { usePortalT, type Translator } from '@/components/providers/PortalUIStringsProvider'

export default function BookingDetailClient({ booking }: { booking: Booking }) {
  const router = useRouter()
  const action = useBookingAction()
  const t = usePortalT('bookings')

  async function patch(payload: Record<string, unknown>, successMessage?: string) {
    const ok = await action.perform(
      () =>
        fetch(`/api/bookings/${booking.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      {
        successMessage,
        errorMessage: t('message_action_error'),
      },
    )
    if (ok) router.refresh()
  }

  const stage = STAGE_META[booking.stage]
  const stageLabel = buildStageLabel(t)
  const deposit = depositAmount(booking)
  const balance = balanceAmount(booking)
  const primaryAction = useMemo(() => primaryCta(booking, t), [booking, t])

  return (
    <div className="px-8 pt-5 pb-12">
      <div className="space-y-5">
        <Link
          href="/bookings"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('back_to_pipeline')}
        </Link>

        {/* Stage banner */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-5 lg:p-6 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border',
                stage.pillClass,
              )}
            >
              {stageLabel[booking.stage]}
            </span>
            <span className="text-sm text-gray-500 inline-flex items-center gap-1.5">
              <CalendarClock className="w-4 h-4 text-gray-400" />
              {eventDateLabel(booking.date)} · {booking.startTime}–{booking.endTime}
            </span>
            <span className="text-sm font-semibold text-gray-900">
              {relativeDays(booking.date)}
            </span>
          </div>

          {booking.stage === 'reserved' && booking.slotHeldUntil ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border bg-rose-50 text-rose-700 border-rose-200">
              <Timer className="w-3 h-3" />
              {t('detail_stage_expires', { duration: durationUntil(booking.slotHeldUntil) })}
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {action.error ? (
              <p className="text-xs text-rose-600 font-medium">{action.error}</p>
            ) : null}
            {primaryAction ? (
              <button data-opus-button="primary" data-opus-button-size="medium"
                type="button"
                disabled={action.loading}
                onClick={() => handlePrimaryCta(primaryAction.key, patch, t)}
                className="inline-flex items-center gap-1.5 bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-full hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {action.loading ? (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                ) : (
                  <primaryAction.icon className="w-4 h-4" />
                )}
                {primaryAction.label}
              </button>
            ) : null}
          </div>
        </section>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          {/* Main column */}
          <div className="space-y-5">
            <Summary booking={booking} deposit={deposit} balance={balance} />
            <Timeline entries={booking.timeline} />
            <Payments booking={booking} deposit={deposit} balance={balance} />
            {booking.lastMessageAt ? <MessagesCard booking={booking} /> : null}
          </div>

          {/* Sidebar */}
          <aside className="space-y-5 lg:sticky lg:top-4">
            <CoupleCard booking={booking} />
            <DocumentsCard booking={booking} />
            <QuickActions booking={booking} patch={patch} loading={action.loading} />
          </aside>
        </div>
      </div>
    </div>
  )
}

/* ---------- Helpers ---------- */
type CtaKey =
  | 'mark_quote_accepted'
  | 'send_contract'
  | 'mark_deposit_received'
  | 'confirm_booking'
  | 'open_brief'
  | 'request_review'

type Cta = { key: CtaKey; label: string; icon: typeof Send }

function primaryCta(b: Booking, t: Translator): Cta | null {
  if (b.stage === 'quoted') return { key: 'mark_quote_accepted', label: t('action_mark_quote_accepted'), icon: CheckCircle2 }
  if (b.stage === 'reserved' && !b.contractSigned) return { key: 'send_contract', label: t('action_send_contract'), icon: FileSignature }
  if (b.stage === 'reserved' && b.contractSigned && !b.depositPaid) return { key: 'mark_deposit_received', label: t('action_mark_deposit_received'), icon: Wallet }
  if (b.stage === 'reserved') return { key: 'confirm_booking', label: t('action_confirm_booking'), icon: CheckCircle2 }
  if (b.stage === 'confirmed' && !b.briefSubmitted) return { key: 'open_brief', label: t('action_open_brief'), icon: FileText }
  if (b.stage === 'completed' && !b.reviewRequested) return { key: 'request_review', label: t('action_request_review'), icon: Send }
  return null
}

// `timeline_entry.label` values below are stored data (persisted booking
// history), not translated UI text — same scoping as bookings.ts's
// deriveAttention title/detail strings. Only the `successMessage` toasts,
// which are ephemeral on-screen UI, are localized via `t`.
async function handlePrimaryCta(
  key: CtaKey,
  patch: (payload: Record<string, unknown>, successMessage?: string) => Promise<void>,
  t: Translator,
) {
  const now = new Date().toISOString()
  switch (key) {
    case 'mark_quote_accepted':
      return patch({ stage: 'reserved', internal_status: 'quote_accepted', timeline_entry: { at: now, kind: 'quote_accepted', label: 'Quote accepted by couple' } }, t('message_quote_accepted'))
    case 'send_contract':
      return patch({ internal_status: 'contract_sent', contract_sent_at: now, timeline_entry: { at: now, kind: 'contract_sent', label: 'Contract sent to couple' } }, t('message_contract_sent'))
    case 'mark_deposit_received':
      return patch({ deposit_paid: true, internal_status: 'deposit_pending', timeline_entry: { at: now, kind: 'deposit_paid', label: 'Deposit received' } }, t('message_deposit_received'))
    case 'confirm_booking':
      return patch({ stage: 'confirmed', internal_status: 'confirmed', timeline_entry: { at: now, kind: 'confirmed', label: 'Booking confirmed' } }, t('message_booking_confirmed'))
    case 'open_brief':
      return patch({ brief_submitted: true, timeline_entry: { at: now, kind: 'completed', label: 'Day-of brief submitted' } }, t('message_brief_submitted'))
    case 'request_review':
      return patch({ review_requested: true, timeline_entry: { at: now, kind: 'review_requested', label: 'Review requested from couple' } }, t('message_review_requested'))
  }
}

/* ---------- Summary ---------- */

function Summary({ booking: b, deposit, balance }: { booking: Booking; deposit: number; balance: number }) {
  const t = usePortalT('bookings')
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-5 lg:p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500 mb-4">{t('summary_header')}</p>
      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
        <Field label={t('summary_package')}>
          <span className="text-sm font-semibold text-gray-900">{b.packageName}</span>
        </Field>
        <Field label={t('summary_total_value')}>
          <span className="text-sm font-semibold text-gray-900 tabular-nums">{formatTZS(b.totalValue)}</span>
        </Field>
        <Field label={t('summary_venue')}>
          <span className="text-sm text-gray-900">{b.location}</span>
        </Field>
        <Field label={t('summary_hours')}>
          <span className="text-sm text-gray-900 tabular-nums">{b.startTime} – {b.endTime}</span>
        </Field>
        <Field label={t('summary_deposit_label', { percent: b.depositPercent })}>
          <span className={cn('text-sm font-semibold tabular-nums', b.depositPaid ? 'text-emerald-700' : 'text-amber-700')}>
            {formatTZS(deposit)}
            <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider">
              {b.depositPaid ? t('summary_deposit_paid') : t('summary_deposit_pending')}
            </span>
          </span>
        </Field>
        <Field label={t('summary_balance')}>
          <span className="text-sm text-gray-900 tabular-nums">
            {formatTZS(balance)}
            {b.balanceDueDate ? (
              <span className="ml-1.5 text-[10px] text-gray-500">{t('summary_balance_due', { date: eventDateLabel(b.balanceDueDate) })}</span>
            ) : null}
          </span>
        </Field>
      </dl>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}

/* ---------- Timeline ---------- */

const TIMELINE_ICON = {
  inquiry: Sparkles,
  quote_sent: Send,
  quote_accepted: CheckCircle2,
  contract_sent: FileSignature,
  contract_signed: FileSignature,
  deposit_paid: Wallet,
  confirmed: CheckCircle2,
  message: MessageSquare,
  reschedule_requested: RefreshCcw,
  rescheduled: RefreshCcw,
  completed: CheckCircle2,
  cancelled: CalendarX,
  review_requested: Send,
  review_received: Sparkles,
} satisfies Record<BookingTimelineEntry['kind'], typeof Sparkles>

function Timeline({ entries }: { entries: BookingTimelineEntry[] }) {
  const t = usePortalT('bookings')
  const sorted = [...entries].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-5 lg:p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500 mb-4">{t('timeline_header')}</p>
      <ol className="relative pl-5">
        <span className="absolute left-[7px] top-1 bottom-1 w-px bg-gray-200" aria-hidden />
        {sorted.map((e, i) => {
          const Icon = TIMELINE_ICON[e.kind]
          return (
            <li key={`${e.at}-${e.kind}-${i}`} className="relative pl-5 pb-4 last:pb-0">
              <span className="absolute -left-0 top-0.5 w-4 h-4 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                <Icon className="w-2.5 h-2.5 text-gray-500" />
              </span>
              <p className="text-sm text-gray-900 leading-snug">{e.label}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(e.at)}</p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/* ---------- Payments ---------- */

function Payments({ booking: b, deposit, balance }: { booking: Booking; deposit: number; balance: number }) {
  const t = usePortalT('bookings')
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-5 lg:p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">{t('payments_header')}</p>
        <span className="text-xs text-gray-400">{t('payments_total', { amount: formatTZS(b.totalValue) })}</span>
      </div>
      <ul className="divide-y divide-gray-100">
        <PaymentRow
          label={t('summary_deposit_label', { percent: b.depositPercent })}
          amount={deposit}
          status={b.depositPaid ? 'paid' : 'pending'}
          hint={b.depositPaid ? t('payment_deposit_received_hint') : b.contractSigned ? t('payment_deposit_awaiting_transfer') : t('payment_deposit_sent_with_contract')}
        />
        <PaymentRow
          label={t('summary_balance')}
          amount={balance}
          status={b.stage === 'completed' || (b.depositPaid && balance === 0) ? 'paid' : b.balanceDueDate ? 'scheduled' : 'pending'}
          hint={b.balanceDueDate ? t('payment_balance_due_hint', { date: eventDateLabel(b.balanceDueDate) }) : t('payment_balance_not_scheduled')}
        />
      </ul>
    </section>
  )
}

function PaymentRow({ label, amount, status, hint }: { label: string; amount: number; status: 'paid' | 'pending' | 'scheduled'; hint: string }) {
  const t = usePortalT('bookings')
  const tone =
    status === 'paid' ? { chip: 'bg-emerald-50 text-emerald-700', text: t('payment_status_paid') } :
    status === 'scheduled' ? { chip: 'bg-gray-100 text-gray-700', text: t('payment_status_scheduled') } :
    { chip: 'bg-amber-50 text-amber-700', text: t('payment_status_pending') }
  return (
    <li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{hint}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatTZS(amount)}</p>
        <span className={cn('inline-flex text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md mt-1', tone.chip)}>
          {tone.text}
        </span>
      </div>
    </li>
  )
}

/* ---------- Messages ---------- */

function MessagesCard({ booking: b }: { booking: Booking }) {
  const t = usePortalT('bookings')
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-5 lg:p-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">{t('messages_header')}</p>
        {b.leadId ? (
          <Link
            href={`/leads/${b.leadId}`}
            className="text-xs font-semibold text-gray-700 hover:text-gray-900 inline-flex items-center gap-1"
          >
            {t('messages_open_thread')}
            <ExternalLink className="w-3 h-3" />
          </Link>
        ) : null}
      </div>
      <div className="rounded-xl bg-gray-50 px-4 py-3.5">
        <p className="text-sm text-gray-900 leading-snug">{b.lastMessagePreview}</p>
        <p className="text-[10px] text-gray-500 mt-1.5">
          {t('messages_from', { couple: b.couple, time: b.lastMessageAt ? timeAgo(b.lastMessageAt) : '' })}
        </p>
      </div>
    </section>
  )
}

/* ---------- Couple card ---------- */

function CoupleCard({ booking: b }: { booking: Booking }) {
  const t = usePortalT('bookings')
  const initials = b.couple.trim().split(/\s*&\s*|\s+/).filter(Boolean).map((p) => [...p][0] ?? '').slice(0, 2).join('').toUpperCase() || 'C'
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-5">
      <div className="flex items-center gap-3 mb-3">
        <span
          className="w-12 h-12 rounded-full bg-cover bg-center bg-gray-200 ring-1 ring-white shadow-sm shrink-0"
          style={{ backgroundImage: b.avatarUrl ? `url(${b.avatarUrl})` : undefined }}
          aria-hidden
        >
          {!b.avatarUrl ? (
            <span className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-600">
              {initials}
            </span>
          ) : null}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{b.couple}</p>
          <p className="text-xs text-gray-500 truncate">{b.partnerA} · {b.partnerB}</p>
        </div>
      </div>
      <ul className="space-y-1.5">
        <ContactLink href={`tel:${b.phone.replace(/\s/g, '')}`} icon={Phone}>{b.phone}</ContactLink>
        <ContactLink href={`https://wa.me/${b.whatsapp.replace(/\D/g, '')}`} icon={MessageSquare} hint={t('couple_whatsapp')}>{b.whatsapp}</ContactLink>
        <ContactLink href={`mailto:${b.email}`} icon={Mail}>{b.email}</ContactLink>
      </ul>
    </section>
  )
}

function ContactLink({
  href,
  icon: Icon,
  children,
  hint,
}: {
  href: string
  icon: typeof Phone
  children: React.ReactNode
  hint?: string
}) {
  return (
    <li>
      <a
        href={href}
        target={href.startsWith('http') ? '_blank' : undefined}
        rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
        className="flex items-center gap-2 text-xs text-gray-700 hover:text-gray-900 transition-colors py-1"
      >
        <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className="truncate">{children}</span>
        {hint ? (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-gray-400">{hint}</span>
        ) : null}
      </a>
    </li>
  )
}

/* ---------- Documents ---------- */

function DocumentsCard({ booking: b }: { booking: Booking }) {
  const t = usePortalT('bookings')
  const docs = [
    { label: t('doc_contract'), done: b.contractSigned, hintDone: t('doc_contract_signed'), hintMissing: b.contractSentAt ? t('doc_contract_awaiting') : t('doc_contract_not_sent') },
    { label: t('doc_invoice'), done: b.invoiceIssued, hintDone: t('doc_invoice_issued'), hintMissing: t('doc_invoice_not_issued') },
    { label: t('doc_brief'), done: b.briefSubmitted, hintDone: t('doc_brief_submitted'), hintMissing: t('doc_brief_awaiting') },
  ]
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500 mb-3">{t('documents_header')}</p>
      <ul className="space-y-2">
        {docs.map((d) => (
          <li key={d.label} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-100 hover:border-gray-300 transition-colors">
            {d.done ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-gray-300 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900">{d.label}</p>
              <p className="text-[10px] text-gray-500 truncate">{d.done ? d.hintDone : d.hintMissing}</p>
            </div>
            {d.done ? (
              <button data-opus-button="control" type="button" className="text-gray-400 hover:text-gray-700 transition-colors" aria-label={t('doc_download', { doc: d.label })}>
                <Download className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ---------- Quick actions ---------- */

function QuickActions({
  booking: b,
  patch,
  loading,
}: {
  booking: Booking
  patch: (payload: Record<string, unknown>, successMessage?: string) => Promise<void>
  loading: boolean
}) {
  const router = useRouter()
  const t = usePortalT('bookings')
  const [showReschedule, setShowReschedule] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState(b.date)
  const [rescheduleStart, setRescheduleStart] = useState(b.startTime)
  const [rescheduleEnd, setRescheduleEnd] = useState(b.endTime)
  const [cancelReason, setCancelReason] = useState('')
  const cancelTextRef = useRef<HTMLTextAreaElement>(null)

  async function confirmReschedule() {
    if (!rescheduleDate) return
    await patch({
      event_date: rescheduleDate,
      start_time: rescheduleStart || b.startTime,
      end_time: rescheduleEnd || b.endTime,
      internal_status: 'rescheduled',
      timeline_entry: {
        at: new Date().toISOString(),
        kind: 'rescheduled',
        label: `Rescheduled to ${eventDateLabel(rescheduleDate)}`,
      },
    }, t('message_booking_rescheduled'))
    setShowReschedule(false)
  }

  async function confirmCancel() {
    await patch({
      stage: 'cancelled',
      internal_status: 'cancelled',
      cancellation_reason: cancelReason.trim() || null,
      cancelled_at: new Date().toISOString(),
      timeline_entry: {
        at: new Date().toISOString(),
        kind: 'cancelled',
        label: cancelReason.trim() ? `Booking cancelled — ${cancelReason.trim()}` : 'Booking cancelled',
      },
    }, t('message_booking_cancelled'))
    setShowCancel(false)
  }

  const actions: { label: string; icon: typeof Send; tone?: 'danger'; onClick: () => void }[] = []
  if (b.stage !== 'cancelled' && b.stage !== 'completed') {
    actions.push({ label: t('quick_action_send_reminder'), icon: Send, onClick: () => router.push(`/messages${b.leadId ? `?leadId=${b.leadId}` : ''}`) })
    actions.push({ label: t('quick_action_reschedule'), icon: RefreshCcw, onClick: () => setShowReschedule(true) })
  }
  if (b.stage !== 'completed' && b.stage !== 'cancelled') {
    actions.push({ label: t('quick_action_cancel'), icon: CalendarX, tone: 'danger', onClick: () => { setCancelReason(''); setShowCancel(true) } })
  }
  if (b.stage === 'completed') {
    actions.push({ label: t('quick_action_send_invoice'), icon: FileText, onClick: () => patch({ invoice_issued: true, timeline_entry: { at: new Date().toISOString(), kind: 'completed', label: 'Invoice issued' } }, t('message_invoice_issued')) })
    actions.push({ label: t('quick_action_mark_review'), icon: Send, onClick: () => patch({ review_requested: true, timeline_entry: { at: new Date().toISOString(), kind: 'review_requested', label: 'Review requested from couple' } }, t('message_review_requested')) })
  }

  if (actions.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500 mb-3">{t('quick_actions_header')}</p>
      <ul className="space-y-1">
        {actions.map((a) => {
          const Icon = a.icon
          return (
            <li key={a.label}>
              <button data-opus-button="danger" data-opus-button-size="small"
                type="button"
                disabled={loading}
                onClick={a.onClick}
                className={cn(
                  'w-full inline-flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                  a.tone === 'danger' ? 'text-rose-600 hover:bg-rose-50' : 'text-gray-700 hover:bg-gray-50',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {a.label}
              </button>
            </li>
          )
        })}
      </ul>
      </div>

      {/* Reschedule dialog */}
      {showReschedule ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_4px_20px_-6px_rgba(0,0,0,0.15)] p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-900">{t('reschedule_title')}</p>
          <div className="space-y-3">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">{t('reschedule_new_date_label')}</span>
              <input
                type="date"
                value={rescheduleDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">{t('reschedule_start_time_label')}</span>
                <input
                  type="time"
                  value={rescheduleStart}
                  onChange={(e) => setRescheduleStart(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">{t('reschedule_end_time_label')}</span>
                <input
                  type="time"
                  value={rescheduleEnd}
                  onChange={(e) => setRescheduleEnd(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </label>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button data-opus-button="primary" data-opus-button-size="small"
              type="button"
              disabled={loading || !rescheduleDate}
              onClick={confirmReschedule}
              className="flex-1 bg-gray-900 text-white text-xs font-semibold px-3 py-2 rounded-full hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? t('reschedule_saving') : t('reschedule_confirm')}
            </button>
            <button data-opus-button="control"
              type="button"
              disabled={loading}
              onClick={() => setShowReschedule(false)}
              className="flex-1 text-xs font-semibold text-gray-600 hover:text-gray-900 px-3 py-2 rounded-full border border-gray-200 hover:border-gray-300 transition-colors"
            >
              {t('reschedule_cancel')}
            </button>
          </div>
        </div>
      ) : null}

      {/* Cancel booking dialog */}
      {showCancel ? (
        <div className="bg-white rounded-2xl border border-rose-100 shadow-[0_4px_20px_-6px_rgba(0,0,0,0.15)] p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-900">{t('cancel_title')}</p>
          <p className="text-xs text-gray-500 leading-relaxed">{t('cancel_desc')}</p>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">{t('cancel_reason_label')}</span>
            <textarea
              ref={cancelTextRef}
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t('cancel_reason_placeholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
            />
          </label>
          <div className="flex items-center gap-2 pt-1">
            <button data-opus-button="danger" data-opus-button-size="small"
              type="button"
              disabled={loading}
              onClick={confirmCancel}
              className="flex-1 bg-rose-600 text-white text-xs font-semibold px-3 py-2 rounded-full hover:bg-rose-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? t('cancel_cancelling') : t('cancel_confirm')}
            </button>
            <button data-opus-button="control"
              type="button"
              disabled={loading}
              onClick={() => setShowCancel(false)}
              className="flex-1 text-xs font-semibold text-gray-600 hover:text-gray-900 px-3 py-2 rounded-full border border-gray-200 hover:border-gray-300 transition-colors"
            >
              {t('cancel_keep')}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
