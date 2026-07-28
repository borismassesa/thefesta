'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Receipt, Download, Check, Clock, Wallet, ArrowRight, Ticket, Search, LayoutGrid, List } from 'lucide-react'
import { InvitationVisual } from '@/components/guests/InvitationVisual'
import { getOrders, setLastOrder, type StoredOrder, type StoredOrderItem } from '@/lib/cart-storage'
import { downloadInvoice } from '@/lib/invoice'
import { ORDER_STAGES, currentStageIndex, stageTone, type OrderStatusTone } from '@/lib/order-status'
import type { StatusResponse } from '@/lib/payments/types'
import { Card, StatCard, EmptyState } from '@/components/dashboard/primitives'
import { Button, Dialog } from '@/components/dashboard/controls'
import { cn } from '@/lib/utils'
import type { DashboardOrdersStrings } from '@/lib/cms/ui-strings-fallback'

/** Substitute `{var}` placeholders in a CMS template with dynamic values. */
const fmt = (t: string, v: Record<string, string | number>) =>
  t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m))

function formatTzs(n: number): string {
  return `TZS ${n.toLocaleString('en-US')}`
}

/** Combine the server's orders (authoritative — covers every device) with
 *  this browser's localStorage cache (may know about a just-submitted order
 *  a beat before the server snapshot picked it up). Same ref wins to the
 *  server copy, since its status is the current source of truth. */
