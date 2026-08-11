'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Facebook, Globe, Instagram, Music } from 'lucide-react'
import { OnboardShell } from '@/components/onboard/OnboardShell'
import { OnboardHeading } from '@/components/onboard/OnboardHeading'
import { PrimaryButton } from '@/components/onboard/PrimaryButton'
import { WhyWeAsk } from '@/components/onboard/WhyWeAsk'
import { FieldLabel, TextInput } from '@/components/onboard/FormField'
import { useOnboardingDraft, type SocialLinks } from '@/lib/onboarding/draft'
import { findCategory } from '@/lib/onboarding/categories'
import { useOnboardT } from '@/lib/onboarding/strings'

const stripAt = (v: string) => v.replace(/^@+/, '').trim()

export default function SocialsPage() {
  const router = useRouter()
  const { draft, update, hydrated } = useOnboardingDraft()
  const { t } = useOnboardT()
  const category = findCategory(draft.categoryId)

  useEffect(() => {
    if (!hydrated) return
    if (!draft.categoryId) router.replace('/onboard/category')
    else if (!draft.vowsAccepted) router.replace('/onboard/vows')
    else if (!draft.email) router.replace('/onboard/profile/contact')
  }, [hydrated, draft.categoryId, draft.vowsAccepted, draft.email, router])

  const setSocial = (key: keyof SocialLinks, value: string) => {
    update({ socials: { ...draft.socials, [key]: value } })
  }

  const onNext = () => router.push('/onboard/profile/markets')
  const onSkip = () => router.push('/onboard/profile/markets')

  const filledCount = (
    ['website', 'instagram', 'facebook', 'tiktok'] as const
  ).filter((k) => draft.socials[k].trim()).length

  return (
    <OnboardShell
      step="profile"
      profileLabel={category?.profileLabel ?? 'Vendor'}
      backHref="/onboard/profile/contact"
      primaryAction={
        <PrimaryButton onClick={onNext}>{t('common.next_step')}</PrimaryButton>
      }
    >
      <OnboardHeading
        title={t('profile.socials.title')}
        description={t('profile.socials.subtitle')}
      />

      <div className="space-y-4 max-w-2xl">
        <SocialField
          icon={<Instagram className="w-4 h-4" />}
          label={t('profile.socials.instagram.label')}
          placeholder={t('profile.socials.instagram.placeholder')}
          prefix="@"
          value={draft.socials.instagram}
          onChange={(v) => setSocial('instagram', stripAt(v))}
        />
        <SocialField
          icon={<Music className="w-4 h-4" />}
          label={t('profile.socials.tiktok.label')}
          placeholder={t('profile.socials.tiktok.placeholder')}
          prefix="@"
          value={draft.socials.tiktok}
          onChange={(v) => setSocial('tiktok', stripAt(v))}
        />
        <SocialField
          icon={<Facebook className="w-4 h-4" />}
          label={t('profile.socials.facebook.label')}
          placeholder={t('profile.socials.facebook.placeholder')}
          value={draft.socials.facebook}
          onChange={(v) => setSocial('facebook', v)}
        />
        <SocialField
          icon={<Globe className="w-4 h-4" />}
          label={t('profile.socials.website.label')}
          placeholder={t('profile.socials.website.placeholder')}
          value={draft.socials.website}
          onChange={(v) => setSocial('website', v)}
        />
      </div>

      <div className="mt-10 flex items-center gap-6 flex-wrap">
        {filledCount === 0 ? (
          <button data-opus-button="control"
            type="button"
            onClick={onSkip}
            className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
          >
            {t('common.skip_for_now')}
          </button>
        ) : null}
        <WhyWeAsk title={t('profile.socials.why.title')}>
          <p>{t('profile.socials.why.body1')}</p>
          <p>{t('profile.socials.why.body2')}</p>
        </WhyWeAsk>
      </div>
    </OnboardShell>
  )
}

function SocialField({
  icon,
  label,
  placeholder,
  prefix,
  value,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  placeholder: string
  prefix?: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-9 h-9 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <FieldLabel>{label}</FieldLabel>
        <TextInput
          prefix={prefix}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  )
}
