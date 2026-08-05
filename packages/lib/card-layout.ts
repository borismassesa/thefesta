// The layout model: where each field lives on a card, and how it may adapt.
//
// Everything else in the card pipeline treats artwork as fixed. A designer
// decides in Illustrator that a guest name gets 320 points, and that is final
// for every guest who ever receives the card — including 'Prof. Dr. Eng. Arch.
// Benjamin Emmanuel Mwakatobe'. This is where that stops being final.
//
// Four rules shape the design, and each exists because its opposite is a trap.
//
// 1. THE ARTWORK IS STILL THE SOURCE OF TRUTH. Layout is DERIVED from the SVG,
//    never authored from a blank canvas, and the stored column holds only what
//    an admin has since CHANGED. That is why a re-export can be reconciled at
//    all: the derived half is recomputed, and the overrides are carried across
//    or dropped per field depending on whether their source layer survived.
//
// 2. DERIVING IS NOT ACTIVATING. Reading a card produces a proposed layout. It
//    does not make that layout authoritative for production rendering — see
//    CardLayoutState. A GET must never change what the renderer will do.
//
// 3. THE DEFAULT BOX IS THE DESIGNER'S OWN PLACEHOLDER, not the free space
//    around it. We cannot see whether the white space beside a name is empty
//    canvas or a pale floral border, so a long name is SHRUNK to the designer's
//    box rather than allowed to run across the artwork. Widening it is a
//    deliberate act performed in the Studio with the card in front of you.
//
// 4. A FIELD IS NOT A ROLE. The same role legitimately appears twice on one
//    card — a guest name on the face and again on a detachable stub — so a
//    layout field carries its own id and names the role it serves. Keying
//    layout by role would silently collapse the two.
//
// COORDINATES. Boxes are stored in the text element's LOCAL space, with the
// transform that reaches the canvas kept alongside as `sourceCtm`. Local rather
// than canvas because a rotated or skewed CTM cannot be represented by a
// canvas-space rectangle at all, and because round-tripping a box through an
// inverse matrix on every render would inject drift into the one place that
// must stay exact: an unshrunk field reproducing the designer's placement
// byte-for-byte. The Studio converts for display via `boxInCanvas`.

import {
  applyMatrix,
  IDENTITY,
  matrixScale,
  type Matrix,
  type Point,
  type Rect,
  type TextAnchor,
  type TextGeometry,
  type ViewBox,
} from './card-geometry'
import { lineHeightFor, measureRun, type FontMetrics } from './card-font-metrics'
import type { WrapProfile } from './card-wrap'

/** Schema version of the stored overrides. */
export const CARD_LAYOUT_VERSION = 1

/**
 * Version of the DERIVATION, bumped whenever reading geometry out of an SVG
 * changes what it produces.
 *
 * Separate from the schema version because they change for different reasons: a
 * schema bump means stored data must be migrated, a derivation bump means every
 * derived box should be recomputed and re-assessed even though nothing stored
 * has changed.
 */
export const CARD_GEOMETRY_DERIVATION_VERSION = 1

/**
 * How far a card has got through layout, and what the renderer should do.
 *
 * The whole point of this enum is that 'derived' is not 'active'. A layout can
 * be proposed, inspected and stored without production rendering changing at
 * all, which is what makes it safe to derive across a live catalogue in one go.
 */
export type CardLayoutState =
  /** No layout. The in-place renderer handles this card, exactly as before. */
  | 'none'
  /** A layout has been derived and stored, but production still uses the in-place path. */
  | 'derived'
  /**
   * An admin has edited a layout that is not yet approved for production.
   *
   * Distinct from 'derived' because somebody has made choices here, and distinct
   * from 'active' because those choices must not reach a card until they are
   * activated. A card that was already active STAYS active while a draft exists:
   * the product row keeps both revision pointers, so editing never changes what
   * is being rendered right now.
   */
  | 'draft'
  /** Derivation found something ambiguous. A human must look before it can be activated. */
  | 'review_required'
  /** Production rendering uses the layout engine for this card. */
  | 'active'
  /** Derivation found something unsupported. This card cannot use the layout engine. */
  | 'blocked'

/** States in which the layout engine, rather than the in-place renderer, runs. */
export function usesLayoutEngine(state: CardLayoutState): boolean {
  return state === 'active'
}

