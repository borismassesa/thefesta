'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  Loader2,
  Save,
  Type,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import {
  CARD_FIELD_ROLES,
  assessBindings,
  autoApplicable,
  categorySchema,
  fontMatchStatus,
  injectFontCss,
  renderCardSvg,
  suggestRoles,
  type CardFieldBinding,
  type FontMatch,
  type LayerSuggestion,
  type RequiredFont,
} from '@opusfesta/lib'
import { useSetPageHeading } from '@/components/PageHeading'
import { ImageUploadField } from '@/components/cms/ImageUploadField'
import { setCardFontLicence, type LicenceStatus } from '@/lib/cms/card-font-actions'
import { uploadCardFonts, type FontUploadOutcome } from '@/lib/cms/card-font-upload'
import {
  UNASSIGNED,
  groupLayerRows,
  groupNeedsAttention,
  isLightColour,
  parseHexColour,
  type LayerRow,
} from '@/lib/cms/card-layer-groups'
import {
  PREVIEW_SAMPLE_VALUES,
  classifyPreview,
  markActiveLayer,
  type PreviewState,
} from '@/lib/cms/card-preview-sample'
import {
  announceAssignment,
  describeRow,
  latestRecovery,
  needsScroll,
  resolveRowRecovery,
  type RowRecovery,
} from '@/lib/cms/card-row-recovery'
import type { CardArtworkInspection } from '@/lib/cms/card-svg-fields'
import { saveCardFieldBindings, setCardArtworkSvgUrl } from './actions'

const LIST = '/opus-pass/digital-cards/cards'

const TEXT_SECTION = 'Text layers'
const COLOUR_SECTION = 'Colour layers'
const IMAGE_SECTION = 'Image layers'

/**
 * Collapse state is keyed per SECTION as well as per group.
 *
 * Design spans two sections (its heading is a text layer, its five chips are
 * shapes), so a bare group key would fold both at once.
 */
const collapseKey = (section: string, group: string) => `${section}:${group}`

/** How long the moved row stays marked before it is just a row again. */
const RECOVERY_MS = 2500

/**
 * The box a row has to be inside to count as visible.
 *
 * NOT the window. The admin shell scrolls an inner `<main class="overflow-y-auto">`,
 * so the document never scrolls and window.innerHeight describes a viewport this
 * content does not live in. Measuring against the wrong box makes "is the row
 * already visible" answer for a region the row can never be in, which turns the
 * scroll guard into either always-scroll or never-scroll.
 *
 * Falls back to the window when nothing above the row scrolls, which is the
 * plain-document case.
 */
