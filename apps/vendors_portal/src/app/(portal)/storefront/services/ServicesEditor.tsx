'use client'

import { useEffect, useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Plus, Save, Sparkles, X } from 'lucide-react'
import { OptionCard } from '@/components/onboard/OptionCard'
import { FieldLabel, TextInput } from '@/components/onboard/FormField'
import { findCategory } from '@/lib/onboarding/categories'
import { useOnboardingDraft } from '@/lib/onboarding/draft'
import { getStorefrontSections } from '@/lib/storefront/completion'
import { useVendorVertical } from '@/lib/onboarding/vertical-context'
import { usePortalT, type Translator } from '@/components/providers/PortalUIStringsProvider'
import { saveServices } from './actions'

const MAX_CUSTOM_LABEL = 60

export type ServicesSource =
  | { kind: 'live' }
  | { kind: 'no-application' }
  | { kind: 'pending-approval' }
  | { kind: 'suspended' }
  | { kind: 'no-env' }

function buildBannerBySource(t: Translator): Record<ServicesSource['kind'], string | null> {
  return {
    live: null,
    'no-application': t('banner_no_application'),
    'pending-approval': t('banner_pending_approval'),
    suspended: t('banner_suspended'),
    'no-env': t('banner_no_env'),
  }
}

type ServicesEditorProps = {
  source: ServicesSource
  presets: Array<{ id: string; label: string }>
  initialPresetIds: string[]
  initialCustomServices: string[]
  canEdit: boolean
  category: string | null
}

