// Whether a layout is structurally safe, independent of any particular value.
//
// The split from card-layout-resolve.ts is deliberate and matters:
//
//   RESOLVE   answers "does THIS value fit?" — it needs values and metrics, and
//             it produces diagnostics about text.
//   VALIDATE  answers "is this layout coherent at all?" — boxes inside the
//             canvas, nothing overlapping, nothing in a reserved region, a QR
//             code with room to scan. None of that depends on a value.
//
// Keeping them apart is what lets the Studio validate geometry live while an
// admin drags a box, without needing a couple's answers, and lets the freeze
// gate run both against the real order.
//
// Severity is the whole design. A card that has been sold and is being released
// cannot be blocked for a cosmetic quibble, and it must be blocked for anything
// that would reach a guest wrong:
//
//   'blocker'  the card cannot be released.
//   'warning'  a human should look, and may well decide it is fine.

import { applyMatrix, type Rect, type ViewBox } from './card-geometry'
import type { CardLayout, FieldLayout, OverlayElement, SafeZone, SafeZoneKind } from './card-layout'
import type { LayoutDiagnostic } from './card-layout-resolve'

/**
 * How much clear space a QR code needs, as a fraction of its own width.
 *
 * The spec is four modules on every side. The module count is a property of the
 * encoded payload rather than of the layout, so the element states its own
 * `quietZoneModules` and a version-2-sized default (25 modules across, four of
 * them ≈ 0.16) is used when it does not. Erring generous costs a few units of
 * artwork and buys a scanner that works at the door in poor light.
 */
const DEFAULT_QR_MODULES_ACROSS = 25

/**
 * Below this, a QR code stops scanning reliably on a phone held at arm's length
 * in the light a wedding venue actually has. In canvas units on a card whose
 * long edge is a few hundred units, this is roughly a fingertip.
 */
const MIN_QR_SIZE_RATIO = 0.12

/** Zones that forbid text specifically, as opposed to forbidding everything. */
const TEXT_FORBIDDING: ReadonlySet<SafeZoneKind> = new Set(['forbidden', 'text-forbidden'])

/**
 * Touching a boundary is not intersecting it.
 *
 * Derived boxes routinely share an edge with a zone drawn around them, and
 * treating that as a clash would flood the Studio with warnings nobody can
 * clear. The overlap has to be real before it is reported.
 */
const TOUCH_TOLERANCE = 0.01

export function validateLayoutGeometry(layout: CardLayout): LayoutDiagnostic[] {
  const issues: LayoutDiagnostic[] = []
  const entries = Object.entries(layout.fields)

  for (const [id, field] of entries) {
    const at = { fieldId: id, role: field.role }

    if (field.localBox.w <= 0 || field.localBox.h <= 0) {
      issues.push({
        ...at,
        code: 'BOX_DEGENERATE',
        severity: 'blocker',
        message: `${field.role} has a box with no area, so nothing can be laid out in it.`,
      })
      continue
    }

    if (layout.canvas && !insideCanvas(field, layout.canvas)) {
      issues.push({
        ...at,
        code: 'BOX_OUTSIDE_CANVAS',
        severity: 'blocker',
        message: `${field.role} reaches outside the artwork, so its text would be cut off at the edge.`,
        details: { box: canvasRect(field), canvas: layout.canvas },
      })
    }

    for (const zone of layout.safeZones) {
      if (!TEXT_FORBIDDING.has(zone.kind)) continue
      if (!intersects(canvasRect(field), zone)) continue
      issues.push({
        ...at,
        code: 'SAFE_ZONE_INTERSECTION',
        severity: 'warning',
        message: `${field.role} sits in a reserved region${zone.note ? ` (${zone.note})` : ''}.`,
        details: { zone },
      })
    }

    if (field.estimated) {
      issues.push({
        ...at,
        code: 'FONT_METRICS_MISSING',
        severity: 'warning',
        message: `${field.role}'s box was estimated because its typeface has no metrics. Check it against the artwork.`,
      })
    }
  }

  // Overlaps are about a PAIR, so each is reported once rather than twice.
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [idA, a] = entries[i]
      const [idB, b] = entries[j]
      // Two fields in the same group are expected to sit close together and are
      // re-stacked at render time, so their stored boxes overlapping means
      // nothing about what will be drawn.
      if (a.group && a.group === b.group) continue
      if (!intersects(canvasRect(a), canvasRect(b))) continue
      issues.push({
        code: 'BOXES_OVERLAP',
        severity: 'warning',
        fieldId: idA,
        role: a.role,
        message: `${a.role} and ${b.role} overlap, so their text may collide.`,
        details: { fieldIds: [idA, idB] },
      })
    }
  }

  for (const issue of qrIssues(layout)) issues.push(issue)

  return issues
}

