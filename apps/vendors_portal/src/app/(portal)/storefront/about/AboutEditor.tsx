'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  Check,
  Facebook,
  Globe,
  Instagram,
  MapPin,
  MessageCircle,
  Music,
  Save,
} from 'lucide-react'
import { OptionCard } from '@/components/onboard/OptionCard'
import {
  FieldLabel,
  SelectInput,
  TextArea,
  TextInput,
} from '@/components/onboard/FormField'
import { useOnboardingDraft } from '@/lib/onboarding/draft'
import { LANGUAGES } from '@/lib/onboarding/languages'
import { getStylesForCategory } from '@/lib/onboarding/styles'
import { PERSONALITY_OPTIONS } from '@/lib/onboarding/personality'
import {
  SERVICE_MARKETS,
  TZ_REGIONS,
  homeMarketForRegion,
} from '@/lib/onboarding/regions'
import { LogoUpload } from '@/components/onboard/LogoUpload'
import { saveProfile } from './actions'
import { saveProfileFields, uploadStorefrontPhoto } from '../sections/actions'
import { getStorefrontSections } from '@/lib/storefront/completion'
import { useVendorVertical } from '@/lib/onboarding/vertical-context'
import { profilesEqual, type DbProfile } from './mapping'
import { usePortalT, type Translator } from '@/components/providers/PortalUIStringsProvider'

const MIN_BIO = 80

export type AboutSource =
  | { kind: 'live' }
  | { kind: 'no-application' }
  | { kind: 'pending-approval' }
  | { kind: 'suspended' }
  | { kind: 'no-env' }

function buildBannerBySource(t: Translator): Record<AboutSource['kind'], string | null> {
  return {
    live: null,
    'no-application': t('banner_no_application'),
    'pending-approval': t('banner_pending_approval'),
    suspended: t('banner_suspended'),
    'no-env': t('banner_no_env'),
  }
}

type AboutEditorProps = {
  source: AboutSource
  initialProfile: DbProfile
  canEdit: boolean
}

