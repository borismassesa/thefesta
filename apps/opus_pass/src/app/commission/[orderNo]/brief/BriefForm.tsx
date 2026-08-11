'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BRIEF_MAX_FILES,
  BRIEF_MAX_FILE_BYTES,
  missingRequiredAnswers,
  type BriefQuestion,
} from '@opusfesta/lib'

type Attachment = { name: string; size: number; path: string }

/**
 * The brief form.
 * Specs: OP-CCS-PRD-001 §7.3, §8.
 *
 * Two decisions worth naming:
 *
 * 1. Answers autosave on blur, not only on submit. The target is 80% of briefs
 *    completed within 24h of payment on mid-range Android over patchy
 *    connectivity, and a form that loses ten minutes of typing when the
 *    connection drops does not hit that number.
 *
 * 2. `missingRequiredAnswers` is the SAME function the server uses, imported
 *    from the shared package. The button's disabled state and the server's
 *    accept/reject decision cannot disagree, which is what stops the dead-end
 *    where a customer is told to fill something in that they already filled in.
 */
export default function BriefForm({
  orderKey,
  token,
  locale,
  questions,
  initialAnswers,
  initialAttachments,
  alreadyComplete,
}: {
  orderKey: string
  token: string | null
  locale: 'en' | 'sw'
  questions: BriefQuestion[]
  initialAnswers: Record<string, unknown>
  initialAttachments: Attachment[]
  alreadyComplete: boolean
}) {
  const router = useRouter()
  const sw = locale === 'sw'
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers)
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const endpoint = `/api/commission/orders/${encodeURIComponent(orderKey)}/brief${
    token ? `?t=${encodeURIComponent(token)}` : ''
  }`

  const missing = useMemo(
    () => missingRequiredAnswers(questions, answers).map((q) => q.key),
    [questions, answers],
  )

  const save = useCallback(
    async (complete: boolean) => {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, complete }),
      })
      return (await res.json().catch(() => ({}))) as {
        message?: string
        missingRequired?: string[]
        status?: string
      }
    },
    [answers, endpoint],
  )

  async function autosave() {
    if (submitting) return
    setSaving(true)
    try {
      await save(false)
    } catch {
      // Autosave failing silently is correct: the customer has not asked for
      // anything, and an error toast mid-typing is noise. The explicit submit
      // below surfaces any real problem.
    } finally {
      setSaving(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const body = await save(true)
      if (body.missingRequired && body.missingRequired.length > 0) {
        setError(
          sw
            ? 'Baadhi ya majibu yanayohitajika bado hayajajazwa.'
            : 'A few required answers are still missing.',
        )
        return
      }
      setDone(body.message ?? (sw ? 'Asante!' : 'Thank you!'))
      router.refresh()
    } catch {
      setError(sw ? 'Hakuna mtandao. Jaribu tena.' : 'No connection. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function upload(file: File) {
    setError(null)
    if (file.size > BRIEF_MAX_FILE_BYTES) {
      setError(sw ? 'Kila faili lisizidi MB 15.' : 'Each file must be under 15 MB.')
      return
    }
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(endpoint, { method: 'POST', body: form })
    const body = (await res.json().catch(() => ({}))) as {
      attachments?: Attachment[]
      message?: string
    }
    if (!res.ok) {
      setError(body.message ?? (sw ? 'Imeshindikana kupakia.' : 'That upload did not work.'))
      return
    }
    if (body.attachments) setAttachments(body.attachments)
  }

  if (done) {
    return (
      <div className="mt-8 rounded-2xl border border-[#E8DCC8] bg-[#FDF8F5] p-6">
        <p className="font-serif text-lg text-[#4A2D5C]">{done}</p>
        <a
          href={`/commission/${orderKey}${token ? `?t=${encodeURIComponent(token)}` : ''}`}
          className="mt-4 inline-block rounded-full bg-[#4A2D5C] px-5 py-2.5 text-sm font-semibold text-white"
        >
          {sw ? 'Angalia hali ya oda' : 'See your order status'}
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-6">
      {questions.map((q) => {
        const label = sw ? q.labelSw : q.labelEn
        const help = sw ? q.helpSw : q.helpEn
        const value = (answers[q.key] as string) ?? ''
        const isMissing = q.required && missing.includes(q.key)
        const set = (v: string) => setAnswers((a) => ({ ...a, [q.key]: v }))

        return (
          <div key={q.id}>
            <label className="block text-sm font-medium text-[#4A2D5C]">
              {label}
              {q.required && <span className="ml-1 text-[#C9A961]">*</span>}
            </label>
            {help && <p className="mt-0.5 text-xs text-[#8A7A92]">{help}</p>}

            {q.fieldType === 'longtext' ? (
              <textarea
                value={value}
                onChange={(e) => set(e.target.value)}
                onBlur={autosave}
                rows={4}
                className="mt-2 w-full rounded-xl border border-[#E8DCC8] px-4 py-3 text-base text-[#4A2D5C] outline-none focus:border-[#C9A961]"
              />
            ) : q.fieldType === 'choice' ? (
              <div className="mt-2 space-y-2">
                {q.options.map((option) => (
                  <button data-opus-button="neutral" data-opus-button-size="large"
                    key={option}
                    type="button"
                    onClick={() => {
                      set(option)
                      void autosave()
                    }}
                    className={[
                      'block w-full rounded-xl border px-4 py-3 text-left text-sm',
                      value === option
                        ? 'border-[#C9A961] bg-[#FDF8F5] font-semibold text-[#4A2D5C]'
                        : 'border-[#E8DCC8] bg-white text-[#6B5B73]',
                    ].join(' ')}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : q.fieldType === 'file' ? (
              <div className="mt-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void upload(f)
                    e.target.value = ''
                  }}
                  className="hidden"
                />
                <button data-opus-button="control"
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={attachments.length >= BRIEF_MAX_FILES}
                  className="rounded-xl border border-dashed border-[#C9A961] bg-[#FDF8F5] px-4 py-3 text-sm text-[#4A2D5C] disabled:opacity-50"
                >
                  {sw ? 'Ambatisha picha au PDF' : 'Attach a photo or PDF'}
                </button>
                <p className="mt-1 text-xs text-[#8A7A92]">
                  {sw
                    ? `Hadi faili ${BRIEF_MAX_FILES}, kila moja chini ya MB 15.`
                    : `Up to ${BRIEF_MAX_FILES} files, each under 15 MB.`}
                </p>
                {attachments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {attachments.map((a) => (
                      <li key={a.path} className="text-xs text-[#6B5B73]">
                        {a.name} · {(a.size / 1024).toFixed(0)} KB
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <input
                type={q.fieldType === 'date' ? 'date' : q.fieldType === 'color' ? 'color' : 'text'}
                value={value}
                onChange={(e) => set(e.target.value)}
                onBlur={autosave}
                className={[
                  'mt-2 w-full rounded-xl border px-4 py-3 text-base text-[#4A2D5C] outline-none focus:border-[#C9A961]',
                  isMissing ? 'border-[#E4B7B7]' : 'border-[#E8DCC8]',
                  q.fieldType === 'color' ? 'h-12 p-1' : '',
                ].join(' ')}
              />
            )}
          </div>
        )
      })}

      {error && <p className="text-sm text-[#8A4A4A]">{error}</p>}

      <div className="sticky bottom-0 -mx-5 border-t border-[#E8DCC8] bg-white/95 px-5 py-4 backdrop-blur">
        <button data-opus-button="primary" data-opus-button-size="large"
          type="submit"
          disabled={submitting || missing.length > 0}
          className="w-full rounded-full bg-[#4A2D5C] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting
            ? sw ? 'Inatuma…' : 'Sending…'
            : alreadyComplete
              ? sw ? 'Hifadhi mabadiliko' : 'Save changes'
              : sw ? 'Tuma kwa mbunifu' : 'Send to my designer'}
        </button>
        <p className="mt-2 text-center text-xs text-[#8A7A92]">
          {missing.length > 0
            ? sw
              ? `Majibu ${missing.length} yanayohitajika bado.`
              : `${missing.length} required answer${missing.length === 1 ? '' : 's'} still to go.`
            : saving
              ? sw ? 'Inahifadhi…' : 'Saving…'
              : sw ? 'Majibu yako huhifadhiwa yenyewe.' : 'Your answers save as you go.'}
        </p>
      </div>
    </form>
  )
}
