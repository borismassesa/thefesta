'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronRight,
  CircleDashed,
  Lock,
  Minus,
  Package,
  Sparkles,
} from 'lucide-react'
import { useOnboardingDraft } from '@/lib/onboarding/draft'
import {
  computeCompleteness,
  getStorefrontSections,
  type SectionStatus,
} from '@/lib/storefront/completion'
import { sellsProducts } from '@/lib/onboarding/verticals'
import { useVendorVertical } from '@/lib/onboarding/vertical-context'
import { cn } from '@/lib/utils'

export function StorefrontSidebar() {
  const pathname = usePathname()
  const { draft, hydrated } = useOnboardingDraft()
  const vertical = useVendorVertical()
  const sells = sellsProducts(vertical)

  if (!hydrated) {
    return (
      <div
        className="w-72 shrink-0 border-r border-gray-100 bg-white h-full"
        aria-hidden
      />
    )
  }

  // No onboarding gate here: every vendor that reaches the portal is already
  // approved-and-active (the server portal layout redirects everyone else).
  // The old `!draft.categoryId || !draft.submittedAt` check hid the sidebar
  // for approved vendors whose localStorage draft was empty (fresh device,
  // cleared storage, admin approval), matching the dead-end lock screen the
  // storefront layout used to show. Completion still reads from the draft;
  // it simply starts empty until the vendor saves a section.
  const sections = getStorefrontSections(draft, vertical)
  const {
    percent,
    isReady,
    requiredComplete,
    requiredTotal,
    optionalComplete,
    optionalTotal,
    requiredMissing,
    optionalMissing,
  } = computeCompleteness(sections)

  return (
    <aside className="w-72 shrink-0 border-r border-gray-100 bg-white h-full flex flex-col">
      {/* Top header */}
      <div className="px-5 pt-6 pb-4 border-b border-gray-100">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
          Storefront
        </p>
        <h2 className="text-base font-semibold text-gray-900 tracking-tight mt-1">
          Manage your storefront
        </h2>
      </div>

      {/* Nav — fills available space, scrolls internally if it overflows */}
      <nav
        className="flex-1 overflow-y-auto p-2"
        aria-label="Storefront sections"
      >
        {sections.map((section) => {
          const isActive = pathname === section.href
          return (
            <Link
              key={section.id}
              href={section.href}
              className={cn(
                'group flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors',
                isActive ? 'bg-gray-100' : 'hover:bg-gray-50',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <StatusIcon status={section.status} />
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'text-sm font-semibold',
                      isActive ? 'text-gray-900' : 'text-gray-800',
                    )}
                  >
                    {section.label}
                  </span>
                  {section.required &&
                  section.status !== 'complete' &&
                  section.status !== 'auto' ? (
                    <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700">
                      Required
                    </span>
                  ) : null}
                </span>
                <span className="block text-xs text-gray-500 mt-0.5 truncate">
                  {section.hint}
                </span>
              </span>
              <ChevronRight
                className={cn(
                  'w-4 h-4 mt-1 shrink-0 transition-transform',
                  isActive
                    ? 'text-gray-700 translate-x-0.5'
                    : 'text-gray-300 group-hover:text-gray-600 group-hover:translate-x-0.5',
                )}
                aria-hidden
              />
            </Link>
          )
        })}

        {/* Products is a separate, moderation-driven surface (not part of the
            completeness ring) shown only to product-selling vendors. */}
        {sells ? (
          <Link
            href="/storefront/products"
            className={cn(
              'group mt-1 flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors',
              pathname.startsWith('/storefront/products') ? 'bg-gray-100' : 'hover:bg-gray-50',
            )}
            aria-current={pathname.startsWith('/storefront/products') ? 'page' : undefined}
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
              <Package className="h-3 w-3" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-gray-800">Products</span>
              <span className="mt-0.5 block truncate text-xs text-gray-500">
                Items you sell in the shop
              </span>
            </span>
            <ChevronRight
              className={cn(
                'mt-1 h-4 w-4 shrink-0 transition-transform',
                pathname.startsWith('/storefront/products')
                  ? 'translate-x-0.5 text-gray-700'
                  : 'text-gray-300 group-hover:translate-x-0.5 group-hover:text-gray-600',
              )}
              aria-hidden
            />
          </Link>
        ) : null}
      </nav>

      {/* Bottom: completion summary + clear next step */}
      <div className="border-t border-gray-100 px-5 pt-5 pb-5 bg-white">
        <div className="flex items-center gap-4">
          <CircularProgress percent={percent} ready={isReady} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight">
              {isReady ? 'Ready for couples' : 'Profile completeness'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {isReady
                ? optionalComplete === optionalTotal
                  ? 'Every section complete'
                  : `${optionalComplete} of ${optionalTotal} extras added`
                : `${requiredComplete} of ${requiredTotal} essentials done`}
            </p>
          </div>
        </div>

        {!isReady ? (
          // One clear next action beats a count the vendor has to translate
          // into "so where do I go?". Deep-links straight to the first
          // unfinished required section.
          <Link
            href={requiredMissing[0].href}
            className="group mt-4 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5 hover:bg-amber-100/70 transition-colors"
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="flex-1 min-w-0 text-xs text-amber-900 leading-snug">
              <span className="font-semibold">
                {requiredMissing.length} required section
                {requiredMissing.length === 1 ? '' : 's'} left.
              </span>{' '}
              Finish {requiredMissing[0].label.toLowerCase()}.
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-amber-600 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : optionalMissing.length > 0 ? (
          // Required work is done — pivot from nagging to encouraging. Point at
          // an optional section that makes the public profile stronger.
          <Link
            href={optionalMissing[0].href}
            className="group mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 hover:bg-emerald-100/70 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="flex-1 min-w-0 text-xs text-emerald-900 leading-snug">
              <span className="font-semibold">Stand out:</span> add{' '}
              {optionalMissing[0].label.toLowerCase()}.
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-emerald-600 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5">
            <span className="mt-0.5 shrink-0 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
              <Check className="w-2.5 h-2.5" strokeWidth={3} />
            </span>
            <p className="text-xs text-emerald-900 leading-snug">
              Couples can discover and book you. Keep it fresh as your work grows.
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}

function CircularProgress({ percent, ready }: { percent: number; ready?: boolean }) {
  const size = 56
  const stroke = 5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.max(0, Math.min(100, percent)) / 100) * circumference

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ready ? 'Storefront ready for couples' : `Profile ${percent}% complete`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-gray-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-emerald-500 transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums text-gray-900">
        {ready ? (
          <Check className="w-5 h-5 text-emerald-500" strokeWidth={3} aria-hidden />
        ) : (
          `${percent}%`
        )}
      </span>
    </div>
  )
}

function StatusIcon({ status }: { status: SectionStatus }) {
  if (status === 'complete') {
    return (
      <span
        className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center"
        aria-label="Complete"
      >
        <Check className="w-3 h-3" strokeWidth={3} />
      </span>
    )
  }
  if (status === 'partial') {
    return (
      <span
        className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center"
        aria-label="Partially complete"
      >
        <Minus className="w-3 h-3" strokeWidth={3} />
      </span>
    )
  }
  if (status === 'auto') {
    return (
      <span
        className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center"
        aria-label="Auto-collected"
      >
        <Lock className="w-3 h-3" />
      </span>
    )
  }
  return (
    <span
      className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center"
      aria-label="Not started"
    >
      <CircleDashed className="w-3.5 h-3.5" />
    </span>
  )
}

