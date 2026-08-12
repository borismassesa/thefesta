'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Heart,
  Home,
  Loader2,
  MapPin,
  Palette,
  Phone,
  Pipette,
  Send,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { injectFontCss, renderCardSvg } from '@opusfesta/lib'
import type { CardDetailCard } from '@/lib/dashboard/card-details'
import {
  CARD_FIELD_GROUPS,
  CARD_GROUP_BLURB,
  cardFieldCopy,
} from '@/lib/dashboard/card-details-labels'

export type SaveCardDetails = (
  target: { orderId: string; lineIndex: number },
  answers: Record<string, string>,
) => Promise<{ ok: true; filled: number } | { ok: false; error: string }>

/**
 * Ask for a change to a card that is already released.
 *
 * Optional throughout: the public token link serves the same form to a couple
 * who is not signed in, and a request has to be attributable to an account, so
 * that surface simply does not offer it.
 */
export type RequestCardChange = (
  target: { orderId: string; lineIndex: number },
  message: string,
) => Promise<{ ok: true } | { ok: false; error: string }>

/**
 * The couple's own copy of every card they bought.
 *
 * One editor per purchased card line, holding exactly the fields that card's
 * artwork can print. They can fill it in the moment the order is paid — nobody
 * has to ask them first — and send it to the design team when they're happy.
 *
 * Laid out as a workspace rather than a form: the fields grouped into the
 * card's own sections, and the card itself rendered beside them as
 * they type. Typing "Moses Seeta" into a labelled box is guesswork; watching it
 * land in the script at the centre of the card is not, and this is the couple's
 * only chance to catch a misspelling before it prints on every copy.
 */
export default function CardDetailsForm({
  cards,
  save,
  requestChange,
  intro,
  showHeader = true,
  token,
}: {
  cards: CardDetailCard[]
  /** Passed in so the same form serves the signed-in page and the public link. */
  save: SaveCardDetails
  /** Omitted on the public token link, which has no account to attribute to. */
  requestChange?: RequestCardChange
  intro?: string
  /** False inside the dashboard, where the tabbed section already carries the
   *  heading. The public link has no such chrome, so it keeps its own. */
  showHeader?: boolean
  /** Set on the public link, where the preview routes are addressed by token
   *  rather than by the signed-in couple's order. */
  token?: string
}) {
  if (cards.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <Sparkles className="mx-auto h-10 w-10 text-[#C9A0DC]" />
        <h2 className="mt-4 text-xl font-semibold text-gray-900">No cards to fill in yet</h2>
        <p className="mt-2 text-sm text-gray-500">
          Once you have bought a card, this is where you type the names, dates and venues that get
          printed on it.
        </p>
      </div>
    )
  }

  // The dashboard shell already pads and centres its main column, and the tab
  // bar above sits at that inset — adding a second gutter here would step the
  // form in from its own page heading. The public link has no such chrome.
  const gutter = showHeader ? 'px-4 pt-8 sm:px-6 lg:px-10' : ''

  return (
    <div className={`mx-auto w-full max-w-[1400px] space-y-12 pb-10 ${gutter}`}>
      {showHeader ? (
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
            Your card details
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-gray-500">
            {intro ??
              `What you type here is what gets printed on your ${
                cards.length === 1 ? 'card' : 'cards'
              }. Check every name and spelling against the preview, then send it to our design team.`}
          </p>
        </header>
      ) : null}

      {cards.map((card) => (
        <CardEditor
          key={`${card.orderId}:${card.lineIndex}`}
          card={card}
          save={save}
          requestChange={requestChange}
          token={token}
        />
      ))}
    </div>
  )
}

/** A section's icon, so the headings scan at a glance. */
const GROUP_ICON: Record<string, LucideIcon> = {
  Hosts: Home,
  Couple: Heart,
  Date: CalendarDays,
  Venue: MapPin,
  Contacts: Phone,
  Design: Palette,
}

/**
 * Fields that belong on one line.
 *
 * Day / Month / Year are three boxes holding one fact, and a venue's place and
 * time are read together; stacking them turns a six-word answer into six
 * screens of scrolling. Anything not named here gets its own full-width row, so
 * a role added to the shared list tomorrow still lays out sensibly.
 */