/** How a value that does not fit its box is made to fit. */
export type FitStrategy = 'none' | 'shrink' | 'wrap' | 'shrink-then-wrap'

/** What to do when even the full ladder cannot make a value fit. */
export type OverflowPolicy = 'warn' | 'ellipsis'

/**
 * Whether the box's height is a constraint or an output.
 *
 * 'grow' is the derived default: the designer drew a one-line placeholder, and
 * its height says nothing about how far a wrapped value may extend. Only the
 * line budget bounds it. 'bound' means somebody has stated a height that must
 * be respected — an admin dragging a handle, or a field inside a group with
 * fixed bounds.
 */
export type HeightMode = 'grow' | 'bound'

export type VisibilityRule = {
  role: string
  op: 'present' | 'absent' | 'equals'
  value?: string
}

/**
 * What a field's value actually is, before any truthiness test collapses it.
 *
 * These four are genuinely different situations with different correct answers,
 * and JavaScript falsiness flattens all four into one. That flattening already
 * caused a real bug: an empty value was treated as "not visible", and the
 * serialiser deletes hidden fields — so a couple who left a contact blank would
 * have had the designer's copy silently removed.
 *
 *   unbound  no binding supplies this role at all. The layout field has
 *            outlived its mapping; the artwork's own copy is all there is.
 *   missing  the role IS bound, but the order supplied nothing for it. Usually
 *            a form not yet filled in.
 *   empty    the order supplied a deliberate blank. Different from `missing`:
 *            somebody cleared the box on purpose.
 *   present  there is content to lay out.
 */
export type FieldValueState =
  | { kind: 'unbound' }
  | { kind: 'missing' }
  | { kind: 'empty' }
  | { kind: 'present'; value: string }

/**
 * What to do about a value that is not there.
 *
 *   preserve-source  leave the designer's placeholder. The safe default, and
 *                    what the in-place renderer has always done.
 *   hide             remove the element. Right for an optional field whose
 *                    label would otherwise sit above nothing.
 *   render-empty     draw the field with no text, keeping any group space it
 *                    occupies. Rare, but a group's spacing sometimes depends on it.
 *   block            refuse. Right for a field the card is meaningless without —
 *                    a guest card addressed to nobody is not a card.
 */
export type EmptyValuePolicy = 'preserve-source' | 'hide' | 'render-empty' | 'block'

/** The same choices for a value that was never supplied. */
export type MissingValuePolicy = EmptyValuePolicy

/**
 * Which roles are worth blocking a card over when they have no value.
 *
 * Only the guest-scoped one. Every other role is either design copy the artwork
 * already carries, or genuinely optional — and blocking a release because a
 * couple has one contact number rather than two would be absurd.
 */
const REQUIRED_ROLES = new Set(['guest_name'])

/**
 * Roles whose element should disappear rather than keep a placeholder.
 *
 * A second contact or a table number left blank leaves the artwork showing
 * somebody else's phone number, which is worse than a gap.
 */
const HIDE_WHEN_ABSENT = /^(contact_2|table_number|venue_2_|landmark|dress_code)/

export function defaultEmptyPolicy(role: string): EmptyValuePolicy {
  if (REQUIRED_ROLES.has(role)) return 'block'
  if (HIDE_WHEN_ABSENT.test(role)) return 'hide'
  return 'preserve-source'
}

export function defaultMissingPolicy(role: string): MissingValuePolicy {
  // Deliberately NOT the same as the empty policy for optional fields. A form
  // not yet filled in is not the same statement as a box somebody cleared, and
  // hiding design copy because a couple has not reached that question yet would
  // silently change the card they are still working on.
  return REQUIRED_ROLES.has(role) ? 'block' : 'preserve-source'
}

/**
 * Classify a field's value.
 *
 * `boundRoles` is which roles the card's CURRENT bindings supply. A layout field
 * whose role is not among them is 'unbound' rather than 'missing': its mapping
 * has been removed, and nothing about the order can change that.
 */
export function valueStateFor(
  field: FieldLayout,
  values: Record<string, string>,
  boundRoles?: ReadonlySet<string>,
): FieldValueState {
  if (boundRoles && !boundRoles.has(field.role)) return { kind: 'unbound' }
  if (!(field.role in values)) return { kind: 'missing' }
  const value = (values[field.role] ?? '').trim()
  return value === '' ? { kind: 'empty' } : { kind: 'present', value }
}

