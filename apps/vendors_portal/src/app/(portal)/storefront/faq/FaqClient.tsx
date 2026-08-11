'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, Save, Trash2 } from 'lucide-react'
import { FieldLabel, TextArea, TextInput } from '@/components/onboard/FormField'
import { useOnboardingDraft, type FAQItem } from '@/lib/onboarding/draft'
import { usePortalT } from '@/components/providers/PortalUIStringsProvider'
import { loadFaqs, saveFaqs } from '../sections/actions'

const newFaq = (seed?: Partial<FAQItem>): FAQItem => ({
  id:
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `faq-${Math.random().toString(36).slice(2, 10)}`,
  question: '',
  answer: '',
  ...seed,
})

export default function FaqClient() {
  const router = useRouter()
  const t = usePortalT('storefront-faq')
  const SUGGESTED_QUESTIONS = [
    t('suggested_question_1'),
    t('suggested_question_2'),
    t('suggested_question_3'),
    t('suggested_question_4'),
    t('suggested_question_5'),
    t('suggested_question_6'),
    t('suggested_question_7'),
  ]
  const { draft, update, hydrated } = useOnboardingDraft()
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [saving, startSaving] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  // Previously this returned `<div p-8 aria-hidden />` until localStorage
  // hydrated. That created a hydration mismatch because the server
  // rendered the placeholder div inside <main>, the client expected the
  // full page structure, and React 16/Next.js flagged the swap. Now we
  // always render the real structure with whatever `draft` has — empty
  // arrays until useEffect populates from localStorage — and the
  // component re-renders cleanly once hydrated.
  const faqs = hydrated ? draft.faqs : []

  // Hydrate the editor from the DB (source of truth). The localStorage draft
  // is only a per-device scratch pad, so a fresh device / cleared storage /
  // admin-approved vendor would otherwise see an empty list even though the
  // storefront has saved FAQs. We seed only when the local draft is empty so
  // we never clobber unsaved edits made on this device.
  const seeded = useRef(false)
  useEffect(() => {
    if (!hydrated || seeded.current) return
    seeded.current = true
    if (draft.faqs.length > 0) return
    void loadFaqs().then((res) => {
      if (res.ok && res.faqs.length > 0) {
        update({
          faqs: res.faqs.map((f) => newFaq({ question: f.question, answer: f.answer })),
        })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  const updateFaq = (id: string, patch: Partial<FAQItem>) => {
    if (!hydrated) return
    update({ faqs: faqs.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
  }

  const addFaq = (question?: string) => {
    if (!hydrated) return
    update({ faqs: [...faqs, newFaq({ question: question ?? '' })] })
  }

  const removeFaq = (id: string) => {
    if (!hydrated) return
    update({ faqs: faqs.filter((f) => f.id !== id) })
  }

  const usedSuggestions = new Set(faqs.map((f) => f.question.trim()))
  const availableSuggestions = SUGGESTED_QUESTIONS.filter(
    (q) => !usedSuggestions.has(q),
  )

  const completeFaqs = faqs.filter((f) => f.question.trim() && f.answer.trim()).length

  const onSave = () => {
    setSaveError(null)
    setSaveOk(false)
    startSaving(async () => {
      const res = await saveFaqs(
        faqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer })),
      )
      if (!res.ok) {
        setSaveError(res.error)
        return
      }
      setSaveOk(true)
    })
  }

  return (
    <div className="px-6 lg:px-10 pt-4 lg:pt-5 pb-32">
      <div className="max-w-4xl">
        {/* Suggestions */}
        {availableSuggestions.length > 0 ? (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6 lg:p-7">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="text-base font-semibold text-gray-900 tracking-tight">
                {t('suggestions_header')}
              </h2>
              <button data-opus-button="control"
                type="button"
                onClick={() => setShowSuggestions((v) => !v)}
                className="text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                {showSuggestions ? t('toggle_hide') : t('toggle_show_all')}
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {t('suggestions_hint')}
            </p>
            <div className="flex flex-wrap gap-2">
              {(showSuggestions ? availableSuggestions : availableSuggestions.slice(0, 4)).map(
                (q) => (
                  <button data-opus-button="primary" data-opus-button-size="small"
                    key={q}
                    type="button"
                    onClick={() => addFaq(q)}
                    className="inline-flex items-center gap-1.5 bg-gray-50 hover:bg-gray-900 hover:text-white border border-gray-200 hover:border-gray-900 text-gray-800 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    {q}
                  </button>
                ),
              )}
            </div>
          </section>
        ) : null}

        {/* FAQ list */}
        <section className="mt-6">
          {faqs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
              <p className="text-sm text-gray-600 max-w-md mx-auto">
                {t('empty_desc')}
              </p>
              <button data-opus-button="primary" data-opus-button-size="medium"
                type="button"
                onClick={() => addFaq()}
                className="inline-flex items-center gap-2 mt-5 bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('add_question')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <FaqCard
                  key={faq.id}
                  index={i + 1}
                  faq={faq}
                  onChange={(patch) => updateFaq(faq.id, patch)}
                  onRemove={() => removeFaq(faq.id)}
                />
              ))}

              <button data-opus-button="neutral" data-opus-button-size="medium"
                type="button"
                onClick={() => addFaq()}
                className="w-full bg-white rounded-2xl border border-dashed border-gray-300 hover:border-gray-500 hover:bg-gray-50 transition-colors py-5 inline-flex items-center justify-center gap-2 text-sm font-semibold text-gray-900"
              >
                <Plus className="w-4 h-4" />
                {t('add_another_question')}
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Persist to DB so admin + public profile pick up the answers. */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-100 bg-white/95 backdrop-blur z-30">
        <div className="px-6 lg:px-10 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-xs text-gray-500">
            {t('counts_complete_total', { complete: completeFaqs, total: faqs.length })}
            {saveError && <span className="ml-3 text-rose-700">{saveError}</span>}
            {saveOk && !saveError && (
              <span className="ml-3 text-emerald-700">{t('saved_label')}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button data-opus-button="neutral" data-opus-button-size="medium"
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-900 text-sm font-semibold px-4 py-2 rounded-full hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? t('saving_label') : t('save_button')}
            </button>
            {/* FAQ is the last storefront section — send the vendor back to the
                storefront overview so they can review completeness and publish. */}
            <button data-opus-button="primary" data-opus-button-size="medium"
              type="button"
              onClick={() => router.push('/storefront')}
              className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-gray-800 transition-colors"
            >
              {t('done_button')}
              <Check className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FaqCard({
  index,
  faq,
  onChange,
  onRemove,
}: {
  index: number
  faq: FAQItem
  onChange: (patch: Partial<FAQItem>) => void
  onRemove: () => void
}) {
  const t = usePortalT('storefront-faq')
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] p-6 lg:p-7">
      <div className="flex items-start justify-between gap-4 mb-4">
        <span className="inline-flex items-center bg-gray-100 text-gray-700 text-xs font-semibold px-2.5 py-1 rounded-full">
          {t('question_index_label', { index })}
        </span>
        <button data-opus-button="control"
          type="button"
          onClick={onRemove}
          aria-label={t('remove_question_aria')}
          className="-mr-2 -mt-2 p-2 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <FieldLabel required>{t('field_question_label')}</FieldLabel>
          <TextInput
            placeholder={t('question_placeholder')}
            value={faq.question}
            onChange={(e) => onChange({ question: e.target.value })}
          />
        </div>
        <div>
          <FieldLabel required>{t('field_answer_label')}</FieldLabel>
          <TextArea
            placeholder={t('answer_placeholder')}
            value={faq.answer}
            onChange={(e) => onChange({ answer: e.target.value })}
            rows={4}
          />
        </div>
      </div>
    </div>
  )
}
