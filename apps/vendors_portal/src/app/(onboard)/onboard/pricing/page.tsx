'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react'
import { OnboardShell } from '@/components/onboard/OnboardShell'
import { OnboardHeading } from '@/components/onboard/OnboardHeading'
import { PrimaryButton } from '@/components/onboard/PrimaryButton'
import { WhyWeAsk } from '@/components/onboard/WhyWeAsk'
import { FieldLabel, TextInput } from '@/components/onboard/FormField'
import { ConfirmDialog } from '@/components/onboard/ConfirmDialog'
import { useOnboardingDraft } from '@/lib/onboarding/draft'
import { findCategory } from '@/lib/onboarding/categories'
import { useOnboardT, type TFn } from '@/lib/onboarding/strings'
import { useServiceOnlyStep } from '@/lib/onboarding/use-service-only-step'
import {
  getStarterPackages,
  newPackage,
  type PackageDraft,
} from '@/lib/onboarding/packages'

type ConfirmKind = 'use-suggested' | 'start-fresh'

const sanitizePrice = (v: string) => v.replace(/[^\d]/g, '')

export default function PricingPage() {
  const router = useRouter()
  const { draft, update, hydrated } = useOnboardingDraft()
  const category = findCategory(draft.categoryId)
  const { t, tn } = useOnboardT()
  const categoryLabel = category?.profileLabel ?? 'your category'

  useEffect(() => {
    if (!hydrated) return
    if (!draft.categoryId) router.replace('/onboard/category')
    else if (!draft.vowsAccepted) router.replace('/onboard/vows')
  }, [hydrated, draft.categoryId, draft.vowsAccepted, router])

  useServiceOnlyStep('/onboard/pricing/payout')

  const packages = draft.packages
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null)

  const updatePackage = (id: string, patch: Partial<PackageDraft>) => {
    update({
      packages: packages.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })
  }

  const removePackage = (id: string) => {
    update({ packages: packages.filter((p) => p.id !== id) })
  }

  const addPackage = () => {
    update({ packages: [...packages, newPackage()] })
  }

  // Loads the category-specific starter templates. From the header (where
  // packages already exist) we ask the vendor to confirm. Typed prices are lost.
  const requestUseSuggested = () => {
    if (packages.length > 0) {
      setConfirm('use-suggested')
      return
    }
    update({ packages: getStarterPackages(draft.categoryId) })
  }

  // From the empty state, "Start from scratch" gives the vendor one blank
  // package to fill in. From the header it clears all packages, returning the
  // vendor to the empty state where they can pick again.
  const startWithBlankPackage = () => {
    update({ packages: [newPackage()] })
  }

  const requestClearAll = () => {
    if (packages.length === 0) return
    setConfirm('start-fresh')
  }

  const handleConfirm = () => {
    if (confirm === 'use-suggested') {
      update({ packages: getStarterPackages(draft.categoryId) })
    } else if (confirm === 'start-fresh') {
      update({ packages: [] })
    }
    setConfirm(null)
  }

  const updateInclude = (pkgId: string, idx: number, value: string) => {
    const pkg = packages.find((p) => p.id === pkgId)
    if (!pkg) return
    const next = [...pkg.includes]
    next[idx] = value
    updatePackage(pkgId, { includes: next })
  }

  const addInclude = (pkgId: string) => {
    const pkg = packages.find((p) => p.id === pkgId)
    if (!pkg) return
    updatePackage(pkgId, { includes: [...pkg.includes, ''] })
  }

  const removeInclude = (pkgId: string, idx: number) => {
    const pkg = packages.find((p) => p.id === pkgId)
    if (!pkg) return
    const next = pkg.includes.filter((_, i) => i !== idx)
    updatePackage(pkgId, { includes: next.length ? next : [''] })
  }

  const canContinue =
    packages.length > 0 &&
    packages.every((p) => p.name.trim() && p.price.trim())

  const onNext = () => {
    if (!canContinue) return
    router.push('/onboard/pricing/policies')
  }

  return (
    <OnboardShell
      step="pricing"
      profileLabel={category?.profileLabel ?? 'Vendor'}
      backHref="/onboard/details/personality"
      primaryAction={
        <PrimaryButton onClick={onNext} disabled={!canContinue}>
          {t('common.next_step')}
        </PrimaryButton>
      }
    >
      <OnboardHeading
        title={t('pricing.title')}
        description={t('pricing.subtitle')}
      />

      {/* Starting price + custom quotes. Global storefront settings */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_1px_2px_-1px_rgba(0,0,0,0.06),0_2px_8px_-3px_rgba(0,0,0,0.08)] p-6 lg:p-7 max-w-3xl">
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <FieldLabel>{t('pricing.starting_from.label')}</FieldLabel>
            <TextInput
              prefix="TSh"
              placeholder={t('pricing.starting_from.placeholder')}
              inputMode="numeric"
              value={draft.startingPrice}
              onChange={(e) =>
                update({ startingPrice: formatPrice(sanitizePrice(e.target.value)) })
              }
            />
            <p className="mt-2 text-xs text-gray-500">
              {t('pricing.starting_from.hint')}
            </p>
          </div>
          <div>
            <FieldLabel>&nbsp;</FieldLabel>
            <label className="flex items-start gap-3 cursor-pointer select-none p-3 -ml-3 rounded-lg hover:bg-gray-50">
              <input
                type="checkbox"
                checked={draft.customQuotes}
                onChange={(e) => update({ customQuotes: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-gray-900"
              />
              <span className="text-sm text-gray-900">
                <span className="font-semibold">{t('pricing.custom_quotes.label')}</span>
                <span className="block text-gray-500 text-xs mt-0.5">
                  {t('pricing.custom_quotes.hint')}
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Packages */}
      <div className="mt-10 max-w-3xl">
        <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-900 tracking-tight">{t('pricing.your_packages')}</h2>
          {packages.length > 0 ? (
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={requestUseSuggested}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                {t('pricing.use_suggested')}
              </button>
              <button
                type="button"
                onClick={requestClearAll}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                {t('pricing.start_from_scratch')}
              </button>
            </div>
          ) : null}
        </div>

        {packages.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center">
            <p className="text-sm text-gray-600">
              {t('pricing.empty')}
            </p>
            <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
              <PrimaryButton onClick={requestUseSuggested}>
                {t('pricing.use_suggested_for', { category: categoryLabel })}
              </PrimaryButton>
              <button
                type="button"
                onClick={startWithBlankPackage}
                className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('pricing.start_from_scratch')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {packages.map((pkg, i) => (
              <PackageCard
                key={pkg.id}
                t={t}
                index={i}
                pkg={pkg}
                onChange={(patch) => updatePackage(pkg.id, patch)}
                onIncludeChange={(idx, value) => updateInclude(pkg.id, idx, value)}
                onIncludeAdd={() => addInclude(pkg.id)}
                onIncludeRemove={(idx) => removeInclude(pkg.id, idx)}
                onRemove={() => removePackage(pkg.id)}
                removable={packages.length > 1}
              />
            ))}

            <button
              type="button"
              onClick={addPackage}
              className="w-full bg-white rounded-2xl border border-dashed border-gray-300 hover:border-gray-500 hover:bg-gray-50 transition-colors py-5 inline-flex items-center justify-center gap-2 text-sm font-semibold text-gray-900"
            >
              <Plus className="w-4 h-4" />
              {t('pricing.add_package')}
            </button>
          </div>
        )}
      </div>

      <div className="mt-10">
        <WhyWeAsk title={t('pricing.why.title')}>
          <p>{t('pricing.why.body1')}</p>
          <p>{t('pricing.why.body2')}</p>
        </WhyWeAsk>
      </div>

      <ConfirmDialog
        open={confirm === 'use-suggested'}
        title={t('pricing.replace.title')}
        description={<p>{t('pricing.replace.body', { category: categoryLabel })}</p>}
        confirmLabel={t('pricing.replace.confirm')}
        cancelLabel={t('pricing.replace.cancel')}
        tone="danger"
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === 'start-fresh'}
        title={t('pricing.clear.title')}
        description={<p>{tn('pricing.clear.body', packages.length)}</p>}
        confirmLabel={t('pricing.clear.confirm')}
        cancelLabel={t('pricing.clear.cancel')}
        tone="danger"
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />
    </OnboardShell>
  )
}