export default function ServicesEditor({
  source,
  presets,
  initialPresetIds,
  initialCustomServices,
  canEdit,
  category,
}: ServicesEditorProps) {
  const router = useRouter()
  const t = usePortalT('storefront-services')
  const { draft, update } = useOnboardingDraft()
  const [specialServices, setSpecial] = useState<string[]>(initialPresetIds)
  const [customServices, setCustom] = useState<string[]>(initialCustomServices)

  // Mirror the saved/edited services into the onboarding draft so the
  // storefront completion sidebar (which reads `draft.specialServices` +
  // `draft.customServices`) reflects them. Without this, a vendor who has
  // services in the DB but an empty draft (fresh device / cleared storage /
  // a vendor-scoped slot that didn't inherit onboarding data) sees the
  // Services section stuck on "Required" despite having saved it.
  useEffect(() => {
    const sameSpecial =
      draft.specialServices.length === specialServices.length &&
      specialServices.every((s) => draft.specialServices.includes(s))
    const sameCustom =
      draft.customServices.length === customServices.length &&
      customServices.every((s) => draft.customServices.includes(s))
    if (sameSpecial && sameCustom) return
    update({ specialServices, customServices })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialServices, customServices])
  const [customDraft, setCustomDraft] = useState('')
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<
    { kind: 'success' | 'error'; message: string } | null
  >(null)

  const banner = buildBannerBySource(t)[source.kind]
  const categoryMeta = findCategory(category)

  const vertical = useVendorVertical()
  const nextHref = useMemo(() => {
    const sections = getStorefrontSections(draft, vertical)
    const idx = sections.findIndex((s) => s.id === 'services')
    return idx >= 0 && idx < sections.length - 1 ? sections[idx + 1].href : null
  }, [draft, vertical])

  const onNext = () => {
    if (nextHref) router.push(nextHref)
  }

  const isDirty = useMemo(() => {
    if (specialServices.length !== initialPresetIds.length) return true
    if (customServices.length !== initialCustomServices.length) return true
    const a = new Set(specialServices)
    if (initialPresetIds.some((id) => !a.has(id))) return true
    const b = new Set(customServices.map((s) => s.toLowerCase()))
    if (initialCustomServices.some((s) => !b.has(s.toLowerCase()))) return true
    return false
  }, [specialServices, customServices, initialPresetIds, initialCustomServices])

  const presetSelected = specialServices.length
  const customSelected = customServices.length
  const total = presetSelected + customSelected

  const toggleService = (id: string) => {
    if (!canEdit) return
    setSpecial((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    )
    setFeedback(null)
  }

  const addCustom = (e: FormEvent) => {
    e.preventDefault()
    if (!canEdit) return
    const label = customDraft.trim().slice(0, MAX_CUSTOM_LABEL)
    if (!label) return

    const lower = label.toLowerCase()
    const inPresets = presets.some(
      (p) => specialServices.includes(p.id) && p.label.toLowerCase() === lower,
    )
    const inCustom = customServices.some((c) => c.toLowerCase() === lower)
    if (inPresets || inCustom) {
      setCustomDraft('')
      setFeedback({
        kind: 'error',
        message: inPresets
          ? t('duplicate_preset_error', { label })
          : t('duplicate_custom_error', { label }),
      })
      return
    }

    setCustom((prev) => [...prev, label])
    setCustomDraft('')
    setFeedback(null)
  }

  const removeCustom = (label: string) => {
    if (!canEdit) return
    setCustom((prev) => prev.filter((c) => c !== label))
    setFeedback(null)
  }

  const handleSave = () => {
    if (!canEdit || !isDirty) return
    setFeedback(null)
    startTransition(async () => {
      const result = await saveServices({ specialServices, customServices })
      if (result.ok) {
        setFeedback({ kind: 'success', message: t('success_saved') })
      } else {
        setFeedback({ kind: 'error', message: result.error })
      }
    })
  }

  const saveDisabled = !canEdit || !isDirty || pending || source.kind !== 'live'

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 px-6 lg:px-10 pt-4 lg:pt-5 pb-6">
        <div className="max-w-4xl space-y-6">
          {banner && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
              {banner}
            </div>
          )}

          <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6 lg:p-7">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900 tracking-tight">
                  {t('services_header', { category: categoryMeta?.profileLabel ?? t('fallback_category_label') })}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('services_hint')}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-gray-700 tabular-nums">
                {presetSelected} / {presets.length}
              </span>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {presets.map((s) => (
                <OptionCard
                  key={s.id}
                  variant="checkbox"
                  label={s.label}
                  selected={specialServices.includes(s.id)}
                  onToggle={() => toggleService(s.id)}
                />
              ))}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6 lg:p-7">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900 tracking-tight">
                  {t('custom_header')}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('custom_hint')}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-gray-700 tabular-nums">
                {t('custom_count_suffix', { count: customSelected })}
              </span>
            </div>

            {customServices.length > 0 ? (
              <ul className="flex flex-wrap gap-2 mb-5">
                {customServices.map((label) => (
                  <li
                    key={label}
                    className="group inline-flex items-center gap-2 bg-[#F0DFF6] text-[#7E5896] text-sm font-semibold pl-3 pr-1.5 py-1.5 rounded-full"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[220px]">{label}</span>
                    <button
                      type="button"
                      onClick={() => removeCustom(label)}
                      disabled={!canEdit}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[#7E5896] hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                      aria-label={t('remove_custom_aria', { label })}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-5 text-center mb-5">
                <p className="text-sm text-gray-500">
                  {t('custom_empty')}
                </p>
              </div>
            )}

            <form onSubmit={addCustom} className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <FieldLabel>{t('custom_field_label')}</FieldLabel>
                <TextInput
                  value={customDraft}
                  onChange={(e) => setCustomDraft(e.target.value.slice(0, MAX_CUSTOM_LABEL))}
                  placeholder={t('custom_placeholder')}
                  maxLength={MAX_CUSTOM_LABEL}
                  disabled={!canEdit}
                />
              </div>
              <button
                type="submit"
                disabled={!canEdit || !customDraft.trim()}
                className="inline-flex items-center justify-center gap-1.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('add_service_button')}
              </button>
            </form>
          </section>
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-gray-100 bg-white/95 backdrop-blur z-30">
        <div className="px-6 lg:px-10 py-3 flex items-center justify-between gap-4">
          <div className="text-xs text-gray-500 flex items-center gap-3">
            <span>
              <span className="font-semibold text-gray-900 tabular-nums">{total}</span>{' '}
              {total === 1 ? t('total_label_singular') : t('total_label_plural')}
              {total < 3 ? (
                <span className="text-amber-700 ml-1.5">
                  {t('min_services_hint')}
                </span>
              ) : null}
            </span>
            {feedback ? (
              <span
                className={
                  feedback.kind === 'success'
                    ? 'text-emerald-700 font-semibold'
                    : 'text-rose-700 font-semibold'
                }
                role="status"
              >
                {feedback.message}
              </span>
            ) : null}
            {!canEdit && source.kind === 'live' ? (
              <span className="text-gray-400">
                {t('readonly_notice')}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveDisabled}
              className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-900 text-sm font-semibold px-4 py-2 rounded-full hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-4 h-4" />
              {pending ? t('saving_label') : t('save_button')}
            </button>
            {nextHref ? (
              <button
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
