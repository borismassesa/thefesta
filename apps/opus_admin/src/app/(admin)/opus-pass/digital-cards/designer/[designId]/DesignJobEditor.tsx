'use client'

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from 'react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Calendar, Check, Copy, Loader2, MessageCircle, Pipette, Mail, Phone, Printer, Receipt, Save, Send, X } from 'lucide-react'

import { useSetPageHeading } from '@/components/PageHeading'
import { injectFontCss, renderCardSvg, type CardFieldBinding } from '@opusfesta/lib'
import {
  approveAndRelease,
  markDelivered,
  requestChanges,
  requestDesignInfo,
  saveAndPublishReleasedDesign,
  saveDesignFieldValues,
  setDesignAssignee,
  submitForReview,
} from '../actions'
import { DESIGN_STATUS_LABELS } from '../types'

const LIST = '/opus-pass/digital-cards/designer'

/** One entry in a job's history, newest first. */
export type DesignEvent = {
  id: string
  kind: 'system' | 'note'
  author: string
  body: string
  from_status: string | null
  to_status: string | null
  created_at: string
}

export type EditorField = {
  key: string
  label: string
  group: string
  kind: string
  /** What belongs in the field — revealed by the ⓘ toggle. */
  hint: string | null
  /** Real example, used as the input placeholder. */
  example: string | null
  layerIds: string[]
  blockedReason: 'rasterised' | 'unmapped' | null
}

