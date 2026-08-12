'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Send, CheckCircle2, Heart } from 'lucide-react'
import { submitPublicPledge } from './actions'
import { firstNameOf } from '@/lib/dashboard/share'
import { useT } from '@/components/providers/UIStringsProvider'
import { LocaleToggle } from '@/components/LocaleToggle'
import Logo from '@/components/ui/Logo'
import type { Locale } from '@/lib/cms/localized'
import {
  resolvePledgePage,
  COVER_TONES,
  accentInk,
  isVideoCoverUrl,
  type PledgePageConfig,
} from '@/lib/dashboard/pledge-page'

interface Props {
  token: string
  /** Event carried on the share link (?event=), verified server-side. */
  eventId?: string | null
  coupleName: string
  weddingDate: string | null
  city: string | null
  config: PledgePageConfig
  /** Guest's chosen language (from the opuspass_locale cookie) — picks which
   *  built-in default copy to fall back to when the couple hasn't customized
   *  their pledge page text. */
  locale: Locale
}

/** Wedding date as DD.MM.YYYY, the elegant "save the date" format. */
function dotDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

// 16px minimum on the inputs — anything smaller makes iOS Safari auto-zoom
// the whole page on focus, which is jarring on a form this long.
const fieldClass =
  'block w-full rounded-xl border border-black/[0.12] bg-white px-4 py-3 text-base text-[#1A1A1A] placeholder:text-[#1A1A1A]/30 transition focus:border-[#C9A0DC] focus:outline-none focus:ring-2 focus:ring-[#C9A0DC]/25'

