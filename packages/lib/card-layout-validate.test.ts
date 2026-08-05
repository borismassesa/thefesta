import assert from 'node:assert/strict'
import test from 'node:test'
import type { CardLayout, FieldLayout, OverlayElement } from './card-layout'
import { canvasRect, validateLayoutGeometry } from './card-layout-validate'

function field(overrides: Partial<FieldLayout> = {}): FieldLayout {
  return {
    id: 'fld_guest_name_1',
    role: 'guest_name',
    sourceLayerIds: ['guest_name'],
    target: 'guest_name',
    localBox: { x: 10, y: 10, w: 100, h: 20 },
    baseline: 26,
    sourceCtm: [1, 0, 0, 1, 0, 0],
    align: 'left',
    vAlign: 'top',
    font: {
      families: ['Nexa'],
      size: 20,
      min: 10,
      max: 20,
      weight: 400,
      italic: false,
      letterSpacing: 0,
      lineHeight: 1,
    },
    fit: { strategy: 'shrink', maxLines: 1, overflow: 'warn', heightMode: 'grow', minLineHeight: 1 },
    wrapProfile: 'guest-name',
    onMissing: 'preserve-source',
    onEmpty: 'preserve-source',
    visibleIf: null,
    group: null,
    rawAttrs: '',
    regenerable: true,
    regenerationBlocker: null,
    estimated: false,
    ...overrides,
  }
}

function layout(fields: Record<string, FieldLayout>, extra: Partial<CardLayout> = {}): CardLayout {
  return {
    version: 1,
    canvas: { x: 0, y: 0, width: 300, height: 400 },
    fields,
    elements: [],
    groups: [],
    safeZones: [],
    provenance: null,
    ...extra,
  }
}

const qr = (overrides: Partial<Extract<OverlayElement, { type: 'qr' }>> = {}): OverlayElement => ({
  id: 'qr1',
  type: 'qr',
  box: { x: 200, y: 300, w: 80, h: 80 },
  z: 10,
  placement: { kind: 'above-all' },
  source: 'checkin_token',
  quietZoneModules: 4,
  errorCorrection: 'Q',
  ...overrides,
})

const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code)
const blocks = (issues: { severity: string }[]) => issues.some((issue) => issue.severity === 'blocker')

test('a coherent layout raises nothing', () => {
  assert.deepEqual(validateLayoutGeometry(layout({ a: field() })), [])
})

// ── Blockers ──

test('a box reaching outside the artwork blocks', () => {
  const issues = validateLayoutGeometry(layout({ a: field({ localBox: { x: 250, y: 10, w: 100, h: 20 } }) }))
  assert.ok(codes(issues).includes('BOX_OUTSIDE_CANVAS'))
  assert.equal(blocks(issues), true)
})

test('a box with no area blocks, and is not also reported as out of bounds', () => {
  const issues = validateLayoutGeometry(layout({ a: field({ localBox: { x: 10, y: 10, w: 0, h: 20 } }) }))
  assert.deepEqual(codes(issues), ['BOX_DEGENERATE'])
})

test('a box sharing an edge with the canvas is not treated as overflowing it', () => {
  // Derived boxes routinely sit flush against something, and a warning nobody
  // can clear is a warning everybody learns to ignore.
  const issues = validateLayoutGeometry(layout({ a: field({ localBox: { x: 0, y: 0, w: 300, h: 400 } }) }))
  assert.ok(!codes(issues).includes('BOX_OUTSIDE_CANVAS'))
})

// ── QR ──

test('text intruding on a QR code’s clear space blocks, because it will not scan', () => {
  const issues = validateLayoutGeometry(
    layout({ a: field({ localBox: { x: 170, y: 300, w: 40, h: 20 } }) }, { elements: [qr()] }),
  )
  assert.ok(codes(issues).includes('QR_QUIET_ZONE'))
  assert.equal(blocks(issues), true)
})

test('a QR code too small to scan blocks', () => {
  const issues = validateLayoutGeometry(
    layout({}, { elements: [qr({ box: { x: 10, y: 10, w: 20, h: 20 } })] }),
  )
  assert.ok(codes(issues).includes('QR_TOO_SMALL'))
})

