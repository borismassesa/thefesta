'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  Loader2,
  ListPlus,
  Minus,
  Plus,
  X,
} from 'lucide-react'
import type { InitiateRequest, InitiateResponse } from '@/lib/payments/types'
import type { StoredOrder } from '@/lib/cart-storage'
import { downloadInvoice } from '@/lib/invoice'
import { MPESA_LIPA_NAMBA, MPESA_LIPA_NAME, PAYREF_RE, PHONE_RE } from '@/lib/payments/lipa-namba'
import {
  TOPUP_MAX_GUESTS,
  TOPUP_MIN_GUESTS,
  TOPUP_STEP,
  clampTopupGuests,
} from '@/lib/payments/topup-quantity'

/** The subset of TopupCandidate this screen needs. Mirrors lib/payments/topup.ts,
 *  which is server-side and cannot be imported from a client component. */
export type TopUpCard = {
  releaseId: string
  designId: string
  parentOrderId: string
  parentRef: string
  cardName: string
  cardTier: string | null
  cardImageUrl: string | null
  previewUrl: string
  unitPrice: number
  parentGuests: number
}

type Props = {
  eventId: string
  quota: { used: number; purchased: number; remaining: number }
  unassignedGuests: number
  onClose: () => void
}

/** Quick picks. Most couples know roughly how many they need, and stepping from
 *  10 to 100 in fives is fifteen taps. */
const QUICK_PICKS = [10, 25, 50, 100]

type FieldErrors = { phone?: string; name?: string; ref?: string }

/**
 * Confetti, as a fixed set rather than a random one.
 *
 * Randomising at render is impure and would re-roll on every re-render; a
 * hand-picked spread looks deliberate anyway. Colours are the ones already on
 * this screen, so the celebration belongs to the product rather than arriving
 * from a generic library.
 */
const CONFETTI = [
  { left: 6, delay: 0, dur: 2.6, rot: 18, color: '#9FE870' },
  { left: 14, delay: 0.32, dur: 3.1, rot: -24, color: '#D7BDE8' },
  { left: 23, delay: 0.12, dur: 2.4, rot: 42, color: '#E08C33' },
  { left: 31, delay: 0.54, dur: 3.3, rot: -12, color: '#9FE870' },
  { left: 40, delay: 0.06, dur: 2.9, rot: 30, color: '#CF4F3E' },
  { left: 48, delay: 0.44, dur: 2.5, rot: -38, color: '#D7BDE8' },
  { left: 57, delay: 0.2, dur: 3.2, rot: 14, color: '#9FE870' },
  { left: 65, delay: 0.6, dur: 2.7, rot: -20, color: '#E08C33' },
  { left: 73, delay: 0.1, dur: 3.0, rot: 36, color: '#D7BDE8' },
  { left: 81, delay: 0.38, dur: 2.6, rot: -30, color: '#9FE870' },
  { left: 89, delay: 0.24, dur: 3.1, rot: 22, color: '#CF4F3E' },
  { left: 95, delay: 0.5, dur: 2.8, rot: -16, color: '#D7BDE8' },
]

function formatTzs(n: number): string {
  return `TZS ${n.toLocaleString('en-US')}`
}

/** "OPUSFESTA COMPANY LIMITED" as the merchant poster prints it, rendered in
 *  sentence case — the shouted version reads like a receipt, not a product. */
function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bOpusfesta\b/, 'OpusFesta')
}

/**
 * Current → adding → new, with the bar that shows it.
 *
 * Its own component, and not a variable holding JSX, because styled-jsx only
 * attaches its scoping class to elements lexically inside a component's
 * returned tree. Markup built in a variable renders with the class names but
 * none of the styles, which is exactly the silent breakage this replaces.
 *
 * Reads as a capacity meter: red for cards already spent, green for cards still
 * in hand, orange for what this purchase would add. Three unrelated facts, so
 * three unrelated hues — tints of one colour made the segments impossible to
 * tell apart, which is what this replaces.
 */
