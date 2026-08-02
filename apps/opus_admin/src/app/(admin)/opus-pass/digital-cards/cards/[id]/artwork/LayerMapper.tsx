'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  Type,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import {
  autoApplicable,
  categorySchema,
  fontMatchStatus,
  suggestRoles,
  type FontMatch,
  type LayerSuggestion,
  type RequiredFont,
} from '@opusfesta/lib'
import { useSetPageHeading } from '@/components/PageHeading'
import { ImageUploadField } from '@/components/cms/ImageUploadField'
import { setCardFontLicence, type LicenceStatus } from '@/lib/cms/card-font-actions'
import { uploadCardFonts, type FontUploadOutcome } from '@/lib/cms/card-font-upload'
import {
  CARD_FIELD_ROLES,
  assessBindings,
  type CardFieldBinding,
} from '@/lib/cms/card-field-roles'
import type { CardArtworkInspection } from '@/lib/cms/card-svg-fields'
import { saveCardFieldBindings, setCardArtworkSvgUrl } from './actions'

const LIST = '/opus-pass/digital-cards/cards'

type ArtworkLoad =
  | ({ ok: true; requiredFonts: RequiredFont[] } & CardArtworkInspection)
  | { ok: false; reason: string }

/** Sentinel for "this layer is decoration, not a field". */
const NOT_A_FIELD = ''

