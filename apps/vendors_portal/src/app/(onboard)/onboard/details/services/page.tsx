'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { OnboardShell } from '@/components/onboard/OnboardShell'
import { OnboardHeading } from '@/components/onboard/OnboardHeading'
import { OptionCard } from '@/components/onboard/OptionCard'
import { PrimaryButton } from '@/components/onboard/PrimaryButton'
import { FieldLabel, TextInput } from '@/components/onboard/FormField'
import { useOnboardingDraft } from '@/lib/onboarding/draft'
import { findCategory } from '@/lib/onboarding/categories'
import { getServicesForCategory } from '@/lib/onboarding/services'
import { useServiceOnlyStep } from '@/lib/onboarding/use-service-only-step'
import { pick } from '@/lib/onboarding/localize'
import { useOnboardT } from '@/lib/onboarding/strings'

const MAX_CUSTOM_LABEL = 80

export default function ServicesPage() {
  const router = useRouter()
  const { draft, update, hydrated } = useOnboardingDraft()
  const { t, locale } = useOnboardT()
  const category = findCategory(draft.categoryId)
  const services = useMemo(() => getServicesForCategory(draft.categoryId), [draft.categoryId])

  useEffect(() => {
    if (!hydrated) return
    if (!draft.categoryId) router.replace('/onboard/category')
    else if (!draft.vowsAccepted) router.replace('/onboard/vows')
  }, [hydrated, draft.categoryId, draft.vowsAccepted, router])

  useServiceOnlyStep('/onboard/pricing/payout')

  const [customDraft, setCustomDraft] = useState('')

  const toggle = (id: string) => {
    const set = new Set(draft.specialServices)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    update({ specialServices: Array.from(set) })
  }

  const addCustom = (e: FormEvent) => {
    e.preventDefault()
    const label = customDraft.trim().slice(0, MAX_CUSTOM_LABEL)
    if (!label) return
    const lower = label.toLowerCase()
    // Match against both languages so a Swahili user can't re-add a preset they
    // already selected (the cards show the Swahili label, the data keeps both).
    const dupePreset = services.some(
      (s) =>
        draft.specialServices.includes(s.id) &&
        (s.label.toLowerCase() === lower || s.label_sw.toLowerCase() === lower),
    )
    const dupeCustom = draft.customServices.some((c) => c.toLowerCase() === lower)
    if (!dupePreset && !dupeCustom) {
      update({ customServices: [...draft.customServices, label] })
    }
    setCustomDraft('')
  }

  const removeCustom = (label: string) => {
    update({ customServices: draft.customServices.filter((c) => c !== label) })
  }

  const onNext = () => router.push('/onboard/details/style')

  return (
    <OnboardShell
      step="details"
      profileLabel={category?.profileLabel ?? 'Vendor'}
      backHref="/onboard/details/about"
      primaryAction={
        <PrimaryButton onClick={onNext}>{t('common.next_step')}</PrimaryButton>
      }
    >
      <OnboardHeading
        title={t('details.services.title')}
        description={t('common.select_all_that_apply')}
      />

      <div className="grid sm:grid-cols-2 gap-3 lg:gap-4">
        {services.map((s) => (
          <OptionCard
            key={s.id}
            variant="checkbox"
            label={pick(locale, s.label, s.label_sw)}
            selected={draft.specialServices.includes(s.id)}
            onToggle={() => toggle(s.id)}
          />
        ))}
      </div>

      {/* Other services — vendor-entered free-text additions. These flow to
          `vendors.services_offered` (merged with the presets) and show up in the
          admin + storefront editors. */}
      <div className="mt-8 border-t border-gray-100 pt-8">
        <h2 className="text-base font-semibold tracking-tight text-gray-900">
          {t('details.services.custom.heading')}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {t('details.services.custom.hint')}
        </p>

        {draft.customServices.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {draft.customServices.map((label) => (
              <li
                key={label}
                className="inline-flex items-center gap-2 bg-[#F0DFF6] text-[#7E5896] text-sm font-semibold pl-3.5 pr-1.5 py-1.5 rounded-full"
              >
                <span className="truncate max-w-[220px]">{label}</span>
                <button data-opus-button="control"
                  type="button"
                  onClick={() => removeCustom(label)}
                  className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/70 transition-colors"
                  aria-label={`${t('details.services.custom.remove')} ${label}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <form onSubmit={addCustom} className="mt-4 grid sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <FieldLabel>{t('details.services.custom.label')}</FieldLabel>
            <TextInput
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value.slice(0, MAX_CUSTOM_LABEL))}
              placeholder={t('details.services.custom.placeholder')}
              maxLength={MAX_CUSTOM_LABEL}
            />
          </div>
          <button data-opus-button="primary" data-opus-button-size="large"
            type="submit"
            disabled={!customDraft.trim()}
            className="inline-flex items-center justify-center gap-1.5 bg-[#1A1A1A] hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-3 rounded-full transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('details.services.custom.add')}
          </button>
        </form>
      </div>
    </OnboardShell>
  )
}
