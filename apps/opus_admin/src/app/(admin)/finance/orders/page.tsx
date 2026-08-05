import { redirect } from 'next/navigation'
import { Fragment, type ReactNode } from 'react'
import {
  Mail,
  Package,
  Phone,
  Search,
  ReceiptText,
  Loader2,
  CheckCircle2,
  Truck,
  Check,
  Clock,
  Download,
  LayoutGrid,
  PenTool,
  Rows3,
  Hourglass,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { HeaderActionsSlot } from '@/components/HeaderPortals'
import { getAdminAccessRole, hasPermission, isAdminDashboardRole } from '@/lib/admin-auth'
import { isInvoiceProxyConfigured } from '@/lib/opus-pass-invoice'
import { formatTzs, formatDate } from '../_components/format'
import { Kpi, Detail } from '../_components/primitives'
import { PAYMENT_CATEGORY_BADGE } from '../payments/queries'
import OrdersHeading from './OrdersHeading'
import { updateFulfillmentStatus } from './actions'
import { ORDER_STAGES, STAGE_FAILED, orderStageIndex } from './order-stages'
import {
  getFulfillmentOrders,
  getFulfillmentSummary,
  ORDERS_PAGE_SIZE,
  type FulfillmentOrder,
  type FulfillmentOrderItem,
  type FulfillmentStatus,
  type FulfillmentFilter,
} from './queries'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<FulfillmentStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  ready: 'Ready',
  delivered: 'Delivered',
}

const STATUS_CLASS: Record<FulfillmentStatus, string> = {
  not_started: 'border-gray-200 bg-gray-50 text-gray-600',
  in_progress: 'border-amber-200 bg-amber-50 text-amber-800',
  ready: 'border-[#C9A0DC]/40 bg-[#F0DFF6] text-[#7E5896]',
  delivered: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}

const STATUS_ICON: Record<FulfillmentStatus, ReactNode> = {
  not_started: <Package className="h-3.5 w-3.5" />,
  in_progress: <Loader2 className="h-3.5 w-3.5" />,
  ready: <CheckCircle2 className="h-3.5 w-3.5" />,
  delivered: <Truck className="h-3.5 w-3.5" />,
}

const META_PILL = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium'
const GREEN_PILL = 'bg-[#9FE870]/25 text-[#3f6b1f]'

/** Tier pill colours — mirrors the couple's order card and the invoice PDF. */
function tierPillClass(item: FulfillmentOrderItem): string {
  const key = (item.tierId ?? item.tier ?? '').toLowerCase()
  if (key === 'classic') return 'bg-[#EFE3FA] text-[#6B4E8C]'
  if (key === 'elegant' || key === 'signature') return 'bg-[#F5EACF] text-[#8A6B1E]'
  return 'bg-[#E1E8F0] text-[#475569]'
}

/**
 * Line-item config as pills. Prefers the structured fields: `summary` is a
 * snapshot taken at add-to-cart time and can carry a stale guest count if the
 * order was later edited, whereas tier/guests/addOns stay current. Splitting
 * the summary is only a fallback for orders stored before those fields existed.
 */
function ItemPills({ item }: { item: FulfillmentOrderItem }) {
  const hasStructured = Boolean(item.tier) || item.guests != null || (item.addOns?.length ?? 0) > 0
  const pills = hasStructured
    ? [
        ...(item.tier ? [{ label: item.tier, className: tierPillClass(item) }] : []),
        ...(item.guests != null
          ? [{ label: `${item.guests.toLocaleString('en-US')} guests`, className: GREEN_PILL }]
          : []),
        ...(item.addOns ?? []).map((addOn) => ({ label: addOn, className: GREEN_PILL })),
      ]
    : (item.summary ?? '')
        .split(' · ')
        .filter(Boolean)
        .map((part) => ({ label: part, className: GREEN_PILL }))

  if (pills.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {pills.map((pill) => (
        <span key={pill.label} className={cn(META_PILL, pill.className)}>
          {pill.label}
        </span>
      ))}
    </div>
  )
}

/**
 * The five-step pipeline, horizontal. Completed steps are admin purple rather
 * than the brand green the couple's version uses: green is already the
 * metadata-pill colour on this same card, and one colour with two meanings
 * would be read as a relationship that isn't there.
 */