function CapacitySummary({
  used,
  purchased,
  remaining,
  adding,
}: {
  used: number
  purchased: number
  remaining: number
  adding: number
}) {
  const newCapacity = purchased + adding
  // Measured against the NEW total so the bar does not rescale as the quantity
  // changes — the added slice grows onto the end of what is already there.
  const pct = (n: number) => (newCapacity > 0 ? Math.max(0, (n / newCapacity) * 100) : 0)
  // Clamped: a refund can push used above purchased, and a negative width would
  // silently invert the segment.
  const available = Math.max(0, purchased - used)

  return (
    <div className="summary">
      <div
        className="sbar"
        role="img"
        aria-label={`${used} sent, ${Math.max(0, remaining)} available, ${adding} being added`}
      >
        <i className="sent" style={{ width: `${pct(used)}%` }} />
        <i className="available" style={{ width: `${pct(available)}%` }} />
        <i className="adding" style={{ width: `${pct(adding)}%` }} />
      </div>
      <ul className="legend">
        <li>
          <i className="k sent" /> {used} sent
        </li>
        <li>
          <i className="k available" /> {Math.max(0, remaining)} available
        </li>
        <li>
          <i className="k adding" /> +{adding} adding
        </li>
      </ul>
      <dl className="srows">
        <div>
          <dt>Current capacity</dt>
          <dd>{purchased} cards</dd>
        </div>
        <div>
          <dt>Adding</dt>
          <dd className="add">+{adding} cards</dd>
        </div>
        <div className="total">
          <dt>New capacity</dt>
          <dd>{newCapacity} cards</dd>
        </div>
      </dl>
      <p className="snote">
        {Math.max(0, remaining) + adding} left to send. Each card includes an entrance pass.
      </p>

      <style jsx>{`
        .summary {
          /* Reads like a capacity meter, not like brand decoration: red for
             what has been spent, green for what is still in hand, orange for
             what is on its way in. Deliberately not the brand lime (#9FE870) —
             that is a badge colour, and as a bar fill it read as decoration
             rather than as data. */
          --ink: #1a1a1a;
          --muted: #6b6b75;
          --lav: #d7bde8;
          --sent: #cf4f3e;
          --sent-lite: #e0705f;
          --available: #2f7d5b;
          --available-lite: #46a179;
          --adding: #e08c33;
          --adding-lite: #eda757;
          /* No panel fill. The bar's three colours already separate this from
             everything around it, and a tint underneath them only muddied them.
             Unpadded so the rows align with the section headings above. */
        }
        /* Three separated pills rather than one divided bar: the gaps keep each
           segment legible even when it is only a few percent wide. */
        .sbar { display: flex; gap: 3px; height: 8px; }
        .sbar i {
          display: block; border-radius: 999px; min-width: 3px;
          transition: width 0.24s ease;
        }
        .sbar .sent { background: linear-gradient(90deg, var(--sent), var(--sent-lite)); }
        .sbar .available { background: linear-gradient(90deg, var(--available), var(--available-lite)); }
        .sbar .adding { background: linear-gradient(90deg, var(--adding), var(--adding-lite)); }
        .legend {
          list-style: none; margin: 12px 0 0; padding: 0;
          display: flex; gap: 14px; flex-wrap: wrap;
          font-size: 12px; font-weight: 400; color: var(--muted);
        }
        .legend li { display: inline-flex; align-items: center; gap: 6px; }
        .k { width: 9px; height: 9px; border-radius: 999px; display: block; flex: none; }
        .k.sent { background: var(--sent); }
        .k.available { background: var(--available); }
        .k.adding { background: var(--adding); }
        .srows { margin: 16px 0 0; display: grid; gap: 11px; }
        .srows > div { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }
        .srows dt { font-size: 13px; font-weight: 400; color: var(--muted); }
        .srows dd { margin: 0; font-size: 14px; font-weight: 500; }
        .srows .add { color: var(--ink); font-weight: 600; }
        .srows .total {
          margin-top: 3px; padding-top: 12px; border-top: 1px solid rgba(26, 26, 26, 0.1);
        }
        .srows .total dt { font-weight: 500; color: var(--ink); }
        .srows .total dd {
          font-size: 18px; font-weight: 600; color: var(--ink); letter-spacing: -0.01em;
        }
        .snote {
          margin: 14px 0 0; font-size: 12.5px; font-weight: 400;
          color: var(--muted); line-height: 1.5;
        }
      `}</style>
    </div>
  )
}

/**
 * Buying more digital cards on a design the couple already approved.
 *
 * A drawer rather than a page because this is an adjustment to what the couple
 * is already looking at, not a departure from it: the send console stays behind
 * it, and closing returns them exactly where they were mid-send.
 *
 * Split into two steps because the drawer has two unrelated jobs — decide how
 * many, then pay — and showing both at once made a screen where neither could
 * be found. Staging them also lets each be answered properly: step one carries
 * the capacity maths, step two the payment detail, and the total stays pinned
 * across both so the number never goes out of sight.
 *
 * The surfaces are deliberately not uniform. Summary panels are tinted and
 * borderless, payment figures sit on white with a soft shadow, inputs get only
 * a hairline, and the footer is lifted. When every block carried the same
 * border and the same weight, the eye had nothing to land on.
 */