export default function PledgeForm({
  token,
  eventId,
  coupleName,
  weddingDate,
  city,
  config,
  locale,
}: Props) {
  const t = useT('forms-pledge')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [amount, setAmount] = useState('')
  const [ticketType, setTicketType] = useState<1 | 2>(1)
  const [promisedDate, setPromisedDate] = useState('')
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  const cfg = resolvePledgePage(config, locale)
  const tone = COVER_TONES[cfg.coverTone]
  const hasCover = Boolean(cfg.coverImageUrl)
  // A pledge card template already has the couple's names/date designed
  // into the image itself — overlaying our own dynamic text on top of it
  // (as we do for a plain uploaded photo) would duplicate/collide with it.
  const isFullTemplate = hasCover && cfg.coverIsFullTemplate
  const isVideo = hasCover && isVideoCoverUrl(cfg.coverImageUrl!)
  const onAccent = accentInk(cfg.accent)

  const dateStr = dotDate(weddingDate)
  const parts = coupleName
    .split(/\s*(?:&|and|\bna\b|\+)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean)
  // First names only for the privacy note ("Jonathan & Jenifer"), not full names.
  const firstNameParts = parts.map((p) => firstNameOf(p))
  const shortCoupleName = firstNameParts.length >= 2 ? `${firstNameParts[0]} & ${firstNameParts[1]}` : coupleName

  // Cover colors flip to light when a photo backs the panel.
  const ink = hasCover ? '#FFFFFF' : tone.ink
  const soft = hasCover ? 'rgba(255,255,255,0.82)' : tone.soft
  const rule = hasCover ? 'rgba(255,255,255,0.6)' : tone.rule
  const leaf = hasCover ? 'rgba(255,255,255,0.7)' : tone.leaf
  const coverStyle: React.CSSProperties = hasCover
    ? isVideo
      ? { backgroundColor: '#000' } // the <video> element paints the visual; this is just the load-in fallback
      : {
          backgroundImage: `linear-gradient(rgba(20,12,28,0.42),rgba(20,12,28,0.55)), url("${cfg.coverImageUrl}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
    : { backgroundImage: tone.gradient, backgroundColor: tone.base }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error(t('error_name'))
      return
    }
    if (!(Number(amount) > 0)) {
      toast.error(t('error_amount'))
      return
    }
    startTransition(async () => {
      try {
        await submitPublicPledge(token, {
          full_name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          amount: Number(amount),
          max_party_size: ticketType,
          promised_date: promisedDate || null,
          message: message.trim() || null,
          event_id: eventId ?? null,
        })
        setDone(true)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('error_submit'))
      }
    })
  }

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-2">
      <Logo className="fixed left-4 top-4 z-10 drop-shadow-sm sm:left-6 sm:top-6" />
      <LocaleToggle className="fixed right-4 top-4 z-10 shadow-sm sm:right-6 sm:top-6" />

      {/* ── Cover: the applied pledge card template, uncropped and scrollable
          on its own so a tall design is never cut off; falls back to the
          decorative "save the date" panel with dynamic text when there's no
          full template. ── */}
      {isFullTemplate ? (
        <aside className="flex items-center justify-center overflow-y-auto bg-gradient-to-br from-[#F1F4EB] to-[#EDF0E7] px-5 pb-8 pt-24 sm:px-10 sm:py-14 lg:sticky lg:top-0 lg:h-screen lg:min-h-0 lg:px-16 lg:py-16">
          {isVideo ? (
            <video
              src={cfg.coverImageUrl!}
              className="max-h-[65vh] w-auto max-w-full rounded-2xl bg-[#E5E3DE] object-contain shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] sm:max-h-[75vh] lg:max-h-[calc(100vh-8rem)]"
              muted
              loop
              autoPlay
              playsInline
              controls
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={cfg.coverImageUrl!}
              alt={coupleName}
              className="max-h-[65vh] w-auto max-w-full rounded-2xl object-contain shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] sm:max-h-[75vh] lg:max-h-[calc(100vh-8rem)]"
            />
          )}
        </aside>
      ) : (
        <aside
          className="relative flex min-h-[360px] flex-col justify-center overflow-hidden px-8 py-14 sm:min-h-[420px] lg:sticky lg:top-0 lg:h-screen lg:px-14"
          style={{ ...coverStyle, color: ink }}
        >
          {isVideo ? (
            <>
              <video
                src={cfg.coverImageUrl!}
                className="absolute inset-0 h-full w-full object-cover"
                muted
                loop
                autoPlay
                playsInline
              />
              {/* Uniform dark tint, matching the photo backdrop's darkened background-image */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: 'linear-gradient(rgba(20,12,28,0.42),rgba(20,12,28,0.55))' }}
              />
            </>
          ) : null}
          {!hasCover ? (
            <>
              <Sprig className="pointer-events-none absolute -left-5 -top-8 w-32 opacity-90 sm:w-44" style={{ color: leaf }} />
              <Sprig
                className="pointer-events-none absolute -bottom-10 -right-5 w-32 rotate-180 opacity-90 sm:w-44"
                style={{ color: leaf }}
              />
            </>
          ) : null}

          <div className="relative text-center">
            <p className="font-serif text-[11px] uppercase tracking-[0.3em] sm:text-xs" style={{ color: soft }}>
              {cfg.eyebrow}
            </p>

            <div className="mt-6 space-y-2.5">
              {parts.length >= 2 ? (
                <>
                  <p className="font-serif text-4xl uppercase leading-none tracking-[0.1em] sm:text-5xl">
                    {parts[0]}
                  </p>
                  <p className="font-serif text-sm uppercase tracking-[0.3em]" style={{ color: soft }}>
                    {locale === 'sw' ? 'na' : 'and'}
                  </p>
                  <p className="font-serif text-4xl uppercase leading-none tracking-[0.1em] sm:text-5xl">
                    {parts[1]}
                  </p>
                </>
              ) : (
                <p className="font-serif text-4xl uppercase leading-tight tracking-[0.08em] sm:text-5xl">
                  {coupleName}
                </p>
              )}
            </div>

            <div className="mx-auto mt-7 flex items-center justify-center gap-2.5">
              <span className="h-px w-12" style={{ backgroundColor: rule, opacity: 0.6 }} />
              <span className="h-1.5 w-1.5 rotate-45" style={{ backgroundColor: rule }} />
              <span className="h-px w-12" style={{ backgroundColor: rule, opacity: 0.6 }} />
            </div>

            {dateStr ? (
              <p className="mt-5 font-serif text-2xl tracking-[0.12em] sm:text-[26px]">{dateStr}</p>
            ) : null}
            {city ? (
              <p className="mt-2 text-[11px] uppercase tracking-[0.25em]" style={{ color: soft }}>
                {city}
              </p>
            ) : null}
          </div>
        </aside>
      )}

      {/* ── Form ── */}
      <main
        className={`flex justify-center px-5 py-8 sm:px-8 sm:py-10 lg:px-14 lg:py-16 ${
          done ? 'lg:min-h-screen lg:items-center' : ''
        }`}
      >
        <div className="w-full max-w-lg">
          {done ? (
            <div className="text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#9FE870]/30">
                <CheckCircle2 className="h-8 w-8 text-[#3f6b1f]" />
              </span>
              <h2 className="mt-5 font-serif text-3xl text-[#1A1A1A] sm:text-4xl">{t('success_heading')}</h2>
              <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[#1A1A1A]/60">
                {t('success_body', { coupleName })}
              </p>

              <dl className="mx-auto mt-6 max-w-sm space-y-2.5 rounded-2xl border border-black/[0.08] bg-black/[0.02] p-4 text-left text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[#1A1A1A]/50">{t('label_amount')}</dt>
                  <dd className="font-semibold text-[#1A1A1A]">
                    {t('amount_currency')} {Number(amount || 0).toLocaleString('en-US')}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[#1A1A1A]/50">{t('label_ticket_type')}</dt>
                  <dd className="font-semibold text-[#1A1A1A]">
                    {ticketType === 2 ? t('ticket_double') : t('ticket_single')}
                  </dd>
                </div>
                {promisedDate ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[#1A1A1A]/50">{t('label_promised_date')}</dt>
                    <dd className="font-semibold text-[#1A1A1A]">{dotDate(promisedDate)}</dd>
                  </div>
                ) : null}
              </dl>

              <button data-opus-button="control"
                type="button"
                onClick={() => {
                  setName('')
                  setPhone('')
                  setEmail('')
                  setAmount('')
                  setTicketType(1)
                  setPromisedDate('')
                  setMessage('')
                  setDone(false)
                }}
                className="mt-7 text-sm font-semibold text-[#1A1A1A]/50 underline-offset-4 hover:text-[#1A1A1A] hover:underline"
              >
                {t('send_another')}
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-center leading-tight text-[#1A1A1A]">
                <span
                  className="block text-[2rem] leading-none sm:text-4xl lg:text-5xl"
                  style={{ fontFamily: 'var(--font-dancing), cursive' }}
                >
                  {coupleName}
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
              <p className="mx-auto mt-4 max-w-sm text-center text-[15px] leading-relaxed text-[#1A1A1A]/55">
                {cfg.intro}
              </p>

              <form onSubmit={submit} className="mt-8 space-y-5">
                <Field label={t('label_name')} required accent={cfg.accent}>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('placeholder_name')}
                    className={fieldClass}
                  />
                </Field>

                <Field label={t('label_amount')} required accent={cfg.accent}>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#1A1A1A]/35">
                      {t('amount_currency')}
                    </span>
                    <input
                      required
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={t('placeholder_amount')}
                      className={`${fieldClass} pl-[3.25rem]`}
                    />
                  </div>
                </Field>

                <Field label={t('label_promised_date')}>
                  <input
                    type="date"
                    value={promisedDate}
                    onChange={(e) => setPromisedDate(e.target.value)}
                    className={fieldClass}
                  />
                </Field>

                <Field label={t('label_ticket_type')} required accent={cfg.accent}>
                  <div className="grid grid-cols-2 gap-2">
                    {([1, 2] as const).map((value) => {
                      const active = ticketType === value
                      const label = value === 2 ? t('ticket_double') : t('ticket_single')
                      return (
                        <button data-opus-button="control"
                          key={value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setTicketType(value)}
                          style={
                            active
                              ? { borderColor: cfg.accent, backgroundColor: `${cfg.accent}22`, color: '#1A1A1A' }
                              : undefined
                          }
                          className="rounded-xl border border-black/[0.12] bg-white px-4 py-3 text-center text-base font-semibold text-[#1A1A1A]/70 transition hover:border-black/25 hover:text-[#1A1A1A]"
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
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

                <Field label={t('label_message')}>
                  <textarea
                    rows={2}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t('placeholder_message')}
                    className={fieldClass}
                  />
                </Field>

                <button data-opus-button="primary" data-opus-button-size="large"
                  type="submit"
                  disabled={pending}
                  style={{ backgroundColor: cfg.accent, color: onAccent }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-bold shadow-[0_10px_24px_-12px_rgba(0,0,0,0.5)] transition hover:brightness-95 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {pending ? t('send_pending') : cfg.buttonLabel}
                </button>

                <p className="text-center text-[11px] leading-relaxed text-[#1A1A1A]/45">
                  {cfg.privacyNote.replace(/\{couple\}/g, shortCoupleName)}
                </p>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

/** A simple botanical sprig — leaves + a blossom — drawn inline. */
function Sprig({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 140 240" className={className} style={style} fill="currentColor" aria-hidden="true">
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
        {required ? (
          <span style={{ color: accent ?? '#b97fd0' }}> *</span>
        ) : null}
      </span>
      {children}
    </label>
  )
}