/** The policy that applies to a given absent state. */
export function policyFor(field: FieldLayout, state: FieldValueState): EmptyValuePolicy {
  switch (state.kind) {
    // Nothing supplies this role any more, so no policy about the ORDER's data
    // can apply. The artwork's own copy is the only content there is.
    case 'unbound':
      return 'preserve-source'
    case 'missing':
      return field.onMissing
    case 'empty':
      return field.onEmpty
    case 'present':
      return 'render-empty'
  }
}

export type FieldFont = {
  families: string[]
  /** The designer's size, in local units. The starting point, and the ceiling. */
  size: number
  min: number
  max: number
  weight: number
  italic: boolean
  letterSpacing: number
  /** Multiplier on the face's natural line height. */
  lineHeight: number
}

export type FieldFit = {
  strategy: FitStrategy
  maxLines: number
  overflow: OverflowPolicy
  heightMode: HeightMode
  /** How far line spacing may be tightened before the value is refused. */
  minLineHeight: number
}

export type FieldLayout = {
  /** Stable identity, independent of the role. See rule 4 above. */
  id: string
  role: string
  /** The artwork layers this field came from, for diagnostics and re-derivation. */
  sourceLayerIds: string[]
  /**
   * The text element this drives: a layer id, or 'layer#2' for the second
   * <text> in a layer — the same addressing card-render.ts already accepts.
   */
  target: string
  /** In LOCAL units. */
  localBox: Rect
  /**
   * The baseline the designer set the first line on, in LOCAL units.
   *
   * Held separately from the box because a top-aligned field is pinned to it.
   * Deriving it from the box instead would move a shrunk single line upward — a
   * smaller face has a shorter ascent — so a name one point smaller would also
   * sit a fraction higher than the designer drew it.
   */
  baseline: number
  /** Local → canvas. Diagnostic and display; the engine never inverts it. */
  sourceCtm: Matrix
  align: 'left' | 'center' | 'right'
  vAlign: 'top' | 'middle' | 'bottom'
  font: FieldFont
  fit: FieldFit
  wrapProfile: WrapProfile
  /** What to do when the order supplied nothing for this role. */
  onMissing: MissingValuePolicy
  /** What to do when the order supplied a deliberate blank. */
  onEmpty: EmptyValuePolicy
  visibleIf: VisibilityRule | null
  group: string | null
  /** The designer's attribute string, so a regenerated <text> keeps its paint. */
  rawAttrs: string
  /**
   * False when the artwork forbids rebuilding this element.
   *
   * Such a field falls back to the in-place splice path, which CANNOT fit
   * anything — so it is never "handled", only written. A card containing one
   * must not be activated on the strength of its other fields being fine.
   */
  regenerable: boolean
  /** Why not, when `regenerable` is false. */
  regenerationBlocker: string | null
  /** True when the box was estimated because the face had no metrics. */
  estimated: boolean
}

export type LayoutGroup = {
  id: string
  /** Field ids, in the order they stack. */
  members: string[]
  direction: 'vertical'
  gap: number
  anchor: 'start' | 'center' | 'end'
  /** The extent the group may occupy, in local units, when it is bounded. */
  bounds: Rect | null
  /**
   * What happens when the members no longer fit `bounds`.
   *
   * 'block' refuses, so a reviewer sees it. 'compress-gap' closes the spacing
   * down to zero first and only then refuses. Nothing here ever silently
   * overflows the bounds.
   */
  overflow: 'block' | 'compress-gap'
  /** Whether hiding a member closes the gap it left, or leaves the hole. */
  collapseHidden: boolean
}

export type SafeZoneKind =
  | 'forbidden'
  | 'text-forbidden'
  | 'qr-forbidden'
  | 'preferred-content'
  | 'print-bleed'
  | 'print-safe-area'

export type SafeZone = {
  x: number
  y: number
  w: number
  h: number
  /** In CANVAS units: a zone is a property of the artwork, not of one field. */
  kind: SafeZoneKind
  note?: string
}

/** Where an overlay element sits in the artwork's stacking order. */
export type OverlayPlacement =
  | { kind: 'above-all' }
  | { kind: 'below-all' }
  | { kind: 'replace-layer'; layerId: string }
  | { kind: 'after-layer'; layerId: string }

