'use client'

import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { SignUp } from '@clerk/nextjs'
import {
  X,
  ChevronLeft,
  Check,
  Bell,
  Gem,
  ClipboardList,
  Home,
  CheckCircle2,
  MapPin,
  Camera,
  Video,
  Flower2,
  UtensilsCrossed,
  Cake,
  Music2,
  Sparkles,
  Star,
  Users,
  Banknote,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

type Phase = {
  label: string
  steps: number[]
}

type CategoryCard = {
  id: string
  label: string
  Icon: LucideIcon
}

type TopPickVendor = {
  name: string
  category: string
  city: string
  rating: number
  reviews: number
  guests: string
  price: string
  img: string
  excerpt: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const PHASES: Phase[] = [
  { label: 'Your wedding', steps: [0, 1, 2] },
  { label: 'Find vendors', steps: [3, 4, 5] },
  { label: 'The basics', steps: [6, 7, 8, 9] },
]

const STEP_IMAGES: Record<number, string> = {
  0: '/assets/images/authentic_couple.jpg',
  1: '/assets/images/beautiful_bride.jpg',
  2: '/assets/images/churchcouples.jpg',
  3: '/assets/images/bride_umbrella.jpg',
  4: '/assets/images/flowers_pinky.jpg',
  5: '/assets/images/mauzo_crew.jpg',
  6: '/assets/images/couples_together.jpg',
  7: 'SPECIAL',
  8: '/assets/images/cutesy_couple.jpg',
  9: 'NONE',
}

const PLANNING_STAGES = [
  { id: 'not-engaged', label: 'Not yet engaged', Icon: Bell },
  { id: 'newly-engaged', label: 'Newly engaged and exploring', Icon: Gem },
  { id: 'no-venue', label: "Planning mode but haven't booked a venue yet", Icon: ClipboardList },
  { id: 'have-venue', label: 'Planning mode and already booked a venue', Icon: Home },
  { id: 'almost-done', label: 'Almost done, just the details left', Icon: CheckCircle2 },
]

const CATEGORIES: CategoryCard[] = [
  { id: 'venues', label: 'Venues', Icon: MapPin },
  { id: 'photographers', label: 'Photographers', Icon: Camera },
  { id: 'videographers', label: 'Videographers', Icon: Video },
  { id: 'florists', label: 'Florists', Icon: Flower2 },
  { id: 'caterers', label: 'Caterers', Icon: UtensilsCrossed },
  { id: 'wedding-cakes', label: 'Wedding Cakes', Icon: Cake },
  { id: 'djs-bands', label: 'DJs & Bands', Icon: Music2 },
  { id: 'hair-makeup', label: 'Hair & Makeup', Icon: Sparkles },
  { id: 'wedding-planners', label: 'Wedding Planners', Icon: ClipboardList },
]

const VENUE_TYPES = [
  'Ballrooms',
  'Waterfront settings',
  'Barns',
  'Country clubs',
  'Historic estates',
  'Hotels',
  'Industrial spaces',
  'Lodges',
  'Museums',
  'Gardens',
  'Restaurants',
  'Vineyards',
]

const REFERRAL_LEFT = [
  'Blog or article',
  'AI search (e.g. ChatGPT, Gemini)',
  'YouTube',
  'Bought a gift on OpusFesta',
  'Subway or billboard',
  'In the news',
  'Google search',
  'Pinterest',
  'Podcast',
]

const REFERRAL_RIGHT = [
  'Reddit',
  'Facebook',
  'Streaming service or TV',
  'Instagram',
  'Wedding vendor',
  'TikTok',
  'Friends and family',
  'Other (please specify)',
]

const TOP_PICKS: TopPickVendor[] = [
  {
    name: 'The Zanzibar Pearl',
    category: 'Venues',
    city: 'Zanzibar',
    rating: 4.9,
    reviews: 127,
    guests: 'Up to 300 guests',
    price: 'From TZS 8,000,000',
    img: '/assets/images/coupleswithpiano.jpg',
    excerpt: 'A stunning beachfront venue with panoramic ocean views...',
  },
  {
    name: 'Kibwe Photo Studios',
    category: 'Photographers',
    city: 'Dar es Salaam',
    rating: 4.8,
    reviews: 84,
    guests: 'Any size',
    price: 'From TZS 2,500,000',
    img: '/assets/images/authentic_couple.jpg',
    excerpt: 'Award-winning photography studio capturing authentic moments...',
  },
  {
    name: 'Bloom & Petals',
    category: 'Florists',
    city: 'Arusha',
    rating: 4.7,
    reviews: 62,
    guests: 'Any size',
    price: 'From TZS 800,000',
    img: '/assets/images/flowers_pinky.jpg',
    excerpt: 'Boutique floral design studio specialising in East African blooms...',
  },
  {
    name: 'Serengeti Sounds',
    category: 'DJs & Bands',
    city: 'Dar es Salaam',
    rating: 4.9,
    reviews: 103,
    guests: 'Any size',
    price: 'From TZS 1,200,000',
    img: '/assets/images/mauzo_crew.jpg',
    excerpt: "Tanzania's top live band and DJ collective for unforgettable receptions...",
  },
]

// ── Sub-components ─────────────────────────────────────────────────────────

function PhaseIndicator({ currentStep }: { currentStep: number }) {
  const currentPhaseIndex = PHASES.findIndex((p) => p.steps.includes(currentStep))

  return (
    <div className="flex items-center justify-center gap-0 w-full">
      {PHASES.map((phase, idx) => {
        const isDone = idx < currentPhaseIndex
        const isActive = idx === currentPhaseIndex
        const isFuture = idx > currentPhaseIndex
        const isLast = idx === PHASES.length - 1

        return (
          <div key={phase.label} className="flex items-center">
            {/* Phase node */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isDone
                    ? 'bg-[#1A1A1A] text-white'
                    : isActive
                    ? 'bg-[#1A1A1A] text-white'
                    : 'border-2 border-gray-300 text-gray-400 bg-white'
                }`}
              >
                {isDone ? <Check size={13} strokeWidth={3} /> : idx + 1}
              </div>
              <span
                className={`text-[11px] whitespace-nowrap font-semibold ${
                  isActive ? 'text-[#1A1A1A]' : isFuture ? 'text-gray-400' : 'text-[#1A1A1A]'
                }`}
              >
                {phase.label}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div className="w-12 sm:w-16 h-0.5 bg-gray-200 mx-2 mb-5 relative overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-[#1A1A1A] transition-all duration-500"
                  style={{ width: isDone ? '100%' : '0%' }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CustomCheckbox({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  id: string
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2.5 cursor-pointer select-none group">
      <div
        className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all shrink-0 ${
          checked
            ? 'bg-[#C9A0DC] border-[#C9A0DC]'
            : 'border-gray-300 bg-white group-hover:border-[#C9A0DC]'
        }`}
        onClick={() => onChange(!checked)}
      >
        {checked && <Check size={11} strokeWidth={3} className="text-white" />}
      </div>
      <input
        type="checkbox"
        id={id}
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm text-gray-600">{label}</span>
    </label>
  )
}

// ── Step content components ────────────────────────────────────────────────

function Step0({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-[#1A1A1A] leading-tight mb-2">
          Welcome! Where are you in the planning process?
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          Whether you're just starting to look around or in the final countdown, we've got you.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {PLANNING_STAGES.map(({ id, label, Icon }) => (
          <button data-opus-button="neutral" data-opus-button-size="medium"
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 text-left transition-all ${
              selected === id
                ? 'border-[#1A1A1A] bg-gray-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <Icon size={20} className="shrink-0 text-[#1A1A1A]" />
            <span className="text-sm font-semibold text-[#1A1A1A]">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Step1({
  location,
  onLocationChange,
  undecided,
  onUndecidedChange,
}: {
  location: string
  onLocationChange: (v: string) => void
  undecided: boolean
  onUndecidedChange: (v: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A] leading-tight mb-2">
          Now, let's talk about The Day
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          We'll help you plan the wedding you want — small or big, near or far.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-sm font-semibold text-[#1A1A1A]">
          Where are you getting married? (Best guesses welcome!)
        </label>
        <input
          type="text"
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          disabled={undecided}
          placeholder="City or nearby area"
          className="w-full rounded-xl border border-gray-200 px-4 py-4 text-sm text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:border-[#1A1A1A] transition-all disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
        />
        <CustomCheckbox
          id="location-undecided"
          checked={undecided}
          onChange={(v) => {
            onUndecidedChange(v)
            if (v) onLocationChange('')
          }}
          label="We're still deciding"
        />
      </div>
    </div>
  )
}

function Step2({
  guestCount,
  onGuestCountChange,
  undecided,
  onUndecidedChange,
}: {
  guestCount: string
  onGuestCountChange: (v: string) => void
  undecided: boolean
  onUndecidedChange: (v: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A] leading-tight mb-2">
          Sounds like a party! Who's making the list?
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          Your guest count helps us suggest the right venues and caterers.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-sm font-semibold text-[#1A1A1A]">
          Enter your guest count (best guesses welcome!)
        </label>
        <input
          type="number"
          value={guestCount}
          onChange={(e) => onGuestCountChange(e.target.value)}
          disabled={undecided}
          placeholder="e.g. 150"
          min="1"
          className="w-full rounded-xl border border-gray-200 px-4 py-4 text-sm text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:border-[#1A1A1A] transition-all disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
        />
        <CustomCheckbox
          id="guests-undecided"
          checked={undecided}
          onChange={(v) => {
            onUndecidedChange(v)
            if (v) onGuestCountChange('')
          }}
          label="We're still deciding"
        />
      </div>
    </div>
  )
}

function Step3({
  budget,
  onBudgetChange,
  flexible,
  onFlexibleChange,
  undecided,
  onUndecidedChange,
}: {
  budget: string
  onBudgetChange: (v: string) => void
  flexible: boolean
  onFlexibleChange: (v: boolean) => void
  undecided: boolean
  onUndecidedChange: (v: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A] leading-tight mb-2">
          What is your wedding budget?
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          We'll help you find vendors within your price range.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-sm font-semibold text-[#1A1A1A]">
          Your total wedding budget (best guesses welcome!)
        </label>
        <div className="flex items-stretch">
          <span className="flex items-center px-4 rounded-l-xl border border-r-0 border-gray-200 bg-gray-50 text-sm font-semibold text-gray-500 select-none">
            TZS
          </span>
          <input
            type="text"
            value={budget}
            onChange={(e) => onBudgetChange(e.target.value)}
            disabled={undecided}
            placeholder="e.g. 5,000,000"
            className="flex-1 rounded-r-xl border border-gray-200 px-4 py-3 text-sm text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:border-[#1A1A1A] transition-all disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
        </div>
        <div className="flex flex-col gap-2.5 mt-1">
          <CustomCheckbox
            id="budget-flexible"
            checked={flexible}
            onChange={onFlexibleChange}
            label="This is flexible"
          />
          <CustomCheckbox
            id="budget-undecided"
            checked={undecided}
            onChange={(v) => {
              onUndecidedChange(v)
              if (v) onBudgetChange('')
            }}
            label="We're still deciding"
          />
        </div>
      </div>
    </div>
  )
}

function Step4({
  selected,
  onToggle,
}: {
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A] leading-tight mb-2">
          What are you most excited to explore?
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          We'll start here in bringing your wedding vision to life.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {CATEGORIES.map(({ id, label, Icon }) => {
          const isSelected = selected.has(id)
          return (
            <button data-opus-button="neutral" data-opus-button-size="small"
              key={id}
              type="button"
              onClick={() => onToggle(id)}
              className={`relative flex flex-col items-center justify-center gap-2 px-2 py-4 rounded-xl border-2 text-center transition-all ${
                isSelected
                  ? 'border-[#1A1A1A] bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#1A1A1A] flex items-center justify-center">
                  <Check size={9} strokeWidth={3} className="text-white" />
                </div>
              )}
              <Icon size={22} className="text-[#1A1A1A]" />
              <span className="text-xs font-semibold text-[#1A1A1A] leading-tight">{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Step5({
  selected,
  onToggle,
}: {
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A] leading-tight mb-2">
          What kind of wedding venue do you dream about?
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          Select multiple venue types to help us find amazing places you'll love.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {VENUE_TYPES.map((venue) => {
          const isSelected = selected.has(venue)
          return (
            <button data-opus-button="neutral" data-opus-button-size="large"
              key={venue}
              type="button"
              onClick={() => onToggle(venue)}
              className={`relative flex items-center justify-center px-2 py-3.5 rounded-xl border-2 text-center transition-all ${
                isSelected
                  ? 'border-[#1A1A1A] bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              {isSelected && (
                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#1A1A1A] flex items-center justify-center">
                  <Check size={9} strokeWidth={3} className="text-white" />
                </div>
              )}
              <span className="text-xs font-semibold text-[#1A1A1A] leading-tight">{venue}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Step6({
  firstName,
  onFirstNameChange,
  lastName,
  onLastNameChange,
  partnerFirstName,
  onPartnerFirstNameChange,
  partnerLastName,
  onPartnerLastNameChange,
  weddingDate,
  onWeddingDateChange,
  weddingDateUndecided,
  onWeddingDateUndecidedChange,
}: {
  firstName: string
  onFirstNameChange: (v: string) => void
  lastName: string
  onLastNameChange: (v: string) => void
  partnerFirstName: string
  onPartnerFirstNameChange: (v: string) => void
  partnerLastName: string
  onPartnerLastNameChange: (v: string) => void
  weddingDate: string
  onWeddingDateChange: (v: string) => void
  weddingDateUndecided: boolean
  onWeddingDateUndecidedChange: (v: boolean) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A] leading-tight">
          Almost there! Just need your basic details
        </h2>
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-600">First name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => onFirstNameChange(e.target.value)}
              placeholder="Ada"
              autoComplete="given-name"
              className="w-full rounded-xl border border-gray-200 px-4 py-4 text-sm text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:border-[#1A1A1A] transition-all"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-600">Last name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => onLastNameChange(e.target.value)}
              placeholder="Mwamba"
              autoComplete="family-name"
              className="w-full rounded-xl border border-gray-200 px-4 py-4 text-sm text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:border-[#1A1A1A] transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-600">Partner's first name</label>
            <input
              type="text"
              value={partnerFirstName}
              onChange={(e) => onPartnerFirstNameChange(e.target.value)}
              placeholder="James"
              className="w-full rounded-xl border border-gray-200 px-4 py-4 text-sm text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:border-[#1A1A1A] transition-all"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-600">Partner's last name</label>
            <input
              type="text"
              value={partnerLastName}
              onChange={(e) => onPartnerLastNameChange(e.target.value)}
              placeholder="Okonkwo"
              className="w-full rounded-xl border border-gray-200 px-4 py-4 text-sm text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:border-[#1A1A1A] transition-all"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <label className="text-xs font-semibold text-gray-600">Wedding date</label>
            <span className="text-xs text-gray-400">(Don't worry! You can change this later)</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={weddingDate}
              onChange={(e) => onWeddingDateChange(e.target.value)}
              disabled={weddingDateUndecided}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-4 text-sm text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:border-[#1A1A1A] transition-all disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            />
            <CustomCheckbox
              id="wedding-date-undecided"
              checked={weddingDateUndecided}
              onChange={(v) => {
                onWeddingDateUndecidedChange(v)
                if (v) onWeddingDateChange('')
              }}
              label="We're still deciding"
            />
          </div>
        </div>

        <p className="text-xs text-gray-400 text-right">All fields required</p>
      </div>
    </div>
  )
}

function Step7({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A] leading-tight mb-1">
          Now, create your login.
        </h2>
        <p className="text-sm text-gray-500">Sign up with Google, Apple, or your email.</p>
      </div>

      <SignUp
        routing="hash"
        appearance={{
          elements: {
            rootBox: 'w-full',
            card: 'shadow-none p-0 bg-transparent',
            headerTitle: 'hidden',
            headerSubtitle: 'hidden',
            socialButtonsBlockButton: 'rounded-xl border border-gray-200 font-semibold text-[#1A1A1A] hover:bg-gray-50',
            dividerLine: 'bg-gray-200',
            dividerText: 'text-gray-400 text-xs',
            formFieldInput: 'rounded-xl border-gray-200 focus:border-[#1A1A1A] text-sm py-4',
            formButtonPrimary: 'rounded-full bg-[#1A1A1A] hover:bg-black/80 text-sm font-bold',
            footerActionLink: 'text-[#1A1A1A] font-semibold',
            identityPreviewText: 'text-sm text-gray-600',
            formResendCodeLink: 'text-[#1A1A1A]',
          },
        }}
        fallbackRedirectUrl="/"
        signInUrl="#"
      />
    </div>
  )
}

function Step8({
  referralSources,
  onToggleReferral,
  otherReferral,
  onOtherReferralChange,
}: {
  referralSources: Set<string>
  onToggleReferral: (source: string) => void
  otherReferral: string
  onOtherReferralChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A] leading-tight mb-2">
          One last thing! Who can we thank for sending you our way?
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        <div className="flex flex-col gap-3">
          {REFERRAL_LEFT.map((source) => (
            <CustomCheckbox
              key={source}
              id={`referral-${source}`}
              checked={referralSources.has(source)}
              onChange={() => onToggleReferral(source)}
              label={source}
            />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {REFERRAL_RIGHT.map((source) => {
            if (source === 'Other (please specify)') {
              return (
                <div key={source} className="flex flex-col gap-1">
                  <CustomCheckbox
                    id={`referral-${source}`}
                    checked={referralSources.has(source)}
                    onChange={() => onToggleReferral(source)}
                    label={source}
                  />
                  {referralSources.has(source) && (
                    <div className="ml-7 flex flex-col gap-0.5">
                      <input
                        type="text"
                        value={otherReferral}
                        onChange={(e) => onOtherReferralChange(e.target.value.slice(0, 50))}
                        placeholder="Other (please specify)"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:border-[#1A1A1A] transition-all"
                      />
                      <span className="text-xs text-gray-400 text-right">
                        {otherReferral.length}/50
                      </span>
                    </div>
                  )}
                </div>
              )
            }
            return (
              <CustomCheckbox
                key={source}
                id={`referral-${source}`}
                checked={referralSources.has(source)}
                onChange={() => onToggleReferral(source)}
                label={source}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Step9({
  selectedTopPicks,
  onToggleTopPick,
}: {
  selectedTopPicks: Set<string>
  onToggleTopPick: (name: string) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-[#1A1A1A] leading-tight mb-2">
          Our top picks for you
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          Select your favourite vendors to learn more
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {TOP_PICKS.map((vendor) => {
          const isSelected = selectedTopPicks.has(vendor.name)
          return (
            <button data-opus-button="neutral" data-opus-button-size="medium"
              key={vendor.name}
              type="button"
              onClick={() => onToggleTopPick(vendor.name)}
              className={`w-full flex items-center gap-4 p-3 rounded-xl border-2 text-left transition-all ${
                isSelected
                  ? 'border-[#22c55e] ring-1 ring-[#22c55e]/30 bg-green-50/30'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              {/* Checkbox */}
              <div
                className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-all ${
                  isSelected ? 'bg-[#22c55e] border-[#22c55e]' : 'border-gray-300 bg-white'
                }`}
              >
                {isSelected && <Check size={11} strokeWidth={3} className="text-white" />}
              </div>

              {/* Image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={vendor.img}
                alt={vendor.name}
                className="w-20 h-20 rounded-xl object-cover shrink-0"
              />

              {/* Details */}
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <p className="text-sm font-bold text-[#1A1A1A] truncate">{vendor.name}</p>
                <p className="text-xs text-gray-500">
                  {vendor.category} · {vendor.city}
                </p>
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <Star size={11} className="text-yellow-400 fill-yellow-400" />
                  <span className="font-semibold">{vendor.rating}</span>
                  <span className="text-gray-400">({vendor.reviews} reviews)</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Users size={11} />
                    {vendor.guests}
                  </span>
                  <span className="flex items-center gap-1">
                    <Banknote size={11} />
                    {vendor.price}
                  </span>
                </div>
                <p className="text-xs text-gray-400 truncate">{vendor.excerpt}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main modal component ───────────────────────────────────────────────────

export default function SignupModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const TOTAL_STEPS = 10

  // Step 0
  const [planningStage, setPlanningStage] = useState('')

  // Step 1
  const [location, setLocation] = useState('')
  const [locationUndecided, setLocationUndecided] = useState(false)

  // Step 2
  const [guestCount, setGuestCount] = useState('')
  const [guestsUndecided, setGuestsUndecided] = useState(false)

  // Step 3
  const [budget, setBudget] = useState('')
  const [budgetFlexible, setBudgetFlexible] = useState(false)
  const [budgetUndecided, setBudgetUndecided] = useState(false)

  // Step 4
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())

  // Step 5
  const [selectedVenueTypes, setSelectedVenueTypes] = useState<Set<string>>(new Set())

  // Step 6
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [partnerFirstName, setPartnerFirstName] = useState('')
  const [partnerLastName, setPartnerLastName] = useState('')
  const [weddingDate, setWeddingDate] = useState('')
  const [weddingDateUndecided, setWeddingDateUndecided] = useState(false)

  // Step 7

  // Step 8
  const [referralSources, setReferralSources] = useState<Set<string>>(new Set())
  const [otherReferral, setOtherReferral] = useState('')

  // Step 9
  const [selectedTopPicks, setSelectedTopPicks] = useState<Set<string>>(new Set())

  // Lock body scroll and listen for Escape
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)

    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Navigation helpers
  const isNextEnabled = (): boolean => {
    switch (step) {
      case 0: return planningStage !== ''
      case 1: return location.trim() !== '' || locationUndecided
      case 2: return guestCount.trim() !== '' || guestsUndecided
      case 3: return budget.trim() !== '' || budgetUndecided
      case 4: return true
      case 5: return true
      case 6:
        return (
          firstName.trim() !== '' &&
          lastName.trim() !== '' &&
          partnerFirstName.trim() !== '' &&
          partnerLastName.trim() !== '' &&
          (weddingDate !== '' || weddingDateUndecided)
        )
      case 7: return false // Clerk handles its own submit
      case 8: return true
      case 9: return true
      default: return false
    }
  }

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1)
  }

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1)
  }

  const handleSubmit = () => {
    // Placeholder: wire up real account creation
    onClose()
  }

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleVenueType = (venue: string) => {
    setSelectedVenueTypes((prev) => {
      const next = new Set(prev)
      if (next.has(venue)) next.delete(venue)
      else next.add(venue)
      return next
    })
  }

  const toggleReferral = (source: string) => {
    setReferralSources((prev) => {
      const next = new Set(prev)
      if (next.has(source)) next.delete(source)
      else next.add(source)
      return next
    })
  }

  const toggleTopPick = (name: string) => {
    setSelectedTopPicks((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const isLastStep = step === TOTAL_STEPS - 1
  const currentImage = STEP_IMAGES[step]
  const isFullWidth = step === 9
  const isSpecialLeft = step === 7

  const getButtonLabel = () => {
    if (step === 9) return 'Finish'
    if (step === 8) return "Let's go"
    if (isLastStep) return 'Create my account'
    return 'Next'
  }

  return (
    /* Overlay */
    <div
      data-lenis-prevent
      className="fixed inset-0 z-200 flex"
    >
      {/* Modal — full screen */}
      <div
        className="relative flex w-full h-full bg-white overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Sign up for OpusFesta"
      >
        {/* ── Left panel (hidden on mobile, not shown for step 9) ── */}
        {!isFullWidth && (
          <div className="hidden md:block md:w-[40%] shrink-0 relative h-full">
            {isSpecialLeft ? (
              /* Step 7: celebration panel */
              <div className="absolute inset-0 bg-[#E8D5F5] flex flex-col items-center justify-center gap-8 px-10 overflow-hidden">
                {/* Interlocked rings SVG */}
                <div className="relative z-10">
                  <svg width="96" height="56" viewBox="0 0 96 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <circle cx="31" cy="28" r="26" stroke="#1A1A1A" strokeWidth="2.5" fill="none" />
                    <circle cx="65" cy="28" r="26" stroke="#1A1A1A" strokeWidth="2.5" fill="none" />
                    <path d="M48 7.2 C54 13 57 20 57 28 C57 36 54 43 48 48.8 C42 43 39 36 39 28 C39 20 42 13 48 7.2Z" fill="#1A1A1A" fillOpacity="0.1" />
                  </svg>
                </div>

                {/* Text */}
                <div className="relative z-10 text-center space-y-2">
                  <p className="text-black/50 text-sm tracking-wide">We're so excited for you,</p>
                  <p className="text-black text-2xl font-black tracking-tight leading-tight">
                    {firstName || 'You'} &amp; {partnerFirstName || 'Your partner'}
                  </p>
                </div>

                {/* Bottom tagline */}
                <p className="relative z-10 text-black/40 text-xs text-center tracking-widest uppercase">
                  Your day. Your way.
                </p>
              </div>
            ) : (
              /* Normal image panel */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={currentImage}
                src={currentImage}
                alt=""
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
              />
            )}
          </div>
        )}

        {/* ── Right form panel ── */}
        <div className={`flex flex-col bg-white overflow-y-auto ${isFullWidth ? 'w-full' : 'w-full md:w-[60%]'}`} data-lenis-prevent>
          {/* Header row */}
          <div className="shrink-0 flex items-start justify-between px-6 pt-14 pb-8 gap-3 max-w-2xl mx-auto w-full">
            {/* Back button */}
            <div className="w-16 shrink-0">
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

            {/* Phase indicator */}
            <div className="flex-1 flex justify-center">
              <PhaseIndicator currentStep={step} />
            </div>

            {/* Close button */}
            <div className="w-16 shrink-0 flex justify-end">
              <button data-opus-button="control"
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors shrink-0"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Step content */}
          <div className="px-8 pt-2 pb-4 max-w-2xl mx-auto w-full">
            {step === 0 && (
              <Step0 selected={planningStage} onSelect={setPlanningStage} />
            )}
            {step === 1 && (
              <Step1
                location={location}
                onLocationChange={setLocation}
                undecided={locationUndecided}
                onUndecidedChange={setLocationUndecided}
              />
            )}
            {step === 2 && (
              <Step2
                guestCount={guestCount}
                onGuestCountChange={setGuestCount}
                undecided={guestsUndecided}
                onUndecidedChange={setGuestsUndecided}
              />
            )}
            {step === 3 && (
              <Step3
                budget={budget}
                onBudgetChange={setBudget}
                flexible={budgetFlexible}
                onFlexibleChange={setBudgetFlexible}
                undecided={budgetUndecided}
                onUndecidedChange={setBudgetUndecided}
              />
            )}
            {step === 4 && (
              <Step4 selected={selectedCategories} onToggle={toggleCategory} />
            )}
            {step === 5 && (
              <Step5 selected={selectedVenueTypes} onToggle={toggleVenueType} />
            )}
            {step === 6 && (
              <Step6
                firstName={firstName}
                onFirstNameChange={setFirstName}
                lastName={lastName}
                onLastNameChange={setLastName}
                partnerFirstName={partnerFirstName}
                onPartnerFirstNameChange={setPartnerFirstName}
                partnerLastName={partnerLastName}
                onPartnerLastNameChange={setPartnerLastName}
                weddingDate={weddingDate}
                onWeddingDateChange={setWeddingDate}
                weddingDateUndecided={weddingDateUndecided}
                onWeddingDateUndecidedChange={setWeddingDateUndecided}
              />
            )}
            {step === 7 && (
              <Step7 onComplete={() => setStep(8)} />
            )}
            {step === 8 && (
              <Step8
                referralSources={referralSources}
                onToggleReferral={toggleReferral}
                otherReferral={otherReferral}
                onOtherReferralChange={setOtherReferral}
              />
            )}
            {step === 9 && (
              <Step9
                selectedTopPicks={selectedTopPicks}
                onToggleTopPick={toggleTopPick}
              />
            )}
          </div>

          {/* Bottom CTA — hidden on step 7, Clerk owns that submit */}
          {step !== 7 && (
          <div className="shrink-0 px-8 pt-8 pb-8 max-w-2xl mx-auto w-full flex justify-center">
            <button data-opus-button="primary" data-opus-button-size="medium"
              type="button"
              onClick={isLastStep ? handleSubmit : handleNext}
              disabled={!isNextEnabled()}
              className="w-full max-w-sm rounded-full bg-[#1A1A1A] py-4 text-sm font-bold text-white hover:bg-black/80 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {getButtonLabel()}
            </button>
          </div>
          )}
        </div>
      </div>
    </div>
  )
}
