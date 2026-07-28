'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { OnboardShell } from '@/components/onboard/OnboardShell'
import { OnboardHeading } from '@/components/onboard/OnboardHeading'
import { PrimaryButton } from '@/components/onboard/PrimaryButton'
import { OptionCard } from '@/components/onboard/OptionCard'
import { FieldLabel, TextArea, TextInput } from '@/components/onboard/FormField'
import { useOnboardingDraft } from '@/lib/onboarding/draft'
import { findCategory } from '@/lib/onboarding/categories'
import { LANGUAGES } from '@/lib/onboarding/languages'
import { sellsProducts } from '@/lib/onboarding/verticals'
import { pick } from '@/lib/onboarding/localize'
import { useOnboardT } from '@/lib/onboarding/strings'

const MIN_BIO = 80

export default function AboutPage() {
  const router = useRouter()
  const { draft, update, hydrated } = useOnboardingDraft()
  const { t, tn, locale } = useOnboardT()
  const category = findCategory(draft.categoryId)

  useEffect(() => {
    if (!hydrated) return
    if (!draft.categoryId) router.replace('/onboard/category')
    else if (!draft.vowsAccepted) router.replace('/onboard/vows')
  }, [hydrated, draft.categoryId, draft.vowsAccepted, router])

  const toggleLanguage = (id: string) => {
    const set = new Set(draft.languages)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    update({ languages: Array.from(set) })
  }

  const canContinue =
    draft.bio.trim().length >= MIN_BIO &&
    draft.yearsInBusiness.trim() &&
    draft.languages.length > 0

  // The one branch point in the wizard. Service vendors continue into the
  // service-shaped steps (services checklist → style → personality → packages →
  // booking policies → payout). Product vendors sell goods, not booked time, so
  // they go straight to payout and then review; their catalogue, delivery and
  // returns are set up in the portal once they're approved.
  const onNext = () => {
    if (!canContinue) return
    router.push(
      sellsProducts(draft.vertical) ? '/onboard/pricing/payout' : '/onboard/details/services',
    )
  }

  const bioLength = draft.bio.trim().length

  return (
    <OnboardShell
      step="details"
      profileLabel={category?.profileLabel ?? 'Vendor'}
      backHref="/onboard/profile/markets"
      primaryAction={
        <PrimaryButton onClick={onNext} disabled={!canContinue}>
          {t('common.next_step')}
        </PrimaryButton>
      }
    >
      <OnboardHeading
        title={t('details.about.title')}
        description={t('details.about.subtitle')}
      />

      <div className="space-y-8 max-w-3xl">
        <div>
          <FieldLabel>{t('details.about.description.label')}</FieldLabel>
          <TextArea
            placeholder={t('details.about.description.placeholder')}
            value={draft.description}
            onChange={(e) => update({ description: e.target.value })}
            rows={2}
            maxLength={200}
            hint={t('details.about.description.hint', { n: draft.description.trim().length })}
          />
        </div>

        <div>
          <FieldLabel required>{t('details.about.bio.label')}</FieldLabel>
          <TextArea
            placeholder={t('details.about.bio.placeholder')}
            value={draft.bio}
            onChange={(e) => update({ bio: e.target.value })}
            rows={6}
            hint={
              bioLength < MIN_BIO
                ? tn('details.about.bio.hint_more', MIN_BIO - bioLength, { min: MIN_BIO })
                : t('details.about.bio.hint_ok', { n: bioLength })
            }
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
          <div>
            <FieldLabel required>{t('details.about.years.label')}</FieldLabel>
            <TextInput
              placeholder={t('details.about.years.placeholder')}
              inputMode="numeric"
              value={draft.yearsInBusiness}
              onChange={(e) =>
                update({ yearsInBusiness: e.target.value.replace(/[^\d]/g, '').slice(0, 2) })
              }
            />
          </div>
        </div>

        <div>
          <FieldLabel required>{t('details.about.languages.label')}</FieldLabel>
          <p className="text-xs text-gray-500 -mt-1 mb-3">{t('common.select_all_that_apply')}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {LANGUAGES.map((lang) => (
              <OptionCard
                key={lang.id}
                variant="checkbox"
                label={pick(locale, lang.label, lang.label_sw)}
                selected={draft.languages.includes(lang.id)}
                onToggle={() => toggleLanguage(lang.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </OnboardShell>
  )
}