export default function LayerMapper({
  productId,
  productName,
  category,
  artworkUrl,
  saved,
  artwork,
  fontMatches,
  fontSetupError,
  canAttestLicence,
}: {
  productId: string
  productName: string
  category: string
  artworkUrl: string
  saved: CardFieldBinding[]
  artwork: ArtworkLoad
  /** Each typeface the artwork asks for, resolved against the font library. */
  fontMatches: FontMatch[]
  /** Set when the library's schema is missing, as opposed to merely empty. */
  fontSetupError: string | null
  canAttestLicence: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [currentArtworkUrl, setCurrentArtworkUrl] = useState(artworkUrl)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useSetPageHeading({
    title: productName,
    back: { href: LIST, label: 'All cards' },
  })

  const presentLayerIds = useMemo(
    () =>
      new Set(
        artwork.ok
          ? [...artwork.textLayers, ...artwork.rasterLayers, ...artwork.shapeLayers].map((l) => l.id)
          : [],
      ),
    [artwork],
  )

  /**
   * Saved layer ids the current artwork no longer has, left over from an
   * earlier export.
   *
   * Dropping them is not tidiness. Carrying one forward means the role ends up
   * with the stale id AND the re-mapped one, and the renderer refuses any role
   * spanning two layers rather than invent a layout — so the field silently
   * stops working at exactly the moment the designer fixed the artwork.
   */
  const staleLayerIds = useMemo(
    () =>
      artwork.ok
        ? saved.flatMap((b) => b.layerIds).filter((id) => !presentLayerIds.has(id))
        : [],
    [artwork, saved, presentLayerIds],
  )

  // layerId → role key. The mapping is edited per LAYER (that's what the admin
  // sees in the artwork) and converted to per-ROLE bindings on save.
  const [assignment, setAssignment] = useState<Record<string, string>>(() => {
    const all = artwork.ok
      ? [...artwork.textLayers, ...artwork.rasterLayers, ...artwork.shapeLayers]
      : []
    const present = new Set(all.map((l) => l.id))

    const initial: Record<string, string> = {}
    for (const binding of saved) {
      for (const layerId of binding.layerIds) {
        if (present.has(layerId)) initial[layerId] = binding.role
      }
    }

    // Seed layers the DESIGNER named, before the admin touches anything.
    //
    // Pruning alone was a trap: after a re-export the stale ids vanish, and an
    // admin who pressed Save without first matching wrote a mapping with those
    // roles REMOVED, which silently deleted the whole Design section from the
    // couple's form. Seeding here means opening the page and saving is always
    // the correct outcome.
    //
    // Only the named tiers are applied. Anything merely INFERRED from the
    // layer's content is offered as a suggestion instead, because a wrong field
    // on a wedding card cannot be recalled and the review step downstream
    // assumes a person actually looked.
    const seeded = autoApplicable(
      suggestRoles(
        all.map((l) => ({ id: l.id, sampleText: 'sampleText' in l ? l.sampleText : '' })),
        CARD_FIELD_ROLES,
        categorySchema(category),
        initial,
      ),
    )
    return { ...initial, ...seeded }
  })

  // Memoised so the arrays keep a stable identity across re-renders — a fresh
  // `[]` each time would invalidate every downstream useMemo on every keystroke.
  const { layers, rasterLayers, shapeLayers, requiredFonts } = useMemo(
    () =>
      artwork.ok
        ? {
            layers: artwork.textLayers,
            rasterLayers: artwork.rasterLayers,
            shapeLayers: artwork.shapeLayers,
            requiredFonts: artwork.requiredFonts,
          }
        : { layers: [], rasterLayers: [], shapeLayers: [], requiredFonts: [] },
    [artwork],
  )

  const bindings = useMemo<CardFieldBinding[]>(() => {
    const byRole = new Map<string, CardFieldBinding>()
    const rasterIds = new Set(rasterLayers.map((l) => l.id))
    // Preserve the order of CARD_FIELD_ROLES so saved output is stable.
    for (const role of CARD_FIELD_ROLES) {
      const layerIds = Object.entries(assignment)
        .filter(([, assignedRole]) => assignedRole === role.key)
        .map(([layerId]) => layerId)
      if (layerIds.length === 0) continue
      byRole.set(role.key, {
        role: role.key,
        layerIds,
        // Carried onto the binding so the renderer knows to write a `fill`
        // rather than text content.
        ...(role.kind === 'colour' ? { kind: 'colour' as const } : {}),
        ...(layerIds.every((id) => rasterIds.has(id)) ? { rasterised: true } : {}),
      })
    }
    return [...byRole.values()]
  }, [assignment, rasterLayers])

  // ── Fonts ──
  const fontPicker = useRef<HTMLInputElement>(null)
  const folderPicker = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [fontReport, setFontReport] = useState<{
    outcomes: FontUploadOutcome[]
    fatal: string | null
  } | null>(null)

  const fontSummary = useMemo(() => {
    const counts = { ships: 0, font_restricted: 0, licence_not_cleared: 0, missing: 0 }
    for (const match of fontMatches) counts[fontMatchStatus(match)] += 1
    return counts
  }, [fontMatches])

  async function addFonts(files: FileList | null) {
    if (!files || files.length === 0) return
    setFontReport(null)
    const report = await uploadCardFonts(Array.from(files), (name) => setUploading(name))
    setUploading(null)
    setFontReport(report)
    if (fontPicker.current) fontPicker.current.value = ''
    if (folderPicker.current) folderPicker.current.value = ''
    router.refresh()
  }

  function attestLicence(fontId: string, status: LicenceStatus) {
    startTransition(async () => {
      const result = await setCardFontLicence(fontId, status, '')
      if (!result.ok) setFontReport({ outcomes: [], fatal: result.error })
      router.refresh()
    })
  }

  /**
   * What the artwork's own CONTENT says each unassigned layer is.
   *
   * Recomputed as the assignment changes, so accepting one suggestion can free
   * a role and reveal the next. Never written automatically: inferred matches
   * are shown with their reason and wait for a click.
   */
  const suggestions = useMemo(() => {
    const all = [...layers, ...shapeLayers, ...rasterLayers]
    return suggestRoles(
      all.map((l) => ({ id: l.id, sampleText: 'sampleText' in l ? l.sampleText : '' })),
      CARD_FIELD_ROLES,
      categorySchema(category),
      assignment,
    )
  }, [layers, shapeLayers, rasterLayers, assignment, category])

  const readiness = useMemo(() => assessBindings(bindings, category), [bindings, category])

  /**
   * Roles that are mapped today and would not be after this save.
   *
   * The last line of defence against deleting a field from the couple's form:
   * an unmapped role is dropped from the card entirely, and the only place that
   * is visible is here, at the moment of saving.
   */
  const droppedRoles = useMemo(() => {
    const next = new Set(bindings.map((b) => b.role))
    return saved.filter((b) => !next.has(b.role)).map((b) => b.role)
  }, [bindings, saved])

  // Which roles already have a layer, so the dropdowns can show it and the
  // admin isn't left guessing why a save was rejected as a duplicate.
  const roleUsage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const role of Object.values(assignment)) {
      if (role) counts.set(role, (counts.get(role) ?? 0) + 1)
    }
    return counts
  }, [assignment])

  /**
   * Pre-fill by matching layer ids against role keys. Only exact-ish matches:
   * a wrong guess on a wedding invitation is worse than no guess, so
   * content-named layers ('Bi._Fabiola_Thomas') are deliberately left blank.
   */
  /**
   * Apply what the designer named; leave what we inferred as a suggestion.
   *
   * The split is the point. On the reference card names alone resolved 10 of
   * 23 layers and reading the content took it to 22, but the extra twelve are
   * inferences, and a wedding invitation cannot be recalled.
   */
  function autoMatch() {
    const applied = autoApplicable(suggestions)
    const count = Object.keys(applied).length
    const inferred = suggestions.size - count

    setAssignment((prev) => ({ ...prev, ...applied }))
    setError(null)
    setMessage(
      count > 0
        ? `Matched ${count} layer${count === 1 ? '' : 's'} by name.${
            inferred > 0 ? ` ${inferred} more suggested below.` : ''
          }`
        : inferred > 0
          ? `No names matched, but ${inferred} layer${
              inferred === 1 ? ' has a suggestion' : 's have suggestions'
            } below.`
          : 'Nothing left to match.',
    )
  }

  function acceptSuggestion(layerId: string, role: string) {
    setAssignment((prev) => ({ ...prev, [layerId]: role }))
  }

  function updateArtworkUrl(nextUrl: string) {
    setCurrentArtworkUrl(nextUrl)
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await setCardArtworkSvgUrl(productId, nextUrl)
      if (!result.ok) {
        setError(result.error)
        setCurrentArtworkUrl(artworkUrl)
        return
      }
      setMessage(nextUrl.trim() ? 'Saved editable SVG artwork.' : 'Cleared editable SVG artwork.')
      router.refresh()
    })
  }

  function save() {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await saveCardFieldBindings(productId, bindings)
        if (!result.ok) {
          setError(result.error)
          return
        }
        setMessage(`Saved — ${result.mapped} field${result.mapped === 1 ? '' : 's'} mapped.`)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the mapping.')
      }
    })
  }

  if (!artwork.ok) {
    return (
      <div className="px-8 py-6">
        <div className="space-y-5">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-amber-900">Editable SVG artwork is needed</h2>
                <p className="text-sm text-amber-800">{artwork.reason}</p>
                {currentArtworkUrl && (
                  <p className="break-all text-xs text-amber-700">SVG artwork: {currentArtworkUrl}</p>
                )}
                {error ? (
                  <p className="text-xs font-medium text-red-600">{error}</p>
                ) : (
                  message && <p className="text-xs font-medium text-amber-700">{message}</p>
                )}
              </div>
            </div>
          </div>
          <ArtworkUploadPanel
            value={currentArtworkUrl}
            onChange={updateArtworkUrl}
          />
        </div>
        <Link
          href={LIST}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Back to all cards
        </Link>
      </div>
    )
  }

  return (
    <div className="px-8 py-6">
      <div className="min-w-0 space-y-5">
        <ArtworkUploadPanel
          value={currentArtworkUrl}
          onChange={updateArtworkUrl}
        />

        {/* Readiness summary — the answer to "can this card take an order?" */}
        <div
          className={`rounded-2xl border p-5 ${
            readiness.canFulfilOrders
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50'
          }`}
        >
          <div className="flex items-start gap-3">
            {readiness.canFulfilOrders ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            )}
            <div className="min-w-0 space-y-1">
              <h2
                className={`text-sm font-bold ${
                  readiness.canFulfilOrders ? 'text-emerald-900' : 'text-amber-900'
                }`}
              >
                {readiness.canFulfilOrders
                  ? 'Ready to take orders'
                  : 'Not ready to take orders'}
              </h2>
              <p
                className={`text-sm ${
                  readiness.canFulfilOrders ? 'text-emerald-800' : 'text-amber-800'
                }`}
              >
                {readiness.ready.length} of {CARD_FIELD_ROLES.length} fields are live text.
                {readiness.blocked.length > 0 && (
                  <>
                    {' '}
                    {readiness.blocked.length} are embedded images and can&apos;t be typed into —
                    the artwork needs re-exporting with those layers as text.
                  </>
                )}
                {readiness.unbound.length > 0 && (
                  <> {readiness.unbound.length} have no layer assigned yet.</>
                )}
              </p>
              {readiness.blocked.length > 0 && (
                <p className="pt-1 text-xs font-medium text-amber-900">
                  Blocked: {readiness.blocked.join(', ')}
                </p>
              )}
            </div>
          </div>
        </div>

        {staleLayerIds.length > 0 && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
              <div className="min-w-0 space-y-1">
                <h2 className="text-sm font-bold text-blue-900">
                  This artwork was re-exported since the last mapping
                </h2>
                <p className="text-sm text-blue-800">
                  {staleLayerIds.length} saved layer{staleLayerIds.length === 1 ? '' : 's'}{' '}
                  {staleLayerIds.length === 1 ? 'is' : 'are'} no longer in the file. They have been
                  cleared and the new layers re-matched by name below. Check the fields, then save.
                </p>
                <p className="break-all pt-1 text-xs font-medium text-blue-900">
                  Cleared: {staleLayerIds.join(', ')}
                </p>
              </div>
            </div>
          </div>
        )}

        {requiredFonts.length > 0 && (
          <FontPanel
            matches={fontMatches}
            summary={fontSummary}
            setupError={fontSetupError}
            report={fontReport}
            uploading={uploading}
            pending={pending}
            canAttestLicence={canAttestLicence}
            onPickFiles={() => fontPicker.current?.click()}
            onPickFolder={() => folderPicker.current?.click()}
            onAttest={attestLicence}
          />
        )}

        {/* One pair of pickers for the whole panel. webkitdirectory is
            non-standard, so the plain multi-file input is the fallback. */}
        <input
          ref={folderPicker}
          type="file"
          multiple
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          className="hidden"
          onChange={(e) => addFonts(e.target.files)}
        />
        <input
          ref={fontPicker}
          type="file"
          multiple
          accept=".ttf,.otf,.woff,.woff2"
          className="hidden"
          onChange={(e) => addFonts(e.target.files)}
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            {layers.length} text layer{layers.length === 1 ? '' : 's'} and {rasterLayers.length}{' '}
            image layer{rasterLayers.length === 1 ? '' : 's'} found in <strong>{category}</strong>{' '}
            artwork.
          </p>
          <button
            type="button"
            onClick={autoMatch}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Wand2 className="h-4 w-4" />
            Match by name
          </button>
        </div>

        <LayerTable
          title="Text layers"
          caption="These can be personalised. Assign each to the field it represents."
          rows={layers.map((l) => ({
            id: l.id,
            sample: l.sampleText,
            note: l.textNodeCount > 1 ? `${l.textNodeCount} text nodes` : null,
          }))}
          assignment={assignment}
          roleUsage={roleUsage}
          onChange={(layerId, role) => setAssignment((prev) => ({ ...prev, [layerId]: role }))}
          suggestions={suggestions}
          onAccept={acceptSuggestion}
        />

        {shapeLayers.length > 0 && (
          <LayerTable
            title="Colour layers"
            caption="Vector shapes with no text. Map these to the palette colour fields — a colour is written as a fill, not as text."
            rows={shapeLayers.map((l) => ({
              id: l.id,
              sample: l.currentFill
                ? `${l.shapeCount} shape${l.shapeCount === 1 ? '' : 's'} · currently ${l.currentFill}`
                : `${l.shapeCount} shape${l.shapeCount === 1 ? '' : 's'} · no fill set`,
              note: null,
            }))}
            assignment={assignment}
            roleUsage={roleUsage}
            onChange={(layerId, role) => setAssignment((prev) => ({ ...prev, [layerId]: role }))}
            suggestions={suggestions}
            onAccept={acceptSuggestion}
          />
        )}

        {rasterLayers.length > 0 && (
          <LayerTable
            title="Image layers"
            caption="Embedded bitmaps. Map them to record what they represent, but they cannot be changed per couple until the artwork is re-exported."
            blocked
            rows={rasterLayers.map((l) => ({
              id: l.id,
              sample: `${l.width ?? '?'} × ${l.height ?? '?'} bitmap`,
              note: null,
            }))}
            assignment={assignment}
            roleUsage={roleUsage}
            onChange={(layerId, role) => setAssignment((prev) => ({ ...prev, [layerId]: role }))}
            suggestions={suggestions}
            onAccept={acceptSuggestion}
          />
        )}

        <div className="sticky bottom-0 z-10 -mx-8 mt-6 border-t border-gray-200 bg-white/95 px-8 py-3 backdrop-blur">
          {droppedRoles.length > 0 && (
            <p className="mb-2 flex items-start gap-1.5 text-xs font-medium text-red-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Saving now REMOVES {droppedRoles.length} field
                {droppedRoles.length === 1 ? '' : 's'} from this card ({droppedRoles.join(', ')}).
                They have no layer in the current artwork, so the couple will stop being asked for
                them.
              </span>
            </p>
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
              message && <span className="min-w-0 truncate text-xs text-gray-500">{message}</span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg bg-[#7E5896] px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#6b4a80] disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save mapping
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ArtworkUploadPanel({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="mb-4 space-y-1">
        <h2 className="text-sm font-bold text-gray-900">Editable artwork SVG</h2>
        <p className="max-w-3xl text-[11px] text-gray-500">
          Upload the original SVG with named text and colour layers. This is separate from the
          public PNG/WebP hero image on the Details tab.
        </p>
      </div>
      <ImageUploadField
        label="Front artwork SVG"
        value={value}
        onChange={onChange}
        pathPrefix="opus-pass/invitations/artwork"
        previewAspect="aspect-[3/4]"
        previewWidth="max-w-[160px]"
        accept="svg"
      />
    </div>
  )
}

/** Brand green, used for the states that mean "this is fine". */
const READY_PILL =
  'inline-flex items-center gap-1 rounded-full bg-[#9FE870] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#14361f]'
const WARN_PILL =
  'inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800'
const HOLD_PILL =
  'inline-flex items-center gap-1 rounded-full bg-[#F3EAF8] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#7E5896]'

/**
 * The typefaces this card needs, and whether we can actually ship them.
 *
 * Lives here rather than on a page of its own because this is where the gap is
 * discovered: an admin looking at "GreatVibes-Regular, not in library" should
 * be able to add the file without going to find another screen and coming back.
 */
function FontPanel({
  matches,
  summary,
  setupError,
  report,
  uploading,
  pending,
  canAttestLicence,
  onPickFiles,
  onPickFolder,
  onAttest,
}: {
  matches: FontMatch[]
  summary: { ships: number; font_restricted: number; licence_not_cleared: number; missing: number }
  setupError: string | null
  report: { outcomes: FontUploadOutcome[]; fatal: string | null } | null
  uploading: string | null
  pending: boolean
  canAttestLicence: boolean
  onPickFiles: () => void
  onPickFolder: () => void
  onAttest: (fontId: string, status: LicenceStatus) => void
}) {
  const total = matches.length
  const allReady = summary.ships === total && total > 0

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div
        className={`border-b px-5 py-4 ${
          allReady ? 'border-emerald-100 bg-emerald-50/40' : 'border-amber-100 bg-amber-50/40'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
              <Type className="h-4 w-4 text-gray-400" />
              Typefaces
              <span className="text-gray-400">·</span>
              <span className={allReady ? 'text-emerald-700' : 'text-amber-700'}>
                {summary.ships} of {total} ready
              </span>
            </h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-600">
              The artwork names these but does not carry them. A typeface we do not hold falls
              back to a plain serif with no error, so the card looks finished while being in the
              wrong font. Add the fonts the designer delivered and they resolve automatically.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onPickFolder}
              disabled={uploading !== null}
              className="flex items-center gap-1.5 rounded-lg bg-[#7E5896] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#6b4a80] disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {uploading ? `Reading ${uploading}` : 'Add font folder'}
            </button>
            <button
              type="button"
              onClick={onPickFiles}
              disabled={uploading !== null}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Files
            </button>
          </div>
        </div>
      </div>

      {/* One environment-level failure, said once. */}
      {(setupError || report?.fatal) && (
        <div className="flex items-start gap-2.5 border-b border-amber-100 bg-amber-50 px-5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs leading-relaxed text-amber-900">{report?.fatal ?? setupError}</p>
        </div>
      )}

      {report && report.outcomes.length > 0 && (
        <ul className="divide-y divide-gray-50 border-b border-gray-100 bg-gray-50/40">
          {report.outcomes.map((outcome) => (
            <li key={outcome.filename} className="flex items-start gap-2 px-5 py-1.5 text-xs">
              {outcome.status === 'registered' || outcome.status === 'already_present' ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              )}
              <span className="text-gray-600">
                <code className="text-gray-700">{outcome.filename}</code>{' '}
                <span className="text-gray-400">·</span> {outcome.message}
              </span>
            </li>
          ))}
        </ul>
      )}

      <ul className="divide-y divide-gray-100">
        {matches.map((match) => {
          const status = fontMatchStatus(match)
          const font = match.required
          return (
            <li
              key={`${font.primary}-${font.weight}-${font.italic}`}
              className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="break-all text-sm font-medium text-gray-900">{font.primary}</code>
                  {status === 'ships' && (
                    <span className={READY_PILL}>
                      <CheckCircle2 className="h-3 w-3" />
                      Ready
                    </span>
                  )}
                  {status === 'licence_not_cleared' && (
                    <span className={HOLD_PILL}>Licence not cleared</span>
                  )}
                  {status === 'font_restricted' && (
                    <span className={WARN_PILL}>
                      <AlertTriangle className="h-3 w-3" />
                      Font forbids embedding
                    </span>
                  )}
                  {status === 'missing' && (
                    <span className={WARN_PILL}>
                      <AlertTriangle className="h-3 w-3" />
                      Not in library
                    </span>
                  )}
                  {match.viaAlias && <span className={HOLD_PILL}>Substituted</span>}
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  weight {font.weight}
                  {font.italic ? ' · italic' : ''} · {font.codePoints.length} glyph
                  {font.codePoints.length === 1 ? '' : 's'} used
                  {font.layerIds.length > 0 && (
                    <>
                      {' · '}
                      {font.layerIds.slice(0, 3).join(', ')}
                      {font.layerIds.length > 3 && ` +${font.layerIds.length - 3} more`}
                    </>
                  )}
                </p>
                {match.face && (
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    matched to {match.face.familyName} {match.face.subfamilyName}
                  </p>
                )}
                {status === 'font_restricted' && (
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                    The file itself carries a Restricted License flag, so no licence setting here
                    will release it. Either obtain a cut of the font that permits embedding, or
                    point this name at a face we may use.
                  </p>
                )}
              </div>

              <div className="shrink-0">
                {status === 'missing' && (
                  <button
                    type="button"
                    onClick={onPickFiles}
                    disabled={uploading !== null}
                    className="rounded-lg border border-[#7E5896] px-2.5 py-1 text-[11px] font-semibold text-[#7E5896] transition-colors hover:bg-[#F3EAF8] disabled:opacity-50"
                  >
                    Upload this font
                  </button>
                )}
                {status === 'licence_not_cleared' && match.face && canAttestLicence && (
                  <select
                    defaultValue=""
                    disabled={pending}
                    onChange={(e) =>
                      e.target.value && onAttest(match.face!.id, e.target.value as LicenceStatus)
                    }
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] disabled:opacity-50"
                  >
                    <option value="">Clear its licence…</option>
                    <option value="open">Open licence (OFL)</option>
                    <option value="webfont_licensed">Webfont licence bought</option>
                    <option value="desktop_only">Desktop only, do not ship</option>
                    <option value="blocked">Must not be used</option>
                  </select>
                )}
                {status === 'licence_not_cleared' && !canAttestLicence && (
                  <span className="text-[11px] text-gray-400">Needs an admin</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function LayerTable({
  title,
  caption,
  rows,
  assignment,
  roleUsage,
  onChange,
  suggestions,
  onAccept,
  blocked = false,
}: {
  title: string
  caption: string
  rows: { id: string; sample: string; note: string | null }[]
  assignment: Record<string, string>
  roleUsage: Map<string, number>
  onChange: (layerId: string, role: string) => void
  /** What the content says each unassigned layer probably is. */
  suggestions: Map<string, LayerSuggestion>
  onAccept: (layerId: string, role: string) => void
  blocked?: boolean
}) {
  const [onlyUnmapped, setOnlyUnmapped] = useState(false)

  const mappedCount = rows.filter((row) => assignment[row.id]).length
  const visible = onlyUnmapped ? rows.filter((row) => !assignment[row.id]) : rows

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900">
            {title}
            <span className="ml-1.5 font-normal text-gray-400">
              {mappedCount} of {rows.length} mapped
            </span>
          </h3>
          <p className="mt-0.5 max-w-2xl text-xs text-gray-500">{caption}</p>
        </div>
        {/* The task is "what is still unassigned", and on a 24-layer card that
            answer is otherwise buried in a long scroll of identical rows. */}
        {mappedCount < rows.length && (
          <button
            type="button"
            onClick={() => setOnlyUnmapped((v) => !v)}
            className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
              onlyUnmapped
                ? 'border-[#7E5896] bg-[#F3EAF8] text-[#7E5896]'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {onlyUnmapped ? 'Showing unassigned' : `Show ${rows.length - mappedCount} unassigned`}
          </button>
        )}
      </div>

      <ul className="divide-y divide-gray-100">
        {visible.map((row) => {
          const current = assignment[row.id] ?? NOT_A_FIELD
          const role = CARD_FIELD_ROLES.find((r) => r.key === current)
          const suggestion = suggestions.get(row.id)
          return (
            <li
              key={row.id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 transition-colors hover:bg-gray-50/50 ${
                current ? '' : 'border-l-2 border-l-amber-300'
              }`}
            >
              {/* The artwork's own words lead: that is what a human recognises.
                  The layer id is the machine's name for it and sits under. */}
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm ${
                    blocked ? 'text-gray-400' : 'text-gray-900'
                  }`}
                  title={row.sample}
                >
                  {row.sample || <span className="text-gray-300">(no text)</span>}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
                  <code className="break-all">{row.id}</code>
                  {row.note && <span className="text-amber-700">{row.note}</span>}
                </p>
                {/* Inferred from the layer's own text, never applied on its
                    own. The reason is shown so it can be judged rather than
                    rubber-stamped. */}
                {!current && suggestion && (
                  <button
                    type="button"
                    onClick={() => onAccept(row.id, suggestion.role)}
                    className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-[#C9A0DC] bg-[#F3EAF8] px-2 py-0.5 text-[11px] font-medium text-[#7E5896] transition-colors hover:bg-[#e9d9f2]"
                  >
                    <Wand2 className="h-3 w-3" />
                    <span>
                      Looks like{' '}
                      <strong className="font-semibold">
                        {CARD_FIELD_ROLES.find((r) => r.key === suggestion.role)?.label ??
                          suggestion.role}
                      </strong>
                      <span className="text-[#9b7bb0]"> · {suggestion.reason}</span>
                    </span>
                  </button>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {/* Scope as a pill rather than inside the option text. It used
                    to be appended to every label ("Invitation line · fixed
                    copy"), which overflowed the select and clipped the part
                    that mattered. */}
                {role?.scope === 'template' && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    Fixed copy
                  </span>
                )}
                {role?.scope === 'guest' && (
                  <span className="rounded-full bg-[#F3EAF8] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#7E5896]">
                    Per guest
                  </span>
                )}
                <select
                  aria-label={`Card field for ${row.id}`}
                  value={current}
                  onChange={(e) => onChange(row.id, e.target.value)}
                  className={`w-[210px] rounded-lg border bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] ${
                    current ? 'border-gray-200 text-gray-800' : 'border-amber-200 text-gray-500'
                  }`}
                >
                  <option value={NOT_A_FIELD}>Not a field</option>
                  {CARD_FIELD_ROLES.map((r) => {
                    const used = roleUsage.get(r.key) ?? 0
                    const usedByAnother = used > 0 && current !== r.key
                    return (
                      <option key={r.key} value={r.key}>
                        {r.label}
                        {usedByAnother ? ' (mapped)' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
            </li>
          )
        })}
        {visible.length === 0 && (
          <li className="px-5 py-6 text-center text-sm text-gray-400">
            Every layer here is assigned.
          </li>
        )}
      </ul>
    </section>
  )
}
