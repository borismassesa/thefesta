'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CalendarHeart, MapPin, Clock, Check, PartyPopper, Heart, ImagePlus } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import { useT } from '@/components/providers/UIStringsProvider'
import { submitPublicRsvp, type PublicRsvpResponse, type PublicRsvpAnswerInput } from '@/lib/dashboard/actions'
import { eventTypeLabel, type RsvpStatus, type RsvpQuestion } from '@/lib/dashboard/types'
import type { PublicRsvpData } from '@/lib/dashboard/queries'
import { firstNameOf } from '@/lib/dashboard/share'

const inputClass =
  'w-full rounded-xl border border-black/[0.12] bg-white px-3.5 py-2.5 text-sm text-[#1A1A1A] outline-none transition-colors placeholder:text-[#1A1A1A]/35 focus:border-[#C9A0DC] focus:ring-2 focus:ring-[#C9A0DC]/30'

interface Answer {
  rsvp_status: RsvpStatus
  party_size: number
  meal_choice: string
  dietary_notes: string
  guest_message: string
}

/** A guest's answer to one custom question while filling the form. */
interface QAnswer {
  text: string
  optionId: string
  detailText: string
}

const EMPTY_QA: QAnswer = { text: '', optionId: '', detailText: '' }

/** Whether a per-event question should be shown given the chosen status. */
function eventQuestionVisible(q: RsvpQuestion, status: RsvpStatus): boolean {
  if (status === 'pending') return false
  if (q.attending_only) return status === 'attending'
  return true
}

/** Did the guest answer a question that requires an answer? */
function isAnswered(q: RsvpQuestion, a: QAnswer | undefined): boolean {
  if (!a) return false
  return q.kind === 'multiple_choice' ? a.optionId.length > 0 : a.text.trim().length > 0
}

function selectedOption(q: RsvpQuestion, optionId: string) {
  return q.options.find((o) => o.id === optionId) ?? null
}

function optionDetailPrompt(q: RsvpQuestion, optionId: string): string {
  return selectedOption(q, optionId)?.description?.trim() ?? ''
}

function detailTextFromAnswer(q: RsvpQuestion, answerText: string | null | undefined, optionId: string | null | undefined): string {
  if (!answerText || !optionId) return ''
  const label = selectedOption(q, optionId)?.label?.trim()
  if (!label) return ''
  const prefix = `${label}:`
  return answerText.startsWith(prefix) ? answerText.slice(prefix.length).trim() : ''
}

function multipleChoiceAnswerText(q: RsvpQuestion, a: QAnswer): string {
  const label = optionLabel(q, a.optionId)
  const detail = optionDetailPrompt(q, a.optionId) ? a.detailText.trim() : ''
  return detail ? `${label}: ${detail}` : label
}

