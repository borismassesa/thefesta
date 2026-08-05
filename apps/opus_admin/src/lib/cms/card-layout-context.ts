import 'server-only'
import { createHash } from 'node:crypto'

import {
  applyOverrides,
  assessCardGeometry,
  buildMetricsIndex,
  canonicalJson,
  CARD_GEOMETRY_DERIVATION_VERSION,
  CARD_MANIFEST_SCHEMA_VERSION,
  deriveLayout,
  extractArtworkGeometry,
  FIT_VERSION,
  lookupMetrics,
  matchCardFonts,
  RENDERER_VERSION,
  type CardFieldBinding,
  type CardFontFace,
  type CardLayout,
  type CardLayoutOverrides,
  type CardLayoutState,
  type CardRenderManifest,
  type FieldLayout,
  type FontMetrics,
  type GeometryAssessment,
  type ManifestFont,
  type MetricsIndex,
  type RequiredFont,
} from '@opusfesta/lib'

import { listCardFonts } from '@/lib/cms/card-font-actions'

// Assembling everything a card's layout needs, in one place.
//
// Four things have to line up before a value can be fitted, and they come from
// four different sources:
//
//   THE ARTWORK   geometry: which box, at what size, anchored where
//   THE ROW       the admin's overrides and the card's layout STATE
//   THE LIBRARY   advance widths for the faces the artwork asks for
//   THE CODE      which renderer and fitter are about to run
//
// Every caller needs all four and must agree on all four: the Studio, so an
// admin sees the truth while they drag a box; the release path, so an unfittable
// card is blocked before it is frozen; the shadow-mode assessment, so a card is
// classified against what would actually happen to it. An assembly that differed
// between them would be a preview that lies, which is the one failure the whole
// layout engine exists to prevent. So there is one assembler.
//
// Nothing is cached against the product row. The artwork can be re-uploaded at
// any time, and a box derived from an export that is no longer live would put
// text where the text is not.

export type CardLayoutContext = {
  layout: CardLayout
  /** Whether the layout engine is authoritative for this card. */
  state: CardLayoutState
  /** Resolves the face a field is set in, or null when it cannot be measured. */
  metricsFor: (field: FieldLayout) => FontMetrics | null
  /** How safe this artwork is to lay out, and what state it justifies. */
  assessment: GeometryAssessment
  /** SHA-256 of the artwork these boxes were derived from. */
  artworkSha256: string
  /** The dependency set a release frozen right now would record. */
  manifest: CardRenderManifest
  /** Faces the artwork asks for that ship but cannot be measured. */
  unmeasurableFaces: string[]
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/**
 * Build the layout, its measuring function and its assessment for one card.
 *
 * `storedOverrides` is applied OVER a freshly derived layout rather than
 * replacing it, so a role mapped since the card was last opened arrives with
 * sensible defaults, and a saved box whose layer the artwork no longer has is
 * dropped rather than pointing at nothing.
 *
 * `state` is passed in, never inferred. Deriving a layout must not be able to
 * decide that the layout engine now runs — that is an explicit act recorded on
 * the row.
 */
export async function buildCardLayoutContext(input: {
  svg: string
  requiredFonts: RequiredFont[]
  bindings: CardFieldBinding[]
  storedOverrides: unknown
  state: CardLayoutState
}): Promise<CardLayoutContext> {
  const artworkSha256 = sha256(input.svg)
  const { index, unmeasurableFaces, fonts } = await metricsIndexFor(input.requiredFonts)
  const geometry = extractArtworkGeometry(input.svg)

  const metricsFor = (field: FieldLayout): FontMetrics | null =>
    lookupMetrics(index, field.font.families, field.font.weight, field.font.italic)

  const derived = deriveLayout(
    geometry,
    input.bindings,
    (text) => lookupMetrics(index, text.families, text.weight, text.italic),
    {
      artworkSha256,
      derivationVersion: CARD_GEOMETRY_DERIVATION_VERSION,
      // Deliberately the artwork's fingerprint rather than a clock reading: a
      // derivation is a pure function of the file, and stamping wall-clock time
      // here would make two identical derivations look different.
      derivedAt: '',
    },
  )

  const layout = applyOverrides(derived, asOverrides(input.storedOverrides))

  return {
    layout,
    state: input.state,
    metricsFor,
    assessment: assessCardGeometry(layout, geometry.texts),
    artworkSha256,
    manifest: {
      schemaVersion: CARD_MANIFEST_SCHEMA_VERSION,
      rendererVersion: RENDERER_VERSION,
      fitVersion: FIT_VERSION,
      artworkSha256,
      layoutSha256: sha256(canonicalJson(layout)),
      bindingSha256: sha256(canonicalJson(input.bindings)),
      fonts,
    },
    unmeasurableFaces,
  }
}

/**
 * Advance widths for every face this artwork asks for, keyed the way the
 * artwork names them.
 *
 * Keyed on the REQUIRED name rather than the font's own family, matching how
 * buildFontFaceCss registers each @font-face — so the face a browser resolves
 * and the table we measure with are the same one by construction, rather than
 * by two lookups that could disagree.
 */
export async function metricsIndexFor(requiredFonts: RequiredFont[]): Promise<{
  index: MetricsIndex
  unmeasurableFaces: string[]
  fonts: ManifestFont[]
}> {
  if (requiredFonts.length === 0) return { index: new Map(), unmeasurableFaces: [], fonts: [] }

  const library = await listCardFonts()
  const faces: CardFontFace[] = library.fonts.map((font) => ({
    id: font.id,
    familyName: font.family_name,
    subfamilyName: font.subfamily_name,
    postscriptName: font.postscript_name,
    weightClass: font.weight_class,
    isItalic: font.is_italic,
    matchKeys: font.match_keys,
    embeddable: font.embeddable,
    restricted: font.fs_type_no_embedding,
  }))
  const byId = new Map(library.fonts.map((font) => [font.id, font]))

  const unmeasurableFaces: string[] = []
  const fonts: ManifestFont[] = []

  const measurable = matchCardFonts(requiredFonts, faces).map((match) => {
    const row = match.face ? byId.get(match.face.id) : undefined
    const metrics = row?.metrics ?? null
    // A face that will not SHIP is already reported by the font panel. What is
    // new here is a face that ships but cannot be MEASURED, which blocks layout
    // for a reason nothing else in the product would explain.
    if (!metrics) unmeasurableFaces.push(match.required.primary)

    fonts.push({
      primary: match.required.primary,
      weight: match.required.weight,
      italic: match.required.italic,
      fontSha256: row?.content_sha256 ?? null,
      // Fingerprints the TABLE, not the file: the same binary re-extracted can
      // yield different widths, and that is exactly the drift worth catching.
      metricsSha256: metrics ? sha256(canonicalJson(metrics)) : null,
    })

    return {
      primary: match.required.primary,
      weight: match.required.weight,
      italic: match.required.italic,
      metrics,
    }
  })

  return { index: buildMetricsIndex(measurable), unmeasurableFaces, fonts }
}

/** A jsonb column is `unknown` until something checks it. */
function asOverrides(value: unknown): Partial<CardLayoutOverrides> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Partial<CardLayoutOverrides>)
    : null
}
