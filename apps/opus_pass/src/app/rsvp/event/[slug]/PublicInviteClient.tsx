'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { submitPublicInviteRsvp } from '@/lib/dashboard/actions'
import type { PublicInviteData, PublicInviteEvent } from '@/lib/dashboard/queries'
import type { RsvpQuestion } from '@/lib/dashboard/types'
import { formatLongDate } from '@/lib/dashboard/share'
import { eventTypeLabel, MAX_SELF_SERVICE_PARTY } from '@/lib/dashboard/types'
import type { RsvpStatus } from '@/lib/dashboard/types'
import Logo from '@/components/ui/Logo'
import PoweredByLine from '@/components/ui/PoweredByLine'
import { CalendarDays, CheckCircle2, Clock, Heart, MapPin, PartyPopper, Send, Shirt } from 'lucide-react'
import { isVideoCoverUrl } from '@/lib/dashboard/pledge-page'

// OpusPass palette — same family as the couple dashboard and /rsvp/[token].
const INK = '#1A1A1A'
const PURPLE = '#6B3FA0'
const PURPLE_D = '#4A2870'
const LAV = '#C9A0DC'

const serif = { fontFamily: 'var(--font-cormorant), Georgia, serif' }
const EVENT_CARD_IMAGE = '/assets/images/rsvp-confetti-card.jpg'

type Lang = 'sw' | 'en'
const LANG_KEY = 'opuspass-invite-lang'

/** All page chrome in both languages — ONE language on screen at a time. */
const STR: Record<Lang, Record<string, string>> = {
  sw: {
    eyebrow: 'Karibu, umealikwa',
    rsvp_title: 'Thibitisha ujio wako',
    rsvp_sub: 'Tafadhali tujibu hapa chini.',
    name: 'Jina lako',
    name_ph: 'Asha Juma',
    phone: 'Namba ya simu',
    attend: 'Utahudhuria?',
    yes: 'Naja, nitafika',
    maybe: 'Labda',
    no: 'Siwezi kufika',
    party: 'Wangapi mtakuja?',
    message: 'Ujumbe (hiari)',
    message_ph: 'Hongera! 💚',
    send: 'Tuma jibu',
    sending: 'Inatuma…',
    done_title: 'Asante! Jibu lako limetumwa.',
    done_body: 'Wenye sherehe wamepokea jibu lako na watathibitisha nafasi yako.',
    when: 'Lini',
    where: 'Wapi',
    dress: 'Mavazi',
    passed_title: 'Sherehe hii imepita 💚',
    passed_body: 'Asante kwa kuwa sehemu ya safari yao.',
    personal_title: 'Tunafurahi umealikwa 💚',
    personal_body: 'Kujibu, tumia kiungo binafsi ulichotumiwa moja kwa moja.',
    answer_prefix: 'Tafadhali jibu: ',
    error_generic: 'Kuna hitilafu, tafadhali jaribu tena.',
    optional: '(hiari)',
    powered: 'Inaendeshwa kwa {icon} na OpusPass',
  },
  en: {
    eyebrow: "Karibu, you're invited",
    rsvp_title: 'RSVP',
    rsvp_sub: "We'd love to know if you can make it.",
    name: 'Your name',
    name_ph: 'Asha Juma',
    phone: 'Phone number',
    attend: 'Will you attend?',
    yes: "I'll be there",
    maybe: 'Maybe',
    no: "Can't make it",
    party: 'Party size',
    message: 'Message (optional)',
    message_ph: 'Congratulations! 💚',
    send: 'Send RSVP',
    sending: 'Sending…',
    done_title: 'Thank you! Your reply was sent.',
    done_body: 'The couple has received your RSVP and will confirm your spot.',
    when: 'When',
    where: 'Where',
    dress: 'Dress',
    passed_title: 'This celebration has passed 💚',
    passed_body: 'Thank you for being part of their journey.',
    personal_title: "We're glad you're invited 💚",
    personal_body: 'To RSVP, please use the personal link the couple sent you directly.',
    answer_prefix: 'Please answer: ',
    error_generic: 'Something went wrong, please try again.',
    optional: '(optional)',
    powered: 'Powered with {icon} by OpusPass',
  },
}

function eventTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function dotDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

