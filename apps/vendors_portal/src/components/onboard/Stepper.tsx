'use client'

import Link from 'next/link'
import { Fragment } from 'react'
import { Check } from 'lucide-react'
import Logo from '../ui/Logo'
import { LocaleToggle } from '../LocaleToggle'
import {
  hasCompletePayout,
  useOnboardingDraft,
  type OnboardingDraft,
} from '@/lib/onboarding/draft'
import { localizeProfileLabel } from '@/lib/onboarding/categories'
import { sellsProducts } from '@/lib/onboarding/verticals'
import { pick } from '@/lib/onboarding/localize'
import { useOnboardT } from '@/lib/onboarding/strings'
import { cn } from '@/lib/utils'

export type StepKey = 'profile' | 'details' | 'pricing' | 'review'

type Step = {
  key: StepKey
  label: string
  href: string
  isComplete: (draft: OnboardingDraft) => boolean
}

const profileComplete = (d: OnboardingDraft) =>
  Boolean(
    d.firstName.trim() &&
      d.lastName.trim() &&
      d.houseNumber.trim() &&
      d.street.trim() &&
      d.ward.trim() &&
      d.district.trim() &&
      d.region &&
      d.phone.trim().length >= 9 &&
      d.email.trim() &&
      d.whatsapp.trim() &&
      d.serviceMarkets.length >= 0,
  )

// Product vendors skip the service-shaped steps (style, personality, packages,
// booking policies), so requiring those here would leave their Details and
// Pricing circles grey however much they fill in. Both predicates drop to the
// parts their vertical actually walks through.
const detailsComplete = (d: OnboardingDraft) =>
  Boolean(
    d.bio.trim().length >= 80 &&
      d.yearsInBusiness.trim() &&
      d.languages.length > 0 &&
      (sellsProducts(d.vertical) || (d.style && d.personality)),
  )

const pricingComplete = (d: OnboardingDraft) => {
  if (!hasCompletePayout(d)) return false
  if (sellsProducts(d.vertical)) return true
  return (
    d.packages.length > 0 &&
    d.packages.every((p) => p.name.trim() && p.price.trim()) &&
    Boolean(d.cancellationLevel) &&
    Boolean(d.reschedulePolicy)
  )
}

const reviewComplete = (d: OnboardingDraft) => Boolean(d.submittedAt)

