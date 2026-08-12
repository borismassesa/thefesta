'use client'

import { useMemo, useState, useTransition } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import SetGrowthHeading from '../_components/SetGrowthHeading'
import MonthPager from '../_components/MonthPager'
import KpiMonthlyGrid from '../_components/KpiMonthlyGrid'
import StatsStrip from '../_components/StatsStrip'
import Tabs from '../_components/Tabs'
import type { KpiActual, KpiTarget } from '../_lib/queries'
import { dateIsInHalfOpenMonth, monthBounds } from '../_lib/period'
import { addBooking, deleteBooking, updateBooking, type BookingInput } from './actions'

export type StudioBooking = {
  id: string
  bookingDate: string
  sessionDate: string | null
  customerName: string
  service: string
  photographerName: string | null
  videographerName: string | null
  revenueTzs: number
  directCostTzs: number
  deliveryDate: string | null
  satisfaction: number | null
  notes: string | null
  marginTzs: number
  marginPct: number | null
}

const SERVICE_OPTIONS = [
  'Studio Rental (Hourly)',
  'Studio Rental (Half-day)',
  'Studio Rental (Full-day)',
  'Headshot Express',
  'Headshot Standard',
  'Headshot Premium',
  'Headshot Executive',
  'Team Standard',
  'Team Plus',
  'Product (Per Item)',
  'Product (Lifestyle)',
  'Wedding Bronze',
  'Wedding Silver',
  'Wedding Gold',
]

const CREW_SUGGESTIONS = ['Studio Lead', 'Studio Asst', 'External Freelance', 'N/A']

const TAB_HEADINGS: Record<string, { title: string; subtitle: string }> = {
  bookings: {
    title: 'Studio Performance',
    subtitle: 'Targets set at the Mid (steady baseline) level. Every booking logged from booking date to delivery.',
  },
  kpis: {
    title: 'Monthly Targets',
    subtitle: 'Track studio bookings and revenue against this month’s targets.',
  },
}

function formatTzs(value: number): string {
  return `TZS ${Math.round(value).toLocaleString('en-US')}`
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7E5896] focus:outline-none focus:ring-2 focus:ring-[#F0DFF6]'

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </span>
      {children}
    </label>
  )
}

