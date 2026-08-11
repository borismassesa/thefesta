'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  MessageCircle,
  Smartphone,
  Pencil,
  Ticket,
  X,
} from 'lucide-react'
import { previewGuestSend, prepareInviteGuestPreview } from '@/lib/dashboard/actions'
import type { SendPreview, WhatsAppSendSummary } from '@/lib/dashboard/actions'
import type { SendGuestRow } from '@/lib/dashboard/queries'
import type { DashboardSendStrings } from '@/lib/cms/ui-strings-fallback'

/**
 * One readiness gate shown above the send button.
 *
 * `blocking` is what actually disables the send. A non-blocking check still
 * renders (dry-run mode is worth stating) but never stops the couple.
 */
export interface ReviewCheck {
  key: string
  label: string
  ok: boolean
  blocking: boolean
  /** What to do about it, when it fails. Never leave a failure as a bare ✕. */
  fix?: { label: string; href?: string; onClick?: () => void }
}

/**
 * The exact approved template this send will use. Built by the caller from the
 * INVITE_TEMPLATE / ENTRANCE_PASS_TEMPLATE constants and the same interpolation
 * helpers the real send calls, so this drawer never composes message text of
 * its own and can never drift from what Meta delivers.
 */
export interface ReviewMessage {
  body: string
  footer: string
  buttons: readonly string[]
}

type Props = {
  /** Which delivery moment this is. They are separate messages, separate
   *  templates and separate sends — never merged into one review. */
  mode: 'invite' | 'pass'
  /**
   * Which pipe this send uses.
   *
   * 'sms' is not a lesser WhatsApp: it carries no image and no template, so the
   * drawer shows the plain text the guest will actually read rather than a card
   * and quick-reply buttons they will never see. Nothing is sent by us on this
   * channel — the couple's own handset sends it — so the footer offers copy and
   * compose rather than a Send that would be a lie.
   */
  channel: 'whatsapp' | 'sms'
  guest: SendGuestRow
  eventId: string
  /** Display number the message goes to. */
  phone: string
  /** "Single" / "Double", when the event sells both. */
  partyLabel: string | null
  message: ReviewMessage
  /**
   * `prepare` renders this guest's personalized card through the same
   * preparation the send uses. `static` is the guest's own already-addressable
   * asset (their entrance pass, with their real QR).
   */
  artwork: { kind: 'prepare' } | { kind: 'static'; url: string }
  checks: ReviewCheck[]
  /** e.g. "1 invitation credit will be used". Null when the send is free. */
  creditNote: string | null
  /** No live Meta credentials: the send is stubbed and nothing reaches a guest. */
  dryRun: boolean
  /**
   * The same invitation as plain SMS text, for guests WhatsApp will not carry.
   * Null when the card has no details to compose from.
   *
   * Shown as a fallback the couple copies and sends from their own phone. That
   * is the point rather than a limitation: a person-to-person SMS is not a
   * business template, so the pacing that blocked WhatsApp does not apply.
   */
  smsFallback: string | null
  /** True when WhatsApp has already refused this guest — the fallback opens
   *  expanded, because for them it is the only route left. */
  deliveryFailed?: boolean
  strings: DashboardSendStrings
  /** The EXISTING production send path. This drawer only decides when it runs;
   *  it never builds a payload of its own. */
  onSend: () => Promise<WhatsAppSendSummary>
  onEditGuest: () => void
  /** Open the handset's SMS composer, pre-filled. SMS only. */
  onOpenSms?: () => void
  onTopUp?: () => void
  onSent: () => void
  onClose: () => void
}

/** Substitute `{var}` placeholders in a CMS template with runtime values. */
const fmt = (t: string, v: Record<string, string | number>) =>
  t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m))

