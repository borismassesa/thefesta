'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { useBookingAction } from '@/lib/use-booking-action'

type Props = {
  readonly onClose: () => void
}

type FormValues = {
  event_date: string
  start_time: string
  end_time: string
  partner_a: string
  partner_b: string
  email: string
  phone: string
  whatsapp: string
  package_name: string
  location: string
  total_value: string
  deposit_percent: string
}

const EMPTY: FormValues = {
  event_date: '',
  start_time: '',
  end_time: '',
  partner_a: '',
  partner_b: '',
  email: '',
  phone: '',
  whatsapp: '',
  package_name: '',
  location: '',
  total_value: '',
  deposit_percent: '50',
}

export default function NewBookingModal({ onClose }: Props) {
  const router = useRouter()
  const action = useBookingAction()
  const [form, setForm] = useState<FormValues>(EMPTY)
  const uid = useId()

  function set(field: keyof FormValues) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const ok = await action.perform(async () => {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_date: form.event_date,
          start_time: form.start_time,
          end_time: form.end_time,
          partner_a: form.partner_a.trim(),
          partner_b: form.partner_b.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          whatsapp: form.whatsapp.trim() || undefined,
          package_name: form.package_name.trim(),
          location: form.location.trim(),
          total_value: Math.round(Number(form.total_value.replaceAll(',', ''))),
          deposit_percent: Number(form.deposit_percent),
        }),
      })
      return res
    }, {
      successMessage: 'Booking created successfully.',
      errorMessage: 'Could not create booking.',
    })

    if (ok) {
      // Re-fetch so the list page shows the new booking
      router.refresh()
      onClose()
    }
  }

  return (
    <dialog
      open
      aria-label="New booking"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="fixed inset-0 z-50 m-0 h-full w-full max-w-none border-0 bg-black/40 p-4 backdrop:bg-black/40 backdrop:backdrop-blur-sm flex items-end sm:items-center justify-center"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <p className="text-base font-bold text-gray-900">New booking</p>
            <p className="text-xs text-gray-500 mt-0.5">Create an off-platform or manually entered booking</p>
          </div>
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form id={`${uid}-form`} onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
          {/* Couple */}
          <fieldset className="space-y-3">
            <legend className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Couple</legend>
            <div className="grid grid-cols-2 gap-3">
              <FormField id={`${uid}-pa`} label="Partner A *">
                <input
                  id={`${uid}-pa`}
                  type="text"
                  required
                  placeholder="e.g. Doreen"
                  value={form.partner_a}
                  onChange={set('partner_a')}
                  className={inputCls}
                />
              </FormField>
              <FormField id={`${uid}-pb`} label="Partner B *">
                <input
                  id={`${uid}-pb`}
                  type="text"
                  required
                  placeholder="e.g. Mark"
                  value={form.partner_b}
                  onChange={set('partner_b')}
                  className={inputCls}
                />
              </FormField>
            </div>
            <FormField id={`${uid}-email`} label="Email *">
              <input
                id={`${uid}-email`}
                type="email"
                required
                placeholder="couple@example.com"
                value={form.email}
                onChange={set('email')}
                className={inputCls}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField id={`${uid}-phone`} label="Phone">
                <input
                  id={`${uid}-phone`}
                  type="tel"
                  placeholder="+255 7xx xxx xxx"
                  value={form.phone}
                  onChange={set('phone')}
                  className={inputCls}
                />
              </FormField>
              <FormField id={`${uid}-wa`} label="WhatsApp">
                <input
                  id={`${uid}-wa`}
                  type="tel"
                  placeholder="+255 7xx xxx xxx"
                  value={form.whatsapp}
                  onChange={set('whatsapp')}
                  className={inputCls}
                />
              </FormField>
            </div>
          </fieldset>

          {/* Event */}
          <fieldset className="space-y-3">
            <legend className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Event details</legend>
            <FormField id={`${uid}-date`} label="Event date *">
              <input
                id={`${uid}-date`}
                type="date"
                required
                value={form.event_date}
                onChange={set('event_date')}
                className={inputCls}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField id={`${uid}-start`} label="Start time *">
                <input
                  id={`${uid}-start`}
                  type="time"
                  required
                  value={form.start_time}
                  onChange={set('start_time')}
                  className={inputCls}
                />
              </FormField>
              <FormField id={`${uid}-end`} label="End time *">
                <input
                  id={`${uid}-end`}
                  type="time"
                  required
                  value={form.end_time}
                  onChange={set('end_time')}
                  className={inputCls}
                />
              </FormField>
            </div>
            <FormField id={`${uid}-loc`} label="Venue / location *">
              <input
                id={`${uid}-loc`}
                type="text"
                required
                placeholder="e.g. Slipway Hotel, Dar es Salaam"
                value={form.location}
                onChange={set('location')}
                className={inputCls}
              />
            </FormField>
          </fieldset>

          {/* Package & financials */}
          <fieldset className="space-y-3">
            <legend className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Package &amp; financials</legend>
            <FormField id={`${uid}-pkg`} label="Package name *">
              <input
                id={`${uid}-pkg`}
                type="text"
                required
                placeholder="e.g. Premium Wedding Package"
                value={form.package_name}
                onChange={set('package_name')}
                className={inputCls}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField id={`${uid}-val`} label="Total value (TZS) *">
                <input
                  id={`${uid}-val`}
                  type="number"
                  required
                  min={0}
                  step={1}
                  placeholder="e.g. 4200000"
                  value={form.total_value}
                  onChange={set('total_value')}
                  className={inputCls}
                />
              </FormField>
              <FormField id={`${uid}-dep`} label="Deposit %">
                <input
                  id={`${uid}-dep`}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={form.deposit_percent}
                  onChange={set('deposit_percent')}
                  className={inputCls}
                />
              </FormField>
            </div>
          </fieldset>

          {action.error ? (
            <p className="text-xs text-rose-600 font-medium bg-rose-50 rounded-lg px-3 py-2">{action.error}</p>
          ) : null}
        </form>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100">
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            disabled={action.loading}
            className="flex-1 text-sm font-semibold text-gray-600 hover:text-gray-900 px-4 py-2.5 rounded-full border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50"
          >
            Discard
          </button>
          <button data-opus-button="primary" data-opus-button-size="medium"
            type="submit"
            form={`${uid}-form`}
            disabled={action.loading}
            className="flex-1 bg-gray-900 text-white text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {action.loading ? 'Creating…' : 'Create booking'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'

function FormField({
  id,
  label,
  children,
}: {
  readonly id: string
  readonly label: string
  readonly children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-[11px] font-semibold text-gray-600">
        {label}
      </label>
      {children}
    </div>
  )
}