export type OverlayElement = {
  id: string
  box: Rect
  z: number
  placement: OverlayPlacement
} & (
  | { type: 'qr'; source: string; quietZoneModules: number; errorCorrection: 'M' | 'Q' | 'H' }
  | { type: 'image'; href: string; fit: 'contain' | 'cover' }
  | { type: 'shape'; shape: 'rect' | 'ellipse'; fill: string; radius?: number }
)

/** Where a layout came from, so a later change can be reconciled with it. */
export type LayoutProvenance = {
  /** SHA-256 of the artwork the boxes were derived from. */
  artworkSha256: string
  derivationVersion: number
  derivedAt: string
}

/** The effective layout: derived from the artwork, with overrides applied. */
export type CardLayout = {
  version: number
  canvas: ViewBox | null
  /** Field id → layout. */
  fields: Record<string, FieldLayout>
  elements: OverlayElement[]
  groups: LayoutGroup[]
  safeZones: SafeZone[]
  provenance: LayoutProvenance | null
}

/**
 * What is actually stored on the product row.
 *
 * Only the admin's CHANGES, never the derived half. Storing the derived boxes
 * too would mean a re-exported artwork leaves the row describing geometry that
 * no longer exists, with no way to tell which parts a human had chosen and
 * which were merely copied from the old file.
 */
export type CardLayoutOverrides = {
  version: number
  provenance: LayoutProvenance | null
  fields: Record<string, Partial<FieldLayout>>
  elements: OverlayElement[]
  groups: LayoutGroup[]
  safeZones: SafeZone[]
}

export const EMPTY_OVERRIDES: CardLayoutOverrides = {
  version: CARD_LAYOUT_VERSION,
  provenance: null,
  fields: {},
  elements: [],
  groups: [],
  safeZones: [],
}

/** How far a field may shrink, as a fraction of the designer's size. */
const MIN_SIZE_RATIO = 0.6

/** Average advance as a fraction of the em, used only when a face has no metrics. */
const ESTIMATED_ADVANCE_RATIO = 0.52

/** The wrap profile a role's copy wants. */
export function defaultWrapProfile(role: string): WrapProfile {
  if (/name|hosts|couple|guest/i.test(role)) return 'guest-name'
  if (/venue|place|landmark/i.test(role)) return 'venue'
  if (/intro|message|invite_line/i.test(role)) return 'body'
  return 'single-line'
}

/**
 * The default fit policy for a role.
 *
 * Names are why this engine exists and get the full ladder. Dates, times and
 * short labels get 'shrink' only: wrapping '15 Agosti 2026' onto two lines
 * would be a worse card than setting it one point smaller.
 */
export function defaultFit(role: string): FieldFit {
  const profile = defaultWrapProfile(role)
  if (profile === 'guest-name') {
    return { strategy: 'shrink-then-wrap', maxLines: 3, overflow: 'warn', heightMode: 'grow', minLineHeight: 0.95 }
  }
  if (profile === 'venue' || profile === 'body') {
    return { strategy: 'shrink-then-wrap', maxLines: 2, overflow: 'warn', heightMode: 'grow', minLineHeight: 1 }
  }
  return { strategy: 'shrink', maxLines: 1, overflow: 'warn', heightMode: 'grow', minLineHeight: 1 }
}

function alignFor(anchor: TextAnchor): FieldLayout['align'] {
  return anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left'
}

/**
 * The box a run currently occupies, in local units.
 *
 * The anchor point is the run's BASELINE, so the box is raised by the ascent.
 * Getting this wrong is invisible in a preview that draws boxes and glaring the
 * moment a second line appears under the first.
 */
export function sampleBox(
  geometry: TextGeometry,
  metrics: FontMetrics | null,
): { box: Rect; estimated: boolean } {
  const { fontSize, anchor, anchorPoint, sampleText, letterSpacing } = geometry
  const characters = [...sampleText].length

  const width = metrics
    ? measureRun(sampleText, metrics, fontSize, letterSpacing).width
    : characters * fontSize * ESTIMATED_ADVANCE_RATIO + letterSpacing * Math.max(0, characters - 1)
  const height = metrics ? lineHeightFor(metrics, fontSize) : fontSize * 1.2
  const ascent = metrics ? (metrics.ascender / metrics.unitsPerEm) * fontSize : fontSize * 0.8

  const x =
    anchor === 'middle'
      ? anchorPoint.x - width / 2
      : anchor === 'end'
        ? anchorPoint.x - width
        : anchorPoint.x

  return {
    box: { x, y: anchorPoint.y - ascent, w: width, h: height },
    estimated: metrics === null,
  }
}