export function Stepper({
  current,
  profileLabel,
}: {
  current: StepKey | null
  profileLabel: string
}) {
  const { draft, hydrated } = useOnboardingDraft()
  const { t, locale } = useOnboardT()

  // "Pricing" is packages-and-policies language. A shop never sets those, so
  // for product verticals the step is named and linked by what it really is.
  const isProductVendor = hydrated && sellsProducts(draft.vertical)
  const pricingLabel = isProductVendor
    ? pick(locale, 'Payout', 'Malipo yako')
    : t('stepper.pricing')
  const pricingHref = isProductVendor ? '/onboard/pricing/payout' : '/onboard/pricing'

  const steps: Step[] = [
    {
      key: 'profile',
      label: t('stepper.profile', { label: localizeProfileLabel(profileLabel, locale) }),
      href: '/onboard/profile/name',
      isComplete: profileComplete,
    },
    { key: 'details', label: t('stepper.details'), href: '/onboard/details/about', isComplete: detailsComplete },
    { key: 'pricing', label: pricingLabel, href: pricingHref, isComplete: pricingComplete },
    { key: 'review', label: t('stepper.review'), href: '/onboard/review', isComplete: reviewComplete },
  ]

  const completed = steps.map((s) => (hydrated ? s.isComplete(draft) : false))
  const completedCount = completed.filter(Boolean).length
  const progressPct =
    completedCount === 0 && current
      ? // Show partial fill on whichever step is active
        Math.max(8, ((steps.findIndex((s) => s.key === current) + 0.5) / steps.length) * 100)
      : (completedCount / steps.length) * 100

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="px-4 sm:px-6 lg:px-12 py-3 lg:py-4 flex items-center gap-2 sm:gap-3 lg:gap-4">
        <Link
          href="/"
          aria-label={t('stepper.aria.home')}
          className="shrink-0"
        >
          <Logo className="h-6 lg:h-7 w-auto text-gray-900" />
        </Link>

        {/* On phones the header stays minimal — logo + language toggle. The thin
            progress bar below carries position, and the page's own H1 names the
            step. The labelled circle row returns at `sm`. */}
        <ol
          className="hidden sm:flex flex-1 min-w-0 items-center justify-center gap-1 lg:gap-2 text-sm overflow-x-auto hide-scrollbar"
          aria-label={t('stepper.aria.progress')}
        >
          {steps.map((step, i) => {
            const isActive = step.key === current
            const isComplete = completed[i] && !isActive
            // Show partial connector to active step from the previous completed one
            const connectorActive = completed[i - 1] || (isActive && completed[i - 1])

            return (
              <Fragment key={step.key}>
                {i > 0 ? (
                  <li
                    aria-hidden
                    className={cn(
                      'h-[2px] w-4 sm:w-6 lg:w-10 rounded-full transition-colors duration-500',
                      connectorActive ? 'bg-emerald-500' : 'bg-gray-200',
                    )}
                  />
                ) : null}
                <li>
                  <StepItem
                    index={i + 1}
                    label={step.label}
                    isActive={isActive}
                    isComplete={isComplete}
                    href={isComplete ? step.href : undefined}
                  />
                </li>
              </Fragment>
            )
          })}
        </ol>

        {/* ml-auto pins the toggle to the right edge on phones, where the step
            row is hidden; on sm+ the flex-1 <ol> already fills the gap. */}
        <LocaleToggle className="shrink-0 ml-auto" />
      </div>

      {/* Progress bar — bottom edge of header */}
      <div className="h-1 w-full bg-gray-100 relative overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-emerald-500 transition-all duration-500 ease-out"
          style={{ width: `${progressPct}%` }}
          aria-hidden
        />
      </div>
    </header>
  )
}

function StepItem({
  index,
  label,
  isActive,
  isComplete,
  href,
}: {
  index: number
  label: string
  isActive: boolean
  isComplete: boolean
  href?: string
}) {
  const circle = (
    <span
      className={cn(
        'shrink-0 inline-flex items-center justify-center w-6 h-6 lg:w-7 lg:h-7 rounded-full text-xs font-bold transition-all duration-300',
        isActive && 'bg-[#1A1A1A] text-white shadow-md scale-105',
        isComplete && 'bg-emerald-500 text-white',
        !isActive && !isComplete && 'bg-white border-2 border-gray-300 text-gray-400',
      )}
      aria-hidden
    >
      {isComplete ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : index}
    </span>
  )

  const text = (
    <span
      className={cn(
        // Labels are hidden on mobile to keep the stepper compact — the page
        // heading already names the current step. Circles + progress bar carry
        // the wayfinding on small screens; full labels return at lg.
        'hidden lg:inline whitespace-nowrap transition-colors duration-200',
        isActive && 'text-gray-900 font-semibold',
        isComplete && 'text-emerald-700 font-semibold',
        !isActive && !isComplete && 'text-gray-400 font-medium',
      )}
    >
      {label}
    </span>
  )

  const inner = (
    <>
      {circle}
      {text}
    </>
  )

  const baseClasses =
    'inline-flex items-center gap-1.5 lg:gap-2.5 px-1 sm:px-2 lg:px-2.5 py-1.5 rounded-full transition-colors'

  if (href && !isActive) {
    return (
      <Link
        href={href}
        className={cn(baseClasses, 'hover:bg-gray-50 group cursor-pointer')}
        aria-current={isActive ? 'step' : undefined}
      >
        {inner}
      </Link>
    )
  }

  return (
    <span
      className={baseClasses}
      aria-current={isActive ? 'step' : undefined}
    >
      {inner}
    </span>
  )
}