test('a non-square QR code blocks, because its modules distort', () => {
  const issues = validateLayoutGeometry(
    layout({}, { elements: [qr({ box: { x: 10, y: 10, w: 80, h: 60 } })] }),
  )
  assert.ok(codes(issues).includes('QR_TOO_SMALL'))
})

test('a QR code in a region marked unsuitable for it blocks', () => {
  const issues = validateLayoutGeometry(
    layout(
      {},
      {
        elements: [qr()],
        safeZones: [{ x: 150, y: 250, w: 150, h: 150, kind: 'qr-forbidden', note: 'foil stamp' }],
      },
    ),
  )
  const issue = issues.find((entry) => entry.code === 'SAFE_ZONE_INTERSECTION')
  assert.ok(issue)
  assert.equal(issue.severity, 'blocker')
})

// ── Warnings, which must not stop a sold card going out ──

test('overlapping boxes warn once for the pair, and do not block', () => {
  const issues = validateLayoutGeometry(
    layout({
      a: field({ id: 'a', localBox: { x: 10, y: 10, w: 100, h: 20 } }),
      b: field({ id: 'b', role: 'venue_1_place', localBox: { x: 50, y: 15, w: 100, h: 20 } }),
    }),
  )
  const overlaps = issues.filter((issue) => issue.code === 'BOXES_OVERLAP')
  assert.equal(overlaps.length, 1)
  assert.deepEqual(overlaps[0].details?.fieldIds, ['a', 'b'])
  assert.equal(blocks(issues), false)
})

test('two fields in the same group are expected to sit close and do not warn', () => {
  // They are re-stacked at render time, so their stored boxes overlapping says
  // nothing about what will be drawn.
  const issues = validateLayoutGeometry(
    layout({
      a: field({ id: 'a', localBox: { x: 10, y: 10, w: 100, h: 20 }, group: 'g1' }),
      b: field({ id: 'b', localBox: { x: 50, y: 15, w: 100, h: 20 }, group: 'g1' }),
    }),
  )
  assert.deepEqual(codes(issues), [])
})

test('a field in a text-forbidden region warns with the reason', () => {
  const issues = validateLayoutGeometry(
    layout(
      { a: field() },
      { safeZones: [{ x: 0, y: 0, w: 300, h: 60, kind: 'text-forbidden', note: 'floral border' }] },
    ),
  )
  const issue = issues.find((entry) => entry.code === 'SAFE_ZONE_INTERSECTION')
  assert.ok(issue)
  assert.match(issue.message, /floral border/)
  assert.equal(issue.severity, 'warning')
})

test('a print-bleed zone does not forbid text', () => {
  // Only the text-forbidding kinds constrain a field; a bleed marker is
  // information for the printer.
  const issues = validateLayoutGeometry(
    layout({ a: field() }, { safeZones: [{ x: 0, y: 0, w: 300, h: 60, kind: 'print-bleed' }] }),
  )
  assert.deepEqual(codes(issues), [])
})

test('a guessed box warns until somebody has checked it', () => {
  const issues = validateLayoutGeometry(layout({ a: field({ estimated: true }) }))
  assert.deepEqual(codes(issues), ['FONT_METRICS_MISSING'])
  assert.equal(blocks(issues), false)
})

// ── Transforms ──

test('a transformed box is checked where it actually lands, not where its numbers say', () => {
  const transformed = field({ sourceCtm: [1, 0, 0, 1, 260, 0] })
  assert.deepEqual(canvasRect(transformed), { x: 270, y: 10, w: 100, h: 20 })
  assert.ok(codes(validateLayoutGeometry(layout({ a: transformed }))).includes('BOX_OUTSIDE_CANVAS'))
})

test('a rotated box reports its bounding rectangle, which errs toward catching a clash', () => {
  // 90 degrees: a 100x20 box becomes 20x100.
  const rect = canvasRect(field({ sourceCtm: [0, 1, -1, 0, 100, 0] }))
  assert.equal(Math.round(rect.w), 20)
  assert.equal(Math.round(rect.h), 100)
})
