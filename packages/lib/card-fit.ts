// Making a value fit its box, or refusing to pretend it does.
//
// The search is a BINARY SEARCH over integer hundredths of a unit, not a walk
// down in half-point steps. Three reasons, in order of how much they matter:
//
//   1. It finds the LARGEST size that fits, rather than the first one a
//      decrementing loop happens to land on. A name set as large as it can be
//      is the whole point.
//   2. It is exactly reproducible. Integer subunits mean no floating-point
//      accumulation, so the Studio and the server cannot drift apart by a step.
//   3. It is ~6 probes instead of ~40, which matters when a print run fits the
//      same field for two hundred guests.
//
// The ladder is still a ladder — the search is just how each rung is climbed:
//
//   does it fit as drawn?                        → done
//   largest size that fits on one line            → 'shrunk'
//   largest size that fits within the line budget → 'wrapped' or 'shrunk'
//   otherwise: truncate, or REPORT AND STOP
//
// The last rung is the important one. A wedding invitation goes to hundreds of
// guests and cannot be recalled, so a value that cannot be made to fit is
// reported and blocks the release, exactly as an unmappable field already
// blocks an order.
//
// A MISSING GLYPH BLOCKS TOO. Substitution is per character, so a face lacking
// one letter produces a script name with a single serif letter in the middle of
// it. Measuring such a run against a fallback advance would give a confident
// number for a rendering we cannot predict, so it is reported as unmeasurable
// rather than guessed.

import { measureRun, lineHeightFor, type FontMetrics } from './card-font-metrics'
import type { FieldLayout } from './card-layout'
import { wrapText, WRAP_PROFILES } from './card-wrap'

export type FitStatus =
  /** Fitted at the designer's size, on the designer's number of lines. */
  | 'fits'
  /** Fitted, but on more lines than the artwork had. */
  | 'wrapped'
  /** Fitted, but at a smaller size or tighter spacing than the designer chose. */
  | 'shrunk'
  /** Truncated with an ellipsis, per an explicit 'ellipsis' policy. */
  | 'clipped'
  /** Could not be made to fit. A blocker. */
  | 'overflow'
  /** No honest answer is possible: no metrics, or a glyph the face lacks. */
  | 'unmeasurable'
  /** No value supplied. Not an error — the field is simply not drawn. */
  | 'empty'

export type FitResult = {
  status: FitStatus
  /** The lines to draw, in order. Empty when there is nothing to draw. */
  lines: string[]
  /** Rendered width of each line, in local units. */
  widths: number[]
  /** The size actually used, in local units. */
  fontSize: number
  /** Absolute baseline-to-baseline distance, in local units. */
  lineHeight: number
  /** Total block height, i.e. what a group re-stack has to make room for. */
  height: number
  /** Distance from the block's top edge to the first baseline. */
  ascent: number
  /** Code points the resolved face has no glyph for. */
  missingGlyphs: number[]
  /** How far the widest line exceeds the usable width. Zero when it fits. */
  overshoot: number
  /** How far the block exceeds a bounded height. Zero when it fits or may grow. */
  heightOvershoot: number
}

/**
 * How much of the box to actually fit against.
 *
 * We measure advances only: no kerning, no ligatures, no shaping (see
 * card-font-metrics.ts), while resvg applies kerning and ligatures. On the
 * catalogue's Latin faces the disagreement is a fraction of a percent and it
 * can go EITHER way, so the reserve is not a one-sided correction — it is a
 * band wide enough to cover the observed spread.
 *
 * Deliberately a parameter rather than a constant. The right number is a
 * property of the font catalogue, and the raster contract test is what
 * establishes it; a hidden 0.98 would quietly become unfalsifiable.
 */
export type FitTolerance = {
  widthSafetyRatio: number
  heightSafetyRatio: number
}

export const DEFAULT_FIT_TOLERANCE: FitTolerance = {
  widthSafetyRatio: 0.98,
  heightSafetyRatio: 0.98,
}

/**
 * Font sizes are searched as integer hundredths of a unit.
 *
 * Exact reproducibility is the point: two implementations doing the same
 * integer bisection cannot disagree, whereas two floating-point loops
 * accumulating 0.5 can.
 */