/**
 * QR checks beyond "is anything on top of it".
 *
 * A code that will not scan is a guest turned away at the door, and it is
 * invisible until that moment — so these block rather than warn. The remaining
 * guarantees (contrast, opaque background, a decode that returns the expected
 * token) cannot be established from geometry and belong to the raster contract
 * test, which decodes the rendered PNG.
 */
function qrIssues(layout: CardLayout): LayoutDiagnostic[] {
  const issues: LayoutDiagnostic[] = []
  const canvasSize = layout.canvas
    ? Math.min(layout.canvas.width, layout.canvas.height)
    : null

  for (const element of layout.elements) {
    if (element.type !== 'qr') continue

    const size = Math.min(element.box.w, element.box.h)
    if (canvasSize && size < canvasSize * MIN_QR_SIZE_RATIO) {
      issues.push({
        code: 'QR_TOO_SMALL',
        severity: 'blocker',
        message: `The QR code is ${round(size)} units across, which is too small to scan reliably. Make it at least ${round(canvasSize * MIN_QR_SIZE_RATIO)}.`,
        details: { elementId: element.id, size },
      })
    }

    // Non-uniform scaling turns square modules into rectangles, which many
    // decoders reject outright.
    if (Math.abs(element.box.w - element.box.h) > TOUCH_TOLERANCE) {
      issues.push({
        code: 'QR_TOO_SMALL',
        severity: 'blocker',
        message: `The QR code is ${round(element.box.w)}×${round(element.box.h)}. It must be square, or its modules distort and stop decoding.`,
        details: { elementId: element.id, box: element.box },
      })
    }

    const zone = quietZone(element)
    for (const [id, field] of Object.entries(layout.fields)) {
      if (!intersects(zone, canvasRect(field))) continue
      issues.push({
        code: 'QR_QUIET_ZONE',
        severity: 'blocker',
        fieldId: id,
        role: field.role,
        message: `${field.role} intrudes on the clear space around the QR code, which stops it scanning reliably.`,
        details: { elementId: element.id },
      })
    }

    for (const safe of layout.safeZones) {
      if (safe.kind !== 'qr-forbidden') continue
      if (!intersects(element.box, safe)) continue
      issues.push({
        code: 'SAFE_ZONE_INTERSECTION',
        severity: 'blocker',
        message: `The QR code sits in a region marked unsuitable for it${safe.note ? ` (${safe.note})` : ''}.`,
        details: { elementId: element.id, zone: safe },
      })
    }
  }

  return issues
}

/** The clear space a QR element needs around itself, in canvas units. */
export function quietZone(element: Extract<OverlayElement, { type: 'qr' }>): Rect {
  const modules = element.quietZoneModules > 0 ? element.quietZoneModules : 4
  const perModule = Math.max(element.box.w, element.box.h) / DEFAULT_QR_MODULES_ACROSS
  const quiet = modules * perModule
  return {
    x: element.box.x - quiet,
    y: element.box.y - quiet,
    w: element.box.w + quiet * 2,
    h: element.box.h + quiet * 2,
  }
}

/**
 * A field's box in canvas space, as an axis-aligned rectangle.
 *
 * A rotated box reports its bounding rectangle, which overstates the area
 * slightly. That is the safe direction for an overlap or safe-zone check: it
 * can raise a warning that turns out to be fine, and cannot miss a real clash.
 */
export function canvasRect(field: FieldLayout): Rect {
  const { x, y, w, h } = field.localBox
  const corners = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ].map((point) => applyMatrix(field.sourceCtm, point))

  const xs = corners.map((point) => point.x)
  const ys = corners.map((point) => point.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
}

function insideCanvas(field: FieldLayout, canvas: ViewBox): boolean {
  const rect = canvasRect(field)
  return (
    rect.x >= canvas.x - TOUCH_TOLERANCE &&
    rect.y >= canvas.y - TOUCH_TOLERANCE &&
    rect.x + rect.w <= canvas.x + canvas.width + TOUCH_TOLERANCE &&
    rect.y + rect.h <= canvas.y + canvas.height + TOUCH_TOLERANCE
  )
}

function intersects(a: Rect, b: Rect | SafeZone): boolean {
  return (
    a.x + TOUCH_TOLERANCE < b.x + b.w &&
    b.x + TOUCH_TOLERANCE < a.x + a.w &&
    a.y + TOUCH_TOLERANCE < b.y + b.h &&
    b.y + TOUCH_TOLERANCE < a.y + a.h
  )
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
