'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────────────────────────

type CoupleProfile = {
  partner1_name: string | null
  partner2_name: string | null
  wedding_date: string | null
  date_undecided: boolean | null
  city: string | null
  region: string | null
  guest_count: number | null
  budget_range: string | null
  whatsapp_phone: string | null
  preferred_categories: string[] | null
}

type Props = {
  existingProfile: CoupleProfile | null
}

// ── Constants ──────────────────────────────────────────────────────────────

const TOTAL_STEPS = 4

const TZ_REGIONS = [
  'Dar es Salaam',
  'Zanzibar',
  'Arusha',
  'Mwanza',
  'Dodoma',
  'Mbeya',
  'Tanga',
  'Kilimanjaro',
  'Morogoro',
  'Iringa',
  'Other',
]

const BUDGET_OPTIONS: { value: string; label: string }[] = [
  { value: 'under_5m', label: 'Under TZS 5M' },
  { value: '5m_15m', label: 'TZS 5–15M' },
  { value: '15m_30m', label: 'TZS 15–30M' },
  { value: '30m_50m', label: 'TZS 30–50M' },
  { value: 'over_50m', label: 'Over TZS 50M' },
  { value: 'undisclosed', label: 'Prefer not to say' },
]

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'venues', label: 'Venues' },
  { value: 'photographers', label: 'Photographers' },
  { value: 'videographers', label: 'Videographers' },
  { value: 'caterers', label: 'Caterers' },
  { value: 'djs-music', label: 'DJs & Music' },
  { value: 'florists', label: 'Florists' },
  { value: 'wedding-planners', label: 'Wedding Planners' },
  { value: 'hair-makeup', label: 'Hair & Makeup' },
  { value: 'cakes-desserts', label: 'Cakes & Desserts' },
  { value: 'decorators', label: 'Decorators' },
]

// ── Progress dots ──────────────────────────────────────────────────────────

function ProgressDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === step
              ? 'w-6 h-2 bg-[#1A1A1A]'
              : i < step
              ? 'w-2 h-2 bg-[#1A1A1A]'
              : 'w-2 h-2 bg-gray-200'
          }`}
        />
      ))}
    </div>
  )
}

// ── Step 1: Your names ─────────────────────────────────────────────────────

function Step1({
  partner1Name,
  onPartner1NameChange,
  partner2Name,
  onPartner2NameChange,
}: {
  partner1Name: string
  onPartner1NameChange: (v: string) => void
  partner2Name: string
  onPartner2NameChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A] leading-tight mb-2">
          Tell us about you both.
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          This helps us personalise your experience.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Your name
          </label>
          <input
            type="text"
            value={partner1Name}
            onChange={(e) => onPartner1NameChange(e.target.value)}
            placeholder="e.g. Amina"
            autoFocus
            autoComplete="given-name"
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1A1A1A] w-full transition-colors placeholder-gray-400"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Partner&apos;s name
          </label>
          <input
            type="text"
            value={partner2Name}
            onChange={(e) => onPartner2NameChange(e.target.value)}
            placeholder="e.g. David"
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1A1A1A] w-full transition-colors placeholder-gray-400"
          />
        </div>
      </div>
    </div>
  )
}

// ── Step 2: The big day ────────────────────────────────────────────────────

function Step2({
  weddingDate,
  onWeddingDateChange,
  dateUndecided,
  onDateUndecidedChange,
  city,
  onCityChange,
  region,
  onRegionChange,
}: {
  weddingDate: string
  onWeddingDateChange: (v: string) => void
  dateUndecided: boolean
  onDateUndecidedChange: (v: boolean) => void
  city: string
  onCityChange: (v: string) => void
  region: string
  onRegionChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A] leading-tight mb-2">
          The big day.
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          Tell us about your wedding date and location.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Wedding date */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Wedding date
          </label>
          <input
            type="date"
            value={weddingDate}
            onChange={(e) => onWeddingDateChange(e.target.value)}
            disabled={dateUndecided}
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1A1A1A] w-full transition-colors disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
          <label className="flex items-center gap-2.5 cursor-pointer select-none mt-0.5">
            <div
              aria-hidden="true"
              className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all shrink-0 ${
                dateUndecided
                  ? 'bg-[#C9A0DC] border-[#C9A0DC]'
                  : 'border-gray-300 bg-white hover:border-[#C9A0DC]'
              }`}
            >
              {dateUndecided && <Check size={11} strokeWidth={3} className="text-white" />}
            </div>
            <input
              type="checkbox"
              className="sr-only"
              checked={dateUndecided}
              onChange={(e) => {
                onDateUndecidedChange(e.target.checked)
                if (e.target.checked) onWeddingDateChange('')
              }}
            />
            <span className="text-sm text-gray-600">We haven&apos;t decided yet</span>
          </label>
        </div>

        {/* City */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            City
          </label>
          <input
            type="text"
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
            placeholder="e.g. Dar es Salaam"
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1A1A1A] w-full transition-colors placeholder-gray-400"
          />
        </div>

        {/* Region */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Region
          </label>
          <select
            value={region}
            onChange={(e) => onRegionChange(e.target.value)}
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1A1A1A] w-full transition-colors bg-white text-[#1A1A1A]"
          >
            <option value="">Select a region</option>
            {TZ_REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

// ── Step 3: The details ────────────────────────────────────────────────────

function Step3({
  guestCount,
  onGuestCountChange,
  budgetRange,
  onBudgetRangeChange,
  whatsappPhone,
  onWhatsappPhoneChange,
}: {
  guestCount: string
  onGuestCountChange: (v: string) => void
  budgetRange: string
  onBudgetRangeChange: (v: string) => void
  whatsappPhone: string
  onWhatsappPhoneChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A] leading-tight mb-2">
          The details.
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          All optional — helps us find the best vendors for you.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {/* Guest count */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Guest count
          </label>
          <input
            type="number"
            value={guestCount}
            onChange={(e) => onGuestCountChange(e.target.value)}
            placeholder="e.g. 150"
            min="1"
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1A1A1A] w-full transition-colors placeholder-gray-400"
          />
        </div>

        {/* Budget range */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Budget range
          </label>
          <div className="flex flex-wrap gap-2">
            {BUDGET_OPTIONS.map((opt) => (
              <button data-opus-button="neutral" data-opus-button-size="medium"
                key={opt.value}
                type="button"
                onClick={() => onBudgetRangeChange(budgetRange === opt.value ? '' : opt.value)}
                className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition-all ${
                  budgetRange === opt.value
                    ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                    : 'border-gray-200 text-[#1A1A1A] hover:border-gray-400 bg-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* WhatsApp phone */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            WhatsApp number{' '}
            <span className="text-gray-400 normal-case font-normal">(for vendor messages)</span>
          </label>
          <input
            type="tel"
            value={whatsappPhone}
            onChange={(e) => onWhatsappPhoneChange(e.target.value)}
            placeholder="+255 712 345 678"
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1A1A1A] w-full transition-colors placeholder-gray-400"
          />
        </div>
      </div>
    </div>
  )
}

// ── Step 4: What do you need? ──────────────────────────────────────────────

function Step4({
  selected,
  onToggle,
}: {
  selected: Set<string>
  onToggle: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A] leading-tight mb-2">
          What do you need?
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          Select at least one category — we&apos;ll show you the best vendors.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {CATEGORY_OPTIONS.map((cat) => {
          const isSelected = selected.has(cat.value)
          return (
            <button data-opus-button="neutral" data-opus-button-size="medium"
              key={cat.value}
              type="button"
              onClick={() => onToggle(cat.value)}
              className={`relative flex items-center justify-center px-3 py-4 rounded-xl border-2 text-center transition-all text-sm font-semibold ${
                isSelected
                  ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
                  : 'border-gray-200 text-[#1A1A1A] hover:border-gray-400 bg-white'
              }`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
                  <Check size={9} strokeWidth={3} className="text-white" />
                </div>
              )}
              {cat.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main wizard ────────────────────────────────────────────────────────────

export default function OnboardingClient({ existingProfile }: Props) {
  const router = useRouter()

  const [step, setStep] = useState(0) // 0-indexed
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1 state
  const [partner1Name, setPartner1Name] = useState(existingProfile?.partner1_name ?? '')
  const [partner2Name, setPartner2Name] = useState(existingProfile?.partner2_name ?? '')

  // Step 2 state
  const [weddingDate, setWeddingDate] = useState(existingProfile?.wedding_date ?? '')
  const [dateUndecided, setDateUndecided] = useState(existingProfile?.date_undecided ?? false)
  const [city, setCity] = useState(existingProfile?.city ?? '')
  const [region, setRegion] = useState(existingProfile?.region ?? '')

  // Step 3 state
  const [guestCount, setGuestCount] = useState(
    existingProfile?.guest_count != null ? String(existingProfile.guest_count) : '',
  )
  const [budgetRange, setBudgetRange] = useState(existingProfile?.budget_range ?? '')
  const [whatsappPhone, setWhatsappPhone] = useState(existingProfile?.whatsapp_phone ?? '')

  // Step 4 state
  const [preferredCategories, setPreferredCategories] = useState<Set<string>>(
    new Set(existingProfile?.preferred_categories ?? []),
  )

  const toggleCategory = (v: string) => {
    setPreferredCategories((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
  }

  const isNextEnabled = (): boolean => {
    switch (step) {
      case 0:
        return partner1Name.trim() !== '' && partner2Name.trim() !== ''
      case 1:
        return city.trim() !== '' && (dateUndecided || weddingDate !== '')
      case 2:
        return true // all optional
      case 3:
        return preferredCategories.size > 0
      default:
        return false
    }
  }

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1)
  }

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1)
  }

  const handleComplete = async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)

    try {
      const guestCountNum = guestCount.trim() ? parseInt(guestCount, 10) : null

      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner1Name: partner1Name.trim(),
          partner2Name: partner2Name.trim(),
          weddingDate: dateUndecided ? null : weddingDate || null,
          dateUndecided,
          city: city.trim(),
          region: region || null,
          guestCount: guestCountNum && !isNaN(guestCountNum) ? guestCountNum : null,
          budgetRange: budgetRange || null,
          whatsappPhone: whatsappPhone.trim() || null,
          preferredCategories: Array.from(preferredCategories),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Something went wrong')
      }

      router.push('/vendors')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      setError(message)
      toast.error(message)
      setSubmitting(false)
    }
  }

  const isLastStep = step === TOTAL_STEPS - 1

  const stepLabels = ['Your names', 'The big day', 'The details', 'What you need']

  return (
    <main className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8">
          {/* Header row */}
          <div className="flex items-center justify-between mb-8">
            <div className="w-16">
              {step > 0 && (
                <button data-opus-button="control"
                  type="button"
                  onClick={handleBack}
                  className="text-sm font-semibold text-gray-500 hover:text-[#1A1A1A] flex items-center gap-1 transition-colors"
                  aria-label="Go back"
                >
                  <ChevronLeft size={16} />
                  Back
                </button>
              )}
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <ProgressDots step={step} />
              <span className="text-xs text-gray-400 font-medium">
                Step {step + 1} of {TOTAL_STEPS} — {stepLabels[step]}
              </span>
            </div>

            <div className="w-16" />
          </div>

          {/* Step content */}
          <div className="mb-8">
            {step === 0 && (
              <Step1
                partner1Name={partner1Name}
                onPartner1NameChange={setPartner1Name}
                partner2Name={partner2Name}
                onPartner2NameChange={setPartner2Name}
              />
            )}
            {step === 1 && (
              <Step2
                weddingDate={weddingDate}
                onWeddingDateChange={setWeddingDate}
                dateUndecided={dateUndecided}
                onDateUndecidedChange={setDateUndecided}
                city={city}
                onCityChange={setCity}
                region={region}
                onRegionChange={setRegion}
              />
            )}
            {step === 2 && (
              <Step3
                guestCount={guestCount}
                onGuestCountChange={setGuestCount}
                budgetRange={budgetRange}
                onBudgetRangeChange={setBudgetRange}
                whatsappPhone={whatsappPhone}
                onWhatsappPhoneChange={setWhatsappPhone}
              />
            )}
            {step === 3 && (
              <Step4 selected={preferredCategories} onToggle={toggleCategory} />
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 mb-4 text-center">{error}</p>
          )}

          {/* CTA */}
          <button data-opus-button="primary" data-opus-button-size="large"
            type="button"
            onClick={isLastStep ? handleComplete : handleNext}
            disabled={!isNextEnabled() || submitting}
            className="w-full bg-(--accent) text-(--on-accent) hover:bg-(--accent-hover) rounded-full px-6 py-3 font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {isLastStep ? 'Complete' : 'Next'}
          </button>
        </div>

        {/* Skip link */}
        <p className="text-center mt-4">
          <button data-opus-button="control"
            type="button"
            onClick={() => router.push('/vendors')}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Skip for now
          </button>
        </p>
      </div>
    </main>
  )
}