const FONT_SCALE = 100

const ELLIPSIS = '…'

export function fitText(
  field: FieldLayout,
  value: string,
  metrics: FontMetrics | null,
  tolerance: FitTolerance = DEFAULT_FIT_TOLERANCE,
): FitResult {
  const text = value.trim()
  const usableWidth = field.localBox.w * tolerance.widthSafetyRatio
  const boundHeight =
    field.fit.heightMode === 'bound' ? field.localBox.h * tolerance.heightSafetyRatio : Infinity

  if (!text) return blank('empty', field, metrics)
  if (!metrics) {
    const unmeasurable = blank('unmeasurable', field, null)
    return { ...unmeasurable, lines: [text], height: unmeasurable.lineHeight }
  }

  // Coverage is checked BEFORE anything is measured. A face missing one glyph
  // renders a name we cannot predict, and a width computed over a fallback
  // advance would be a confident number for the wrong picture.
  const coverage = measureRun(text, metrics, field.font.size, field.font.letterSpacing)
  if (coverage.missing.length > 0) {
    const unmeasurable = blank('unmeasurable', field, metrics)
    return {
      ...unmeasurable,
      lines: [text],
      height: unmeasurable.lineHeight,
      missingGlyphs: coverage.missing,
    }
  }

  const { fit, font } = field
  const startSize = Math.min(font.size, font.max)
  const floor = Math.min(font.min, startSize)
  const canShrink = fit.strategy === 'shrink' || fit.strategy === 'shrink-then-wrap'
  const canWrap = fit.strategy === 'wrap' || fit.strategy === 'shrink-then-wrap'
  const maxLines = canWrap ? Math.max(1, fit.maxLines) : 1
  const profile = WRAP_PROFILES[field.wrapProfile]

  /** Lay the value out at one size, and say whether it fits. */
  const attempt = (size: number, lineHeightMultiplier: number) => {
    const lineHeight = lineHeightFor(metrics, size, lineHeightMultiplier)
    const wrapped = canWrap
      ? wrapText({
          text,
          metrics,
          fontSize: size,
          letterSpacing: font.letterSpacing,
          maxWidth: usableWidth,
          maxLines,
          ...profile,
        })
      : singleLine(text, metrics, size, font.letterSpacing, usableWidth)

    const height = lineHeight * Math.max(1, wrapped.lines.length)
    return {
      size,
      lineHeight,
      lines: wrapped.lines.length > 0 ? wrapped.lines : [text],
      widths: wrapped.widths,
      fits:
        !wrapped.truncated &&
        !wrapped.overfull &&
        wrapped.lines.length <= maxLines &&
        height <= boundHeight,
      height,
    }
  }

  const build = (
    status: FitStatus,
    laid: ReturnType<typeof attempt>,
    lineHeightMultiplier: number,
  ): FitResult => ({
    status,
    lines: laid.lines,
    widths: laid.widths,
    fontSize: round(laid.size),
    lineHeight: laid.lineHeight,
    height: laid.height,
    ascent: ascentOf(metrics, laid.size, lineHeightMultiplier),
    missingGlyphs: [],
    overshoot: Math.max(0, Math.max(...laid.widths, 0) - usableWidth),
    heightOvershoot: Math.max(0, laid.height - boundHeight),
  })

  // ── As drawn ──
  const asDrawn = attempt(startSize, font.lineHeight)
  if (asDrawn.fits && asDrawn.lines.length === 1) return build('fits', asDrawn, font.lineHeight)

  if (fit.strategy === 'none') return build('overflow', asDrawn, font.lineHeight)

  // Wrapping alone, at the designer's size, is preferred over any shrink: it
  // keeps the typography the designer chose.
  if (asDrawn.fits) return build('wrapped', asDrawn, font.lineHeight)

  // ── The largest size that fits ──
  if (canShrink) {
    const best = largestFitting(floor, startSize, (size) => attempt(size, font.lineHeight))
    if (best) return build('shrunk', best, font.lineHeight)

    // ── Tighter leading, which buys vertical room and nothing else ──
    if (fit.minLineHeight < font.lineHeight && boundHeight < Infinity) {
      const tightened = largestFitting(floor, startSize, (size) => attempt(size, fit.minLineHeight))
      if (tightened) return build('shrunk', tightened, fit.minLineHeight)
    }
  }

  // ── Truncate, or report ──
  const finalSize = canShrink ? floor : startSize
  const laid = attempt(finalSize, font.lineHeight)

  if (fit.overflow === 'ellipsis') {
    const clipped = [...laid.lines]
    clipped[clipped.length - 1] = truncate(
      clipped[clipped.length - 1],
      metrics,
      finalSize,
      font.letterSpacing,
      usableWidth,
    )
    const widths = clipped.map(
      (line) => measureRun(line, metrics, finalSize, font.letterSpacing).width,
    )
    return build('clipped', { ...laid, lines: clipped, widths }, font.lineHeight)
  }

  // The FULL text is reported, not the truncated version: an admin looking at a
  // blocked field needs to see what actually does not fit.
  return build('overflow', laid, font.lineHeight)
}

