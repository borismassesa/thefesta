'use client'

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from 'react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Copy, Loader2, MessageCircle, Pipette, Mail, Phone, Printer, Receipt, Save, Send, X } from 'lucide-react'

import { useSetPageHeading } from '@/components/PageHeading'
import { renderCardSvg } from '@/lib/cms/card-render'
import type { CardFieldBinding } from '@/lib/cms/card-field-roles'
import { requestDesignInfo, saveDesignFieldValues, setDesignStatus } from '../actions'
import { DESIGN_STATUSES, DESIGN_STATUS_LABELS } from '../types'

const LIST = '/opus-pass/digital-cards/designer'

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
}: {
  designId: string
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
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [draft, setDraft] = useState<Record<string, string>>(values)

  // The artwork is fetched once (it's ~2 MB) and kept in memory; every
  // keystroke re-renders locally instead of round-tripping to the server.
  const [artwork, setArtwork] = useState<string | null>(null)
  const [artworkError, setArtworkError] = useState<string | null>(null)

  // Debounced copy of the draft — rendering a 2 MB string on every character
  // would be wasteful, and a quarter second reads as instant.
  const [debouncedDraft, setDebouncedDraft] = useState(draft)
  const [asking, setAsking] = useState<Set<string>>(() => new Set(requested))

  useSetPageHeading({
    title: productName,
    back: { href: LIST, label: 'Card Designer' },
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
  const previewUrl = useMemo(
    () =>
      preview ? URL.createObjectURL(new Blob([preview.svg], { type: 'image/svg+xml' })) : null,
    [preview],
  )
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
  const blocked = fields.filter((f) => f.blockedReason === 'rasterised')

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await fn()
        if (!result.ok) setError(result.error)
        else {
          setMessage(ok)
          router.refresh()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  const statusControl = canWrite ? (
    <select
      aria-label="Design status"
      value={status}
      disabled={pending}
      onChange={(e) => run(() => setDesignStatus(designId, e.target.value), 'Status updated.')}
      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] disabled:opacity-50"
    >
      {DESIGN_STATUSES.filter((s) => s !== 'not_started').map((s) => (
        <option key={s} value={s}>
          {DESIGN_STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  ) : (
    <p className="text-xs capitalize text-gray-500">{status.replace(/_/g, ' ')}</p>
  )

  if (!cardIsMapped) {
    return (
      <div className="px-8 py-6 space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white p-4">
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{coupleName ?? 'Unnamed couple'}</p>
            <p className="text-xs text-gray-500">{orderRef}</p>
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
                fields, so there is nothing to ask the couple for. Map it under Templates first.
              </p>
              <Link
                href="/opus-pass/digital-cards/templates"
                className="inline-flex rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
              >
                Go to Templates
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
        {/* Who and what this job is for. */}
        <div className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-200">
            {cardImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cardImage} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900">{coupleName ?? 'Unnamed couple'}</p>
            <div className="mt-1 space-y-0.5 text-xs text-gray-500">
              <p className="flex items-center gap-1.5">
                <Receipt className="h-3 w-3 shrink-0 text-gray-400" />
                <span className="font-mono">{orderRef}</span>
                {eventDate && <span className="text-gray-400">· {eventDate}</span>}
              </p>
              {coupleEmail && (
                <p className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3 shrink-0 text-gray-400" />
                  <a href={`mailto:${coupleEmail}`} className="hover:text-[#7E5896] hover:underline">
                    {coupleEmail}
                  </a>
                </p>
              )}
              {couplePhone && (
                <p className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3 shrink-0 text-gray-400" />
                  <a href={`tel:${couplePhone}`} className="hover:text-[#7E5896] hover:underline">
                    {couplePhone}
                  </a>
                </p>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Pill icon={<Mail className="h-3 w-3" />}>
                {digitalQty.toLocaleString('en-US')} digital
              </Pill>
              {printQty > 0 && (
                <Pill icon={<Printer className="h-3 w-3" />}>
                  {printQty.toLocaleString('en-US')} printed
                </Pill>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right text-xs text-gray-500">
            <p className="font-semibold text-gray-900">
              {answered}/{fields.length} fields filled
            </p>
            {infoRequestedAt && !infoReceivedAt && (
              <p className="mt-1 text-amber-700">Asked {new Date(infoRequestedAt).toLocaleDateString()}</p>
            )}
            {infoReceivedAt && (
              <p className="mt-1 text-emerald-700">
                Answered {new Date(infoReceivedAt).toLocaleDateString()}
              </p>
            )}
            <div className="mt-1.5 flex justify-end">{statusControl}</div>
          </div>
        </div>

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
                const blockedField = field.blockedReason === 'rasterised'
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
                message && <span className="min-w-0 truncate text-xs text-gray-500">{message}</span>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => requestDesignInfo(designId, [...asking]),
                    asking.size > 0
                      ? `Asked the couple for ${asking.size} field${asking.size === 1 ? '' : 's'}.`
                      : 'Cleared the request.',
                  )
                }
                className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Request {asking.size > 0 ? `${asking.size} field${asking.size === 1 ? '' : 's'}` : 'nothing'}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => saveDesignFieldValues(designId, draft), 'Saved.')}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#7E5896] px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#6b4a80] disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save values
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
