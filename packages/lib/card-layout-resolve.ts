// Turning a layout and a set of values into exactly what will be drawn.
//
// This is the seam the whole engine hangs on. Everything upstream is EDITABLE
// (boxes, policies, rules); everything downstream is a serialisation step with
// no decisions left in it. In between sits one deterministic function producing
// a CardRenderPlan: the exact lines, coordinates, sizes and visibility results.
//
// Splitting it out this way buys five things that are hard to get otherwise:
//
//   • The Studio preview and the server render compare the same OBJECT, not two
//     SVG strings that happen to look alike. A preview that disagrees with the
//     render is the failure this engine exists to prevent, and it is now a
//     one-line assertion rather than an aspiration.
//   • Freeze-time validation runs on actual rendered decisions rather than on
//     editable constraints, so it can say "this line, at this size, overruns by
//     4 units" instead of "this box might be too small".
//   • Tests snapshot the plan instead of parsing SVG.
//   • Diagnostics carry the field, the value, the rule and the failed constraint.
//   • PNG, PDF and wallet outputs can consume the same resolution later without
//     re-deriving any of it.
//
// The plan is pure data and JSON-safe on purpose: it is what gets compared,
// logged, and (in part) frozen onto a release.

import { fitText, isBlockingFit, type FitStatus, type FitTolerance, DEFAULT_FIT_TOLERANCE } from './card-fit'
import type { FontMetrics } from './card-font-metrics'
import type { Matrix, Rect } from './card-geometry'
import {
  isVisible,
  policyFor,
  stackGroup,
  usesLayoutEngine,
  valueStateFor,
  type CardLayout,
  type CardLayoutState,
  type FieldLayout,
  type OverlayElement,
} from './card-layout'

export const CARD_RENDER_PLAN_VERSION = 1

/** Identifies the code that produced a plan, so an old one can be reproduced. */
export const RENDERER_VERSION = 'card-layout-render@1'
export const FIT_VERSION = 'card-fit@1'

export type LayoutDiagnosticCode =
  | 'FONT_METRICS_MISSING'
  | 'GLYPH_UNSUPPORTED'
  | 'TEXT_OVERFLOW'
  | 'TEXT_CLIPPED'
  | 'TEXT_SHRUNK_HARD'
  | 'GROUP_OVERFLOW'
  | 'SAFE_ZONE_INTERSECTION'
  | 'BOX_OUTSIDE_CANVAS'
  | 'BOX_DEGENERATE'
  | 'BOXES_OVERLAP'
  | 'UNSUPPORTED_TEXT_EFFECT'
  | 'SOURCE_LAYER_MISSING'
  | 'LAYOUT_NOT_ACTIVE'
  | 'REQUIRED_VALUE_ABSENT'
  | 'QR_QUIET_ZONE'
  | 'QR_TOO_SMALL'
  | 'ARTWORK_SHA_MISMATCH'

export type LayoutDiagnostic = {
  code: LayoutDiagnosticCode
  severity: 'warning' | 'blocker'
  fieldId?: string
  role?: string
  guestId?: string
  message: string
  details?: Record<string, unknown>
}

export type ResolvedLine = {
  text: string
  x: number
  baselineY: number
  width: number
}

export type ResolvedTextField = {
  fieldId: string
  role: string
  sourceLayerIds: string[]
  target: string
  /**
   * What the serialiser should do with this field's source element.
   *
   * Four outcomes, not a boolean, because the four value states have four
   * different correct answers and flattening them is what previously made an
   * empty value delete the designer's copy:
   *
   *   drawn        replace the element with the resolved lines
   *   placeholder  leave the artwork's own copy exactly as it is
   *   empty        replace it with an element holding no text
   *   hidden       remove it
   */
  presence: FieldPresence
  /**
   * False when this field cannot be rebuilt and must be written by the in-place
   * renderer instead. Such a field is NOT fitted, and a long value will still
   * overflow exactly as it does today.
   */
  regenerable: boolean
  /** In LOCAL units. Height is the fitted block height, not the stored box. */
  box: Rect
  /** Local → canvas, carried so a consumer never has to look the field up again. */
  ctm: Matrix
  lines: ResolvedLine[]
  font: {
    families: string[]
    size: number
    weight: number
    italic: boolean
    letterSpacing: number
    lineHeight: number
  }
  /** The designer's attributes, for the serialiser to carry through. */
  rawAttrs: string
  fitStatus: FitStatus
}