function scrollViewport(node: HTMLElement): { top: number; bottom: number } {
  let parent = node.parentElement
  while (parent) {
    const style = getComputedStyle(parent)
    if (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) {
      const rect = parent.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom }
    }
    parent = parent.parentElement
  }
  return { top: 0, bottom: window.innerHeight }
}

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
    back: { href: LIST, label: 'Catalogue' },
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

  // ── Mapping preview ──
  //
  // Answers one question: did this layer get bound to the right field? It reads
  // the LIVE bindings, so a role picked a second ago shows immediately without
  // saving, and it writes nothing anywhere. The values are the schema's own
  // examples (see card-preview-sample.ts), never a real couple's answers.

  const [previewSvg, setPreviewSvg] = useState<string | null>(null)
  const [fetchFailed, setFetchFailed] = useState(false)
  const [fontCss, setFontCss] = useState('')
  /** The layer the admin is pointing at, highlighted on the card. */
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null)
  /** Bumped to force a refetch after a network failure. */
  const [retryToken, setRetryToken] = useState(0)
  const [previewOpen, setPreviewOpen] = useState(false)
  // Rendering a 2 MB string on every dropdown change would be wasteful, and a
  // quarter second reads as instant.
  const [debouncedBindings, setDebouncedBindings] = useState(bindings)

  const artworkOk = artwork.ok

  /**
   * Which fetch is allowed to write state.
   *
   * The abort signal already stops a superseded request, but abort is a
   * request-level guarantee and the invariant we actually need is
   * response-level: only the NEWEST attempt may set the artwork. Making that a
   * counter rather than a closure flag means it still holds if this ever grows
   * a second await, or if rendering itself becomes asynchronous.
   */
  const generation = useRef(0)

  useEffect(() => {
    if (!artworkOk) return
    const mine = ++generation.current
    const controller = new AbortController()

    fetch(`${LIST}/${productId}/artwork/source`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.text()
      })
      .then((svg) => {
        if (mine !== generation.current) return
        setPreviewSvg(svg)
        setFetchFailed(false)
      })
      .catch((err: unknown) => {
        if (mine !== generation.current) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Kept out of the panel: storage and provider errors carry paths and
        // hostnames that help nobody reading them. See PREVIEW_MESSAGES.
        console.warn('[mapper] artwork preview fetch failed', err)
        setFetchFailed(true)
      })

    return () => controller.abort()
    // currentArtworkUrl is a dependency so replacing the SVG refetches it.
  }, [productId, artworkOk, currentArtworkUrl, retryToken])

  useEffect(() => {
    if (!artworkOk) return
    const controller = new AbortController()
    fetch(`${LIST}/${productId}/artwork/fonts`, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : ''))
      .then(setFontCss)
      // A preview in a fallback face is worse than one in the right font, but
      // it is far better than no preview, so this failure is not fatal.
      .catch(() => undefined)
    return () => controller.abort()
  }, [productId, artworkOk, currentArtworkUrl, retryToken])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedBindings(bindings), 250)
    return () => clearTimeout(timer)
  }, [bindings])

  /**
   * The card with sample values written into the current bindings.
   *
   * Wrapped because a render failure must not take the mapper down with it: an
   * admin whose artwork the renderer chokes on still needs to fix the mapping,
   * and that is exactly when they need the page most.
   */
  const rendered = useMemo(() => {
    if (!previewSvg) return null
    try {
      return { ...renderCardSvg(previewSvg, debouncedBindings, PREVIEW_SAMPLE_VALUES), failed: null }
    } catch (err) {
      return {
        svg: '',
        applied: [],
        skipped: [],
        failed: err instanceof Error ? err.message : 'The artwork could not be rendered.',
      }
    }
  }, [previewSvg, debouncedBindings])

  // Blob URL rather than a data URI: a 2 MB base64 string in the DOM is far
  // heavier, and the previous URL is revoked so nothing accumulates.
  const previewUrl = useMemo(() => {
    if (!rendered?.svg) return null
    // The <img> renders the SVG as an isolated document, so the fonts have to
    // travel inside the file itself. Page CSS does not reach it.
    const withFonts = injectFontCss(markActiveLayer(rendered.svg, activeLayerId), fontCss)
    return URL.createObjectURL(new Blob([withFonts], { type: 'image/svg+xml' }))
  }, [rendered, fontCss, activeLayerId])
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  /** What the highlighted layer is called, for the label beside the card. */
  const activeLabel = useMemo(() => {
    if (!activeLayerId) return null
    const role = assignment[activeLayerId]
    return CARD_FIELD_ROLES.find((r) => r.key === role)?.label ?? activeLayerId
  }, [activeLayerId, assignment])

  const previewState = useMemo(
    () =>
      classifyPreview({
        artworkAttached: artworkOk,
        svg: previewSvg,
        fetchFailed,
        renderFailed: rendered?.failed != null,
      }),
    [artworkOk, previewSvg, fetchFailed, rendered],
  )

  /**
   * What just changed, for a screen reader.
   *
   * Only mapping CHANGES are announced. The preview re-renders constantly and
   * announcing that would bury the one sentence that matters under noise.
   */
  const [announcement, setAnnouncement] = useState('')

  // ── Finding a row again after assigning it moved it ──

  /**
   * Which groups are folded away, keyed section:group.
   *
   * Seeded ONCE, from how the card looked on arrival: a finished group opens
   * collapsed because there is nothing to do in it, and everything else opens
   * expanded. Deliberately not recomputed as the mapping changes — a group that
   * folded itself shut the instant the admin assigned its last layer would hide
   * the work they just did.
   *
   * Lifted out of LayerTable so assigning a role can open the group the row
   * landed in. Focusing a row inside a collapsed group would put focus on
   * something with no visible position.
   */
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {}
    const sections: [string, { id: string }[]][] = [
      [TEXT_SECTION, layers],
      [COLOUR_SECTION, shapeLayers],
      [IMAGE_SECTION, rasterLayers],
    ]
    for (const [section, sectionRows] of sections) {
      const rows = sectionRows.map((l) => ({ id: l.id, sample: '', note: null }))
      for (const group of groupLayerRows(rows, assignment)) {
        if (!groupNeedsAttention(group)) seed[collapseKey(section, group.key)] = true
      }
    }
    return seed
  })

  const [pendingRecovery, setPendingRecovery] = useState<RowRecovery | null>(null)
  const recoveryRevision = useRef(0)
  const rowNodes = useRef(new Map<string, HTMLElement>())

  const registerRow = (layerId: string, node: HTMLElement | null) => {
    if (node) rowNodes.current.set(layerId, node)
    else rowNodes.current.delete(layerId)
  }

  /** A layer's own words, for naming it in the announcement and on the row. */
  const sampleTextFor = (layerId: string) => {
    const layer = layers.find((l) => l.id === layerId)
    return layer?.sampleText ?? ''
  }

  useEffect(() => {
    if (!pendingRecovery) return
    const node = rowNodes.current.get(pendingRecovery.layerId)
    if (!node) return

    // Only when it is actually off-screen. A mouse user who picked a role from
    // a row in the middle of the page has no reason to have it yanked, and a
    // bare scrollIntoView() does exactly that.
    if (needsScroll(node.getBoundingClientRect(), scrollViewport(node))) {
      // 'auto' for everyone, not just reduced-motion: the recovery highlight
      // already says where the row went, and predictability beats animation.
      node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
    }
    node.focus({ preventScroll: true })

    const timer = setTimeout(() => setPendingRecovery(null), RECOVERY_MS)
    return () => clearTimeout(timer)
  }, [pendingRecovery])

  /**
   * Try the artwork download again after a network failure.
   *
   * Clears the previous outcome HERE rather than at the top of the effect, so
   * the reset is part of the click that asked for it. Resetting inside the
   * effect body would re-run on every unrelated dependency change and cascade a
   * render each time.
   */
  /**
   * Escape closes the preview sheet, and focus goes back where it came from.
   *
   * aria-modal alone is a claim, not a behaviour: without this a keyboard user
   * opens the sheet, lands nowhere, and has no way out but the mouse.
   */
  const previewOpener = useRef<HTMLButtonElement>(null)
  const previewPanel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!previewOpen) return
    previewPanel.current?.focus()
    // Captured now: by cleanup time the ref may point somewhere else.
    const opener = previewOpener.current
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus()
    }
  }, [previewOpen])

  function retryPreview() {
    setPreviewSvg(null)
    setFetchFailed(false)
    setRetryToken((n) => n + 1)
  }

  /**
   * Assigning a role, including putting the row back where it can be found.
   *
   * Grouping means picking a role can take the row out from under the pointer.
   * With a mouse that reads as the list reorganising; with a keyboard the row
   * simply vanishes and focus lands wherever the DOM left it. So the move is
   * handled rather than left to React's incidental focus preservation.
   */
  function assignRole(layerId: string, roleKey: string) {
    const previousRole = assignment[layerId]
    setAssignment((prev) => ({ ...prev, [layerId]: roleKey }))

    const recovery = resolveRowRecovery({
      layerId,
      previousRole,
      nextRole: roleKey,
      revision: ++recoveryRevision.current,
    })

    const sample = sampleTextFor(layerId)
    setAnnouncement(announceAssignment(sample, layerId, roleKey, recovery !== null))

    if (!recovery) return

    // The destination may be folded shut, and focusing a row inside a collapsed
    // group would move focus to something nobody can see. Cleared in every
    // section, because the row could have come from either.
    setCollapsedGroups((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(next)) {
        if (key.endsWith(`:${recovery.destination}`)) next[key] = false
      }
      return next
    })
    setPendingRecovery((current) => latestRecovery(current, recovery))
  }

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

  /**
   * Accepting an inferred suggestion is an assignment like any other.
   *
   * Routed through assignRole rather than setting state directly, because it
   * moves the row exactly the same way and clicking the chip is the moment the
   * row disappears from under the cursor. Bulk "Match by name" deliberately
   * does NOT come through here: it moves many rows at once, and there is no
   * single one to recover to.
   */
  function acceptSuggestion(layerId: string, role: string) {
    assignRole(layerId, role)
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
          Back to the catalogue
        </Link>
      </div>
    )
  }

  return (
    <div className="px-8 py-6">
      {/* Mapper leads, preview follows. The preview is a way to CHECK the
          mapping, so it must never take space the mapping needs — below xl it
          drops away entirely rather than squeezing the rows. */}
      <div className="flex items-start gap-6">
      <div className="min-w-0 flex-1 space-y-5">
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
          unit="text layer"
          rows={layers.map((l) => ({
            id: l.id,
            sample: l.sampleText,
            note: l.textNodeCount > 1 ? `${l.textNodeCount} text nodes` : null,
          }))}
          assignment={assignment}
          roleUsage={roleUsage}
          onChange={assignRole}
          suggestions={suggestions}
          onAccept={acceptSuggestion}
          onActivate={setActiveLayerId}
          activeLayerId={activeLayerId}
          collapsed={collapsedGroups}
          onToggleGroup={(key, next) => setCollapsedGroups((prev) => ({ ...prev, [key]: next }))}
          registerRow={registerRow}
          recoveredLayerId={pendingRecovery?.layerId ?? null}
        />

        {shapeLayers.length > 0 && (
          <LayerTable
            title="Colour layers"
            caption="Vector shapes with no text. Map these to the palette colour fields — a colour is written as a fill, not as text."
            unit="colour layer"
            // The fill leads and the shape count follows: the colour IS what
            // the admin is recognising the layer by, and it used to be buried
            // at the end of a sentence as bare hex.
            rows={shapeLayers.map((l) => ({
              id: l.id,
              sample: l.currentFill ? l.currentFill.toUpperCase() : 'No fill set',
              meta: `${l.shapeCount} shape${l.shapeCount === 1 ? '' : 's'}`,
              note: null,
              swatch: l.currentFill ?? null,
            }))}
            assignment={assignment}
            roleUsage={roleUsage}
            onChange={assignRole}
            suggestions={suggestions}
            onAccept={acceptSuggestion}
            onActivate={setActiveLayerId}
            activeLayerId={activeLayerId}
            collapsed={collapsedGroups}
            onToggleGroup={(key, next) => setCollapsedGroups((prev) => ({ ...prev, [key]: next }))}
            registerRow={registerRow}
            recoveredLayerId={pendingRecovery?.layerId ?? null}
          />
        )}

        {rasterLayers.length > 0 && (
          <LayerTable
            title="Image layers"
            caption="Embedded bitmaps. Map them to record what they represent, but they cannot be changed per couple until the artwork is re-exported."
            unit="image layer"
            blocked
            rows={rasterLayers.map((l) => ({
              id: l.id,
              sample: `${l.width ?? '?'} × ${l.height ?? '?'} bitmap`,
              note: null,
            }))}
            assignment={assignment}
            roleUsage={roleUsage}
            onChange={assignRole}
            suggestions={suggestions}
            onAccept={acceptSuggestion}
            onActivate={setActiveLayerId}
            activeLayerId={activeLayerId}
            collapsed={collapsedGroups}
            onToggleGroup={(key, next) => setCollapsedGroups((prev) => ({ ...prev, [key]: next }))}
            registerRow={registerRow}
            recoveredLayerId={pendingRecovery?.layerId ?? null}
          />
        )}

      </div>

        {/* Wide screens get the card beside the rows. */}
        <aside className="sticky top-6 hidden w-[300px] shrink-0 xl:block">
          <MappingPreview
            url={previewUrl}
            state={previewState}
            activeLabel={activeLabel}
            onRetry={retryPreview}
          />
        </aside>
      </div>

      {/* Narrow screens get the same preview in a dialog rather than losing it.
          A capability that silently disappears below a breakpoint is one an
          admin learns not to rely on. */}
      <button
        ref={previewOpener}
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="fixed bottom-20 right-6 z-20 flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-lg xl:hidden"
      >
        <Eye className="h-4 w-4" />
        Preview
        <PreviewHealth state={previewState} />
      </button>

      {previewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Card preview"
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 xl:hidden"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            ref={previewPanel}
            tabIndex={-1}
            className="max-h-[85vh] w-full max-w-sm overflow-y-auto outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <MappingPreview
              url={previewUrl}
              state={previewState}
              activeLabel={activeLabel}
              onRetry={retryPreview}
              onClose={() => setPreviewOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Mapping changes only. The preview re-renders constantly and narrating
          that would bury the one sentence worth hearing. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

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
  )
}

/**
 * The card as it stands, for checking a binding landed on the right layer.
 *
 * Deliberately NOT a design-job editor: nothing here is editable, nothing is
 * saved, and the values are the schema's examples rather than any customer's.
 * It is also strictly secondary — every failure state below still leaves the
 * mapper fully usable, because a card whose artwork will not render is exactly
 * the one an admin most needs to re-map.
 */
function PreviewHealth({ state }: { state: PreviewState }) {
  const ready = state.kind === 'ready'
  return (
    <span
      className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-[#9FE870]' : 'bg-amber-400'}`}
      aria-label={ready ? 'Preview ready' : 'Preview unavailable'}
    />
  )
}

function MappingPreview({
  url,
  state,
  activeLabel,
  onRetry,
  onClose,
}: {
  url: string | null
  state: PreviewState
  activeLabel: string | null
  onRetry: () => void
  onClose?: () => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
              Preview
              <PreviewHealth state={state} />
            </h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">
              Sample details in your current mapping, saved or not. Point at a layer to find it on
              the card.
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-50"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="p-4">
          {state.kind === 'no_artwork' && (
            <div className="flex aspect-[5/7] items-center justify-center rounded-lg bg-gray-50 px-4 text-center">
              <p className="text-[11px] text-gray-500">
                No editable SVG attached yet. Upload one above.
              </p>
            </div>
          )}

          {state.kind === 'loading' && (
            <div className="flex aspect-[5/7] flex-col items-center justify-center gap-2 rounded-lg bg-gray-50">
              <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
              <p className="text-[11px] text-gray-400">Loading artwork…</p>
            </div>
          )}

          {(state.kind === 'network_error' || state.kind === 'render_error') && (
            <div className="flex aspect-[5/7] flex-col items-center justify-center gap-2 rounded-lg bg-amber-50 px-4 text-center">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
              <p className="text-[11px] leading-relaxed text-amber-900">{state.message}</p>
              {/* A route that failed is worth another go. A renderer that
                  choked on this file will choke again, so offering retry there
                  would just be a button that does nothing. */}
              {state.retryable && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-lg border border-amber-300 px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                >
                  Try again
                </button>
              )}
              <p className="text-[11px] text-amber-700">Mapping still works.</p>
            </div>
          )}

          {state.kind === 'ready' && url && (
            /* eslint-disable-next-line @next/next/no-img-element -- a blob URL
               of an SVG built in the browser; there is nothing to optimise.
               <img> is also the inert path: it never runs script, which matters
               because this artwork was uploaded. */
            <img
              src={url}
              alt="The card rendered with sample details in the current mapping"
              className="w-full rounded-lg border border-gray-100"
            />
          )}
        </div>

        {/* The channel that works when neither the halo nor the pulse reaches
            the admin: the field is simply named. */}
        <div className="border-t border-gray-100 px-4 py-2.5">
          {activeLabel ? (
            <p className="truncate text-[11px] text-gray-600" title={activeLabel}>
              <span className="font-semibold text-[#7E5896]">Inspecting</span> {activeLabel}
            </p>
          ) : (
            <p className="text-[11px] text-gray-400">Point at a layer to highlight it.</p>
          )}
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

/**
 * A colour layer's current fill, as something the eye can actually read.
 *
 * The hex stays next to it rather than being replaced by it: hex is what the
 * designer's file and every support conversation use, and a swatch alone can't
 * be copied, searched or dictated.
 */
function ColourSwatch({ value }: { value: string | null }) {
  const hex = (value ?? '').trim()
  const parsed = parseHexColour(hex)

  if (!parsed) {
    return (
      <span
        role="img"
        aria-label="No fill set"
        title="No fill set"
        className="h-5 w-5 shrink-0 rounded-md border border-dashed border-gray-300 bg-[linear-gradient(135deg,transparent_45%,#d1d5db_45%,#d1d5db_55%,transparent_55%)]"
      />
    )
  }

  const upper = hex.toUpperCase()
  return (
    <span
      role="img"
      aria-label={`Colour ${upper}`}
      title={upper}
      style={{ backgroundColor: hex }}
      // An ivory chip on a white card is invisible with a hairline border, and
      // reads as "no fill set". Pale fills get a real outline.
      className={`h-5 w-5 shrink-0 rounded-md border ${
        isLightColour(hex) ? 'border-gray-400' : 'border-black/10'
      }`}
    />
  )
}

function LayerTable({
  title,
  caption,
  unit,
  rows,
  assignment,
  roleUsage,
  onChange,
  suggestions,
  onAccept,
  blocked = false,
  onActivate,
  activeLayerId,
  collapsed,
  onToggleGroup,
  registerRow,
  recoveredLayerId,
}: {
  title: string
  caption: string
  /** Singular noun for one row here, used to name the section-local count. */
  unit: string
  rows: LayerRow[]
  assignment: Record<string, string>
  roleUsage: Map<string, number>
  onChange: (layerId: string, role: string) => void
  /** What the content says each unassigned layer probably is. */
  suggestions: Map<string, LayerSuggestion>
  onAccept: (layerId: string, role: string) => void
  blocked?: boolean
  /** Point the preview at a layer. */
  onActivate: (layerId: string) => void
  activeLayerId: string | null
  /** Folded groups, keyed section:group. Owned by the mapper. */
  collapsed: Record<string, boolean>
  onToggleGroup: (key: string, next: boolean) => void
  registerRow: (layerId: string, node: HTMLElement | null) => void
  recoveredLayerId: string | null
}) {
  const [onlyUnmapped, setOnlyUnmapped] = useState(false)

  const mappedCount = rows.filter((row) => assignment[row.id]).length
  const visible = onlyUnmapped ? rows.filter((row) => !assignment[row.id]) : rows
  const groups = groupLayerRows(visible, assignment)

  // Grouping earns its keep by splitting a long list. One bucket of unassigned
  // layers is not a split, it is the same list with a second header on top.
  const showGroupHeadings = groups.length > 1 || groups[0]?.key !== UNASSIGNED

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

      {groups.map((group) => {
        const isCollapsed = collapsed[collapseKey(title, group.key)] ?? false
        /**
         * Two different scopes meet in this one line, so both are named.
         *
         * The row count is this section's; the coverage is the whole card's.
         * They used to share the wording "N of M mapped" with the section
         * heading above, which reads as a second section-local count — and
         * Design, whose heading is text while its five chips are shapes,
         * printed the same "6 of 6" under both Text layers and Colour layers.
         */
        const rowCount = `${group.rows.length} ${unit}${group.rows.length === 1 ? '' : 's'}`
        const heading = (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-700">{group.key}</span>
            <span className="text-[11px] text-gray-400">
              {group.coverage
                ? `${rowCount} · ${group.coverage.mapped} of ${group.coverage.total} card fields mapped overall`
                : rowCount}
            </span>
            {groupNeedsAttention(group) && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-label="Needs attention" />
            )}
          </div>
        )

        return (
          <div key={group.key} className="border-t border-gray-100 first:border-t-0">
            {showGroupHeadings && (
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() => onToggleGroup(collapseKey(title, group.key), !isCollapsed)}
                className="flex w-full items-center gap-1.5 bg-gray-50/60 px-5 py-2 text-left transition-colors hover:bg-gray-50"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                )}
                {heading}
              </button>
            )}

            {!isCollapsed && (
              <ul className="divide-y divide-gray-100">
                {group.rows.map((row) => (
                  <LayerRowItem
                    key={row.id}
                    row={row}
                    assignment={assignment}
                    roleUsage={roleUsage}
                    onChange={onChange}
                    suggestion={suggestions.get(row.id)}
                    onAccept={onAccept}
                    blocked={blocked}
                    onActivate={onActivate}
                    active={activeLayerId === row.id}
                    registerRow={registerRow}
                    recovered={recoveredLayerId === row.id}
                  />
                ))}
              </ul>
            )}
          </div>
        )
      })}

      {groups.length === 0 && (
        <p className="px-5 py-6 text-center text-sm text-gray-400">
          Every layer here is assigned.
        </p>
      )}
    </section>
  )
}

