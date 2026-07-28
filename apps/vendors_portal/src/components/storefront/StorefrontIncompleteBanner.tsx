'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useOnboardingDraft } from '@/lib/onboarding/draft'
import {
  computeCompleteness,
  getStorefrontSections,
} from '@/lib/storefront/completion'
import { useVendorVertical } from '@/lib/onboarding/vertical-context'

export function StorefrontIncompleteBanner() {
  const { draft, hydrated } = useOnboardingDraft()
  const vertical = useVendorVertical()

  if (!hydrated) return null
  // Don't show until the vendor has at least submitted onboarding — otherwise
  // the dashboard banner duplicates the post-submission empty state.
  if (!draft.submittedAt) return null

  const sections = getStorefrontSections(draft, vertical)
  const { percent, requiredMissing } = computeCompleteness(sections)

  if (requiredMissing.length === 0) return null

  const next = requiredMissing[0]

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4 mb-6">
      <span
        className="shrink-0 mt-0.5 w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center"
        aria-hidden
      >
        <AlertTriangle className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-amber-900">
          Your storefront is {percent}% complete
        </h3>
        <p className="text-sm text-amber-900/80 mt-0.5 leading-relaxed">
          {requiredMissing.length} required section
          {requiredMissing.length === 1 ? '' : 's'} —{' '}
          <span className="font-semibold">
            {requiredMissing
              .slice(0, 3)
              .map((s) => s.label)
              .join(', ')}
            {requiredMissing.length > 3
              ? `, +${requiredMissing.length - 3} more`
              : ''}
          </span>{' '}
          — still need attention before couples can book you.
        </p>
      </div>
      <Link
        href={next.href}
        className="shrink-0 inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors"
      >
        Finish {next.label.toLowerCase()}
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}
