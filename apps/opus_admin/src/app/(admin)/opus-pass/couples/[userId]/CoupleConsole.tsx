'use client'

import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  BookHeart,
  CalendarDays,
  CreditCard,
  Gift,
  HandHeart,
  Link2,
  MapPin,
  QrCode,
  ShieldCheck,
  StickyNote,
} from 'lucide-react'
import type { EventCreditUsage } from '../../../finance/payments/queries'
import type { CoupleAccountDetail, CoupleEvent, CoupleGuestRow, CoupleNote, CoupleOrder } from './queries'
import { GUEST_PAGE_SIZE } from './constants'
import { addCoupleNote, adjustCoupleCredits, linkOrderToAccount, type ActionResult } from './actions'
import { toDateInputValue, type CoupleEditable } from '../editable'
import { CoupleConsoleActions } from '../CoupleAccountControls'

const TABS = ['Overview', 'Events', 'Guests & RSVPs', 'Orders & Credits', 'Notes'] as const
type Tab = (typeof TABS)[number]

const RSVP_CLASS: Record<string, string> = {
  attending: 'border-[#7ec24a] bg-[#9FE870]/25 text-[#3d6b1f]',
  declined: 'border-rose-200 bg-rose-50 text-rose-700',
  maybe: 'border-amber-200 bg-amber-50 text-amber-800',
  pending: 'border-gray-200 bg-gray-50 text-gray-500',
}

const ORDER_STATUS_CLASS: Record<string, string> = {
  paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  processing: 'border-amber-200 bg-amber-50 text-amber-800',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
}