function mergeOrders(serverOrders: StoredOrder[], localOrders: StoredOrder[]): StoredOrder[] {
  const byRef = new Map<string, StoredOrder>()
  for (const o of localOrders) byRef.set(o.ref, o)
  for (const o of serverOrders) byRef.set(o.ref, o)
  return Array.from(byRef.values()).sort(
    (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime(),
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const TONE_PILL: Record<OrderStatusTone, string> = {
  neutral: 'bg-neutral-100 text-neutral-600 ring-neutral-500/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
}

const META_PILL = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium'
const GREEN_PILL = 'bg-[#9FE870]/25 text-[#3f6b1f]'

type StatusFilterKey = 'all' | 'in_progress' | 'delivered'
const STATUS_FILTERS: { key: StatusFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'delivered', label: 'Delivered' },
]

/** Tier pill colours — mirrors the cart card and the invoice PDF swatches. */
function tierPillClass(item: StoredOrderItem): string {
  const key = (item.tierId ?? item.tier ?? '').toLowerCase()
  if (key === 'classic') return 'bg-[#EFE3FA] text-[#6B4E8C]'
  if (key === 'elegant' || key === 'signature') return 'bg-[#F5EACF] text-[#8A6B1E]'
  return 'bg-[#E1E8F0] text-[#475569]'
}

/**
 * Line-item config rendered as pills. Prefers the structured fields — the
 * stored `summary` string is a snapshot taken at add-to-cart time and can
 * carry a stale guest count if the order was edited in the cart, whereas
 * `guests`/`tier`/`addOns` are kept current. The summary split is only a
 * fallback for legacy orders stored before the structured fields existed.
 */
function ItemPills({ item, strings }: { item: StoredOrderItem; strings: DashboardOrdersStrings }) {
  const hasStructured = Boolean(item.tier) || item.guests != null || (item.addOns?.length ?? 0) > 0
  const pills = hasStructured
    ? [
        ...(item.tier ? [{ label: item.tier, className: tierPillClass(item) }] : []),
        ...(item.guests != null
          ? [
              {
                label: `${item.guests.toLocaleString('en-US')} ${strings.unit_guests}`,
                className: GREEN_PILL,
              },
            ]
          : []),
        ...(item.addOns ?? []).map((a) => ({ label: a, className: GREEN_PILL })),
      ]
    : item.summary
        .split(' · ')
        .filter(Boolean)
        .map((part) => ({ label: part, className: GREEN_PILL }))

  if (pills.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {pills.map((p) => (
        <span key={p.label} className={cn(META_PILL, p.className)}>
          {p.label}
        </span>
      ))}
    </div>
  )
}

function OrderTracker({ activeIndex }: { activeIndex: number }) {
  const last = ORDER_STAGES.length - 1
  return (
    <div className="flex items-center">
      {ORDER_STAGES.map((stage, i) => {
        const done = i < activeIndex
        const current = i === activeIndex
        return (
          <Fragment key={stage.id}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1 ring-inset',
                  done && 'bg-[#9FE870] text-[#1A1A1A] ring-[#9FE870]',
                  current && 'bg-[#1A1A1A]/10 text-[#1A1A1A] ring-[#1A1A1A]/30',
                  !done && !current && 'bg-black/[0.04] text-[#1A1A1A]/40 ring-black/10',
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  'hidden text-xs font-medium sm:inline',
                  done || current ? 'text-[#1A1A1A]' : 'text-[#1A1A1A]/45',
                )}
              >
                {stage.label}
              </span>
            </div>
            {i < last && (
              <span
                className={cn(
                  'mx-2 h-px flex-1 rounded-full',
                  i < activeIndex ? 'bg-[#1A1A1A]' : 'bg-black/10',
                )}
              />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}

function OrderCard({ order, strings }: { order: StoredOrder; strings: DashboardOrdersStrings }) {
  const idx = currentStageIndex(order)
  const stage = ORDER_STAGES[idx]
  const tone = stageTone(stage.id)
  const itemCount = order.items.length

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-4">
        <div className="flex items-baseline gap-3">
          <span className="font-bold text-[#1A1A1A]">#{order.ref}</span>
          <span className="text-xs text-[#1A1A1A]/50">{formatDate(order.paidAt)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
              TONE_PILL[tone],
            )}
          >
            {stage.label}
          </span>
          <span className="text-sm font-bold text-[#1A1A1A] tabular-nums">{formatTzs(order.total)}</span>
        </div>
      </div>

      {/* Items */}
      <div className="divide-y divide-black/[0.05]">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-5 py-3">
            <div className="relative aspect-[5/7] w-10 shrink-0 overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/5">
              {item.image ? (
                <Image src={item.image} alt="" fill sizes="40px" className="object-cover" unoptimized />
              ) : item.treatment ? (
                <InvitationVisual treatment={item.treatment} />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#C9A0DC]/20 to-[#C9A0DC]/5 text-[#7C5AA6]">
                  <Ticket className="size-4" />
                </span>
              )}
            </div>
            <div className="min-w-0 grow">
              <p className="truncate text-sm font-medium text-[#1A1A1A]">{item.name}</p>
              <ItemPills item={item} strings={strings} />
            </div>
            <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[#1A1A1A] tabular-nums">
              {formatTzs(item.total)}
            </span>
          </div>
        ))}
      </div>

      {/* Tracker */}
      <div className="border-t border-black/[0.06] px-5 py-4">
        <OrderTracker activeIndex={idx} />
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[#1A1A1A]/55">
          <Clock className="size-3.5" />
          {stage.id === 'delivered'
            ? strings.note_delivered
            : stage.id === 'payment_review'
              ? order.paymentRef
                ? fmt(strings.note_payment_review_ref, { ref: order.paymentRef })
                : strings.note_payment_review
              : strings.note_personalising}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] bg-black/[0.015] px-5 py-3">
        <div className="flex flex-wrap items-center gap-1">
          <span className={cn(META_PILL, GREEN_PILL)}>
            {itemCount} {itemCount === 1 ? strings.unit_design : strings.unit_designs}
          </span>
          {(order.paymentLabel?.split(' · ') ?? []).filter(Boolean).map((part) => (
            <span key={part} className={cn(META_PILL, GREEN_PILL)}>
              {part}
            </span>
          ))}
        </div>
        <Button variant="secondary" onClick={() => downloadInvoice(order)}>
          <Download className="size-4" /> {strings.action_invoice}
        </Button>
      </div>
    </Card>
  )
}

/** Clean order detail for the modal — no nested card, a vertical stepper that
 *  fits the dialog width, and payment info as tidy rows. */
function OrderDetail({ order, strings }: { order: StoredOrder; strings: DashboardOrdersStrings }) {
  const idx = currentStageIndex(order)
  const stage = ORDER_STAGES[idx]
  const tone = stageTone(stage.id)
  const last = ORDER_STAGES.length - 1
  const paymentParts = (order.paymentLabel?.split(' · ') ?? []).filter(Boolean)
  const note =
    stage.id === 'delivered'
      ? strings.note_delivered
      : stage.id === 'payment_review'
        ? order.paymentRef
          ? fmt(strings.note_payment_review_ref, { ref: order.paymentRef })
          : strings.note_payment_review
        : strings.note_personalising

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-[#1A1A1A]">#{order.ref}</p>
          <p className="mt-0.5 text-xs text-[#1A1A1A]/50">{formatDate(order.paidAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
              TONE_PILL[tone],
            )}
          >
            {stage.label}
          </span>
          <span className="text-lg font-bold text-[#1A1A1A] tabular-nums">{formatTzs(order.total)}</span>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-3 border-t border-black/[0.06] pt-5">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            <div className="relative aspect-[5/7] w-11 shrink-0 overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/5">
              {item.image ? (
                <Image src={item.image} alt="" fill sizes="44px" className="object-cover" unoptimized />
              ) : item.treatment ? (
                <InvitationVisual treatment={item.treatment} />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#C9A0DC]/20 to-[#C9A0DC]/5 text-[#7C5AA6]">
                  <Ticket className="size-4" />
                </span>
              )}
            </div>
            <div className="min-w-0 grow">
              <p className="truncate text-sm font-medium text-[#1A1A1A]">{item.name}</p>
              <ItemPills item={item} strings={strings} />
            </div>
            <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[#1A1A1A] tabular-nums">
              {formatTzs(item.total)}
            </span>
          </div>
        ))}
      </div>

      {/* Progress — vertical so it fits the dialog and never clips. */}
      <div className="border-t border-black/[0.06] pt-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/45">Progress</p>
        <ol>
          {ORDER_STAGES.map((s, i) => {
            const done = i < idx
            const current = i === idx
            return (
              <li key={s.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1 ring-inset',
                      done && 'bg-[#9FE870] text-[#1A1A1A] ring-[#9FE870]',
                      current && 'bg-[#1A1A1A]/10 text-[#1A1A1A] ring-[#1A1A1A]/30',
                      !done && !current && 'bg-black/[0.04] text-[#1A1A1A]/40 ring-black/10',
                    )}
                  >
                    {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  {i < last && <span className={cn('my-1 w-px flex-1', done ? 'bg-[#1A1A1A]' : 'bg-black/10')} />}
                </div>
                <span
                  className={cn(
                    'pb-4 text-sm',
                    done || current ? 'font-medium text-[#1A1A1A]' : 'text-[#1A1A1A]/45',
                  )}
                >
                  {s.label}
                </span>
              </li>
            )
          })}
        </ol>
        <p className="flex items-start gap-1.5 text-xs text-[#1A1A1A]/55">
          <Clock className="mt-0.5 size-3.5 shrink-0" />
          {note}
        </p>
      </div>

      {/* Payment / order info as tidy rows, not a pile of pills. */}
      {paymentParts.length > 0 ? (
        <div className="border-t border-black/[0.06] pt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/45">Payment</p>
          <div className="space-y-1">
            {paymentParts.map((p) => (
              <p key={p} className="text-sm text-[#1A1A1A]/80">
                {p}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Compact table view — the same orders as OrderCard, one row each, for
 *  scanning many orders at a glance. */
function OrderTable({
  orders,
  strings,
  onSelect,
}: {
  orders: StoredOrder[]
  strings: DashboardOrdersStrings
  onSelect: (order: StoredOrder) => void
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-sm">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-black/[0.06] text-left text-[11px] font-semibold uppercase tracking-wide text-[#1A1A1A]/45">
            <th className="px-4 py-3">Order</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Designs</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Total</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const stage = ORDER_STAGES[currentStageIndex(order)]
            const tone = stageTone(stage.id)
            const names = order.items.map((i) => i.name).join(', ')
            return (
              <tr
                key={order.ref}
                onClick={() => onSelect(order)}
                className="cursor-pointer border-t border-black/[0.05] hover:bg-black/[0.02]"
              >
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-[#1A1A1A]">#{order.ref}</td>
                <td className="whitespace-nowrap px-4 py-3 text-[#1A1A1A]/60">{formatDate(order.paidAt)}</td>
                <td className="max-w-[220px] truncate px-4 py-3 text-[#1A1A1A]/80">{names}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
                      TONE_PILL[tone],
                    )}
                  >
                    {stage.label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#1A1A1A] tabular-nums">
                  {formatTzs(order.total)}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      downloadInvoice(order)
                    }}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-[#7E5896] hover:text-[#5f4171]"
                  >
                    <Download className="size-4" /> {strings.action_invoice}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function OrdersManager({
  strings,
  initialOrders,
}: {
  strings: DashboardOrdersStrings
  initialOrders: StoredOrder[]
}) {
  const router = useRouter()
  const [orders, setOrders] = useState<StoredOrder[]>(initialOrders)

  // initialOrders is stable, deterministic server data — safe to render on
  // first paint. This effect only enriches it with this browser's
  // localStorage cache (e.g. an order just submitted here, a beat ahead of
  // the server snapshot), so it never causes a hydration mismatch.
  useEffect(() => {
    setOrders(mergeOrders(initialOrders, getOrders()))
  }, [initialOrders])

  // Orders are fetched server-side (the real source of truth, including any
  // admin-set fulfillment_status). The only thing that can change without a
  // fresh page load is a payment that was still under verification when this
  // page rendered — do one round of status checks (only for orders not
  // already paid) and let the server re-render with the canonical result,
  // while also updating the localStorage cache so it doesn't keep showing a
  // stale "verifying" badge elsewhere (e.g. the template-card grid).
  useEffect(() => {
    const pending = orders.filter((o) => o.paymentStatus !== 'paid')
    if (pending.length === 0) return
    let cancelled = false
    ;(async () => {
      for (const order of pending) {
        try {
          const res = await fetch(`/api/payments/status?ref=${encodeURIComponent(order.ref)}`, {
            cache: 'no-store',
          })
          if (!res.ok) continue
          const data = (await res.json()) as StatusResponse
          if (data.status === 'paid' && !cancelled) {
            setLastOrder({
              ...order,
              paidAt: data.paidAt ?? order.paidAt,
              paymentStatus: 'paid',
            })
            router.refresh()
            return
          }
        } catch {
          /* transient — leave as-is, the next visit will retry */
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders])

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all')
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [selectedOrder, setSelectedOrder] = useState<StoredOrder | null>(null)

  const stats = useMemo(() => {
    let inProgress = 0
    let delivered = 0
    let awaitingPayment = 0
    let totalSpent = 0
    for (const o of orders) {
      totalSpent += o.total
      const stageId = ORDER_STAGES[currentStageIndex(o)].id
      if (stageId === 'delivered') delivered += 1
      else inProgress += 1
      if (stageId === 'payment_review') awaitingPayment += 1
    }
    return { total: orders.length, inProgress, delivered, awaitingPayment, totalSpent }
  }, [orders])

  // Orders narrowed by the status filter (the clickable KPI cards) and the
  // search box (matches order number, any design name, or the payment ref).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((o) => {
      const delivered = ORDER_STAGES[currentStageIndex(o)].id === 'delivered'
      if (statusFilter === 'in_progress' && delivered) return false
      if (statusFilter === 'delivered' && !delivered) return false
      if (!q) return true
      return (
        o.ref.toLowerCase().includes(q) ||
        (o.paymentRef ?? '').toLowerCase().includes(q) ||
        o.items.some((i) => i.name.toLowerCase().includes(q))
      )
    })
  }, [orders, query, statusFilter])

  const kpis = [
    {
      label: 'Total spent',
      value: formatTzs(stats.totalSpent),
      hint: `Across ${stats.total} ${stats.total === 1 ? 'order' : 'orders'}`,
      icon: <Wallet className="h-5 w-5" />,
      accent: true,
    },
    {
      label: strings.stat_in_progress,
      value: stats.inProgress,
      hint: stats.awaitingPayment > 0 ? `${stats.awaitingPayment} awaiting payment` : undefined,
      icon: <Clock className="h-5 w-5" />,
      accent: false,
    },
    {
      label: strings.stat_delivered,
      value: stats.delivered,
      hint: undefined,
      icon: <Check className="h-5 w-5" />,
      accent: false,
    },
  ]

  return (
    <div className="space-y-8">
      <header className="dash-header-safe border-b border-black/[0.06] pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A] sm:text-3xl">
          {strings.header_title}
        </h1>
        <p className="mt-2 text-sm text-[#1A1A1A]/65 sm:text-base">{strings.header_subtitle}</p>
      </header>

      {orders.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-7 w-7" />}
          title={strings.empty_title}
          description={strings.empty_description}
          action={
            <Link href="/digital-cards/catalog">
              <Button>
                <ArrowRight className="h-4 w-4" /> {strings.empty_action}
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            {kpis.map((k) => (
              <StatCard key={k.label} label={k.label} value={k.value} hint={k.hint} icon={k.icon} accent={k.accent} />
            ))}
          </div>

          {/* Toolbar: search on the left, status filter pills on the right. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative sm:flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1A1A]/35" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by order number or design…"
                className="w-full rounded-full border border-black/[0.12] bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-[#1A1A1A] outline-none placeholder:text-[#1A1A1A]/35 focus:border-[#C9A0DC]"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((f) => {
                const active = statusFilter === f.key
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setStatusFilter(f.key)}
                    aria-pressed={active}
                    className={cn(
                      'rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition',
                      active
                        ? 'bg-[#1A1A1A] text-white'
                        : 'bg-black/[0.04] text-[#1A1A1A]/70 hover:bg-black/[0.08]',
                    )}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>

            {/* Card ⇆ table view toggle. */}
            <div className="flex shrink-0 items-center gap-1 rounded-full border border-black/[0.12] p-1">
              {([
                { key: 'cards' as const, label: 'Card view', icon: LayoutGrid },
                { key: 'table' as const, label: 'List view', icon: List },
              ]).map((v) => {
                const active = view === v.key
                const Icon = v.icon
                return (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => setView(v.key)}
                    aria-pressed={active}
                    aria-label={v.label}
                    title={v.label}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full transition',
                      active ? 'bg-[#1A1A1A] text-white' : 'text-[#1A1A1A]/55 hover:bg-black/[0.05]',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                )
              })}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/[0.12] px-6 py-12 text-center">
              <p className="text-sm font-medium text-[#1A1A1A]">No orders match your filters</p>
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setStatusFilter('all')
                }}
                className="mt-2 text-sm font-semibold text-[#7E5896] underline underline-offset-2 hover:text-[#5f4171]"
              >
                Clear filters
              </button>
            </div>
          ) : view === 'table' ? (
            <OrderTable orders={filtered} strings={strings} onSelect={setSelectedOrder} />
          ) : (
            <div className="space-y-4">
              {filtered.map((order) => (
                <OrderCard key={order.ref} order={order} strings={strings} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Row click (list view) opens the full order in a modal. */}
      <Dialog
        open={selectedOrder !== null}
        onClose={() => setSelectedOrder(null)}
        title="Order details"
        footer={
          selectedOrder ? (
            <Button variant="secondary" onClick={() => downloadInvoice(selectedOrder)}>
              <Download className="size-4" /> {strings.action_invoice}
            </Button>
          ) : undefined
        }
      >
        {selectedOrder ? <OrderDetail order={selectedOrder} strings={strings} /> : null}
      </Dialog>
    </div>
  )
}