const FIELD_ROWS: Record<string, string> = {
  date_day: 'date',
  date_month: 'date',
  date_year: 'date',
  couple_name_1: 'couple',
  couple_name_2: 'couple',
  venue_1_place: 'venue-1',
  venue_1_time: 'venue-1',
  venue_2_place: 'venue-2',
  venue_2_time: 'venue-2',
  contact_1: 'contacts',
  contact_2: 'contacts',
}

type Row = { key: string; roles: string[]; colour: boolean }

/** Spelled out rather than interpolated, so Tailwind can see the class names. */
const ROW_COLUMNS: Record<number, string> = {
  2: 'grid gap-5 sm:grid-cols-2',
  3: 'grid gap-5 sm:grid-cols-3',
}

/** Consecutive fields sharing a row key become one row; everything else stands alone. */
function toRows(fields: { role: string }[]): Row[] {
  const rows: Row[] = []
  for (const field of fields) {
    const colour = cardFieldCopy(field.role).kind === 'colour'
    // Colours are laid out as a swatch strip, so they share a row regardless of
    // how many the card has.
    const key = colour ? 'colours' : (FIELD_ROWS[field.role] ?? `solo:${field.role}`)
    const last = rows[rows.length - 1]
    if (last && last.key === key) last.roles.push(field.role)
    else rows.push({ key, roles: [field.role], colour })
  }
  return rows
}

function sectionId(cardKey: string, group: string): string {
  return `s-${cardKey}-${group.toLowerCase()}`
}

/**
 * Ask the design team to correct a card that has already gone out.
 *
 * Collapsed to a single link until it is wanted. A released card is the good
 * outcome, and leading with an open complaint box under "Your card is approved"
 * invites second thoughts about a card the couple already signed off.
 *
 * What it deliberately does not promise: that anything will change. The card
 * guests hold stays exactly as it is until a designer decides to republish it,
 * and the confirmation says so rather than implying the correction is done.
 */