function EventCard({ event, t }: { event: PublicInviteEvent; t: Record<string, string> }) {
  const date = formatLongDate(event.starts_at)
  const time = eventTime(event.starts_at)
  const venue = [event.venue_name, event.address].filter(Boolean).join(', ')
  return (
    <div className="relative overflow-hidden rounded-2xl border border-black/[0.08] bg-[linear-gradient(135deg,#ffffff_0%,#ffffff_58%,#F6EEFB_100%)] p-5 shadow-[0_18px_45px_-34px_rgba(0,0,0,0.45)] ring-1 ring-black/[0.02] sm:min-h-[238px] sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 opacity-55 sm:inset-y-0 sm:left-auto sm:h-auto sm:w-[46%] sm:opacity-100">
        <img
          src={EVENT_CARD_IMAGE}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover object-[62%_18%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,#ffffff_0%,rgba(255,255,255,0.72)_48%,rgba(255,255,255,0)_100%)] sm:bg-[linear-gradient(90deg,#ffffff_0%,rgba(255,255,255,0.94)_18%,rgba(255,255,255,0.58)_48%,rgba(255,255,255,0.08)_100%)]" />
      </div>
      <div className="relative z-10 sm:max-w-[62%]">
        <h3 className="text-2xl font-semibold" style={{ ...serif, color: PURPLE_D }}>
          {event.name}
        </h3>
        <dl className="mt-4 space-y-2.5 text-sm text-[#1A1A1A]/80">
          <div className="flex items-center gap-3">
            <dt className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F6EEFB] text-[#6B3FA0]">
              <PartyPopper className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Event type</span>
            </dt>
            <dd className="font-medium text-[#1A1A1A]/75">{eventTypeLabel(event.event_type)}</dd>
          </div>
          {date ? (
            <div className="flex items-center gap-3">
              <dt className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F6EEFB] text-[#6B3FA0]">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t.when}</span>
              </dt>
              <dd className="font-medium text-[#1A1A1A]/75">{date}</dd>
            </div>
          ) : null}
          {time ? (
            <div className="flex items-center gap-3">
              <dt className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F6EEFB] text-[#6B3FA0]">
                <Clock className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t.when}</span>
              </dt>
              <dd className="font-medium text-[#1A1A1A]/75">{time}</dd>
            </div>
          ) : null}
          {venue ? (
            <div className="flex items-start gap-3">
              <dt className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F6EEFB] text-[#6B3FA0]">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t.where}</span>
              </dt>
              <dd className="font-medium text-[#1A1A1A]/75">{venue}</dd>
            </div>
          ) : null}
          {event.dress_code ? (
            <div className="flex items-center gap-3">
              <dt className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F6EEFB] text-[#6B3FA0]">
                <Shirt className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">{t.dress}</span>
              </dt>
              <dd className="font-medium text-[#1A1A1A]/75">{event.dress_code}</dd>
            </div>
          ) : null}
        </dl>
        {event.description ? (
          <p className="mt-3 text-sm leading-relaxed text-[#1A1A1A]/70">{event.description}</p>
        ) : null}
      </div>
    </div>
  )
}

interface PublicQuestionAnswer {
  text: string
  optionId: string
  detailText: string
}

const EMPTY_PUBLIC_QA: PublicQuestionAnswer = { text: '', optionId: '', detailText: '' }

function selectedOption(q: RsvpQuestion, optionId: string) {
  return q.options.find((o) => o.id === optionId) ?? null
}

function optionDetailPrompt(q: RsvpQuestion, optionId: string): string {
  return selectedOption(q, optionId)?.description?.trim() ?? ''
}

function multipleChoiceAnswerText(q: RsvpQuestion, a: PublicQuestionAnswer): string | null {
  const label = selectedOption(q, a.optionId)?.label ?? null
  if (!label) return null
  const detail = optionDetailPrompt(q, a.optionId) ? a.detailText.trim() : ''
  return detail ? `${label}: ${detail}` : label
}