/** `fld_guest_name_1`, and `_2` for the same role appearing again. */
export function fieldId(role: string, ordinal: number): string {
  return `fld_${role}_${ordinal}`
}

/**
 * Build a layout for a card from its artwork.
 *
 * `bindings` is the existing role → layer map; layout never invents a field the
 * mapper has not already established, so the order-readiness gate in
 * card-field-roles.ts remains the only thing deciding whether a card can sell.
 *
 * A role whose binding resolves to SEVERAL text elements produces several
 * fields, one per element. That is what retires the `multi_layer` refusal — but
 * only for a human to confirm, because the two cases look identical from here:
 * a guest name repeated on a detachable stub, and 'Save the Date' set as three
 * separately positioned words. Both arrive as one role over three layers, and
 * only one of them should receive the value three times. The assessment in
 * card-text-compat.ts is what routes such a card to review.
 */
export function deriveLayout(
  geometry: { viewBox: ViewBox | null; texts: TextGeometry[] },
  bindings: { role: string; layerIds?: string[] }[],
  metricsFor: (text: TextGeometry) => FontMetrics | null = () => null,
  provenance: LayoutProvenance | null = null,
): CardLayout {
  // Both keys are offered because a binding written before layout existed names
  // the layer, while one written since may name a specific <text> node.
  const byTarget = new Map<string, TextGeometry>()
  for (const text of geometry.texts) {
    if (text.textKey && !byTarget.has(text.textKey)) byTarget.set(text.textKey, text)
    if (text.layerId && !byTarget.has(text.layerId)) byTarget.set(text.layerId, text)
  }

  const fields: Record<string, FieldLayout> = {}

  for (const binding of bindings) {
    const targets = (binding.layerIds ?? []).filter((id) => byTarget.has(id))
    targets.forEach((target, index) => {
      const text = byTarget.get(target)!
      const metrics = metricsFor(text)
      const { box, estimated } = sampleBox(text, metrics)
      const id = fieldId(binding.role, index + 1)

      fields[id] = {
        id,
        role: binding.role,
        sourceLayerIds: [target],
        target,
        localBox: box,
        baseline: text.anchorPoint.y,
        sourceCtm: text.ctm,
        align: alignFor(text.anchor),
        // A single-line field sits ON its baseline; anything that may gain lines
        // grows downward from where the designer put the first one.
        vAlign: 'top',
        font: {
          families: text.families,
          size: text.fontSize,
          min: round(text.fontSize * MIN_SIZE_RATIO),
          max: text.fontSize,
          weight: text.weight,
          italic: text.italic,
          letterSpacing: text.letterSpacing,
          lineHeight: 1,
        },
        fit: defaultFit(binding.role),
        wrapProfile: defaultWrapProfile(binding.role),
        onMissing: defaultMissingPolicy(binding.role),
        onEmpty: defaultEmptyPolicy(binding.role),
        visibleIf: null,
        group: null,
        rawAttrs: text.rawAttrs,
        regenerable: text.refuseRegeneration === null,
        regenerationBlocker: text.refuseRegeneration,
        estimated,
      }
    })
  }

  return {
    version: CARD_LAYOUT_VERSION,
    canvas: geometry.viewBox,
    fields,
    elements: [],
    groups: [],
    safeZones: [],
    provenance,
  }
}

/**
 * Apply an admin's stored changes to a freshly derived layout.
 *
 * The derived half is always recomputed from the CURRENT artwork, so a
 * re-export is picked up without a migration. Overrides are applied per field,
 * and a field whose source layer the artwork no longer has is DROPPED rather
 * than kept: a box pinned to a layer that is gone would position text against
 * nothing.
 */