function PackageCard({
  t,
  index,
  pkg,
  onChange,
  onIncludeChange,
  onIncludeAdd,
  onIncludeRemove,
  onRemove,
  removable,
}: {
  t: TFn
  index: number
  pkg: PackageDraft
  onChange: (patch: Partial<PackageDraft>) => void
  onIncludeChange: (idx: number, value: string) => void
  onIncludeAdd: () => void
  onIncludeRemove: (idx: number) => void
  onRemove: () => void
  removable: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-[0_1px_2px_-1px_rgba(0,0,0,0.06),0_2px_8px_-3px_rgba(0,0,0,0.08)] p-6 lg:p-7 relative">
      <div className="flex items-start justify-between gap-4 mb-5">
        <span className="inline-flex items-center bg-gray-100 text-gray-700 text-xs font-semibold px-2.5 py-1 rounded-full">
          {t('pricing.package_n', { n: index + 1 })}
        </span>
        {removable ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t('pricing.remove_package')}
            className="-mr-2 -mt-2 p-2 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      <div className="grid sm:grid-cols-[1fr_auto] gap-4">
        <div className="min-w-0">
          <FieldLabel required>{t('pricing.package.name.label')}</FieldLabel>
          <TextInput
            placeholder={t('pricing.package.name.placeholder')}
            value={pkg.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div className="sm:w-56">
          <FieldLabel required>{t('pricing.package.price.label')}</FieldLabel>
          <TextInput
            prefix="TSh"
            placeholder={t('pricing.package.price.placeholder')}
            inputMode="numeric"
            value={pkg.price}
            onChange={(e) => onChange({ price: formatPrice(e.target.value.replace(/[^\d]/g, '')) })}
          />
        </div>
      </div>

      <div className="mt-5">
        <FieldLabel>{t('pricing.package.desc.label')}</FieldLabel>
        <TextInput
          placeholder={t('pricing.package.desc.placeholder')}
          value={pkg.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>

      <div className="mt-5">
        <FieldLabel>{t('pricing.package.included.label')}</FieldLabel>
        <div className="space-y-2">
          {pkg.includes.map((line, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-gray-400 shrink-0" aria-hidden>
                •
              </span>
              <TextInput
                className="flex-1"
                placeholder={t('pricing.package.item_n.placeholder', { n: idx + 1 })}
                value={line}
                onChange={(e) => onIncludeChange(idx, e.target.value)}
              />
              {pkg.includes.length > 1 ? (
                <button
                  type="button"
                  onClick={() => onIncludeRemove(idx)}
                  aria-label={t('pricing.remove_item')}
                  className="shrink-0 p-2 text-gray-400 hover:text-red-600 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onIncludeAdd}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('pricing.add_item')}
        </button>
      </div>
    </div>
  )
}

function formatPrice(digits: string) {
  if (!digits) return ''
  return new Intl.NumberFormat('en-TZ').format(Number(digits))
}