export default function TopUpDrawer({ eventId, quota, unassignedGuests, onClose }: Props) {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<TopUpCard[]>([])
  const [contact, setContact] = useState<{ name: string | null; email: string; phone: string } | null>(null)

  const [step, setStep] = useState<1 | 2>(1)
  const [releaseId, setReleaseId] = useState<string>('')
  const [guests, setGuests] = useState<number>(TOPUP_MIN_GUESTS)
  const [payerPhone, setPayerPhone] = useState('')
  const [payerName, setPayerName] = useState('')
  const [payRef, setPayRef] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [done, setDone] = useState<{ ref: string; guests: number; invoice: StoredOrder } | null>(null)

  const phoneRef = useRef<HTMLInputElement | null>(null)

  // One key per attempt, minted on the first submit and reused for every retry
  // of THAT attempt, so a double-tap or a retry after a timeout resolves to the
  // same order. Minted in the handler rather than at render because generating
  // it is not a pure operation.
  const idempotencyKey = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/my/top-up-candidates?event=${encodeURIComponent(eventId)}`)
        if (!res.ok) throw new Error('load failed')
        const data = (await res.json()) as {
          candidates: TopUpCard[]
          contact: { name: string | null; email: string; phone: string }
        }
        if (cancelled) return
        setCandidates(data.candidates)
        setContact(data.contact)
        setPayerPhone(data.contact.phone)
        setPayerName(data.contact.name ?? '')
        // Pre-selected only when there is exactly one released card. With
        // several, the couple must choose: the artwork the extra cards carry is
        // not something an invisible "newest first" rule should decide.
        if (data.candidates.length === 1) setReleaseId(data.candidates[0].releaseId)
      } catch {
        if (!cancelled) setLoadError('Could not load your cards. Close this and try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [eventId])

  // Escape closes, matching every other overlay on this page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const card = useMemo(
    () => candidates.find((c) => c.releaseId === releaseId) ?? null,
    [candidates, releaseId],
  )

  // Display only. The server recomputes the amount from the parent order and
  // charges its own number, so a tampered price here buys nothing.
  const amount = card ? card.unitPrice * guests : 0

  /** Per-field so a message sits under the input it is about, rather than in a
   *  blob at the bottom that makes the reader hunt for which one is wrong. */
  const validate = (): FieldErrors => {
    const e: FieldErrors = {}
    if (!PHONE_RE.test(payerPhone.trim())) e.phone = 'Enter the number you paid from.'
    if (payerName.trim().length < 3) e.name = 'Enter the name on the account.'
    if (!PAYREF_RE.test(payRef.trim())) e.ref = 'Enter the reference from your SMS.'
    return e
  }

  /** Validate one field, for the on-blur path — nagging about fields they have
   *  not reached yet is worse than saying nothing. */
  const blurCheck = (k: keyof FieldErrors) => {
    const all = validate()
    setFieldErrors((prev) => ({ ...prev, ...(all[k] ? { [k]: all[k] } : {}) }))
  }

  const clearField = (k: keyof FieldErrors) =>
    setFieldErrors((prev) => {
      if (!prev[k]) return prev
      const next = { ...prev }
      delete next[k]
      return next
    })

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      window.setTimeout(() => setCopied((c) => (c === label ? null : c)), 1800)
    } catch {
      // Clipboard permission denied — the value is on screen and selectable,
      // so there is nothing useful to say here.
    }
  }

  const goToPayment = () => {
    if (!card) return
    setStep(2)
    // Land on the first thing they have to fill, rather than making them find it.
    window.setTimeout(() => phoneRef.current?.focus(), 60)
  }

  const submit = async () => {
    setError(null)
    if (!card || !contact) return
    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    idempotencyKey.current ??= crypto.randomUUID()

    setSubmitting(true)
    try {
      const payload: InitiateRequest = {
        method: 'lipa_namba',
        phone: payerPhone.trim(),
        payerName: payerName.trim(),
        paymentReference: payRef.trim().toUpperCase(),
        contact: { name: contact.name ?? undefined, email: contact.email, phone: payerPhone.trim() },
        items: [],
        topup: { releaseId: card.releaseId, guests },
        idempotencyKey: idempotencyKey.current,
        eventId,
        paymentLabel: `M-Pesa Lipa Namba ${MPESA_LIPA_NAMBA} · ${payerName.trim()} · ${payerPhone.trim()} · Ref ${payRef.trim().toUpperCase()}`,
      }
      const res = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as InitiateResponse
      if (!res.ok || data.status === 'failed') {
        setError(data.message ?? 'Could not confirm this payment. Please try again.')
        return
      }
      // Built here rather than re-fetched: /api/invoice renders a posted order
      // without a database read, and everything on it is already known at this
      // point. Timestamped in the handler because `new Date()` at render is not
      // a pure operation.
      const invoice: StoredOrder = {
        ref: data.ref,
        paidAt: new Date().toISOString(),
        eventId,
        orderKind: 'topup',
        parentRef: card.parentRef,
        paymentStatus: 'verifying',
        payment: {
          provider: 'M-Pesa Lipa Namba',
          businessNumber: MPESA_LIPA_NAMBA,
          payerName: payerName.trim(),
          payerPhone: payerPhone.trim(),
          reference: payRef.trim().toUpperCase(),
        },
        paymentRef: payRef.trim().toUpperCase(),
        contact: {
          name: contact.name ?? undefined,
          email: contact.email,
          phone: payerPhone.trim(),
        },
        items: [
          {
            id: `topup:${card.parentOrderId}:${card.releaseId}`,
            name: card.cardName,
            summary: `${guests} extra digital cards`,
            total: amount,
            tier: card.cardTier ?? undefined,
            guests,
            image: card.cardImageUrl ?? undefined,
          },
        ],
        subtotal: amount,
        discount: 0,
        total: amount,
      }
      setDone({ ref: data.ref, guests, invoice })
    } catch {
      setError('Could not reach the payment service. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const closeAndRefresh = () => {
    // The pool does not move until finance confirms, but the order now exists
    // and the couple's Orders page should show it.
    router.refresh()
    onClose()
  }

  const showSteps = !done && !loading && !loadError && candidates.length > 0

  const summary = (
    <CapacitySummary
      used={quota.used}
      purchased={quota.purchased}
      remaining={quota.remaining}
      adding={guests}
    />
  )

  return (
    <div className="ovl right" onClick={onClose}>
      <div
        className="tudrawer"
        role="dialog"
        aria-modal="true"
        aria-label="Add more digital cards"
        data-lenis-prevent
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div className="htext">
            <h3>Add more digital cards</h3>
            {/* A rail that fills rather than a row of dots. The connector turns
                green the moment a step is behind you, so progress is something
                the eye catches on the way past — no colour code to interpret,
                and the badge glyph says which step it is even in greyscale. */}
            {showSteps && (
              <ol className={`steps${step > 1 ? ' advanced' : ''}`} aria-label="Progress">
                <li className={step > 1 ? 'done' : 'now'}>
                  <span className="ic" aria-hidden>
                    {step > 1 ? <Check size={16} strokeWidth={3} /> : <ListPlus size={16} />}
                  </span>
                  <span className="lb">Quantity</span>
                </li>
                <li className={step === 2 ? 'now' : 'todo'}>
                  <span className="ic" aria-hidden>
                    <CreditCard size={16} />
                  </span>
                  <span className="lb">Payment</span>
                </li>
              </ol>
            )}
          </div>
          <button type="button" className="x" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {done ? (
          <div className="body">
            {/* Celebration, then the receipt. The confetti is decorative and
                hidden from assistive tech; everything that matters is below it
                in text. */}
            <div className="confetti" aria-hidden>
              {CONFETTI.map((c, i) => (
                <i
                  key={i}
                  style={{
                    left: `${c.left}%`,
                    background: c.color,
                    animationDelay: `${c.delay}s`,
                    animationDuration: `${c.dur}s`,
                    transform: `rotate(${c.rot}deg)`,
                  }}
                />
              ))}
            </div>

            <div className="okstate">
              <span className="okicon">
                <CheckCircle2 size={26} />
              </span>
              <h4>Payment submitted</h4>
              <p>
                Once we confirm it, <b>{done.guests} more digital cards</b> are added to this event,
                each with its own entrance pass.
              </p>
            </div>

            <section>
              <h4>Order summary</h4>
              <CapacitySummary
                used={quota.used}
                purchased={quota.purchased}
                remaining={quota.remaining}
                adding={done.guests}
              />
            </section>

            <dl className="receipt">
              <div>
                <dt>Reference</dt>
                <dd>{done.ref}</dd>
              </div>
              <div>
                <dt>Card</dt>
                <dd>{card?.cardName ?? '—'}</dd>
              </div>
              <div>
                <dt>Payment reference</dt>
                <dd>{payRef.trim().toUpperCase()}</dd>
              </div>
              <div className="total">
                <dt>Amount paid</dt>
                <dd>{formatTzs(done.invoice.total)}</dd>
              </div>
            </dl>

            <p className="fine">
              No redesign and no production wait. Cards you have already sent are unchanged.
            </p>

            <div className="okacts">
              <button type="button" className="primary" onClick={closeAndRefresh}>
                Done
              </button>
              <button type="button" className="ghost" onClick={() => downloadInvoice(done.invoice)}>
                <Download size={15} /> Invoice
              </button>
              <Link href="/my/dashboard/orders" className="ghost">
                View orders
              </Link>
            </div>
          </div>
        ) : loading ? (
          <div className="body">
            <div className="loading">
              <span className="spin"><Loader2 size={18} /></span> Loading your cards
            </div>
          </div>
        ) : loadError || candidates.length === 0 ? (
          <div className="body">
            <div className="warn">
              <AlertTriangle size={15} />
              <div>{loadError ?? 'You do not have an approved card on this event yet.'}</div>
            </div>
          </div>
        ) : step === 1 ? (
          <>
            <div className="body">
              {/* Which design the extra cards carry. Selectable only when there
                  is a real choice to make. */}
              <section>
                <h4>{candidates.length > 1 ? 'Which card are you adding to?' : 'Your card'}</h4>
                <div className="cards">
                  {candidates.map((c) => {
                    const on = c.releaseId === releaseId
                    const single = candidates.length === 1
                    return (
                      <button
                        key={c.releaseId}
                        type="button"
                        className={`cardpick${on ? ' on' : ''}${single ? ' single' : ''}`}
                        aria-pressed={single ? undefined : on}
                        disabled={single}
                        onClick={() => setReleaseId(c.releaseId)}
                      >
                        <span className="thumb">
                          {/* The frozen release itself, not the catalogue hero —
                              exactly what the extra cards will carry. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.previewUrl} alt={c.cardName} loading="lazy" />
                        </span>
                        <span className="meta">
                          <b>{c.cardName}</b>
                          {/* Pills, not dot-separated text: each fact is its own
                              chip, so the row stays readable as it grows and
                              nothing depends on a separator to be parsed. */}
                          <span className="pills">
                            <span className="pill ok">
                              <Check size={11} /> Approved
                            </span>
                            {c.cardTier && <span className="pill ok">{c.cardTier}</span>}
                            <span className="pill">{formatTzs(c.unitPrice)} each</span>
                            <span className="pill quiet">{c.parentRef}</span>
                          </span>
                        </span>
                        {on && !single && (
                          <span className="tick">
                            <Check size={12} />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* The one decision on this step, so it gets the room. */}
              <section>
                <h4>How many more?</h4>
                <div className="stepper">
                  <button
                    type="button"
                    aria-label="Fewer cards"
                    disabled={guests <= TOPUP_MIN_GUESTS}
                    onClick={() => setGuests((g) => clampTopupGuests(g - TOPUP_STEP))}
                  >
                    <Minus size={17} />
                  </button>
                  <span className="n">{guests}</span>
                  <button
                    type="button"
                    aria-label="More cards"
                    disabled={guests >= TOPUP_MAX_GUESTS}
                    onClick={() => setGuests((g) => clampTopupGuests(g + TOPUP_STEP))}
                  >
                    <Plus size={17} />
                  </button>
                </div>
                <div className="quick" role="group" aria-label="Common quantities">
                  {QUICK_PICKS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={guests === n ? 'on' : ''}
                      aria-pressed={guests === n}
                      onClick={() => setGuests(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="hint">
                  Minimum {TOPUP_MIN_GUESTS}, then in steps of {TOPUP_STEP}.
                </p>
              </section>

              <section>
                <h4>Order summary</h4>
                {summary}
              </section>

              {unassignedGuests > 0 && (
                <div className="warn">
                  <AlertTriangle size={15} />
                  <div>
                    You have {unassignedGuests} unused cards available. You can assign those before
                    buying more.
                  </div>
                </div>
              )}
            </div>

            <footer>
              <div className="ftot">
                <span>Total</span>
                <b>{formatTzs(amount)}</b>
              </div>
              <button className="primary wide" disabled={!card} onClick={goToPayment}>
                Continue to payment <ArrowRight size={15} />
              </button>
            </footer>
          </>
        ) : (
          <>
            <div className="body">
              {/* The purchase, stated once and clearly, with the total as the
                  thing the eye lands on. */}
              <div className="purchase">
                <div className="ptop">
                  <div>
                    <b>{guests} digital cards</b>
                    <span className="pills">
                      <span className="pill ok">{card?.cardName}</span>
                      <span className="pill">{card ? formatTzs(card.unitPrice) : '—'} each</span>
                    </span>
                  </div>
                  <button type="button" className="change" onClick={() => setStep(1)}>
                    Change
                  </button>
                </div>
                <div className="pbot">
                  <span>Total</span>
                  <b>{formatTzs(amount)}</b>
                </div>
              </div>

              {summary}

              {/* Two moments, in order, on a timeline — it reads as a checkout
                  rather than as two unrelated headings. */}
              <ol className="timeline">
                <li>
                  <span className="tmark" aria-hidden>
                    <Check size={11} strokeWidth={3.5} />
                  </span>
                  <h4>Pay with M-Pesa</h4>
                  <div className="payrow">
                    <div>
                      <span>Lipa Number</span>
                      <b>{MPESA_LIPA_NAMBA}</b>
                      <small>{titleCase(MPESA_LIPA_NAME)}</small>
                    </div>
                    <button
                      type="button"
                      className={`copy${copied === 'namba' ? ' ok' : ''}`}
                      onClick={() => copy('namba', MPESA_LIPA_NAMBA)}
                    >
                      {copied === 'namba' ? <Check size={13} /> : <Copy size={13} />}
                      {copied === 'namba' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="payrow hero">
                    <div>
                      <span>Amount</span>
                      <b>{formatTzs(amount)}</b>
                    </div>
                    <button
                      type="button"
                      className={`copy${copied === 'amount' ? ' ok' : ''}`}
                      onClick={() => copy('amount', String(amount))}
                    >
                      {copied === 'amount' ? <Check size={13} /> : <Copy size={13} />}
                      {copied === 'amount' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </li>
                <li>
                  <span className="tmark" aria-hidden>
                    <Check size={11} strokeWidth={3.5} />
                  </span>
                  <h4>Your payment details</h4>
                  <div className="fields">
                    <label className={fieldErrors.phone ? 'bad' : ''}>
                      <span>Phone you paid from</span>
                      <input
                        ref={phoneRef}
                        value={payerPhone}
                        onChange={(e) => {
                          setPayerPhone(e.target.value)
                          clearField('phone')
                        }}
                        onBlur={() => blurCheck('phone')}
                        inputMode="tel"
                        aria-invalid={Boolean(fieldErrors.phone)}
                        placeholder="+255 7XX XXX XXX"
                      />
                      {fieldErrors.phone ? (
                        <em>{fieldErrors.phone}</em>
                      ) : (
                        <small>Used only to verify your payment.</small>
                      )}
                    </label>
                    <label className={fieldErrors.name ? 'bad' : ''}>
                      <span>Name on the account</span>
                      <input
                        value={payerName}
                        onChange={(e) => {
                          setPayerName(e.target.value)
                          clearField('name')
                        }}
                        onBlur={() => blurCheck('name')}
                        aria-invalid={Boolean(fieldErrors.name)}
                      />
                      {fieldErrors.name ? (
                        <em>{fieldErrors.name}</em>
                      ) : (
                        <small>As registered with your mobile money account.</small>
                      )}
                    </label>
                    <label className={fieldErrors.ref ? 'bad' : ''}>
                      <span>Confirmation reference</span>
                      <input
                        value={payRef}
                        onChange={(e) => {
                          setPayRef(e.target.value.toUpperCase())
                          clearField('ref')
                        }}
                        onBlur={() => blurCheck('ref')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submit()
                        }}
                        aria-invalid={Boolean(fieldErrors.ref)}
                        placeholder="e.g. QJ12AB34CD"
                      />
                      {fieldErrors.ref ? (
                        <em>{fieldErrors.ref}</em>
                      ) : (
                        <small>Found in your M-Pesa confirmation SMS.</small>
                      )}
                    </label>
                  </div>
                </li>
              </ol>

              <ul className="trust">
                <li>
                  <Check size={13} /> Same approved design, no redesign
                </li>
                <li>
                  <Check size={13} /> Cards you have already sent stay unchanged
                </li>
                <li>
                  <Check size={13} /> New cards work as soon as payment is verified
                </li>
              </ul>

              <div className="help">
                <b>Need help?</b>
                <p>
                  Payments are usually verified within 10 to 30 minutes during business hours. You
                  can track this request on your{' '}
                  <Link href="/my/dashboard/orders">orders page</Link>.
                </p>
              </div>
            </div>

            <footer>
              {error && (
                <div className="err">
                  <AlertTriangle size={14} /> {error}
                </div>
              )}
              <div className="ftot">
                <span>Total for {guests} cards</span>
                <b>{formatTzs(amount)}</b>
              </div>
              <p className="fnote">Your card capacity increases after we verify the payment.</p>
              <div className="facts">
                <button type="button" className="back" onClick={() => setStep(1)}>
                  <ArrowLeft size={14} /> Back
                </button>
                <button className="primary grow" disabled={submitting} onClick={submit}>
                  {submitting ? (
                    <span className="spin">
                      <Loader2 size={15} />
                    </span>
                  ) : null}
                  {submitting ? 'Confirming' : 'Confirm payment'}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>

      <style jsx>{`
        .tudrawer {
          /* Same tokens as the send console this opens over (see SendInvitesView),
             rather than a second, slightly-different accent. Black and lavender
             only: the brand does not use purple. */
          --ink: #17161a;
          --muted: #6b6b75;
          --faint: #8e8e99;
          --line: #ebe9f1;
          --lav: #d7bde8;
          --lav-mid: #c4a6dc;
          /* Actions are lavender with ink text, not solid black — same pairing
             the send console uses for its primary buttons. */
          --lav-btn: #dcc3ec;
          --lav-btn-hi: #d0b1e6;
          /* Brand green: the lime fill with dark-green text. One definition,
             used by both the metadata pills and the step markers. */
          --green: #9fe870;
          --green-tx: #3f6b1f;
          --lav-soft: #f6eefb;
          --good: #2e7d55;
          --bad: #8a1f2b;
          --shadow: 0 1px 2px rgba(20, 18, 30, 0.04), 0 4px 14px rgba(20, 18, 30, 0.05);
          position: relative;
          background: #fff;
          width: min(500px, 96vw);
          height: 100%;
          display: flex;
          flex-direction: column;
          color: var(--ink);
          box-shadow: -16px 0 44px rgba(20, 18, 30, 0.16);
          animation: tu-slide 0.2s ease-out;
        }
        @keyframes tu-slide {
          from { transform: translateX(28px); opacity: 0.4; }
          to { transform: none; opacity: 1; }
        }

        /* ── Header ─────────────────────────────────────────────────────── */
        header {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
          padding: 22px 26px 18px; border-bottom: 1px solid var(--line); flex: none;
        }
        h3 { font-size: 19px; font-weight: 600; margin: 0; letter-spacing: -0.015em; }
        .steps {
          display: flex; align-items: flex-start; gap: 46px;
          list-style: none; margin: 16px 0 2px; padding: 0;
        }
        .steps li {
          position: relative;
          display: inline-flex; flex-direction: column; align-items: center; gap: 7px;
        }
        /* The connector, drawn from the previous badge to this one and centred on
           the badge row. It fills green once the step behind it is complete. */
        .steps li + li::before {
          content: ''; position: absolute; left: -40px; top: 15px;
          width: 34px; height: 2px; border-radius: 999px;
          background: #e6e6ec; transition: background 0.24s ease;
        }
        .steps.advanced li + li::before { background: var(--green); }
        .steps .ic {
          width: 32px; height: 32px; display: grid; place-items: center;
          border-radius: 999px; background: #fff; color: #c2c2cc;
          box-shadow: inset 0 0 0 1.5px #e6e6ec;
          transition: color 0.16s, background 0.16s, box-shadow 0.16s;
        }
        .steps .lb {
          font-size: 12px; font-weight: 500; color: #b7b7c2; white-space: nowrap;
          transition: color 0.16s;
        }
        /* Done: the brand green fill with its dark-green glyph — the same pairing
           as the Approved pill further down this screen. */
        .steps li.done .ic {
          background: var(--green); color: var(--green-tx); box-shadow: none;
        }
        .steps li.done .lb { color: var(--green-tx); font-weight: 600; }
        /* Current: ink ring and ink glyph, with a soft halo so it reads as the
           live step without competing with the green of a finished one. */
        .steps li.now .ic {
          color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--ink), 0 0 0 4px rgba(26, 26, 26, 0.05);
        }
        .steps li.now .lb { color: var(--ink); font-weight: 600; }
        .x {
          flex: none; width: 32px; height: 32px; display: grid; place-items: center; cursor: pointer;
          border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--faint);
          transition: color 0.12s, border-color 0.12s;
        }
        .x:hover { color: var(--ink); border-color: var(--lav); }

        /* ── Body rhythm: 32px between sections ─────────────────────────── */
        .body {
          flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
          padding: 26px 26px 30px; display: flex; flex-direction: column; gap: 32px;
        }
        section { min-width: 0; }
        h4 { font-size: 15px; font-weight: 600; margin: 0 0 20px; letter-spacing: -0.01em; }
        .hint { color: var(--faint); font-size: 13px; font-weight: 400; margin: 16px 0 0; line-height: 1.55; }
        .loading {
          display: flex; align-items: center; gap: 10px;
          color: var(--muted); font-size: 14px; padding: 48px 0; justify-content: center;
        }

        /* ── Card: white, soft shadow ───────────────────────────────────── */
        .cards { display: grid; gap: 10px; }
        .cardpick {
          position: relative; display: flex; gap: 14px; align-items: center; text-align: left;
          width: 100%; padding: 14px; border: 1px solid var(--line); border-radius: 14px;
          background: #fff; box-shadow: var(--shadow);
          transition: border-color 0.14s, box-shadow 0.14s;
        }
        .cardpick:not(.single) { cursor: pointer; }
        .cardpick:not(.single):hover { border-color: var(--lav); }
        .cardpick.on:not(.single) { border-color: var(--ink); }
        .thumb {
          width: 48px; flex: none; overflow: hidden; aspect-ratio: 5 / 7;
          border-radius: 7px; background: var(--lav-soft); border: 1px solid var(--line);
        }
        .thumb :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
        .meta { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .meta b { font-size: 16px; font-weight: 500; letter-spacing: -0.01em; }
        /* Metadata pills. Brand green for status and tier (see the dashboard's
           badge convention), a light lavender for plain values, so a row of
           chips still has a hierarchy instead of reading as one block. */
        .pills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
        .pill {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 9px; border-radius: 999px;
          background: var(--lav-soft); color: var(--ink);
          font-size: 11.5px; font-weight: 500; white-space: nowrap;
        }
        .pill.ok { background: var(--green); color: var(--green-tx); font-weight: 600; }
        .pill.quiet { background: transparent; box-shadow: inset 0 0 0 1px var(--line); color: var(--faint); }
        .tick {
          position: absolute; top: 12px; right: 12px; width: 20px; height: 20px;
          display: grid; place-items: center; border-radius: 999px;
          background: var(--ink); color: #fff;
        }

        /* ── Quantity ───────────────────────────────────────────────────── */
        .stepper { display: flex; align-items: center; gap: 8px; }
        .stepper button {
          width: 44px; height: 44px; display: grid; place-items: center; cursor: pointer;
          border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--ink);
          transition: border-color 0.12s, background 0.12s;
        }
        .stepper button:hover:not(:disabled) { border-color: var(--ink); background: var(--lav-soft); }
        .stepper button:disabled { opacity: 0.35; cursor: not-allowed; }
        .stepper .n {
          flex: 1; text-align: center; font-size: 34px; font-weight: 600; line-height: 1;
          letter-spacing: -0.02em; font-variant-numeric: tabular-nums;
        }
        .quick { display: flex; gap: 8px; margin-top: 16px; }
        .quick button {
          flex: 1; padding: 10px 0; cursor: pointer;
          border: 1px solid var(--line); border-radius: 999px; background: #fff;
          font-size: 13px; font-weight: 500; color: var(--muted);
          transition: border-color 0.12s, background 0.12s, color 0.12s;
        }
        .quick button:hover { border-color: var(--lav); color: var(--ink); }
        .quick button.on {
          border-color: var(--lav-btn); background: var(--lav-btn); color: var(--ink); font-weight: 600;
        }

        /* ── Purchase panel (step 2 anchor) ─────────────────────────────── */
        .purchase {
          background: linear-gradient(160deg, #f3eafa, #fbf7fd);
          border-radius: 18px; padding: 18px 20px;
        }
        .ptop { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
        .ptop > div { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .ptop b { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
        .ptop span { font-size: 13px; font-weight: 400; color: var(--muted); }
        .change {
          flex: none; cursor: pointer; background: #fff; border: 1px solid var(--lav);
          border-radius: 999px; padding: 7px 15px;
          font-size: 12.5px; font-weight: 600; color: var(--ink);
          transition: border-color 0.12s;
        }
        .change:hover { border-color: var(--ink); }
        .pbot {
          display: flex; align-items: baseline; justify-content: space-between; gap: 14px;
          margin-top: 16px; padding-top: 15px; border-top: 1px solid rgba(26, 26, 26, 0.12);
        }
        .pbot span { font-size: 13px; font-weight: 500; color: var(--ink); }
        .pbot b { font-size: 27px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink); }

        /* ── Timeline ───────────────────────────────────────────────────── */
        .timeline { list-style: none; margin: 0; padding: 0; }
        .timeline li { position: relative; padding: 0 0 30px 32px; }
        .timeline li:last-child { padding-bottom: 0; }
        /* Green tick badges, the same brand pairing as the step rail and the
           Approved pill, so every "settled" marker on this screen looks alike. */
        .tmark {
          position: absolute; left: 0; top: 1px;
          width: 18px; height: 18px; display: grid; place-items: center;
          border-radius: 999px; background: var(--green); color: var(--green-tx);
        }
        .timeline li:not(:last-child)::after {
          content: ''; position: absolute; left: 8.5px; top: 22px; bottom: 8px;
          width: 1px; background: var(--line);
        }
        .timeline h4 { margin-bottom: 16px; }

        /* ── Payment figures: white, soft shadow, amount is the hero ────── */
        .payrow {
          display: flex; align-items: center; justify-content: space-between; gap: 14px;
          border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px;
          background: #fff; box-shadow: var(--shadow); margin-bottom: 10px;
        }
        .payrow:last-child { margin-bottom: 0; }
        .payrow > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .payrow > div > span { font-size: 12.5px; font-weight: 500; color: var(--muted); }
        .payrow b { font-size: 21px; font-weight: 600; letter-spacing: -0.015em; overflow-wrap: anywhere; }
        .payrow small { font-size: 12.5px; font-weight: 400; color: var(--faint); }
        .payrow.hero { padding: 17px 16px; border-color: var(--lav); }
        .payrow.hero b { font-size: 28px; color: var(--ink); letter-spacing: -0.025em; }
        .copy {
          flex: none; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
          padding: 9px 15px; border: 1px solid var(--line); border-radius: 999px; background: #fff;
          font-size: 12.5px; font-weight: 500; color: var(--ink);
          transition: border-color 0.12s, background 0.12s, color 0.12s;
        }
        .copy:hover { border-color: var(--ink); background: var(--lav-soft); }
        .copy.ok { border-color: #bfe6cd; background: #f0fbf4; color: var(--good); }

        /* ── Inputs: hairline only ──────────────────────────────────────── */
        .fields { display: grid; gap: 16px; }
        .fields label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 500; }
        .fields input {
          border: 1px solid var(--line); border-radius: 11px; padding: 11px 13px;
          font-size: 14px; font-weight: 400; background: #fff; color: var(--ink);
          transition: border-color 0.12s;
        }
        .fields input::placeholder { color: #b3b3bd; }
        .fields input:focus { outline: 3px solid rgba(26, 26, 26, 0.12); border-color: var(--ink); }
        .fields label.bad input { border-color: #e3aeb4; }
        .fields small { font-size: 12.5px; font-weight: 400; color: var(--faint); line-height: 1.45; }
        .fields em { font-style: normal; font-size: 12.5px; font-weight: 500; color: var(--bad); }

        /* ── Trust + help ───────────────────────────────────────────────── */
        .trust { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
        .trust li {
          display: flex; align-items: flex-start; gap: 9px;
          font-size: 13px; font-weight: 400; line-height: 1.5; color: var(--muted);
        }
        .trust li :global(svg) { color: var(--good); flex: none; margin-top: 2px; }
        .help { background: #fafafb; border-radius: 14px; padding: 16px 18px; }
        .help b { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
        .help p { margin: 0; font-size: 13px; font-weight: 400; color: var(--muted); line-height: 1.55; }
        .help :global(a) { color: var(--ink); font-weight: 500; }

        /* ── Footer: elevated ───────────────────────────────────────────── */
        footer {
          flex: none; border-top: 1px solid var(--line); padding: 18px 26px 22px;
          background: #fff; box-shadow: 0 -10px 26px rgba(20, 18, 30, 0.06);
        }
        .ftot { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }
        .ftot > span { font-size: 13px; font-weight: 400; color: var(--muted); }
        .ftot b { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; }
        .fnote { margin: 8px 0 0; font-size: 12.5px; font-weight: 400; color: var(--faint); line-height: 1.5; }
        .facts { display: flex; gap: 10px; margin-top: 16px; }
        .primary {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          cursor: pointer; border: none; border-radius: 999px; padding: 14px 24px;
          background: var(--lav-btn); color: var(--ink); font-size: 14px; font-weight: 600;
          white-space: nowrap; transition: background 0.12s;
        }
        .primary.wide { width: 100%; margin-top: 16px; }
        .primary.grow { flex: 1; }
        .primary:hover:not(:disabled) { background: var(--lav-btn-hi); }
        .primary:disabled { opacity: 0.45; cursor: not-allowed; }
        /* Outlined red: leaving the payment step discards nothing, but it is the
           one control here that moves you backwards, so it is marked rather than
           left to blend into the footer. */
        .back {
          display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
          border: 1px solid #e6b3b3; border-radius: 999px; padding: 13px 19px;
          background: #fff; color: var(--bad); font-size: 13.5px; font-weight: 600;
          transition: color 0.12s, border-color 0.12s, background 0.12s;
        }
        .back:hover { border-color: var(--bad); background: #fdf4f4; }
        .ghost,
        /* next/link renders a component, and styled-jsx only adds its scoping
           class to plain elements — so the anchor needs reaching globally, from
           inside a scoped parent. Without this the link renders unstyled. */
        .okacts :global(a.ghost) {
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          border: 1px solid var(--line); border-radius: 999px; padding: 13px 22px;
          background: #fff; color: var(--ink); font-size: 14px; font-weight: 500;
          text-decoration: none; transition: border-color 0.12s;
        }
        .ghost:hover, .okacts :global(a.ghost:hover) { border-color: var(--lav); }

        .warn, .err {
          display: flex; gap: 10px; align-items: flex-start; padding: 13px 15px;
          border-radius: 13px; font-size: 13px; font-weight: 400; line-height: 1.5;
        }
        .warn { background: #fff8e8; color: #6b4e00; }
        .err { background: #fdeced; color: var(--bad); margin-bottom: 14px; }
        .warn :global(svg), .err :global(svg) { flex: none; margin-top: 1px; }

        /* Confetti falls through the drawer's own width, behind the content and
           without affecting layout. Ends on its own — a celebration that keeps
           going becomes noise the moment the reader starts reading. */
        .confetti {
          position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 1;
        }
        .confetti i {
          position: absolute; top: -14px; width: 8px; height: 12px; border-radius: 2px;
          opacity: 0; animation-name: tu-fall; animation-timing-function: cubic-bezier(.3,.7,.5,1);
          animation-fill-mode: forwards; animation-iteration-count: 1;
        }
        @keyframes tu-fall {
          0% { opacity: 0; transform: translateY(0) rotate(0deg); }
          8% { opacity: 1; }
          100% { opacity: 0; transform: translateY(420px) rotate(420deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .confetti { display: none; }
        }

        .okstate { position: relative; z-index: 2; text-align: center; padding: 8px 4px 0; }
        .okicon {
          display: inline-grid; place-items: center; width: 54px; height: 54px;
          border-radius: 999px; background: #f0fbf4; color: var(--good); margin-bottom: 16px;
        }
        .okstate h4 { font-size: 19px; font-weight: 600; margin: 0 0 10px; }
        .okstate p { font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.6; margin: 0; }
        /* The receipt: what was bought, what it cost, what to quote if they ring
           us about it. */
        .receipt {
          margin: 0; display: grid; gap: 11px;
          background: var(--lav-soft); border-radius: 14px; padding: 16px;
        }
        .receipt > div { display: flex; justify-content: space-between; gap: 14px; font-size: 13px; }
        .receipt dt { color: var(--muted); font-weight: 400; }
        .receipt dd { margin: 0; font-weight: 500; }
        .receipt .total {
          margin-top: 3px; padding-top: 12px; border-top: 1px solid rgba(26, 26, 26, 0.1);
        }
        .receipt .total dt { font-weight: 500; color: var(--ink); }
        .receipt .total dd { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
        .fine {
          font-size: 12.5px; font-weight: 400; color: var(--faint);
          line-height: 1.55; margin: 0; text-align: center;
        }
        .okacts { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
        .okacts .ghost { gap: 7px; }

        /* The class sits on a wrapping span, not on <Loader2>. styled-jsx only
           adds its scoping class to plain DOM elements, so a class handed
           straight to a component renders with the name and none of the rules —
           silently, and the spinner simply never turns. Same reason the success
           link needed :global() below. */
        .spin { display: inline-flex; animation: tu-spin 1s linear infinite; }
        @keyframes tu-spin { to { transform: rotate(360deg); } }

        @media (max-width: 480px) {
          .body { padding: 20px 18px 24px; gap: 28px; }
          header { padding: 18px 18px 16px; }
          footer { padding: 16px 18px 20px; }
          .payrow.hero b { font-size: 24px; }
          .pbot b { font-size: 24px; }
        }
      `}</style>
    </div>
  )
}