export function applyOverrides(
  derived: CardLayout,
  stored: Partial<CardLayoutOverrides> | null,
): CardLayout {
  if (!stored || typeof stored !== 'object') return derived

  const fields: Record<string, FieldLayout> = { ...derived.fields }
  for (const [id, override] of Object.entries(stored.fields ?? {})) {
    const base = derived.fields[id]
    if (!base) continue
    fields[id] = {
      ...base,
      ...override,
      id: base.id,
      role: base.role,
      font: { ...base.font, ...override.font },
      fit: { ...base.fit, ...override.fit },
      // Never trust a stored value for these three. All are properties of the
      // CURRENT artwork, and a stale copy would let a filtered or re-exported
      // layer be regenerated on the strength of an old scan.
      rawAttrs: base.rawAttrs,
      regenerable: base.regenerable,
      regenerationBlocker: base.regenerationBlocker,
      sourceLayerIds: base.sourceLayerIds,
      target: base.target,
    }
  }

  return {
    version: CARD_LAYOUT_VERSION,
    canvas: derived.canvas,
    fields,
    elements: stored.elements ?? [],
    groups: stored.groups ?? [],
    safeZones: stored.safeZones ?? [],
    provenance: derived.provenance,
  }
}

/** Whether a field should be drawn at all, given the order's values. */
export function isVisible(field: FieldLayout, values: Record<string, string>): boolean {
  const rule = field.visibleIf
  if (!rule) return true
  const value = (values[rule.role] ?? '').trim()
  if (rule.op === 'present') return value !== ''
  if (rule.op === 'absent') return value === ''
  return value === (rule.value ?? '').trim()
}

export type GroupStack = {
  /** Field id → the top edge it should now sit at, in local units. */
  tops: Record<string, number>
  /** Set when the members cannot be made to fit the group's bounds. */
  overflowedBy: number
  gap: number
}

/**
 * Re-stack a group's members against their FITTED heights.
 *
 * Returns positions; it never rewrites a stored box. The stored geometry is
 * what the designer and the admin chose, and a value that happens to be long
 * this order must not edit it for the next one.
 *
 * `heights` is the fitted height of each member. A member with no entry is not
 * drawn for this order, and — when the group collapses hidden members — takes
 * no space, which is what makes conditional visibility and auto-layout compose.
 */
export function stackGroup(
  group: LayoutGroup,
  fields: Record<string, FieldLayout>,
  heights: Record<string, number>,
): GroupStack {
  const present = group.members.filter(
    (id) => fields[id] && (heights[id] !== undefined || !group.collapseHidden),
  )
  if (present.length === 0) return { tops: {}, overflowedBy: 0, gap: group.gap }

  const heightOf = (id: string) => heights[id] ?? 0
  const content = present.reduce((sum, id) => sum + heightOf(id), 0)

  const extent =
    group.bounds ??
    (() => {
      const tops = present.map((id) => fields[id].localBox.y)
      const bottoms = present.map((id) => fields[id].localBox.y + fields[id].localBox.h)
      const top = Math.min(...tops)
      return { x: 0, y: top, w: 0, h: Math.max(...bottoms) - top }
    })()

  const gapCount = Math.max(0, present.length - 1)
  let gap = group.gap
  let overflowedBy = 0

  if (group.bounds) {
    const needed = content + gap * gapCount
    if (needed > group.bounds.h) {
      if (group.overflow === 'compress-gap' && gapCount > 0) {
        // Close the spacing down, but never past zero: overlapping lines are
        // never an improvement on a reported overflow.
        gap = Math.max(0, (group.bounds.h - content) / gapCount)
      }
      overflowedBy = Math.max(0, content + gap * gapCount - group.bounds.h)
    }
  }

  const total = content + gap * gapCount
  let cursor =
    group.anchor === 'start'
      ? extent.y
      : group.anchor === 'end'
        ? extent.y + extent.h - total
        : extent.y + (extent.h - total) / 2

  const tops: Record<string, number> = {}
  for (const id of present) {
    tops[id] = cursor
    cursor += heightOf(id) + gap
  }
  return { tops, overflowedBy, gap }
}

/** A field's box in canvas space, as four corners. Rotation-safe. */
export function boxInCanvas(field: FieldLayout): Point[] {
  const { x, y, w, h } = field.localBox
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ].map((point) => applyMatrix(field.sourceCtm, point))
}

/** A field's rendered size in canvas units, for a legible size readout. */
export function fontSizeInCanvas(field: FieldLayout, size = field.font.size): number {
  return size * matrixScale(field.sourceCtm)
}

export { IDENTITY }

function round(value: number): number {
  return Math.round(value * 100) / 100
}