export default function AboutEditor({
  source,
  initialProfile,
  canEdit,
}: AboutEditorProps) {
  const router = useRouter()
  const t = usePortalT('storefront-about')
  // Wireable fields: hydrated from vendors row, edited in local React state,
  // persisted via the saveProfile server action.
  const [profile, setProfile] = useState<DbProfile>(initialProfile)
  const [savedSnapshot, setSavedSnapshot] = useState<DbProfile>(initialProfile)
  // Non-wireable fields (firstName/lastName/languages/style/personality/
  // markets/hours/responseTimeHours/locallyOwned) still live in the
  // localStorage onboarding draft. Phase 5 will extend the schema and
  // replace these reads.
  const { draft, update, hydrated } = useOnboardingDraft()
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<
    { kind: 'success' | 'error'; message: string } | null
  >(null)

  // Sync local state when the server re-renders with fresh data — same
  // pattern as the packages editor. Without this useState would only ever
  // see the mount-time seed and drift from DB after another tab saves.
  useEffect(() => {
    setProfile(initialProfile)
    setSavedSnapshot(initialProfile)
  }, [initialProfile])

  // The completeness sidebar judges the Profile section off the shared
  // onboarding draft (d.bio / d.phone / d.socials / …), but these fields are
  // edited here in `profile` (the DB-backed source of truth) and were never
  // written back to the draft. That left Profile stuck on "required" no matter
  // what the vendor saved. Mirror them into the draft so the tick reflects
  // what's actually stored — and updates live as the vendor types.
  useEffect(() => {
    if (!hydrated) return
    // Skip the write (and its localStorage serialize + cross-instance draft
    // event) when nothing the sidebar reads actually changed, so an unrelated
    // re-render or a post-save revalidate doesn't churn the whole draft.
    const socialsUnchanged =
      draft.socials.website === profile.socialWebsite &&
      draft.socials.instagram === profile.socialInstagram &&
      draft.socials.facebook === profile.socialFacebook &&
      draft.socials.tiktok === profile.socialTiktok &&
      draft.socials.whatsapp === profile.socialWhatsapp
    if (
      draft.businessName === profile.businessName &&
      draft.bio === profile.bio &&
      draft.description === profile.description &&
      draft.yearsInBusiness === profile.yearsInBusiness &&
      draft.phone === profile.phone &&
      draft.email === profile.email &&
      draft.whatsapp === profile.whatsapp &&
      socialsUnchanged
    ) {
      return
    }
    update({
      businessName: profile.businessName,
      bio: profile.bio,
      description: profile.description,
      yearsInBusiness: profile.yearsInBusiness,
      phone: profile.phone,
      email: profile.email,
      whatsapp: profile.whatsapp,
      socials: {
        website: profile.socialWebsite,
        instagram: profile.socialInstagram,
        facebook: profile.socialFacebook,
        tiktok: profile.socialTiktok,
        whatsapp: profile.socialWhatsapp,
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, profile])

  const banner = buildBannerBySource(t)[source.kind]
  const styles = getStylesForCategory(draft.categoryId)
  const homeMarket = homeMarketForRegion(profile.region)
  const homeMarketName = SERVICE_MARKETS.find((m) => m.id === homeMarket)?.name
  const extraMarkets = SERVICE_MARKETS.filter((m) => m.id !== homeMarket)

  // Snapshot of the draft-only fields at last save (or hydration). We need
  // this so the Save button enables when the vendor changes only
  // languages / style / hours / etc. — fields that don't live in
  // `profile`. Without it, "dirty" was driven entirely by profile changes
  // and the button stayed disabled for draft-only edits.
  const [draftSnapshot, setDraftSnapshot] = useState(() => snapshotDraft(draft))
  useEffect(() => {
    // Re-snapshot once localStorage has hydrated so we don't keep the
    // EMPTY default as the baseline.
    if (hydrated) setDraftSnapshot(snapshotDraft(draft))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  const isDirty = useMemo(() => {
    if (!profilesEqual(profile, savedSnapshot)) return true
    return !draftsEqual(snapshotDraft(draft), draftSnapshot)
  }, [profile, savedSnapshot, draft, draftSnapshot])

  // Resolve the next storefront section so the bottom bar's "Next" button
  // mirrors the flow on every other section page. Same helper the sidebar
  // uses, so the order stays in sync.
  const vertical = useVendorVertical()
  const nextHref = useMemo(() => {
    const sections = getStorefrontSections(draft, vertical)
    const idx = sections.findIndex((s) => s.id === 'about')
    return idx >= 0 && idx < sections.length - 1 ? sections[idx + 1].href : null
  }, [draft, vertical])

  const onNext = () => {
    if (nextHref) router.push(nextHref)
  }

  const bioLength = profile.bio.trim().length
  const bioHint =
    bioLength === 0
      ? t('bio_hint_empty', { min: MIN_BIO })
      : bioLength < MIN_BIO
        ? t(MIN_BIO - bioLength === 1 ? 'bio_hint_remaining_singular' : 'bio_hint_remaining_plural', {
            remaining: MIN_BIO - bioLength,
            min: MIN_BIO,
          })
        : t('bio_hint_good', { count: bioLength })

  const setField = <K extends keyof DbProfile>(key: K, value: DbProfile[K]) => {
    setProfile((p) => ({ ...p, [key]: value }))
    setFeedback(null)
  }

  const toggleLanguage = (id: string) => {
    if (!canEdit) return
    const set = new Set(draft.languages)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    update({ languages: Array.from(set) })
  }

  const toggleServiceMarket = (id: string) => {
    if (!canEdit || id === homeMarket) return
    const set = new Set(draft.serviceMarkets)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    update({ serviceMarkets: Array.from(set) })
  }

  const handleSave = () => {
    if (!canEdit) return
    setFeedback(null)
    startTransition(async () => {
      // Two writes in parallel — saveProfile owns the DB-backed
      // identity fields (bio, contact, location, socials), while
      // saveProfileFields owns the structured columns the About page
      // had been keeping on local draft only (hours, style,
      // personality, languages, service markets). Running them together
      // means one click persists everything the vendor sees on this
      // page, so "draft" badges actually clear after Save.
      const [profileResult, fieldsResult] = await Promise.all([
        isDirty
          ? saveProfile(profile)
          : Promise.resolve({ ok: true as const }),
        saveProfileFields({
          logo: profile.logo,
          style: draft.style || null,
          personality: draft.personality || null,
          homeMarket: homeMarket ?? null,
          serviceMarkets: draft.serviceMarkets,
          languages: draft.languages,
        }),
      ])
      if (!profileResult.ok) {
        setFeedback({ kind: 'error', message: profileResult.error })
        if ('reason' in profileResult && profileResult.reason === 'stale') {
          router.refresh()
        }
        return
      }
      if (!fieldsResult.ok) {
        setFeedback({ kind: 'error', message: fieldsResult.error })
        return
      }
      setSavedSnapshot(profile)
      setDraftSnapshot(snapshotDraft(draft))
      // Mirror the DB-backed profile fields into the onboarding draft
      // so the storefront sidebar's completion checks (which read from
      // the draft) reflect the just-saved values. Without this, the
      // vendor saves a complete bio / contact / socials but the sidebar
      // keeps showing "needs more work" because draft.bio etc. are
      // still empty.
      update({
        bio: profile.bio,
        description: profile.description,
        yearsInBusiness: profile.yearsInBusiness,
        phone: profile.phone,
        email: profile.email,
        whatsapp: profile.whatsapp,
        socials: {
          website: profile.socialWebsite,
          instagram: profile.socialInstagram,
          facebook: profile.socialFacebook,
          tiktok: profile.socialTiktok,
          whatsapp: profile.socialWhatsapp,
        },
      })
      setFeedback({ kind: 'success', message: t('success_saved') })
    })
  }

  const saveDisabled = !canEdit || !isDirty || pending || source.kind !== 'live'

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 px-6 lg:px-10 pt-4 lg:pt-5 pb-6">
        {banner && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
            {banner}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Owner & business */}
          <Section
            title={t('section_owner_title')}
            hint={t('section_owner_hint')}
            className="lg:col-span-2"
          >
            <div className="space-y-4">
              <div>
                <FieldLabel>{t('field_logo_label')}</FieldLabel>
                <div className="mt-1">
                  <LogoUpload
                    value={profile.logo}
                    onChange={(url) => setField('logo', url)}
                    disabled={!canEdit}
                    upload={async (file) => {
                      const fd = new FormData()
                      fd.append('file', file)
                      fd.append('kind', 'logo')
                      const res = await uploadStorefrontPhoto(fd)
                      return res.ok
                        ? { ok: true, url: res.url }
                        : { ok: false, error: res.error }
                    }}
                    hint={t('field_logo_hint')}
                  />
                </div>
              </div>
              <div data-field="businessName">
                <FieldLabel required>{t('field_business_name_label')}</FieldLabel>
                <TextInput
                  value={profile.businessName}
                  onChange={(e) => setField('businessName', e.target.value)}
                  autoComplete="organization"
                  placeholder={t('field_business_name_placeholder')}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <FieldLabel>{t('field_first_name_label')}</FieldLabel>
                  <TextInput
                    value={profile.firstName}
                    onChange={(e) => setField('firstName', e.target.value)}
                    autoComplete="given-name"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <FieldLabel>{t('field_last_name_label')}</FieldLabel>
                  <TextInput
                    value={profile.lastName}
                    onChange={(e) => setField('lastName', e.target.value)}
                    autoComplete="family-name"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <FieldLabel>{t('field_years_in_business_label')}</FieldLabel>
                  <TextInput
                    inputMode="numeric"
                    value={profile.yearsInBusiness}
                    onChange={(e) =>
                      setField(
                        'yearsInBusiness',
                        e.target.value.replace(/[^\d]/g, '').slice(0, 3),
                      )
                    }
                    placeholder={t('field_years_in_business_placeholder')}
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>
          </Section>

          {/* Business address (all wireable via location JSONB) */}
          <Section
            title={t('section_address_title')}
            hint={t('section_address_hint')}
            className="lg:col-span-2"
          >
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>{t('field_house_number_label')}</FieldLabel>
                  <TextInput
                    placeholder={t('field_house_number_placeholder')}
                    value={profile.houseNumber}
                    onChange={(e) => setField('houseNumber', e.target.value)}
                    autoComplete="address-line1"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <FieldLabel required>{t('field_street_label')}</FieldLabel>
                  <TextInput
                    placeholder={t('field_street_placeholder')}
                    value={profile.street}
                    onChange={(e) => setField('street', e.target.value)}
                    autoComplete="address-line2"
                    disabled={!canEdit}
                  />
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <FieldLabel required>{t('field_ward_label')}</FieldLabel>
                  <TextInput
                    placeholder={t('field_ward_placeholder')}
                    value={profile.ward}
                    onChange={(e) => setField('ward', e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <FieldLabel required>{t('field_district_label')}</FieldLabel>
                  <TextInput
                    placeholder={t('field_district_placeholder')}
                    value={profile.district}
                    onChange={(e) => setField('district', e.target.value)}
                    autoComplete="address-level2"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <FieldLabel required>{t('field_region_label')}</FieldLabel>
                  <SelectInput
                    placeholder={t('field_region_placeholder')}
                    value={profile.region}
                    onChange={(e) => setField('region', e.target.value)}
                    disabled={!canEdit}
                  >
                    {TZ_REGIONS.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.name}
                      </option>
                    ))}
                  </SelectInput>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>{t('field_landmark_label')}</FieldLabel>
                  <TextInput
                    placeholder={t('field_landmark_placeholder')}
                    value={profile.landmark}
                    onChange={(e) => setField('landmark', e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <FieldLabel>{t('field_postal_label')}</FieldLabel>
                  <TextInput
                    placeholder={t('field_postal_placeholder')}
                    value={profile.postalCode}
                    onChange={(e) => setField('postalCode', e.target.value)}
                    autoComplete="postal-code"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>
          </Section>

          {/* Contact details — onboarding "Contact" step.
              Wireable via contact_info JSONB. */}
          <Section
            title={t('section_contact_title')}
            hint={t('section_contact_hint')}
            className="lg:col-span-2"
          >
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <FieldLabel>{t('field_phone_label')}</FieldLabel>
                <TextInput
                  prefix="+255"
                  inputMode="tel"
                  value={profile.phone}
                  onChange={(e) =>
                    setField('phone', e.target.value.replace(/[^\d\s]/g, ''))
                  }
                  disabled={!canEdit}
                />
              </div>
              <div>
                <FieldLabel>{t('field_whatsapp_label')}</FieldLabel>
                <TextInput
                  prefix="+255"
                  inputMode="tel"
                  value={profile.whatsapp}
                  onChange={(e) =>
                    setField('whatsapp', e.target.value.replace(/[^\d\s]/g, ''))
                  }
                  disabled={!canEdit}
                />
              </div>
              <div>
                <FieldLabel>{t('field_email_label')}</FieldLabel>
                <TextInput
                  type="email"
                  inputMode="email"
                  placeholder={t('field_email_placeholder')}
                  value={profile.email}
                  onChange={(e) => setField('email', e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            </div>
          </Section>

          {/* Socials — onboarding "Socials" step.
              Wireable via social_links JSONB. */}
          <Section
            title={t('section_socials_title')}
            hint={t('section_socials_hint')}
            className="lg:col-span-2"
          >
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              <SocialRow
                icon={<Globe className="w-4 h-4" />}
                label={t('social_website_label')}
                placeholder={t('social_website_placeholder')}
                value={profile.socialWebsite}
                onChange={(v) => setField('socialWebsite', v)}
                disabled={!canEdit}
              />
              <SocialRow
                icon={<MessageCircle className="w-4 h-4" />}
                label={t('social_whatsapp_label')}
                placeholder={t('social_whatsapp_placeholder')}
                value={profile.socialWhatsapp}
                onChange={(v) => setField('socialWhatsapp', v)}
                disabled={!canEdit}
              />
              <SocialRow
                icon={<Instagram className="w-4 h-4" />}
                label={t('social_instagram_label')}
                placeholder={t('social_instagram_placeholder')}
                value={profile.socialInstagram}
                onChange={(v) => setField('socialInstagram', v)}
                disabled={!canEdit}
              />
              <SocialRow
                icon={<Facebook className="w-4 h-4" />}
                label={t('social_facebook_label')}
                placeholder={t('social_facebook_placeholder')}
                value={profile.socialFacebook}
                onChange={(v) => setField('socialFacebook', v)}
                disabled={!canEdit}
              />
              <SocialRow
                icon={<Music className="w-4 h-4" />}
                label={t('social_tiktok_label')}
                placeholder={t('social_tiktok_placeholder')}
                value={profile.socialTiktok}
                onChange={(v) => setField('socialTiktok', v)}
                disabled={!canEdit}
              />
            </div>
          </Section>

          {/* Service area — onboarding "Markets" step.
              Persisted to vendors.home_market / vendors.service_markets on Save. */}
          <Section
            title={t('section_service_area_title')}
            className="lg:col-span-2"
          >
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3 mb-5">
              <span className="w-7 h-7 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0">
                <MapPin className="w-3.5 h-3.5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {homeMarketName ?? t('home_market_not_set')}
                </p>
                <p className="text-xs text-gray-500">
                  {t('home_market_hint')}
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
                {t('home_market_badge')}
              </span>
            </div>

            <FieldLabel>{t('field_extra_markets_label')}</FieldLabel>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
              {extraMarkets.map((m) => (
                <OptionCard
                  key={m.id}
                  variant="checkbox"
                  label={m.name}
                  description={m.hint}
                  selected={hydrated && draft.serviceMarkets.includes(m.id)}
                  onToggle={() => toggleServiceMarket(m.id)}
                />
              ))}
            </div>
          </Section>

          {/* Bio — onboarding "About" step (bio + languages).
              Bio wireable; languages persisted via saveProfileFields. */}
          <Section
            title={t('section_bio_title')}
            hint={t('section_bio_hint')}
            className="lg:col-span-2"
          >
            <div className="space-y-5">
              <div>
                <FieldLabel>{t('field_short_description_label')}</FieldLabel>
                <TextArea
                  value={profile.description}
                  onChange={(e) => setField('description', e.target.value)}
                  rows={2}
                  maxLength={200}
                  hint={t('short_description_hint', { count: profile.description.trim().length })}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <FieldLabel required>{t('field_description_label')}</FieldLabel>
                <TextArea
                  value={profile.bio}
                  onChange={(e) => setField('bio', e.target.value)}
                  rows={6}
                  hint={bioHint}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <FieldLabel>
                  {t('field_languages_label')}
                </FieldLabel>
                <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-1">
                  {LANGUAGES.map((lang) => (
                    <OptionCard
                      key={lang.id}
                      variant="checkbox"
                      label={lang.label}
                      selected={hydrated && draft.languages.includes(lang.id)}
                      onToggle={() => toggleLanguage(lang.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </Section>

          {/* Style & personality — onboarding "Style" + "Personality" steps.
              Persisted to vendors.style / vendors.personality on Save. */}
          <Section
            title={t('section_style_title')}
            className="lg:col-span-2"
          >
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <FieldLabel>{t('field_style_label')}</FieldLabel>
                <div className="grid gap-2 mt-1">
                  {styles.map((s) => (
                    <OptionCard
                      key={s.id}
                      variant="radio"
                      label={s.label}
                      description={s.body}
                      selected={hydrated && draft.style === s.id}
                      onToggle={() => canEdit && update({ style: s.id })}
                    />
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel>{t('field_personality_label')}</FieldLabel>
                <div className="grid gap-2 mt-1">
                  {PERSONALITY_OPTIONS.map((p) => (
                    <OptionCard
                      key={p.id}
                      variant="radio"
                      label={p.label}
                      description={p.body}
                      selected={hydrated && draft.personality === p.id}
                      onToggle={() => canEdit && update({ personality: p.id })}
                    />
                  ))}
                </div>
              </div>
            </div>
          </Section>

        </div>
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 border-t border-gray-100 bg-white/95 backdrop-blur z-30">
        <div className="px-6 lg:px-10 py-3 flex items-center justify-between gap-4">
          <div className="text-xs flex items-center gap-3">
            {feedback ? (
              feedback.kind === 'success' ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <Check className="w-4 h-4" /> {feedback.message}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-rose-700 font-semibold">
                  <AlertCircle className="w-4 h-4" /> {feedback.message}
                </span>
              )
            ) : isDirty ? (
              <span className="text-amber-700 font-semibold">
                {t('unsaved_changes')}
              </span>
            ) : (
              <span className="text-gray-500">
                {t('save_hint')}
              </span>
            )}
            {!canEdit && source.kind === 'live' ? (
              <span className="text-gray-400">
                {t('readonly_notice')}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button data-opus-button="neutral" data-opus-button-size="medium"
              type="button"
              onClick={handleSave}
              disabled={saveDisabled}
              className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-900 text-sm font-semibold px-4 py-2 rounded-full hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {pending ? t('saving_label') : t('save_button')}
            </button>
            {nextHref ? (
              <button data-opus-button="primary" data-opus-button-size="medium"
                type="button"
                onClick={onNext}
                className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-gray-800 transition-colors"
              >
                {t('next_button')}
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

// The subset of OnboardingDraft this editor actually saves. We snapshot
// it on hydration + after every save so the Save button can light up
// when only these fields change.
function snapshotDraft(draft: {
  style: string | null
  personality: string | null
  serviceMarkets: string[]
  languages: string[]
}) {
  return JSON.stringify({
    style: draft.style,
    personality: draft.personality,
    serviceMarkets: draft.serviceMarkets,
    languages: draft.languages,
  })
}

function draftsEqual(a: string, b: string): boolean {
  return a === b
}

function Section({
  title,
  hint,
  right,
  className,
  children,
}: {
  title?: string
  hint?: string
  right?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={`bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6 lg:p-7 ${className ?? ''}`}
    >
      {title ? (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 tracking-tight">
              {title}
            </h2>
            {hint ? (
              <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
            ) : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

function SocialRow({
  icon,
  label,
  placeholder,
  value,
  onChange,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-9 h-9 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-900 mb-1">{label}</p>
        <TextInput
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