function RsvpForm({ slug, questions, t }: { slug: string; questions: RsvpQuestion[]; t: Record<string, string> }) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [status, setStatus] = useState<RsvpStatus>('attending')
  const [partySize, setPartySize] = useState(1)
  const [message, setMessage] = useState('')
  const [qa, setQa] = useState<Record<string, PublicQuestionAnswer>>({})
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  const statusOptions: { value: RsvpStatus; label: string }[] = [
    { value: 'attending', label: t.yes },
    { value: 'maybe', label: t.maybe },
    { value: 'declined', label: t.no },
  ]

  function setAnswer(questionId: string, patch: Partial<PublicQuestionAnswer>) {
    setQa((prev) => ({
      ...prev,
      [questionId]: {
        ...EMPTY_PUBLIC_QA,
        ...prev[questionId],
        ...patch,
      },
    }))
  }

  if (done) {
    return (
      <div className="text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#9FE870]/30">
          <CheckCircle2 className="h-8 w-8 text-[#3f6b1f]" />
        </span>
        <h3 className="mt-5 text-3xl font-semibold sm:text-4xl" style={{ ...serif, color: INK }}>
          {t.done_title}
        </h3>
        <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[#1A1A1A]/60">{t.done_body}</p>
      </div>
    )
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    // Validate + collect answers to this event's questions.
    const answers: { questionId: string; answer_text?: string | null; option_id?: string | null }[] = []
    for (const q of questions) {
      const a = qa[q.id]
      const answered = q.kind === 'multiple_choice' ? Boolean(a?.optionId) : Boolean(a?.text.trim())
      if (q.required && !answered) {
        setError(`${t.answer_prefix}${q.prompt}`)
        return
      }
      const detailPrompt = a ? optionDetailPrompt(q, a.optionId) : ''
      if (detailPrompt && !a?.detailText.trim()) {
        setError(`${t.answer_prefix}${detailPrompt}`)
        return
      }
      if (answered) {
        answers.push({
          questionId: q.id,
          answer_text: q.kind === 'multiple_choice' ? multipleChoiceAnswerText(q, a!) : a!.text,
          option_id: q.kind === 'multiple_choice' ? a!.optionId : null,
        })
      }
    }

    startTransition(async () => {
      const res = await submitPublicInviteRsvp(slug, {
        fullName,
        phone,
        status,
        partySize,
        message,
        answers,
      })
      if (res.ok) setDone(true)
      else setError(res.error ?? t.error_generic)
    })
  }

  const field =
    'mt-1 w-full rounded-xl border border-black/[0.12] bg-white px-4 py-3 text-base text-[#1A1A1A] placeholder:text-[#1A1A1A]/30 outline-none transition-colors focus:border-[#C9A0DC] focus:ring-2 focus:ring-[#C9A0DC]/25'

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium" style={{ color: INK }}>
          {t.name}
        </label>
        <input
          className={field}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoComplete="name"
          placeholder={t.name_ph}
        />
      </div>
      <div>
        <label className="text-sm font-medium" style={{ color: INK }}>
          {t.phone}
        </label>
        <input
          className={field}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="0712 345 678"
        />
      </div>

      <div>
        <span className="text-sm font-medium" style={{ color: INK }}>
          {t.attend}
        </span>
        <div className="mt-2 grid gap-2">
          {statusOptions.map((opt) => {
            const active = status === opt.value
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => setStatus(opt.value)}
                className={`rounded-xl border px-4 py-3 text-left text-[15px] transition ${
                  active
                    ? 'border-[#C9A0DC] bg-[#F6EEFB] font-semibold text-[#1A1A1A]'
                    : 'border-black/[0.12] bg-white text-[#1A1A1A] hover:border-[#C9A0DC]'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {status === 'attending' ? (
        <div>
          <label className="text-sm font-medium" style={{ color: INK }}>
            {t.party}
          </label>
          <input
            type="number"
            min={1}
            max={MAX_SELF_SERVICE_PARTY}
            className={field}
            value={partySize}
            onChange={(e) => setPartySize(Math.max(1, Math.min(MAX_SELF_SERVICE_PARTY, Number(e.target.value) || 1)))}
          />
        </div>
      ) : null}

      <div>
        <label className="text-sm font-medium" style={{ color: INK }}>
          {t.message}
        </label>
        <textarea
          className={field}
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t.message_ph}
        />
      </div>

      {questions.map((q) => {
        const a = qa[q.id] ?? EMPTY_PUBLIC_QA
        return (
          <div key={q.id}>
            <label className="text-sm font-medium" style={{ color: INK }}>
              {q.prompt}
              {q.required ? <span className="ml-0.5 text-red-500">*</span> : <span className="ml-1 font-normal text-[#1A1A1A]/40">{t.optional}</span>}
            </label>
            {q.description ? <p className="mt-0.5 text-xs text-[#1A1A1A]/55">{q.description}</p> : null}
            {q.kind === 'multiple_choice' ? (
              <div className="mt-2 grid gap-2">
                {q.options.map((opt) => {
                  const active = a.optionId === opt.id
                  const detailPrompt = opt.description?.trim()
                  return (
                    <div key={opt.id} className="grid gap-2">
                      <button
                        type="button"
                        onClick={() => setAnswer(q.id, { optionId: opt.id, detailText: active ? a.detailText : '' })}
                        className={`rounded-xl border px-4 py-3 text-left text-[15px] transition ${
                          active
                            ? 'border-[#C9A0DC] bg-[#F6EEFB] font-semibold text-[#1A1A1A]'
                            : 'border-black/[0.12] bg-white text-[#1A1A1A] hover:border-[#C9A0DC]'
                        }`}
                      >
                        {opt.label}
                      </button>
                      {active && detailPrompt ? (
                        <label className="block rounded-xl border border-[#C9A0DC]/45 bg-[#F6EEFB]/40 p-3">
                          <span className="mb-1.5 block text-xs font-semibold text-[#5d3a78]">{detailPrompt}</span>
                          <textarea
                            className={field}
                            rows={2}
                            value={a.detailText}
                            onChange={(e) => setAnswer(q.id, { detailText: e.target.value })}
                          />
                        </label>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <textarea
                className={field}
                rows={2}
                value={a.text}
                onChange={(e) => setAnswer(q.id, { text: e.target.value })}
              />
            )}
          </div>
        )
      })}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#C9A0DC] px-6 py-3.5 text-[15px] font-bold text-[#1A1A1A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.5)] transition hover:brightness-95 disabled:opacity-50"
      >
        <Send className="h-4 w-4" />
        {pending ? t.sending : t.send}
      </button>
    </form>
  )
}

export default function PublicInviteClient({ data }: { data: PublicInviteData }) {
  const dateStr = dotDate(data.weddingDate)
  const [lang, setLang] = useState<Lang>('sw')
  const t = STR[lang]
  const hasCover = Boolean(data.coverImageUrl)
  const isVideo = hasCover && isVideoCoverUrl(data.coverImageUrl!)
  const isFullTemplate = hasCover && data.coverIsFullTemplate
  const coverStyle: React.CSSProperties = hasCover
    ? isVideo
      ? { backgroundColor: '#000' }
      : {
          backgroundImage: `linear-gradient(rgba(20,12,28,0.42),rgba(20,12,28,0.55)), url("${data.coverImageUrl}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
    : { backgroundImage: 'linear-gradient(135deg,#F4EEE2,#EAE1D2,#DBCDB5)', backgroundColor: '#EAE1D2' }

  // Remember the guest's language across visits.
  useEffect(() => {
    const saved = window.localStorage.getItem(LANG_KEY)
    if (saved === 'en' || saved === 'sw') setLang(saved)
  }, [])
  function pickLang(next: Lang) {
    setLang(next)
    window.localStorage.setItem(LANG_KEY, next)
  }

  return (
    <div className="min-h-screen bg-white text-[#1A1A1A] lg:grid lg:grid-cols-2">
      <Logo className="fixed left-4 top-4 z-10 drop-shadow-sm sm:left-6 sm:top-6" />
      <div className="fixed right-4 top-4 z-10 inline-flex rounded-full border border-gray-200 bg-white p-0.5 text-xs font-semibold shadow-sm sm:right-6 sm:top-6">
        {(['en', 'sw'] as Lang[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => pickLang(l)}
            className={`rounded-full px-2.5 py-1 uppercase transition-colors ${
              lang === l ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'
            }`}
            aria-pressed={lang === l}
          >
            {l}
          </button>
        ))}
      </div>

      {isFullTemplate ? (
        <aside className="flex items-center justify-center overflow-y-auto bg-gradient-to-br from-[#F1F4EB] to-[#EDF0E7] px-5 pb-8 pt-24 sm:px-10 sm:py-14 lg:sticky lg:top-0 lg:h-screen lg:min-h-0 lg:px-16 lg:py-16">
          {isVideo ? (
            <video
              src={data.coverImageUrl!}
              className="max-h-[65vh] w-auto max-w-full rounded-2xl bg-[#E5E3DE] object-contain shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] sm:max-h-[75vh] lg:max-h-[calc(100vh-8rem)]"
              muted
              loop
              autoPlay
              playsInline
              controls
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.coverImageUrl!}
              alt={`${data.coupleName} invitation`}
              className="max-h-[65vh] w-auto max-w-full rounded-2xl object-contain shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] sm:max-h-[75vh] lg:max-h-[calc(100vh-8rem)]"
            />
          )}
        </aside>
      ) : (
        <aside
          className="relative flex min-h-[360px] flex-col justify-center overflow-hidden px-8 py-14 text-white sm:min-h-[420px] lg:sticky lg:top-0 lg:h-screen lg:px-14"
          style={coverStyle}
        >
          {isVideo ? (
            <>
              <video
                src={data.coverImageUrl!}
                className="absolute inset-0 h-full w-full object-cover"
                muted
                loop
                autoPlay
                playsInline
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(20,12,28,0.42),rgba(20,12,28,0.55))]" />
            </>
          ) : null}
          {!hasCover ? (
            <>
              <Sprig className="pointer-events-none absolute -left-5 -top-8 w-32 opacity-90 sm:w-44" />
              <Sprig className="pointer-events-none absolute -bottom-10 -right-5 w-32 rotate-180 opacity-90 sm:w-44" />
            </>
          ) : null}

          <div className="relative text-center">
            <p className="font-serif text-[11px] uppercase tracking-[0.3em] opacity-80 sm:text-xs">
              {t.eyebrow}
            </p>
            <h1 className="mx-auto mt-6 max-w-xl font-serif text-4xl uppercase leading-none tracking-[0.06em] sm:text-5xl">
              {data.coupleName}
            </h1>
            <div className="mx-auto mt-7 flex items-center justify-center gap-2.5">
              <span className="h-px w-12 bg-white/60" />
              <span className="h-1.5 w-1.5 rotate-45 bg-white/80" />
              <span className="h-px w-12 bg-white/60" />
            </div>
            {dateStr ? <p className="mt-5 font-serif text-2xl tracking-[0.12em] sm:text-[26px]">{dateStr}</p> : null}
            {data.city ? <p className="mt-2 text-[11px] uppercase tracking-[0.25em] opacity-75">{data.city}</p> : null}
          </div>
        </aside>
      )}

      <main className="flex justify-center px-5 py-8 sm:px-8 sm:py-10 lg:min-h-screen lg:px-14 lg:py-16">
        <div className="w-full max-w-lg">
          <h2 className="text-center leading-tight text-[#1A1A1A]">
            <span
              className="block text-[2rem] leading-none sm:text-4xl lg:text-5xl"
              style={{ fontFamily: 'var(--font-dancing), cursive' }}
            >
              {data.coupleName}
            </span>
            <div className="mx-auto mt-3 flex items-center justify-center gap-2.5" aria-hidden>
              <span className="h-px w-8 bg-[#C9A0DC]/60" />
              <Heart className="h-3 w-3 shrink-0 text-[#C9A0DC]" fill="currentColor" strokeWidth={0} />
              <span className="h-px w-8 bg-[#C9A0DC]/60" />
            </div>
            <span className="mt-3 block font-serif text-2xl text-[#1A1A1A]/80 sm:text-[26px]">
              {t.rsvp_title}
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-sm text-center text-[15px] leading-relaxed text-[#1A1A1A]/55">
            {t.rsvp_sub}
          </p>

          <div className="mt-8">
            <EventCard event={data.event} t={t} />
          </div>

          <section className="mt-8">
            {data.hasPassed ? (
              <div className="text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#9FE870]/30">
                  <CheckCircle2 className="h-8 w-8 text-[#3f6b1f]" />
                </span>
                <h3 className="mt-5 text-3xl font-semibold sm:text-4xl" style={{ ...serif, color: INK }}>
                  {t.passed_title}
                </h3>
                <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[#1A1A1A]/60">{t.passed_body}</p>
              </div>
            ) : data.allowRsvp ? (
              <RsvpForm slug={data.slug} questions={data.generalQuestions} t={t} />
            ) : (
              <div className="text-center">
                <h3 className="text-3xl font-semibold sm:text-4xl" style={{ ...serif, color: INK }}>
                  {t.personal_title}
                </h3>
                <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[#1A1A1A]/60">{t.personal_body}</p>
              </div>
            )}
          </section>

          <footer className="mt-8 flex flex-col items-center gap-2 text-center">
            <PoweredByLine
              text={t.powered}
              iconClassName="h-3 w-3"
              className="text-[11px] uppercase tracking-[0.2em] text-[#1A1A1A]/45"
            />
          </footer>
        </div>
      </main>
    </div>
  )
}

function Sprig({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 240" className={className} fill="currentColor" aria-hidden="true">
      <path
        d="M72 238 C66 180 64 110 76 28"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <ellipse cx="50" cy="66" rx="19" ry="8" transform="rotate(-38 50 66)" opacity="0.85" />
      <ellipse cx="92" cy="88" rx="19" ry="8" transform="rotate(38 92 88)" opacity="0.85" />
      <ellipse cx="48" cy="114" rx="22" ry="9" transform="rotate(-32 48 114)" opacity="0.85" />
      <ellipse cx="94" cy="138" rx="22" ry="9" transform="rotate(34 94 138)" opacity="0.85" />
      <ellipse cx="52" cy="168" rx="18" ry="8" transform="rotate(-30 52 168)" opacity="0.85" />
      <ellipse cx="90" cy="192" rx="18" ry="8" transform="rotate(32 90 192)" opacity="0.85" />
      <circle cx="76" cy="20" r="11" fill="#ffffff" opacity="0.95" />
      <circle cx="76" cy="20" r="3.5" fill="#E8C26A" />
    </svg>
  )
}
