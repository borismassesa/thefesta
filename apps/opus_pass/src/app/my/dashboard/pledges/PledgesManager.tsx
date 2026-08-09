'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import {
  HandCoins,
  Plus,
  Search,
  SlidersHorizontal,
  Check,
  Pencil,
  Trash2,
  MessageCircle,
  Mail,
  Smartphone,
  Copy,
  BellRing,
  Banknote,
  ListChecks,
  BarChart3,
  Download,
  Send,
  Lock,
  ExternalLink,
  Target,
  Wallet,
  Loader2,
  Clock,
  X,
} from 'lucide-react'
import { Card, EmptyState } from '@/components/dashboard/primitives'
import { ChartCard, BarRows, Funnel, LineChart } from '@/components/dashboard/charts'
import { Button, ConfirmDialog, Dialog, Slideover, Field, inputClass } from '@/components/dashboard/controls'
import { cn } from '@/lib/utils'
import { DashboardHero } from '@/components/dashboard/DashboardHero'
import {
  createPledge,
  updatePledge,
  deletePledge,
  recordPledgeReminder,
  sendPledgeReminderSms,
  sendPledgeReminderEmail,
  updatePledgeCollection,
  sendWhatsAppPledgeRequests,
  sendEmailPledgeRequests,
  sendSmsPledgeRequests,
  setPledgeCoverImage,
  applyPledgeCardTemplate,
  updateGuestContactInfo,
  deleteGuest,
  createGuest,
  type PledgeInput,
} from '@/lib/dashboard/actions'
import { PAYMENT_PROVIDERS, type PledgePaymentMethod } from '@/lib/dashboard/pledge-page'
import {
  PLEDGE_TEMPLATE_FREE_TIER_IDS,
  TEMPLATE_CARD_PRICE,
  parseTemplateCardItemId,
  type PledgeCardCatalogItem,
} from '@/lib/dashboard/pledge-card-templates'
import TemplatePurchaseModal, { type TemplatePurchaseTarget } from '@/components/dashboard/TemplatePurchaseModal'
import PaymentSummaryModal from '@/components/dashboard/PaymentSummaryModal'
import Confetti from '@/components/digital-cards/Confetti'
import { getLastOrder, setLastOrder, getOrders, getPendingTemplateIds, type StoredOrder } from '@/lib/cart-storage'
import {
  pledgeUrl,
  pledgeReminderMessage,
  pledgeRequestMessage,
  whatsappShareUrl,
  smsShareUrl,
  emailShareUrl,
  greetingNameOf,
} from '@/lib/dashboard/share'
import type { DashboardHeroContent } from '@/lib/cms/dashboard-hero'
import type { PledgesDashboardCopy } from '@/lib/cms/dashboard-copy'
import type {
  DashboardEventScopeStrings,
  CheckoutFormStrings,
  CheckoutPaymentStrings,
} from '@/lib/cms/ui-strings-fallback'
import { EventPicker } from '@/components/dashboard/EventScope'
import type {
  AttendanceAnswer,
  CardStatus,
  PaymentMethod,
  PledgeStats,
  PledgeStatus,
  PledgeWithContact,
  ReminderCadence,
} from '@/lib/dashboard/types'
import {
  ATTENDANCE_LABELS,
  CADENCE_LABELS,
  CARD_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PLEDGE_STATUS_LABELS,
  TICKET_TYPES,
  ticketPartyFor,
  ticketTypeLabel,
} from '@/lib/dashboard/types'
import { PLEDGE_CURRENCIES, toTzs } from '@/lib/dashboard/currency'

type ContactLite = {
  id: string
  full_name: string
  phone: string | null
  whatsapp_phone: string | null
  email: string | null
  max_party_size: number
  pledgeInviteSentAt: string | null
  hasPledged: boolean
}

type PledgeView = 'all' | PledgeStatus | 'cards'

const VIEW_TABS: { id: PledgeView; label: string }[] = [
  { id: 'all', label: 'All pledges' },
  { id: 'invited', label: 'Awaiting pledge' },
  { id: 'pledged', label: 'Pledged' },
  { id: 'partial', label: 'Partly paid' },
  { id: 'paid', label: 'Paid' },
  { id: 'cards', label: 'Cards to prepare' },
]

const DAY = 86_400_000

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-TZ', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`
  }
}

function formatDueDate(value: string | null): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** The pickers below offer Single and Double only — a contribution card is not
 *  where a Wakwe is allocated — but a contributor who is also on the roster can
 *  carry one, so the label has to be able to say so. */
function cardTypeLabel(maxPartySize: number): string {
  return ticketTypeLabel(maxPartySize)
}

/** Days until the promised date — negative when overdue, null when no date. */
function daysUntil(value: string | null): number | null {
  if (!value) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(value)
  due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / DAY)
}

const OWING: PledgeStatus[] = ['invited', 'pledged', 'partial']

interface AgingBucket {
  key: string
  label: string
  count: number
  amount: number
}

/** Outstanding pledges bucketed by how overdue their promised date is — the
 *  single most actionable view for deciding who to chase first. */
function outstandingAging(pledges: PledgeWithContact[]): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { key: 'over30', label: '30+ days overdue', count: 0, amount: 0 },
    { key: 'over8', label: '8–30 days overdue', count: 0, amount: 0 },
    { key: 'over1', label: '1–7 days overdue', count: 0, amount: 0 },
    { key: 'due', label: 'Not yet due', count: 0, amount: 0 },
    { key: 'nodate', label: 'No due date', count: 0, amount: 0 },
  ]
  const at = (k: string) => buckets.find((b) => b.key === k)!
  for (const p of pledges) {
    if (!OWING.includes(p.status)) continue
    const owing = Math.max(0, p.pledged_amount - p.amount_received)
    if (owing <= 0) continue
    const d = daysUntil(p.promised_date)
    const bucket =
      d === null ? at('nodate') : d >= 0 ? at('due') : d >= -7 ? at('over1') : d >= -30 ? at('over8') : at('over30')
    bucket.count += 1
    // Amounts pooled across pledges must share one currency — convert each
    // pledge's own currency to TZS before adding it to the bucket total.
    bucket.amount += toTzs(owing, p.currency)
  }
  return buckets.filter((b) => b.count > 0)
}

/** Cumulative pledged amount over time (grouped by creation day) for the
 *  trend chart. Each pledge is converted to TZS before summing so pledges
 *  in different currencies don't get added together at face value. */
function cumulativePledgedByDay(pledges: PledgeWithContact[]): { label: string; value: number }[] {
  const byDay = new Map<string, number>()
  for (const p of pledges) {
    if (p.status === 'declined') continue
    const day = (p.created_at || '').slice(0, 10)
    if (!day) continue
    byDay.set(day, (byDay.get(day) ?? 0) + toTzs(p.pledged_amount, p.currency))
  }
  const days = [...byDay.keys()].sort()
  let cumulative = 0
  return days.map((d) => {
    cumulative += byDay.get(d)!
    return { label: formatDueDate(d), value: cumulative }
  })
}

/** Largest pledges first (declined and zero-amount excluded) — feeds the
 *  "top contributors" recognition list. Ranked by TZS-equivalent value so a
 *  pledge in a stronger currency doesn't rank below a larger face-value
 *  pledge in a weaker one. */
function topContributors(pledges: PledgeWithContact[], limit = 10): PledgeWithContact[] {
  return pledges
    .filter((p) => p.status !== 'declined' && p.pledged_amount > 0)
    .sort(
      (a, b) =>
        toTzs(b.pledged_amount, b.currency) - toTzs(a.pledged_amount, a.currency) ||
        toTzs(b.amount_received, b.currency) - toTzs(a.amount_received, a.currency),
    )
    .slice(0, limit)
}

/** A pledge is "due for a follow-up" when it's still owing and either its
 *  scheduled reminder has come due or its promised date is near/overdue. */
function isReminderDue(p: PledgeWithContact): boolean {
  if (!OWING.includes(p.status)) return false
  const now = Date.now()
  if (p.next_reminder_at && new Date(p.next_reminder_at).getTime() <= now) return true
  const days = daysUntil(p.promised_date)
  return days !== null && days <= 7
}

const emptyForm = {
  id: undefined as string | undefined,
  mode: 'new' as 'new' | 'existing',
  guestContactId: '',
  full_name: '',
  phone: '',
  whatsapp_phone: '',
  email: '',
  group_tag: '',
  max_party_size: 1,
  pledged_amount: '',
  amount_received: '',
  currency: 'TZS',
  promised_date: '',
  status: 'invited' as PledgeStatus,
  payment_method: '' as PaymentMethod | '',
  will_attend: '' as AttendanceAnswer | '',
  card_status: 'none' as CardStatus,
  reminder_cadence: 'none' as ReminderCadence,
  notes: '',
}

type FormState = typeof emptyForm

type Section = 'manage' | 'invite' | 'collection' | 'followups' | 'reports'

