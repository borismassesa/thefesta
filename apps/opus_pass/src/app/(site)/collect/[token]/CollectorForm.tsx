'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Send, CheckCircle2, Heart, Image as ImageIcon } from 'lucide-react'
import { submitCollectorEntry } from './actions'
import { firstNameOf } from '@/lib/dashboard/share'
import { useT } from '@/components/providers/UIStringsProvider'
import { LocaleToggle } from '@/components/LocaleToggle'
import Logo from '@/components/ui/Logo'
import type { Locale } from '@/lib/cms/localized'
import {
  resolveCollectorPage,
  accentInk,
  isVideoCoverUrl,
  PLEDGE_PREVIEW_MESSAGE,
  PLEDGE_PREVIEW_READY,
  type PledgePageConfig,
} from '@/lib/dashboard/pledge-page'
import Confetti from '@/components/digital-cards/Confetti'

/** Fixed two-tone backdrop: soft grey behind the cover media, light sage
 *  behind the form — not the couple's customizable accent, just the page's
 *  own quiet backdrop. */
const COVER_BG = '#F3F1EE'
const PAGE_BG = '#EDF2E7'

interface Props {
  token: string
  coupleName: string
  config: PledgePageConfig
  /** Which event this link was tagged for (?event=<id>), null for a bare/
   *  legacy link. Re-verified server-side before it's trusted for anything. */
  eventId: string | null
  /** Guest's chosen language (from the opuspass_locale cookie) — picks which
   *  built-in default copy to fall back to when the couple hasn't customized
   *  their collector page text. */
  locale: Locale
}

const fieldClass =
  'block w-full rounded-2xl border border-black/[0.1] bg-white px-4 py-3.5 text-[15px] text-[#1A1A1A] placeholder:text-[#1A1A1A]/30 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition focus:border-[#C9A0DC] focus:outline-none focus:ring-4 focus:ring-[#C9A0DC]/15'