export type FieldPresence = 'drawn' | 'placeholder' | 'empty' | 'hidden'

export type ResolvedElement = OverlayElement & { visible: boolean }

export type CardRenderPlan = {
  version: number
  rendererVersion: string
  fitVersion: string
  /** Whether this plan should actually drive rendering, or is only a proposal. */
  state: CardLayoutState
  canvas: { width: number; height: number } | null
  fields: Record<string, ResolvedTextField>
  elements: ResolvedElement[]
  /** Fields left to the in-place renderer, with the values they need. */
  deferredRoles: string[]
  warnings: LayoutDiagnostic[]
  blockers: LayoutDiagnostic[]
}

/** Below this fraction of the designer's size, a field stops looking deliberate. */
const HARD_SHRINK_RATIO = 0.75

export type ResolveOptions = {
  layout: CardLayout
  state: CardLayoutState
  values: Record<string, string>
  metricsFor: (field: FieldLayout) => FontMetrics | null
  tolerance?: FitTolerance
  /** Attached to every diagnostic, so a per-guest failure names the guest. */
  guestId?: string
  /**
   * Roles the card's CURRENT bindings supply.
   *
   * A layout field whose role is not among them is 'unbound': its mapping has
   * been removed, so no policy about the ORDER's data applies and the artwork's
   * own copy is the only content there is. Omit to skip the distinction.
   */
  boundRoles?: ReadonlySet<string>
}

/**
 * Resolve a layout against a set of values.
 *
 * Deterministic: the same inputs produce the same plan, byte for byte, wherever
 * it runs. That is the contract the Studio preview and the freeze gate both
 * depend on, and it is why nothing here reads a clock, a random source, or any
 * state outside its arguments.
 */