export default function PledgesManager({
  initialPledges,
  stats,
  events,
  selectedEventId,
  scopeStrings,
  contacts,
  coupleName,
  paymentInstructions,
  paymentMethods,
  goalAmount,
  weddingDate,
  hero,
  pledgeToken,
  pledgeCoverImageUrl,
  pledgeCoverIsFullTemplate,
  packageTierId,
  pledgeCardCatalog,
  purchasedTemplateIds,
  contactEmail,
  contactPhone,
  checkoutFormStrings,
  checkoutPaymentStrings,
  copy,
  whatsappLive,
  emailLive,
  smsLive,
}: {
  initialPledges: PledgeWithContact[]
  stats: PledgeStats
  events: { id: string; name: string }[]
  /** Event this pledge book is scoped to (null only when the couple has no events). */
  selectedEventId: string | null
  scopeStrings: DashboardEventScopeStrings
  contacts: ContactLite[]
  coupleName: string
  paymentInstructions: string | null
  paymentMethods: PledgePaymentMethod[]
  goalAmount: number | null
  weddingDate: string | null
  hero: DashboardHeroContent
  pledgeToken: string | null
  /** Current pledge-page cover image (purchased design or an upload), if any. */
  pledgeCoverImageUrl: string | null
  /** True when the cover is a pre-designed template (names/date baked in). */
  pledgeCoverIsFullTemplate: boolean
  /** Package tier (lite/classic/elegant/signature) behind this event's paid
   *  order, if any — Elegant/Signature get free pledge-card templates. */
  packageTierId: string | null
  /** Curated invitation-catalog designs offered as free pledge-card templates. */
  pledgeCardCatalog: PledgeCardCatalogItem[]
  /** Template ids this couple has already bought individually (Classic/Essential). */
  purchasedTemplateIds: string[]
  contactEmail: string
  contactPhone: string | null
  checkoutFormStrings: CheckoutFormStrings
  checkoutPaymentStrings: CheckoutPaymentStrings
  copy: PledgesDashboardCopy
  whatsappLive: boolean
  emailLive: boolean
  smsLive: boolean
}) {
  const [section, setSection] = useState<Section>('manage')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<PledgeView>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [payTarget, setPayTarget] = useState<PledgeWithContact | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod | ''>('')
  const [pendingDelete, setPendingDelete] = useState<PledgeWithContact | null>(null)
  const [pending, startTransition] = useTransition()
  // `${pledgeId}:${channel}` of the in-flight reminder send, if any — guards
  // against a double-click firing the same reminder (and its reminder_count
  // bump) twice.
  const [remindingKey, setRemindingKey] = useState<string | null>(null)

  // Pledge-collection settings (goal + structured how-to-pay methods)
  const [goalInput, setGoalInput] = useState(goalAmount ? String(goalAmount) : '')
  const [methods, setMethods] = useState<PledgePaymentMethod[]>(() =>
    paymentMethods.length ? paymentMethods : [{ label: '', value: '', name: '' }],
  )

  function saveCollection() {
    startTransition(async () => {
      try {
        await updatePledgeCollection({
          goalAmount: Number(goalInput) || null,
          paymentMethods: methods,
        })
        toast.success('Pledge collection settings saved')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save settings')
      }
    })
  }

  const [origin, setOrigin] = useState('')
  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])
  // Share an event-tagged link whenever the dashboard is scoped to an event so
  // guests land on that event's actual pledge card. Without this, single-event
  // couples with an event-scoped card fall back to the generic pledge panel.
  const shareEventId = selectedEventId
  const shareLink = pledgeToken && origin ? pledgeUrl(origin, pledgeToken, shareEventId) : null

  // Close the filter popover on an outside click.
  useEffect(() => {
    if (!filterOpen) return
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [filterOpen])

  const remindersDue = useMemo(() => initialPledges.filter(isReminderDue), [initialPledges])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return initialPledges.filter((p) => {
      if (view === 'cards') {
        if (!(p.status === 'paid' && p.will_attend === 'yes' && p.card_status !== 'sent')) return false
      } else if (view !== 'all' && p.status !== view) {
        return false
      }
      if (!q) return true
      return (
        p.full_name.toLowerCase().includes(q) ||
        (p.group_tag ?? '').toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q)
      )
    })
  }, [initialPledges, query, view])

  function openCreate() {
    setForm(emptyForm)
    setOpen(true)
  }

  function openEdit(p: PledgeWithContact) {
    setForm({
      id: p.id,
      mode: 'existing',
      guestContactId: p.guest_contact_id,
      full_name: p.full_name,
      phone: p.whatsapp_phone ?? p.phone ?? '',
      whatsapp_phone: p.whatsapp_phone ?? p.phone ?? '',
      email: p.email ?? '',
      group_tag: p.group_tag ?? '',
      max_party_size: ticketPartyFor(p.max_party_size),
      pledged_amount: p.pledged_amount ? String(p.pledged_amount) : '',
      amount_received: p.amount_received ? String(p.amount_received) : '',
      currency: p.currency || 'TZS',
      promised_date: p.promised_date ?? '',
      status: p.status,
      payment_method: p.payment_method ?? '',
      will_attend: p.will_attend ?? '',
      card_status: p.card_status,
      reminder_cadence: p.reminder_cadence,
      notes: p.notes ?? '',
    })
    setOpen(true)
  }

  function buildInput(f: FormState): PledgeInput {
    const base: PledgeInput = {
      eventId: selectedEventId ?? undefined,
      pledged_amount: Number(f.pledged_amount) || 0,
      max_party_size: f.max_party_size,
      amount_received: Number(f.amount_received) || 0,
      currency: f.currency || 'TZS',
      promised_date: f.promised_date || null,
      status: f.status,
      payment_method: f.payment_method || null,
      will_attend: f.will_attend || null,
      card_status: f.card_status,
      reminder_cadence: f.reminder_cadence,
      notes: f.notes || null,
    }
    // Editing always keeps the linked contact; creating either links an existing
    // contact or carries new-contributor details for the action to insert.
    if (f.id || f.mode === 'existing') {
      return { ...base, guestContactId: f.guestContactId }
    }
    return {
      ...base,
      full_name: f.full_name,
      phone: f.phone || null,
      whatsapp_phone: f.whatsapp_phone || null,
      email: f.email || null,
      group_tag: f.group_tag || null,
    }
  }

  function save() {
    if (!form.id && form.mode === 'new' && !form.full_name.trim()) {
      toast.error("Enter the contributor's name")
      return
    }
    if (form.mode === 'existing' && !form.guestContactId) {
      toast.error('Pick a contributor')
      return
    }
    startTransition(async () => {
      try {
        if (form.id) {
          await updateGuestContactInfo(form.guestContactId, form.full_name, form.phone, form.email, {
            clearBlankFields: true,
            groupTag: form.group_tag,
          })
          await updatePledge(form.id, buildInput(form))
          toast.success('Pledge updated')
        } else {
          await createPledge(buildInput(form))
          toast.success(copy.toast_added)
        }
        setOpen(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  function confirmRemove() {
    const target = pendingDelete
    if (!target) return
    startTransition(async () => {
      try {
        await deletePledge(target.id)
        toast.success('Pledge removed')
        setPendingDelete(null)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove')
      }
    })
  }

  function openRecordPayment(p: PledgeWithContact) {
    setPayTarget(p)
    setPayAmount('')
    setPayMethod(p.payment_method ?? '')
  }

  /** Add a received payment to a pledge, re-deriving status from the new total. */
  function savePayment() {
    const target = payTarget
    if (!target) return
    const add = Number(payAmount) || 0
    if (add <= 0) {
      toast.error('Enter the amount received')
      return
    }
    const newReceived = target.amount_received + add
    // Send the full current pledge so updatePledge doesn't reset other fields;
    // omit status so it's re-derived from the new received-vs-pledged total.
    const input: PledgeInput = {
      guestContactId: target.guest_contact_id,
      pledged_amount: target.pledged_amount,
      amount_received: newReceived,
      currency: target.currency,
      promised_date: target.promised_date,
      payment_method: payMethod || target.payment_method || null,
      will_attend: target.will_attend,
      card_status: target.card_status,
      reminder_cadence: target.reminder_cadence,
      notes: target.notes,
    }
    startTransition(async () => {
      try {
        await updatePledge(target.id, input)
        toast.success(copy.toast_payment)
        setPayTarget(null)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not record payment')
      }
    })
  }

  function exportCsv() {
    const headers = [
      'Contributor', 'Group', 'Card Type', 'Phone', 'Email', 'Currency', 'Pledged', 'Received',
      'Outstanding', 'Status', 'Payment method', 'Promised by',
      'Reminders sent', 'Last reminded',
    ]
    const rows = initialPledges.map((p) => [
      p.full_name,
      p.group_tag ?? '',
      cardTypeLabel(p.max_party_size),
      p.whatsapp_phone ?? p.phone ?? '',
      p.email ?? '',
      p.currency,
      p.pledged_amount,
      p.amount_received,
      Math.max(0, p.pledged_amount - p.amount_received),
      PLEDGE_STATUS_LABELS[p.status],
      p.payment_method ? PAYMENT_METHOD_LABELS[p.payment_method] : '',
      p.promised_date ?? '',
      p.reminder_count,
      p.last_reminded_at ? new Date(p.last_reminded_at).toISOString().slice(0, 10) : '',
    ])
    const esc = (v: string | number) => {
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n')
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pledges-${coupleName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV exported')
  }

  /** Open a clean, printable contribution statement in a new window (Save as PDF
   *  from the print dialog). Self-contained HTML served via a blob URL so the
   *  dashboard chrome doesn't bleed into the printout — handy for the kamati
   *  treasurer who needs to report back to the family. */
  function printStatement() {
    const fmt = (n: number) => formatMoney(n, 'TZS')
    const esc = (s: string) =>
      s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
    const collectionRate =
      stats.totalPledged > 0 ? Math.round((stats.totalReceived / stats.totalPledged) * 100) : 0
    const goalLine =
      goalAmount && goalAmount > 0
        ? `<p class="goal">Goal ${fmt(goalAmount)} · Raised ${fmt(stats.totalReceived)} (${Math.min(
            100,
            Math.round((stats.totalReceived / goalAmount) * 100),
          )}%)</p>`
        : ''

    const statusRows = (Object.keys(PLEDGE_STATUS_LABELS) as PledgeStatus[])
      .map((s) => {
        const rows = initialPledges.filter((p) => p.status === s)
        return `<tr><td>${PLEDGE_STATUS_LABELS[s]}</td><td class="r">${rows.length}</td><td class="r">${fmt(
          rows.reduce((n, p) => n + toTzs(p.pledged_amount, p.currency), 0),
        )}</td><td class="r">${fmt(rows.reduce((n, p) => n + toTzs(p.amount_received, p.currency), 0))}</td></tr>`
      })
      .join('')

    const aging = outstandingAging(initialPledges)
    const agingRows = aging.length
      ? aging
          .map((b) => `<tr><td>${b.label}</td><td class="r">${b.count}</td><td class="r">${fmt(b.amount)}</td></tr>`)
          .join('')
      : '<tr><td colspan="3" class="muted">Nothing outstanding</td></tr>'

    const cardTypeRows = TICKET_TYPES.map(({ size }) => size)
      .map((size) => {
        const rows = initialPledges.filter((p) => ticketPartyFor(p.max_party_size) === size)
        return `<tr><td>${cardTypeLabel(size)}</td><td class="r">${rows.length}</td><td class="r">${fmt(
          rows.reduce((n, p) => n + toTzs(p.pledged_amount, p.currency), 0),
        )}</td><td class="r">${fmt(rows.reduce((n, p) => n + toTzs(p.amount_received, p.currency), 0))}</td></tr>`
      })
      .join('')

    const topRows = topContributors(initialPledges, 10)
      .map(
        (p) =>
          `<tr><td>${esc(p.full_name)}</td><td>${cardTypeLabel(p.max_party_size)}</td><td class="r">${formatMoney(p.pledged_amount, p.currency)}</td><td class="r">${formatMoney(
            p.amount_received,
            p.currency,
          )}</td></tr>`,
      )
      .join('')

    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Contribution statement — ${esc(
      coupleName,
    )}</title><style>
      *{box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1A1A1A;margin:40px;font-size:13px;line-height:1.4}
      h1{font-size:22px;margin:0 0 2px}
      .sub{color:#666;margin:0 0 4px}
      .goal{font-weight:600;color:#2f7d3a;margin:6px 0 0}
      h2{font-size:14px;margin:26px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
      .tiles{display:flex;gap:24px;margin-top:14px}
      .tile .l{color:#777;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
      .tile .v{font-size:18px;font-weight:700}
      table{width:100%;border-collapse:collapse;margin-top:4px}
      th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee}
      th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#888}
      td.r,th.r{text-align:right}
      .muted{color:#999;text-align:center;padding:14px}
      .foot{margin-top:30px;color:#999;font-size:11px}
      @media print{body{margin:18mm}}
    </style></head><body onload="window.print()">
      <h1>${esc(coupleName)}</h1>
      <p class="sub">Contribution statement · ${today}</p>
      ${goalLine}
      <div class="tiles">
        <div class="tile"><div class="l">Pledged</div><div class="v">${fmt(stats.totalPledged)}</div></div>
        <div class="tile"><div class="l">Received</div><div class="v">${fmt(stats.totalReceived)}</div></div>
        <div class="tile"><div class="l">Outstanding</div><div class="v">${fmt(stats.outstanding)}</div></div>
        <div class="tile"><div class="l">Collection rate</div><div class="v">${collectionRate}%</div></div>
      </div>
      <h2>By status</h2>
      <table><thead><tr><th>Status</th><th class="r">Count</th><th class="r">Pledged</th><th class="r">Received</th></tr></thead><tbody>${statusRows}</tbody></table>
      <h2>By card type</h2>
      <table><thead><tr><th>Card type</th><th class="r">Count</th><th class="r">Pledged</th><th class="r">Received</th></tr></thead><tbody>${cardTypeRows}</tbody></table>
      <h2>Outstanding by age</h2>
      <table><thead><tr><th>Age</th><th class="r">Count</th><th class="r">Outstanding</th></tr></thead><tbody>${agingRows}</tbody></table>
      <h2>Top contributors</h2>
      <table><thead><tr><th>Contributor</th><th>Card type</th><th class="r">Pledged</th><th class="r">Received</th></tr></thead><tbody>${
        topRows || '<tr><td colspan="4" class="muted">No pledges yet</td></tr>'
      }</tbody></table>
      <p class="foot">Generated by OpusPass · ${esc(coupleName)} contributions</p>
    </body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank', 'noopener,noreferrer')
    if (!win) {
      URL.revokeObjectURL(url)
      toast.error('Allow pop-ups to print the statement')
      return
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  function reminderText(p: PledgeWithContact): string {
    const owing = Math.max(0, p.pledged_amount - p.amount_received)
    const amountLabel = formatMoney(owing > 0 ? owing : p.pledged_amount, p.currency)
    return pledgeReminderMessage(
      coupleName,
      p.full_name,
      amountLabel,
      formatDueDate(p.promised_date) || null,
      paymentInstructions,
    )
  }

  function remindWhatsApp(p: PledgeWithContact) {
    // WhatsApp Business live → send the approved pledge template (image header +
    // "Changia Sasa" button to their pledge page). The wa.me prefill with the
    // owing-amount text remains as the pre-go-live fallback.
    if (whatsappLive) {
      const key = `${p.id}:whatsapp`
      if (remindingKey === key) return // already in flight — ignore a double-click
      setRemindingKey(key)
      startTransition(async () => {
        try {
          // Pass the event currently in view so the WhatsApp template's header
          // image uses that event's own pledge card (falls back to the
          // couple's default event otherwise — see sendWhatsAppLinkRequests).
          const r = await sendWhatsAppPledgeRequests([p.guest_contact_id], selectedEventId ?? undefined)
          if (r.sent > 0 && r.dryRun) toast.success('1 queued (dry run)')
          else if (r.sent > 0) toast.success(`WhatsApp reminder sent to ${greetingNameOf(p.full_name)}`)
          else if (r.skipped > 0) toast.error('No usable phone number for this contributor')
          else toast.error(`Could not send to ${greetingNameOf(p.full_name)}`)
          if (r.sent > 0) recordPledgeReminder(p.id, 'whatsapp').catch(() => {})
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Send failed')
        } finally {
          setRemindingKey(null)
        }
      })
      return
    }
    window.open(whatsappShareUrl(p, reminderText(p)), '_blank', 'noopener,noreferrer')
    recordPledgeReminder(p.id, 'whatsapp').catch(() => {})
  }

  // SMS/Email reminders used to just open the couple's own Messages/Mail app
  // with a prefilled draft and immediately mark the reminder "sent" the
  // moment the link was clicked — with zero confirmation the couple ever
  // actually pressed send there. That's the single biggest reason guests
  // reported never receiving reminders: nothing was tracked, nothing was
  // guaranteed. Both now go through a real (tracked) send and only mark the
  // reminder once the provider confirms it.
  function remindSms(p: PledgeWithContact) {
    const key = `${p.id}:sms`
    if (remindingKey === key) return
    setRemindingKey(key)
    startTransition(async () => {
      try {
        const r = await sendPledgeReminderSms(p.id, reminderText(p))
        if (r.ok && r.dryRun) toast.success('1 queued (dry run — no SMS gateway connected yet)')
        else if (r.ok) toast.success(`SMS reminder sent to ${greetingNameOf(p.full_name)}`)
        else toast.error(r.error ?? 'Could not send SMS reminder')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Send failed')
      } finally {
        setRemindingKey(null)
      }
    })
  }

  function remindEmail(p: PledgeWithContact) {
    const key = `${p.id}:email`
    if (remindingKey === key) return
    setRemindingKey(key)
    startTransition(async () => {
      try {
        const r = await sendPledgeReminderEmail(p.id, reminderText(p))
        if (r.ok && r.dryRun) toast.success('1 queued (dry run — email isn’t fully configured yet)')
        else if (r.ok) toast.success(`Email reminder sent to ${greetingNameOf(p.full_name)}`)
        else toast.error(r.error ?? 'Could not send email reminder')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Send failed')
      } finally {
        setRemindingKey(null)
      }
    })
  }

  async function copyShareLink() {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
      toast.success('Pledge link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  const viewLabels: Partial<Record<PledgeView, string>> = {
    all: copy.view_all,
    invited: copy.view_awaiting,
    pledged: copy.view_pledged,
    partial: copy.view_partial,
    paid: copy.view_paid,
    cards: copy.view_cards,
  }
  const viewLabel = (id: PledgeView): string => viewLabels[id] ?? copy.view_all

  // Reflect the event picked in the EventSwitcher (tab row) in the page
  // title, so it's obvious at a glance which event's pledges are showing.
  const selectedEventName =
    events.length > 1 ? events.find((e) => e.id === selectedEventId)?.name : undefined

  return (
    <div className="space-y-6">
      <DashboardHero
        content={hero}
        titleBadge={
          selectedEventName ? (
            <span className="inline-flex items-center rounded-full bg-[#9FE870]/25 px-3 py-1 text-sm font-semibold text-[#3f6b1f]">
              {selectedEventName}
            </span>
          ) : undefined
        }
      />

      <PledgeSubNav
        section={section}
        onChange={setSection}
        dueCount={remindersDue.length}
        copy={copy}
        events={events}
        selectedEventId={selectedEventId}
        scopeStrings={scopeStrings}
        pending={pending}
      />

      {section === 'manage' || section === 'followups' ? (
      <>
      {/* Money + counts */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="px-5 py-4">
          <div className="grid grid-cols-3 divide-x divide-black/[0.12] text-center">
            <MoneyStat label="Pledged" value={formatMoney(stats.totalPledged, 'TZS')} />
            <MoneyStat label="Received" value={formatMoney(stats.totalReceived, 'TZS')} accent="green" />
            <MoneyStat label="Outstanding" value={formatMoney(stats.outstanding, 'TZS')} accent="amber" />
          </div>
        </Card>
        <Card className="px-5 py-4">
          <div className="grid grid-cols-3 divide-x divide-black/[0.12] text-center">
            <CountStat value={stats.paidCount} label="Paid" />
            <CountStat value={stats.attendingCount} label="Coming" />
            <CountStat value={stats.cardsToPrepare} label="Cards to prepare" />
          </div>
        </Card>
      </div>

      {/* Reminders due */}
      {section === 'manage' && remindersDue.length > 0 ? (
        <Card className="border-amber-300/60 bg-amber-50/60 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1A1A1A]">
            <BellRing className="h-4 w-4 text-amber-600" />
            {remindersDue.length} {remindersDue.length === 1 ? 'follow-up' : 'follow-ups'} due
          </div>
          <p className="mt-0.5 text-xs text-[#1A1A1A]/60">
            Pledges that are still owing and due (or overdue) for a reminder.
          </p>
          <ul className="mt-3 space-y-2">
            {remindersDue.slice(0, 6).map((p) => {
              const days = daysUntil(p.promised_date)
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-black/[0.06]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#1A1A1A]">{p.full_name}</p>
                    <p className="text-xs text-[#1A1A1A]/55">
                      {formatMoney(Math.max(0, p.pledged_amount - p.amount_received), p.currency)} owing
                      {days !== null
                        ? days < 0
                          ? ` · ${Math.abs(days)}d overdue`
                          : days === 0
                            ? ' · due today'
                            : ` · due in ${days}d`
                        : ''}
                    </p>
                  </div>
                  <div className="inline-flex flex-wrap gap-1.5">
                    <ReminderButtons p={p} onWa={remindWhatsApp} onSms={remindSms} onEmail={remindEmail} sendingKey={remindingKey} />
                  </div>
                </li>
              )
            })}
          </ul>
          {remindersDue.length > 6 ? (
            <button
              type="button"
              onClick={() => setSection('followups')}
              className="mt-3 text-xs font-semibold text-[#1A1A1A]/60 underline-offset-2 hover:text-[#1A1A1A] hover:underline"
            >
              +{remindersDue.length - 6} more — view all in Follow-ups
            </button>
          ) : null}
        </Card>
      ) : null}
      </>
      ) : null}

      {section === 'invite' ? (
        <InviteSection
          // Remount on event switch — this section's cover/template selection
          // state is derived from props once via useState and never re-syncs
          // on its own; a fresh key forces it to re-initialize from the newly
          // selected event's actual data instead of showing the last event's.
          key={selectedEventId ?? 'no-event'}
          shareLink={shareLink}
          coupleName={coupleName}
          onCopy={copyShareLink}
          copy={copy}
          contacts={contacts}
          whatsappLive={whatsappLive}
          emailLive={emailLive}
          smsLive={smsLive}
          coverImageUrl={pledgeCoverImageUrl}
          coverIsFullTemplate={pledgeCoverIsFullTemplate}
          selectedEventId={selectedEventId}
          packageTierId={packageTierId}
          pledgeCardCatalog={pledgeCardCatalog}
          purchasedTemplateIds={purchasedTemplateIds}
          contactEmail={contactEmail}
          contactPhone={contactPhone}
          checkoutFormStrings={checkoutFormStrings}
          checkoutPaymentStrings={checkoutPaymentStrings}
        />
      ) : null}

      {section === 'collection' ? (
        <CollectionSection
          goalInput={goalInput}
          setGoalInput={setGoalInput}
          methods={methods}
          setMethods={setMethods}
          pending={pending}
          onSave={saveCollection}
          copy={copy}
        />
      ) : null}

      {section === 'manage' ? (
      <>
      {/* Toolbar: view filter + search */}
      {initialPledges.length > 0 ? (
        <div className="flex flex-nowrap items-center gap-3">
          <div className="relative shrink-0" ref={filterRef}>
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              aria-expanded={filterOpen}
              aria-haspopup="true"
              className={cn(
                'inline-flex items-center gap-2 rounded-xl border border-black/[0.12] bg-white px-3.5 py-2.5 text-sm text-[#1A1A1A] transition-colors hover:bg-black/[0.03]',
                view !== 'all' && 'border-[#C9A0DC] bg-[#F0DFF6] text-[#5d3a78]',
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>{viewLabel(view) ?? copy.nav_manage}</span>
            </button>
            {filterOpen ? (
              <div
                role="menu"
                className="absolute left-0 top-[calc(100%+6px)] z-20 w-56 rounded-xl border border-black/[0.08] bg-white p-2 shadow-lg ring-1 ring-black/[0.04]"
              >
                <ul className="space-y-1">
                  {VIEW_TABS.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setView(t.id)
                          setFilterOpen(false)
                        }}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-[#1A1A1A] hover:bg-black/[0.04]',
                          view === t.id && 'font-semibold text-[#5d3a78]',
                        )}
                      >
                        <span>{viewLabel(t.id)}</span>
                        {view === t.id ? <Check className="h-4 w-4" /> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/35" />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Search contributors…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#C9A0DC] px-4 py-2.5 text-sm font-semibold text-[#1A1A1A] hover:bg-[#b97fd0]"
          >
            <Plus className="h-4 w-4" /> {copy.add_pledge_cta}
          </button>
        </div>
      ) : null}

      {initialPledges.length === 0 ? (
        <EmptyState
          icon={<HandCoins className="h-7 w-7" />}
          title={copy.empty_title}
          description={copy.empty_description}
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> {copy.empty_cta}
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search className="h-6 w-6" />} title={copy.no_match_title} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
            <thead>
              <tr className="border-b border-black/[0.06]">
                <Th>Contributor</Th>
                <Th>Pledged</Th>
                <Th>Received</Th>
                <Th>Outstanding</Th>
                <Th>Due</Th>
                <Th>Status</Th>
                <Th>Card Type</Th>
                <Th>Payment</Th>
                <th className="w-1 py-3 pr-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05]">
              {filtered.map((p) => {
                const owing = Math.max(0, p.pledged_amount - p.amount_received)
                const days = daysUntil(p.promised_date)
                const overdue = days !== null && days < 0 && OWING.includes(p.status)
                return (
                  <tr key={p.id} className="align-middle hover:bg-black/[0.02]">
                    <td className="py-3.5 pr-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-xs font-semibold text-[#1A1A1A]/70">
                          {p.full_name.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[#1A1A1A]">{p.full_name}</p>
                          {p.group_tag ? (
                            <p className="truncate text-xs text-[#1A1A1A]/50">{p.group_tag}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 pr-4 text-[#1A1A1A]/80">{formatMoney(p.pledged_amount, p.currency)}</td>
                    <td className="py-3.5 pr-4 text-emerald-700">{formatMoney(p.amount_received, p.currency)}</td>
                    <td className="py-3.5 pr-4 text-[#1A1A1A]/80">
                      {owing > 0 ? formatMoney(owing, p.currency) : '—'}
                    </td>
                    <td className="py-3.5 pr-4">
                      {p.promised_date ? (
                        <span className={cn('text-xs', overdue ? 'font-medium text-rose-600' : 'text-[#1A1A1A]/65')}>
                          {formatDueDate(p.promised_date)}
                          {overdue ? ' · overdue' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-[#1A1A1A]/35">—</span>
                      )}
                    </td>
                    <td className="py-3.5 pr-4"><PledgeStatusPill status={p.status} /></td>
                    <td className="py-3.5 pr-4">
                      <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-xs font-medium text-[#1A1A1A]/70">
                        {cardTypeLabel(p.max_party_size)}
                      </span>
                    </td>
                    <td className="py-3.5 pr-4">
                      <button
                        onClick={() => openRecordPayment(p)}
                        disabled={p.status === 'declined'}
                        title="Record a payment"
                        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-emerald-50"
                      >
                        <Banknote className="h-3.5 w-3.5" /> Record
                      </button>
                    </td>
                    <td className="py-3.5 pr-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          aria-label="Edit"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#1A1A1A]/50 hover:bg-black/[0.05]"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setPendingDelete(p)}
                          aria-label="Remove"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
      </>
      ) : null}

      {section === 'followups' ? (
        <FollowUpsSection
          pledges={initialPledges}
          onWa={remindWhatsApp}
          onSms={remindSms}
          onEmail={remindEmail}
          onRecord={openRecordPayment}
          copy={copy}
          sendingKey={remindingKey}
        />
      ) : null}

      {section === 'reports' ? (
        <ReportsSection
          pledges={initialPledges}
          stats={stats}
          goalAmount={goalAmount}
          weddingDate={weddingDate}
          onExport={exportCsv}
          onPrint={printStatement}
          onChaseFollowups={() => setSection('followups')}
          onViewAwaiting={() => {
            setView('invited')
            setSection('manage')
          }}
          copy={copy}
        />
      ) : null}

      <PledgeSlideover
        open={open}
        form={form}
        setForm={setForm}
        contacts={contacts}
        pending={pending}
        onClose={() => setOpen(false)}
        onSave={save}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmRemove}
        title={pendingDelete ? `Remove ${pendingDelete.full_name}'s pledge?` : ''}
        description="The pledge and its reminder history will be deleted. The contributor stays in your guest list. This can't be undone."
        confirmLabel="Remove pledge"
        pending={pending}
      />

      <Dialog
        open={payTarget !== null}
        onClose={() => setPayTarget(null)}
        title={payTarget ? `Record a payment — ${payTarget.full_name}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayTarget(null)}>
              Cancel
            </Button>
            <Button onClick={savePayment} disabled={pending}>
              {pending ? 'Saving…' : 'Record payment'}
            </Button>
          </>
        }
      >
        {payTarget ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-black/[0.03] px-3 py-2">
                <div className="text-xs text-[#1A1A1A]/55">Pledged</div>
                <div className="font-semibold text-[#1A1A1A]">
                  {formatMoney(payTarget.pledged_amount, payTarget.currency)}
                </div>
              </div>
              <div className="rounded-lg bg-black/[0.03] px-3 py-2">
                <div className="text-xs text-[#1A1A1A]/55">Outstanding</div>
                <div className="font-semibold text-amber-700">
                  {formatMoney(
                    Math.max(0, payTarget.pledged_amount - payTarget.amount_received),
                    payTarget.currency,
                  )}
                </div>
              </div>
            </div>
            <Field label={`Amount received now (${payTarget.currency})`}>
              <input
                type="number"
                min="0"
                autoFocus
                className={inputClass}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="e.g. 50000"
              />
            </Field>
            <Field label="Paid via">
              <select
                className={inputClass}
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as PaymentMethod | '')}
              >
                <option value="">—</option>
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-xs text-[#1A1A1A]/50">
              We’ll add this to the amount received and update the status automatically.
            </p>
          </div>
        ) : null}
      </Dialog>

    </div>
  )
}

// ──────────────────────────────── pieces ────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="py-3 pr-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/55">{children}</span>
    </th>
  )
}

function MoneyStat({
  value,
  label,
  accent,
}: {
  value: string
  label: string
  accent?: 'green' | 'amber'
}) {
  return (
    <div>
      <div
        className={cn(
          'text-lg font-semibold leading-tight tracking-tight',
          accent === 'green' ? 'text-emerald-700' : accent === 'amber' ? 'text-amber-700' : 'text-[#1A1A1A]',
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs font-medium text-[#1A1A1A]/55">{label}</div>
    </div>
  )
}

function CountStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold leading-none tracking-tight text-[#1A1A1A]">{value}</div>
      <div className="mt-1 text-xs font-medium text-[#1A1A1A]/55">{label}</div>
    </div>
  )
}

const PILL_STYLES: Record<PledgeStatus, string> = {
  invited: 'bg-black/[0.06] text-[#1A1A1A]/65',
  pledged: 'bg-[#F0DFF6] text-[#5d3a78]',
  partial: 'bg-amber-100 text-amber-800',
  paid: 'bg-[#9FE870]/30 text-[#3f6b1f]',
  declined: 'bg-rose-100 text-rose-700',
}

function PledgeStatusPill({ status }: { status: PledgeStatus }) {
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', PILL_STYLES[status])}>
      {PLEDGE_STATUS_LABELS[status]}
    </span>
  )
}

function ReminderButtons({
  p,
  onWa,
  onSms,
  onEmail,
  sendingKey,
}: {
  p: PledgeWithContact
  onWa: (p: PledgeWithContact) => void
  onSms: (p: PledgeWithContact) => void
  onEmail: (p: PledgeWithContact) => void
  /** `${pledgeId}:whatsapp` / `:sms` / `:email` while that channel's send is
   *  in flight for this row — disables the button and swaps in a spinner so
   *  a double-click can't fire the same reminder twice. */
  sendingKey?: string | null
}) {
  const hasPhone = Boolean(p.whatsapp_phone || p.phone)
  const isSendingWa = sendingKey === `${p.id}:whatsapp`
  const isSendingSms = sendingKey === `${p.id}:sms`
  const isSendingEmail = sendingKey === `${p.id}:email`
  return (
    <>
      <button
        onClick={() => onWa(p)}
        disabled={!hasPhone || isSendingWa}
        aria-label="Send reminder on WhatsApp"
        title={hasPhone ? 'Send reminder on WhatsApp' : 'No phone on file'}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-2.5 text-[11px] font-semibold text-[#1a8a4a] hover:bg-[#25D366]/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#25D366]/10"
      >
        {isSendingWa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
        WhatsApp
      </button>
      <button
        onClick={() => onSms(p)}
        disabled={!hasPhone || isSendingSms}
        aria-label="Send reminder by SMS"
        title={hasPhone ? 'Send reminder by SMS' : 'No phone on file'}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-black/[0.14] bg-white px-2.5 text-[11px] font-semibold text-[#1A1A1A]/70 hover:bg-black/[0.04] hover:text-[#1A1A1A] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
      >
        {isSendingSms ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />}
        SMS
      </button>
      <button
        onClick={() => onEmail(p)}
        disabled={!p.email || isSendingEmail}
        aria-label="Send reminder by email"
        title={p.email ? 'Send reminder by email' : 'No email on file'}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-black/[0.14] bg-white px-2.5 text-[11px] font-semibold text-[#1A1A1A]/70 hover:bg-black/[0.04] hover:text-[#1A1A1A] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
      >
        {isSendingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
        Email
      </button>
    </>
  )
}

function PledgeSubNav({
  section,
  onChange,
  dueCount,
  copy,
  events,
  selectedEventId,
  scopeStrings,
  pending,
}: {
  section: Section
  onChange: (s: Section) => void
  dueCount: number
  copy: PledgesDashboardCopy
  events: { id: string; name: string }[]
  selectedEventId: string | null
  scopeStrings: DashboardEventScopeStrings
  pending: boolean
}) {
  const tabs: { id: Section; label: string; icon: typeof HandCoins; badge?: number }[] = [
    { id: 'manage', label: copy.nav_manage, icon: HandCoins },
    { id: 'invite', label: copy.nav_invite, icon: Send },
    { id: 'collection', label: copy.nav_collection, icon: Banknote },
    { id: 'followups', label: copy.nav_followups, icon: ListChecks, badge: dueCount },
    { id: 'reports', label: copy.nav_reports, icon: BarChart3 },
  ]
  return (
    <nav
      role="tablist"
      aria-label="Pledge views"
      className="-mx-4 flex flex-wrap items-center gap-x-6 gap-y-2 overflow-x-auto overflow-y-hidden border-b border-black/[0.06] px-4 pb-2 sm:mx-0 sm:px-0"
    >
      {tabs.map(({ id, label, icon: Icon, badge }) => {
        const active = id === section
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={cn(
              '-mb-[9px] inline-flex items-center gap-2 border-b-2 pb-2.5 text-sm transition-colors',
              active
                ? 'border-[#1A1A1A] font-semibold text-[#1A1A1A]'
                : 'border-transparent font-medium text-[#1A1A1A]/55 hover:text-[#1A1A1A]',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {badge ? (
              <span
                className={cn(
                  'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                  active ? 'bg-[#1A1A1A] text-white' : 'bg-amber-100 text-amber-800',
                )}
              >
                {badge}
              </span>
            ) : null}
          </button>
        )
      })}
      {events.length > 1 ? (
        <EventPicker
          events={events}
          selectedId={selectedEventId ?? ''}
          strings={scopeStrings}
          disabled={pending}
          className="ml-auto"
        />
      ) : null}
    </nav>
  )
}

// ──────────────────────────────── send invites ────────────────────────────────

function CollectionSection({
  goalInput,
  setGoalInput,
  methods,
  setMethods,
  pending,
  onSave,
  copy,
}: {
  goalInput: string
  setGoalInput: (v: string) => void
  methods: PledgePaymentMethod[]
  setMethods: React.Dispatch<React.SetStateAction<PledgePaymentMethod[]>>
  pending: boolean
  onSave: () => void
  copy: PledgesDashboardCopy
}) {
  const goalNum = Number(goalInput) || 0
  const presets = [1_000_000, 2_500_000, 5_000_000, 10_000_000]

  const setRow = (i: number, patch: Partial<PledgePaymentMethod>) =>
    setMethods((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () => setMethods((rows) => [...rows, { label: '', value: '', name: '' }])
  const removeRow = (i: number) => setMethods((rows) => rows.filter((_, idx) => idx !== i))
  const filled = methods.filter((m) => m.label?.trim() || m.value?.trim())

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#C9A0DC]/15 text-[#8e57b3]">
          <Banknote className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-[#1A1A1A]">
            {copy.collection_title}
          </h2>
          <p className="mt-0.5 text-sm text-[#1A1A1A]/55">{copy.collection_desc}</p>
        </div>
      </div>

      {/* Fundraising goal */}
      <Card className="px-6 py-5">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-[#8e57b3]" />
          <h3 className="text-sm font-semibold text-[#1A1A1A]">{copy.goal_title}</h3>
          <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
            Optional
          </span>
        </div>
        <p className="mt-1 text-sm text-[#1A1A1A]/55">{copy.goal_desc}</p>

        <div className="relative mt-4 max-w-md">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-[#1A1A1A]/40">
            TSh
          </span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            placeholder="5,000,000"
            className={`${inputClass} pl-[3.5rem] text-lg font-semibold`}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setGoalInput(String(p))}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                goalNum === p
                  ? 'border-[#C9A0DC] bg-[#F0DFF6] text-[#5d3a78]'
                  : 'border-black/[0.12] text-[#1A1A1A]/65 hover:bg-black/[0.03]',
              )}
            >
              {formatMoney(p, 'TZS')}
            </button>
          ))}
          {goalInput ? (
            <button
              type="button"
              onClick={() => setGoalInput('')}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-[#1A1A1A]/45 hover:text-[#1A1A1A]"
            >
              Clear
            </button>
          ) : null}
        </div>

        {goalNum > 0 ? (
          <p className="mt-3 text-sm text-[#1A1A1A]/60">
            Target: <span className="font-semibold text-[#1A1A1A]">{formatMoney(goalNum, 'TZS')}</span>
          </p>
        ) : null}
      </Card>

      {/* How to pay */}
      <Card className="px-6 py-5">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-[#3f6b1f]" />
          <h3 className="text-sm font-semibold text-[#1A1A1A]">{copy.howtopay_title}</h3>
        </div>
        <p className="mt-1 text-sm text-[#1A1A1A]/55">{copy.howtopay_desc}</p>

        <datalist id="pay-providers">
          {PAYMENT_PROVIDERS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {/* Row editor */}
          <div className="space-y-3">
            {methods.map((m, i) => (
              <div key={i} className="rounded-xl border border-black/[0.1] bg-black/[0.015] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#1A1A1A]/55">Method {i + 1}</span>
                  {methods.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      aria-label="Remove method"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                <input
                  list="pay-providers"
                  value={m.label}
                  onChange={(e) => setRow(i, { label: e.target.value })}
                  placeholder="Provider — e.g. M-Pesa, CRDB Bank"
                  className={inputClass}
                />
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    value={m.value}
                    onChange={(e) => setRow(i, { value: e.target.value })}
                    placeholder="Account / number"
                    className={inputClass}
                  />
                  <input
                    value={m.name ?? ''}
                    onChange={(e) => setRow(i, { name: e.target.value })}
                    placeholder="Account name (optional)"
                    className={inputClass}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.14] bg-white px-3.5 py-2 text-sm font-semibold text-[#1A1A1A] hover:bg-black/[0.03]"
            >
              <Plus className="h-3.5 w-3.5" /> Add payment method
            </button>
          </div>

          {/* Live preview matching the public pledge page */}
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[#1A1A1A]/45">
              How guests see it
            </p>
            <div className="rounded-2xl border border-[#9FE870]/40 bg-[#F3FAEC] p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#9FE870]/30 text-[#3f6b1f]">
                  <Wallet className="h-3.5 w-3.5" />
                </span>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3f6b1f]">
                  How to pay
                </p>
              </div>
              {filled.length ? (
                <ul className="mt-3 space-y-2.5">
                  {filled.map((m, i) => (
                    <li key={i} className="text-sm leading-snug">
                      <span className="text-[#1A1A1A]/75">
                        {m.label?.trim() ? <span className="font-semibold text-[#1A1A1A]">{m.label.trim()}</span> : null}
                        {m.label?.trim() && m.value?.trim() ? ', ' : ''}
                        {m.value?.trim() ? (
                          <span className="font-bold tracking-wide text-[#3f6b1f]">{m.value.trim()}</span>
                        ) : null}
                      </span>
                      {m.name?.trim() ? (
                        <div className="text-xs italic text-[#1A1A1A]/60">{m.name.trim()}</div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-[#1A1A1A]/35">Your payment details will appear here.</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Save bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[0.06] bg-[#FBF9F5] px-5 py-3.5">
        <p className="text-xs text-[#1A1A1A]/55">
          These appear on your public pledge page and in reminder messages.
        </p>
        <Button onClick={onSave} disabled={pending}>
          {pending ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </div>
  )
}

type ShareChannel = 'whatsapp' | 'sms' | 'email'

const SHARE_CHANNELS: { id: ShareChannel; label: string; icon: typeof MessageCircle }[] = [
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'sms', label: 'SMS', icon: Smartphone },
  { id: 'email', label: 'Email', icon: Mail },
]

function contactHasChannel(c: ContactLite, channel: ShareChannel): boolean {
  if (channel === 'email') return Boolean(c.email)
  return Boolean(c.whatsapp_phone || c.phone)
}

/** Best channel to reach a contact on, in priority order — drives the
 *  "Preferred channel" pill and which single send a bulk "Send to selected"
 *  or the row's primary Send button uses. */
function preferredChannel(c: ContactLite): ShareChannel | null {
  if (c.whatsapp_phone) return 'whatsapp'
  if (c.phone) return 'sms'
  if (c.email) return 'email'
  return null
}

type ContactStatus = 'pledged' | 'awaiting' | 'not_sent'

/** Pledged beats Awaiting beats Not sent — once someone's pledged, whether we
 *  ever "sent" them a link stops mattering. */
function contactStatus(c: ContactLite): ContactStatus {
  if (c.hasPledged) return 'pledged'
  if (c.pledgeInviteSentAt) return 'awaiting'
  return 'not_sent'
}

const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  pledged: 'Pledged',
  awaiting: 'Awaiting',
  not_sent: 'Not sent',
}

// Guest table CSS — copied from the Send Invites console (SendInvitesView.tsx)
// so the two guest tables look and feel identical. Scoped under its own
// `.si` wrapper so it doesn't affect this page's existing Tailwind styling.
const PLEDGE_TABLE_CSS = `
.si{ --purple:#6B3FA0; --purple-d:#4A2870; --lav:#D7BDE8; --ink:#1c1b1f; --muted:#8b8790;
  --faint:#b6b2ba; --line:#ededf0; --hover:#faf8fc; --radius:16px; --soft:0 1px 2px rgba(20,18,30,.05);
  --bad-tx:#c0392b; --bad-bg:#fcecec;
  color:var(--ink); }
.si .gt{ background:#fff; border:1px solid var(--line); border-radius:var(--radius); box-shadow:var(--soft); overflow:hidden; }
.si .gth{ display:flex; align-items:center; gap:14px; padding:18px 20px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
.si .gth h2{ font-size:18px; font-weight:600; }
.si .gth .cnt{ color:var(--muted); font-size:12px; }
.si .gth .gsearch{ flex:0 1 240px; min-width:150px; border:1px solid var(--line); border-radius:10px;
  padding:8px 12px; font-size:13px; color:var(--ink); background:#fff; }
.si .gth .gsearch:focus{ outline:none; border-color:var(--lav); }
.si .empty{ padding:40px 20px; text-align:center; color:var(--muted); font-size:14px; }
.si .scroll{ overflow-x:auto; }
.si table{ width:100%; border-collapse:collapse; font-size:13.5px; }
.si th{ text-align:left; font-size:10.5px; letter-spacing:.6px; text-transform:uppercase; color:var(--faint);
  padding:12px 20px; border-bottom:1px solid var(--line); font-weight:600; position:sticky; top:0; background:#fff; z-index:1; }
.si td{ padding:14px 20px; border-bottom:1px solid var(--line); }
.si tr:last-child td{ border-bottom:none; }
.si tbody tr:hover td{ background:var(--hover); }
.si .who{ font-weight:600; }
.si .contact{ color:var(--muted); font-size:12px; }
.si .ra{ display:flex; gap:7px; justify-content:flex-end; align-items:center; }
.si .ia{ height:32px; min-width:32px; padding:0 8px; border-radius:9px; border:1px solid var(--line); background:#fff; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size:12px; font-weight:600; color:var(--ink); }
.si .ia:hover{ background:var(--hover); border-color:var(--lav); }
.si .ia:disabled{ opacity:.45; cursor:not-allowed; }
.si .ia-whatsapp{ background:#25D366; border-color:#25D366; color:#fff; }
.si .ia-whatsapp:hover{ filter:brightness(1.06); background:#25D366; }
.si .ia-sms{ background:#1A1A1A; border-color:#1A1A1A; color:#fff; }
.si .ia-sms:hover{ filter:brightness(1.3); background:#1A1A1A; }
.si .ia-email{ background:var(--purple); border-color:var(--purple); color:#fff; }
.si .ia-email:hover{ filter:brightness(1.06); background:var(--purple); }
.si .ia.save{ background:var(--purple); border-color:var(--purple); color:#fff; padding:0 12px; }
.si .ia.save:hover{ filter:brightness(1.06); background:var(--purple); }
.si .ia.danger{ color:var(--bad-tx); }
.si .ia.danger:hover{ border-color:var(--bad-tx); background:var(--bad-bg); }
.si .einp{ width:100%; max-width:220px; border:1px solid var(--lav); border-radius:8px; padding:6px 9px; font-size:13px; background:#fff; }
.si .einp:focus{ outline:none; border-color:var(--purple); }
.si .spin{ animation:si-spin .8s linear infinite; }
@keyframes si-spin{ to{ transform:rotate(360deg); } }
.si .ia-primary{ padding:0 12px; font-size:12.5px; }
.si input[type="checkbox"]{ width:16px; height:16px; accent-color:var(--purple); cursor:pointer; }
.si .tabs{ display:inline-flex; align-items:center; gap:2px; border:1px solid var(--line); border-radius:10px; padding:3px; }
.si .tab{ border:none; background:transparent; border-radius:7px; padding:6px 10px; font-size:12.5px; font-weight:600;
  color:var(--muted); cursor:pointer; white-space:nowrap; }
.si .tab:hover{ color:var(--ink); }
.si .tab.active{ background:#fff; color:var(--purple-d); box-shadow:var(--soft); }
.si .addbtn{ display:inline-flex; align-items:center; gap:6px; border:1px solid var(--line); border-radius:10px;
  padding:8px 14px; font-size:13px; font-weight:600; color:var(--ink); background:#fff; cursor:pointer; white-space:nowrap; }
.si .addbtn:hover{ background:var(--hover); border-color:var(--lav); }
.si .bulkbtn{ display:inline-flex; align-items:center; gap:7px; border:none; border-radius:10px; padding:8px 16px;
  font-size:13px; font-weight:700; color:#fff; background:var(--purple); cursor:pointer; white-space:nowrap;
  margin-left:auto; }
.si .bulkbtn:hover{ filter:brightness(1.08); }
.si .bulkbtn:disabled{ opacity:.4; cursor:not-allowed; background:var(--faint); }
.si .pill{ display:inline-flex; align-items:center; gap:5px; border-radius:999px; padding:4px 10px; font-size:11.5px;
  font-weight:600; border:1px solid var(--line); color:var(--ink); white-space:nowrap; }
.si .pill-whatsapp{ color:#1a8a4a; border-color:#bfe8d2; background:#eefaf3; }
.si .pill-sms{ color:var(--purple-d); border-color:var(--lav); background:#faf6fd; }
.si .pill-email{ color:var(--purple-d); border-color:var(--lav); background:#faf6fd; }
.si .pill-card{ color:#4b5563; border-color:#e5e7eb; background:#f8fafc; }
.si .pill-none{ color:var(--faint); }
.si .pillselect{ display:inline-flex; align-items:center; gap:5px; border-radius:999px; padding:4px 10px; font-size:11.5px;
  font-weight:600; border:1px solid var(--line); color:var(--ink); white-space:nowrap; cursor:pointer; background:#fff; }
.si .pillselect::after{ content:''; width:6px; height:6px; margin-left:2px; border-right:1.6px solid currentColor; border-bottom:1.6px solid currentColor;
  opacity:.55; transform:translateY(-2px) rotate(45deg); }
.si .pillselect:hover{ filter:brightness(0.97); }
.si .pillselect.pill-whatsapp{ color:#1a8a4a; border-color:#bfe8d2; background-color:#eefaf3; }
.si .pillselect.pill-sms{ color:var(--purple-d); border-color:var(--lav); background-color:#faf6fd; }
.si .pillselect.pill-email{ color:var(--purple-d); border-color:var(--lav); background-color:#faf6fd; }
.si .chmenu{ position:absolute; z-index:5; top:calc(100% + 4px); left:0; min-width:150px; background:#fff;
  border:1px solid var(--line); border-radius:12px; box-shadow:0 8px 24px rgba(20,18,30,.12); padding:4px; }
.si .chmenu-item{ display:flex; width:100%; align-items:center; gap:7px; border:none; background:transparent; border-radius:8px;
  padding:7px 9px; font-size:12.5px; font-weight:600; color:var(--ink); cursor:pointer; text-align:left; }
.si .chmenu-item:hover:not(:disabled){ background:var(--hover); }
.si .chmenu-item.active{ background:var(--hover); }
.si .chmenu-item:disabled{ opacity:.4; cursor:not-allowed; }
.si .chmenu-hint{ margin-left:auto; font-size:10px; font-weight:600; color:var(--faint); white-space:nowrap; }
.si .status{ display:inline-flex; align-items:center; border-radius:999px; padding:4px 10px; font-size:11.5px; font-weight:700; white-space:nowrap; }
.si .status-not_sent{ color:var(--muted); background:#f3f1f4; }
.si .status-awaiting{ color:#9a6a12; background:#fdf1dc; }
.si .status-pledged{ color:#1a8a4a; background:#eafaf0; }
`

function InviteSection({
  shareLink,
  coupleName,
  onCopy,
  copy,
  contacts,
  whatsappLive,
  emailLive,
  smsLive,
  coverImageUrl,
  coverIsFullTemplate,
  selectedEventId,
  packageTierId,
  pledgeCardCatalog,
  purchasedTemplateIds,
  contactEmail,
  contactPhone,
  checkoutFormStrings,
  checkoutPaymentStrings,
}: {
  shareLink: string | null
  coupleName: string
  onCopy: () => void
  copy: PledgesDashboardCopy
  contacts: ContactLite[]
  whatsappLive: boolean
  emailLive: boolean
  smsLive: boolean
  coverImageUrl: string | null
  coverIsFullTemplate: boolean
  selectedEventId: string | null
  packageTierId: string | null
  pledgeCardCatalog: PledgeCardCatalogItem[]
  purchasedTemplateIds: string[]
  contactEmail: string
  contactPhone: string | null
  checkoutFormStrings: CheckoutFormStrings
  checkoutPaymentStrings: CheckoutPaymentStrings
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [contactSearch, setContactSearch] = useState('')
  // `${contactId}:${channel}` of the in-flight per-row send, if any.
  const [sendingKey, setSendingKey] = useState<string | null>(null)
  const [rowEdit, setRowEdit] = useState<{
    id: string
    name: string
    phone: string
    email: string
    max_party_size: number
    askDelete: boolean
  } | null>(null)
  const [pending, startTransition] = useTransition()
  const [statusFilter, setStatusFilter] = useState<'all' | 'not_sent' | 'awaiting'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkSending, startBulkSend] = useTransition()
  const [addingGuest, setAddingGuest] = useState(false)
  const [newGuest, setNewGuest] = useState({ name: '', phone: '', email: '', max_party_size: 1 })
  const [savingNewGuest, startSaveNewGuest] = useTransition()
  // Per-contact channel override — the "Preferred channel" column defaults to
  // preferredChannel(c) but the couple can pick a different one for any row.
  const [channelChoice, setChannelChoice] = useState<Record<string, ShareChannel>>({})
  // Contact id of the row whose channel-picker popover is open, if any —
  // custom dropdown (not a native <select>) so the WhatsApp/SMS/Email icons
  // can actually render inside it.
  const [channelMenuOpenId, setChannelMenuOpenId] = useState<string | null>(null)
  useEffect(() => {
    if (!channelMenuOpenId) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-channel-menu]')) setChannelMenuOpenId(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [channelMenuOpenId])
  const [cover, setCover] = useState<{ url: string | null; isTemplate: boolean }>({
    url: coverImageUrl,
    isTemplate: coverIsFullTemplate,
  })
  const [savingCover, startCoverSave] = useTransition()
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null)
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null)
  const hasFreeTemplateAccess = Boolean(packageTierId && PLEDGE_TEMPLATE_FREE_TIER_IDS.includes(packageTierId))

  // Templates bought individually (Classic/Essential) — starts from the
  // server-fetched paid orders, then grows optimistically the moment a
  // purchase resolves so the picker unlocks without a full page reload.
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(() => new Set(purchasedTemplateIds))
  // Templates paid for but still awaiting finance's manual approval — seeded
  // from this device's local order history (see getPendingTemplateIds; the
  // server only tracks paid orders, so a fresh device/session won't show
  // this until the purchase itself happens there).
  const [pendingTemplateIds, setPendingTemplateIds] = useState<Set<string>>(new Set())
  const [purchaseTarget, setPurchaseTarget] = useState<TemplatePurchaseTarget | null>(null)
  // The order just paid for / submitted — drives the post-purchase summary.
  const [summaryOrder, setSummaryOrder] = useState<StoredOrder | null>(null)
  const canUseTemplate = (t: PledgeCardCatalogItem) => hasFreeTemplateAccess || purchasedIds.has(t.id)

  // Resync from the server-fetched prop after router.refresh() (e.g. the
  // card-redirect purchase_ref effect below) — the useState initializer only
  // runs on mount, so without this a card purchase would still show "Locked"
  // until a full page reload even though the server now knows it's paid.
  useEffect(() => {
    setPurchasedIds(new Set(purchasedTemplateIds))
  }, [purchasedTemplateIds])
  // Fires the confetti overlay — a fresh timestamp key so it can re-trigger
  // (and remount) on a second purchase in the same session.
  const [celebrateAt, setCelebrateAt] = useState<number | null>(null)

  // Seed the "under review" badges from local order history, then re-check
  // each pending order once — approvals happen out-of-band in the finance
  // dashboard, so a couple returning later (no purchase_ref in the URL)
  // still needs to see a design unlock once it's been confirmed.
  useEffect(() => {
    const pending = getPendingTemplateIds('pledge_card', selectedEventId)
    setPendingTemplateIds(pending)
    if (pending.size === 0) return
    let cancelled = false
    ;(async () => {
      for (const order of getOrders()) {
        if (order.paymentStatus !== 'verifying') continue
        if (selectedEventId && order.eventId !== selectedEventId) continue
        for (const item of order.items) {
          const parsed = parseTemplateCardItemId(item.id)
          if (!parsed || parsed.type !== 'pledge_card') continue
          try {
            const res = await fetch(`/api/payments/status?ref=${encodeURIComponent(order.ref)}`, { cache: 'no-store' })
            if (!res.ok) continue
            const data = (await res.json()) as { status: string }
            if (cancelled) return
            if (data.status === 'paid') {
              setLastOrder({ ...order, paymentStatus: 'paid' })
              setPurchasedIds((prev) => new Set(prev).add(parsed.templateId))
              setPendingTemplateIds((prev) => {
                const next = new Set(prev)
                next.delete(parsed.templateId)
                return next
              })
            } else if (data.status === 'failed' || data.status === 'expired') {
              setPendingTemplateIds((prev) => {
                const next = new Set(prev)
                next.delete(parsed.templateId)
                return next
              })
            }
          } catch {
            /* transient — leave it pending, next visit will retry */
          }
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // After a card-redirect purchase, Selcom bounces the buyer back here with
  // `?purchase_ref=...` — confirm it landed and unlock the design without the
  // couple needing to do anything else.
  useEffect(() => {
    const ref = searchParams.get('purchase_ref')
    if (!ref) return
    let cancelled = false
    ;(async () => {
      for (let attempt = 0; attempt < 5 && !cancelled; attempt++) {
        try {
          const res = await fetch(`/api/payments/status?ref=${encodeURIComponent(ref)}`, { cache: 'no-store' })
          if (res.ok) {
            const data = (await res.json()) as { status: string }
            if (data.status === 'paid') {
              // Promote the local order snapshot (recorded by TemplatePurchaseModal
              // before the Selcom card redirect) so it shows paid on Orders.
              const stored = getLastOrder()
              const paidOrder = stored && stored.ref === ref ? { ...stored, paymentStatus: 'paid' as const } : null
              if (paidOrder) {
                setLastOrder(paidOrder)
                setSummaryOrder(paidOrder)
                for (const item of paidOrder.items) {
                  const parsed = parseTemplateCardItemId(item.id)
                  if (!parsed || parsed.type !== 'pledge_card') continue
                  if (selectedEventId && paidOrder.eventId !== selectedEventId) continue
                  setPurchasedIds((prev) => new Set(prev).add(parsed.templateId))
                  setPendingTemplateIds((prev) => {
                    const next = new Set(prev)
                    next.delete(parsed.templateId)
                    return next
                  })
                }
              }
              toast.success('Card design unlocked')
              setCelebrateAt(Date.now())
              router.refresh()
              break
            }
            if (data.status === 'failed' || data.status === 'expired') {
              toast.error('That payment did not go through')
              break
            }
          }
        } catch {
          /* transient — retry */
        }
        await new Promise((r) => setTimeout(r, 2500))
      }
      if (!cancelled) {
        const url = new URL(window.location.href)
        url.searchParams.delete('purchase_ref')
        router.replace(`${url.pathname}${url.search}`)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** The channel to actually send this contact on: their explicit override
   *  from the dropdown if it's still usable (they might have picked Email,
   *  then we should keep honoring it even though phone also exists), else
   *  fall back to the auto-picked preferredChannel. */
  function effectiveChannel(c: ContactLite): ShareChannel | null {
    const chosen = channelChoice[c.id]
    if (chosen && contactHasChannel(c, chosen)) return chosen
    return preferredChannel(c)
  }

  function saveCover(url: string | null, isTemplate: boolean) {
    setCover({ url, isTemplate })
    setAppliedTemplateId(null)
    startCoverSave(async () => {
      try {
        await setPledgeCoverImage(selectedEventId, url, isTemplate)
        toast.success(url ? 'Pledge card image saved' : 'Pledge card image removed')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save the pledge card image')
      }
    })
  }

  function useTemplate(item: PledgeCardCatalogItem) {
    if (!selectedEventId) return
    setApplyingTemplateId(item.id)
    startCoverSave(async () => {
      try {
        await applyPledgeCardTemplate(selectedEventId, item.imageUrl, item.id)
        setCover({ url: item.imageUrl, isTemplate: true })
        setAppliedTemplateId(item.id)
        toast.success('Pledge card template applied')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not apply this template')
      } finally {
        setApplyingTemplateId(null)
      }
    })
  }

  /** Unselect the currently-applied template, clearing the pledge page cover. */
  function removeTemplate(item: PledgeCardCatalogItem) {
    setApplyingTemplateId(item.id)
    setCover({ url: null, isTemplate: false })
    setAppliedTemplateId(null)
    startCoverSave(async () => {
      try {
        await setPledgeCoverImage(selectedEventId, null, false)
        toast.success('Pledge card template removed')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove this template')
      } finally {
        setApplyingTemplateId(null)
      }
    })
  }

  // QR for the share link — fills the otherwise-empty space next to the
  // link/buttons row, and doubles as something printable for physical
  // invites (e.g. a table card at the wedding).
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!shareLink) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(shareLink, { margin: 1, width: 200, color: { dark: '#1A1A1A', light: '#00000000' } })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [shareLink])

  if (!shareLink) {
    return (
      <EmptyState
        icon={<Send className="h-7 w-7" />}
        title={copy.nolink_title}
        description={copy.nolink_description}
      />
    )
  }

  const message = pledgeRequestMessage(coupleName, shareLink)
  const noone = { whatsapp_phone: null, phone: null, full_name: '' }
  const waUrl = whatsappShareUrl(noone, message)
  const smsUrl = smsShareUrl(noone, message)
  const emailUrl = emailShareUrl({ email: null }, `You're invited to contribute — ${coupleName}`, message)

  const liveByChannel: Record<ShareChannel, boolean> = { whatsapp: whatsappLive, sms: smsLive, email: emailLive }
  const notSentCount = contacts.filter((c) => contactStatus(c) === 'not_sent').length
  const awaitingCount = contacts.filter((c) => contactStatus(c) === 'awaiting').length
  const searched = contactSearch.trim()
    ? contacts.filter((c) => c.full_name.toLowerCase().includes(contactSearch.trim().toLowerCase()))
    : contacts
  const visibleContacts =
    statusFilter === 'all' ? searched : searched.filter((c) => contactStatus(c) === statusFilter)
  const selectableIds = visibleContacts.filter((c) => effectiveChannel(c) !== null).map((c) => c.id)
  const allVisibleSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id))

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev)
        selectableIds.forEach((id) => next.delete(id))
        return next
      }
      return new Set([...prev, ...selectableIds])
    })
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function saveRowEdit() {
    if (!rowEdit) return
    const { id, name, phone, email, max_party_size } = rowEdit
    startTransition(async () => {
      try {
        await updateGuestContactInfo(id, name, phone, email, { maxPartySize: max_party_size })
        toast.success('Guest saved')
        setRowEdit(null)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save this guest')
      }
    })
  }

  function removeGuest() {
    if (!rowEdit) return
    const { id } = rowEdit
    startTransition(async () => {
      try {
        await deleteGuest(id)
        toast.success('Guest removed')
        setRowEdit(null)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove this guest')
      }
    })
  }

  /** Send to every selected contact, routed to each one's own chosen channel
   *  (their dropdown pick, or the auto-picked default) — grouped into one
   *  batched call per channel rather than N individual sends. */
  function sendSelected() {
    const targets = contacts.filter((c) => selectedIds.has(c.id))
    if (!targets.length) return
    const byChannel: Record<ShareChannel, string[]> = { whatsapp: [], sms: [], email: [] }
    for (const c of targets) {
      const ch = effectiveChannel(c)
      if (ch) byChannel[ch].push(c.id)
    }
    startBulkSend(async () => {
      try {
        const results = await Promise.all([
          byChannel.whatsapp.length
            ? sendWhatsAppPledgeRequests(byChannel.whatsapp, selectedEventId ?? undefined)
            : null,
          byChannel.sms.length ? sendSmsPledgeRequests(byChannel.sms, selectedEventId ?? undefined) : null,
          byChannel.email.length ? sendEmailPledgeRequests(byChannel.email, selectedEventId ?? undefined) : null,
        ])
        const sent = results.reduce((n, r) => n + (r?.sent ?? 0), 0)
        const skipped = results.reduce((n, r) => n + (r?.skipped ?? 0), 0)
        if (sent > 0) {
          toast.success(`Sent to ${sent} guest${sent === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped` : ''}`)
        } else {
          toast.error('Nothing sent — check these guests have a phone number or email on file')
        }
        setSelectedIds(new Set())
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Bulk send failed')
      }
    })
  }

  function addGuest() {
    if (!newGuest.name.trim()) {
      toast.error("Enter the guest's name")
      return
    }
    startSaveNewGuest(async () => {
      const res = await createGuest({
        full_name: newGuest.name.trim(),
        phone: newGuest.phone.trim() || null,
        whatsapp_phone: newGuest.phone.trim() || null,
        email: newGuest.email.trim() || null,
        max_party_size: newGuest.max_party_size,
      })
      if (res.ok) {
        toast.success('Guest added')
        setNewGuest({ name: '', phone: '', email: '', max_party_size: 1 })
        setAddingGuest(false)
      } else {
        toast.error(res.error)
      }
    })
  }

  function sendRow(id: string, ch: ShareChannel) {
    const channelLabel = SHARE_CHANNELS.find((c) => c.id === ch)!.label
    const sendFn =
      ch === 'whatsapp' ? sendWhatsAppPledgeRequests
      : ch === 'email' ? sendEmailPledgeRequests
      : sendSmsPledgeRequests
    setSendingKey(`${id}:${ch}`)
    startTransition(async () => {
      try {
        const r = await sendFn([id], selectedEventId ?? undefined)
        if (r.sent > 0) {
          toast.success(r.dryRun ? `Dry run: would send via ${channelLabel}` : `${channelLabel} pledge link sent`)
        } else if (r.skipped > 0) {
          toast.error(ch === 'email' ? 'No email on file for this contact' : 'No phone number on file for this contact')
        } else {
          toast.error('Send failed')
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Send failed')
      } finally {
        setSendingKey(null)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Pledge card image: a pledge-specific template (from the "Kadi za
          Michango" catalog, see pledgeCardCatalog below) or an uploaded
          photo, shown as the cover on the shared pledge page. Deliberately
          does not offer the couple's invitation-card design here — that's a
          different product and mixing it in confused what's actually a
          pledge-page cover vs. an invitation. */}
      <Card className="space-y-4 px-5 py-5">
        <div>
          <h3 className="text-base font-semibold text-[#1A1A1A]">Pledge Card Templates</h3>
          <p className="mt-1 text-sm text-[#1A1A1A]/55">
            Give your pledge page a designed look — pick a pledge card template below.
          </p>
        </div>

        {/* Only surfaced when a photo uploaded before this UI change is still
            set as the cover — a template's "in use" state already shows
            inline on its thumbnail below, so repeating it here for templates
            would just be the same fact said twice. */}
        {cover.url && !cover.isTemplate ? (
          <div className="flex items-start gap-3 rounded-xl border border-black/[0.12] bg-black/[0.015] p-3">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-black/[0.08]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover.url} alt="Pledge card cover" className="h-full w-full object-cover" />
            </div>
            <div className="space-y-1.5 text-sm">
              <p className="font-medium text-[#1A1A1A]">Using your uploaded photo</p>
              <button
                type="button"
                disabled={savingCover}
                onClick={() => saveCover(null, false)}
                className="text-xs font-semibold text-rose-600 underline-offset-2 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        ) : null}

        {/* Pledge card templates: the primary path, so it comes first. Real
            designs pulled from the invitation catalog, filtered to the
            "Kadi za Michango" category. Free for Elegant/Signature;
            Classic/Essential buy individual designs at TEMPLATE_CARD_PRICE
            each through the same Selcom/M-Pesa checkout the invitation
            product uses (see TemplatePurchaseModal). */}
        <div className="space-y-3">
          {pledgeCardCatalog.length ? (
            <div className="relative">
              <div className="-mx-1 grid grid-flow-col auto-cols-[42%] gap-2.5 overflow-x-auto px-1 pb-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] sm:auto-cols-[31%] md:auto-cols-[23%] lg:auto-cols-[calc((100%-5*0.625rem)/6)] [&::-webkit-scrollbar]:hidden">
                {pledgeCardCatalog.map((t) => {
                  const isApplying = applyingTemplateId === t.id && savingCover
                  const isApplied = appliedTemplateId === t.id || (cover.isTemplate && cover.url === t.imageUrl)
                  const usable = canUseTemplate(t)
                  const isPending = !usable && pendingTemplateIds.has(t.id)
                  return (
                    <div
                      key={t.id}
                      title={t.name}
                      className={cn(
                        'snap-start space-y-1.5 rounded-xl border p-2',
                        isApplied ? 'border-[#9FE870] ring-1 ring-[#9FE870]' : 'border-black/[0.12]',
                      )}
                    >
                      <div className="relative aspect-[5/7] w-full overflow-hidden rounded-lg bg-black/[0.04]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={t.imageUrl} alt={t.name} className="h-full w-full object-contain" />
                        {isPending ? (
                          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-amber-900/55 text-[10px] font-semibold text-white/95">
                            <Clock className="h-3.5 w-3.5" />
                            Under review
                          </span>
                        ) : !usable ? (
                          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 text-[10px] font-semibold text-white/95">
                            <Lock className="h-3.5 w-3.5" />
                            Locked
                          </span>
                        ) : isApplied ? (
                          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#9FE870] text-[#1A1A1A]">
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                        ) : null}
                      </div>
                      <p className="line-clamp-2 text-[11px] font-semibold leading-tight text-[#1A1A1A]" title={t.name}>
                        {t.name}
                      </p>
                      {usable ? (
                        <button
                          type="button"
                          disabled={savingCover}
                          onClick={() => (isApplied ? removeTemplate(t) : useTemplate(t))}
                          className={cn(
                            'group/btn inline-flex w-full items-center justify-center gap-1 rounded-full border px-2 py-1 text-[10.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
                            isApplied
                              ? 'border-[#9FE870] bg-[#9FE870]/20 text-[#3f6b1f] hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600'
                              : 'border-transparent bg-[#C9A0DC] text-[#1A1A1A] hover:bg-[#b97fd0]',
                          )}
                        >
                          {isApplying ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isApplied ? (
                            <Check className="h-3 w-3 group-hover/btn:hidden" />
                          ) : null}
                          {isApplied ? (
                            <>
                              <span className="group-hover/btn:hidden">Applied</span>
                              <span className="hidden group-hover/btn:inline">Remove</span>
                            </>
                          ) : (
                            'Use this template'
                          )}
                        </button>
                      ) : isPending ? (
                        <button
                          type="button"
                          disabled
                          className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[10.5px] font-semibold text-amber-800 disabled:cursor-not-allowed"
                        >
                          <Clock className="h-3 w-3" /> Payment under review
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setPurchaseTarget({
                              templateId: t.id,
                              templateName: t.name,
                              templateImageUrl: t.imageUrl,
                              templateType: 'pledge_card',
                            })
                          }
                          className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-[#1A1A1A] bg-[#1A1A1A] px-2 py-1 text-[10.5px] font-semibold text-white transition hover:bg-black/85"
                        >
                          Purchase — TZS {TEMPLATE_CARD_PRICE.toLocaleString()}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              {pledgeCardCatalog.length > 6 ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute right-0 top-0 hidden h-[calc(100%-0.25rem)] w-10 bg-gradient-to-l from-white to-transparent lg:block"
                />
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-[#1A1A1A]/45">No catalog designs available yet.</p>
          )}
        </div>
      </Card>

      {purchaseTarget ? (
        <TemplatePurchaseModal
          target={purchaseTarget}
          price={TEMPLATE_CARD_PRICE}
          eventId={selectedEventId}
          contact={{ name: coupleName, email: contactEmail, phone: contactPhone }}
          returnPath={`/my/dashboard/pledges${selectedEventId ? `?event=${selectedEventId}` : ''}`}
          formStrings={checkoutFormStrings}
          paymentStrings={checkoutPaymentStrings}
          onClose={() => setPurchaseTarget(null)}
          onPurchaseSubmitted={(result) => {
            if (result.status === 'paid') {
              setPurchasedIds((prev) => new Set(prev).add(purchaseTarget.templateId))
              setCelebrateAt(Date.now())
            }
            if (result.status === 'processing') {
              setPendingTemplateIds((prev) => new Set(prev).add(purchaseTarget.templateId))
            }
            if (result.order) setSummaryOrder(result.order)
            setPurchaseTarget(null)
          }}
        />
      ) : null}

      {celebrateAt ? <Confetti key={celebrateAt} /> : null}

      {summaryOrder ? <PaymentSummaryModal order={summaryOrder} onClose={() => setSummaryOrder(null)} /> : null}

      {cover.isTemplate ? (
      <>
      {/* Broad share: the applied card leads so it's obvious what guests will
          see, then the link + every hand-off channel sit alongside it. */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="relative aspect-[5/7] w-full shrink-0 overflow-hidden bg-black/[0.04] sm:aspect-auto sm:w-40 md:w-48">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover.url ?? ''} alt="Your pledge card cover" className="h-full w-full object-cover" />
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-[#3f6b1f] shadow-sm">
              <Check className="h-3 w-3" strokeWidth={3} /> Your pledge card
            </span>
          </div>

          <div className="min-w-0 flex-1 space-y-4 p-5">
            <div className="space-y-3 sm:flex sm:items-start sm:justify-between sm:gap-3 sm:space-y-0">
              <div className="min-w-0 sm:flex-1">
                <h3 className="text-base font-semibold text-[#1A1A1A]">{copy.share_title}</h3>
                <p className="mt-1 text-sm text-[#1A1A1A]/55">{copy.share_description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <a
                  href={shareLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-[#1A1A1A]/25 bg-white px-4 py-2 text-sm font-bold text-[#1A1A1A] transition hover:bg-black/[0.03]"
                >
                  <ExternalLink className="h-4 w-4" /> Preview as guest
                </a>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 basis-64 truncate rounded-xl border border-black/[0.12] bg-white px-3 py-2.5 text-sm text-[#1A1A1A]/80">
                {shareLink.replace(/^https?:\/\//, '')}
              </div>
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black/[0.18] bg-white px-4 py-2.5 text-sm font-semibold text-[#1A1A1A] hover:bg-black/[0.03]"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3.5 py-2.5 text-sm font-semibold text-white hover:brightness-95"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
              <a
                href={smsUrl}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-black/[0.14] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#1A1A1A] hover:bg-black/[0.03]"
              >
                <Smartphone className="h-4 w-4" /> SMS
              </a>
              <a
                href={emailUrl}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-black/[0.14] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#1A1A1A] hover:bg-black/[0.03]"
              >
                <Mail className="h-4 w-4" /> Email
              </a>

              {/* QR for the link — pushed to the row's right end, doubles as
                  something printable for a physical table card at the wedding. */}
              {qrDataUrl ? (
                <div className="ml-auto flex shrink-0 items-center gap-3 rounded-xl border border-black/[0.1] bg-black/[0.015] p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR code for the pledge link" className="h-16 w-16 shrink-0" />
                  <div className="space-y-1 text-xs text-[#1A1A1A]/55">
                    <p className="font-semibold text-[#1A1A1A]">Scan to open</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      {/* Targeted send: pick contacts, bulk-select for a batched "Send to
          selected", or send row-by-row via each guest's own channel buttons.
          Meta-approved for WhatsApp; SMS/Email run as a dry run until their
          providers go live. Sent/Awaiting status is real — see
          pledge_invite_sent_at on guest_contacts. */}
      <Card className="space-y-5 px-5 py-5">
        <div>
          <h3 className="text-base font-semibold text-[#1A1A1A]">Send to your guests</h3>
          <p className="mt-1 text-sm text-[#1A1A1A]/55">
            Send each guest their pledge link via WhatsApp, SMS, or Email — individually or in bulk.
          </p>
        </div>

        <div>
          {contacts.length === 0 ? (
            <p className="text-sm text-[#1A1A1A]/55">No saved contacts yet — add some under Guests first.</p>
          ) : (
            <div className="si">
              <style>{PLEDGE_TABLE_CSS}</style>
              <div className="gt">
                <div className="gth">
                  <h2>Guest list</h2>
                  <input
                    className="gsearch"
                    type="search"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder="Search name or number…"
                    aria-label="Search guests"
                  />
                  <div className="tabs" role="tablist" aria-label="Filter by status">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={statusFilter === 'all'}
                      className={cn('tab', statusFilter === 'all' && 'active')}
                      onClick={() => setStatusFilter('all')}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={statusFilter === 'not_sent'}
                      className={cn('tab', statusFilter === 'not_sent' && 'active')}
                      onClick={() => setStatusFilter('not_sent')}
                    >
                      Not sent {notSentCount}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={statusFilter === 'awaiting'}
                      className={cn('tab', statusFilter === 'awaiting' && 'active')}
                      onClick={() => setStatusFilter('awaiting')}
                    >
                      Awaiting {awaitingCount}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="addbtn"
                    disabled={pending}
                    onClick={() => setAddingGuest((v) => !v)}
                  >
                    <Plus size={14} /> Add guest
                  </button>
                  <button
                    type="button"
                    className="bulkbtn"
                    disabled={selectedIds.size === 0 || bulkSending}
                    onClick={sendSelected}
                  >
                    {bulkSending ? <Loader2 size={14} className="spin" /> : null}
                    Send to selected {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                    <Send size={13} />
                  </button>
                </div>
                {visibleContacts.length === 0 && !addingGuest ? (
                  <div className="empty">No guests match your search</div>
                ) : (
                  <div className="scroll">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 36 }}>
                            <input
                              type="checkbox"
                              checked={allVisibleSelected}
                              onChange={toggleSelectAll}
                              disabled={selectableIds.length === 0}
                              aria-label="Select all"
                            />
                          </th>
                          <th>Guest</th>
                          <th>Contact</th>
                          <th>Card Type</th>
                          <th>Preferred channel</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Send</th>
                        </tr>
                      </thead>
                      <tbody>
                        {addingGuest ? (
                          <tr>
                            <td />
                            <td className="who">
                              <input
                                className="einp"
                                autoFocus
                                placeholder="Name"
                                value={newGuest.name}
                                onChange={(e) => setNewGuest({ ...newGuest, name: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') addGuest()
                                  if (e.key === 'Escape') setAddingGuest(false)
                                }}
                              />
                            </td>
                            <td className="contact">
                              <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                  className="einp"
                                  placeholder="Phone"
                                  value={newGuest.phone}
                                  onChange={(e) => setNewGuest({ ...newGuest, phone: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') addGuest()
                                    if (e.key === 'Escape') setAddingGuest(false)
                                  }}
                                  inputMode="tel"
                                />
                                <input
                                  className="einp"
                                  placeholder="Email"
                                  value={newGuest.email}
                                  onChange={(e) => setNewGuest({ ...newGuest, email: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') addGuest()
                                    if (e.key === 'Escape') setAddingGuest(false)
                                  }}
                                  inputMode="email"
                                />
                              </div>
                            </td>
                            <td>
                              <select
                                className="einp"
                                value={newGuest.max_party_size}
                                onChange={(e) =>
                                  setNewGuest({ ...newGuest, max_party_size: ticketPartyFor(Number(e.target.value)) })
                                }
                                aria-label="Card Type"
                              >
                                {TICKET_TYPES.map(({ size, label }) => (
                                  <option key={size} value={size}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td />
                            <td />
                            <td>
                              <div className="ra">
                                <button className="ia save" disabled={savingNewGuest} onClick={addGuest}>
                                  {savingNewGuest ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Save
                                </button>
                                <button className="ia" onClick={() => setAddingGuest(false)} title="Cancel">
                                  <X size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                        {visibleContacts.map((c) =>
                          rowEdit?.id === c.id ? (
                            <tr key={c.id}>
                              <td />
                              <td className="who">
                                <input
                                  className="einp"
                                  autoFocus
                                  value={rowEdit.name}
                                  onChange={(e) => setRowEdit({ ...rowEdit, name: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveRowEdit()
                                    if (e.key === 'Escape') setRowEdit(null)
                                  }}
                                />
                              </td>
                              <td className="contact">
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <input
                                    className="einp"
                                    placeholder="Phone"
                                    value={rowEdit.phone}
                                    onChange={(e) => setRowEdit({ ...rowEdit, phone: e.target.value })}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveRowEdit()
                                      if (e.key === 'Escape') setRowEdit(null)
                                    }}
                                    inputMode="tel"
                                  />
                                  <input
                                    className="einp"
                                    placeholder="Email"
                                    value={rowEdit.email}
                                    onChange={(e) => setRowEdit({ ...rowEdit, email: e.target.value })}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveRowEdit()
                                      if (e.key === 'Escape') setRowEdit(null)
                                    }}
                                    inputMode="email"
                                  />
                                </div>
                              </td>
                              <td>
                                <select
                                  className="einp"
                                  value={rowEdit.max_party_size}
                                  onChange={(e) =>
                                    setRowEdit({ ...rowEdit, max_party_size: ticketPartyFor(Number(e.target.value)) })
                                  }
                                  aria-label="Card Type"
                                >
                                  {TICKET_TYPES.map(({ size, label }) => (
                                    <option key={size} value={size}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td />
                              <td />
                              <td>
                                <div className="ra">
                                  <button className="ia save" disabled={pending} onClick={saveRowEdit}>
                                    <Check size={14} /> Save
                                  </button>
                                  <button
                                    className="ia danger"
                                    disabled={pending}
                                    title="Delete guest"
                                    onClick={() => (rowEdit.askDelete ? removeGuest() : setRowEdit({ ...rowEdit, askDelete: true }))}
                                  >
                                    <Trash2 size={14} />
                                    {rowEdit.askDelete ? 'Confirm' : null}
                                  </button>
                                  <button className="ia" disabled={pending} onClick={() => setRowEdit(null)} title="Cancel">
                                    <X size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            (() => {
                              const phone = c.whatsapp_phone || c.phone
                              const channel = effectiveChannel(c)
                              const status = contactStatus(c)
                              const isSendingChannel = channel !== null && sendingKey === `${c.id}:${channel}`
                              return (
                                <tr key={c.id}>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={selectedIds.has(c.id)}
                                      onChange={() => toggleSelect(c.id)}
                                      disabled={!channel}
                                      aria-label={`Select ${c.full_name}`}
                                    />
                                  </td>
                                  <td className="who">{c.full_name}</td>
                                  <td className="contact">{phone || c.email || 'No contact'}</td>
                                  <td>
                                    <span className="pill pill-card">{cardTypeLabel(c.max_party_size)}</span>
                                  </td>
                                  <td style={{ position: 'relative' }}>
                                    {channel ? (
                                      <div data-channel-menu style={{ position: 'relative', display: 'inline-block' }}>
                                        <button
                                          type="button"
                                          className={cn('pillselect', `pill-${channel}`)}
                                          onClick={() =>
                                            setChannelMenuOpenId((id) => (id === c.id ? null : c.id))
                                          }
                                          aria-haspopup="listbox"
                                          aria-expanded={channelMenuOpenId === c.id}
                                          aria-label={`Send channel for ${c.full_name}`}
                                        >
                                          {(() => {
                                            const Icon = SHARE_CHANNELS.find((s) => s.id === channel)!.icon
                                            return <Icon size={12} />
                                          })()}
                                          {SHARE_CHANNELS.find((s) => s.id === channel)!.label}
                                        </button>
                                        {channelMenuOpenId === c.id ? (
                                          <div className="chmenu" role="listbox">
                                            {SHARE_CHANNELS.map((s) => {
                                              const Icon = s.icon
                                              const usable = contactHasChannel(c, s.id)
                                              return (
                                                <button
                                                  key={s.id}
                                                  type="button"
                                                  role="option"
                                                  aria-selected={channel === s.id}
                                                  disabled={!usable}
                                                  className={cn('chmenu-item', channel === s.id && 'active')}
                                                  onClick={() => {
                                                    setChannelChoice((prev) => ({ ...prev, [c.id]: s.id }))
                                                    setChannelMenuOpenId(null)
                                                  }}
                                                >
                                                  <Icon size={13} />
                                                  {s.label}
                                                  {!usable ? (
                                                    <span className="chmenu-hint">
                                                      no {s.id === 'email' ? 'email' : 'phone'}
                                                    </span>
                                                  ) : null}
                                                </button>
                                              )
                                            })}
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <span className="pill pill-none">No contact</span>
                                    )}
                                  </td>
                                  <td>
                                    <span className={cn('status', `status-${status}`)}>
                                      {CONTACT_STATUS_LABELS[status]}
                                    </span>
                                  </td>
                                  <td>
                                    <div className="ra">
                                      {channel ? (
                                        <button
                                          className="ia ia-primary ia-whatsapp"
                                          disabled={pending}
                                          title={`Send via ${SHARE_CHANNELS.find((s) => s.id === channel)!.label}`}
                                          onClick={() => sendRow(c.id, channel)}
                                        >
                                          {isSendingChannel ? (
                                            <Loader2 size={14} className="spin" />
                                          ) : (
                                            <Send size={13} />
                                          )}
                                          Send
                                        </button>
                                      ) : null}
                                      <button className="ia" disabled={pending} title="Copy pledge link" onClick={onCopy}>
                                        <Copy size={15} />
                                      </button>
                                      <button
                                        className="ia"
                                        disabled={pending}
                                        title="Edit guest"
                                        onClick={() =>
                                          setRowEdit({
                                            id: c.id,
                                            name: c.full_name,
                                            phone: phone ?? '',
                                            email: c.email ?? '',
                                            max_party_size: ticketPartyFor(c.max_party_size),
                                            askDelete: false,
                                          })
                                        }
                                      >
                                        <Pencil size={14} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })()
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
      </>
      ) : null}
    </div>
  )
}


// ──────────────────────────────── follow-ups ────────────────────────────────

function FollowUpsSection({
  pledges,
  onWa,
  onSms,
  onEmail,
  onRecord,
  copy,
  sendingKey,
}: {
  pledges: PledgeWithContact[]
  onWa: (p: PledgeWithContact) => void
  onSms: (p: PledgeWithContact) => void
  onEmail: (p: PledgeWithContact) => void
  onRecord: (p: PledgeWithContact) => void
  copy: PledgesDashboardCopy
  sendingKey: string | null
}) {
  // Everyone still owing money, due-first (overdue and scheduled-due at the top).
  const owing = pledges.filter((p) => OWING.includes(p.status))
  const sorted = [...owing].sort((a, b) => {
    const ad = isReminderDue(a) ? 0 : 1
    const bd = isReminderDue(b) ? 0 : 1
    if (ad !== bd) return ad - bd
    const at = a.promised_date ? new Date(a.promised_date).getTime() : Infinity
    const bt = b.promised_date ? new Date(b.promised_date).getTime() : Infinity
    return at - bt
  })

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks className="h-7 w-7" />}
        title={copy.followups_empty_title}
        description={copy.followups_empty_description}
      />
    )
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
        <thead>
          <tr className="border-b border-black/[0.06]">
            <Th>Contributor</Th>
            <Th>Owing</Th>
            <Th>Due</Th>
            <Th>Reminders</Th>
            <Th>Cadence</Th>
            <th className="w-1 py-3 pr-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.05]">
          {sorted.map((p) => {
            const days = daysUntil(p.promised_date)
            const due = isReminderDue(p)
            const owingAmt = Math.max(0, p.pledged_amount - p.amount_received)
            return (
              <tr key={p.id} className={cn('align-middle hover:bg-black/[0.02]', due && 'bg-amber-50/40')}>
                <td className="py-3.5 pr-4">
                  <div className="flex items-center gap-2">
                    {due ? <BellRing className="h-4 w-4 shrink-0 text-amber-600" aria-label="Due" /> : null}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[#1A1A1A]">{p.full_name}</p>
                      <p className="text-xs text-[#1A1A1A]/50">{PLEDGE_STATUS_LABELS[p.status]}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3.5 pr-4 font-medium text-[#1A1A1A]/80">
                  {formatMoney(owingAmt, p.currency)}
                </td>
                <td className="py-3.5 pr-4">
                  {p.promised_date ? (
                    <div className="text-xs leading-snug">
                      <div className="text-[#1A1A1A]/80">{formatDueDate(p.promised_date)}</div>
                      {days !== null ? (
                        <div className={cn(days < 0 ? 'font-medium text-rose-600' : 'text-[#1A1A1A]/50')}>
                          {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'today' : `in ${days}d`}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs text-[#1A1A1A]/35">No date</span>
                  )}
                </td>
                <td className="py-3.5 pr-4">
                  {p.reminder_count === 0 ? (
                    <span className="text-xs text-[#1A1A1A]/45">None sent</span>
                  ) : (
                    <div className="text-xs leading-snug">
                      <div className="text-[#1A1A1A]/80">{p.reminder_count} sent</div>
                      {p.last_reminded_at ? (
                        <div className="text-[#1A1A1A]/50">last {formatDueDate(p.last_reminded_at)}</div>
                      ) : null}
                    </div>
                  )}
                </td>
                <td className="py-3.5 pr-4">
                  <span className="text-xs text-[#1A1A1A]/65">{CADENCE_LABELS[p.reminder_cadence]}</span>
                </td>
                <td className="py-3.5 pr-3 text-right">
                  <div className="inline-flex items-center justify-end gap-1">
                    <ReminderButtons p={p} onWa={onWa} onSms={onSms} onEmail={onEmail} sendingKey={sendingKey} />
                    <button
                      onClick={() => onRecord(p)}
                      aria-label="Record payment"
                      title="Record a payment"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50"
                    >
                      <Banknote className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

// ──────────────────────────────── reports ────────────────────────────────

function ReportsSection({
  pledges,
  stats,
  goalAmount,
  weddingDate,
  onExport,
  onPrint,
  onChaseFollowups,
  onViewAwaiting,
  copy,
}: {
  pledges: PledgeWithContact[]
  stats: PledgeStats
  goalAmount: number | null
  weddingDate: string | null
  onExport: () => void
  onPrint: () => void
  onChaseFollowups: () => void
  onViewAwaiting: () => void
  copy: PledgesDashboardCopy
}) {
  const collectionRate =
    stats.totalPledged > 0 ? Math.round((stats.totalReceived / stats.totalPledged) * 100) : 0

  // All the reduces below pool amounts across pledges that may each be in a
  // different currency, so every amount is converted to TZS before adding.
  const byStatus = (Object.keys(PLEDGE_STATUS_LABELS) as PledgeStatus[]).map((s) => {
    const rows = pledges.filter((p) => p.status === s)
    return {
      label: PLEDGE_STATUS_LABELS[s],
      count: rows.length,
      pledged: rows.reduce((n, p) => n + toTzs(p.pledged_amount, p.currency), 0),
      received: rows.reduce((n, p) => n + toTzs(p.amount_received, p.currency), 0),
    }
  })

  const byMethod = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[])
    .map((m) => {
      const rows = pledges.filter((p) => p.payment_method === m && p.amount_received > 0)
      return {
        label: PAYMENT_METHOD_LABELS[m],
        count: rows.length,
        received: rows.reduce((n, p) => n + toTzs(p.amount_received, p.currency), 0),
      }
    })
    .filter((r) => r.count > 0)

  const byGroup = Object.entries(
    pledges.reduce<Record<string, { pledged: number; received: number; count: number }>>((acc, p) => {
      const key = p.group_tag?.trim() || 'Ungrouped'
      const g = acc[key] ?? { pledged: 0, received: 0, count: 0 }
      g.pledged += toTzs(p.pledged_amount, p.currency)
      g.received += toTzs(p.amount_received, p.currency)
      g.count += 1
      acc[key] = g
      return acc
    }, {}),
  ).sort((a, b) => b[1].received - a[1].received)

  const byCardType = TICKET_TYPES.map(({ size }) => {
    const rows = pledges.filter((p) => ticketPartyFor(p.max_party_size) === size)
    return {
      label: cardTypeLabel(size),
      count: rows.length,
      pledged: rows.reduce((n, p) => n + toTzs(p.pledged_amount, p.currency), 0),
      received: rows.reduce((n, p) => n + toTzs(p.amount_received, p.currency), 0),
    }
  })

  const totalReminders = pledges.reduce((n, p) => n + p.reminder_count, 0)
  const aging = outstandingAging(pledges)

  // ── Chart datasets ──
  const trendPoints = cumulativePledgedByDay(pledges)
  const funnelStages = [
    { label: 'Contributors', value: pledges.filter((p) => p.status !== 'declined').length, color: '#C9A0DC' },
    {
      label: 'Pledged',
      value: pledges.filter((p) => p.status === 'pledged' || p.status === 'partial' || p.status === 'paid').length,
      color: '#b388d4',
    },
    {
      label: 'Partly or fully paid',
      value: pledges.filter((p) => p.status === 'partial' || p.status === 'paid').length,
      color: '#7EC8C0',
    },
    { label: 'Fully paid', value: stats.paidCount, color: '#9FE870' },
  ]
  const methodChart = byMethod.map((m) => ({ label: m.label, value: m.received, note: `${m.count}` }))
  const groupChart = byGroup.map(([name, g]) => ({
    label: name,
    value: g.pledged > 0 ? Math.round((g.received / g.pledged) * 100) : 0,
    note: formatMoney(g.received, 'TZS'),
  }))
  const overdueAmount = aging.filter((b) => b.key.startsWith('over')).reduce((n, b) => n + b.amount, 0)
  const awaitingCount = pledges.filter((p) => p.status === 'invited').length
  const top = topContributors(pledges, 10)

  // Pledge-amount mix (count-based fulfillment + average / largest), pooled
  // in TZS since `contributing` can span multiple currencies.
  const contributing = pledges.filter((p) => p.status !== 'declined' && p.pledged_amount > 0)
  const avgPledge = contributing.length
    ? Math.round(
        contributing.reduce((n, p) => n + toTzs(p.pledged_amount, p.currency), 0) / contributing.length,
      )
    : 0
  const largestPledge = contributing.reduce((m, p) => Math.max(m, toTzs(p.pledged_amount, p.currency)), 0)
  const fulfillmentRate = stats.totalPledges > 0 ? Math.round((stats.paidCount / stats.totalPledges) * 100) : 0

  // Goal progress.
  const hasGoal = !!goalAmount && goalAmount > 0
  const receivedPct = hasGoal ? Math.min(100, Math.round((stats.totalReceived / goalAmount!) * 100)) : 0
  const pledgedPct = hasGoal ? Math.min(100, Math.round((stats.totalPledged / goalAmount!) * 100)) : 0
  const daysToWedding = daysUntil(weddingDate)
  const paceLine =
    daysToWedding === null
      ? null
      : daysToWedding > 0
        ? `${daysToWedding} ${daysToWedding === 1 ? 'day' : 'days'} until the wedding`
        : daysToWedding === 0
          ? 'The wedding is today'
          : `${Math.abs(daysToWedding)} ${Math.abs(daysToWedding) === 1 ? 'day' : 'days'} since the wedding`

  if (pledges.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-7 w-7" />}
        title={copy.reports_empty_title}
        description={copy.reports_empty_description}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#1A1A1A]/60">
          Contribution summary across {pledges.length} {pledges.length === 1 ? 'pledge' : 'pledges'}.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {overdueAmount > 0 ? (
            <Button variant="secondary" onClick={onChaseFollowups}>
              <BellRing className="h-4 w-4" /> Chase follow-ups
            </Button>
          ) : null}
          {awaitingCount > 0 ? (
            <Button variant="secondary" onClick={onViewAwaiting}>
              <HandCoins className="h-4 w-4" /> View awaiting ({awaitingCount})
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onPrint}>
            <BarChart3 className="h-4 w-4" /> Print summary
          </Button>
          <Button variant="secondary" onClick={onExport}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Fundraising goal + progress */}
      {hasGoal ? (
        <Card className="px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-[#1A1A1A]">Fundraising goal</p>
            <p className="text-sm text-[#1A1A1A]/60">
              {formatMoney(stats.totalReceived, 'TZS')} of {formatMoney(goalAmount!, 'TZS')}
            </p>
          </div>
          <div className="relative mt-3 h-3 w-full overflow-hidden rounded-full bg-black/[0.06]">
            {/* Pledged (committed) underlay, with collected on top. */}
            <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-200" style={{ width: `${pledgedPct}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: `${receivedPct}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            <span className="font-semibold text-emerald-700">{receivedPct}% collected</span>
            <span className="text-[#1A1A1A]/55">
              {pledgedPct}% pledged{paceLine ? ` · ${paceLine}` : ''}
            </span>
          </div>
        </Card>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
          <p className="text-sm text-[#1A1A1A]/60">
            Set a fundraising goal to track progress toward a target.
          </p>
          <Link
            href="/my/dashboard/settings"
            className="text-sm font-semibold text-[#1A1A1A] underline-offset-2 hover:underline"
          >
            Set a goal →
          </Link>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Total pledged" value={formatMoney(stats.totalPledged, 'TZS')} />
        <SummaryTile label="Received" value={formatMoney(stats.totalReceived, 'TZS')} accent="green" />
        <SummaryTile
          label="Outstanding"
          value={formatMoney(stats.outstanding, 'TZS')}
          accent="amber"
          hint={overdueAmount > 0 ? `${formatMoney(overdueAmount, 'TZS')} overdue` : undefined}
        />
        <SummaryTile
          label="Collection rate"
          value={`${collectionRate}%`}
          hint={`${stats.paidCount} of ${stats.totalPledges} paid (${fulfillmentRate}%)`}
        />
      </div>

      <ReportTable
        title="By status"
        head={['Status', 'Count', 'Pledged', 'Received']}
        rows={byStatus.map((r) => [r.label, String(r.count), formatMoney(r.pledged, 'TZS'), formatMoney(r.received, 'TZS')])}
      />

      <ReportTable
        title="By card type"
        head={['Card type', 'Count', 'Pledged', 'Received']}
        rows={byCardType.map((r) => [r.label, String(r.count), formatMoney(r.pledged, 'TZS'), formatMoney(r.received, 'TZS')])}
      />

      {/* Charts */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Pledges over time" subtitle="Cumulative committed amount">
          <LineChart points={trendPoints} format={(n) => formatMoney(n, 'TZS')} />
        </ChartCard>
        <ChartCard title="Contribution funnel" subtitle="Where contributors are in the journey">
          <Funnel stages={funnelStages} />
        </ChartCard>
        {methodChart.length > 0 ? (
          <ChartCard title="Received by payment method">
            <BarRows rows={methodChart} accent="#9FE870" format={(n) => formatMoney(n, 'TZS')} />
          </ChartCard>
        ) : null}
        {groupChart.length > 1 ? (
          <ChartCard title="Collection rate by group" subtitle="Received vs pledged">
            <BarRows rows={groupChart} accent="#7EC8C0" format={(n) => `${n}%`} />
          </ChartCard>
        ) : null}
      </div>

      {/* Outstanding by age — who to chase first */}
      {aging.length > 0 ? (
        <ReportTable
          title="Outstanding by age"
          head={['Age', 'Count', 'Outstanding']}
          rows={aging.map((b) => [b.label, String(b.count), formatMoney(b.amount, 'TZS')])}
        />
      ) : null}

      {/* Top contributors */}
      {top.length > 0 ? (
        <ReportTable
          title="Top contributors"
          head={['Contributor', 'Card type', 'Pledged', 'Received']}
          rows={top.map((p) => [
            p.full_name,
            cardTypeLabel(p.max_party_size),
            formatMoney(p.pledged_amount, p.currency),
            formatMoney(p.amount_received, p.currency),
          ])}
        />
      ) : null}

      {byMethod.length > 0 ? (
        <ReportTable
          title="Received by payment method"
          head={['Method', 'Payments', 'Received']}
          rows={byMethod.map((r) => [r.label, String(r.count), formatMoney(r.received, 'TZS')])}
        />
      ) : null}

      <ReportTable
        title="By group"
        head={['Group', 'Pledges', 'Pledged', 'Received', 'Rate']}
        rows={byGroup.map(([name, g]) => [
          name,
          String(g.count),
          formatMoney(g.pledged, 'TZS'),
          formatMoney(g.received, 'TZS'),
          `${g.pledged > 0 ? Math.round((g.received / g.pledged) * 100) : 0}%`,
        ])}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="Average pledge" value={formatMoney(avgPledge, 'TZS')} />
        <SummaryTile label="Largest pledge" value={formatMoney(largestPledge, 'TZS')} />
        <SummaryTile
          label="Confirmed coming"
          value={String(stats.attendingCount)}
          hint={stats.attendingCount === 0 ? 'No one has confirmed yet' : undefined}
        />
        <SummaryTile
          label="Reminders sent"
          value={String(totalReminders)}
          hint={totalReminders === 0 ? 'No reminders sent yet' : undefined}
        />
      </div>
    </div>
  )
}

function SummaryTile({
  label,
  value,
  accent,
  hint,
}: {
  label: string
  value: string
  accent?: 'green' | 'amber'
  hint?: string
}) {
  return (
    <Card className="px-4 py-3">
      <div className="text-xs font-medium text-[#1A1A1A]/55">{label}</div>
      <div
        className={cn(
          'mt-1 text-lg font-semibold leading-tight tracking-tight',
          accent === 'green' ? 'text-emerald-700' : accent === 'amber' ? 'text-amber-700' : 'text-[#1A1A1A]',
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-[#1A1A1A]/45">{hint}</div> : null}
    </Card>
  )
}

function ReportTable({
  title,
  head,
  rows,
}: {
  title: string
  head: string[]
  rows: string[][]
}) {
  return (
    <Card className="overflow-x-auto">
      <div className="px-5 pt-4 text-sm font-semibold text-[#1A1A1A]">{title}</div>
      <table className="mt-2 w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="border-b border-black/[0.06]">
            {head.map((h, i) => (
              <th
                key={h}
                className={cn(
                  'px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/55',
                  i > 0 && 'text-right',
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.05]">
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  className={cn(
                    'px-5 py-2.5',
                    ci === 0 ? 'text-[#1A1A1A]' : 'text-right tabular-nums text-[#1A1A1A]/75',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function PledgeSlideover({
  open,
  form,
  setForm,
  contacts,
  pending,
  onClose,
  onSave,
}: {
  open: boolean
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  contacts: ContactLite[]
  pending: boolean
  onClose: () => void
  onSave: () => void
}) {
  const isEdit = Boolean(form.id)
  return (
    <Slideover
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit pledge' : 'Add pledge'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add pledge'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Contributor */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-[#1A1A1A]">Contributor</h4>
          {!isEdit ? (
            <div className="flex gap-2">
              <ModeChip active={form.mode === 'new'} onClick={() => setForm((f) => ({ ...f, mode: 'new' }))}>
                New person
              </ModeChip>
              <ModeChip
                active={form.mode === 'existing'}
                onClick={() => setForm((f) => ({ ...f, mode: 'existing' }))}
              >
                From guest list
              </ModeChip>
            </div>
          ) : null}

          {!isEdit && form.mode === 'existing' ? (
            <Field label="Pick a contributor">
              <select
                className={inputClass}
                value={form.guestContactId}
                onChange={(e) => {
                  const contact = contacts.find((c) => c.id === e.target.value)
                  setForm((f) => ({
                    ...f,
                    guestContactId: e.target.value,
                    max_party_size: contact ? ticketPartyFor(contact.max_party_size) : 1,
                  }))
                }}
              >
                <option value="">Select…</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <>
              <Field label="Full name *">
                <input
                  className={inputClass}
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="e.g. Mzee Juma Said"
                />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Mobile / WhatsApp">
                  <input
                    className={inputClass}
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value, whatsapp_phone: e.target.value }))}
                    placeholder="07XX XXX XXX"
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    className={inputClass}
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="you@example.com"
                  />
                </Field>
              </div>
              <Field label="Group" hint="Optional">
                <input
                  className={inputClass}
                  value={form.group_tag}
                  onChange={(e) => setForm((f) => ({ ...f, group_tag: e.target.value }))}
                  placeholder="e.g. Family, Friends, Office"
                />
              </Field>
            </>
          )}
          <Field label="Card Type">
            <div className="grid grid-cols-3 gap-2">
              {TICKET_TYPES.map(({ size, label }) => (
                <ModeChip
                  key={size}
                  active={ticketPartyFor(form.max_party_size) === size}
                  onClick={() => setForm((f) => ({ ...f, max_party_size: size }))}
                >
                  {label}
                </ModeChip>
              ))}
            </div>
          </Field>
        </section>

        {/* The pledge */}
        <section className="space-y-3 border-t border-black/[0.06] pt-5">
          <h4 className="text-sm font-semibold text-[#1A1A1A]">The pledge</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[110px_1fr]">
            <Field label="Currency">
              <select
                className={inputClass}
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              >
                {PLEDGE_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount pledged">
              <input
                type="number"
                min="0"
                className={inputClass}
                value={form.pledged_amount}
                onChange={(e) => setForm((f) => ({ ...f, pledged_amount: e.target.value }))}
                placeholder="e.g. 200000"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Amount received">
              <input
                type="number"
                min="0"
                className={inputClass}
                value={form.amount_received}
                onChange={(e) => setForm((f) => ({ ...f, amount_received: e.target.value }))}
                placeholder="0"
              />
            </Field>
            <Field label="Promised by">
              <input
                type="date"
                className={inputClass}
                value={form.promised_date}
                onChange={(e) => setForm((f) => ({ ...f, promised_date: e.target.value }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Status">
              <select
                className={inputClass}
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PledgeStatus }))}
              >
                {(Object.keys(PLEDGE_STATUS_LABELS) as PledgeStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {PLEDGE_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payment method">
              <select
                className={inputClass}
                value={form.payment_method}
                onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value as PaymentMethod | '' }))}
              >
                <option value="">—</option>
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Reminders" hint="Schedule follow-ups; we’ll surface them when due.">
            <select
              className={inputClass}
              value={form.reminder_cadence}
              onChange={(e) => setForm((f) => ({ ...f, reminder_cadence: e.target.value as ReminderCadence }))}
            >
              {(Object.keys(CADENCE_LABELS) as ReminderCadence[]).map((c) => (
                <option key={c} value={c}>
                  {CADENCE_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
        </section>

        {/* Attendance + card */}
        <section className="space-y-3 border-t border-black/[0.06] pt-5">
          <h4 className="text-sm font-semibold text-[#1A1A1A]">Attendance & card</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Coming to the event?">
              <select
                className={inputClass}
                value={form.will_attend}
                onChange={(e) => setForm((f) => ({ ...f, will_attend: e.target.value as AttendanceAnswer | '' }))}
              >
                <option value="">Not confirmed</option>
                {(Object.keys(ATTENDANCE_LABELS) as AttendanceAnswer[]).map((a) => (
                  <option key={a} value={a}>
                    {ATTENDANCE_LABELS[a]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Card progress">
              <select
                className={inputClass}
                value={form.card_status}
                onChange={(e) => setForm((f) => ({ ...f, card_status: e.target.value as CardStatus }))}
              >
                {(Object.keys(CARD_STATUS_LABELS) as CardStatus[]).map((c) => (
                  <option key={c} value={c}>
                    {CARD_STATUS_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Notes" hint="Optional">
            <textarea
              rows={3}
              className={inputClass}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Anything to remember about this pledge…"
            />
          </Field>
        </section>
      </div>
    </Slideover>
  )
}

function ModeChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'border-[#C9A0DC] bg-[#F0DFF6] text-[#5d3a78]'
          : 'border-black/[0.12] text-[#1A1A1A]/70 hover:bg-black/[0.04]',
      )}
    >
      {children}
    </button>
  )
}
