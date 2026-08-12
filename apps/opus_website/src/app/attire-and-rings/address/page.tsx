'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MapPin, Home, Store, Check, AlertCircle } from 'lucide-react'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import CheckoutStepper from '@/components/attire-and-rings/CheckoutStepper'
import { getAddress, setAddress as persistAddress, type FulfilmentMode } from '@/lib/cart-storage'

const TANZANIA_CITIES = [
  'Dar es Salaam',
  'Arusha',
  'Zanzibar',
  'Mwanza',
  'Moshi',
  'Dodoma',
  'Tanga',
  'Bagamoyo',
  'Mbeya',
  'Iringa',
]

type Errors = Partial<Record<'fullName' | 'phone' | 'streetLine', string>>

// Phone must contain at least 9 digits and may include + and common separators.
const PHONE_RE = /^\+?(?:[\d](?:[\s().-]?)){9,}$/

export default function AddressPage() {
  const router = useRouter()
  const [mode, setMode] = useState<FulfilmentMode>('delivery')

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('Dar es Salaam')
  const [streetLine, setStreetLine] = useState('')
  const [neighbourhood, setNeighbourhood] = useState('')
  const [notes, setNotes] = useState('')
  const [saveAsDefault, setSaveAsDefault] = useState(true)
  const [errors, setErrors] = useState<Errors>({})

  // Hydrate from storage on mount so the user comes back to their last entry
  useEffect(() => {
    const stored = getAddress()
    if (stored) {
      setMode(stored.mode)
      setFullName(stored.fullName)
      setPhone(stored.phone)
      setCity(stored.city)
      setStreetLine(stored.streetLine)
      setNeighbourhood(stored.neighbourhood)
      setNotes(stored.notes)
    }
  }, [])

  const validate = (): Errors => {
    const e: Errors = {}
    if (!fullName.trim()) e.fullName = 'Please enter your full name.'
    if (!PHONE_RE.test(phone.trim())) e.phone = 'Enter a valid phone number.'
    if (!streetLine.trim())
      e.streetLine =
        mode === 'delivery' ? 'Please enter your street address.' : 'Please name the pickup or fitting location.'
    return e
  }

  const handleContinue = () => {
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length > 0) return
    persistAddress({
      mode,
      fullName: fullName.trim(),
      phone: phone.trim(),
      city,
      streetLine: streetLine.trim(),
      neighbourhood: neighbourhood.trim(),
      notes: notes.trim(),
    })
    router.push('/attire-and-rings/checkout')
  }

  // Clear individual error as the user types
  const clearError = (key: keyof Errors) =>
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

  return (
    <>
      <Navbar />
      <main className="bg-gray-50 min-h-screen py-8">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <Link
            href="/attire-and-rings/cart"
            className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-gray-900 mb-4"
          >
            ← Back to cart
          </Link>
          <CheckoutStepper current="address" />

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-8">
            <section className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Where should we send it?</h1>
              <p className="text-sm text-gray-600 mb-6">
                Pick one option. You can change this before checkout.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-7">
                <ModeCard
                  active={mode === 'delivery'}
                  onClick={() => setMode('delivery')}
                  Icon={Home}
                  title="Home delivery"
                  caption="Delivered Tanzania-wide in 7–14 days."
                />
                <ModeCard
                  active={mode === 'fitting'}
                  onClick={() => setMode('fitting')}
                  Icon={MapPin}
                  title="Boutique fitting"
                  caption="Two free fittings at the maker's studio."
                />
                <ModeCard
                  active={mode === 'pickup'}
                  onClick={() => setMode('pickup')}
                  Icon={Store}
                  title="Pickup point"
                  caption="Ready for collection within 48 hours."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1.5">
                    Full name <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value)
                      clearError('fullName')
                    }}
                    placeholder="Mary Mwakasege"
                    aria-invalid={Boolean(errors.fullName)}
                    className={`w-full h-11 rounded-md border px-3 text-sm focus:outline-none ${
                      errors.fullName
                        ? 'border-red-500 focus:border-red-600'
                        : 'border-gray-300 focus:border-gray-500'
                    }`}
                  />
                  {errors.fullName && <FieldError>{errors.fullName}</FieldError>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1.5">
                    Phone number <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value)
                      clearError('phone')
                    }}
                    placeholder="+255 7xx xxx xxx"
                    inputMode="tel"
                    aria-invalid={Boolean(errors.phone)}
                    className={`w-full h-11 rounded-md border px-3 text-sm focus:outline-none ${
                      errors.phone
                        ? 'border-red-500 focus:border-red-600'
                        : 'border-gray-300 focus:border-gray-500'
                    }`}
                  />
                  {errors.phone && <FieldError>{errors.phone}</FieldError>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1.5">
                    City / region <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full h-11 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:border-gray-500"
                  >
                    {TANZANIA_CITIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1.5">
                    Neighbourhood / area
                  </label>
                  <input
                    type="text"
                    value={neighbourhood}
                    onChange={(e) => setNeighbourhood(e.target.value)}
                    placeholder="Masaki, Mikocheni, Oysterbay…"
                    className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:border-gray-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-900 mb-1.5">
                    {mode === 'delivery' ? 'Street address' : 'Pickup or fitting location'}{' '}
                    <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={streetLine}
                    onChange={(e) => {
                      setStreetLine(e.target.value)
                      clearError('streetLine')
                    }}
                    placeholder={
                      mode === 'delivery'
                        ? 'House number, street, building name…'
                        : 'Boutique or pickup point name'
                    }
                    aria-invalid={Boolean(errors.streetLine)}
                    className={`w-full h-11 rounded-md border px-3 text-sm focus:outline-none ${
                      errors.streetLine
                        ? 'border-red-500 focus:border-red-600'
                        : 'border-gray-300 focus:border-gray-500'
                    }`}
                  />
                  {errors.streetLine && <FieldError>{errors.streetLine}</FieldError>}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-900 mb-1.5">
                    Delivery notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Gate code, landmarks, best time to call…"
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-500 resize-none"
                  />
                </div>
              </div>

              <label className="mt-5 flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAsDefault}
                  onChange={(e) => setSaveAsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Save as my default address for future orders
              </label>

              <button data-opus-button="primary" data-opus-button-size="large"
                type="button"
                onClick={handleContinue}
                className="mt-7 w-full h-12 bg-gray-900 text-white font-semibold rounded-md hover:bg-gray-800 transition"
              >
                Continue to payment
              </button>
            </section>

            <aside className="space-y-5">
              <div className="rounded-2xl bg-white border border-gray-200 p-5">
                <h2 className="text-base font-bold text-gray-900 mb-3">What to expect</h2>
                <ul className="space-y-2.5 text-sm text-gray-700">
                  <li className="flex items-start gap-2.5">
                    <Check size={16} className="mt-0.5 text-emerald-600 shrink-0" />
                    A confirmation SMS within 5 minutes of payment
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check size={16} className="mt-0.5 text-emerald-600 shrink-0" />
                    Direct WhatsApp line to the boutique for any tweaks
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check size={16} className="mt-0.5 text-emerald-600 shrink-0" />
                    Tracking link as soon as your piece ships
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl bg-white border border-gray-200 p-5">
                <h2 className="text-base font-bold text-gray-900 mb-2">Need it sooner?</h2>
                <p className="text-sm text-gray-600 mb-3">
                  Switch to express in the next step — 3–5 days Tanzania-wide for{' '}
                  <strong className="font-semibold text-gray-900">TZS 18,000</strong>.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-xs text-red-600 inline-flex items-center gap-1">
      <AlertCircle size={12} />
      {children}
    </p>
  )
}

function ModeCard({
  active,
  onClick,
  Icon,
  title,
  caption,
}: {
  active: boolean
  onClick: () => void
  Icon: typeof Home
  title: string
  caption: string
}) {
  return (
    <button data-opus-button="control"
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left rounded-xl border-2 p-4 transition-colors ${
        active ? 'border-gray-900 bg-white' : 'border-gray-200 bg-white hover:border-gray-400'
      }`}
    >
      <div className="flex items-start gap-3">
        <Icon size={20} className="mt-0.5 text-gray-700 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{caption}</p>
        </div>
      </div>
    </button>
  )
}