export function resolveCardLayout(options: ResolveOptions): CardRenderPlan {
  const {
    layout,
    state,
    values,
    metricsFor,
    tolerance = DEFAULT_FIT_TOLERANCE,
    guestId,
    boundRoles,
  } = options

  const warnings: LayoutDiagnostic[] = []
  const blockers: LayoutDiagnostic[] = []
  const fields: Record<string, ResolvedTextField> = {}
  const deferredRoles = new Set<string>()

  const note = (
    severity: 'warning' | 'blocker',
    code: LayoutDiagnosticCode,
    message: string,
    field?: FieldLayout,
    details?: Record<string, unknown>,
  ) => {
    const entry: LayoutDiagnostic = {
      code,
      severity,
      message,
      ...(field ? { fieldId: field.id, role: field.role } : {}),
      ...(guestId ? { guestId } : {}),
      ...(details ? { details } : {}),
    }
    ;(severity === 'blocker' ? blockers : warnings).push(entry)
  }

  // A layout that has only been DERIVED is a proposal. Resolving it is how the
  // Studio and the shadow-mode assessment inspect it; it must not silently
  // become what production draws.
  if (!usesLayoutEngine(state)) {
    note(
      'warning',
      'LAYOUT_NOT_ACTIVE',
      `This card's layout is '${state}', so production rendering still uses the in-place renderer.`,
    )
  }

  // ── Fit every field first ──
  //
  // A group's members are re-stacked against each other's FINAL heights, so
  // nothing can be positioned until all of them are measured.
  type Fitted = { field: FieldLayout; fit: ReturnType<typeof fitText>; presence: FieldPresence }
  const fitted: Fitted[] = []

  for (const field of Object.values(layout.fields)) {
    if (!field.regenerable) {
      // Deferring is not fixing. The in-place renderer writes the value and
      // cannot resize it, so a long value here overflows exactly as before.
      deferredRoles.add(field.role)
      note(
        'warning',
        'UNSUPPORTED_TEXT_EFFECT',
        `${field.role} cannot be rebuilt (${field.regenerationBlocker}), so it is written in place and cannot be fitted.`,
        field,
      )
      fields[field.id] = deferredField(field)
      continue
    }

    // A visibility RULE overrides everything: an admin set it deliberately.
    const ruleSaysVisible = isVisible(field, values)
    const state = valueStateFor(field, values, boundRoles)

    if (!ruleSaysVisible) {
      fitted.push({ field, fit: blank(field, metricsFor(field), tolerance), presence: 'hidden' })
      continue
    }

    if (state.kind !== 'present') {
      // Four distinct situations, four possible answers. Collapsing them into a
      // truthiness test is what previously made an empty value delete the
      // designer's copy.
      const policy = policyFor(field, state)

      if (policy === 'block') {
        note(
          'blocker',
          'REQUIRED_VALUE_ABSENT',
          state.kind === 'empty'
            ? `${field.role} was left blank, and this card cannot be produced without it.`
            : `${field.role} has no value, and this card cannot be produced without it.`,
          field,
          { valueState: state.kind },
        )
      }

      fitted.push({
        field,
        fit: blank(field, metricsFor(field), tolerance),
        presence:
          policy === 'hide' ? 'hidden' : policy === 'render-empty' ? 'empty' : 'placeholder',
      })
      continue
    }

    const value = state.value
    const fit = fitText(field, value, metricsFor(field), tolerance)
    fitted.push({ field, fit, presence: 'drawn' })

    if (fit.status === 'unmeasurable') {
      const missing = fit.missingGlyphs
      note(
        'blocker',
        missing.length > 0 ? 'GLYPH_UNSUPPORTED' : 'FONT_METRICS_MISSING',
        missing.length > 0
          ? `${field.role}'s typeface cannot draw ${missing.map((cp) => String.fromCodePoint(cp)).join(' ')}. Substitution happens one character at a time, so the result cannot be predicted.`
          : `${field.role}'s typeface has no measurements, so we cannot promise its text fits.`,
        field,
        { value, missingGlyphs: missing },
      )
    } else if (fit.status === 'overflow') {
      note(
        'blocker',
        'TEXT_OVERFLOW',
        `"${value}" does not fit ${field.role}: it overruns by ${round(fit.overshoot)} units.`,
        field,
        { value, overshoot: fit.overshoot, heightOvershoot: fit.heightOvershoot },
      )
    } else if (fit.status === 'clipped') {
      note('warning', 'TEXT_CLIPPED', `"${value}" was truncated to fit ${field.role}.`, field, { value })
    }

    if (fit.status !== 'overflow' && fit.fontSize < field.font.size * HARD_SHRINK_RATIO) {
      note(
        'warning',
        'TEXT_SHRUNK_HARD',
        `${field.role} shrinks to ${fit.fontSize} (from ${field.font.size}) to fit "${value}". Consider widening the box.`,
        field,
        { value, fittedSize: fit.fontSize },
      )
    }
  }

  // ── Re-stack groups against the fitted heights ──
  const tops: Record<string, number> = {}
  for (const group of layout.groups) {
    const heights: Record<string, number> = {}
    for (const item of fitted) {
      if (item.field.group !== group.id) continue
      // A hidden member takes no space; one drawn or held open does.
      if (item.presence !== 'hidden') heights[item.field.id] = item.fit.height
    }
    const stacked = stackGroup(group, layout.fields, heights)
    Object.assign(tops, stacked.tops)
    if (stacked.overflowedBy > 0) {
      note(
        'blocker',
        'GROUP_OVERFLOW',
        `Group ${group.id} needs ${round(stacked.overflowedBy)} more units than its bounds allow.`,
        undefined,
        { groupId: group.id, overflowedBy: stacked.overflowedBy },
      )
    }
  }

  // ── Place the lines ──
  for (const { field, fit, presence } of fitted) {
    const x =
      field.align === 'left'
        ? field.localBox.x
        : field.align === 'right'
          ? field.localBox.x + field.localBox.w
          : field.localBox.x + field.localBox.w / 2

    const first = firstBaseline(field, fit.height, fit.ascent, tops[field.id])
    const lines: ResolvedLine[] = fit.lines.map((text, index) => ({
      text,
      x: round(x),
      baselineY: round(first + index * fit.lineHeight),
      width: round(fit.widths[index] ?? 0),
    }))

    fields[field.id] = {
      fieldId: field.id,
      role: field.role,
      sourceLayerIds: field.sourceLayerIds,
      target: field.target,
      presence,
      regenerable: true,
      box: {
        x: round(field.localBox.x),
        y: round(first - fit.ascent),
        w: round(field.localBox.w),
        h: round(fit.height || field.localBox.h),
      },
      ctm: field.sourceCtm,
      lines,
      font: {
        families: field.font.families,
        size: fit.fontSize,
        weight: field.font.weight,
        italic: field.font.italic,
        letterSpacing: field.font.letterSpacing,
        lineHeight: round(fit.lineHeight),
      },
      rawAttrs: field.rawAttrs,
      fitStatus: fit.status,
    }
  }

  return {
    version: CARD_RENDER_PLAN_VERSION,
    rendererVersion: RENDERER_VERSION,
    fitVersion: FIT_VERSION,
    state,
    canvas: layout.canvas ? { width: layout.canvas.width, height: layout.canvas.height } : null,
    fields,
    elements: layout.elements.map((element) => ({ ...element, visible: true })),
    deferredRoles: [...deferredRoles],
    warnings,
    blockers,
  }
}