export default function StudioClient({
  targets,
  actuals,
  initialYear,
  month,
  canWrite,
  canAdmin,
  bookings,
  employeeNames,
}: {
  targets: KpiTarget[]
  actuals: KpiActual[]
  initialYear: number
  month: string
  canWrite: boolean
  canAdmin: boolean
  bookings: StudioBooking[]
  employeeNames: string[]
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<StudioBooking | null>(null)
  const [activeTab, setActiveTab] = useState<'bookings' | 'kpis'>('bookings')
  const heading = TAB_HEADINGS[activeTab]

  const crewOptions = Array.from(new Set([...employeeNames, ...CREW_SUGGESTIONS]))

  const monthBookings = useMemo(() => {
    const bounds = monthBounds(month)
    return bookings.filter((b) => dateIsInHalfOpenMonth(b.bookingDate, bounds))
  }, [bookings, month])

  const stats = useMemo(() => {
    const revenue = monthBookings.reduce((s, b) => s + b.revenueTzs, 0)
    const margin = monthBookings.reduce((s, b) => s + b.marginTzs, 0)
    const avgBooking = monthBookings.length ? revenue / monthBookings.length : null
    const rated = monthBookings.filter((b) => b.satisfaction !== null)
    const avgSatisfaction = rated.length
      ? rated.reduce((s, b) => s + (b.satisfaction ?? 0), 0) / rated.length
      : null
    return { revenue, margin, avgBooking, avgSatisfaction }
  }, [monthBookings])

  return (
    <div className="space-y-6 pb-16">
      <SetGrowthHeading title={heading.title} subtitle={heading.subtitle} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-gray-500">Stats and booking log for the selected month.</p>
        <MonthPager month={month} hrefForMonth={(m) => `/growth/studio?month=${m}`} />
      </div>

      <StatsStrip
        items={[
          { label: 'Total revenue', value: formatTzs(stats.revenue) },
          { label: 'Total margin', value: formatTzs(stats.margin) },
          { label: 'Avg booking value', value: stats.avgBooking === null ? '—' : formatTzs(stats.avgBooking) },
          { label: 'Avg satisfaction', value: stats.avgSatisfaction === null ? '—' : `${stats.avgSatisfaction.toFixed(1)} / 5.0` },
        ]}
      />

      <Tabs
        defaultKey="bookings"
        onChange={(key) => setActiveTab(key as 'bookings' | 'kpis')}
        tabs={[
          {
            key: 'bookings',
            label: `Booking log (${monthBookings.length})`,
            content: (
              <BookingsLog
                bookings={monthBookings}
                canWrite={canWrite}
                onAdd={() => setShowAdd(true)}
                onEdit={(b) => setEditing(b)}
              />
            ),
          },
          {
            key: 'kpis',
            label: 'Monthly targets',
            content: (
              <KpiMonthlyGrid
                targets={targets}
                actuals={actuals}
                initialYear={initialYear}
                canEdit={canWrite}
                canEditTargets={canAdmin}
                title="Studio KPIs — Monthly Target vs Actual"
              />
            ),
          },
        ]}
      />

      {showAdd && (
        <BookingDrawer
          title="Log booking"
          crewOptions={crewOptions}
          onClose={() => setShowAdd(false)}
        />
      )}
      {editing && (
        <BookingDrawer
          title="Edit booking"
          crewOptions={crewOptions}
          booking={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function BookingsLog({
  bookings,
  canWrite,
  onAdd,
  onEdit,
}: {
  bookings: StudioBooking[]
  canWrite: boolean
  onAdd: () => void
  onEdit: (b: StudioBooking) => void
}) {
  const [pending, startTransition] = useTransition()
  const [rowError, setRowError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function remove(id: string) {
    if (!window.confirm('Delete this booking? This cannot be undone.')) return
    setRowError(null)
    setDeletingId(id)
    startTransition(async () => {
      const res = await deleteBooking(id)
      if (!res.ok) setRowError(res.error)
      setDeletingId(null)
    })
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-[#F0DFF6]/40 px-4 py-3">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#5d3a78]">
          Booking log · {bookings.length} session{bookings.length === 1 ? '' : 's'}
        </p>
        {canWrite && (
          <button data-opus-button="control"
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#7E5896] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6c4884]"
          >
            <Plus className="h-4 w-4" />
            Add booking
          </button>
        )}
      </div>

      {rowError && (
        <div className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-[12px] font-medium text-rose-700">
          {rowError}
        </div>
      )}

      <div className="overflow-x-auto">
      <table className="opus-table w-full min-w-300">
        <thead>
          <tr>
            <th>Booking date</th>
            <th>Session date</th>
            <th>Customer</th>
            <th>Service</th>
            <th>Photographer</th>
            <th>Videographer</th>
            <th data-numeric="true">Revenue</th>
            <th data-numeric="true">Direct cost</th>
            <th data-numeric="true">Margin</th>
            <th data-numeric="true">Margin %</th>
            <th>Delivery</th>
            <th data-numeric="true">Satisfaction</th>
            {canWrite && <th />}
          </tr>
        </thead>
        <tbody>
          {bookings.length === 0 && (
            <tr>
              <td colSpan={canWrite ? 13 : 12} className="py-10 text-center text-gray-500">
                No bookings logged yet.
              </td>
            </tr>
          )}
          {bookings.map((b) => (
            <tr key={b.id} className={cn(deletingId === b.id && 'opacity-50')}>
              <td>{formatDate(b.bookingDate)}</td>
              <td className="text-gray-600">{formatDate(b.sessionDate)}</td>
              <th scope="row" className="opus-table-cell--leading">{b.customerName}</th>
              <td>{b.service}</td>
              <td className="text-gray-600">{b.photographerName ?? '—'}</td>
              <td className="text-gray-600">{b.videographerName ?? '—'}</td>
              <td data-numeric="true">{formatTzs(b.revenueTzs)}</td>
              <td data-numeric="true">{formatTzs(b.directCostTzs)}</td>
              <td data-numeric="true" className="font-semibold text-gray-900">
                {formatTzs(b.marginTzs)}
              </td>
              <td data-numeric="true">
                {b.marginPct === null ? '—' : `${(b.marginPct * 100).toFixed(1)}%`}
              </td>
              <td className="text-gray-600">{formatDate(b.deliveryDate)}</td>
              <td data-numeric="true">{b.satisfaction === null ? '—' : b.satisfaction.toFixed(1)}</td>
              {canWrite && (
                <td>
                  <div className="flex items-center justify-end gap-1">
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => onEdit(b)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      aria-label="Edit booking"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button data-opus-button="control"
                      type="button"
                      onClick={() => remove(b.id)}
                      disabled={pending}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                      aria-label="Delete booking"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}

function BookingDrawer({
  title,
  crewOptions,
  booking,
  onClose,
}: {
  title: string
  crewOptions: string[]
  booking?: StudioBooking
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [bookingDate, setBookingDate] = useState(booking?.bookingDate ?? new Date().toISOString().slice(0, 10))
  const [sessionDate, setSessionDate] = useState(booking?.sessionDate ?? '')
  const [customerName, setCustomerName] = useState(booking?.customerName ?? '')
  const [service, setService] = useState(booking?.service ?? '')
  const [photographerName, setPhotographerName] = useState(booking?.photographerName ?? '')
  const [videographerName, setVideographerName] = useState(booking?.videographerName ?? '')
  const [revenue, setRevenue] = useState(booking ? String(booking.revenueTzs) : '')
  const [directCost, setDirectCost] = useState(booking ? String(booking.directCostTzs) : '')
  const [deliveryDate, setDeliveryDate] = useState(booking?.deliveryDate ?? '')
  const [satisfaction, setSatisfaction] = useState(booking?.satisfaction != null ? String(booking.satisfaction) : '')
  const [notes, setNotes] = useState(booking?.notes ?? '')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // `Number(x) || 0` would silently turn a typo (e.g. pasted "1O0000", or a
    // locale decimal separator Number() can't parse) into a valid-looking
    // zero, quietly corrupting the revenue/margin stats derived from these
    // fields instead of surfacing a validation error.
    const parsedRevenue = revenue.trim() === '' ? 0 : Number(revenue)
    const parsedDirectCost = directCost.trim() === '' ? 0 : Number(directCost)
    if (!Number.isFinite(parsedRevenue) || !Number.isFinite(parsedDirectCost)) {
      setError('Revenue and direct cost must be valid numbers.')
      return
    }
    const input: BookingInput = {
      bookingDate,
      sessionDate: sessionDate || null,
      customerName,
      service,
      photographerName: photographerName || null,
      videographerName: videographerName || null,
      revenueTzs: parsedRevenue,
      directCostTzs: parsedDirectCost,
      deliveryDate: deliveryDate || null,
      satisfaction: satisfaction.trim() === '' ? null : Number(satisfaction),
      notes: notes || null,
    }
    startTransition(async () => {
      const res = booking ? await updateBooking(booking.id, input) : await addBooking(input)
      if (!res.ok) {
        setError(res.error)
        return
      }
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label={title}>
      <button data-opus-button="control" type="button" aria-label="Close" className="flex-1 bg-gray-900/30" onClick={onClose} />
      <form
        onSubmit={submit}
        className="flex h-full w-full max-w-md flex-col border-l border-gray-100 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500">Margin is computed automatically from revenue and direct cost.</p>
          </div>
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Booking date" required>
              <input
                required
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Session date">
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
          </div>

          <FormField label="Customer name" required>
            <input
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Amani Photography Studio client"
              className={INPUT_CLASS}
            />
          </FormField>

          <FormField label="Service" required>
            <input
              required
              list="studio-service-options"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="e.g. Headshot Standard"
              className={INPUT_CLASS}
            />
            <datalist id="studio-service-options">
              {SERVICE_OPTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Photographer">
              <input
                list="studio-crew-options"
                value={photographerName}
                onChange={(e) => setPhotographerName(e.target.value)}
                placeholder="e.g. Studio Lead"
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Videographer">
              <input
                list="studio-crew-options"
                value={videographerName}
                onChange={(e) => setVideographerName(e.target.value)}
                placeholder="e.g. N/A"
                className={INPUT_CLASS}
              />
            </FormField>
            <datalist id="studio-crew-options">
              {crewOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Revenue (TZS)" required>
              <input
                required
                type="number"
                inputMode="numeric"
                min={0}
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
                placeholder="0"
                className={cn(INPUT_CLASS, 'text-right tabular-nums')}
              />
            </FormField>
            <FormField label="Direct cost (TZS)" required>
              <input
                required
                type="number"
                inputMode="numeric"
                min={0}
                value={directCost}
                onChange={(e) => setDirectCost(e.target.value)}
                placeholder="0"
                className={cn(INPUT_CLASS, 'text-right tabular-nums')}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Delivery date">
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </FormField>
            <FormField label="Satisfaction (0–5)">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={5}
                step={0.1}
                value={satisfaction}
                onChange={(e) => setSatisfaction(e.target.value)}
                placeholder="e.g. 4.5"
                className={cn(INPUT_CLASS, 'text-right tabular-nums')}
              />
            </FormField>
          </div>

          <FormField label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything worth flagging…"
              className={INPUT_CLASS}
            />
          </FormField>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}
        </div>

        <footer className="border-t border-gray-100 px-5 py-3">
          <div className="flex items-center justify-end gap-2">
            <button data-opus-button="control"
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button data-opus-button="primary" data-opus-button-size="medium"
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6c4884] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {pending ? 'Saving…' : booking ? 'Save changes' : 'Save booking'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  )
}