function LayerRowItem({
  row,
  assignment,
  roleUsage,
  onChange,
  suggestion,
  onAccept,
  blocked,
  onActivate,
  active,
  registerRow,
  recovered,
}: {
  row: LayerRow
  assignment: Record<string, string>
  roleUsage: Map<string, number>
  onChange: (layerId: string, role: string) => void
  suggestion: LayerSuggestion | undefined
  onAccept: (layerId: string, role: string) => void
  blocked: boolean
  /** Point the preview at this layer. */
  onActivate: (layerId: string) => void
  active: boolean
  registerRow: (layerId: string, node: HTMLElement | null) => void
  /** This row just moved here, so say so until the admin has found it. */
  recovered: boolean
}) {
  const current = assignment[row.id] ?? NOT_A_FIELD
  const role = CARD_FIELD_ROLES.find((r) => r.key === current)
  const isColour = row.swatch !== undefined

  return (
    <li
      ref={(node) => registerRow(row.id, node)}
      data-layer-id={row.id}
      // The row is the focus target after a move, not the select: landing back
      // inside a dropdown that just changed is disorienting, and the admin can
      // Tab straight into it from here. -1 keeps it out of the normal tab order.
      tabIndex={-1}
      aria-label={describeRow(row.sample, row.id, current || undefined)}
      // Hover AND focus, so the preview follows a mouse and a Tab key alike.
      // Focus is capturing because the thing being tabbed to is the select
      // inside, not the row.
      onMouseEnter={() => onActivate(row.id)}
      onFocusCapture={() => onActivate(row.id)}
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 outline-none transition-colors hover:bg-gray-50/50 ${
        current ? '' : 'border-l-2 border-l-amber-300'
      } ${active ? 'bg-[#F3EAF8]/50' : ''} ${
        // Static: a background and a ring, no motion, so reduced-motion users
        // get exactly the same cue as everyone else.
        recovered ? 'bg-[#F3EAF8] ring-2 ring-inset ring-[#7E5896]' : ''
      }`}
    >
      {/* The artwork's own words lead: that is what a human recognises.
          The layer id is the machine's name for it and sits under. */}
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {isColour && <span className="mt-0.5"><ColourSwatch value={row.swatch ?? null} /></span>}
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm ${blocked ? 'text-gray-400' : 'text-gray-900'} ${
              isColour ? 'font-mono' : ''
            }`}
            title={row.sample}
          >
            {row.sample || <span className="text-gray-300">(no text)</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
            <code className="break-all">{row.id}</code>
            {row.meta && <span>{row.meta}</span>}
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
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Hover is fine for a mouse and useless for everyone else. A touch
            user has no hover state at all, so inspection needs a control they
            can actually reach. Focusing it also activates, via the row's
            onFocusCapture, so Tab alone drives the preview too. */}
        <button
          type="button"
          onClick={() => onActivate(row.id)}
          aria-pressed={active}
          aria-label={`Show ${row.id} on the preview`}
          className={`rounded-lg border p-1.5 transition-colors ${
            active
              ? 'border-[#7E5896] bg-[#F3EAF8] text-[#7E5896]'
              : 'border-gray-200 text-gray-400 hover:bg-gray-50'
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
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
}