/** True when nothing in the plan blocks. Warnings never stop a release. */
export function planIsReleasable(plan: CardRenderPlan): boolean {
  return plan.blockers.length === 0
}

/** Fields whose fit status must stop a release. */
export function planBlockingFields(plan: CardRenderPlan): ResolvedTextField[] {
  return Object.values(plan.fields).filter((field) => isBlockingFit(field.fitStatus))
}

/**
 * Where the first line's baseline goes.
 *
 * A top-aligned field keeps the designer's baseline, so shrinking changes the
 * size and NOTHING else. Only a group re-stack, or an explicit middle/bottom
 * alignment, moves it.
 *
 * The ascent comes from the face's own metrics rather than being assumed: an
 * SVG <text> y is a BASELINE, not a top edge, and treating it as a top edge is
 * the single highest-risk mistake available in this whole module.
 */
function firstBaseline(
  field: FieldLayout,
  height: number,
  ascent: number,
  groupTop: number | undefined,
): number {
  if (groupTop !== undefined) return groupTop + ascent
  if (field.vAlign === 'top') return field.baseline

  const top =
    field.vAlign === 'middle'
      ? field.localBox.y + (field.localBox.h - height) / 2
      : field.localBox.y + field.localBox.h - height
  return top + ascent
}

/** A zero-line fit, for a field with nothing to draw. */
function blank(
  field: FieldLayout,
  metrics: FontMetrics | null,
  tolerance: FitTolerance,
): ReturnType<typeof fitText> {
  return fitText(field, '', metrics, tolerance)
}

/** A field the plan is deliberately not laying out. */
function deferredField(field: FieldLayout): ResolvedTextField {
  return {
    fieldId: field.id,
    role: field.role,
    sourceLayerIds: field.sourceLayerIds,
    target: field.target,
    presence: 'placeholder',
    regenerable: false,
    box: field.localBox,
    ctm: field.sourceCtm,
    lines: [],
    font: {
      families: field.font.families,
      size: field.font.size,
      weight: field.font.weight,
      italic: field.font.italic,
      letterSpacing: field.font.letterSpacing,
      lineHeight: field.font.lineHeight,
    },
    rawAttrs: field.rawAttrs,
    fitStatus: 'empty',
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
