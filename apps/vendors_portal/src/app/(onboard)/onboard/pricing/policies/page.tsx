'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Check } from 'lucide-react'
import { OnboardShell } from '@/components/onboard/OnboardShell'
import { OnboardHeading } from '@/components/onboard/OnboardHeading'
import { PrimaryButton } from '@/components/onboard/PrimaryButton'
import { WhyWeAsk } from '@/components/onboard/WhyWeAsk'
import { FieldLabel, TextInput } from '@/components/onboard/FormField'
import { OptionCard } from '@/components/onboard/OptionCard'
import { useOnboardingDraft } from '@/lib/onboarding/draft'
import { findCategory } from '@/lib/onboarding/categories'
import { pick } from '@/lib/onboarding/localize'
import { useOnboardT } from '@/lib/onboarding/strings'
import { useServiceOnlyStep } from '@/lib/onboarding/use-service-only-step'
import {
  CANCELLATION_OPTIONS,
  DEPOSIT_PRESETS,
  RESCHEDULE_OPTIONS,
} from '@/lib/onboarding/policies'
import { cn } from '@/lib/utils'

export default function PoliciesPage() {
  const router = useRouter()
  const { draft, update, hydrated } = useOnboardingDraft()
  const category = findCategory(draft.categoryId)
  const { t, locale } = useOnboardT()

  useEffect(() => {
    if (!hydrated) return
    if (!draft.categoryId) router.replace('/onboard/category')
    else if (!draft.vowsAccepted) router.replace('/onboard/vows')
    else if (draft.packages.length === 0) router.replace('/onboard/pricing')
  }, [hydrated, draft.categoryId, draft.vowsAccepted, draft.packages.length, router])

  useServiceOnlyStep('/onboard/pricing/payout')

  const depositNum = Number(draft.depositPercent)
  const validDeposit =
    Number.isFinite(depositNum) && depositNum >= 5 && depositNum <= 100
  const canContinue = validDeposit && draft.cancellationLevel && draft.reschedulePolicy

  const onNext = () => {
    if (!canContinue) return
    router.push('/onboard/pricing/payout')
  }

  return (
    <OnboardShell
      step="pricing"
      profileLabel={category?.profileLabel ?? 'Vendor'}
      backHref="/onboard/pricing"
      primaryAction={
        <PrimaryButton onClick={onNext} disabled={!canContinue}>
          {t('common.next_step')}
        </PrimaryButton>
      }
    >
      <OnboardHeading
        title={t('policies.title')}
        description={t('policies.subtitle')}
      />

      <div className="space-y-12 max-w-3xl">
        {/* Deposit */}
        <section>
          <h2 className="text-base font-semibold tracking-tight text-gray-900">
            {t('policies.deposit.title')}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {t('policies.deposit.subtitle')}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2 mb-4">
            {DEPOSIT_PRESETS.map((p) => (
              <button data-opus-button="neutral" data-opus-button-size="medium"
                key={p}
                type="button"
                onClick={() => update({ depositPercent: p })}
                className={cn(
                  'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                  draft.depositPercent === p
                    ? 'bg-[#1A1A1A] text-white'
                    : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400',
                )}
              >
                {p}%
              </button>
            ))}
          </div>

          <div className="max-w-xs">
            <FieldLabel>{t('policies.deposit.custom.label')}</FieldLabel>
            <TextInput
              inputMode="numeric"
              placeholder={t('policies.deposit.custom.placeholder')}
              value={draft.depositPercent}
              onChange={(e) =>
                update({ depositPercent: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })
              }
            />
            {!validDeposit && draft.depositPercent ? (
              <p className="mt-2 text-xs text-rose-600">{t('policies.deposit.custom.error')}</p>
            ) : null}
          </div>
        </section>

        {/* Cancellation */}
        <section>
          <h2 className="text-base font-semibold tracking-tight text-gray-900">
            {t('policies.cancellation.title')}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {t('policies.cancellation.subtitle')}
          </p>

          <div className="mt-5 grid sm:grid-cols-2 gap-3">
            {CANCELLATION_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.id}
                variant="radio"
                label={pick(locale, opt.label, opt.label_sw)}
                description={
                  <>
                    <span className="block">{pick(locale, opt.body, opt.body_sw)}</span>
                    <ul className="mt-2 space-y-1 text-xs text-gray-700">
                      {(locale === 'sw' ? opt.schedule_sw : opt.schedule).map((line) => (
                        <li key={line} className="flex items-start gap-1.5">
                          <Check
                            className="w-3 h-3 text-emerald-600 mt-0.5 shrink-0"
                            strokeWidth={3}
                          />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                }
                selected={draft.cancellationLevel === opt.id}
                onToggle={() => update({ cancellationLevel: opt.id })}
              />
            ))}
          </div>
        </section>

        {/* Reschedule */}
        <section>
          <h2 className="text-base font-semibold tracking-tight text-gray-900">
            {t('policies.reschedule.title')}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {t('policies.reschedule.subtitle')}
          </p>

          <div className="mt-5 grid sm:grid-cols-2 gap-3">
            {RESCHEDULE_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.id}
                variant="radio"
                label={pick(locale, opt.label, opt.label_sw)}
                description={pick(locale, opt.body, opt.body_sw)}
                selected={draft.reschedulePolicy === opt.id}
                onToggle={() => update({ reschedulePolicy: opt.id })}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="mt-12">
        <WhyWeAsk title={t('policies.why.title')}>
          <p>{t('policies.why.body1')}</p>
          <p>{t('policies.why.body2')}</p>
        </WhyWeAsk>
      </div>
    </OnboardShell>
  )
}
