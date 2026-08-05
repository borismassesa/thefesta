// Whether a piece of artwork can safely be laid out, and how confident we are.
//
// This module is the SINGLE authority on that question. Compatibility decisions
// were previously scattered — geometry extraction refused some constructs, the
// renderer refused others, and validation warned about a third set — and three
// places deciding the same thing is three places that can disagree about
// whether a card is safe to sell.
//
// It exists because of a specific rollout risk. Deriving a layout for ~130
// catalogue cards is easy; ACTIVATING the layout engine on all of them is not.
// SVG text geometry is far less uniform than it looks: nested transforms, text
// converted to paths, per-character rotation, textLength, mixed faces inside a
// run, manual kerning across tspans, CSS specificity, gradients, clips, masks.
// A card that trips any of those must not quietly become production-authoritative
// because a scan happened to succeed.
//
// So derivation produces a PROPOSAL plus an assessment, and only the clearly
// supported cohort is eligible for automatic activation. Everything else routes
// to a human or is refused outright.
//
// One rule worth stating plainly, because it is the easy mistake:
//
//   FALLING BACK TO THE IN-PLACE RENDERER DOES NOT FIX OVERFLOW.
//
// A field that cannot be regenerated is written by card-render.ts, which
// substitutes character data and cannot change a size or add a line. Such a
// field is `splice_only`: it still works exactly as well as it did before, and
// exactly as badly for a long name. It must never be reported as handled.

import type { RegenerationRefusal, TextGeometry } from './card-geometry'
import type { CardLayout, CardLayoutState, FieldLayout } from './card-layout'

export type RegenerationMode =
  /** Safe to rebuild. The layout engine can fit this field. */
  | 'regeneratable'
  /** Writable in place only, so it can never be fitted. */
  | 'splice_only'
  /** Glyphs follow a path. A different layout model entirely. */
  | 'path_text'
  /** Nothing sensible can be done with this field. */
  | 'unsupported'

export type Confidence = 'high' | 'medium' | 'low'

export type FieldAssessment = {
  fieldId: string
  role: string
  mode: RegenerationMode
  confidence: Confidence
  reasons: string[]
}

export type GeometryAssessment = {
  confidence: Confidence
  /** The weakest mode among the card's fields — a card is as safe as its worst field. */
  mode: RegenerationMode
  reasons: string[]
  fields: FieldAssessment[]
  /**
   * What state this card should be moved to.
   *
   * Only 'active' is automatic, and only for a card where every field is
   * high-confidence regeneratable.
   */
  recommendedState: CardLayoutState
}

/** How each refusal from the geometry walk maps onto a mode. */
const REFUSAL_MODES: Record<RegenerationRefusal, RegenerationMode> = {
  text_path: 'path_text',
  filtered: 'splice_only',
  text_length: 'splice_only',
  per_char_rotate: 'unsupported',
  writing_mode: 'unsupported',
  mixed_fonts: 'splice_only',
  no_font: 'unsupported',
  no_position: 'unsupported',
}

const REFUSAL_REASONS: Record<RegenerationRefusal, string> = {
  text_path: 'text is laid along a path',
  filtered: 'a filter, mask or clip is sized around the current text',
  text_length: 'textLength/lengthAdjust stretches the run to an exact width',
  per_char_rotate: 'characters are rotated individually',
  writing_mode: 'the run uses vertical or bidi-overridden writing',
  mixed_fonts: 'the run mixes more than one typeface',
  no_font: 'no typeface resolved, so nothing can be measured',
  no_position: 'the run is positioned only by dx/dy, so it has no anchor',
}

const MODE_SEVERITY: Record<RegenerationMode, number> = {
  regeneratable: 0,
  splice_only: 1,
  path_text: 2,
  unsupported: 3,
}

const CONFIDENCE_SEVERITY: Record<Confidence, number> = { high: 0, medium: 1, low: 2 }

/**
 * How far a transform may depart from a plain translate-and-scale before the
 * derived geometry stops being trustworthy.
 *
 * A rotated or skewed run still MEASURES correctly — everything happens in the
 * element's local space — but a box drawn over it in the Studio would not line
 * up with what an admin sees, and rotated text is explicitly out of scope for
 * the first phase. So it downgrades confidence rather than blocking.
 */
const SQUARE_TOLERANCE = 1e-6