function formatTzs(value: number, currency = 'TZS'): string {
  return `${currency} ${value.toLocaleString('en-US')}`
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Not set'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Not set'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Never'
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${className || 'border-[#7ec24a] bg-[#9FE870]/25 text-[#3d6b1f]'}`}>
      {children}
    </span>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">{children}</div>
  )
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'money' | 'muted' }) {
  const valueClass = tone === 'money' ? 'text-emerald-700' : tone === 'muted' ? 'text-gray-500' : 'text-gray-900'
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
      {children}
    </div>
  )
}

export default function CoupleConsole({
  couple,
  events,
  selectedEventId,
  guests,
  orders,
  linkableOrders,
  creditUsage,
  notes,
  tier,
  canWrite,
  canDelete,
}: {
  couple: CoupleAccountDetail
  events: CoupleEvent[]
  selectedEventId: string | null
  guests: CoupleGuestRow[]
  orders: CoupleOrder[]
  linkableOrders: CoupleOrder[]
  creditUsage: EventCreditUsage | null
  notes: CoupleNote[]
  tier: 'elegant' | 'signature' | null
  canWrite: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('Overview')

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null

  const editable: CoupleEditable = {
    userId: couple.userId,
    coupleName: couple.coupleName,
    partner1Name: couple.partner1Name ?? '',
    partner2Name: couple.partner2Name ?? '',
    email: couple.email ?? '',
    phone: couple.phone ?? '',
    whatsappPhone: couple.whatsappPhone ?? '',
    city: couple.city ?? '',
    region: couple.region ?? '',
    weddingDate: toDateInputValue(couple.weddingDate),
    dateUndecided: couple.dateUndecided,
    budgetRange: couple.budgetRange ?? '',
    guestCount: couple.expectedGuestCount === null ? '' : String(couple.expectedGuestCount),
    canSignIn: couple.clerkLinked,
  }

  function selectEvent(eventId: string) {
    const next = new URLSearchParams(searchParams.toString())
    next.set('event', eventId)
    router.replace(`?${next.toString()}`, { scroll: false })
  }

  return (
    <div>
      <Link
        href="/opus-pass/couples"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 transition hover:text-[#7E5896]"
      >
        <ArrowLeft className="h-4 w-4" />
        All couples
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{couple.coupleName}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {couple.email ?? 'No email'}
            {couple.phone ? ` · ${couple.phone}` : ''}
            {couple.city ? ` · ${couple.city}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {couple.onboarded ? <Pill>Onboarded</Pill> : <Pill className="border-gray-200 bg-gray-50 text-gray-500">Not onboarded</Pill>}
            {couple.clerkLinked ? (
              <Pill>Can sign in</Pill>
            ) : (
              <Pill className="border-amber-200 bg-amber-50 text-amber-800">No sign-in</Pill>
            )}
            {tier ? (
              <Pill className="border-[#C9A0DC] bg-[#F0DFF6] text-[#5d3a78]">
                {tier === 'signature' ? 'Signature' : 'Elegant'}
              </Pill>
            ) : null}
            {couple.websitePublishedAt ? <Pill>Website published</Pill> : null}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {tier ? (
            <Link
              href={`/opus-pass/pledges/${couple.userId}`}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-[#C9A0DC] hover:text-[#7E5896]"
            >
              <HandHeart className="h-4 w-4" />
              Pledge Concierge
            </Link>
          ) : null}
          <CoupleConsoleActions couple={editable} canWrite={canWrite} canDelete={canDelete} />
        </div>
      </div>

      {events.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Event</span>
          {events.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => selectEvent(event.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                event.id === selectedEventId
                  ? 'border-[#7E5896] bg-[#7E5896] text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-[#C9A0DC] hover:text-[#7E5896]'
              }`}
            >
              {event.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex gap-6 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`whitespace-nowrap pb-3 text-sm font-semibold transition ${
              tab === t ? 'border-b-2 border-[#7E5896] text-[#7E5896]' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'Overview' ? <OverviewTab couple={couple} events={events} orders={orders} notes={notes} /> : null}
        {tab === 'Events' ? <EventsTab events={events} selectedEventId={selectedEventId} onSelect={selectEvent} /> : null}
        {tab === 'Guests & RSVPs' ? <GuestsTab event={selectedEvent} guests={guests} /> : null}
        {tab === 'Orders & Credits' ? (
          <OrdersTab
            userId={couple.userId}
            orders={orders}
            linkableOrders={linkableOrders}
            creditUsage={creditUsage}
            selectedEvent={selectedEvent}
            canWrite={canWrite}
          />
        ) : null}
        {tab === 'Notes' ? <NotesTab userId={couple.userId} notes={notes} canWrite={canWrite} /> : null}
      </div>
    </div>
  )
}

// --------------------------------------------------------------- Overview tab

function OverviewTab({
  couple,
  events,
  orders,
  notes,
}: {
  couple: CoupleAccountDetail
  events: CoupleEvent[]
  orders: CoupleOrder[]
  notes: CoupleNote[]
}) {
  const paidOrders = orders.filter((o) => o.status === 'paid')
  const lifetimeSpend = paidOrders.reduce((sum, o) => sum + o.amountTotal, 0)
  const totals = events.reduce(
    (acc, e) => ({
      invited: acc.invited + e.invitationCount,
      attending: acc.attending + e.rsvpAttending,
      headcount: acc.headcount + e.expectedHeadcount,
      checkedIn: acc.checkedIn + e.checkedInHeadcount,
      pledges: acc.pledges + e.pledgeCount,
      registry: acc.registry + e.registryItemCount,
      guestbook: acc.guestbook + e.guestbookCount,
    }),
    { invited: 0, attending: 0, headcount: 0, checkedIn: 0, pledges: 0, registry: 0, guestbook: 0 },
  )

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="text-sm font-semibold text-gray-900">Account</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Signed up</dt>
            <dd className="mt-1 text-gray-900">{formatDate(couple.signedUpAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Onboarding done</dt>
            <dd className="mt-1 text-gray-900">{formatDate(couple.onboardingCompletedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Wedding date</dt>
            <dd className="mt-1 text-gray-900">{couple.dateUndecided ? 'Undecided' : formatDate(couple.weddingDate)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Location</dt>
            <dd className="mt-1 text-gray-900">{[couple.city, couple.region].filter(Boolean).join(', ') || 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Budget range</dt>
            <dd className="mt-1 text-gray-900">{couple.budgetRange?.replace(/_/g, ' ') ?? 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Expected guests</dt>
            <dd className="mt-1 text-gray-900">{couple.expectedGuestCount ?? 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">WhatsApp</dt>
            <dd className="mt-1 text-gray-900">{couple.whatsappPhone ?? 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Public invite hub</dt>
            <dd className="mt-1 text-gray-900">
              {couple.publicSlug ? (couple.publicSharingEnabled ? `/i/${couple.publicSlug}` : 'Sharing off') : 'Not set'}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-gray-900">Everything they have built</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Events" value={String(events.length)} />
          <Stat label="Invited" value={String(totals.invited)} />
          <Stat label="Attending" value={String(totals.attending)} />
          <Stat label="Expected heads" value={String(totals.headcount)} />
          <Stat label="Checked in" value={String(totals.checkedIn)} />
          <Stat label="Pledges" value={String(totals.pledges)} />
          <Stat label="Registry items" value={String(totals.registry)} />
          <Stat label="Guestbook" value={String(totals.guestbook)} />
          <Stat label="Staff notes" value={String(notes.length)} tone="muted" />
        </div>
        <div className="mt-5 border-t border-gray-100 pt-4">
          <Stat
            label={`Lifetime spend · ${paidOrders.length} paid order${paidOrders.length === 1 ? '' : 's'}`}
            value={formatTzs(lifetimeSpend)}
            tone="money"
          />
        </div>
      </Card>
    </div>
  )
}

// ----------------------------------------------------------------- Events tab

function EventsTab({
  events,
  selectedEventId,
  onSelect,
}: {
  events: CoupleEvent[]
  selectedEventId: string | null
  onSelect: (eventId: string) => void
}) {
  if (events.length === 0) {
    return <Empty>This couple has not created any events yet.</Empty>
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {events.map((event) => (
        <div
          key={event.id}
          className={`rounded-2xl border bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)] transition ${
            event.id === selectedEventId ? 'border-[#C9A0DC]' : 'border-gray-100'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(event.id)}
                className="truncate text-left text-lg font-semibold text-gray-900 hover:text-[#7E5896]"
              >
                {event.name}
              </button>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-gray-500">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatDate(event.startsAt)}
                {event.venueName ? (
                  <>
                    <MapPin className="h-3.5 w-3.5" />
                    {event.venueName}
                  </>
                ) : null}
              </p>
            </div>
            <Pill>{event.eventType.replace(/_/g, ' ')}</Pill>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-gray-100 pt-4">
            <Stat label="Invited" value={String(event.invitationCount)} />
            <Stat label="Attending" value={`${event.rsvpAttending} / ${event.expectedHeadcount} heads`} />
            <Stat label="Checked in" value={String(event.checkedInHeadcount)} />
            <Stat label="Pending RSVP" value={String(event.rsvpPending)} tone="muted" />
            <Stat label="Declined" value={String(event.rsvpDeclined)} tone="muted" />
            <Stat label="Seating tables" value={String(event.seatingTableCount)} tone="muted" />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <HandHeart className="h-3.5 w-3.5" /> {event.pledgeCount} pledges
            </span>
            <span className="inline-flex items-center gap-1">
              <Gift className="h-3.5 w-3.5" /> {event.registryItemCount} registry
            </span>
            <span className="inline-flex items-center gap-1">
              <BookHeart className="h-3.5 w-3.5" /> {event.guestbookCount} guestbook
            </span>
            <span className="inline-flex items-center gap-1">
              <CreditCard className="h-3.5 w-3.5" /> {formatTzs(event.spendTzs)}
            </span>
            <Link
              href={`/operations/checkin/${event.id}`}
              className="ml-auto inline-flex items-center gap-1.5 font-semibold text-[#7E5896] hover:text-[#5d3a78]"
            >
              <QrCode className="h-3.5 w-3.5" />
              Check-in console
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}

// ----------------------------------------------------------- Guests & RSVPs tab

function GuestsTab({ event, guests }: { event: CoupleEvent | null; guests: CoupleGuestRow[] }) {
  if (!event) return <Empty>Pick an event to see its guest list.</Empty>
  if (guests.length === 0) return <Empty>No guests have been invited to {event.name} yet.</Empty>

  return (
    <div>
      <p className="text-sm text-gray-500">
        {event.name} · showing {guests.length} of {event.invitationCount} invitations
        {event.invitationCount > GUEST_PAGE_SIZE ? ` (first ${GUEST_PAGE_SIZE})` : ''}
      </p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3">Guest</th>
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3">RSVP</th>
              <th className="px-4 py-3 text-right">Party</th>
              <th className="px-4 py-3">Meal</th>
              <th className="px-4 py-3">Responded</th>
              <th className="px-4 py-3">Checked in</th>
            </tr>
          </thead>
          <tbody>
            {guests.map((guest) => (
              <tr key={guest.id} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-3">
                  <span className="font-semibold text-gray-900">{guest.fullName}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">{guest.phone ?? guest.email ?? 'No contact'}</span>
                </td>
                <td className="px-4 py-3 text-gray-600">{guest.groupTag ?? '—'}</td>
                <td className="px-4 py-3">
                  <Pill className={RSVP_CLASS[guest.rsvpStatus] ?? RSVP_CLASS.pending}>{guest.rsvpStatus}</Pill>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700">{guest.partySize}</td>
                <td className="px-4 py-3 text-gray-600">{guest.mealChoice ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{formatDate(guest.respondedAt)}</td>
                <td className="px-4 py-3 text-gray-600">{guest.checkedInAt ? formatDateTime(guest.checkedInAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ------------------------------------------------------- Orders & Credits tab

function OrdersTab({
  userId,
  orders,
  linkableOrders,
  creditUsage,
  selectedEvent,
  canWrite,
}: {
  userId: string
  orders: CoupleOrder[]
  linkableOrders: CoupleOrder[]
  creditUsage: EventCreditUsage | null
  selectedEvent: CoupleEvent | null
  canWrite: boolean
}) {
  return (
    <div className="space-y-6">
      {linkableOrders.length > 0 ? (
        <UnlinkedOrdersPanel userId={userId} orders={linkableOrders} canWrite={canWrite} />
      ) : null}

      {creditUsage && selectedEvent ? (
        <CreditsPanel userId={userId} event={selectedEvent} usage={creditUsage} canWrite={canWrite} />
      ) : null}

      <Card>
        <h2 className="text-sm font-semibold text-gray-900">Orders</h2>
        {orders.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No orders are attached to this account.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                  <th className="px-2 py-3">Ref</th>
                  <th className="px-2 py-3">Status</th>
                  <th className="px-2 py-3">Event</th>
                  <th className="px-2 py-3">Tier</th>
                  <th className="px-2 py-3 text-right">Guests</th>
                  <th className="px-2 py-3 text-right">Amount</th>
                  <th className="px-2 py-3">Placed</th>
                  <th className="px-2 py-3">Fulfilment</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-2 py-3 font-semibold text-gray-900">{order.ref}</td>
                    <td className="px-2 py-3">
                      <Pill className={ORDER_STATUS_CLASS[order.status] ?? 'border-gray-200 bg-gray-50 text-gray-600'}>
                        {order.status}
                      </Pill>
                    </td>
                    <td className="px-2 py-3 text-gray-600">{order.eventName ?? 'Not assigned'}</td>
                    <td className="px-2 py-3 text-gray-600">{order.tierLabels.join(', ') || '—'}</td>
                    <td className="px-2 py-3 text-right tabular-nums text-gray-700">{order.guestsPurchased}</td>
                    <td className="px-2 py-3 text-right tabular-nums font-semibold text-gray-900">
                      {formatTzs(order.amountTotal, order.currency)}
                    </td>
                    <td className="px-2 py-3 text-gray-600">{formatDate(order.createdAt)}</td>
                    <td className="px-2 py-3 text-gray-600">{order.fulfillmentStatus?.replace(/_/g, ' ') ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-4 border-t border-gray-100 pt-4 text-xs font-semibold">
          <Link href="/finance/payments" className="text-[#7E5896] hover:text-[#5d3a78]">
            Invitation Payments
          </Link>
          <Link href="/finance/orders" className="text-[#7E5896] hover:text-[#5d3a78]">
            Orders &amp; Fulfilment
          </Link>
        </div>
      </Card>
    </div>
  )
}

function UnlinkedOrdersPanel({ userId, orders, canWrite }: { userId: string; orders: CoupleOrder[]; canWrite: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function link(orderId: string) {
    setError(null)
    startTransition(async () => {
      const result = await linkOrderToAccount(userId, orderId)
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <Link2 className="h-4 w-4" />
        {orders.length} order{orders.length === 1 ? '' : 's'} bought under this email but not attached
      </h2>
      <p className="mt-1 text-sm text-amber-800">
        Checkout completed without being signed in, so this couple cannot see the order and it does not count towards
        their credits or pledge eligibility. Linking is recorded in the audit log.
      </p>
      {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
      <ul className="mt-4 space-y-2">
        {orders.map((order) => (
          <li key={order.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-white px-3 py-2.5">
            <span className="font-semibold text-gray-900">{order.ref}</span>
            <Pill className={ORDER_STATUS_CLASS[order.status] ?? 'border-gray-200 bg-gray-50 text-gray-600'}>
              {order.status}
            </Pill>
            <span className="tabular-nums text-gray-700">{formatTzs(order.amountTotal, order.currency)}</span>
            <span className="text-sm text-gray-500">{formatDate(order.createdAt)}</span>
            <button
              type="button"
              disabled={!canWrite || pending}
              onClick={() => link(order.id)}
              className="ml-auto rounded-lg bg-[#7E5896] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5d3a78] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? 'Linking...' : 'Link to this account'}
            </button>
          </li>
        ))}
      </ul>
      {!canWrite ? (
        <p className="mt-3 text-xs text-amber-700">You need the Manage couple accounts permission to link orders.</p>
      ) : null}
    </div>
  )
}

function CreditsPanel({
  userId,
  event,
  usage,
  canWrite,
}: {
  userId: string
  event: CoupleEvent
  usage: EventCreditUsage
  canWrite: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)

  function submit(formData: FormData) {
    setResult(null)
    startTransition(async () => {
      const outcome = await adjustCoupleCredits(userId, formData)
      setResult(outcome)
      if (outcome.ok) router.refresh()
    })
  }

  const pools = [
    { key: 'invite' as const, label: 'Invite sends', pool: usage.invite },
    { key: 'entrance_pass' as const, label: 'Entrance passes', pool: usage.entrancePass },
  ]

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <ShieldCheck className="h-4 w-4 text-[#7E5896]" />
        Send credits · {event.name}
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {pools.map(({ key, label, pool }) => (
          <div key={key} className="rounded-xl border border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-900">{label}</p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat label="Purchased" value={String(pool.purchased)} />
              <Stat label="Used" value={String(pool.used)} />
              <Stat label="Remaining" value={String(pool.remaining)} tone={pool.remaining > 0 ? 'money' : 'muted'} />
            </div>
            {pool.adjustment !== 0 ? (
              <p className="mt-2 text-xs text-gray-500">
                Includes {pool.adjustment > 0 ? '+' : ''}
                {pool.adjustment} from staff adjustments on top of {pool.basePurchased} purchased.
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {canWrite ? (
        <form action={submit} className="mt-5 border-t border-gray-100 pt-4">
          <input type="hidden" name="eventId" value={event.id} />
          <div className="grid gap-3 sm:grid-cols-4">
            <select name="direction" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" aria-label="Direction">
              <option value="grant">Grant</option>
              <option value="revoke">Revoke</option>
            </select>
            <input
              type="number"
              name="quantity"
              min={1}
              step={1}
              defaultValue={10}
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm tabular-nums"
              aria-label="Quantity"
            />
            <select name="kind" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm" aria-label="Credit kind">
              <option value="invite">Invite sends</option>
              <option value="entrance_pass">Entrance passes</option>
            </select>
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-[#7E5896] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5d3a78] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? 'Saving...' : 'Apply'}
            </button>
          </div>
          <input
            type="text"
            name="reason"
            required
            placeholder="Reason (required, kept in the audit trail)"
            className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
          />
          {result && !result.ok ? <p className="mt-2 text-sm font-semibold text-rose-700">{result.error}</p> : null}
          {result?.ok ? <p className="mt-2 text-sm font-semibold text-emerald-700">Credits updated.</p> : null}
        </form>
      ) : (
        <p className="mt-4 border-t border-gray-100 pt-4 text-xs text-gray-500">
          You need the Manage couple accounts permission to adjust credits.
        </p>
      )}
    </Card>
  )
}

// ------------------------------------------------------------------ Notes tab

function NotesTab({ userId, notes, canWrite }: { userId: string; notes: CoupleNote[]; canWrite: boolean }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await addCoupleNote(userId, body)
      if (!result.ok) setError(result.error)
      else {
        setBody('')
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-4">
      {canWrite ? (
        <Card>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <StickyNote className="h-4 w-4 text-[#7E5896]" />
            Add an internal note
          </h2>
          <p className="mt-1 text-xs text-gray-500">Staff only. The couple never sees these.</p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Called about the date change, waiting on their confirmation."
            className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#7E5896] focus:outline-none"
          />
          {error ? <p className="mt-2 text-sm font-semibold text-rose-700">{error}</p> : null}
          <button
            type="button"
            onClick={save}
            disabled={pending || !body.trim()}
            className="mt-3 rounded-xl bg-[#7E5896] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5d3a78] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Saving...' : 'Save note'}
          </button>
        </Card>
      ) : null}

      {notes.length === 0 ? (
        <Empty>No notes on this account yet.</Empty>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <Card key={note.id}>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{note.body}</p>
              <p className="mt-3 text-xs text-gray-400">
                {note.adminEmail} · {formatDateTime(note.createdAt)}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