export default function CollectorForm({
  token,
  coupleName,
  config,
  eventId,
  locale,
}: Props) {
  const t = useT('forms-collect')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  // Live preview: apply config pushed via postMessage from the customize editor.
  const [override, setOverride] = useState<PledgePageConfig | null>(null)
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === PLEDGE_PREVIEW_MESSAGE) setOverride(e.data.config ?? {})
    }
    window.addEventListener('message', onMessage)
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: PLEDGE_PREVIEW_READY }, window.location.origin)
    }
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Only truthy inside the dashboard's own live-preview iframe (the parent
  // posts config updates as the couple edits). A direct guest visit never
  // receives this message, so it stays null there.
  const isPreview = override !== null

  const cfg = resolveCollectorPage(override ?? config, locale)
  const hasCover = Boolean(cfg.coverImageUrl)
  const isVideo = hasCover && isVideoCoverUrl(cfg.coverImageUrl!)
  const onAccent = accentInk(cfg.accent)

  // First names only on the form heading ("Jonathan & Jenifer"), not full names.
  const parts = coupleName
    .split(/\s*(?:&|and|\bna\b|\+)\s*/i)
    .map((p) => firstNameOf(p.trim()))
    .filter(Boolean)
  const shortCoupleName = parts.length >= 2 ? `${parts[0]} & ${parts[1]}` : coupleName

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error(t('error_name'))
      return
    }
    for (const q of cfg.questions) {
      if (q.required && !(answers[q.id] ?? '').trim()) {
        toast.error(`Please answer: ${q.prompt}`)
        return
      }
    }
    const questionAnswers = cfg.questions
      .map((q) => ({ prompt: q.prompt, answer: (answers[q.id] ?? '').trim() }))
      .filter((a) => a.answer)
    startTransition(async () => {
      try {
        await submitCollectorEntry(token, {
          full_name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          answers: questionAnswers,
          eventId,
        })
        setDone(true)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('error_submit'))
      }
    })
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2" style={{ backgroundColor: PAGE_BG }}>
      <LocaleToggle className="fixed right-4 top-4 z-10 shadow-sm sm:right-6 sm:top-6" />

      {/* ── Decorative cover — the couple's own uploaded photo/video, shown
          as-is. No fake default media: with nothing uploaded yet, a real
          guest sees a plain backdrop, and the dashboard's own live preview
          shows an upload nudge instead. ── */}
      <aside
        className="relative flex items-center justify-center overflow-y-auto px-5 pb-8 pt-24 sm:px-10 sm:pb-14 sm:pt-20 lg:sticky lg:top-0 lg:h-screen lg:min-h-0 lg:px-16 lg:pb-16 lg:pt-24"
        style={{ backgroundColor: COVER_BG }}
      >
        <Logo className="absolute left-4 top-4 z-10 drop-shadow-sm sm:left-6 sm:top-6" />

        {hasCover ? (
          isVideo ? (
            <video
              src={cfg.coverImageUrl!}
              className="max-h-[65vh] w-auto max-w-full rounded-2xl bg-[#E5E3DE] object-contain shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] sm:max-h-[75vh] lg:max-h-[calc(100vh-8rem)]"
              muted
              loop
              autoPlay
              playsInline
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={cfg.coverImageUrl!}
              alt={coupleName}
              className="max-h-[65vh] w-auto max-w-full rounded-2xl object-contain shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] sm:max-h-[75vh] lg:max-h-[calc(100vh-8rem)]"
            />
          )
        ) : isPreview ? (
          // Editing preview with no photo/video yet — nudge the couple to
          // upload one instead of showing a fake stand-in cover.
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white ring-1 ring-black/[0.08]">
              <ImageIcon className="h-6 w-6 text-[#1A1A1A]/40" />
            </span>
            <div>
              <p className="text-base font-semibold text-[#1A1A1A]">Upload your photo or video</p>
              <p className="mt-1 max-w-[240px] text-sm text-[#1A1A1A]/55">
                Add a cover on the left to see your guests&apos; page come to life here.
              </p>
            </div>
          </div>
        ) : null}
      </aside>

      {/* ── Form ── */}
      <main className="flex justify-center px-4 py-10 sm:px-8 lg:px-12 lg:pb-16 lg:pt-28">
        <div className="w-full max-w-lg">
          {done ? (
            <>
              <Confetti />
              <div className="rounded-[var(--opus-radius-large)] border border-black/[0.06] bg-white px-6 py-14 text-center shadow-[0_30px_70px_-40px_rgba(0,0,0,0.25)] sm:px-10">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#9FE870]/25">
                  <CheckCircle2 className="h-7 w-7 text-[#3f6b1f]" />
                </span>
                <h2 className="mt-5 font-serif text-3xl text-[#1A1A1A]">{t('success_heading')}</h2>
                <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[#1A1A1A]/60">
                  {t('success_body', { coupleName })}
                </p>
              </div>
            </>
          ) : (
            <div className="rounded-[var(--opus-radius-large)] border border-black/[0.06] bg-white px-6 py-10 shadow-[0_30px_70px_-40px_rgba(0,0,0,0.25)] sm:px-10 sm:py-12">
              <h2 className="text-center leading-tight text-[#1A1A1A]">
                <span
                  className="block text-[2rem] leading-none sm:text-4xl lg:text-5xl"
                  style={{ fontFamily: 'var(--font-dancing), cursive' }}
                >
                  {shortCoupleName}
                </span>
                <div className="mx-auto mt-3 flex items-center justify-center gap-2.5" aria-hidden>
                  <span className="h-px w-8" style={{ backgroundColor: cfg.accent, opacity: 0.5 }} />
                  <Heart className="h-3 w-3 shrink-0" style={{ color: cfg.accent }} fill="currentColor" strokeWidth={0} />
                  <span className="h-px w-8" style={{ backgroundColor: cfg.accent, opacity: 0.5 }} />
                </div>
                <span className="mt-3 block font-serif text-2xl text-[#1A1A1A]/80 sm:text-[26px]">
                  {cfg.headingLine2}
                </span>
              </h2>
              <p className="mx-auto mt-4 max-w-md text-center text-[15px] leading-relaxed text-[#1A1A1A]/55">
                {cfg.intro}
              </p>

              <form onSubmit={submit} className="mt-8 space-y-5">
                <Field label={t('label_name')} required accent={cfg.accent}>
                  <input
                    required
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('placeholder_name')}
                    className={fieldClass}
                  />
                </Field>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field label={t('label_whatsapp')}>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={t('placeholder_whatsapp')}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label={t('label_email')}>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('placeholder_email')}
                      className={fieldClass}
                    />
                  </Field>
                </div>

                {cfg.questions.map((q) => (
                  <Field key={q.id} label={q.prompt} required={q.required} accent={cfg.accent}>
                    {q.kind === 'multiple_choice' ? (
                      <div className="space-y-2">
                        {q.options
                          .filter((opt) => opt.label.trim())
                          .map((opt) => (
                            <label
                              key={opt.id}
                              className="flex cursor-pointer items-center gap-2.5 rounded-2xl border border-black/[0.1] bg-white px-4 py-3 text-[15px] text-[#1A1A1A] transition has-[:checked]:border-[#C9A0DC] has-[:checked]:bg-[#F0DFF6]/30"
                            >
                              <input
                                type="radio"
                                name={`question-${q.id}`}
                                value={opt.label}
                                checked={answers[q.id] === opt.label}
                                onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt.label }))}
                                className="h-4 w-4 shrink-0 accent-[#C9A0DC]"
                              />
                              {opt.label}
                            </label>
                          ))}
                      </div>
                    ) : (
                      <input
                        required={q.required}
                        value={answers[q.id] ?? ''}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                        className={fieldClass}
                      />
                    )}
                  </Field>
                ))}

                <button data-opus-button="primary" data-opus-button-size="large"
                  type="submit"
                  disabled={pending}
                  style={{ backgroundColor: cfg.accent, color: onAccent }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-bold shadow-[0_10px_24px_-12px_rgba(0,0,0,0.5)] transition hover:-translate-y-px hover:brightness-95 active:translate-y-0 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {pending ? t('send_pending') : cfg.buttonLabel}
                </button>

                <p className="text-center text-[11px] leading-relaxed text-[#1A1A1A]/45">
                  {cfg.privacyNote.replace(/\{couple\}/g, shortCoupleName)}
                </p>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function Field({
  label,
  required,
  accent,
  children,
}: {
  label: string
  required?: boolean
  accent?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[#1A1A1A]/70">
        {label}
        {required ? <span style={{ color: accent ?? '#b97fd0' }}> *</span> : null}
      </span>
      {children}
    </label>
  )
}