function isAxisAligned(ctm: FieldLayout['sourceCtm']): boolean {
  return Math.abs(ctm[1]) < SQUARE_TOLERANCE && Math.abs(ctm[2]) < SQUARE_TOLERANCE
}

/**
 * Assess one card's derived layout.
 *
 * `texts` is the geometry the layout was derived from, so a field can be
 * checked against the element it actually came from rather than against what
 * was stored about it.
 */
export function assessCardGeometry(
  layout: CardLayout,
  texts: TextGeometry[],
): GeometryAssessment {
  const fields = Object.values(layout.fields).map((field) => assessField(field, layout))
  const reasons: string[] = []

  if (fields.length === 0) {
    return {
      confidence: 'low',
      mode: 'unsupported',
      reasons: ['no mapped field resolves to a text element in this artwork'],
      fields,
      recommendedState: 'blocked',
    }
  }

  const mode = fields.reduce<RegenerationMode>(
    (worst, field) => (MODE_SEVERITY[field.mode] > MODE_SEVERITY[worst] ? field.mode : worst),
    'regeneratable',
  )
  let confidence = fields.reduce<Confidence>(
    (worst, field) =>
      CONFIDENCE_SEVERITY[field.confidence] > CONFIDENCE_SEVERITY[worst] ? field.confidence : worst,
    'high',
  )

  if (!layout.canvas) {
    reasons.push('the artwork declares no viewBox, so canvas coordinates are unknown')
    confidence = 'low'
  }

  // Manual kerning across many tspans is legal and common, and regenerating it
  // collapses the run to one span. That is usually right and occasionally not,
  // so it lowers confidence rather than blocking.
  const heavilyKerned = texts.filter((text) => text.tspans > 4).length
  if (heavilyKerned > 0) {
    reasons.push(`${heavilyKerned} run(s) are kerned across more than four tspans`)
    if (confidence === 'high') confidence = 'medium'
  }

  for (const field of fields) {
    for (const reason of field.reasons) reasons.push(`${field.role}: ${reason}`)
  }

  return {
    confidence,
    mode,
    reasons,
    fields,
    recommendedState: recommendState(mode, confidence),
  }
}

/**
 * The state an assessment justifies.
 *
 * Automatic activation is deliberately the narrowest outcome: everything must
 * be regeneratable AND high-confidence. Anything else is a human's decision,
 * and 'unsupported' is not a decision anyone can make.
 */
export function recommendState(mode: RegenerationMode, confidence: Confidence): CardLayoutState {
  if (mode === 'unsupported') return 'blocked'
  if (mode === 'regeneratable' && confidence === 'high') return 'active'
  return 'review_required'
}

function assessField(field: FieldLayout, layout: CardLayout): FieldAssessment {
  const reasons: string[] = []
  let mode: RegenerationMode = 'regeneratable'
  let confidence: Confidence = 'high'

  if (field.regenerationBlocker) {
    const refusal = field.regenerationBlocker as RegenerationRefusal
    mode = REFUSAL_MODES[refusal] ?? 'unsupported'
    reasons.push(REFUSAL_REASONS[refusal] ?? `unsupported construct (${refusal})`)
    confidence = 'low'
  }

  if (field.estimated) {
    // The box was guessed from an average advance width because the face had no
    // metrics. It is a starting point for a human, not a number to sell against.
    reasons.push('the box was estimated because its typeface has no metrics')
    confidence = worse(confidence, 'medium')
  }

  if (!isAxisAligned(field.sourceCtm)) {
    reasons.push('the run is rotated or skewed, which the first phase does not support')
    confidence = 'low'
  }

  // The ambiguity this whole assessment exists for. One role over several text
  // elements is either a deliberate repetition (a guest name on a detachable
  // stub) or one phrase set as separate words ('Save the Date'). They are
  // indistinguishable from here, and writing the value three times is wrong for
  // exactly one of them.
  const siblings = Object.values(layout.fields).filter((other) => other.role === field.role)
  if (siblings.length > 1) {
    reasons.push(
      `this role covers ${siblings.length} separate text elements; confirm whether the value should be repeated in each or whether they are one phrase`,
    )
    confidence = 'low'
  }

  if (field.localBox.w <= 0 || field.localBox.h <= 0) {
    reasons.push('the derived box has no area')
    mode = 'unsupported'
    confidence = 'low'
  }

  return { fieldId: field.id, role: field.role, mode, confidence, reasons }
}

function worse(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_SEVERITY[a] >= CONFIDENCE_SEVERITY[b] ? a : b
}