/** Render WhatsApp-flavoured text: *bold* spans and newlines. */
function waText(text: string) {
  return text.split('\n').map((line, i) => (
    <Fragment key={i}>
      {i > 0 ? <br /> : null}
      {line.split(/(\*[^*]+\*)/g).map((part, j) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
          <b key={j}>{part.slice(1, -1)}</b>
        ) : (
          <Fragment key={j}>{part}</Fragment>
        ),
      )}
    </Fragment>
  ))
}

export default function ReviewSendDrawer({
  mode,
  channel,
  guest,
  eventId,
  phone,
  partyLabel,
  message,
  artwork,
  checks,
  smsFallback,
  deliveryFailed = false,
  creditNote,
  dryRun,
  strings,
  onSend,
  onEditGuest,
  onOpenSms,
  onTopUp,
  onSent,
  onClose,
}: Props) {
  const [cardUrl, setCardUrl] = useState<string | null>(artwork.kind === 'static' ? artwork.url : null)
  const [cardError, setCardError] = useState<string | null>(null)
  const [cardLoading, setCardLoading] = useState(artwork.kind === 'prepare')
  const [gate, setGate] = useState<SendPreview | null>(null)
  const [smsCopied, setSmsCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sentAt, setSentAt] = useState<string | null>(null)
  const [sendError, setSendError] = useState<{ message: string; canTopUp: boolean } | null>(null)
  // A ref, not the state above: two clicks in the same tick both read the
  // pre-render value of state, and the damage here is a duplicate WhatsApp
  // message to a real guest.
  const sendBusyRef = useRef(false)

  const artworkKind = artwork.kind

  // Always a fresh render on open, keyed to this guest — a card prepared for
  // whoever the drawer showed last must never be what the couple approves.
  // A `static` asset (the guest's own entrance pass) is already addressable
  // and was seeded into state above, so there is nothing to prepare.
  useEffect(() => {
    if (artworkKind === 'static') return
    let cancelled = false
    void (async () => {
      // Yield once so the drawer paints before the preparation round trip.
      await Promise.resolve()
      if (cancelled) return
      setCardLoading(true)
      setCardUrl(null)
      setCardError(null)
      try {
        const result = await prepareInviteGuestPreview(guest.id, eventId)
        if (cancelled) return
        if (result.ok) setCardUrl(result.imageUrl)
        else setCardError(result.error)
      } catch (error: unknown) {
        if (!cancelled) setCardError(error instanceof Error ? error.message : strings.test_failed)
      } finally {
        if (!cancelled) setCardLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [artworkKind, guest.id, eventId, strings.test_failed])

  // The server's own view of whether this guest is sendable — the same
  // assessment the send itself runs, so the drawer cannot promise an outcome
  // the send won't honour (a shared handset above all).
  useEffect(() => {
    if (mode !== 'invite') return
    let cancelled = false
    void (async () => {
      try {
        const result = await previewGuestSend([guest.id])
        if (!cancelled) setGate(result)
      } catch {
        // Non-fatal: the send itself re-runs this gate and is authoritative.
      }
    })()
    return () => { cancelled = true }
  }, [mode, guest.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const serverSkip = gate?.skipped.find((s) => s.guestId === guest.id) ?? null
  const sharedNumber = (gate?.repeatedRecipients ?? []).find((r) =>
    r.guests.length > 1 && r.guests.some((n) => n === guest.name),
  )
  // The caller can only tell us a released card EXISTS for this event. Whether
  // THIS guest's personalised card actually rendered is known only here, after
  // the prepare call — and that is the fact that matters, because the prepared
  // asset IS the header image the guest receives. Approving a send while the
  // artwork frame shows an error is precisely what this drawer exists to stop,
  // so a failed prepare fails the card check and names the reason.
  const artworkFailed = artwork.kind === 'prepare' && !cardLoading && !cardUrl
  // The row carries the render error as its label, because "Invitation card
  // released" struck through would be actively misleading: the card IS
  // released, it is this guest's copy that would not render. The caller's fix
  // link is dropped for the same reason — pointing at My Cards does nothing
  // about a token or render fault, and a wrong instruction is worse than none.
  const effectiveChecks = artworkFailed
    ? checks.map((c) =>
        c.key === 'card' ? { ...c, ok: false, label: cardError ?? c.label, fix: undefined } : c,
      )
    : checks
  const blockingFailures = effectiveChecks.filter((c) => c.blocking && !c.ok)
  // `artworkFailed` is also tested directly: a caller that ships prepare-artwork
  // without a 'card' check would otherwise slip past the mapping above.
  const canSend =
    blockingFailures.length === 0 && !artworkFailed && !serverSkip && !cardLoading && !sending && !sentAt

  async function runSend() {
    if (sendBusyRef.current || !canSend) return
    sendBusyRef.current = true
    setSending(true)
    setSendError(null)
    try {
      const summary = await onSend()
      if (summary.sent > 0) {
        setSentAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
        onSent()
        return
      }
      // Nothing went out. Say which of the real outcomes it was rather than
      // collapsing them into one generic failure.
      if (summary.blocked > 0) {
        setSendError({ message: strings.review_error_quota, canTopUp: true })
      } else if (summary.skipped > 0) {
        setSendError({ message: summary.results[0]?.reason ?? strings.review_error_skipped, canTopUp: false })
      } else if (!summary.hasPaidOrder) {
        setSendError({ message: strings.toast_no_package, canTopUp: false })
      } else {
        setSendError({ message: summary.results[0]?.error ?? strings.review_error_failed, canTopUp: false })
      }
    } catch (err) {
      setSendError({
        message: err instanceof Error ? err.message : strings.review_error_failed,
        canTopUp: false,
      })
    } finally {
      sendBusyRef.current = false
      setSending(false)
    }
  }

  const isPass = mode === 'pass'
  // SMS carries text only. There is no template, no header image and no
  // quick-reply buttons, so showing the WhatsApp card here would preview
  // something the guest never receives.
  const isSms = channel === 'sms'
  const sendLabel = dryRun
    ? strings.review_send_test
    : isPass
      ? strings.review_send_pass
      : strings.review_send_invite

  return (
    <div className="rovl" onClick={onClose}>
      <div
        className="rdrawer"
        role="dialog"
        aria-modal="true"
        aria-label={isPass ? strings.review_title_pass : strings.review_title_invite}
        data-lenis-prevent
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rhead">
          <div className="rhcopy">
            <h3>{isPass ? strings.review_title_pass : strings.review_title_invite}</h3>
            <b className="rname">{guest.name}</b>
            <div className="rmeta">
              {partyLabel ? <span>{partyLabel}</span> : null}
              <span>{isSms ? strings.review_channel_sms : strings.review_channel_whatsapp}</span>
              <span className="rphone">{phone}</span>
            </div>
          </div>
          <button data-opus-button="control" className="rx" onClick={onClose} aria-label={strings.preview_close}><X size={16} /></button>
        </div>

        <div className="rbody">
          {sentAt ? (
            <div className="rdone">
              <CheckCircle2 size={30} />
              <b>{isPass ? strings.review_sent_pass : strings.review_sent_invite}</b>
              {/* "Sent", never "Delivered": Meta has only accepted the request
                  at this point. The delivery receipt arrives on the webhook. */}
              <span>{fmt(strings.review_sent_to, { phone })}</span>
              <span className="rmuted">{fmt(strings.review_sent_at, { time: sentAt })}</span>
            </div>
          ) : (
            <>
              {/* Sending to */}
              <section className="rsec">
                <div className="rlegend">{strings.review_sending_to}</div>
                <div className="rto">
                  <b>{guest.name}</b>
                  <span>{phone}</span>
                  <span className="rmuted">{isSms ? strings.review_channel_sms : strings.review_channel_whatsapp}</span>
                </div>
                {sharedNumber ? (
                  <div className="rwarn">
                    <AlertTriangle size={14} />
                    <span>
                      {fmt(strings.review_shared_number, {
                        names: sharedNumber.guests.filter((n) => n !== guest.name).join(', '),
                      })}
                    </span>
                  </div>
                ) : null}
                {serverSkip ? (
                  <div className="rwarn danger">
                    <AlertTriangle size={14} />
                    <span>{serverSkip.detail}</span>
                  </div>
                ) : null}
                <button data-opus-button="control" className="rlink" onClick={onEditGuest}>
                  <Pencil size={12} /> {strings.review_edit_guest}
                </button>
              </section>

              {/* Artwork. WhatsApp only: an SMS carries no image, so previewing
                  a card here would show something the guest never receives. */}
              {!isSms ? (
              <section className="rsec">
                <div className="rlegend">{isPass ? strings.review_pass_legend : strings.review_card_legend}</div>
                <div className="rart">
                  {cardUrl ? (
                    <Image
                      src={cardUrl}
                      alt=""
                      width={760}
                      height={1064}
                      className="rimg"
                      unoptimized
                      // A URL that resolves but fails to load would otherwise
                      // leave an empty frame the couple could read as "the card
                      // is blank" and approve anyway.
                      onError={() => { setCardUrl(null); setCardError(strings.review_card_missing) }}
                    />
                  ) : cardLoading ? (
                    <div className="rph"><Loader2 size={18} className="spin" /><span>{fmt(strings.review_preparing, { name: guest.name })}</span></div>
                  ) : (
                    <div className="rph bad"><AlertTriangle size={18} /><span>{cardError ?? strings.review_card_missing}</span></div>
                  )}
                </div>
                {cardUrl ? (
                  <a className="rlink" href={cardUrl} target="_blank" rel="noreferrer">
                    {strings.review_open_full} <ArrowRight size={12} />
                  </a>
                ) : null}
                {isPass && guest.passId ? (
                  <div className="rfacts">
                    <div><span>{strings.review_fact_guest}</span><b>{guest.name}</b></div>
                    {partyLabel ? <div><span>{strings.review_fact_ticket}</span><b>{partyLabel}</b></div> : null}
                    <div><span>{strings.review_fact_passid}</span><b className="rmono">{guest.passId}</b></div>
                  </div>
                ) : null}
              </section>
              ) : null}

              {/* The approved template, verbatim. WhatsApp only: SMS has no
                  template and no buttons, and showing them would preview
                  something the guest never receives. */}
              {!isSms ? (
              <section className="rsec">
                <div className="rlegend">
                  {strings.review_message_legend}
                  <span className="rtag">{strings.review_approved_tag}</span>
                </div>
                <div className="rbubble">
                  <div className="rbtext">{waText(message.body)}</div>
                  <div className="rbfoot">{message.footer}</div>
                </div>
                {message.buttons.map((label) => (
                  <div key={label} className="rbbtn">↩ {label}</div>
                ))}
              </section>
              ) : null}

              {smsFallback ? (
                <section className="rsec">
                  <div className="rlegend">
                    {isSms ? strings.review_sms_message_title : strings.review_sms_title}
                    {!isSms && deliveryFailed ? (
                      <span className="rtag bad">{strings.review_sms_needed}</span>
                    ) : null}
                  </div>
                  <p className="rmuted rsmsnote">
                    {isSms ? strings.review_sms_message_note : strings.review_sms_note}
                  </p>
                  <pre className="rsms">{smsFallback}</pre>
                  <button data-opus-button="control"
                    type="button"
                    className="rbtn copy"
                    onClick={() => {
                      navigator.clipboard.writeText(smsFallback)
                      setSmsCopied(true)
                      window.setTimeout(() => setSmsCopied(false), 2000)
                    }}
                  >
                    {smsCopied ? <Check size={14} /> : <Copy size={14} />}
                    {smsCopied ? strings.review_sms_copied : strings.review_sms_copy}
                  </button>
                </section>
              ) : null}

              {/* Readiness */}
              <section className="rsec">
                <div className={`rlegend${blockingFailures.length > 0 ? ' bad' : ''}`}>
                  {blockingFailures.length > 0 ? strings.review_checks_blocked : strings.review_checks_ready}
                </div>
                <ul className="rchecks">
                  {effectiveChecks.map((c) => (
                    <li key={c.key} className={c.ok ? 'ok' : c.blocking ? 'bad' : 'warn'}>
                      <span className="rmark">{c.ok ? <Check size={13} /> : <X size={13} />}</span>
                      <div className="rcbody">
                        <span>{c.label}</span>
                        {!c.ok && c.fix ? (
                          // A plain anchor, not next/link: styled-jsx only scopes
                          // its classes onto real DOM elements, so a <Link>
                          // here renders unstyled. Leaving the console for card
                          // details is a real navigation anyway.
                          c.fix.href ? (
                            <a className="rlink" href={c.fix.href}>{c.fix.label} <ArrowRight size={12} /></a>
                          ) : (
                            <button data-opus-button="control" className="rlink" onClick={c.fix.onClick}>{c.fix.label} <ArrowRight size={12} /></button>
                          )
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {sendError ? (
                <div className="rerr">
                  <b>{isPass ? strings.review_error_title_pass : strings.review_error_title_invite}</b>
                  <span>{sendError.message}</span>
                  {sendError.canTopUp && onTopUp ? (
                    <button data-opus-button="control" className="rlink" onClick={onTopUp}>{strings.review_topup} <ArrowRight size={12} /></button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="rfoot">
          {sentAt ? (
            <button data-opus-button="control" className="rbtn pri" onClick={onClose}>{strings.review_done}</button>
          ) : (
            <>
              <div className="rfnote">
                {isSms ? (
                  <span>{strings.review_sms_manual_note}</span>
                ) : dryRun ? (
                  <span className="rdry">{strings.review_dryrun}</span>
                ) : creditNote ? (
                  <span>{creditNote}</span>
                ) : null}
              </div>
              <div className="rfacts-row">
                <button data-opus-button="control" className="rbtn ghost" onClick={onClose} disabled={sending}>{strings.confirm_cancel}</button>
                {isSms ? (
                  // Nothing is sent from here. The handset's own composer opens
                  // pre-filled and the couple presses send there, which is what
                  // makes it an ordinary person-to-person SMS.
                  <button data-opus-button="control" className="rbtn send" disabled={!onOpenSms} onClick={() => onOpenSms?.()}>
                    <Smartphone size={15} /> {strings.review_open_sms}
                  </button>
                ) : (
                  <button data-opus-button="control" className="rbtn send" disabled={!canSend} onClick={runSend}>
                    {sending ? (
                      <><Loader2 size={15} className="spin" /> {strings.review_sending}</>
                    ) : (
                      <>{isPass ? <Ticket size={15} /> : <MessageCircle size={15} />} {sendLabel}</>
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .rovl{ position:fixed; inset:0; background:rgba(20,18,30,.34); z-index:70;
          display:flex; justify-content:flex-end; }
        .rdrawer{ background:#fff; width:min(560px,100vw); height:100%; display:flex; flex-direction:column;
          box-shadow:-8px 0 32px rgba(20,18,30,.14); animation:rslide .22s ease; }
        @keyframes rslide{ from{ transform:translateX(24px); opacity:.4 } to{ transform:none; opacity:1 } }
        @media (max-width:900px){ .rdrawer{ width:90vw } }
        @media (max-width:640px){
          .rovl{ justify-content:stretch }
          .rdrawer{ width:100vw; animation:rup .22s ease }
          @keyframes rup{ from{ transform:translateY(24px); opacity:.4 } to{ transform:none; opacity:1 } }
        }

        .rhead{ display:flex; align-items:flex-start; gap:12px; padding:18px 20px 14px;
          border-bottom:1px solid #ededf0; flex:none; }
        .rhcopy{ min-width:0; flex:1 }
        .rhead h3{ font-size:13px; font-weight:700; letter-spacing:.02em; text-transform:uppercase;
          color:#8b8790; margin:0 0 6px; }
        .rname{ display:block; font-size:17px; font-weight:700; color:#1c1b1f; letter-spacing:-.2px; }
        .rmeta{ display:flex; align-items:center; gap:7px; flex-wrap:wrap; margin-top:4px;
          font-size:12.5px; color:#8b8790; }
        .rmeta span + span::before{ content:'·'; margin-right:7px; color:#c9c6ce; }
        .rphone{ font-variant-numeric:tabular-nums }
        .rx{ border:none; background:#f6f4f8; color:#8b8790; border-radius:var(--opus-radius-small); width:30px; height:30px;
          display:grid; place-items:center; cursor:pointer; flex:none; }
        .rx:hover{ background:#efecf3; color:#1c1b1f }

        .rbody{ flex:1; overflow-y:auto; padding:16px 20px 22px; display:flex; flex-direction:column; gap:18px; }
        .rsec{ display:flex; flex-direction:column; gap:9px; }
        .rlegend{ display:flex; align-items:center; gap:8px; font-size:11px; font-weight:700;
          letter-spacing:.06em; text-transform:uppercase; color:#8b8790; }
        .rlegend.bad{ color:#c0392b }
        .rtag{ background:#EAF6EF; color:#2E7D55; font-size:9.5px; font-weight:700; letter-spacing:.04em;
          padding:2px 7px; border-radius:999px; }

        .rto{ display:flex; flex-direction:column; gap:2px; border:1px solid #ededf0; border-radius:var(--opus-radius-small);
          padding:11px 13px; font-size:13.5px; }
        .rto b{ font-weight:650; color:#1c1b1f }
        .rto span{ color:#5f5b66; font-variant-numeric:tabular-nums }
        .rmuted{ color:#8b8790 !important }
        /* The tag turns red when WhatsApp has already refused this guest: for
           them the SMS is not an alternative, it is the only route left. */
        .rtag.bad{ background:#fcecec; color:#c0392b; }
        .rsmsnote{ margin:0 0 9px; font-size:12px; line-height:1.5; }
        /* Monospace and pre-wrap so the couple sees the exact line breaks the
           guest will get, including the Entrance Pass ID on its own line. */
        .rsms{ margin:0; padding:12px 13px; border:1px solid #ededf0; border-radius:var(--opus-radius-small);
          background:#faf8fc; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
          font-size:11.5px; line-height:1.55; color:#1c1b1f; white-space:pre-wrap;
          word-break:break-word; max-height:260px; overflow-y:auto; }
        .rbtn.copy{ margin-top:10px; width:100%; justify-content:center; background:#fff;
          border:1px solid #D7BDE8; color:#4A2870; }
        .rbtn.copy:hover{ background:#F6EEFB; border-color:#6B3FA0; }

        .rwarn{ display:flex; align-items:flex-start; gap:8px; background:#FFFBEB; border:1px solid #FBE8B0;
          color:#8a6d1a; border-radius:var(--opus-radius-small); padding:9px 11px; font-size:12.5px; line-height:1.45; }
        .rwarn.danger{ background:#fcecec; border-color:#f3d2d2; color:#c0392b }
        .rwarn :global(svg){ flex:none; margin-top:1px }

        .rart{ border:1px solid #ededf0; border-radius:var(--opus-radius-medium); overflow:hidden; background:#faf8fc; }
        .rimg{ display:block; width:100%; height:auto }
        .rph{ display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px;
          min-height:200px; color:#8b8790; font-size:12.5px; text-align:center; padding:20px; }
        .rph.bad{ color:#c0392b }
        .rfacts{ display:flex; flex-direction:column; gap:6px; margin-top:2px }
        .rfacts div{ display:flex; align-items:baseline; justify-content:space-between; gap:12px; font-size:12.5px; }
        .rfacts span{ color:#8b8790 }
        .rfacts b{ font-weight:650; color:#1c1b1f; text-align:right }
        .rmono{ font-family:ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.02em }

        .rbubble{ background:#fff; border:1px solid #ededf0; border-radius:var(--opus-radius-medium); padding:12px 14px;
          box-shadow:0 1px 2px rgba(20,18,30,.05); }
        .rbtext{ font-size:13.5px; line-height:1.55; color:#1c1b1f; white-space:pre-wrap }
        .rbfoot{ margin-top:8px; font-size:11px; color:#b6b2ba }
        .rbbtn{ border:1px solid #ededf0; border-radius:var(--opus-radius-small); padding:8px; text-align:center;
          font-size:12.5px; font-weight:600; color:#2E7D55; background:#fff; }

        .rchecks{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:7px }
        .rchecks li{ display:flex; align-items:flex-start; gap:9px; font-size:13px; color:#1c1b1f }
        .rmark{ display:grid; place-items:center; width:18px; height:18px; border-radius:999px; flex:none;
          margin-top:1px; }
        .rchecks li.ok .rmark{ background:#EAF6EF; color:#2E7D55 }
        .rchecks li.bad .rmark{ background:#fcecec; color:#c0392b }
        .rchecks li.warn .rmark{ background:#FFFBEB; color:#8a6d1a }
        .rchecks li.bad{ color:#c0392b }
        .rcbody{ display:flex; flex-direction:column; gap:3px; min-width:0 }

        .rlink{ display:inline-flex; align-items:center; gap:5px; background:none; border:none; padding:0;
          font-size:12.5px; font-weight:650; color:#6B3FA0; cursor:pointer; text-decoration:none;
          align-self:flex-start; white-space:nowrap; }
        .rlink:hover{ text-decoration:underline }

        .rerr{ display:flex; flex-direction:column; gap:4px; background:#fcecec; border:1px solid #f3d2d2;
          border-radius:var(--opus-radius-small); padding:12px 14px; font-size:12.5px; color:#c0392b; }
        .rerr b{ font-size:13px; font-weight:700 }

        .rdone{ display:flex; flex-direction:column; align-items:center; gap:6px; text-align:center;
          padding:44px 20px; color:#2E7D55; }
        .rdone b{ font-size:17px; font-weight:700; color:#1c1b1f; margin-top:4px }
        .rdone span{ font-size:13px; color:#5f5b66 }

        .rfoot{ flex:none; border-top:1px solid #ededf0; padding:14px 20px;
          display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
          background:#fff; }
        .rfnote{ font-size:12px; color:#8b8790; min-width:0; flex:1 }
        .rdry{ background:#FFFBEB; border:1px solid #FBE8B0; color:#8a6d1a; border-radius:999px;
          padding:4px 10px; font-weight:650; }
        .rfacts-row{ display:flex; align-items:center; gap:8px; margin-left:auto }
        .rbtn{ border:none; border-radius:999px; font-weight:650; font-size:13.5px; padding:10px 18px;
          cursor:pointer; display:inline-flex; align-items:center; gap:7px; }
        .rbtn:disabled{ opacity:.45; cursor:not-allowed }
        .rbtn.ghost{ background:#f6f4f8; color:#5f5b66 }
        .rbtn.pri{ background:#DCC3EC; color:#4A2870; margin-left:auto }
        .rbtn.send{ background:#25D366; color:#fff }
        .rbtn.send:disabled{ background:#c9c6ce }

        .spin{ animation:rspin 1s linear infinite }
        @keyframes rspin{ to{ transform:rotate(360deg) } }
      `}</style>
    </div>
  )
}