function ChangeRequest({
  card,
  requestChange,
}: {
  card: CardDetailCard
  requestChange: RequestCardChange
}) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [justSent, setJustSent] = useState(false)

  const alreadyAsked = Boolean(card.changeRequestedAt) || justSent

  if (alreadyAsked && !open) {
    return (
      <p className="w-full text-sm font-medium">
        We have your change request and a designer is looking at it. Your guests still have the
        approved card until it is updated.
      </p>
    )
  }

  if (!open) {
    return (
      <button data-opus-button="control"
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold underline underline-offset-2"
      >
        Something needs correcting
      </button>
    )
  }

  function send() {
    const note = message.trim()
    if (!note) {
      setError('Tell us what needs changing.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await requestChange(
        { orderId: card.orderId, lineIndex: card.lineIndex },
        note,
      )
      if (result.ok) {
        setJustSent(true)
        setOpen(false)
        setMessage('')
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="w-full space-y-2">
      <label htmlFor={`change-${card.orderId}-${card.lineIndex}`} className="block text-sm font-semibold">
        What needs correcting?
      </label>
      <textarea
        id={`change-${card.orderId}-${card.lineIndex}`}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="e.g. My mother's name is spelled Mwaisemba, not Mwaisema."
        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#C9A0DC]"
      />
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button data-opus-button="primary" data-opus-button-size="medium"
          type="button"
          onClick={send}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A1A1A] px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Send to our designers
        </button>
        <button data-opus-button="control"
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className="text-sm font-medium underline underline-offset-2"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function CardEditor({
  card,
  save,
  requestChange,
  token,
}: {
  card: CardDetailCard
  save: SaveCardDetails
  requestChange?: RequestCardChange
  token?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const initial = useMemo(
    () => Object.fromEntries(card.fields.map((f) => [f.role, card.values[f.role] ?? ''])),
    [card.fields, card.values],
  )
  const [answers, setAnswers] = useState<Record<string, string>>(initial)
  /** What the server holds, so the action bar can tell saved from unsaved. */
  const [saved, setSaved] = useState<Record<string, string>>(initial)

  const cardKey = `${card.orderId}-${card.lineIndex}`
  const filled = card.fields.filter((field) => (answers[field.role] ?? '').trim()).length
  const total = card.fields.length
  const complete = filled === total
  const percent = total === 0 ? 0 : Math.round((filled / total) * 100)
  const dirty = card.fields.some(
    (f) => (answers[f.role] ?? '').trim() !== (saved[f.role] ?? '').trim(),
  )
  // Fields a designer explicitly chased. They are already in their section
  // below, so this is a pointer rather than a second copy of the form.
  const chased = card.fields.filter((field) => field.requested && !(answers[field.role] ?? '').trim())

  // The card's own sections, in reading order, with empty ones dropped: a Save
  // the Date has no Contacts block and shouldn't grow an empty heading.
  const sections = useMemo(
    () =>
      CARD_FIELD_GROUPS.map((group) => {
        const fields = card.fields.filter((field) => cardFieldCopy(field.role).group === group)
        return { group, fields, rows: toRows(fields) }
      }).filter((section) => section.fields.length > 0),
    [card.fields],
  )

  // The scrollspy that tracked which section the reader was in went with the
  // jump list it highlighted. Nothing else consumed it, and an
  // IntersectionObserver per card observing every section is not worth keeping
  // warm for a state nobody reads.

  /**
   * True while the action bar is pinned over the fields rather than sitting at
   * the end of them, which is the only time it should cast a shadow.
   *
   * Without this the bar reads as a stray rule across the page once you reach
   * the bottom: a border with nothing under it and no edge to belong to.
   */
  const [floating, setFloating] = useState(false)
  const restRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const node = restRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => setFloating(!entry.isIntersecting),
      // Discount the bar's own height, so it settles as its resting place
      // appears rather than a beat later.
      { rootMargin: '0px 0px -72px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [card.locked])

  const update = useCallback((role: string, value: string) => {
    setSent(false)
    setAnswers((prev) => ({ ...prev, [role]: value }))
  }, [])

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await save({ orderId: card.orderId, lineIndex: card.lineIndex }, answers)
        if (!result.ok) setError(result.error)
        else {
          setSent(true)
          setSaved(answers)
          router.refresh()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save. Please try again.')
      }
    })
  }

  return (
    // A locked card has no action bar to close it off, so it carries the
    // bottom padding the bar would otherwise provide.
    <section className={`space-y-6 ${card.locked ? 'pb-8' : ''}`}>
      <CardHeader
        card={card}
        filled={filled}
        total={total}
        percent={percent}
        complete={complete}
      />

      {card.locked ? (
        <Banner tone="success" icon={<CheckCircle2 className="h-5 w-5" />} title="Your card is approved">
          <p>
            The design is locked so every guest receives the same approved version. If something
            still needs correcting, tell us and our designers will look at it.
          </p>
          {/* One row, so the two links do not butt against each other. The
              collapsed request is a peer of "View your finished card"; its
              opened form and its sent confirmation take w-full and so wrap onto
              a line of their own. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
            {card.designId && (
              <Link
                href={`/my/dashboard/cards/${card.designId}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold underline underline-offset-2"
              >
                View your finished card
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
            {/* The sentence above used to end at "Message us", with no way to
                do so and nothing recording that they had. */}
            {requestChange && <ChangeRequest card={card} requestChange={requestChange} />}
          </div>
        </Banner>
      ) : chased.length > 0 ? (
        <Banner tone="warning" icon={<Sparkles className="h-5 w-5" />} title="Our designers are waiting on you">
          <p>
            {chased.map((field) => cardFieldCopy(field.role).label).join(', ')}
            {chased.length === 1 ? ' is' : ' are'} still blank. Everything else can wait.
          </p>
        </Banner>
      ) : null}

      {/* Fields and the live preview. The preview stays sticky: the point of it
          is watching the card change as you type.

          There is no section nav. The sections are already headed and in
          reading order, and a card has six of them at most, so a jump list was
          a second index over a list short enough to read. */}
      {/* The two columns are deliberately aligned differently, and it has to be
          per column rather than `items-start` on the grid.

          The form takes self-start so a short form is not stretched to the
          preview's height, which would strand its action bar at the bottom of a
          tall empty box.

          The preview column keeps the default stretch, because that is what
          makes it sticky: a sticky child can only travel inside a containing
          block taller than itself, and a rail shrunk to its own content has
          nowhere to move. `items-start` on the grid took that away from both
          columns at once and the preview stopped following the scroll. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6 self-start">
          {sections.map((section) => {
            const Icon = GROUP_ICON[section.group] ?? Sparkles
            return (
              <div
                key={section.group}
                // The id (and the scroll offset that makes it land correctly)
                // stay: they make a section addressable, so a link already
                // shared with a couple keeps working. `data-group` went with
                // the observer that was its only reader.
                id={sectionId(cardKey, section.group)}
                className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white"
              >
                <div className="flex items-start gap-3 border-b border-gray-100 px-6 py-5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F3EDF7] text-[#7E5896]">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[22px] font-semibold leading-tight tracking-tight text-gray-900">
                      {section.group}
                    </h3>
                    <p className="mt-0.5 text-[13px] leading-snug text-gray-500">
                      {CARD_GROUP_BLURB[section.group]}
                    </p>
                  </div>
                </div>

                <div className="space-y-5 px-6 py-6">
                  {section.rows.map((row) =>
                    row.colour ? (
                      <ColourRow
                        key={row.key}
                        cardKey={cardKey}
                        roles={row.roles}
                        answers={answers}
                        disabled={card.locked}
                        onChange={update}
                      />
                    ) : (
                      <div
                        key={row.key}
                        className={ROW_COLUMNS[row.roles.length] ?? ''}
                      >
                        {row.roles.map((role) => (
                          <Field
                            key={role}
                            cardKey={cardKey}
                            role={role}
                            requested={
                              card.fields.find((f) => f.role === role)?.requested ?? false
                            }
                            value={answers[role] ?? ''}
                            disabled={card.locked}
                            onChange={(value) => update(role, value)}
                          />
                        ))}
                      </div>
                    ),
                  )}
                </div>
              </div>
            )
          })}
          {!card.locked && (
            // Sits at the foot of the FORM, not of the page. Below the whole
            // grid it landed under whichever column was taller, which on a
            // short card meant a bar marooned beneath an empty half-page.
            //
            // The sentinel is a one-pixel target at the bar's resting place:
            // while it is off screen the bar is pinned over fields and earns
            // its shadow, and once it scrolls into view the bar has arrived at
            // the end of the form, where a shadow would imply more below.
            <>
              <div ref={restRef} aria-hidden className="h-px" />
              <div
                className={`sticky bottom-4 z-20 rounded-2xl border bg-white/95 px-6 py-4 backdrop-blur transition-shadow ${
                  floating
                    ? 'border-gray-200 shadow-[0_10px_30px_-12px_rgba(26,26,26,0.35)]'
                    : 'border-gray-200'
                }`}
              >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="min-w-0 flex-1 text-sm">
              {error ? (
                <span className="font-medium text-red-600">{error}</span>
              ) : sent ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Sent to our design team.
                </span>
              ) : dirty ? (
                <span className="font-medium text-amber-700">Unsaved changes</span>
              ) : (
                // Reassurance, not instruction: worth the room on a desktop
                // and not worth three wrapped lines above the button on a
                // phone.
                <span className="hidden text-gray-500 sm:inline">
                  {complete
                    ? 'You can come back and change these until the card is printed.'
                    : 'Send what you have now. You can add the rest later.'}
                </span>
              )}
            </p>
            {dirty && (
              <button data-opus-button="control"
                type="button"
                onClick={() => {
                  setAnswers(saved)
                  setError(null)
                }}
                className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100"
              >
                Discard changes
              </button>
            )}
            <button data-opus-button="control"
              type="button"
              onClick={submit}
              disabled={pending || filled === 0}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#7E5896] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#6b4a80] disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send to designer
            </button>
          </div>
              </div>
            </>
          )}
        </div>

        {/* On a phone the card leads: it is what the couple came to check, and
            below a nineteen-field form it would never be seen. There is no room
            to keep it in view while typing at that width, so it is placed where
            it will at least be read. */}
        <div className="order-first min-w-0 lg:order-none">
          <div className="space-y-4 lg:sticky lg:top-6">
            <LivePreview card={card} answers={answers} token={token} />
            <div className="hidden lg:block">
              <SummaryPanel card={card} filled={filled} total={total} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function CardHeader({
  card,
  filled,
  total,
  percent,
  complete,
}: {
  card: CardDetailCard
  filled: number
  total: number
  percent: number
  complete: boolean
}) {
  const status = card.locked
    ? { label: 'Approved', className: 'bg-[#9FE870] text-[#1a3d0a]' }
    : complete
      ? { label: 'Ready for our designers', className: 'bg-[#9FE870] text-[#1a3d0a]' }
      : card.submittedAt
        ? { label: 'In progress', className: 'bg-amber-100 text-amber-900' }
        : { label: 'Not started', className: 'bg-gray-100 text-gray-600' }

  return (
    <header className="flex flex-wrap items-start gap-x-5 gap-y-4 rounded-2xl border border-gray-200 bg-white px-6 py-5">
      <div className="h-[76px] w-[54px] shrink-0 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-200">
        {card.cardImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.cardImage} alt="" className="h-full w-full object-cover" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">{card.cardName}</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${status.className}`}
          >
            {status.label}
          </span>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-gray-500">
          {card.category && <span>{card.category}</span>}
          {card.category && <span aria-hidden>·</span>}
          <span>Order {card.orderRef}</span>
          {card.submittedAt && (
            <>
              <span aria-hidden>·</span>
              <span>
                Last sent{' '}
                {new Date(card.submittedAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </>
          )}
        </p>
      </div>

      <div className="w-full min-w-[200px] sm:w-auto sm:flex-1 sm:max-w-xs">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-gray-900">
            {complete ? 'Complete' : `${filled} of ${total} filled`}
          </span>
          <span className="text-sm font-semibold tabular-nums text-gray-500">{percent}%</span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${card.cardName} details filled in`}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              complete ? 'bg-[#9FE870]' : 'bg-[#7E5896]'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </header>
  )
}

function Banner({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'success' | 'warning'
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  const styles =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : 'border-amber-200 bg-amber-50 text-amber-900'
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-5 py-4 ${styles}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 text-sm leading-relaxed">
        <p className="font-semibold">{title}</p>
        {children}
      </div>
    </div>
  )
}

/**
 * The card, with what has been typed so far written into it.
 *
 * The artwork is fetched once (~2 MB) and kept in memory; every keystroke
 * re-renders locally rather than round-tripping to the server. The same routine
 * the designer's editor and the release freeze use, so what a couple sees here
 * cannot disagree with the card that gets made.
 */
function LivePreview({
  card,
  answers,
  token,
}: {
  card: CardDetailCard
  answers: Record<string, string>
  token?: string
}) {
  const [artwork, setArtwork] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  /**
   * The card's typefaces as an @font-face block.
   *
   * Kept out of renderCardSvg's input and concatenated once at the point the
   * Blob is built: the preview re-renders on every keystroke and this payload
   * never changes.
   */
  const [fontCss, setFontCss] = useState('')
  // Rendering a 2 MB string per character would be wasteful, and a quarter
  // second reads as instant.
  const [debounced, setDebounced] = useState(answers)
  const urlRef = useRef<string | null>(null)

  const query = token
    ? `token=${encodeURIComponent(token)}`
    : `order=${encodeURIComponent(card.orderId)}&line=${card.lineIndex}`

  useEffect(() => {
    if (!card.hasArtwork) return
    let cancelled = false
    fetch(`/api/card-preview/artwork?${query}`)
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error('no artwork'))))
      .then((svg) => {
        if (!cancelled) setArtwork(svg)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [card.hasArtwork, query])

  useEffect(() => {
    if (!card.hasArtwork) return
    let cancelled = false
    fetch(`/api/card-preview/fonts?${query}`)
      .then((response) => (response.ok ? response.text() : ''))
      .then((css) => {
        if (!cancelled) setFontCss(css)
      })
      // A preview in a fallback face is worse than a correct one but far better
      // than none, so this failure is not fatal.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [card.hasArtwork, query])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(answers), 250)
    return () => clearTimeout(timer)
  }, [answers])

  // Blob URL rather than a data URI: a 2 MB base64 string in the DOM is far
  // heavier. The previous URL is revoked so nothing accumulates.
  const previewUrl = useMemo(() => {
    if (!artwork) return null
    const { svg } = renderCardSvg(artwork, card.bindings, debounced)
    // The <img> renders the SVG as an isolated document, so the fonts have to
    // travel inside the file itself. Page CSS does not reach it.
    return URL.createObjectURL(new Blob([injectFontCss(svg, fontCss)], { type: 'image/svg+xml' }))
  }, [artwork, card.bindings, debounced, fontCss])

  useEffect(() => {
    const previous = urlRef.current
    urlRef.current = previewUrl
    if (previous && previous !== previewUrl) URL.revokeObjectURL(previous)
  }, [previewUrl])
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">
          {card.locked ? 'Your card' : 'Live preview'}
        </h3>
        {previewUrl && !card.locked && (
          <span className="text-[11px] text-gray-400">Updates as you type</span>
        )}
      </div>
      <div className="flex min-h-[180px] items-center justify-center bg-gray-50 p-5 lg:min-h-[300px]">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`${card.cardName} with your details`}
            className="max-h-[280px] w-auto max-w-full rounded-lg bg-white shadow-md ring-1 ring-gray-200 lg:max-h-[520px]"
          />
        ) : failed || !card.hasArtwork ? (
          // The catalogue hero, clearly labelled as the design they chose. It
          // is NOT their card, and showing it as if it were would be the one
          // thing this whole surface exists to prevent.
          <div className="text-center">
            {card.cardImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.cardImage}
                alt=""
                className="mx-auto h-44 w-auto rounded-lg opacity-70 shadow-sm"
              />
            )}
            <p className="mt-4 text-xs leading-relaxed text-gray-500">
              The design you chose. Our designers set your words onto it by hand, so there is no
              preview for this one yet.
            </p>
          </div>
        ) : (
          <span className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your card…
          </span>
        )}
      </div>
    </div>
  )
}

/** The facts about this card that are worth keeping in view while typing. */
function SummaryPanel({
  card,
  filled,
  total,
}: {
  card: CardDetailCard
  filled: number
  total: number
}) {
  const rows: [string, string][] = [['Order', card.orderRef], ['Filled in', `${filled} of ${total}`]]
  if (card.category) rows.unshift(['Card type', card.category])

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">This card</p>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-gray-500">{label}</dt>
            <dd className="min-w-0 truncate text-right font-medium text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
      {card.designId && (
        <Link
          href={`/my/dashboard/cards/${card.designId}`}
          className="mt-3 inline-flex items-center gap-1.5 border-t border-gray-100 pt-3 text-sm font-semibold text-[#7E5896] hover:underline"
        >
          Track this card
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  )
}

/** A hex colour must be exactly this, or the renderer refuses it. */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

// The EyeDropper API isn't in TypeScript's DOM lib yet. Chrome and Edge have
// it; Safari and Firefox don't, hence the feature check below.
type EyeDropperResult = { sRGBHex: string }
declare global {
  interface Window {
    EyeDropper?: new () => { open: () => Promise<EyeDropperResult> }
  }
}

/**
 * Whether this browser can sample a colour from the screen.
 *
 * Read through useSyncExternalStore rather than an effect so it is SSR-safe
 * (server snapshot is false) and doesn't set state during render.
 */
function useEyeDropperSupport(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => typeof window !== 'undefined' && typeof window.EyeDropper === 'function',
    () => false,
  )
}

/**
 * The card's colours, as swatches.
 *
 * Three ways in, because a couple arrives holding the colour in a different
 * form each time: the swatch opens the system picker for someone choosing from
 * scratch, the hex box takes a code their planner or florist gave them, and the
 * dropper lifts a colour off anything already on screen, including their own
 * card in the preview beside this. The same three the designer's editor offers,
 * so a colour agreed on one side can be matched exactly on the other.
 */
function ColourRow({
  cardKey,
  roles,
  answers,
  disabled,
  onChange,
}: {
  cardKey: string
  roles: string[]
  answers: Record<string, string>
  disabled: boolean
  onChange: (role: string, value: string) => void
}) {
  const canSample = useEyeDropperSupport()

  async function sample(role: string) {
    const EyeDropperCtor = window.EyeDropper
    if (!EyeDropperCtor) return
    try {
      const { sRGBHex } = await new EyeDropperCtor().open()
      onChange(role, sRGBHex.toUpperCase())
    } catch {
      // Closing the picker with Escape rejects. That's a cancel, not an error.
    }
  }

  return (
    // An even grid of tiles rather than free-wrapping swatches. Five colours
    // flowing loose left a stranded fifth under a gap, and a bare circle with
    // an unset colour is white on white: the tile is what makes an empty slot
    // visible as a slot.
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {roles.map((role) => {
        const copy = cardFieldCopy(role)
        const id = `f-${cardKey}-${role}`
        const value = (answers[role] ?? '').trim()
        const valid = HEX.test(value)
        const wrong = value !== '' && !valid

        return (
          <div
            key={role}
            className="flex items-center gap-3 rounded-xl border border-gray-200 p-3"
          >
            <input
              type="color"
              id={`${id}-swatch`}
              aria-label={`Pick ${copy.label}`}
              // A native colour input has no empty state, so an unchosen swatch
              // would sit white on white. The dashed ring says "not yet" where
              // the colour itself cannot.
              value={valid ? value : '#ffffff'}
              disabled={disabled}
              onChange={(e) => onChange(role, e.target.value.toUpperCase())}
              className={`h-11 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-transparent p-0 disabled:cursor-not-allowed [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 ${
                valid
                  ? 'border-0 ring-1 ring-inset ring-black/10'
                  : 'border-2 border-dashed border-gray-300'
              }`}
            />

            <div className="min-w-0 flex-1">
              <label htmlFor={id} className="block text-[13px] font-medium text-gray-900">
                {copy.label}
              </label>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  id={id}
                  value={value}
                  placeholder={copy.example || '#000000'}
                  disabled={disabled}
                  spellCheck={false}
                  aria-invalid={wrong}
                  // Normalise as they type: accept a pasted code with or
                  // without the hash rather than rejecting it.
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    onChange(role, (raw && !raw.startsWith('#') ? `#${raw}` : raw).toUpperCase())
                  }}
                  className={`w-full min-w-0 rounded-md border px-2 py-1 font-mono text-[11px] uppercase focus:outline-none focus:ring-2 disabled:bg-gray-50 ${
                    wrong
                      ? 'border-red-300 text-red-700 focus:ring-red-200'
                      : 'border-gray-200 text-gray-600 placeholder:text-gray-300 focus:ring-[#C9A0DC]'
                  }`}
                />
                {canSample && (
                  <button data-opus-button="control"
                    type="button"
                    onClick={() => sample(role)}
                    disabled={disabled}
                    title="Pick this colour from anywhere on screen, including your card"
                    aria-label={`Sample ${copy.label} from the screen`}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-[#7E5896] disabled:opacity-50"
                  >
                    <Pipette className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {wrong && (
                <span className="mt-1 block text-[11px] font-medium text-red-600">
                  Needs a hex code
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Field({
  cardKey,
  role,
  requested,
  value,
  disabled,
  onChange,
}: {
  cardKey: string
  role: string
  requested: boolean
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const copy = cardFieldCopy(role)
  const id = `f-${cardKey}-${role}`
  const hintId = `h-${cardKey}-${role}`

  return (
    // A column with the box at the bottom, so fields sharing a row line up
    // however uneven their hints are: Day, Month and Year are one answer, and
    // three boxes at three different heights do not read as one.
    <div className="flex h-full flex-col">
      <label htmlFor={id} className="mb-1.5 block">
        <span className="text-[15px] font-medium text-gray-900">{copy.label}</span>
        {requested && (
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            Asked for
          </span>
        )}
        {/* Always visible: this form is filled once, by someone who has not
            been trained on it, and a wrong answer is printed on every card. */}
        {copy.hint && (
          <span id={hintId} className="mt-1 block text-[13px] leading-snug text-gray-500">
            {copy.hint}
          </span>
        )}
      </label>

      <input
        id={id}
        aria-describedby={copy.hint ? hintId : undefined}
        value={value}
        placeholder={copy.example}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-auto w-full rounded-lg border border-gray-200 px-3 py-2.5 text-[15px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] disabled:bg-gray-50 disabled:text-gray-500"
      />
    </div>
  )
}