function OrderTracker({ activeIndex }: { activeIndex: number }) {
  const last = ORDER_STAGES.length - 1
  return (
    <div className="flex items-center">
      {ORDER_STAGES.map((stage, index) => {
        const done = index < activeIndex
        const current = index === activeIndex
        return (
          <Fragment key={stage.id}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1 ring-inset',
                  done && 'bg-[#7E5896] text-white ring-[#7E5896]',
                  current && 'bg-[#F0DFF6] text-[#7E5896] ring-[#C9A0DC]',
                  !done && !current && 'bg-gray-50 text-gray-400 ring-gray-200',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
              </span>
              <span
                className={cn(
                  'hidden text-xs font-medium lg:inline',
                  done || current ? 'text-gray-900' : 'text-gray-400',
                )}
              >
                {stage.label}
              </span>
            </div>
            {index < last && (
              <span
                className={cn(
                  'mx-2 h-px flex-1 rounded-full',
                  index < activeIndex ? 'bg-[#7E5896]' : 'bg-gray-200',
                )}
              />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}

function StatusBadge({ status }: { status: FulfillmentStatus }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold', STATUS_CLASS[status])}>
      {STATUS_ICON[status]}
      {STATUS_LABEL[status]}
    </span>
  )
}

function AwaitingPaymentBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
      <Hourglass className="h-3.5 w-3.5" />
      Awaiting payment
    </span>
  )
}

function ItemList({ order }: { order: FulfillmentOrder }) {
  if (order.items.length === 0) return <p className="text-sm text-gray-500">No line items captured.</p>
  return (
    <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50/60">
      {order.items.map((item, index) => (
        <div key={`${item.id ?? item.name ?? 'item'}-${index}`} className="flex items-center justify-between gap-4 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt="" className="h-12 w-9 shrink-0 rounded object-cover ring-1 ring-gray-200" />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{item.name ?? 'Order item'}</p>
              <ItemPills item={item} />
            </div>
          </div>
          {typeof item.total === 'number' && (
            <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{formatTzs(item.total)}</span>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Fulfilment controls for a paid order. The form deliberately has no `action=`
 * so it POSTs to the current URL, which is what carries ?filter/?q/?view
 * through the server action and back.
 */
function FulfillmentControl({ order, canWrite }: { order: FulfillmentOrder; canWrite: boolean }) {
  if (!canWrite) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
        {order.fulfillmentUpdatedAt
          ? `Last updated ${formatDate(order.fulfillmentUpdatedAt)}${order.fulfillmentUpdatedBy ? ` by ${order.fulfillmentUpdatedBy}` : ''}`
          : 'Read-only — your account has no fulfilment write access.'}
      </div>
    )
  }
  const options: FulfillmentStatus[] = ['not_started', 'in_progress', 'ready', 'delivered']
  return (
    <form className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <input type="hidden" name="id" value={order.id} />
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Design status</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="submit"
            formAction={updateFulfillmentStatus.bind(null, opt)}
            disabled={order.fulfillmentStatus === opt}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-default',
              order.fulfillmentStatus === opt
                ? 'border-[#7E5896] bg-[#7E5896] text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-[#C9A0DC] hover:text-[#7E5896]',
            )}
          >
            {STATUS_ICON[opt]}
            {STATUS_LABEL[opt]}
          </button>
        ))}
      </div>
      {order.fulfillmentUpdatedAt ? (
        <p className="mt-3 text-xs text-gray-500">
          Last updated {formatDate(order.fulfillmentUpdatedAt)}
          {order.fulfillmentUpdatedBy ? ` by ${order.fulfillmentUpdatedBy}` : ''}
        </p>
      ) : null}
    </form>
  )
}

/**
 * Stands in for the fulfilment controls while a Lipa Namba payment is still
 * under review. Approving and rejecting belong to the Payments console, which
 * is the decision queue; this page only tracks work, so it links across rather
 * than duplicating the buttons.
 */
function AwaitingPaymentPanel({ order }: { order: FulfillmentOrder }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Payment awaiting review</p>
      <p className="mt-2 text-sm text-amber-900">
        Design work starts once finance approves this payment. Nothing to fulfil yet.
      </p>
      {order.paymentReference ? (
        <p className="mt-2 text-xs text-amber-800">Customer reference: {order.paymentReference}</p>
      ) : null}
      <Link
        href={`/finance/payments?q=${encodeURIComponent(order.ref)}`}
        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#7E5896] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#6c4884]"
      >
        <ReceiptText className="h-4 w-4" />
        Review payment
      </Link>
    </div>
  )
}

function StageNote({ stageIndex }: { stageIndex: number }) {
  const note =
    stageIndex === STAGE_FAILED
      ? 'This payment did not complete. The order is closed.'
      : stageIndex === 0
        ? 'Waiting on finance to approve the payment.'
        : stageIndex === 4
          ? 'Delivered. Nothing further is outstanding.'
          : 'The design team is personalising this order.'
  return (
    <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
      <Clock className="h-3.5 w-3.5" />
      {note}
    </p>
  )
}

function OrderCard({
  order,
  canWrite,
  invoiceEnabled,
  defaultOpen,
}: {
  order: FulfillmentOrder
  canWrite: boolean
  invoiceEnabled: boolean
  defaultOpen: boolean
}) {
  const isPaid = order.status === 'paid'
  const stageIndex = orderStageIndex(order.status, order.fulfillmentStatus)
  const itemCount = order.items.length

  return (
    <details open={defaultOpen} className="group rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">{order.ref}</h2>
            {/* A top-up commissions no design work — it adds capacity to a card
                that was already made. Labelled here so nobody in fulfilment
                looks for a job that does not exist. */}
            {order.orderKind === 'topup' && (
              <span className={cn(META_PILL, GREEN_PILL)}>
                Top-up{order.parentRef ? ` · ${order.parentRef}` : ''}
              </span>
            )}
            {isPaid ? <StatusBadge status={order.fulfillmentStatus} /> : <AwaitingPaymentBadge />}
            <span className={cn(META_PILL, 'bg-[#F0DFF6] text-[#7E5896]')}>
              {PAYMENT_CATEGORY_BADGE[order.category]}
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-500">
              {order.paymentLabel || order.provider}
            </span>
            {itemCount > 0 && (
              <span className={cn(META_PILL, GREEN_PILL)}>
                {itemCount} {itemCount === 1 ? 'design' : 'designs'}
              </span>
            )}
          </div>
          {/* Unpaid rows have no paid_at, and printing created_at under a "Paid"
              label would state something untrue about the money. */}
          <p className="mt-1.5 text-sm text-gray-500">
            {isPaid
              ? `Paid ${formatDate(order.paidAt ?? order.createdAt)}`
              : `Submitted ${formatDate(order.submittedAt ?? order.createdAt)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{formatTzs(order.amountTotal)}</p>
        </div>
      </summary>

      <div className="grid items-start gap-5 px-5 pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-white px-4 py-4">
            <OrderTracker activeIndex={stageIndex} />
            <StageNote stageIndex={stageIndex} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Detail icon={<Mail className="h-4 w-4" />} label="Customer" value={order.contactName || order.contactEmail} />
            <Detail icon={<Phone className="h-4 w-4" />} label="Phone" value={order.contactPhone || '—'} />
          </div>
          <ItemList order={order} />
        </div>
        <div className="space-y-3">
          {isPaid ? <FulfillmentControl order={order} canWrite={canWrite} /> : <AwaitingPaymentPanel order={order} />}
          {/* Plain <a>, so no client JS. target="_blank" keeps a 403/503 from
              the proxy route from replacing the admin's filtered list. */}
          {isPaid && invoiceEnabled && (
            <a
              href={`/api/finance/invoice?ref=${encodeURIComponent(order.ref)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition hover:border-[#C9A0DC] hover:text-[#7E5896]"
            >
              <Download className="h-4 w-4" />
              Invoice
            </a>
          )}
          {/* Approving a payment here is what releases the card into design,
              but there was no route from the approval to the work it started.
              Card orders only: the other four categories in this ledger have no
              design queue behind them. */}
          {isPaid && order.category === 'digital_card' && (
            <Link
              href={`/opus-pass/digital-cards/designer?q=${encodeURIComponent(order.ref)}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition hover:border-[#C9A0DC] hover:text-[#7E5896]"
            >
              <PenTool className="h-4 w-4" />
              Design work
            </Link>
          )}
        </div>
      </div>
    </details>
  )
}

const FILTER_TABS: { key: FulfillmentFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'awaiting_payment', label: 'Awaiting payment' },
  { key: 'not_started', label: 'Not started' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'ready', label: 'Ready' },
  { key: 'delivered', label: 'Delivered' },
]

type ViewMode = 'cards' | 'list'

/**
 * Takes an options object rather than positional arguments: this href is built
 * from a dozen call sites, and a positional signature is exactly how a newly
 * added param ends up silently dropped from half of them.
 */
function buildHref(opts: { filter: FulfillmentFilter; q?: string; view: ViewMode }): string {
  const params = new URLSearchParams()
  if (opts.filter !== 'all') params.set('filter', opts.filter)
  if (opts.q) params.set('q', opts.q)
  if (opts.view !== 'cards') params.set('view', opts.view)
  const qs = params.toString()
  return qs ? `/finance/orders?${qs}` : '/finance/orders'
}

const FILTER_KEYS = FILTER_TABS.map((tab) => tab.key)

export default async function FulfillmentOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; view?: string }>
}) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/contribute')
  if (!(await hasPermission('finance.read'))) redirect('/')

  const sp = await searchParams
  const filter: FulfillmentFilter = FILTER_KEYS.includes(sp.filter as FulfillmentFilter)
    ? (sp.filter as FulfillmentFilter)
    : 'all'
  const view: ViewMode = sp.view === 'list' ? 'list' : 'cards'
  const q = (sp.q ?? '').trim()

  const [summary, orders, canWrite] = await Promise.all([
    getFulfillmentSummary(),
    getFulfillmentOrders({ filter, q }),
    hasPermission('finance.write'),
  ])
  const capped = orders.length === ORDERS_PAGE_SIZE
  const invoiceEnabled = isInvoiceProxyConfigured()

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <OrdersHeading />
      {/* Payment approvals live on the sibling page; keep the route one click
          away now that the pointer is out of the in-page subtitle. */}
      <HeaderActionsSlot>
        <Link
          href="/finance/payments"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <ReceiptText className="h-4 w-4" />
          Digital Card Payments
        </Link>
      </HeaderActionsSlot>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi
          label="Awaiting payment"
          value={String(summary.awaitingPayment)}
          href={buildHref({ filter: 'awaiting_payment', q, view })}
          active={filter === 'awaiting_payment'}
        />
        <Kpi
          label="Not started"
          value={String(summary.notStarted)}
          href={buildHref({ filter: 'not_started', q, view })}
          active={filter === 'not_started'}
        />
        <Kpi
          label="In progress"
          value={String(summary.inProgress)}
          href={buildHref({ filter: 'in_progress', q, view })}
          active={filter === 'in_progress'}
        />
        <Kpi
          label="Ready"
          value={String(summary.ready)}
          href={buildHref({ filter: 'ready', q, view })}
          active={filter === 'ready'}
        />
        <Kpi
          label="Delivered"
          value={String(summary.delivered)}
          href={buildHref({ filter: 'delivered', q, view })}
          active={filter === 'delivered'}
        />
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map((tab) => (
            <Link
              key={tab.key}
              href={buildHref({ filter: tab.key, q, view })}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                filter === tab.key ? 'bg-[#7E5896] text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-gray-200 bg-white p-0.5">
            {([
              { key: 'cards' as const, label: 'Cards', icon: <LayoutGrid className="h-4 w-4" /> },
              { key: 'list' as const, label: 'List', icon: <Rows3 className="h-4 w-4" /> },
            ]).map((mode) => (
              <Link
                key={mode.key}
                href={buildHref({ filter, q, view: mode.key })}
                aria-current={view === mode.key ? 'page' : undefined}
                title={`${mode.label} view`}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-sm font-medium transition-colors',
                  view === mode.key ? 'bg-[#F0DFF6] text-[#7E5896]' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {mode.icon}
                <span className="sr-only sm:not-sr-only">{mode.label}</span>
              </Link>
            ))}
          </div>
          <form method="get" action="/finance/orders" className="flex items-center gap-2">
            {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
            {view !== 'cards' && <input type="hidden" name="view" value={view} />}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search ref, name, email…"
                className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-[#7E5896] focus:ring-2 focus:ring-[#F0DFF6] sm:w-64"
              />
            </div>
            <button type="submit" className="rounded-xl bg-[#7E5896] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6c4884]">
              Search
            </button>
          </form>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <ReceiptText className="mx-auto h-8 w-8 text-gray-300" />
          <h2 className="mt-3 text-sm font-semibold text-gray-900">
            {q || filter !== 'all' ? 'No orders match these filters' : 'No open orders yet'}
          </h2>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                canWrite={canWrite}
                invoiceEnabled={invoiceEnabled}
                // List view collapses every row so a long queue can be scanned;
                // cards view opens the work that is still outstanding.
                defaultOpen={view === 'cards' && order.fulfillmentStatus !== 'delivered'}
              />
            ))}
          </div>
          {capped && (
            <p className="mt-5 text-center text-xs text-gray-500">
              Showing the first {ORDERS_PAGE_SIZE}. Narrow with a filter or search to find a specific order.
            </p>
          )}
        </>
      )}
    </div>
  )
}