function formatWhen(value: string | null, tbc: string): string {
  if (!value) return tbc
  return new Date(value).toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function PublicRsvpForm({
  data,
  token,
  followupModeRequested = false,
}: {
  data: PublicRsvpData
  token: string
  followupModeRequested?: boolean
}) {
  const t = useT('forms-rsvp')
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(
      data.events.map((e) => [
        e.invitation.id,
        {
          rsvp_status: e.invitation.rsvp_status,
          party_size: Math.max(1, data.guest.max_party_size || e.invitation.party_size || 1),
          meal_choice: e.invitation.meal_choice ?? '',
          dietary_notes: e.invitation.dietary_notes ?? '',
          guest_message: e.invitation.guest_message ?? '',
        },
      ])
    )
  )
  const [submitted, setSubmitted] = useState(false)
  const [pending, startTransition] = useTransition()

  // Custom-question answers. Per-event keyed by invitationId -> questionId;
  // general questions keyed by questionId (attached to the first invitation).
  const firstInvitationId = data.events[0]?.invitation.id ?? null
  const [eventQa, setEventQa] = useState<Record<string, Record<string, QAnswer>>>(() => {
    const init: Record<string, Record<string, QAnswer>> = {}
    for (const e of data.events) {
      const prior = data.answers[e.invitation.id] ?? {}
      const forEvent: Record<string, QAnswer> = {}
      for (const q of data.questionsByEvent[e.id] ?? []) {
        const a = prior[q.id]
        forEvent[q.id] = {
          text: a?.answer_text ?? '',
          optionId: a?.option_id ?? '',
          detailText: detailTextFromAnswer(q, a?.answer_text, a?.option_id),
        }
      }
      if (Object.keys(forEvent).length) init[e.invitation.id] = forEvent
    }
    return init
  })
  const [generalQa, setGeneralQa] = useState<Record<string, QAnswer>>(() => {
    const prior = firstInvitationId ? (data.answers[firstInvitationId] ?? {}) : {}
    return Object.fromEntries(
      data.generalQuestions.map((q) => {
        const a = prior[q.id]
        return [
          q.id,
          {
            text: a?.answer_text ?? '',
            optionId: a?.option_id ?? '',
            detailText: detailTextFromAnswer(q, a?.answer_text, a?.option_id),
          },
        ]
      })
    )
  })

  function update(id: string, patch: Partial<Answer>) {
    setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }))
  }

  function updateEventQa(invitationId: string, questionId: string, patch: Partial<QAnswer>) {
    setEventQa((prev) => ({
      ...prev,
      [invitationId]: { ...(prev[invitationId] ?? {}), [questionId]: { ...EMPTY_QA, ...prev[invitationId]?.[questionId], ...patch } },
    }))
  }

  function updateGeneralQa(questionId: string, patch: Partial<QAnswer>) {
    setGeneralQa((prev) => ({ ...prev, [questionId]: { ...EMPTY_QA, ...prev[questionId], ...patch } }))
  }

  function submit() {
    const responses: PublicRsvpResponse[] = data.events.map((e) => {
      const a = answers[e.invitation.id]
      return {
        invitationId: e.invitation.id,
        rsvp_status: a.rsvp_status === 'pending' ? 'pending' : a.rsvp_status,
        party_size: a.party_size,
        meal_choice: a.meal_choice || null,
        dietary_notes: a.dietary_notes || null,
        guest_message: a.guest_message || null,
      }
    })
    if (!followupMode && responses.some((r) => r.rsvp_status === 'pending')) {
      toast.error(t('error_answer_each'))
      return
    }

    // Gather custom-question answers + enforce required ones that are visible.
    const collected: PublicRsvpAnswerInput[] = []
    for (const e of data.events) {
      const status = answers[e.invitation.id].rsvp_status
      for (const q of data.questionsByEvent[e.id] ?? []) {
        if (!eventQuestionVisible(q, status)) continue
        const a = eventQa[e.invitation.id]?.[q.id]
        if (q.required && !isAnswered(q, a)) {
          toast.error(`Please answer: ${q.prompt}`)
          return
        }
        const detailPrompt = a ? optionDetailPrompt(q, a.optionId) : ''
        if (detailPrompt && !a?.detailText.trim()) {
          toast.error(`Please answer: ${detailPrompt}`)
          return
        }
        if (isAnswered(q, a)) {
          collected.push({
            invitationId: e.invitation.id,
            questionId: q.id,
            answer_text: q.kind === 'multiple_choice' ? multipleChoiceAnswerText(q, a!) : a!.text,
            option_id: q.kind === 'multiple_choice' ? a!.optionId : null,
          })
        }
      }
    }
    if (firstInvitationId) {
      for (const q of data.generalQuestions) {
        const a = generalQa[q.id]
        if (q.required && !isAnswered(q, a)) {
          toast.error(`Please answer: ${q.prompt}`)
          return
        }
        const detailPrompt = a ? optionDetailPrompt(q, a.optionId) : ''
        if (detailPrompt && !a?.detailText.trim()) {
          toast.error(`Please answer: ${detailPrompt}`)
          return
        }
        if (isAnswered(q, a)) {
          collected.push({
            invitationId: firstInvitationId,
            questionId: q.id,
            answer_text: q.kind === 'multiple_choice' ? multipleChoiceAnswerText(q, a!) : a!.text,
            option_id: q.kind === 'multiple_choice' ? a!.optionId : null,
          })
        }
      }
    }

    startTransition(async () => {
      const res = await submitPublicRsvp(token, responses, collected)
      if (res.ok) {
        setSubmitted(true)
        toast.success(t('toast_saved'))
      } else {
        toast.error(res.error ?? t('error_save'))
      }
    })
  }

  if (data.events.length === 0) {
    return (
      <Shell
        coupleName={data.coupleName}
        coverImageUrl={data.coverImageUrl}
      >
        <div className="text-center">
          <PartyPopper className="mx-auto h-10 w-10 text-[#8e57b3]" />
          <h1 className="mt-4 text-2xl font-bold text-[#1A1A1A]">
            {t('empty_greeting', { name: data.guest.full_name })}
          </h1>
          <p className="mt-2 text-[#1A1A1A]/60">{t('empty_body')}</p>
        </div>
      </Shell>
    )
  }

  const allAttendanceKnown = data.events.length > 0 && data.events.every((e) => e.invitation.rsvp_status !== 'pending')
  const followupMode = followupModeRequested || allAttendanceKnown
  const guestFirstName = firstNameOf(data.guest.full_name)
  const hasFollowupQuestions =
    followupMode &&
    (data.generalQuestions.length > 0 ||
      data.events.some((e) =>
        (data.questionsByEvent[e.id] ?? []).some((q) =>
          eventQuestionVisible(q, answers[e.invitation.id].rsvp_status),
        ),
      ))

  return (
    <Shell
      coupleName={data.coupleName}
      coverImageUrl={followupMode ? null : data.coverImageUrl}
    >
      <div className="text-center">
        {!followupMode ? (
          <p className="inline-flex rounded-full border border-[#C9A0DC]/35 bg-[#F7EFFB] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7B439E]">
            {t('eyebrow')}
          </p>
        ) : null}
        <h1 className={`${followupMode ? '' : 'mt-4'} font-serif text-4xl font-semibold leading-tight text-[#4F2877] sm:text-5xl`}>
          {followupMode ? t('followup_title') : data.coupleName}
        </h1>
        <div className="mx-auto mt-3 flex w-28 items-center justify-center gap-2 text-[#C9A0DC]">
          <span className="h-px flex-1 bg-current/40" />
          <Heart className="h-3.5 w-3.5" fill="currentColor" />
          <span className="h-px flex-1 bg-current/40" />
        </div>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-[#1A1A1A]/55">
          {followupMode
            ? t('followup_greeting')
            : t('header_greeting', { name: guestFirstName })}
        </p>
      </div>

      {submitted ? (
        <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <Check className="mx-auto h-8 w-8 text-emerald-600" />
          <h2 className="mt-3 text-lg font-semibold text-[#1A1A1A]">{t('submitted_title')}</h2>
          <p className="mt-1 text-sm text-[#1A1A1A]/60">{t('submitted_body')}</p>
          <button
            onClick={() => setSubmitted(false)}
            className="mt-4 text-sm font-semibold text-[#8e57b3] hover:underline"
          >
            {t('submitted_change')}
          </button>
        </div>
      ) : (
        <div className="mt-8 space-y-5">
          {followupMode && !hasFollowupQuestions ? (
            <div className="rounded-2xl border border-black/[0.08] bg-white p-6 text-center">
              <PartyPopper className="mx-auto h-8 w-8 text-[#8e57b3]" />
              <h2 className="mt-3 text-lg font-semibold text-[#1A1A1A]">{t('followup_empty_title')}</h2>
              <p className="mt-1 text-sm text-[#1A1A1A]/60">{t('followup_empty_body')}</p>
            </div>
          ) : null}
          {data.events.map((e) => {
            const a = answers[e.invitation.id]
            const eventQuestions = (data.questionsByEvent[e.id] ?? []).filter((q) =>
              eventQuestionVisible(q, a.rsvp_status),
            )
            if (followupMode && eventQuestions.length === 0) return null
            return (
              <div key={e.invitation.id} className="rounded-2xl border border-black/[0.08] bg-white p-5">
                {!followupMode ? (
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#C9A0DC]/15 text-[#8e57b3]">
                      <CalendarHeart className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-[#1A1A1A]">{e.name}</h3>
                      <p className="text-xs uppercase tracking-wide text-[#8e57b3]">
                        {eventTypeLabel(e.event_type)}
                      </p>
                      <div className="mt-2 space-y-1 text-sm text-[#1A1A1A]/60">
                        <p className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-[#1A1A1A]/35" /> {formatWhen(e.starts_at, t('date_tbc'))}
                        </p>
                        {e.venue_name || e.city ? (
                          <p className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-[#1A1A1A]/35" />
                            {[e.venue_name, e.address, e.city].filter(Boolean).join(', ')}
                          </p>
                        ) : null}
                        {e.dress_code ? <p className="text-xs">{t('dress_code_prefix')} {e.dress_code}</p> : null}
                        {e.description ? <p className="text-sm">{e.description}</p> : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {!followupMode && e.invitation.rsvp_status === 'pending' ? (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {(['attending', 'maybe', 'declined'] as RsvpStatus[]).map((s) => {
                      const active = a.rsvp_status === s
                      const label =
                        s === 'attending'
                          ? t('status_attending')
                          : s === 'maybe'
                            ? t('status_maybe')
                            : t('status_declined')
                      return (
                        <button
                          key={s}
                          onClick={() => update(e.invitation.id, { rsvp_status: s })}
                          className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                            active
                              ? s === 'attending'
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                : s === 'maybe'
                                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                                  : 'border-rose-400 bg-rose-50 text-rose-700'
                              : 'border-black/[0.12] text-[#1A1A1A]/60 hover:bg-black/[0.03]'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                ) : !followupMode ? (
                  <div className="mt-4 inline-flex rounded-full border border-[#C9A0DC]/45 bg-[#F6EEFB] px-3 py-1.5 text-xs font-semibold text-[#5d3a78]">
                    {a.rsvp_status === 'attending'
                      ? t('status_attending')
                      : a.rsvp_status === 'maybe'
                        ? t('status_maybe')
                        : t('status_declined')}
                  </div>
                ) : null}

                {/* Attending extras */}
                {!followupMode && a.rsvp_status === 'attending' ? (
                  <div className="mt-4 space-y-3">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-[#1A1A1A]/80">
                        {t('dietary_label')} <span className="font-normal text-[#1A1A1A]/40">{t('dietary_optional')}</span>
                      </span>
                      <input
                        className={inputClass}
                        value={a.dietary_notes}
                        onChange={(ev) => update(e.invitation.id, { dietary_notes: ev.target.value })}
                        placeholder={t('dietary_placeholder')}
                      />
                    </label>
                  </div>
                ) : null}

                {!followupMode ? <label className="mt-3 block">
                  <span className="mb-1.5 block text-sm font-medium text-[#1A1A1A]/80">
                    {t('message_label')} <span className="font-normal text-[#1A1A1A]/40">{t('message_optional')}</span>
                  </span>
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={a.guest_message}
                    onChange={(ev) => update(e.invitation.id, { guest_message: ev.target.value })}
                  />
                </label> : null}

                {/* Couple's follow-up questions for this event */}
                <div className={followupMode ? 'space-y-4' : ''}>
                  {eventQuestions.map((q) => (
                    <QuestionField
                      key={q.id}
                      question={q}
                      value={eventQa[e.invitation.id]?.[q.id] ?? EMPTY_QA}
                      onChange={(patch) => updateEventQa(e.invitation.id, q.id, patch)}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {/* General questions for everyone who responds */}
          {data.generalQuestions.length > 0 ? (
            <div className="rounded-2xl border border-black/[0.08] bg-white p-5">
              {!followupMode ? (
                <h3 className="text-base font-semibold text-[#1A1A1A]">A few more questions</h3>
              ) : null}
              <div className={followupMode ? 'space-y-4' : 'mt-1'}>
                {data.generalQuestions.map((q) => (
                  <QuestionField
                    key={q.id}
                    question={q}
                    value={generalQa[q.id] ?? EMPTY_QA}
                    onChange={(patch) => updateGeneralQa(q.id, patch)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {!followupMode || hasFollowupQuestions ? <button
            onClick={submit}
            disabled={pending}
            className="w-full rounded-xl bg-[#C9A0DC] px-4 py-3.5 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-[#b97fd0] disabled:opacity-50"
          >
            {pending ? t('send_pending') : followupMode ? t('send_details_cta') : t('send_cta')}
          </button> : null}
        </div>
      )}
    </Shell>
  )
}

function optionLabel(q: RsvpQuestion, optionId: string): string {
  return q.options.find((o) => o.id === optionId)?.label ?? ''
}

/** Renders one couple-authored question: short answer or multiple choice. */
function QuestionField({
  question,
  value,
  onChange,
}: {
  question: RsvpQuestion
  value: QAnswer
  onChange: (patch: Partial<QAnswer>) => void
}) {
  return (
    <div className="mt-3">
      <span className="mb-1.5 block text-sm font-medium text-[#1A1A1A]/80">
        {question.prompt}
        {question.required ? (
          <span className="ml-0.5 text-rose-500">*</span>
        ) : (
          <span className="ml-1 font-normal text-[#1A1A1A]/40">(optional)</span>
        )}
      </span>
      {question.description ? (
        <p className="mb-2 text-xs text-[#1A1A1A]/50">{question.description}</p>
      ) : null}

      {question.kind === 'multiple_choice' ? (
        <div className="space-y-2">
          {question.options.map((opt) => {
            const active = value.optionId === opt.id
            const detailPrompt = opt.description?.trim()
            return (
              <div key={opt.id} className="space-y-2">
                <button
                  type="button"
                  onClick={() => onChange({ optionId: opt.id, detailText: active ? value.detailText : '' })}
                  className={`flex w-full items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors ${
                    active ? 'border-[#C9A0DC] bg-[#F0DFF6]/50 text-[#1A1A1A]' : 'border-black/[0.12] text-[#1A1A1A]/70 hover:bg-black/[0.03]'
                  }`}
                >
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${active ? 'border-[#7E5896]' : 'border-black/25'}`}>
                    {active ? <span className="h-2 w-2 rounded-full bg-[#7E5896]" /> : null}
                  </span>
                  <span className="font-medium">{opt.label}</span>
                </button>
                {active && detailPrompt ? (
                  <label className="block rounded-xl border border-[#C9A0DC]/45 bg-[#F6EEFB]/40 p-3">
                    <span className="mb-1.5 block text-xs font-semibold text-[#5d3a78]">{detailPrompt}</span>
                    <textarea
                      className={inputClass}
                      rows={2}
                      value={value.detailText}
                      onChange={(ev) => onChange({ detailText: ev.target.value })}
                    />
                  </label>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <textarea
          className={inputClass}
          rows={2}
          value={value.text}
          onChange={(ev) => onChange({ text: ev.target.value })}
        />
      )}
    </div>
  )
}

function Shell({
  children,
  coupleName,
  coverImageUrl,
}: {
  children: React.ReactNode
  coupleName: string
  coverImageUrl?: string | null
}) {
  return (
    <div className="min-h-screen bg-white text-[#1A1A1A] lg:grid lg:grid-cols-2">
      <Logo className="fixed left-4 top-4 z-10 drop-shadow-sm sm:left-6 sm:top-6" />

      <aside className="relative min-h-[360px] overflow-hidden bg-gradient-to-br from-[#F1F4EB] to-[#E6EADE] lg:sticky lg:top-0 lg:h-screen">
        {coverImageUrl ? (
          <>
          <img
            src={coverImageUrl}
            alt={`${coupleName} photo`}
            className="absolute inset-0 h-full w-full object-cover"
          />
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-white/10" />
          </>
        ) : (
          <div className="relative flex h-full min-h-[360px] items-end px-6 pb-10 pt-24 lg:min-h-screen lg:px-12 lg:pb-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(201,160,220,0.16),transparent_32%),radial-gradient(circle_at_78%_76%,rgba(79,40,119,0.08),transparent_34%)]" />
            <div className="relative w-full max-w-[460px]">
              <div className="aspect-[4/5] w-full rounded-[26px] border border-dashed border-[#C9A0DC]/45 bg-white/25 p-3 shadow-[0_28px_90px_-56px_rgba(65,42,78,0.45)]">
                <div className="flex h-full items-center justify-center rounded-[20px] bg-white/25">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#C9A0DC]/30 bg-white/60 text-[#7B439E]">
                    <ImagePlus className="h-5 w-5" />
                  </span>
                </div>
              </div>
              <div className="mt-5 max-w-sm text-left">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8e57b3]">
                  Couple photo
                </p>
                <h2 className="mt-2 text-lg font-semibold leading-snug text-[#1A1A1A]">
                  Add a photo from the dashboard
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[#1A1A1A]/55">
                  This space will show the couple&apos;s uploaded photo once it is added.
                </p>
              </div>
            </div>
          </div>
        )}
      </aside>

      <main className="flex justify-center px-5 py-8 sm:px-8 sm:py-10 lg:min-h-screen lg:px-14 lg:py-16">
        <div className="w-full max-w-lg">
          {children}
          <footer className="mt-8 flex justify-center text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#1A1A1A]/45 shadow-[0_10px_30px_-24px_rgba(0,0,0,0.35)]">
              <span>Powered</span>
              <span>with</span>
              <Heart className="h-3 w-3 text-[#C9A0DC]" fill="currentColor" />
              <span>by</span>
              <span className="font-semibold text-[#5d2f83]">OpusPass</span>
            </span>
          </footer>
        </div>
      </main>
    </div>
  )
}
