'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Camera,
  Video,
  Flower2,
  Music2,
  ChefHat,
  Cake,
  ClipboardList,
  Heart,
  PartyPopper,
  Wand2,
  Building2,
  HelpCircle,
  Tag,
  CookingPot,
  BedDouble,
  Gift,
  Shirt,
  Gem,
  Sparkles,
  ArrowLeft,
  type LucideIcon,
} from 'lucide-react'
import Logo from '@/components/ui/Logo'
import { LocaleToggle } from '@/components/LocaleToggle'
import { OnboardHeading } from '@/components/onboard/OnboardHeading'
import { OptionCard } from '@/components/onboard/OptionCard'
import { useOnboardingDraft } from '@/lib/onboarding/draft'
import { categorySw } from '@/lib/onboarding/categories'
import { findVertical, type VendorVertical } from '@/lib/onboarding/verticals'
import { pick } from '@/lib/onboarding/localize'
import { useOnboardT } from '@/lib/onboarding/strings'

// Plain-object shape safe to pass across the server→client boundary.
export type ClientCategory = {
  id: string
  label: string
  iconName: string
  vertical: VendorVertical
  hint?: string
}

const ICON_MAP: Record<string, LucideIcon> = {
  Building2, ChefHat, Camera, Cake, Flower2, ClipboardList,
  Music2, Heart, Video, PartyPopper, Wand2, HelpCircle, Tag,
  CookingPot, BedDouble, Gift, Shirt, Gem, Sparkles,
}

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Tag
}

const MAX_CUSTOM_LABEL = 80

type Props = {
  categories: ClientCategory[]
  otherCategory: ClientCategory
}

export default function CategoryPageClient({ categories, otherCategory }: Props) {
  const router = useRouter()
  const { draft, update, hydrated } = useOnboardingDraft()
  const { t, locale } = useOnboardT()
  const [customLabel, setCustomLabel] = useState(draft.customCategoryLabel ?? '')

  const vertical = draft.vertical
  const verticalOption = findVertical(vertical)

  // The vertical is step zero and lives in the draft, so a vendor who deep-links
  // or bookmarks this page can land here without one. Send them back to pick it
  // rather than showing the flat, unfiltered list this fork exists to replace.
  useEffect(() => {
    if (hydrated && !vertical) router.replace('/onboard')
  }, [hydrated, vertical, router])

  const visibleCategories = categories.filter((cat) => cat.vertical === vertical)

  // "Something else" is a service-vendor escape hatch: it files a
  // vendor_category_request for the team to triage. Product verticals have a
  // fixed catalogue of shop types, so it isn't offered there.
  const showOther = vertical === 'service'

  const select = (id: string) => {
    if (id !== 'other') {
      update({ categoryId: id, customCategoryLabel: '' })
      router.push('/onboard/vows')
    } else {
      update({ categoryId: 'other' })
    }
  }

  const confirmOther = () => {
    const label = customLabel.trim()
    if (!label) return
    update({ categoryId: 'other', customCategoryLabel: label })
    router.push('/onboard/vows')
  }

  const isOtherSelected = hydrated && draft.categoryId === 'other'

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="bg-white border-b border-gray-100">
        <div className="px-6 lg:px-12 py-4 flex items-center justify-between">
          <Link href="/" aria-label={t('stepper.aria.home')} className="shrink-0">
            <Logo className="h-7 w-auto text-gray-900" />
          </Link>
          <LocaleToggle />
        </div>
      </header>

      <main className="px-6 lg:px-12 py-10 lg:py-14">
        <div className="max-w-3xl mx-auto pb-24">
          <Link
            href="/onboard"
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {verticalOption
              ? pick(locale, verticalOption.label, verticalOption.labelSw)
              : pick(locale, 'Back', 'Rudi')}
          </Link>

          <OnboardHeading title={t('category.title')} />

          <div className="grid sm:grid-cols-2 gap-3 lg:gap-4">
            {visibleCategories.map((cat) => {
              const Icon = resolveIcon(cat.iconName)
              return (
                <OptionCard
                  key={cat.id}
                  variant="plain"
                  selected={hydrated && draft.categoryId === cat.id}
                  onToggle={() => select(cat.id)}
                  label={pick(locale, cat.label, categorySw(cat.id)?.label)}
                  icon={<Icon className="w-5 h-5" />}
                  hint={pick(locale, cat.hint ?? '', categorySw(cat.id)?.hint) || undefined}
                />
              )
            })}
          </div>

          {hydrated && vertical && visibleCategories.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 px-5 py-8 text-center text-sm text-gray-500">
              {pick(
                locale,
                'We could not load the shop types just now. Please refresh, or come back in a moment.',
                'Hatukuweza kupakia aina za maduka kwa sasa. Tafadhali onyesha upya, au rudi baadaye kidogo.',
              )}
            </p>
          ) : null}

          {showOther ? (
            <div className="mt-3 lg:mt-4">
              {(() => {
                const Icon = resolveIcon(otherCategory.iconName)
                return (
                  <OptionCard
                    variant="plain"
                    selected={isOtherSelected}
                    onToggle={() => select('other')}
                    label={pick(locale, otherCategory.label, categorySw('other')?.label)}
                    icon={<Icon className="w-5 h-5" />}
                  />
                )
              })()}
            </div>
          ) : null}

          {isOtherSelected && (
            <div className="mt-4 flex flex-col gap-3">
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value.slice(0, MAX_CUSTOM_LABEL))}
                onKeyDown={(e) => e.key === 'Enter' && confirmOther()}
                placeholder={t('category.custom_placeholder')}
                maxLength={MAX_CUSTOM_LABEL}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                autoFocus
              />
              <div className="flex items-center justify-between">
                <button data-opus-button="primary" data-opus-button-size="medium"
                  onClick={confirmOther}
                  disabled={!customLabel.trim()}
                  className="px-6 py-2.5 bg-[#1A1A1A] text-white text-sm font-semibold rounded-lg hover:bg-black transition-colors disabled:opacity-40"
                >
                  {t('common.continue')}
                </button>
                <span className="text-xs text-gray-400 tabular-nums">
                  {customLabel.length}/{MAX_CUSTOM_LABEL}
                </span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