/** Statuses that must stop a release rather than reach a guest. */
export const BLOCKING_FIT_STATUSES: ReadonlySet<FitStatus> = new Set<FitStatus>([
  'overflow',
  'unmeasurable',
])

export function isBlockingFit(status: FitStatus): boolean {
  return BLOCKING_FIT_STATUSES.has(status)
}

/**
 * The largest size in [min, max] whose layout fits, or null if none does.
 *
 * Bisection assumes a smaller size never needs MORE lines than a larger one,
 * which holds for every break rule in card-wrap.ts. `probe` is called on
 * integer subunits so the answer is bit-identical wherever it runs.
 */
function largestFitting<T extends { fits: boolean }>(
  min: number,
  max: number,
  probe: (size: number) => T,
): T | null {
  let low = Math.round(min * FONT_SCALE)
  let high = Math.round(max * FONT_SCALE)
  let best: T | null = null

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const result = probe(mid / FONT_SCALE)
    if (result.fits) {
      best = result
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return best
}

/**
 * The one-line "wrap" used when the strategy forbids breaking.
 *
 * `overfull` is the whole point of it: a strategy that cannot add a line still
 * has to report that the line is too wide, or every non-wrapping field would
 * claim to fit at whatever size it was first probed at.
 */
function singleLine(
  text: string,
  metrics: FontMetrics,
  size: number,
  letterSpacing: number,
  maxWidth: number,
): { lines: string[]; widths: number[]; overfull: boolean; truncated: boolean } {
  const width = measureRun(text, metrics, size, letterSpacing).width
  return { lines: [text], widths: [width], overfull: width > maxWidth, truncated: false }
}

/**
 * How far below a block's top edge the first baseline sits.
 *
 * Taken from the face's own ascent rather than assumed, because a script face
 * draws well outside its em box and the difference is the whole reason a
 * two-line name can collide with what sits under it.
 */
function ascentOf(metrics: FontMetrics, fontSize: number, multiplier: number): number {
  return (metrics.ascender / metrics.unitsPerEm) * fontSize * multiplier
}

/** Drop characters until the line plus an ellipsis fits. */
function truncate(
  line: string,
  metrics: FontMetrics,
  size: number,
  letterSpacing: number,
  usable: number,
): string {
  const chars = [...line]
  for (let keep = chars.length; keep > 0; keep--) {
    const candidate = chars.slice(0, keep).join('').trimEnd() + ELLIPSIS
    if (measureRun(candidate, metrics, size, letterSpacing).width <= usable) return candidate
  }
  return ELLIPSIS
}

function blank(status: FitStatus, field: FieldLayout, metrics: FontMetrics | null): FitResult {
  const size = Math.min(field.font.size, field.font.max)
  const lineHeight = metrics
    ? lineHeightFor(metrics, size, field.font.lineHeight)
    : size * 1.2
  return {
    status,
    lines: [],
    widths: [],
    fontSize: size,
    lineHeight,
    height: 0,
    ascent: metrics ? ascentOf(metrics, size, field.font.lineHeight) : size * 0.8,
    missingGlyphs: [],
    overshoot: 0,
    heightOvershoot: 0,
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