export default function DesignJobEditor({
  designId,
  productId,
  productName,
  cardImage,
  orderRef,
  coupleName,
  coupleEmail,
  couplePhone,
  eventDate,
  digitalQty,
  printQty,
  status,
  fields,
  values,
  requested,
  infoRequestedAt,
  infoReceivedAt,
  shareToken,
  opusPassUrl,
  bindings,
  cardIsMapped,
  canWrite,
  canPublish,
  reviewNote,
  reviewedBy,
  submittedBy,
  submittedForReviewAt,
  releasedAt,
  changeRequestedAt,
  isAssignee,
  assignedTo,
  assigneeName,
  assignableDesigners,
  myEmployeeId,
  events,
}: {
  designId: string
  productId: string
  productName: string
  cardImage: string | null
  orderRef: string
  coupleName: string | null
  coupleEmail: string | null
  couplePhone: string | null
  eventDate: string | null
  digitalQty: number
  printQty: number
  status: string
  fields: EditorField[]
  values: Record<string, string>
  requested: string[]
  infoRequestedAt: string | null
  infoReceivedAt: string | null
  shareToken: string | null
  opusPassUrl: string
  bindings: CardFieldBinding[]
  cardIsMapped: boolean
  canWrite: boolean
  /** May release a card to the couple. See the review gate in ../actions.ts. */
  canPublish: boolean
  reviewNote: string
  reviewedBy: string
  submittedBy: string
  submittedForReviewAt: string | null
  releasedAt: string | null
  /** Set when the couple has asked for a correction to the released card. */
  changeRequestedAt: string | null
  /** The caller is assigned to this job, so they may not approve their own work. */
  isAssignee: boolean
  /** workforce_employees.id of the current holder, or null if unassigned. */
  assignedTo: string | null
  assigneeName: string | null
  /** Everyone with dashboard access, for the reassignment picker. */
  assignableDesigners: { id: string; name: string }[]
  /** Null when the caller has no employee row, so nothing can be theirs. */
  myEmployeeId: string | null
  events: DesignEvent[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  /**
   * Kept apart from `message`, which is a one-line "Saved." that shares a row
   * with three buttons and therefore truncates. A warning means the action
   * worked but handed a job back to the operator, and those run long: the
   * delivered-card notice alone is over a hundred characters. Rendering it
   * through the same truncating span would clip away the part that says what
   * to do next.
   */
  const [warning, setWarning] = useState<string | null>(null)

  const [draft, setDraft] = useState<Record<string, string>>(values)

  // The artwork is fetched once (it's ~2 MB) and kept in memory; every
  // keystroke re-renders locally instead of round-tripping to the server.
  const [artwork, setArtwork] = useState<string | null>(null)
  const [artworkError, setArtworkError] = useState<string | null>(null)
  /**
   * The card's typefaces as an @font-face block.
   *
   * Fetched separately from the artwork and kept out of renderCardSvg's input:
   * the preview re-renders on every keystroke, and the font payload never
   * changes, so it is concatenated once at the point the Blob is built.
   */
  const [fontCss, setFontCss] = useState('')

  // Debounced copy of the draft — rendering a 2 MB string on every character
  // would be wasteful, and a quarter second reads as instant.
  const [debouncedDraft, setDebouncedDraft] = useState(draft)
  const [asking, setAsking] = useState<Set<string>>(() => new Set(requested))

  useSetPageHeading({
    title: productName,
    back: { href: LIST, label: 'Personalisation Queue' },
  })

  useEffect(() => {
    if (!cardIsMapped) return
    let cancelled = false
    fetch(`${LIST}/${designId}/artwork`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text())
        return response.text()
      })
      .then((svg) => {
        if (!cancelled) setArtwork(svg)
      })
      .catch((err: unknown) => {
        if (!cancelled) setArtworkError(err instanceof Error ? err.message : 'Could not load artwork.')
      })
    return () => {
      cancelled = true
    }
  }, [designId, cardIsMapped])

  useEffect(() => {
    if (!cardIsMapped) return
    let cancelled = false
    fetch(`${LIST}/${designId}/artwork/fonts`)
      .then((response) => (response.ok ? response.text() : ''))
      .then((css) => {
        if (!cancelled) setFontCss(css)
      })
      // A card that renders in a fallback face is worse than one that does not,
      // but it is still better than no preview, so this failure is not fatal.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [designId, cardIsMapped])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedDraft(draft), 250)
    return () => clearTimeout(timer)
  }, [draft])

  // Rendered card + which fields actually made it onto it.
  const preview = useMemo(() => {
    if (!artwork) return null
    return renderCardSvg(artwork, bindings, debouncedDraft)
  }, [artwork, bindings, debouncedDraft])

  // Blob URL rather than a data URI: a 2 MB base64 string in the DOM is far
  // heavier, and the previous URL is revoked so nothing accumulates.
  const previewUrl = useMemo(() => {
    if (!preview) return null
    // The <img> below renders the SVG as an isolated document, so the fonts
    // have to travel inside the file itself. Page CSS does not reach it.
    const withFonts = injectFontCss(preview.svg, fontCss)
    return URL.createObjectURL(new Blob([withFonts], { type: 'image/svg+xml' }))
  }, [preview, fontCss])
  // Derived above rather than set in an effect; the effect exists only to hand
  // the old URL back when it's replaced, so nothing accumulates.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const groups = useMemo(() => {
    const byGroup = new Map<string, EditorField[]>()
    for (const field of fields) {
      const list = byGroup.get(field.group) ?? []
      list.push(field)
      byGroup.set(field.group, list)
    }
    return [...byGroup.entries()]
  }, [fields])

  const answered = fields.filter((f) => (draft[f.key] ?? '').trim()).length
  const complete = fields.length > 0 && answered === fields.length

  /**
   * Roles whose saved binding names a layer this artwork doesn't have.
   *
   * The stored `rasterised` flag is a claim about the export the card was
   * mapped against, not about the file we just loaded. When artwork is
   * re-exported and not re-mapped, that stale flag makes the editor tell a
   * designer their layers are still bitmaps and to go re-export — work they
   * have already done. Trust the render over the flag.
   */
  const staleRoles = useMemo(
    () => new Set((preview?.skipped ?? []).filter((s) => s.reason === 'layer_missing').map((s) => s.role)),
    [preview],
  )
  const stale = fields.filter((f) => staleRoles.has(f.key))
  // Only fields the CURRENT artwork really bakes in are blocked.
  const blocked = fields.filter((f) => f.blockedReason === 'rasterised' && !staleRoles.has(f.key))

  function run(
    fn: () => Promise<{ ok: true; warning?: string } | { ok: false; error: string }>,
    ok: string,
  ) {
    setError(null)
    setMessage(null)
    setWarning(null)
    startTransition(async () => {
      try {
        const result = await fn()
        if (!result.ok) setError(result.error)
        else {
          // A warning means the action worked but left something for a human to
          // pick up. It gets its own banner rather than the success line, which
          // was discarding warnings entirely before this.
          if (result.warning) setWarning(result.warning)
          else setMessage(ok)
          router.refresh()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  /**
   * The stage, and the one or two moves available from it.
   *
   * This used to be a dropdown of every status, which is why the review step
   * meant nothing: a designer could pick "Ready" for their own work. Now the
   * screen offers only the transition the caller is actually entitled to make,
   * and the server refuses anything else regardless of what the UI shows.
   */
  const canApproveThis = canPublish && !isAssignee
  const isReleased = status === 'ready' || status === 'delivered'
  const canPublishReleasedUpdate = isReleased && canApproveThis
  /**
   * Republishing is not free: it supersedes the release the couple is holding
   * and, for a delivered card, walks their order tracker back a stage. The
   * draft starts out equal to what is stored, so the ordinary "save my place"
   * click would otherwise cut a whole new release for no change at all.
   *
   * This asks for confirmation rather than disabling the button, because a
   * no-change republish is sometimes exactly what is wanted: to pick up
   * re-exported artwork, or to retry after a publish that failed AFTER the
   * values were committed, which leaves the draft matching the row with the
   * release still stale. Disabling would strand both.
   */
  const hasEdits = useMemo(() => {
    const roles = new Set([...Object.keys(values), ...Object.keys(draft)])
    return [...roles].some((role) => (values[role] ?? '').trim() !== (draft[role] ?? '').trim())
  }, [values, draft])
  const statusLabel =
    DESIGN_STATUS_LABELS[status as keyof typeof DESIGN_STATUS_LABELS] ?? status.replace(/_/g, ' ')

  const statusControl = (
    <div className="space-y-1.5">
      <p
        className={`text-sm font-bold ${
          status === 'ready' || status === 'delivered'
            ? 'text-emerald-700'
            : status === 'in_review'
              ? 'text-[#7E5896]'
              : 'text-gray-900'
        }`}
      >
        {statusLabel}
      </p>

      {status === 'in_design' && canWrite && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => submitForReview(designId), 'Sent for review. A reviewer has been emailed.')
          }
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#6b4a80] disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          Submit for review
        </button>
      )}

      {status === 'in_review' && (
        <>
          {canApproveThis ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => approveAndRelease(designId),
                    'Approved. The card is now on the couple’s dashboard.',
                  )
                }
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Approve &amp; release
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const note = window.prompt('What needs changing?')
                  if (note?.trim()) run(() => requestChanges(designId, note), 'Sent back to design.')
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Send back
              </button>
            </>
          ) : (
            <p className="text-[11px] leading-relaxed text-gray-500">
              {isAssignee
                ? 'You designed this card, so someone else has to approve it.'
                : 'Waiting on someone who can release cards.'}
            </p>
          )}
        </>
      )}

      {status === 'ready' && canWrite && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => markDelivered(designId), 'Marked delivered.')}
          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          Mark delivered
        </button>
      )}

      {releasedAt && (
        <p className="text-[11px] text-gray-400">
          Released {new Date(releasedAt).toLocaleDateString()}
          {reviewedBy ? ` by ${reviewedBy}` : ''}
        </p>
      )}
      {status === 'in_review' && submittedForReviewAt && (
        <p className="text-[11px] text-gray-400">
          Submitted {new Date(submittedForReviewAt).toLocaleDateString()}
          {submittedBy ? ` by ${submittedBy}` : ''}
        </p>
      )}

      {/* Ownership sits with the status because the two decide each other:
          whoever holds this card is the one person who cannot approve it. */}
      <div className="border-t border-gray-100 pt-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Assigned to
        </p>
        {canWrite ? (
          <select
            value={assignedTo ?? ''}
            disabled={pending}
            onChange={(event) => {
              const next = event.target.value || null
              if (next === (assignedTo ?? null)) return
              run(
                () => setDesignAssignee(designId, next),
                next ? 'Assigned.' : 'Released back to the queue.',
              )
            }}
            className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-800 disabled:opacity-50"
          >
            <option value="">Nobody (back to the queue)</option>
            {assignableDesigners.map((person) => (
              <option key={person.id} value={person.id}>
                {person.id === myEmployeeId ? `${person.name} (you)` : person.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-0.5 text-xs font-medium text-gray-700">
            {assigneeName ?? 'Nobody'}
          </p>
        )}
        {isAssignee && (
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
            This card is yours, so another publisher has to release it.
          </p>
        )}
      </div>
    </div>
  )

  if (!cardIsMapped) {
    return (
      <div className="px-8 py-6 space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white p-4">
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{coupleName ?? 'Unnamed couple'}</p>
            {/* Same link as the mapped header below. A job blocked on its
                artwork is exactly when someone asks "was this even paid for",
                so the route to the order matters here at least as much. */}
            <Link
              href={`/finance/orders?q=${encodeURIComponent(orderRef)}`}
              className="text-xs text-gray-500 hover:text-[#7E5896] hover:underline"
              title="Open this order in Orders & Fulfilment"
            >
              <span className="font-mono">{orderRef}</span>
            </Link>
          </div>
          {statusControl}
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-amber-900">
                This card has no field mapping yet
              </h2>
              <p className="text-sm text-amber-800">
                <strong>{productName}</strong> hasn&apos;t had its artwork layers matched to card
                fields, so there is nothing to ask the couple for. Map it on the card&apos;s
                Artwork &amp; fields tab first.
              </p>
              {/* Straight to THIS card's artwork tab. This used to point at
                  /templates, which is now a redirect to the catalogue list, so
                  a designer following it landed on every card rather than the
                  one blocking them and had to find it again by name. */}
              <Link
                href={`/opus-pass/digital-cards/cards/${productId}/artwork`}
                className="inline-flex rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
              >
                Map this card&apos;s artwork
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-8 py-6">
      <div className="min-w-0 space-y-5">
        {/*
          The job header, in three zones that each earn their width.

          It used to be identity on the left and a few lines of small grey text
          on the right, with a wide dead band between them. The number that
          actually drives the work, how much the couple has told us, was the
          smallest thing on the row. Now it is a labelled bar in the middle,
          and the zones are sized so nothing has to stretch to fill a gap.
        */}
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-stretch">
            {/* Who, and what they bought. */}
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="h-24 w-[68px] shrink-0 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-200">
                {cardImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cardImage} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-gray-900">
                  {coupleName ?? 'Unnamed couple'}
                </p>
                {/* The card name was only ever in the page heading, so the
                    thumbnail sat there unexplained.

                    Now also the way BACK to the catalogue entry. A designer
                    working a job constantly needs the card behind it — its
                    artwork, its layer mapping, its fonts — and there was no
                    link in either direction between a job and the card it is
                    personalising. The only route was the catalogue list and a
                    search by name. */}
                <Link
                  href={`/opus-pass/digital-cards/cards/${productId}`}
                  className="mt-0.5 block truncate text-sm text-gray-500 hover:text-[#7E5896] hover:underline"
                  title="Open this card in the catalogue"
                >
                  {productName}
                </Link>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Pill icon={<Mail className="h-3 w-3" />}>
                    {digitalQty.toLocaleString('en-US')} digital
                  </Pill>
                  {printQty > 0 && (
                    <Pill icon={<Printer className="h-3 w-3" />}>
                      {printQty.toLocaleString('en-US')} printed
                    </Pill>
                  )}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  {/* The order is where the money and the fulfilment stage
                      live. A designer asking "has this been paid for" or "why
                      is the couple's tracker showing that" had no route to it
                      from here except retyping the reference into Finance. */}
                  <Link
                    href={`/finance/orders?q=${encodeURIComponent(orderRef)}`}
                    className="flex items-center gap-1.5 hover:text-[#7E5896] hover:underline"
                    title="Open this order in Orders & Fulfilment"
                  >
                    <Receipt className="h-3 w-3 shrink-0 text-gray-400" />
                    <span className="font-mono">{orderRef}</span>
                  </Link>
                  {eventDate && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3 w-3 shrink-0 text-gray-400" />
                      {eventDate}
                    </span>
                  )}
                  {coupleEmail && (
                    <a
                      href={`mailto:${coupleEmail}`}
                      className="flex items-center gap-1.5 hover:text-[#7E5896] hover:underline"
                    >
                      <Mail className="h-3 w-3 shrink-0 text-gray-400" />
                      {coupleEmail}
                    </a>
                  )}
                  {couplePhone && (
                    <a
                      href={`tel:${couplePhone}`}
                      className="flex items-center gap-1.5 hover:text-[#7E5896] hover:underline"
                    >
                      <Phone className="h-3 w-3 shrink-0 text-gray-400" />
                      {couplePhone}
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* What the couple has told us. The reason this screen is open. */}
            <div className="shrink-0 border-gray-100 lg:w-56 lg:border-l lg:pl-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Their details
              </p>
              <p className="mt-1 text-2xl font-bold leading-none text-gray-900">
                {answered}
                <span className="text-base font-semibold text-gray-400"> / {fields.length}</span>
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full transition-all ${
                    complete ? 'bg-[#9FE870]' : 'bg-amber-400'
                  }`}
                  style={{ width: `${fields.length ? (answered / fields.length) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-2 text-xs">
                {complete ? (
                  <span className="font-medium text-emerald-700">
                    {infoReceivedAt
                      ? `Answered ${new Date(infoReceivedAt).toLocaleDateString()}`
                      : 'Everything filled in'}
                  </span>
                ) : infoRequestedAt && !infoReceivedAt ? (
                  <span className="font-medium text-amber-700">
                    Asked {new Date(infoRequestedAt).toLocaleDateString()}, still waiting
                  </span>
                ) : (
                  <span className="text-gray-500">
                    {fields.length - answered} still to collect
                  </span>
                )}
              </p>
            </div>

            {/* Where the job is up to. */}
            <div className="shrink-0 border-gray-100 lg:w-44 lg:border-l lg:pl-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Stage</p>
              <div className="mt-1.5">{statusControl}</div>
            </div>
          </div>
        </div>

        {/* The trail that answers "who approved this, and when". Statuses alone
            cannot: a job sent back twice then approved looks identical to one
            approved first time. */}
        {events.length > 0 && (
          <details className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <summary className="cursor-pointer list-none px-5 py-3 text-sm font-bold text-gray-900">
              History
              <span className="ml-1.5 font-normal text-gray-400">({events.length})</span>
            </summary>
            <ul className="divide-y divide-gray-50 border-t border-gray-100">
              {events.map((event) => (
                <li key={event.id} className="flex items-start gap-3 px-5 py-2.5 text-xs">
                  <span className="w-28 shrink-0 text-gray-400">
                    {new Date(event.created_at).toLocaleDateString()}
                  </span>
                  <span className="min-w-0 flex-1 text-gray-700">
                    {event.body}
                    {event.from_status && event.to_status && (
                      <span className="text-gray-400">
                        {' '}
                        ({event.from_status.replace(/_/g, ' ')} &rarr;{' '}
                        {event.to_status.replace(/_/g, ' ')})
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-gray-400">{event.author}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {shareToken && requested.length > 0 && (
          <SharePanel
            url={`${opusPassUrl}/card-details/${shareToken}`}
            coupleName={coupleName}
            couplePhone={couplePhone}
            cardName={productName}
            fieldCount={requested.length}
          />
        )}

        {/* Form left, card right. The preview is sticky so it stays in view
            while the fields below it scroll — the point of a live preview is
            watching the card change as you type. */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 space-y-5">
        {/* Why the card came back. On the row as well as in the history,
            because a designer reopening the job must not have to go looking. */}
        {status === 'in_design' && reviewNote && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-900">
                Sent back{reviewedBy ? ` by ${reviewedBy}` : ''}
              </p>
              <p className="mt-0.5 whitespace-pre-line text-sm text-amber-800">{reviewNote}</p>
            </div>
          </div>
        )}

        {/* The couple has told us a card they already have is wrong.
            Loud, and above everything else on the job, because the status still
            reads Ready or Delivered — the release is deliberately untouched, so
            nothing else on this page says anything is outstanding. Their exact
            words are the newest entry in the history below. */}
        {changeRequestedAt && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-rose-900">
                The couple asked for a change on{' '}
                {new Date(changeRequestedAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
              <p className="mt-0.5 text-sm text-rose-800">
                Their words are in the history below. Guests still have the released card. Correct
                the values and publish an update to replace the couple&apos;s copy, which is what
                clears this notice.
              </p>
            </div>
          </div>
        )}

        {stale.length > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <p className="text-sm text-blue-800">
              This card&apos;s layer mapping is out of date. The artwork has been re-exported since
              it was mapped, so {stale.length} field{stale.length === 1 ? '' : 's'} (
              {stale.map((f) => f.label).join(', ')}) point at layers the file no longer has and
              will not appear on the card. Nothing needs re-exporting.{' '}
              <Link
                href={`/opus-pass/digital-cards/cards/${productId}/artwork`}
                className="font-semibold underline underline-offset-2"
              >
                Open this card’s artwork setup
              </Link>
              , click Match by name, then Save mapping.
            </p>
          </div>
        )}

        {blocked.length > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              {blocked.length} field{blocked.length === 1 ? ' is' : 's are'} baked into the artwork
              as images ({blocked.map((f) => f.label).join(', ')}). You can still record the
              couple&apos;s answer and it is saved, but it will not appear on the preview or the
              finished card until the artwork is re-exported with those layers as text.
            </p>
          </div>
        )}

        {groups.map(([group, groupFields]) => (
          <section
            key={group}
            className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]"
          >
            <div className="border-b border-gray-100 px-5 py-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">{group}</h3>
            </div>

            <div className="divide-y divide-gray-50">
              {groupFields.map((field) => {
                const outstanding = requested.includes(field.key) && !(draft[field.key] ?? '').trim()
                const staleField = staleRoles.has(field.key)
                const blockedField = field.blockedReason === 'rasterised' && !staleField
                return (
                  <div
                    key={field.key}
                    // Label and input side by side rather than stacked in a
                    // table cell: two lines per field instead of four, and the
                    // inputs share one alignment down the whole form.
                    className="grid grid-cols-[minmax(0,260px)_1fr] items-start gap-4 px-5 py-3"
                  >
                    <div className="min-w-0 pt-1.5">
                      <label
                        htmlFor={`f-${field.key}`}
                        className="block text-sm font-medium text-gray-900"
                      >
                        {field.label}
                      </label>
                      {/* Hint and example on one muted line — the example is
                          the most useful half, so it rides along rather than
                          taking a row of its own. */}
                      {(field.hint || field.example) && (
                        <p id={`hint-${field.key}`} className="mt-0.5 text-[11px] leading-snug text-gray-500">
                          {field.hint}
                          {field.example && (
                            <span className="text-gray-400">
                              {field.hint ? ' ' : ''}e.g. {field.example}
                            </span>
                          )}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {staleField && (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-800">
                            <AlertTriangle className="h-3 w-3" />
                            Needs re-mapping
                          </span>
                        )}
                        {blockedField && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                            <AlertTriangle className="h-3 w-3" />
                            Won&apos;t show on card
                          </span>
                        )}
                        {outstanding && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            Waiting on couple
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {field.kind === 'colour' ? (
                        <ColourField
                          id={`f-${field.key}`}
                          describedBy={field.hint || field.example ? `hint-${field.key}` : undefined}
                          value={draft[field.key] ?? ''}
                          disabled={!canWrite}
                          onChange={(next) => setDraft((prev) => ({ ...prev, [field.key]: next }))}
                        />
                      ) : (
                        <input
                          id={`f-${field.key}`}
                          aria-describedby={field.hint || field.example ? `hint-${field.key}` : undefined}
                          value={draft[field.key] ?? ''}
                          disabled={!canWrite}
                          onChange={(e) => setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))}
                          placeholder={field.example ?? ''}
                          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] disabled:bg-gray-50"
                        />
                      )}
                      {canWrite && (
                        <label
                          className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-gray-500"
                          title={`Ask the couple for ${field.label}`}
                        >
                          <input
                            type="checkbox"
                            checked={asking.has(field.key)}
                            onChange={(e) =>
                              setAsking((prev) => {
                                const next = new Set(prev)
                                if (e.target.checked) next.add(field.key)
                                else next.delete(field.key)
                                return next
                              })
                            }
                            className="h-3.5 w-3.5 rounded border-gray-300 text-[#7E5896] focus:ring-[#C9A0DC]"
                          />
                          Ask
                        </label>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
          </div>

          <div className="min-w-0">
            <section className="sticky top-4 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
              <div className="border-b border-gray-100 px-4 py-2.5">
                <h3 className="text-sm font-bold text-gray-900">Live preview</h3>
              </div>
              <div className="flex min-h-[320px] items-center justify-center bg-gray-50 p-6">
                {artworkError ? (
                  <p className="text-sm text-amber-800">{artworkError}</p>
                ) : previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt={`${productName} with the couple's details`}
                    className="max-h-[520px] w-auto rounded-lg shadow-md ring-1 ring-gray-200"
                  />
                ) : (
                  <span className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading artwork…
                  </span>
                )}
              </div>
            </section>
          </div>
        </div>

        {canWrite && (
          <div className="sticky bottom-0 z-10 -mx-8 mt-6 border-t border-gray-200 bg-white/95 px-8 py-3 backdrop-blur">
            {warning && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>{warning}</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Link
                href={LIST}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:border-red-400 hover:bg-red-50"
              >
                <X className="h-4 w-4" />
                Cancel
              </Link>
              {error ? (
                <span className="min-w-0 truncate text-xs font-medium text-red-600" title={error}>
                  {error}
                </span>
              ) : (
                message && (
                  <span className="min-w-0 truncate text-xs text-gray-500" title={message}>
                    {message}
                  </span>
                )
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => requestDesignInfo(designId, [...asking]),
                    asking.size > 0
                      ? `Asked the couple for ${asking.size} field${asking.size === 1 ? '' : 's'}.`
                      : isReleased
                        ? 'Cleared the request. This card stays released.'
                        : 'Nothing outstanding. This job is now in design.',
                  )
                }
                title={
                  asking.size > 0
                    ? 'Send the couple a link asking for the ticked fields.'
                    : isReleased
                      ? 'Clears the outstanding request. A released card keeps its stage.'
                      : 'Nothing is ticked, so this stops waiting on the couple and moves the job to In design.'
                }
                className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                {asking.size > 0 ? <Send className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                {asking.size > 0
                  ? `Request ${asking.size} field${asking.size === 1 ? '' : 's'}`
                  : isReleased
                    ? 'Clear the request'
                    : 'Nothing to ask, start designing'}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!canPublishReleasedUpdate) {
                    run(
                      () => saveDesignFieldValues(designId, draft),
                      isReleased
                        ? 'Saved internally. A publisher still needs to publish this card update.'
                        : 'Saved.',
                    )
                    return
                  }
                  if (
                    !hasEdits &&
                    !confirm(
                      'No values have changed. Publishing anyway cuts a new release from the current artwork and supersedes the copy the couple already has. Continue?',
                    )
                  ) {
                    return
                  }
                  run(
                    () => saveAndPublishReleasedDesign(designId, draft),
                    'Published. OpusPass now uses this updated card.',
                  )
                }}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#7E5896] px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#6b4a80] disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {canPublishReleasedUpdate ? 'Save & publish update' : 'Save values'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The link a couple actually fills in, and the quickest way to get it to them.
 *
 * The WhatsApp button is a wa.me deep link, not the Business API: it opens
 * WhatsApp on the staff member's own device with the message ready to send. An
 * automated business-initiated send would need a Meta-approved template whose
 * button URL is fixed at approval time, so this works today and the template
 * path can replace it later without changing the link or the page.
 */
function SharePanel({
  url,
  coupleName,
  couplePhone,
  cardName,
  fieldCount,
}: {
  url: string
  coupleName: string | null
  couplePhone: string | null
  cardName: string
  fieldCount: number
}) {
  const [copied, setCopied] = useState(false)

  const message = `Hello${coupleName ? ` ${coupleName.split(' ')[0]}` : ''}! We're designing your ${cardName}. Please fill in ${fieldCount} detail${fieldCount === 1 ? '' : 's'} for your card here: ${url}`
  // wa.me wants digits only.
  const digits = (couplePhone ?? '').replace(/\D/g, '')
  const waHref = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`

  return (
    <section className="rounded-2xl border border-[#E3D2F2] bg-[#FCF7FF] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#5d3a78]">
            Link for the couple
          </p>
          <p className="mt-0.5 text-xs text-[#6B4E8C]">
            Opens without signing in. Anyone with the link can fill it in, so send it only to the
            couple.
          </p>
          <input
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-2 w-full rounded-lg border border-[#E3D2F2] bg-white px-3 py-1.5 font-mono text-[11px] text-gray-700"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2 self-end">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(url).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              })
            }}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
          {digits ? (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1da851]"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Send on WhatsApp
            </a>
          ) : (
            <span className="text-xs text-gray-400" title="This order has no phone number">
              No phone on file
            </span>
          )}
        </div>
      </div>
    </section>
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
 * Swatch and hex box, kept in step.
 *
 * Both because neither alone is enough: the picker is quicker for choosing,
 * but a couple's palette usually arrives as hex codes from their planner or
 * florist, and re-picking those by eye would lose the exact colour. Typing is
 * free-form while in progress (you can't type "#7A1F2B" without passing
 * through "#7A1"), so the swatch only follows once the value is valid.
 */
function ColourField({
  id,
  value,
  disabled,
  onChange,
  describedBy,
}: {
  id: string
  value: string
  disabled: boolean
  onChange: (next: string) => void
  describedBy?: string
}) {
  const trimmed = value.trim()
  const valid = HEX.test(trimmed)
  const empty = trimmed === ''
  const canSample = useEyeDropperSupport()

  async function sample() {
    const EyeDropperCtor = window.EyeDropper
    if (!EyeDropperCtor) return
    try {
      const { sRGBHex } = await new EyeDropperCtor().open()
      onChange(sRGBHex.toUpperCase())
    } catch {
      // Closing the picker with Escape rejects. That's a cancel, not an error.
    }
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input
        type="color"
        aria-label="Pick a colour"
        // A native colour input has no empty state, so an unchosen swatch
        // shows white rather than implying black was picked.
        value={valid ? trimmed : '#ffffff'}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-gray-200 bg-white p-1 disabled:opacity-50"
      />
      <input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={!empty && !valid}
        value={trimmed}
        disabled={disabled}
        // Normalise as they type: accept a pasted code with or without the
        // hash rather than rejecting it.
        onChange={(e) => {
          const raw = e.target.value.trim()
          const next = raw && !raw.startsWith('#') ? `#${raw}` : raw
          onChange(next.toUpperCase())
        }}
        placeholder="#7A1F2B"
        spellCheck={false}
        className={cn(
          'w-28 shrink-0 rounded-lg border bg-white px-3 py-2 font-mono text-sm uppercase focus:outline-none focus:ring-2 disabled:bg-gray-50',
          !empty && !valid
            ? 'border-red-300 text-red-700 focus:ring-red-200'
            : 'border-gray-200 text-gray-900 placeholder:text-gray-300 focus:ring-[#C9A0DC]',
        )}
      />
      {canSample && (
        <button
          type="button"
          onClick={sample}
          disabled={disabled}
          title="Pick a colour from anywhere on screen, including the preview"
          aria-label="Sample a colour from the screen"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-[#7E5896] disabled:opacity-50"
        >
          <Pipette className="h-4 w-4" />
        </button>
      )}
      {!empty && !valid && (
        <span className="shrink-0 text-[11px] font-medium text-red-600">Needs a hex code</span>
      )}
      <span className="flex-1" />
    </div>
  )
}

function Pill({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#9FE870] px-2 py-0.5 text-[11px] font-semibold text-[#1a3d0a]">
      {icon}
      {children}
    </span>
  )
}
